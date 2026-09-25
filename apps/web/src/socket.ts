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
type Narration = { audioKey: string; actionId: string; stateVersion: number; receivedAt: number };
let currentNarration: HTMLAudioElement | null = null;
let currentNarrationInfo: Narration | null = null;
let narrationQueue: Narration[] = [];
let narrationUnlocked = false;
let syncInFlight: Promise<boolean> | null = null;

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
  if (currentNarration) {
    const audio = currentNarration;
    currentNarration = null;
    currentNarrationInfo = null;
    audio.onpause = null;
    audio.pause();
    audio.currentTime = 0;
  }
  narrationQueue = [];
}

function expectedNarrationId(game: ClientGameState): string | null {
  if (game.phase === 'night') return game.currentNightAction?.status === 'pending' ? 'night-start' : game.currentNightAction?.id ?? null;
  return game.phase === 'day' ? 'day-start' : null;
}

function isCurrentNarration(narration: Narration, game: ClientGameState | null) {
  return !!game && narration.stateVersion === game.stateVersion && narration.actionId === expectedNarrationId(game);
}

function reconcileNarration(game: ClientGameState) {
  narrationQueue = narrationQueue.filter((narration) => narration.stateVersion > game.stateVersion || isCurrentNarration(narration, game));
  if (currentNarration && !isCurrentNarration(currentNarrationInfo!, game)) {
    const audio = currentNarration;
    currentNarration = null;
    currentNarrationInfo = null;
    audio.onpause = null;
    audio.pause();
    audio.currentTime = 0;
  }
  playNextNarration();
}

socket.on('ROOM_STATE', (game: ClientGameState) => {
  // Start fetching every selected role's recording while cards are being
  // viewed, so the first real night instruction never waits for a download.
  if (game.phase === 'card_reveal' || game.phase === 'night') preloadNarrations(['night-start', ...game.selectedRoles]);
  useGame.getState().setGame(game);
  reconcileNarration(useGame.getState().game ?? game);
});
socket.on('CHAT_MESSAGE', (message) => useGame.getState().addChat(message, 'day'));
socket.on('CHAT_HISTORY', (messages) => useGame.getState().setChatHistory(messages));
socket.on('LOBBY_CHAT_MESSAGE', (message) => useGame.getState().addChat(message, 'lobby'));
socket.on('LOBBY_CHAT_HISTORY', (messages) => useGame.getState().setLobbyChatHistory(messages));
socket.on('VOTE_PROGRESS', ({ playerId, votesCompleted }: { playerId: string; votesCompleted: number }) => {
  const game = useGame.getState().game; if (!game || game.phase !== 'voting') return;
  useGame.setState({ game: { ...game, votesCompleted, players: game.players.map((player) => player.id === playerId ? { ...player, hasVoted: true } : player) } });
});
socket.on('READY_PROGRESS', ({ playerId, isReady }: { playerId: string; isReady: boolean }) => {
  const game = useGame.getState().game; if (!game || game.phase !== 'lobby') return;
  useGame.setState({ game: { ...game, players: game.players.map((player) => player.id === playerId ? { ...player, isReady } : player) } });
});

function playNextNarration() {
  if (currentNarration || !narrationUnlocked || !useGame.getState().tts) return;
  const next = narrationQueue[0];
  if (!next) return;
  const game = useGame.getState().game;
  if (!isCurrentNarration(next, game)) {
    if (game && next.stateVersion <= game.stateVersion) narrationQueue.shift();
    return;
  }
  const audio = getNarrationAudio(next.audioKey);
  audio.currentTime = 0;
  currentNarration = audio;
  currentNarrationInfo = next;
  const discardCurrent = () => {
    if (currentNarration !== audio) return;
    currentNarration = null;
    currentNarrationInfo = null;
    narrationQueue = narrationQueue.filter((narration) => narration !== next);
    playNextNarration();
  };
  audio.onended = discardCurrent;
  audio.onerror = discardCurrent;
  // A media interruption can pause an HTMLAudioElement without ending it
  // (notably on mobile browsers while the UI receives another Socket event).
  // Resume the same element, and therefore the same playback position,
  // instead of waiting for another screen tap or moving on to another line.
  const resumeCurrent = () => {
    if (currentNarration !== audio || audio.ended || !audio.paused || !useGame.getState().tts) return;
    void audio.play().catch(() => {
      // If a browser still requires a gesture, keep currentNarration intact.
      // unlockNarration will retry this exact element at its current position.
    });
  };
  audio.onpause = () => { if (!audio.ended) window.setTimeout(resumeCurrent, 0); };
  audio.oncanplay = resumeCurrent;
  void audio.play().catch(() => {
    // Browsers (especially Safari and mobile WebViews) can reject a play()
    // started by a Socket event until the next real user gesture. Keep this
    // instruction queued for that gesture; ROOM_STATE clears it when the
    // game moves to a different phase, so it cannot surface in a later phase.
    if (currentNarration === audio) { currentNarration = null; currentNarrationInfo = null; }
  });
}

const unlockNarration = () => {
  narrationUnlocked = true;
  // Resume an interrupted announcement at its existing position. Do not call
  // playNextNarration in this case: that function intentionally starts a new
  // queued line from 0 seconds.
  if (currentNarration?.paused) {
    void currentNarration.play().catch(() => {});
    return;
  }
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

socket.on('NARRATOR_SPEECH', ({ audioKey, actionId, stateVersion, timestamp }: { audioKey?: string; actionId?: string; stateVersion?: number; timestamp?: number }) => {
  if (!useGame.getState().tts || !audioKey || !actionId || stateVersion === undefined) return;
  const key = timestamp ? `${actionId ?? audioKey}-${timestamp}` : `${audioKey}-${Date.now()}`;
  if (seenNarrations.has(key)) return;
  seenNarrations.add(key);
  const game = useGame.getState().game;
  if (game && stateVersion < game.stateVersion) return;
  narrationQueue.push({ audioKey, actionId, stateVersion, receivedAt: Date.now() });
  // Try immediately for browsers which have already received a user gesture.
  // If their autoplay policy rejects it, the item stays queued until the next
  // pointer or key input instead of being silently discarded.
  narrationUnlocked = true;
  playNextNarration();
});
socket.on('connect', () => { useGame.getState().setConnectionState('connected'); const saved = session(); if (saved) socket.emit('ROOM_JOIN', saved, (ack: Ack) => { if (!ack.ok) localStorage.removeItem('werewolf-session'); else void syncRoom(); }); });
socket.on('disconnect', () => useGame.getState().setConnectionState('reconnecting'));
socket.io.on('reconnect_attempt', () => useGame.getState().setConnectionState('reconnecting'));
// Function instances can be paused/recycled, so a persisted deadline is checked
// by active players instead of relying on a server-global setInterval.
export const syncRoom = (): Promise<boolean> => {
  if (!socket.connected) { useGame.getState().setConnectionState('reconnecting'); return Promise.resolve(false); }
  if (syncInFlight) return syncInFlight;
  syncInFlight = new Promise<boolean>((resolve) => socket.timeout(1_200).emit('ROOM_SYNC', (error: Error | null, ack: Ack<ClientGameState>) => {
    if (error || !ack?.ok || !ack.data) { resolve(false); return; }
    useGame.getState().setGame(ack.data);
    resolve(true);
  })).finally(() => { syncInFlight = null; });
  return syncInFlight;
};

export function recoverExpiredAction(actionId: string, showTransition = true) {
  const delays = [0, 200, 500, 1_000];
  // The opening narration uses the first action's ID while it is still
  // pending. That deadline starts the role, not a role-to-role transition.
  if (showTransition) useGame.getState().setTransitioningActionId(actionId);
  const retry = (attempt: number) => {
    window.setTimeout(() => {
      void syncRoom().finally(() => {
        const game = useGame.getState().game;
        const stillExpired = game?.phase === 'night' && game.currentNightAction?.id === actionId && (game.currentNightAction.expiresAt ?? 0) <= Date.now();
        if (stillExpired && attempt + 1 < delays.length) retry(attempt + 1);
      });
    }, delays[attempt]!);
  };
  retry(0);
}
// State changes arrive through Socket.IO. Countdown expiry and reconnects call
// sync immediately; this is only a low-frequency missed-event recovery path.
window.setInterval(() => { if (useGame.getState().game) void syncRoom(); }, 30_000);
window.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncRoom(); });
export const requestId = () => crypto.randomUUID();
export function session(): { roomCode: string; playerId: string; sessionToken: string } | null { try { return JSON.parse(localStorage.getItem('werewolf-session') ?? 'null'); } catch { return null; } }
export function saveSession(value: unknown) { localStorage.setItem('werewolf-session', JSON.stringify(value)); }
export async function emitAck<T>(event: string, payload: unknown): Promise<T> {
  if (!socket.connected) throw new Error('서버 연결을 복구하는 중입니다. 잠시 후 다시 시도해주세요.');
  const send = () => new Promise<T>((resolve, reject) => socket.timeout(1_500).emit(event, payload, (error: Error | null, ack: Ack<T>) => {
    if (error) reject(new Error('서버 응답이 지연되고 있습니다.'));
    else if (ack?.ok) resolve(ack.data as T);
    else reject(new Error(ack?.error ?? '서버 응답이 없습니다.'));
  }));
  try { return await send(); } catch (error) {
    // Same requestId is retained in payload, so this is safe for state-changing commands.
    if (!socket.connected || !(error instanceof Error) || error.message !== '서버 응답이 지연되고 있습니다.') throw error;
    return send();
  }
}
