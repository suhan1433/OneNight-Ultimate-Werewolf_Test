import { io } from 'socket.io-client';
import type { Ack, ClientGameState } from '@werewolf/shared';
import { useGame } from './store';
const isDev = import.meta.env.DEV;
// Production uses the deployment origin. This is the exact Vercel Function
// route, so the WebSocket upgrade is dispatched without a nested path.
export const socket = io(isDev ? (import.meta.env.VITE_SOCKET_URL ?? 'http://localhost:3001') : undefined, {
  autoConnect: true,
  path: isDev ? '/socket.io' : '/api/socket',
  // Vercel WebSocket Functions do not support Socket.IO's polling fallback.
  transports: isDev ? ['websocket', 'polling'] : ['websocket'],
  reconnection: true,
});
socket.on('ROOM_STATE', (game: ClientGameState) => useGame.getState().setGame(game));
socket.on('ERROR', ({ message }: { message: string }) => useGame.getState().setError(message));
socket.on('NARRATOR_SPEECH', ({ text }: { text: string }) => {
  if (!useGame.getState().tts || !('speechSynthesis' in window)) return;
  speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(text); utterance.lang = 'ko-KR'; utterance.rate = .96; utterance.pitch = .9; speechSynthesis.speak(utterance);
});
socket.on('connect', () => { const saved = session(); if (saved) socket.emit('ROOM_JOIN', saved, (ack: Ack) => { if (!ack.ok) localStorage.removeItem('werewolf-session'); }); });
// Function instances can be paused/recycled, so a persisted deadline is checked
// by active players instead of relying on a server-global setInterval.
window.setInterval(() => { if (socket.connected) socket.emit('ROOM_SYNC'); }, 1000);
export const requestId = () => crypto.randomUUID();
export function session(): { roomCode: string; playerId: string; sessionToken: string } | null { try { return JSON.parse(localStorage.getItem('werewolf-session') ?? 'null'); } catch { return null; } }
export function saveSession(value: unknown) { localStorage.setItem('werewolf-session', JSON.stringify(value)); }
export function emitAck<T>(event: string, payload: unknown): Promise<T> { return new Promise((resolve, reject) => socket.emit(event, payload, (ack: Ack<T>) => ack?.ok ? resolve(ack.data as T) : reject(new Error(ack?.error ?? '서버 응답이 없습니다.')))); }
