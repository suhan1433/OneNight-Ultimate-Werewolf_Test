import Redis from 'ioredis';
export const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', { maxRetriesPerRequest: null });
export const pubClient = redis.duplicate();
export const subClient = redis.duplicate();
const roomKey = (code) => `game:room:${code}`;
export async function getRoom(code) {
    const raw = await redis.get(roomKey(code));
    return raw ? JSON.parse(raw) : null;
}
export async function saveRoom(room) { await redis.set(roomKey(room.roomCode), JSON.stringify(room), 'EX', 60 * 60 * 24); await redis.sadd('game:rooms', room.roomCode); }
export async function deleteRoom(code) { await redis.del(roomKey(code)); await redis.srem('game:rooms', code); }
export async function withRoomLock(code, fn) {
    const key = `lock:game:${code}`;
    const token = crypto.randomUUID();
    const until = Date.now() + 3000;
    while (Date.now() < until) {
        if (await redis.set(key, token, 'PX', 5000, 'NX'))
            break;
        await new Promise((r) => setTimeout(r, 25));
    }
    if ((await redis.get(key)) !== token)
        throw new Error('요청이 몰렸습니다. 다시 시도해주세요.');
    try {
        const room = await getRoom(code);
        if (!room)
            throw new Error('방을 찾을 수 없습니다.');
        return await fn(room);
    }
    finally {
        await redis.eval("if redis.call('get',KEYS[1])==ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end", 1, key, token);
    }
}
export async function once(code, requestId) { return (await redis.set(`processedRequest:${code}:${requestId}`, '1', 'EX', 3600, 'NX')) === 'OK'; }
