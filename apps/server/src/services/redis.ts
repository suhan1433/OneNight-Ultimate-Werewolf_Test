import { default as Redis } from 'ioredis';
import type { Room } from '@werewolf/shared';

/**
 * Socket.IO's Redis adapter uses Redis Pub/Sub, which needs a native Redis TCP
 * connection.  Do not substitute UPSTASH_REDIS_REST_URL/KV_REST_API_URL here:
 * those are HTTPS REST endpoints and cannot be used by ioredis or Pub/Sub.
 */
const redisUrl = process.env.REDIS_URL ?? (process.env.VERCEL ? undefined : 'redis://localhost:6379');

if (!redisUrl) {
  throw new Error('REDIS_URL (a rediss:// TCP connection string) is required on Vercel. Redis REST credentials are not compatible with Socket.IO Pub/Sub.');
}

export const redis = new Redis(redisUrl, { maxRetriesPerRequest: null });
export const pubClient = redis.duplicate();
export const subClient = redis.duplicate();
const roomKey = (code: string) => `game:room:${code}`;

export async function getRoom(code: string): Promise<Room | null> {
  const raw = await redis.get(roomKey(code)); return raw ? JSON.parse(raw) as Room : null;
}
export async function saveRoom(room: Room) { await redis.set(roomKey(room.roomCode), JSON.stringify(room), 'EX', 60 * 60 * 24); await redis.sadd('game:rooms', room.roomCode); }
export async function deleteRoom(code: string) { await redis.del(roomKey(code)); await redis.srem('game:rooms', code); }
export async function withRoomLock<T>(code: string, fn: (room: Room) => Promise<T> | T): Promise<T> {
  const key = `lock:game:${code}`; const token = crypto.randomUUID(); const until = Date.now() + 3000;
  while (Date.now() < until) { if (await redis.set(key, token, 'PX', 5000, 'NX')) break; await new Promise((r) => setTimeout(r, 25)); }
  if ((await redis.get(key)) !== token) throw new Error('요청이 몰렸습니다. 다시 시도해주세요.');
  try { const room = await getRoom(code); if (!room) throw new Error('방을 찾을 수 없습니다.'); return await fn(room); }
  finally { await redis.eval("if redis.call('get',KEYS[1])==ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end", 1, key, token); }
}
export async function once(code: string, requestId: string) { return (await redis.set(`processedRequest:${code}:${requestId}`, '1', 'EX', 3600, 'NX')) === 'OK'; }
