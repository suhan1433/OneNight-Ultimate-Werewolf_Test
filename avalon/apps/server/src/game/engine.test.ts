import { describe, expect, it } from 'vitest';
import { COUNT_TABLE, type Room } from '@werewolf/shared';
import { assignRoles, doubleFail, intel, questSize } from './engine.js';
const room=(players=5):Room=>({roomCode:'ABC123',hostId:'a',maxPlayers:players,players:Array.from({length:players},(_,i)=>({id:String(i),nickname:`P${i}`,sessionToken:'x',socketId:null,role:null,ready:true,connected:true})),phase:'lobby',options:{percival:true,morgana:true,mordred:false,oberon:false},round:0,leaderIndex:0,rejectCount:0,results:[],proposedTeam:[],teamVotes:{},questCards:{},createdAt:0,updatedAt:0});
describe('Avalon rules',()=>{
 it('uses the official party sizes',()=>{expect(COUNT_TABLE[5]!.quests).toEqual([2,3,2,3,3]);expect(COUNT_TABLE[10]!.evil).toBe(4);});
 it('deals one Merlin and Assassin and correct team counts',()=>{const r=room(7);assignRoles(r);expect(r.players.filter(p=>p.role==='merlin')).toHaveLength(1);expect(r.players.filter(p=>p.role==='assassin')).toHaveLength(1);expect(r.players.filter(p=>p.role&&['assassin','morgana','mordred','oberon','minion'].includes(p.role))).toHaveLength(3);});
 it('requires two failures only in round four with 7+ players',()=>{const r=room(7);r.round=3;expect(doubleFail(r)).toBe(true);expect(questSize(r)).toBe(4);r.maxPlayers=6;expect(doubleFail(r)).toBe(false);});
 it('does not show Mordred to Merlin',()=>{const r=room();r.players[0]!.role='merlin';r.players[1]!.role='mordred';r.players[2]!.role='assassin';expect(intel(r,r.players[0]!)).toEqual(['P2님은 악의 세력입니다.']);});
});
