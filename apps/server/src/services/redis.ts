import { default as Redis } from 'ioredis';
import type { Room } from '@werewolf/shared';

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
for (const [name, client] of [['redis', redis], ['redis-pub', pubClient], ['redis-sub', subClient]] as const) {
  client.on('error', (error) => console.error(`${name}_connection_error`, error));
}

const roomKey = (code: string) => `game:room:${code}`;
const FALLBACK_ROOM_TTL_SECONDS = 60 * 60 * 24;

/** Return the earliest retention deadline applicable to a room. */
export function roomRetentionDeadline(room: Room): number | null {
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
    .filter((deadline): deadline is number => typeof deadline === 'number');
  return deadlines.length ? Math.min(...deadlines) : null;
}

export function roomHasExpired(room: Room, now = Date.now()): boolean {
  const deadline = roomRetentionDeadline(room);
  return deadline !== null && deadline <= now;
}

export async function getRoom(code: string): Promise<Room | null> {
  const raw = await redis.get(roomKey(code)); return raw ? JSON.parse(raw) as Room : null;
}
export async function saveRoom(room: Room) {
  const deadline = roomRetentionDeadline(room);
  if (deadline !== null && deadline <= Date.now()) { await deleteRoom(room.roomCode); return; }
  const ttlSeconds = deadline === null
    ? FALLBACK_ROOM_TTL_SECONDS
    : Math.max(1, Math.ceil((deadline - Date.now()) / 1000));
  await redis.set(roomKey(room.roomCode), JSON.stringify(room), 'EX', ttlSeconds);
  // Vercel advances only the connected room via ROOM_SYNC, so it does not need
  // a global index. Avoid retaining a second, non-expiring copy of every code.
  if (process.env.RUN_STANDALONE_SERVER === 'true') await redis.sadd('game:rooms', room.roomCode);
  else await redis.srem('game:rooms', room.roomCode);
}
export async function deleteRoom(code: string) { await redis.del(roomKey(code)); await redis.srem('game:rooms', code); }
export async function withRoomLock<T>(code: string, fn: (room: Room) => Promise<T> | T): Promise<T> {
  const key = `lock:game:${code}`; const token = crypto.randomUUID(); const until = Date.now() + 3000;
  while (Date.now() < until) { if (await redis.set(key, token, 'PX', 5000, 'NX')) break; await new Promise((r) => setTimeout(r, 25)); }
  if ((await redis.get(key)) !== token) throw new Error('요청이 몰렸습니다. 다시 시도해주세요.');
  try {
    const room = await getRoom(code);
    if (!room) throw new Error('방을 찾을 수 없습니다.');
    if (roomHasExpired(room)) { await deleteRoom(code); throw new Error('방이 만료되었습니다.'); }
    return await fn(room);
  }
  finally { await redis.eval("if redis.call('get',KEYS[1])==ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end", 1, key, token); }
}
export async function once(code: string, requestId: string) { return (await redis.set(`processedRequest:${code}:${requestId}`, '1', 'EX', 3600, 'NX')) === 'OK'; }
