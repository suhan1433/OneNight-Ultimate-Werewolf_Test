import { io } from 'socket.io-client'; import type { Ack, PublicView } from '@rummikub/protocol';
export const socket = io(
  import.meta.env.DEV ? (import.meta.env.VITE_SOCKET_URL ?? 'http://localhost:3010') : undefined,
  { path: import.meta.env.DEV ? '/socket.io' : '/api/rummikub/socket', transports: ['websocket', 'polling'], autoConnect: true },
);
export const emit = <T,>(event: string, data: unknown) => new Promise<T>((resolve, reject) => {
  // Do not buffer a stale turn action for automatic delivery after reconnecting.
  if (!socket.connected) { reject(Error('연결이 끊겼어요. 다시 연결되면 시도해 주세요.')); return; }
  socket.timeout(8000).emit(event, data, (error: Error | null, reply?: Ack<T>) => {
    if (error) reject(Error('서버 응답이 늦어지고 있어요. 연결 상태를 확인해 주세요.'));
    else if (reply?.ok) resolve(reply.data as T);
    else reject(Error(reply?.error ?? '요청을 처리하지 못했어요. 다시 시도해 주세요.'));
  });
});
/** Explicitly reconnect after a player has left a room. */
export const ensureConnected = () => {
  if (socket.connected) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const done = () => { socket.off('connect_error', failed); resolve(); };
    const failed = (error: Error) => { socket.off('connect', done); reject(error); };
    socket.once('connect', done);
    socket.once('connect_error', failed);
    socket.connect();
  });
};
export type Session = { roomId: string; playerId: string; sessionToken: string; name: string };
const key = 'rummikub-neon-session'; export const session = (): Session | null => { try { return JSON.parse(localStorage.getItem(key) ?? 'null') as Session | null; } catch { return null; } }; export const saveSession = (value: Session) => localStorage.setItem(key, JSON.stringify(value)); export const clearSession = () => localStorage.removeItem(key);
export type StateListener = (view: PublicView) => void;
