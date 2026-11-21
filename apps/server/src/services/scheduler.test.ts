import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Server } from 'socket.io';
import type { Player, Room } from '@werewolf/shared';
import { assignRoles, buildNightActionQueue, startNightIntro, startCurrentAction, votingComplete } from '../game/engine.js';
import { deleteRoom, getRoom, recordVote, saveRoom, toggleReady } from './redis.js';
import { processExpiredRoom } from './scheduler.js';
import { emitRoomState } from '../socket/handlers.js';
const p=(id:string,role:Player['originalRole'],bot=false):Player=>({id,nickname:id,originalRole:role,currentRole:role,connected:true,isReady:true,hasConfirmedCard:true,hasActedTonight:false,vote:null,sessionToken:id,socketId:id,isBot:bot});
function makeRoom():Room {
  const players=[p('witch','witch',true),p('villager','villager'),p('seer','seer')];
  return {roomCode:'SCH234',hostId:'villager',players,maxPlayers:3,selectedRoles:['witch','seer','werewolf','villager','villager','villager'],centerCards:assignRoles(players,['witch','seer','werewolf','villager','villager','villager'],()=>.5).centerCards,phase:'night',nightActionQueue:[],currentNightActionIndex:0,actionTimeLimitSeconds:8,dayTimeLimitSeconds:300,ttsEnabled:true,nightLog:[],votes:{},voteStartRequests:[],processedRequestIds:[],chat:[],publicReveals:[],privateResults:{},privateNightActions:{},protectedPlayerId:null,dayExpiresAt:null,result:null,createdAt:1_000,updatedAt:1_000};
}
const io={to:vi.fn(),emit:vi.fn()};
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(1_000);io.to.mockReturnValue(io);io.emit.mockClear();});
afterEach(async()=>{await deleteRoom('SCH234');vi.useRealTimers();});
describe('persisted sequential night and vote scheduling',()=>{
  it('announces every public role including absent center roles, keeping fixed windows',async()=>{
    let r=makeRoom();r.nightActionQueue=buildNightActionQueue(r.selectedRoles,r.players);r=startNightIntro(r,1_000);await saveRoom(r);
    vi.setSystemTime(5_300);r=(await processExpiredRoom(io as unknown as Server,r.roomCode))!;
    expect(r.nightActionQueue[0]).toMatchObject({role:'werewolf',status:'active',playerIds:[]});
    expect(io.emit).toHaveBeenCalledWith('NARRATOR_SPEECH',expect.objectContaining({audioKey:'werewolf'}));
    const expires=r.nightActionQueue[0]!.expiresAt;vi.setSystemTime(expires-1);await processExpiredRoom(io as unknown as Server,r.roomCode);expect((await getRoom(r.roomCode))!.currentNightActionIndex).toBe(0);
    vi.setSystemTime(expires);r=(await processExpiredRoom(io as unknown as Server,r.roomCode))!;expect(r.currentNightActionIndex).toBe(1);expect(r.nightActionQueue[0]!.status).toBe('skipped');
  });
  it('bot Witch sees then exchanges in the same slot without advancing early',async()=>{
    let r=makeRoom();r.selectedRoles=['witch'];r.nightActionQueue=buildNightActionQueue(r.selectedRoles,r.players);r=startCurrentAction(r,1_000);await saveRoom(r);
    r=(await processExpiredRoom(io as unknown as Server,r.roomCode))!;
    expect(r.privateNightActions.witch?.map(a=>a.result.kind)).toEqual(['witch_seen','witch_swap']);expect(r.currentNightActionIndex).toBe(0);expect(r.nightResolutionExpiresAt).toBeFalsy();
  });
  it('finishes voting after a disconnected nonvoter grace period without waiting for bot work',async()=>{
    let r=makeRoom();r.phase='voting';r.players.forEach(p=>p.isBot=false);r.players[2]!.connected=false;r.players[2]!.disconnectedAt=1_000;await saveRoom(r);await recordVote(r.roomCode,'witch','villager');await recordVote(r.roomCode,'villager','witch');
    expect(votingComplete(r)).toBe(false);vi.setSystemTime(46_000);r=(await processExpiredRoom(io as unknown as Server,r.roomCode))!;expect(r.phase).toBe('result');expect(r.result?.winnerIds).toBeDefined();
  });
});

it('lobby snapshots preserve readiness recorded outside the room object',async()=>{
  const r=makeRoom();r.phase='lobby';r.players[1]!.isReady=false;await saveRoom(r);
  await toggleReady(r.roomCode,'villager','ready-snapshot-regression');
  await emitRoomState(io as unknown as Server,r);
  expect(io.emit).toHaveBeenCalledWith('ROOM_STATE',expect.objectContaining({players:expect.arrayContaining([expect.objectContaining({id:'villager',isReady:true})])}));
});

it('client-driven sync starts day exactly at the private-result deadline and only once',async()=>{
  const r=makeRoom();r.nightResolutionExpiresAt=7_000;await saveRoom(r);
  vi.setSystemTime(6_999);expect((await processExpiredRoom(io as unknown as Server,r.roomCode))!.phase).toBe('night');
  vi.setSystemTime(7_000);const dawn=(await processExpiredRoom(io as unknown as Server,r.roomCode))!;
  expect(dawn.phase).toBe('day');expect(dawn.dayExpiresAt).toBe(307_000);
  expect(io.emit).toHaveBeenCalledWith('DAY_STARTED',{expiresAt:307_000});
  const count=io.emit.mock.calls.length;
  await processExpiredRoom(io as unknown as Server,r.roomCode);
  expect(io.emit.mock.calls).toHaveLength(count);
});

it('duplicate scheduler syncs cannot restart or announce the same role twice',async()=>{
  let r=makeRoom();r.nightActionQueue=buildNightActionQueue(r.selectedRoles,r.players);r=startNightIntro(r,1_000);await saveRoom(r);
  vi.setSystemTime(5_300);
  await Promise.all([processExpiredRoom(io as unknown as Server,r.roomCode),processExpiredRoom(io as unknown as Server,r.roomCode)]);
  const current=(await getRoom(r.roomCode))!.nightActionQueue[0]!;
  expect(current.expiresAt).toBe(13_300);
  expect(io.emit.mock.calls.filter(([event])=>event==='NARRATOR_SPEECH')).toHaveLength(1);
  vi.setSystemTime(13_300);
  await Promise.all([processExpiredRoom(io as unknown as Server,r.roomCode),processExpiredRoom(io as unknown as Server,r.roomCode)]);
  r=(await getRoom(r.roomCode))!;expect(r.currentNightActionIndex).toBe(1);
  expect(io.emit.mock.calls.filter(([event])=>event==='NARRATOR_SPEECH')).toHaveLength(2);
});

it('Doppelganger-Witch completes copy, inspection and exchange inside one configured turn',async()=>{
  let r=makeRoom();r.players[0]!.originalRole='doppelganger';r.players[0]!.currentRole='doppelganger';
  r.players[1]!.originalRole='witch';r.players[1]!.currentRole='witch';r.selectedRoles=['doppelganger','witch','seer'];
  r.nightActionQueue=buildNightActionQueue(r.selectedRoles,r.players);r=startCurrentAction(r,1_000);await saveRoom(r);
  const id=r.nightActionQueue[0]!.id;
  r=(await processExpiredRoom(io as unknown as Server,r.roomCode))!;
  expect(r.nightActionQueue[0]).toMatchObject({id,expiresAt:9_000,actedPlayerIds:['witch']});
  expect(r.privateNightActions.witch?.map(a=>a.result.kind)).toEqual(['copied','witch_seen','witch_swap']);
  expect(r.currentNightActionIndex).toBe(0);expect(r.nightActionQueue).toHaveLength(3);
  vi.setSystemTime(9_000);r=(await processExpiredRoom(io as unknown as Server,r.roomCode))!;
  expect(r.nightActionQueue[r.currentNightActionIndex]!.role).toBe('seer');
});
