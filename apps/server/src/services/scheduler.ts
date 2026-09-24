import type { Server } from 'socket.io';
import { NARRATOR_LINES, type Room } from '@werewolf/shared';
import { advanceNight, buildNightActionQueue, calculateResult, startCurrentAction, startNightIntro } from '../game/engine.js';
import { emitActionStart, emitDayStart, emitRoomState } from '../socket/handlers.js';
import { getRoom, getRoomCodes, saveRoom, withRoomLock } from './redis.js';

const DISCONNECT_GRACE_MS = 45_000;

function hasDueWork(room: Awaited<ReturnType<typeof getRoom>>, now: number) {
  if (!room) return false;
  if (room.phase === 'night') return !!room.nightActionQueue[room.currentNightActionIndex] && room.nightActionQueue[room.currentNightActionIndex]!.expiresAt <= now;
  if (room.phase === 'day') return !!room.dayExpiresAt && room.dayExpiresAt <= now;
  if (room.phase === 'card_reveal' || room.phase === 'voting') return room.players.some((p) => !p.connected && !!p.disconnectedAt && p.disconnectedAt + DISCONNECT_GRACE_MS <= now);
  return false;
}

export function startScheduler(io: Server) {
  const timer = setInterval(async () => {
    for (const code of getRoomCodes()) {
      await processExpiredRoom(io, code);
    }
  }, 400);
  timer.unref();
}

/**
 * Advances one persisted room if its deadline passed. Multiple Vercel Functions
 * may call this concurrently; withRoomLock ensures that only one applies and
 * publishes a transition. In production this is driven by connected clients'
 * ROOM_SYNC heartbeats, rather than an unreliable process-global interval.
 */
export async function processExpiredRoom(io: Server, code: string): Promise<Room | null> {
  try {
    // ROOM_SYNC is deliberately cheap: clients can poll for a serverless wake-up,
    // but only a room with a due deadline contends on the distributed lock.
    const snapshot = await getRoom(code);
    if (!snapshot) return null;
    if (!hasDueWork(snapshot, Date.now())) return snapshot;
    let transitioned = false; let dayTransition = false;
    const room = await withRoomLock(code, async (room) => {
      const now = Date.now();
      if (room.phase === 'night') {
        const current = room.nightActionQueue[room.currentNightActionIndex];
        if (current?.status === 'pending' && current.expiresAt <= now) {
          room = startCurrentAction(room, now);
          transitioned = true;
          await saveRoom(room);
        } else if (current?.status === 'active' && current.expiresAt <= now) {
          const wasLast = room.currentNightActionIndex === room.nightActionQueue.length - 1;
          room = advanceNight(room, current.playerIds.length ? 'timeout' : 'skipped', now);
          transitioned = true; dayTransition = wasLast;
          await saveRoom(room);
        }
      } else if (room.phase === 'day' && room.dayExpiresAt && room.dayExpiresAt <= now) {
        if (room.moderatorMode) {
          room.players = room.players.map((p) => ({ ...p, originalRole: null, currentRole: null, isReady: false, hasConfirmedCard: false, hasActedTonight: false, vote: null }));
          room.centerCards = []; room.phase = 'lobby'; room.nightActionQueue = []; room.currentNightActionIndex = 0; room.votes = {}; room.voteStartRequests = []; room.privateResults = {}; room.publicReveals = []; room.nightLog = []; room.chat = []; room.dayExpiresAt = null; room.result = null; room.protectedPlayerId = null; room.lobbyExpiresAt = now + 60 * 60 * 1000; room.allOfflineExpiresAt = null; room.resultExpiresAt = null; room.updatedAt = now;
        } else { room.phase = 'voting'; room.dayExpiresAt = null; room.updatedAt = now; }
        transitioned = true;
        await saveRoom(room);
      }
      if (room.phase === 'card_reveal') {
        let autoConfirmed = false;
        for (const player of room.players) if (!player.connected && player.disconnectedAt && player.disconnectedAt + DISCONNECT_GRACE_MS <= now && !player.hasConfirmedCard) { player.hasConfirmedCard = true; autoConfirmed = true; }
        if (room.players.every((player) => player.hasConfirmedCard)) {
          room.phase = 'night'; room.nightActionQueue = buildNightActionQueue(room.selectedRoles, room.players); room.currentNightActionIndex = 0;
          room = startNightIntro(room, now);
          transitioned = true; await saveRoom(room);
        } else if (autoConfirmed) { transitioned = true; await saveRoom(room); }
      } else if (room.phase === 'voting') {
        const eligible = room.players.filter((player) => player.connected || !player.disconnectedAt || player.disconnectedAt + DISCONNECT_GRACE_MS > now);
        if (eligible.every((player) => !!room.votes[player.id])) {
          room.result = calculateResult(room); room.players = room.players.map((p) => ({ ...p, currentRole: room.result!.players.find((x) => x.id === p.id)!.currentRole }));
          room.phase = 'result'; room.resultExpiresAt = now + 30 * 60 * 1000; transitioned = true; await saveRoom(room);
        }
      }
      return room;
    });
    if (transitioned) {
      // Queue the narration before the state that reveals its controls. Socket
      // ordering makes the audio instruction arrive before its timer begins.
      if (room.phase === 'night') {
        const action = room.nightActionQueue[room.currentNightActionIndex];
        if (action?.status === 'active') emitActionStart(io, room);
        else io.to(`game:${code}`).emit('NARRATOR_SPEECH', { text: NARRATOR_LINES.nightStart, audioKey: 'night-start', actionId: 'night-start', stateVersion: room.updatedAt, timestamp: Date.now() });
      }
      await emitRoomState(io, room);
      if (room.phase === 'day' && dayTransition) emitDayStart(io, room);
      else if (room.phase !== 'night') io.to(`game:${code}`).emit('PHASE_CHANGED', { phase: room.phase });
    }
    return room;
  } catch { return null; /* A competing request can win the due transition; the next sync reconciles state. */ }
}
