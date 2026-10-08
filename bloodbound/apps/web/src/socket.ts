import { io } from 'socket.io-client';
import type { Ack, ClientGameState } from '@bloodbound/shared';
import { useGame } from './store';

const SESSION_KEY = 'bloodbound-session';

export const socket = io(
  import.meta.env.DEV ? (import.meta.env.VITE_SOCKET_URL ?? 'http://localhost:3003') : undefined,
  {
    path: import.meta.env.DEV ? '/socket.io' : '/api/bloodbound/socket',
    transports: ['websocket', 'polling'],
  },
);

export const session = () => {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null');
  } catch {
    return null;
  }
};

export const saveSession = (value: unknown) => {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(value));
  } catch {
    /* 사생활 보호 모드 등에서는 복구 기능만 포기한다 */
  }
};

export const clearSession = () => {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* noop */
  }
};

export const emit = (name: string, data: unknown) =>
  new Promise<any>((resolve, reject) =>
    socket.emit(name, data, (reply: Ack) => (reply.ok ? resolve(reply.data) : reject(Error(reply.error)))),
  );

socket.on('ROOM_STATE', (game: ClientGameState) => useGame.getState().setGame(game));
socket.on('ERROR', ({ message }: { message: string }) => useGame.getState().setError(message));

socket.on('connect', () => {
  const store = useGame.getState();
  store.setLink('online');
  const saved = session();
  if (!saved) return store.setRestoring(false);
  emit('ROOM_JOIN', saved).catch(() => {
    clearSession();
    useGame.getState().setRestoring(false);
  });
});
socket.on('disconnect', () => useGame.getState().setLink('offline'));
socket.on('connect_error', () => useGame.getState().setLink('offline'));
