import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {Room} from '@werewolf/shared';
import type {Server,Socket} from 'socket.io';
import {registerHandlers} from './handlers.js';

const db=vi.hoisted(()=>({getRoom:vi.fn(),saveRoom:vi.fn(),withRoomLock:vi.fn()}));
vi.mock('../services/redis.js',()=>({...db,appendChat:vi.fn(),clearChat:vi.fn(),consumeRateLimit:vi.fn(),deleteRoom:vi.fn(),getChatHistory:vi.fn()}));

let sequence=0;
function harness(){
 const room:Room={roomCode:`AIM${++sequence}`,hostId:'assassin',maxPlayers:5,phase:'assassination',options:{assassin:true,assassinationAbilityRole:null,percival:false,morgana:false,mordred:false,oberon:false,revealVoteIdentities:false},players:[{id:'assassin',nickname:'암살자',role:'assassin',hasAssassinationAbility:true,sessionToken:'a',socketId:'socket-a',connected:true,ready:true},{id:'merlin',nickname:'멀린',role:'merlin',sessionToken:'m',socketId:'socket-m',connected:true,ready:true},{id:'loyal',nickname:'기사',role:'loyal',sessionToken:'l',socketId:'socket-l',connected:true,ready:true}],round:2,leaderIndex:0,rejectCount:0,results:['success','success','success'],roundHistory:[],proposedTeam:[],teamVotes:{},questCards:{},createdAt:0,updatedAt:0};
 db.getRoom.mockResolvedValue(room);db.withRoomLock.mockImplementation(async(_code:string,fn:(value:Room)=>unknown)=>fn(room));db.saveRoom.mockResolvedValue(undefined);
 const handlers=new Map<string,(data:any,cb?:any)=>Promise<unknown>>();
 const broadcast=vi.fn();const to=vi.fn(()=>({emit:broadcast}));
 const client={id:'socket-a',data:{roomCode:room.roomCode,playerId:'assassin'},on:vi.fn((event:string,fn:any)=>handlers.set(event,fn)),emit:vi.fn()};
 registerHandlers({to} as unknown as Server,client as unknown as Socket);
 const request=async(event:string,data:unknown)=>{let result:any;await handlers.get(event)!(data,(response:any)=>{result=response;});return result;};
 return{room,client,handlers,broadcast,to,request};
}
beforeEach(()=>{vi.useFakeTimers();vi.clearAllMocks();});
afterEach(()=>{vi.useRealTimers();});

describe('shared assassination scene',()=>{
 it('relays only an authenticated assassin aim to their own room',async()=>{
  const h=harness();await h.handlers.get('ASSASSIN_AIM')!({roomCode:h.room.roomCode,targetId:'merlin'});
  expect(h.to).toHaveBeenCalledWith(`game:${h.room.roomCode}`);expect(h.broadcast).toHaveBeenCalledWith('ASSASSIN_AIM',{roomCode:h.room.roomCode,targetId:'merlin',actorId:'assassin',locked:false});expect(h.room.phase).toBe('assassination');expect(db.saveRoom).not.toHaveBeenCalled();
 });
 it('rejects spectators, forged room codes and nonexistent targets',async()=>{
  const h=harness();h.client.data.playerId='loyal';await h.handlers.get('ASSASSIN_AIM')!({roomCode:h.room.roomCode,targetId:'merlin'});
  h.client.data.playerId='assassin';await h.handlers.get('ASSASSIN_AIM')!({roomCode:'FOREIGN',targetId:'merlin'});
  await vi.advanceTimersByTimeAsync(100);await h.handlers.get('ASSASSIN_AIM')!({roomCode:h.room.roomCode,targetId:'unknown'});expect(h.broadcast).not.toHaveBeenCalled();
 });
 it('locks the target for everyone and reveals the result only after one second',async()=>{
  const h=harness();expect(await h.request('ASSASSIN_COMMIT',{roomCode:h.room.roomCode,targetId:'merlin'})).toMatchObject({ok:true});
  expect(h.broadcast).toHaveBeenCalledWith('ASSASSIN_AIM',{roomCode:h.room.roomCode,targetId:'merlin',actorId:'assassin',locked:true});
  const again=await h.request('ASSASSIN_COMMIT',{roomCode:h.room.roomCode,targetId:'loyal'});expect(again.ok).toBe(false);
  await vi.advanceTimersByTimeAsync(999);expect(h.room.phase).toBe('assassination');
  await vi.advanceTimersByTimeAsync(1);expect(h.room).toMatchObject({phase:'result',winner:'evil',assassinTarget:'merlin'});expect(db.saveRoom).toHaveBeenCalledOnce();expect(h.broadcast).toHaveBeenCalledWith('ROOM_STATE',expect.objectContaining({phase:'result',winner:'evil'}));
 });
 it('preserves the good ending when the assassin misses Merlin',async()=>{
  const h=harness();await h.request('ASSASSIN_COMMIT',{roomCode:h.room.roomCode,targetId:'loyal'});await vi.advanceTimersByTimeAsync(1000);expect(h.room).toMatchObject({phase:'result',winner:'good',assassinTarget:'loyal'});
 });
 it('rejects unauthorized and self-targeted commits without scheduling a result',async()=>{
  const h=harness();expect((await h.request('ASSASSIN_COMMIT',{roomCode:h.room.roomCode,targetId:'assassin'})).ok).toBe(false);
  h.client.data.playerId='loyal';expect((await h.request('ASSASSIN_COMMIT',{roomCode:h.room.roomCode,targetId:'merlin'})).ok).toBe(false);await vi.advanceTimersByTimeAsync(1500);expect(h.room.phase).toBe('assassination');expect(db.saveRoom).not.toHaveBeenCalled();
 });
});
