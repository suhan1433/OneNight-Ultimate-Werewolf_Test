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
  // Mobile browsers frequently suspend a WebSocket while backgrounded. Keep
  // trying after that suspension instead of accepting Socket.IO's short-lived
  // default retry sequence.
  reconnectionAttempts: Infinity,
  reconnectionDelay: 500,
  reconnectionDelayMax: 5_000,
  randomizationFactor: 0.25,
});
socket.on('ERROR', ({ message }: { message: string }) => useGame.getState().setError(message));
type Narration = { audioKey: string; actionId: string; stateVersion: number; receivedAt: number };
let currentNarration: HTMLAudioElement | null = null;
let currentNarrationInfo: Narration | null = null;
let narrationQueue: Narration[] = [];
let narrationUnlocked = false;
let syncInFlight: Promise<boolean> | null = null;
let resumeInFlight: Promise<boolean> | null = null;
let resumeRetryTimer: number | null = null;
let resumeFailures = 0;
const expiredActionRecoveries = new Map<string, number>();

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
    // Keep this relative to Vite's configured base path. In Render, this app
    // is served at /werewolf/, rather than at the site root.
    audio = new Audio(`${import.meta.env.BASE_URL}${audioKey.replaceAll('_', '-')}.mp3`);
    audio.preload = 'auto';
    // Narration is an announcement, never background music. Be explicit so a
    // recording can only play through once even if its source has loop hints.
    audio.loop = false;
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
  // A player action updates ROOM_STATE while the role and its announcement
  // remain the same. Match the announced role/phase, rather than requiring an
  // exact state version, so selecting a card never pauses its narration.
  return !!game && narration.stateVersion <= game.stateVersion && narration.actionId === expectedNarrationId(game);
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

socket.on('NARRATOR_SPEECH', ({ audioKey, actionId, stateVersion }: { audioKey?: string; actionId?: string; stateVersion?: number }) => {
  if (!useGame.getState().tts || !audioKey || !actionId || stateVersion === undefined) return;
  // A reconnect or a racing scheduler can deliver this exact announcement
  // more than once with a different transport timestamp. Its action and room
  // state identify the actual announcement, so deduplicate by those values.
  const key = `${actionId}-${stateVersion}`;
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
function scheduleSessionResume() {
  if (resumeRetryTimer !== null) return;
  // A failed rejoin can be a function wake-up or a transient mobile-network
  // handoff. Back off to one small request per ten seconds, rather than
  // leaving the old game screen permanently frozen.
  const delay = Math.min(10_000, 500 * 2 ** Math.min(resumeFailures, 5));
  resumeRetryTimer = window.setTimeout(() => {
    resumeRetryTimer = null;
    void resumeSession();
  }, delay);
}

function resumeSession(): Promise<boolean> {
  const saved = session();
  if (!saved) {
    useGame.getState().setConnectionState('connected');
    return Promise.resolve(true);
  }
  if (!socket.connected) {
    useGame.getState().setConnectionState('reconnecting');
    return Promise.resolve(false);
  }
  if (resumeInFlight) return resumeInFlight;
  useGame.getState().setConnectionState('reconnecting');
  resumeInFlight = new Promise<boolean>((resolve) => {
    socket.timeout(8_000).emit('ROOM_JOIN', saved, (error: Error | null, ack: Ack) => {
      if (error || !ack?.ok) {
        resumeFailures += 1;
        scheduleSessionResume();
        resolve(false);
        return;
      }
      resumeFailures = 0;
      useGame.getState().setConnectionState('connected');
      void syncRoom();
      resolve(true);
    });
  }).finally(() => { resumeInFlight = null; });
  return resumeInFlight;
}

socket.on('connect', () => { void resumeSession(); });
socket.on('disconnect', () => useGame.getState().setConnectionState('reconnecting'));
socket.io.on('reconnect_attempt', () => useGame.getState().setConnectionState('reconnecting'));
socket.on('connect_error', () => useGame.getState().setConnectionState('reconnecting'));
// Function instances can be paused/recycled, so a persisted deadline is checked
// by active players instead of relying on a server-global setInterval.
export const syncRoom = (): Promise<boolean> => {
  if (!socket.connected) { useGame.getState().setConnectionState('reconnecting'); return Promise.resolve(false); }
  if (syncInFlight) return syncInFlight;
  // A serverless function can need a cold-start window. A 1.2-second timeout
  // was shorter than that window and made an otherwise healthy reconnect look
  // terminal. This remains single-flight, so it cannot multiply load.
  syncInFlight = new Promise<boolean>((resolve) => socket.timeout(8_000).emit('ROOM_SYNC', (error: Error | null, ack: Ack<ClientGameState>) => {
    if (error || !ack?.ok || !ack.data) { resolve(false); return; }
    useGame.getState().setGame(ack.data);
    resolve(true);
  })).finally(() => { syncInFlight = null; });
  return syncInFlight;
};

export function recoverExpiredAction(actionId: string, showTransition = true) {
  const game = useGame.getState().game;
  const action = game?.currentNightAction;
  const recoveryKey = `${actionId}:${action?.status ?? 'unknown'}:${action?.expiresAt ?? 0}`;
  if (expiredActionRecoveries.has(recoveryKey)) return;
  // The opening narration uses the first action's ID while it is still
  // pending. That deadline starts the role, not a role-to-role transition.
  if (showTransition) useGame.getState().setTransitioningActionId(actionId);
  const delays = [0, 1_000, 2_000, 5_000, 10_000];
  let attempt = 0;
  const retry = () => {
    const delay = delays[Math.min(attempt, delays.length - 1)]!;
    const timer = window.setTimeout(() => {
      void syncRoom().finally(() => {
        const current = useGame.getState().game;
        const stillExpired = current?.phase === 'night' && current.currentNightAction?.id === actionId && current.currentNightAction.status === action?.status && (current.currentNightAction.expiresAt ?? 0) <= Date.now();
        if (!stillExpired) {
          expiredActionRecoveries.delete(recoveryKey);
          return;
        }
        attempt += 1;
        retry();
      });
    }, delay);
    expiredActionRecoveries.set(recoveryKey, timer);
  };
  retry();
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
