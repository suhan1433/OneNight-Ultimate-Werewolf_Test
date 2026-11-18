import type { Server } from 'socket.io';
import { NARRATOR_LINES, type NightCommand, type Room } from '@werewolf/shared';
import { applyNightAction, buildNightActionQueue, calculateResult, DISCONNECT_GRACE_MS, effectiveRole, nextRoomVersion, resolveNightDeadline, startCurrentAction, startDay, startNightIntro, validateNightAction, votingComplete } from '../game/engine.js';
import { emitActionStart, emitDayStart, emitRoomState } from '../socket/handlers.js';
import { getRoom, getRoomCodes, getVotes, recordVote, saveRoom, withRoomLock } from './redis.js';

function hasBotWork(room: Room) {
  const action = room.nightActionQueue[room.currentNightActionIndex];
  return action?.status === 'active' && action.playerIds.some(id => room.players.some(p => p.id === id && p.isBot) && !action.actedPlayerIds.includes(id));
}
function hasDueWork(room: Room | null, now: number): boolean {
  if (!room) return false;
  if (room.phase === 'night') {
    if (room.nightResolutionExpiresAt) return room.nightResolutionExpiresAt <= now;
    const action = room.nightActionQueue[room.currentNightActionIndex];
    return !!action && (action.expiresAt <= now || hasBotWork(room));
  }
  if (room.phase === 'day') return !!room.dayExpiresAt && room.dayExpiresAt <= now;
  if (room.phase === 'voting') return room.players.some(p => p.isBot && !room.votes[p.id]) || room.players.some(p => !p.connected && !!p.disconnectedAt && p.disconnectedAt + DISCONNECT_GRACE_MS <= now);
  if (room.phase === 'card_reveal') return room.players.some(p => !p.connected && !!p.disconnectedAt && p.disconnectedAt + DISCONNECT_GRACE_MS <= now && !p.hasConfirmedCard);
  return false;
}
function botCommand(room: Room, playerId: string): NightCommand {
  const action = room.nightActionQueue[room.currentNightActionIndex]!;
  const protectedIds = new Set(room.protectedPlayerIds ?? []);
  const targets = room.players.filter(p => p.id !== playerId && !protectedIds.has(p.id)).map(p => p.id);
  const target = targets[0];
  if (protectedIds.has(playerId) && ['robber','drunk','insomniac'].includes(action.role)) return { type:'skip' };
  switch (action.role) {
    case 'werewolf': return room.players.some(p => p.id !== playerId && ['werewolf','alpha_wolf','mystic_wolf','dream_wolf'].includes(effectiveRole(p)!)) ? {type:'confirm'} : {type:'inspect_center',centerIndexes:[0]};
    case 'witch': return room.witchChoices?.[playerId] === undefined ? {type:'inspect_center',centerIndexes:[0]} : {type:'swap_center',targetPlayerIds:[target ?? playerId],centerIndexes:[room.witchChoices[playerId]!]};
    case 'troublemaker': return targets.length >= 2 ? {type:'swap_players',targetPlayerIds:targets.slice(0,2)} : {type:'skip'};
    case 'seer': return {type:'inspect_centers',centerIndexes:[0,1]};
    case 'apprentice_seer': return {type:'inspect_center',centerIndexes:[0]};
    case 'drunk': return {type:'swap_center',centerIndexes:[0]};
    case 'shield_bearer': return target ? {type:'protect',targetPlayerIds:[target]} : {type:'skip'};
    case 'robber': return target ? {type:'swap_player',targetPlayerIds:[target]} : {type:'skip'};
    case 'alpha_wolf': {
      const victim = room.players.find(p => targets.includes(p.id) && !['werewolf','alpha_wolf','mystic_wolf','dream_wolf'].includes(effectiveRole(p)!));
      return victim ? {type:'swap_player',targetPlayerIds:[victim.id]} : {type:'confirm'};
    }
    case 'doppelganger': case 'mystic_wolf': case 'journalist': return target ? {type:'inspect_player',targetPlayerIds:[target]} : {type:'skip'};
    default: return {type:'confirm'};
  }
}
function runBotNightActions(room: Room): Room {
  const action = room.nightActionQueue[room.currentNightActionIndex];
  if (action?.status !== 'active') return room;
  for (const id of action.playerIds) {
    if (!room.players.some(p => p.id === id && p.isBot)) continue;
    // A Witch has two commands; resolve both before ending this pass.
    for (let step=0; step<2; step++) {
      if (room.nightActionQueue[room.currentNightActionIndex]!.actedPlayerIds.includes(id)) break;
      const command = botCommand(room,id);
      if (validateNightAction(room,id,action.id,command)) break;
      room = applyNightAction(room,id,command).room;
    }
  }
  return room;
}
export function startScheduler(io: Server) {
  const timer = setInterval(async () => { for (const code of getRoomCodes()) await processExpiredRoom(io,code); },400);
  timer.unref();
}
export async function processExpiredRoom(io: Server, code: string): Promise<Room | null> {
  try {
    const snapshot = await getRoom(code);
    if (!hasDueWork(snapshot,Date.now())) return snapshot;
    let transitioned = false;
    let announceAction = false;
    let announceIntro = false;
    let dayTransition = false;
    const room = await withRoomLock(code,async room => {
      const now = Date.now();
      if (!hasDueWork(room,now)) return room;
      if (room.phase === 'night') {
        if (room.nightResolutionExpiresAt) {
          room = startDay(room,now); dayTransition = true;
        } else {
          const action = room.nightActionQueue[room.currentNightActionIndex];
          if (action?.status === 'pending' && action.expiresAt <= now) {
            room = startCurrentAction(room,now); announceAction = true;
          } else if (action?.status === 'active') {
            room = action.expiresAt <= now ? resolveNightDeadline(room,now) : runBotNightActions(room);
            announceAction = !!room.nightActionQueue[room.currentNightActionIndex] && room.nightActionQueue[room.currentNightActionIndex]!.id !== action.id;
          }
        }
        transitioned = true;
      } else if (room.phase === 'day') {
        room = {...room,phase:'voting',dayExpiresAt:null,updatedAt:nextRoomVersion(room,now)}; transitioned = true;
      } else if (room.phase === 'card_reveal') {
        room.players = room.players.map(p => !p.connected && p.disconnectedAt && p.disconnectedAt + DISCONNECT_GRACE_MS <= now ? {...p,hasConfirmedCard:true} : p);
        if (room.players.every(p => p.hasConfirmedCard)) {
          room = startNightIntro({...room,phase:'night',nightActionQueue:buildNightActionQueue(room.selectedRoles,room.players),currentNightActionIndex:0},now);
          announceIntro = true;
        }
        room.updatedAt = nextRoomVersion(room,now); transitioned = true;
      }
      if (room.phase === 'voting') {
        let botsVoted = false;
        for (const bot of room.players.filter(p => p.isBot && !room.votes[p.id])) {
          const target = room.players.find(p => p.id !== bot.id);
          if (target) { await recordVote(code,bot.id,target.id); botsVoted = true; }
        }
        room.votes = await getVotes(code);
        if (votingComplete(room,now)) {
          room.result = calculateResult(room); room.phase = 'result'; room.resultExpiresAt = now + 30*60*1000;
          room.updatedAt = nextRoomVersion(room,now); transitioned = true;
        } else if (botsVoted) { room.updatedAt = nextRoomVersion(room,now); transitioned = true; }
      }
      if (transitioned) await saveRoom(room);
      return room;
    });
    if (transitioned) {
      if (announceIntro) io.to(`game:${code}`).emit('NARRATOR_SPEECH',{text:NARRATOR_LINES.nightStart,audioKey:'night-start',actionId:'night-start',stateVersion:room.updatedAt,timestamp:Date.now()});
      if (announceAction) emitActionStart(io,room);
      await emitRoomState(io,room);
      if (dayTransition) emitDayStart(io,room);
      else if (room.phase !== 'night') io.to(`game:${code}`).emit('PHASE_CHANGED',{phase:room.phase});
    }
    return room;
  } catch { return null; }
}
