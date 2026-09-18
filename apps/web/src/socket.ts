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
socket.on('ERROR', ({ message }: { message: string }) => useGame.getState().setError(message));
type Narration = { audioKey: string; receivedAt: number };
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

export function preloadNarrations(audioKeys: string[]) {
  for (const audioKey of new Set(audioKeys)) {
    const audio = getNarrationAudio(audioKey);
    // The server deliberately emits NARRATOR_SPEECH immediately before the
    // updated ROOM_STATE for a night action. Calling load() here used to reset
    // that just-started role recording, making every action after the opening
    // night line silent. Only start a fetch for media that has not loaded yet.
    if (audio !== currentNarration && audio.readyState === HTMLMediaElement.HAVE_NOTHING) audio.load();
  }
}

function clearNarration() {
  if (currentNarration) { currentNarration.pause(); currentNarration.currentTime = 0; currentNarration = null; }
  narrationQueue = [];
}

socket.on('ROOM_STATE', (game: ClientGameState) => {
  // Start fetching every selected role's recording while cards are being
  // viewed, so the first real night instruction never waits for a download.
  if (game.phase === 'card_reveal' || game.phase === 'night') preloadNarrations(['night-start', ...game.selectedRoles]);
  // A night instruction is never useful once its phase is over. Clearing it
  // here prevents a blocked mobile playback from resurfacing during the day.
  if (game.phase !== 'night') clearNarration();
  useGame.getState().setGame(game);
});

function playNextNarration() {
  if (currentNarration || !narrationUnlocked || !useGame.getState().tts) return;
  const next = narrationQueue[0];
  if (!next) return;
  const audio = getNarrationAudio(next.audioKey);
  audio.currentTime = 0;
  currentNarration = audio;
  const discardCurrent = () => { if (currentNarration !== audio) return; currentNarration = null; narrationQueue.shift(); playNextNarration(); };
  audio.onended = discardCurrent;
  audio.onerror = discardCurrent;
  void audio.play().catch(() => {
    // Browsers (especially Safari and mobile WebViews) can reject a play()
    // started by a Socket event until the next real user gesture. Keep this
    // instruction queued for that gesture; ROOM_STATE clears it when the
    // game moves to a different phase, so it cannot surface in a later phase.
    if (currentNarration === audio) currentNarration = null;
  });
}

const unlockNarration = () => {
  narrationUnlocked = true;
  // This is called directly from pointerdown/keydown, making the real
  // narration play request user-initiated rather than relying on a muted
  // primer that some browsers do not treat as an audio unlock.
  playNextNarration();
};
window.addEventListener('pointerdown', unlockNarration, { passive: true });
window.addEventListener('keydown', unlockNarration);

export function setNarrationEnabled(enabled: boolean) {
  narrationUnlocked = narrationUnlocked || enabled;
  if (!enabled) {
    clearNarration();
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
  narrationQueue.push({ audioKey, receivedAt: Date.now() });
  // Try immediately for browsers which have already received a user gesture.
  // If their autoplay policy rejects it, the item stays queued until the next
  // pointer or key input instead of being silently discarded.
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
