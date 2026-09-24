import type { ChatMessage, Room } from '@werewolf/shared';

/** Process-local, zero-cost game store. Data is lost on restart and is not shared between Vercel instances. */
const rooms = new Map<string, Room>();
const chats = new Map<string, ChatMessage[]>();
const lobbyChats = new Map<string, ChatMessage[]>();
const ready = new Map<string, Map<string, boolean>>();
const votes = new Map<string, Map<string, string>>();
const deadlines = new Map<string, number>();
const processedByRoom = new Map<string, Map<string, number>>();
const limitsByRoom = new Map<string, Map<string, { count: number; expiresAt: number }>>();
const roomLocks = new Map<string, Promise<void>>();
const MAX_CHAT_MESSAGES = 100;
export const MAX_ROOMS = (() => {
  const value = Number(process.env.MAX_ROOMS ?? 300);
  return Number.isInteger(value) && value > 0 ? value : 300;
})();
let deadlineIterator: Iterator<string> | undefined;

export function roomRetentionDeadline(room: Room): number | null {
  const lobby = room.phase === 'lobby' ? (room.lobbyExpiresAt ?? room.createdAt + 60 * 60 * 1000) : null;
  const result = room.phase === 'result' ? (room.resultExpiresAt ?? room.updatedAt + 30 * 60 * 1000) : null;
  const deadlines = [lobby, room.allOfflineExpiresAt, result].filter((value): value is number => typeof value === 'number');
  return deadlines.length ? Math.min(...deadlines) : null;
}
export function roomHasExpired(room: Room, now = Date.now()) { const deadline = roomRetentionDeadline(room); return deadline !== null && deadline <= now; }
export function canCreateRoom() { return rooms.size < MAX_ROOMS; }

/**
 * Incrementally clear expired rooms without relying on a process-wide timer.
 * Each caller inspects at most `max` entries, so a busy Socket.IO server keeps
 * memory bounded without putting an O(number of rooms) scan on any request.
 */
export async function sweepExpiredRooms(max = 20): Promise<number> {
  const now = Date.now(); let removed = 0;
  const iterator = deadlineIterator ?? deadlines.keys(); deadlineIterator = iterator;
  for (let checked = 0; checked < max; checked += 1) {
    const next = iterator.next();
    if (next.done) { deadlineIterator = undefined; break; }
    const deadline = deadlines.get(next.value);
    if (deadline !== undefined && deadline <= now) { await deleteRoom(next.value); removed += 1; }
  }
  return removed;
}
export async function getRoom(code: string): Promise<Room | null> {
  const room = rooms.get(code) ?? null;
  if (room && roomHasExpired(room)) { await deleteRoom(code); return null; }
  return room;
}
export async function saveRoom(room: Room, requestId?: string) {
  if (roomHasExpired(room)) { await deleteRoom(room.roomCode); return; }
  rooms.set(room.roomCode, room);
  const deadline = roomRetentionDeadline(room);
  if (deadline === null) deadlines.delete(room.roomCode); else deadlines.set(room.roomCode, deadline);
  if (requestId) setProcessed(room.roomCode, requestId);
}
export async function deleteRoom(code: string) {
  rooms.delete(code); deadlines.delete(code); chats.delete(code); lobbyChats.delete(code); ready.delete(code); votes.delete(code);
  processedByRoom.delete(code); limitsByRoom.delete(code);
}
export function getRoomCodes() { return [...rooms.keys()]; }
function history(store: Map<string, ChatMessage[]>, code: string) { return [...(store.get(code) ?? [])]; }
export async function getChatHistory(code: string) { return history(chats, code); }
export async function getLobbyChatHistory(code: string) { return history(lobbyChats, code); }
function append(store: Map<string, ChatMessage[]>, code: string, message: ChatMessage) {
  const messages = store.get(code) ?? [];
  if (messages.some((item) => item.id === message.id)) return false;
  messages.push(message); if (messages.length > MAX_CHAT_MESSAGES) messages.splice(0, messages.length - MAX_CHAT_MESSAGES);
  store.set(code, messages); return true;
}
export async function appendChat(code: string, message: ChatMessage) { return append(chats, code, message); }
export async function appendLobbyChat(code: string, message: ChatMessage) { return append(lobbyChats, code, message); }
export async function clearLobbyChat(code: string) { lobbyChats.delete(code); }

export async function withRoomLock<T>(code: string, fn: (room: Room, alreadyProcessed: boolean) => Promise<T> | T, requestId?: string): Promise<T> {
  const previous = roomLocks.get(code) ?? Promise.resolve();
  let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; });
  const queued = previous.then(() => gate); roomLocks.set(code, queued); await previous;
  try {
    const room = await getRoom(code); if (!room) throw new Error('방을 찾을 수 없습니다.');
    const expiresAt = requestId ? getProcessed(code, requestId) : 0;
    return await fn(room, expiresAt > Date.now());
  } finally {
    release();
    void queued.then(() => { if (roomLocks.get(code) === queued) roomLocks.delete(code); });
  }
}
export async function once(code: string, requestId: string) {
  if (getProcessed(code, requestId) > Date.now()) return false;
  setProcessed(code, requestId); return true;
}
function getProcessed(code: string, requestId: string) {
  const requests = processedByRoom.get(code); const expiresAt = requests?.get(requestId) ?? 0;
  if (expiresAt && expiresAt <= Date.now()) requests?.delete(requestId);
  return expiresAt;
}
function setProcessed(code: string, requestId: string) {
  const requests = processedByRoom.get(code) ?? new Map<string, number>();
  requests.set(requestId, Date.now() + 3_600_000); processedByRoom.set(code, requests);
}
export async function consumeRateLimit(roomCode: string, key: string, limit: number, windowSeconds: number) {
  const now = Date.now(); const roomLimits = limitsByRoom.get(roomCode) ?? new Map<string, { count: number; expiresAt: number }>(); const old = roomLimits.get(key);
  const next = !old || old.expiresAt <= now ? { count: 1, expiresAt: now + windowSeconds * 1000 } : { ...old, count: old.count + 1 };
  roomLimits.set(key, next); limitsByRoom.set(roomCode, roomLimits); return next.count <= limit;
}
export async function recordVote(code: string, playerId: string, targetPlayerId: string) {
  const roomVotes = votes.get(code) ?? new Map<string, string>(); const added = !roomVotes.has(playerId);
  if (added) roomVotes.set(playerId, targetPlayerId); votes.set(code, roomVotes); return { added, count: roomVotes.size };
}
export async function getVotes(code: string): Promise<Record<string, string>> { return Object.fromEntries(votes.get(code) ?? []); }
export async function toggleReady(code: string, playerId: string, requestId: string) {
  if (getProcessed(code, requestId) > Date.now()) return ready.get(code)?.get(playerId) ?? false;
  setProcessed(code, requestId); const players = ready.get(code) ?? new Map<string, boolean>(); const next = !players.get(playerId);
  players.set(playerId, next); ready.set(code, players); return next;
}
export async function getReadiness(code: string): Promise<Record<string, string>> {
  return Object.fromEntries([...((ready.get(code) ?? new Map<string, boolean>()).entries())].map(([id, value]) => [id, value ? '1' : '0']));
}
export async function clearReadiness(code: string) { ready.delete(code); }
