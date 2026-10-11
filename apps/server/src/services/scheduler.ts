import type { Server } from 'socket.io';
import { NARRATOR_LINES, type NightCommand, type Room } from '@werewolf/shared';
import { allNightActionsSubmitted, buildNightActionQueue, calculateResult, nextRoomVersion, resolveParallelNight, startCurrentAction, startDay, startNightIntro } from '../game/engine.js';
import { emitDayStart, emitRoomState } from '../socket/handlers.js';
import { getRoom, getRoomCodes, getVotes, recordVote, saveRoom, withRoomLock } from './redis.js';

const DISCONNECT_GRACE_MS = 45_000;

function hasDueWork(room: Awaited<ReturnType<typeof getRoom>>, now: number) {
  if (!room) return false;
  if (room.phase === 'night') {
    if (room.nightResolutionExpiresAt) return room.nightResolutionExpiresAt <= now;
    const action = room.nightActionQueue[room.currentNightActionIndex];
    return !!action && (action.expiresAt <= now || (action.status === 'active' && (allNightActionsSubmitted(room) || room.nightActionQueue.some((nightAction) => nightAction.playerIds.some((id) => room.players.some((player) => player.id === id && player.isBot) && !(room.pendingNightCommands ?? {})[id])))));
  }
  if (room.phase === 'day') return !!room.dayExpiresAt && room.dayExpiresAt <= now;
  if (room.phase === 'voting') return room.players.some((player) => player.isBot && !room.votes[player.id]);
  if (room.phase === 'card_reveal') return room.players.some((p) => !p.connected && !!p.disconnectedAt && p.disconnectedAt + DISCONNECT_GRACE_MS <= now);
  return false;
}

function botCommand(room: Room, playerId: string, action: Room['nightActionQueue'][number]): NightCommand | null {
  const targets = room.players.filter((player) => player.id !== playerId && player.connected && player.id !== room.protectedPlayerId).map((player) => player.id);
  const target = targets[0];
  switch (action.role) {
    case 'werewolf': {
      const hasPackmate = room.players.some((player) => player.id !== playerId && ['werewolf', 'alpha_wolf', 'mystic_wolf', 'dream_wolf'].includes(player.currentRole ?? ''));
      return hasPackmate ? { type: 'confirm' } : { type: 'inspect_center', centerIndexes: [0] };
    }
    case 'witch': return target ? { type: 'swap_center', targetPlayerIds: [target], centerIndexes: [0] } : null;
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
  if (!room.nightActionQueue.some((action) => action.status === 'active')) return room;
  const pendingNightCommands = { ...(room.pendingNightCommands ?? {}) };
  for (const action of room.nightActionQueue) for (const playerId of action.playerIds) {
    const player = room.players.find((candidate) => candidate.id === playerId);
    if (!player?.isBot || pendingNightCommands[playerId]) continue;
    const command = botCommand(room, playerId, action);
    if (command) pendingNightCommands[playerId] = command;
  }
  return { ...room, pendingNightCommands };
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
        if (room.nightResolutionExpiresAt && room.nightResolutionExpiresAt <= now) {
          room = startDay(room, now);
          transitioned = true; dayTransition = true;
          await saveRoom(room);
        } else {
        const current = room.nightActionQueue[room.currentNightActionIndex];
        if (current?.status === 'pending' && current.expiresAt <= now) {
          room = startCurrentAction(room, now);
          transitioned = true;
          await saveRoom(room);
        } else if (current?.status === 'active') {
          const updated = runBotNightActions(room);
          room = updated;
          if (current.expiresAt <= now || allNightActionsSubmitted(room)) room = resolveParallelNight(room, now);
          transitioned = true;
          await saveRoom(room);
        }
        }
      } else if (room.phase === 'day' && room.dayExpiresAt && room.dayExpiresAt <= now) {
        room.phase = 'voting'; room.dayExpiresAt = null; room.updatedAt = nextRoomVersion(room, now);
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
          room.phase = 'result'; room.resultExpiresAt = now + 30 * 60 * 1000; room.updatedAt = nextRoomVersion(room, now); transitioned = true; await saveRoom(room);
        } else if (botsVoted) {
          room.updatedAt = nextRoomVersion(room, now); transitioned = true; await saveRoom(room);
        }
      }
      return room;
    });
    if (transitioned) {
      // Queue the narration before the state that reveals its controls. Socket
      // ordering makes the audio instruction arrive before its timer begins.
      if (room.phase === 'night' && room.nightActionQueue[0]?.status === 'pending') io.to(`game:${code}`).emit('NARRATOR_SPEECH', { text: NARRATOR_LINES.nightStart, audioKey: 'night-start', actionId: 'night-start', stateVersion: room.updatedAt, timestamp: Date.now() });
      await emitRoomState(io, room);
      if (room.phase === 'day' && dayTransition) emitDayStart(io, room);
      else if (room.phase !== 'night') io.to(`game:${code}`).emit('PHASE_CHANGED', { phase: room.phase });
    }
    return room;
  } catch { return null; /* A competing request can win the due transition; the next sync reconciles state. */ }
}
