import type { Server } from 'socket.io';
import { NARRATOR_LINES, type NightCommand, type Room } from '@werewolf/shared';
import { advanceNight, applyNightAction, buildNightActionQueue, calculateResult, startCurrentAction, startNightIntro } from '../game/engine.js';
import { emitActionStart, emitDayStart, emitRoomState } from '../socket/handlers.js';
import { getRoom, getRoomCodes, getVotes, recordVote, saveRoom, withRoomLock } from './redis.js';

const DISCONNECT_GRACE_MS = 45_000;

function hasDueWork(room: Awaited<ReturnType<typeof getRoom>>, now: number) {
  if (!room) return false;
  if (room.phase === 'night') {
    const action = room.nightActionQueue[room.currentNightActionIndex];
    return !!action && (action.expiresAt <= now || (action.status === 'active' && action.playerIds.some((id) => room.players.some((player) => player.id === id && player.isBot) && !action.actedPlayerIds.includes(id))));
  }
  if (room.phase === 'day') return !!room.dayExpiresAt && room.dayExpiresAt <= now;
  if (room.phase === 'voting') return room.players.some((player) => player.isBot && !room.votes[player.id]);
  if (room.phase === 'card_reveal') return room.players.some((p) => !p.connected && !!p.disconnectedAt && p.disconnectedAt + DISCONNECT_GRACE_MS <= now);
  return false;
}

function botCommand(room: Room, playerId: string): NightCommand | null {
  const action = room.nightActionQueue[room.currentNightActionIndex];
  if (!action) return null;
  const targets = room.players.filter((player) => player.id !== playerId && player.connected && player.id !== room.protectedPlayerId).map((player) => player.id);
  const target = targets[0];
  switch (action.role) {
    case 'werewolf': {
      const hasPackmate = room.players.some((player) => player.id !== playerId && ['werewolf', 'alpha_wolf', 'mystic_wolf', 'dream_wolf'].includes(player.currentRole ?? ''));
      return hasPackmate ? { type: 'confirm' } : { type: 'inspect_center', centerIndexes: [0] };
    }
    case 'witch':
      return room.privateResults[playerId]?.kind === 'witch_seen'
        ? (target ? { type: 'swap_center', targetPlayerIds: [target], centerIndexes: [Number(room.privateResults[playerId]!.centerIndex)] } : null)
        : { type: 'inspect_center', centerIndexes: [0] };
    case 'troublemaker': return targets.length >= 2 ? { type: 'swap_players', targetPlayerIds: targets.slice(0, 2) } : null;
    case 'seer': return target ? { type: 'inspect_player', targetPlayerIds: [target] } : { type: 'inspect_centers', centerIndexes: [0, 1] };
    case 'apprentice_seer': return { type: 'inspect_center', centerIndexes: [0] };
    case 'drunk': return { type: 'swap_center', centerIndexes: [0] };
    case 'doppelganger': case 'shield_bearer': case 'alpha_wolf': case 'mystic_wolf': case 'journalist': case 'robber':
      return target ? { type: 'inspect_player', targetPlayerIds: [target] } : null;
    default: return { type: 'confirm' };
  }
}

function runBotNightActions(room: Room): Room {
  const action = room.nightActionQueue[room.currentNightActionIndex];
  if (!action?.status || action.status !== 'active') return room;
  for (const playerId of action.playerIds) {
    const player = room.players.find((candidate) => candidate.id === playerId);
    if (!player?.isBot || action.actedPlayerIds.includes(playerId)) continue;
    // A witch has two consecutive choices within one action, so allow its
    // inspection result to feed directly into its exchange choice.
    for (let step = 0; step < 2; step += 1) {
      const command = botCommand(room, playerId);
      if (!command) break;
      const applied = applyNightAction(room, playerId, command);
      room = applied.room;
      room.privateResults[playerId] = applied.result;
      if (room.nightActionQueue[room.currentNightActionIndex]?.actedPlayerIds.includes(playerId)) break;
    }
  }
  return room;
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
        } else if (current?.status === 'active') {
          const updated = runBotNightActions(room);
          if (updated !== room) { room = updated; transitioned = true; await saveRoom(room); }
        }
      } else if (room.phase === 'day' && room.dayExpiresAt && room.dayExpiresAt <= now) {
        room.phase = 'voting'; room.dayExpiresAt = null; room.updatedAt = now;
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
        let botsVoted = false;
        for (const bot of room.players.filter((player) => player.isBot && !room.votes[player.id])) {
          const target = room.players.find((player) => player.id !== bot.id);
          if (target) {
            const recorded = await recordVote(room.roomCode, bot.id, target.id);
            botsVoted ||= recorded.added;
          }
        }
        room.votes = await getVotes(room.roomCode);
        const eligible = room.players.filter((player) => player.connected || !player.disconnectedAt || player.disconnectedAt + DISCONNECT_GRACE_MS > now);
        if (eligible.every((player) => !!room.votes[player.id])) {
          room.result = calculateResult(room); room.players = room.players.map((p) => ({ ...p, currentRole: room.result!.players.find((x) => x.id === p.id)!.currentRole }));
          room.phase = 'result'; room.resultExpiresAt = now + 30 * 60 * 1000; transitioned = true; await saveRoom(room);
        } else if (botsVoted) {
          room.updatedAt = now; transitioned = true; await saveRoom(room);
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
