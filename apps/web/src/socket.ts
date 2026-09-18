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
type Narration = { audioKey: string; actionId?: string };
let currentNarration: HTMLAudioElement | null = null;
let narrationQueue: Narration[] = [];
let narrationUnlocked = false;

// Keep the audio elements alive so that the next instruction is normally
// already in the browser cache.  More importantly, never replace a playing
// instruction with the next Socket event: the old behaviour was why some
// announcements appeared to have no sound.
const narrationAudio = new Map<string, HTMLAudioElement>();
const seenNarrations = new Set<string>();
const getNarrationAudio = (audioKey: string) => {
  let audio = narrationAudio.get(audioKey);
  if (!audio) {
    // Role IDs use underscores, while the static recording files use kebab
    // case (for example shield_bearer -> shield-bearer.mp3).
    audio = new Audio(`/${audioKey.replaceAll('_', '-')}.mp3`);
    audio.preload = 'auto';
    audio.volume = .9;
    narrationAudio.set(audioKey, audio);
  }
  return audio;
};

function playNextNarration() {
  if (currentNarration || !narrationUnlocked || !useGame.getState().tts) return;
  const next = narrationQueue[0];
  if (!next) return;
  const audio = getNarrationAudio(next.audioKey);
  audio.currentTime = 0;
  currentNarration = audio;
  audio.onended = () => { currentNarration = null; narrationQueue.shift(); playNextNarration(); };
  audio.onerror = () => { currentNarration = null; narrationQueue.shift(); playNextNarration(); };
  void audio.play().catch(() => {
    // Mobile browsers can require one real tap after reconnecting. Keep this
    // item queued and retry it on that tap instead of silently losing it.
    currentNarration = null;
  });
}

const unlockNarration = () => { narrationUnlocked = true; playNextNarration(); };
window.addEventListener('pointerdown', unlockNarration, { passive: true });
window.addEventListener('keydown', unlockNarration);

export function setNarrationEnabled(enabled: boolean) {
  narrationUnlocked = narrationUnlocked || enabled;
  if (!enabled) {
    if (currentNarration) { currentNarration.pause(); currentNarration.currentTime = 0; currentNarration = null; }
    narrationQueue = [];
    seenNarrations.clear();
    return;
  }
  playNextNarration();
}

socket.on('NARRATOR_SPEECH', ({ audioKey, actionId, timestamp }: { audioKey?: string; actionId?: string; timestamp?: number }) => {
  if (!useGame.getState().tts || !audioKey) return;
  const key = timestamp ? `${actionId ?? audioKey}-${timestamp}` : `${audioKey}-${Date.now()}`;
  if (seenNarrations.has(key)) return;
  seenNarrations.add(key);
  narrationQueue.push({ audioKey, actionId });
  // Most browsers allow playback after the first interaction, but attempting
  // it here also supports browsers that grant Socket-triggered playback.
  narrationUnlocked = true;
  playNextNarration();
});
socket.on('connect', () => { const saved = session(); if (saved) socket.emit('ROOM_JOIN', saved, (ack: Ack) => { if (!ack.ok) localStorage.removeItem('werewolf-session'); }); });
// Function instances can be paused/recycled, so a persisted deadline is checked
// by active players instead of relying on a server-global setInterval.
export const syncRoom = () => { if (socket.connected) socket.emit('ROOM_SYNC'); };
window.setInterval(syncRoom, 250);
export const requestId = () => crypto.randomUUID();
export function session(): { roomCode: string; playerId: string; sessionToken: string } | null { try { return JSON.parse(localStorage.getItem('werewolf-session') ?? 'null'); } catch { return null; } }
export function saveSession(value: unknown) { localStorage.setItem('werewolf-session', JSON.stringify(value)); }
export function emitAck<T>(event: string, payload: unknown): Promise<T> { return new Promise((resolve, reject) => socket.emit(event, payload, (ack: Ack<T>) => ack?.ok ? resolve(ack.data as T) : reject(new Error(ack?.error ?? '서버 응답이 없습니다.')))); }
