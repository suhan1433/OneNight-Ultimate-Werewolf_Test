import {randomUUID} from 'node:crypto';
import {afterEach,describe,expect,it,vi} from 'vitest';
import type {Server,Socket} from 'socket.io';
import type {Ack} from '@werewolf/shared';
import {registerHandlers} from './handlers.js';
import {deleteRoom,getRoom,saveRoom} from '../services/redis.js';
const codes:string[]=[];
afterEach(async()=>{for(const code of codes.splice(0))await deleteRoom(code);});
function client(){
  const listeners=new Map<string,Function>();
  const io:any={to:vi.fn(),emit:vi.fn()};io.to.mockReturnValue(io);
  const socket:any={id:randomUUID(),data:{},on:(event:string,handler:Function)=>listeners.set(event,handler),use:vi.fn(),join:vi.fn(),leave:vi.fn(),emit:vi.fn(),to:()=>io};
  registerHandlers(io as Server,socket as Socket);
  return {socket,send:(event:string,data:unknown)=>new Promise<Ack<any>>(resolve=>listeners.get(event)!(data,resolve))};
}
async function setup(){const host=client();const ack=await host.send('ROOM_CREATE',{nickname:'방장',maxPlayers:3,selectedRoles:['werewolf','werewolf','seer','robber','villager','villager'],actionTimeLimitSeconds:8,dayTimeLimitSeconds:300,botMode:true});expect(ack.ok).toBe(true);const code=ack.data.roomCode;codes.push(code);return{host,code,req:()=>({roomCode:code,requestId:randomUUID()})};}
describe('bots share ordinary player rooms',()=>{
  it('creates a single ordinary room even for legacy bot-mode requests',async()=>{const{code}=await setup();expect((await getRoom(code))!.players).toHaveLength(1);});
  it('adds once per request, enforces capacity, and removes only bots',async()=>{
    const{host,code,req}=await setup();const add=req();expect((await host.send('BOT_ADD',add)).ok).toBe(true);expect((await host.send('BOT_ADD',add)).ok).toBe(true);expect((await getRoom(code))!.players).toHaveLength(2);
    await host.send('BOT_ADD',req());expect((await host.send('BOT_ADD',req())).ok).toBe(false);
    const room=(await getRoom(code))!;expect(room.players.filter(p=>p.isBot).every(p=>p.isReady)).toBe(true);
    expect((await host.send('BOT_REMOVE',{...req(),botId:room.hostId})).ok).toBe(false);
    expect((await host.send('BOT_REMOVE',{...req(),botId:room.players[1]!.id})).ok).toBe(true);expect((await getRoom(code))!.players).toHaveLength(2);
  });
  it('lets humans join a room with bots and reserves management for the host',async()=>{
    const{host,code,req}=await setup();await host.send('BOT_ADD',req());const guest=client();expect((await guest.send('ROOM_JOIN',{roomCode:code,nickname:'친구'})).ok).toBe(true);
    expect((await guest.send('BOT_ADD',req())).ok).toBe(false);const bot=(await getRoom(code))!.players.find(p=>p.isBot)!;
    expect((await guest.send('BOT_REMOVE',{...req(),botId:bot.id})).ok).toBe(false);
    await host.send('PLAYER_READY',req());await guest.send('PLAYER_READY',req());expect((await host.send('GAME_START',req())).ok).toBe(true);
    expect((await getRoom(code))!.players.find(p=>p.isBot)!.hasConfirmedCard).toBe(true);expect((await host.send('BOT_REMOVE',{...req(),botId:bot.id})).ok).toBe(false);
    await host.send('CARD_CONFIRM',req());await guest.send('CARD_CONFIRM',req());expect((await getRoom(code))!.phase).toBe('night');
  });
  it('waits for both humans to request voting, lets the bot vote, then tallies all ballots',async()=>{
    const{host,code,req}=await setup();await host.send('BOT_ADD',req());const guest=client();await guest.send('ROOM_JOIN',{roomCode:code,nickname:'친구'});
    const room=(await getRoom(code))!;room.phase='day';room.players.forEach(p=>{p.originalRole='villager';p.currentRole='villager';});await saveRoom(room);
    await host.send('DAY_START',req());expect((await getRoom(code))!.phase).toBe('day');await guest.send('DAY_START',req());expect((await getRoom(code))!.phase).toBe('voting');
    const bot=room.players.find(p=>p.isBot)!;await host.send('VOTE_CONFIRM',{...req(),targetPlayerId:bot.id});expect((await getRoom(code))!.phase).toBe('voting');
    await guest.send('VOTE_CONFIRM',{...req(),targetPlayerId:bot.id});const result=(await getRoom(code))!;expect(result.phase).toBe('result');expect(Object.keys(result.votes)).toHaveLength(3);
    expect((await host.send('GAME_RESTART',req())).ok).toBe(true);expect((await getRoom(code))!.players.find(p=>p.isBot)!.isReady).toBe(true);
  });
  it('transfers ownership to a human and deletes rooms when only bots remain',async()=>{
    const{host,code,req}=await setup();await host.send('BOT_ADD',req());const guest=client();const joined=await guest.send('ROOM_JOIN',{roomCode:code,nickname:'친구'});
    await host.send('ROOM_LEAVE',req());expect((await getRoom(code))!.hostId).toBe(joined.data.playerId);await guest.send('ROOM_LEAVE',req());expect(await getRoom(code)).toBeNull();
  });
});
