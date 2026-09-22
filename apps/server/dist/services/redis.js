import { default as Redis } from 'ioredis';
/**
 * Socket.IO's Redis adapter uses Redis Pub/Sub, which needs a native Redis TCP
 * connection.  Do not substitute UPSTASH_REDIS_REST_URL/KV_REST_API_URL here:
 * those are HTTPS REST endpoints and cannot be used by ioredis or Pub/Sub.
 */
const redisUrl = process.env.REDIS_URL
    ?? (process.env.RUN_STANDALONE_SERVER === 'true' ? 'redis://localhost:6379' : undefined);
if (!redisUrl) {
    throw new Error('REDIS_URL (a rediss:// TCP connection string) is required on Vercel. Redis REST credentials are not compatible with Socket.IO Pub/Sub.');
}
export const redis = new Redis(redisUrl, { maxRetriesPerRequest: null });
export const pubClient = redis.duplicate();
export const subClient = redis.duplicate();
// ioredis emits `error` on connection/authentication failures. An EventEmitter
// with no error listener can terminate a Vercel Function during cold start,
// turning a useful Redis error into FUNCTION_INVOCATION_FAILED (500).
for (const [name, client] of [['redis', redis], ['redis-pub', pubClient], ['redis-sub', subClient]]) {
    client.on('error', (error) => console.error(`${name}_connection_error`, error));
}
const roomKey = (code) => `game:room:${code}`;
const chatKey = (code) => `game:chat:${code}`;
const FALLBACK_ROOM_TTL_SECONDS = 60 * 60 * 24;
const MAX_CHAT_MESSAGES = 100;
const LOCK_TTL_MS = 5_000;
// Acquiring the mutex, loading the room, and checking an action's completed
// marker must see one Redis snapshot. This removes a GET from every lock hold
// and an EXISTS from every idempotent game action.
const LOCK_AND_LOAD_SCRIPT = `
  if redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[2], 'NX') then
    local room = redis.call('GET', KEYS[2])
    local processed = KEYS[3] and redis.call('EXISTS', KEYS[3]) or 0
    return { 1, room or '', processed }
  end
  return { 0, '', 0 }
`;
const CHAT_APPEND_SCRIPT = `
  if redis.call('SET', KEYS[1], '1', 'EX', ARGV[1], 'NX') then
    redis.call('LPUSH', KEYS[2], ARGV[2])
    redis.call('LTRIM', KEYS[2], 0, ARGV[3])
    redis.call('EXPIRE', KEYS[2], ARGV[4])
    return 1
  end
  return 0
`;
const RATE_LIMIT_SCRIPT = `
  local count = redis.call('INCR', KEYS[1])
  if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
  return count
`;
/** Return the earliest retention deadline applicable to a room. */
export function roomRetentionDeadline(room) {
    // Fall back to timestamps already present in legacy persisted rooms. New rooms
    // write explicit deadlines, but this keeps a deployment from exempting old
    // lobby/result rooms indefinitely.
    const lobbyDeadline = room.phase === 'lobby'
        ? (room.lobbyExpiresAt ?? room.createdAt + 60 * 60 * 1000)
        : null;
    const resultDeadline = room.phase === 'result'
        ? (room.resultExpiresAt ?? room.updatedAt + 30 * 60 * 1000)
        : null;
    const deadlines = [lobbyDeadline, room.allOfflineExpiresAt, resultDeadline]
        .filter((deadline) => typeof deadline === 'number');
    return deadlines.length ? Math.min(...deadlines) : null;
}
export function roomHasExpired(room, now = Date.now()) {
    const deadline = roomRetentionDeadline(room);
    return deadline !== null && deadline <= now;
}
export async function getRoom(code) {
    const raw = await redis.get(roomKey(code));
    return raw ? JSON.parse(raw) : null;
}
export async function saveRoom(room, completedRequestId) {
    const startedAt = performance.now();
    const deadline = roomRetentionDeadline(room);
    if (deadline !== null && deadline <= Date.now()) {
        await deleteRoom(room.roomCode);
        return;
    }
    const ttlSeconds = deadline === null
        ? FALLBACK_ROOM_TTL_SECONDS
        : Math.max(1, Math.ceil((deadline - Date.now()) / 1000));
    // Chat is a separate capped List. Keeping it out of this serialized value
    // prevents every game action from rewriting the whole conversation.
    const storedRoom = { ...room, chat: [] };
    const pipeline = redis.pipeline().set(roomKey(room.roomCode), JSON.stringify(storedRoom), 'EX', ttlSeconds);
    // Vercel advances only the connected room via ROOM_SYNC, so it does not need
    // a global index. Both commands share one network round trip.
    if (process.env.RUN_STANDALONE_SERVER === 'true')
        pipeline.sadd('game:rooms', room.roomCode);
    else
        pipeline.srem('game:rooms', room.roomCode);
    // A new game must not inherit the previous game's day-chat history.
    if (room.phase === 'lobby')
        pipeline.del(chatKey(room.roomCode));
    if (completedRequestId)
        pipeline.set(`processedRequest:${room.roomCode}:${completedRequestId}`, '1', 'EX', 3600, 'NX');
    await pipeline.exec();
    if (process.env.PERF_LOGS === 'true')
        console.info('redis_room_save', { code: room.roomCode, commands: 2 + Number(room.phase === 'lobby') + Number(!!completedRequestId), ms: Math.round((performance.now() - startedAt) * 10) / 10 });
}
export async function deleteRoom(code) { await redis.pipeline().del(roomKey(code)).del(chatKey(code)).srem('game:rooms', code).exec(); }
export async function getChatHistory(code) {
    const values = await redis.lrange(chatKey(code), 0, MAX_CHAT_MESSAGES - 1);
    return values.reverse().flatMap((value) => { try {
        return [JSON.parse(value)];
    }
    catch {
        return [];
    } });
}
export async function appendChat(code, message) {
    // Idempotency and LPUSH/LTRIM are atomic, so an ACK retry cannot duplicate a
    // message while this remains one Redis round trip.
    return Number(await redis.eval(CHAT_APPEND_SCRIPT, 2, `chatMessage:${code}:${message.id}`, chatKey(code), '3600', JSON.stringify(message), String(MAX_CHAT_MESSAGES - 1), String(FALLBACK_ROOM_TTL_SECONDS))) === 1;
}
export async function withRoomLock(code, fn, requestId) {
    const startedAt = performance.now();
    const key = `lock:game:${code}`;
    const token = crypto.randomUUID();
    const until = Date.now() + 3000;
    let delay = 5;
    let attempts = 0;
    let raw = '';
    let alreadyProcessed = false;
    let acquired = false;
    while (Date.now() < until) {
        attempts += 1;
        const keys = requestId ? [key, roomKey(code), `processedRequest:${code}:${requestId}`] : [key, roomKey(code)];
        const result = await redis.eval(LOCK_AND_LOAD_SCRIPT, keys.length, ...keys, token, String(LOCK_TTL_MS));
        if (Number(result[0]) === 1) {
            acquired = true;
            raw = result[1] ?? '';
            alreadyProcessed = Number(result[2]) === 1;
            break;
        }
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay = Math.min(delay * 2, 80);
    }
    if (!acquired)
        throw new Error('요청이 몰렸습니다. 다시 시도해주세요.');
    if (process.env.PERF_LOGS === 'true')
        console.info('redis_room_lock', { code, attempts, requestId: !!requestId, ms: Math.round((performance.now() - startedAt) * 10) / 10 });
    try {
        const room = raw ? JSON.parse(raw) : null;
        if (!room)
            throw new Error('방을 찾을 수 없습니다.');
        if (roomHasExpired(room)) {
            await deleteRoom(code);
            throw new Error('방이 만료되었습니다.');
        }
        return await fn(room, alreadyProcessed);
    }
    finally {
        await redis.eval("if redis.call('get',KEYS[1])==ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end", 1, key, token);
    }
}
export async function once(code, requestId) { return (await redis.set(`processedRequest:${code}:${requestId}`, '1', 'EX', 3600, 'NX')) === 'OK'; }
export async function consumeRateLimit(key, limit, windowSeconds) {
    return Number(await redis.eval(RATE_LIMIT_SCRIPT, 1, key, String(windowSeconds))) <= limit;
}
