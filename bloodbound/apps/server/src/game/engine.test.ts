import { describe, expect, it } from 'vitest';
import type { BloodBoundPlayer, BloodBoundRoom, Character, Token } from '@bloodbound/shared';
import { clientState } from './view.js';
import { assignCharacters, createRoom, leaderId, reduce } from './engine.js';

const gear=()=>({shields:[] as string[],swords:[] as string[],staffs:0,fans:0,quill:false});
const character=(clan:'rose'|'beast'|'secret',rank:number|null=1):Character=>({clan,rank,name:rank===null?'Inquisitor':`#${rank}`,affiliations:clan==='secret'?['unknown','unknown']:rank===2?['unknown','unknown']:[clan,clan],clue:clan==='beast'?'beast':'rose',ability:rank===1?'elder':rank===4?'alchemist':rank===5?'mentalist':rank===6?'guardian':rank===7?'berserker':rank===8?'mage':rank===9?'courtesan':rank===3?'harlequin':rank===2?'assassin':'inquisitor'});
const person=(id:string,role:Character):BloodBoundPlayer=>({id,nickname:id,sessionToken:id,socketId:null,connected:true,ready:true,roleConfirmed:false,clueConfirmed:false,character:role,tokens:[],equipment:gear()});
function game(roles:Character[]):BloodBoundRoom{const room=createRoom('TEST01','p0','p0',roles.length,99,'token');room.players=roles.map((role,index)=>person(`p${index}`,role));room.daggerHolderId='p0';room.phase='action';return room;}
function act(state:BloodBoundRoom,action:any){const result=reduce(state,action);expect('error'in result).toBe(false);return (result as any).state as BloodBoundRoom;}

describe('Blood Bound engine',()=>{
  it('sets up the correct character counts for every supported player count',()=>{
    for(const count of [6,7,8,9,10,11,12]){const room=createRoom('TEST'+count,'p0','p0',count,123,'x');room.players=Array.from({length:count},(_,i)=>person(`p${i}`,character('rose',1)));assignCharacters(room);expect(room.players).toHaveLength(count);expect(room.players.filter(p=>p.character?.clan==='secret')).toHaveLength(count%2);expect(room.players.filter(p=>p.character?.clan==='rose')).toHaveLength(Math.floor(count/2));}
  });
  it('reproduces the same deal and dagger from the same seed',()=>{
    const deal=(seed:number)=>{const room=createRoom('R','p0','p0',6,seed,'x');room.players=Array.from({length:6},(_,i)=>person(`p${i}`,character('rose',1)));assignCharacters(room);return [room.daggerHolderId,room.players.map(p=>`${p.character?.clan}:${p.character?.rank}`)];};expect(deal(444)).toEqual(deal(444));
  });
  it('allows duplicate affiliation slots but rejects a third token',()=>{
    let state=game([character('rose',1),character('beast',1),character('rose',2),character('beast',2),character('rose',3),character('beast',3)]);const target=state.players[0]!;target.character=character('rose',1);state.phase='token_select';state.pendingWound={targetId:'p0',sourceId:'p1'};state=act(state,{type:'TOKEN_SELECT',actorId:'p0',token:{kind:'affiliation',value:'rose'}});state.phase='token_select';state.pendingWound={targetId:'p0',sourceId:'p1'};state=act(state,{type:'TOKEN_SELECT',actorId:'p0',token:{kind:'affiliation',value:'rose'}});state.phase='token_select';state.pendingWound={targetId:'p0',sourceId:'p1'};expect(reduce(state,{type:'TOKEN_SELECT',actorId:'p0',token:{kind:'affiliation',value:'rose'}})).toEqual({error:'선택할 수 없는 토큰입니다.'});
  });
  it('rejects an ordinary attack against a Shield holder and permits their intervention',()=>{
    let state=game([character('rose',6),character('beast',2),character('rose',2),character('beast',3),character('rose',4),character('beast',4)]);state.players[1]!.equipment.shields.push('g');expect(reduce(state,{type:'ATTACK',actorId:'p0',targetId:'p1'})).toEqual({error:'Shield 보유자는 일반 공격 대상이 될 수 없습니다.'});state=act(state,{type:'ATTACK',actorId:'p0',targetId:'p2'});state=act(state,{type:'INTERVENE_OFFER',actorId:'p1'});state=act(state,{type:'INTERVENE_DECIDE',actorId:'p2',intervenerId:'p1'});expect(state.pendingWound?.targetId).toBe('p1');expect(state.pendingWound?.forceRank).toBe(true);
  });
  it('captures on a fourth wound without adding another token',()=>{
    let state=game([character('rose',2),character('beast',2),character('rose',3),character('beast',3),character('rose',4),character('beast',4)]);state.players[1]!.tokens=[{kind:'rank',value:2},{kind:'affiliation',value:'unknown'},{kind:'affiliation',value:'unknown'}];state=act(state,{type:'ATTACK',actorId:'p0',targetId:'p1'});state=act(state,{type:'INTERVENE_DECIDE',actorId:'p1'});expect(state.phase).toBe('result');expect(state.players[1]!.tokens).toHaveLength(3);expect(state.result?.capturedPlayer).toBe('p1');
  });
  it('changes a leader to the highest remaining rank after Quill',()=>{
    let state=game([character('rose',1),character('rose',5),character('rose',9),character('beast',2),character('beast',5),character('beast',8)]);expect(leaderId(state,'rose')).toBe('p0');state.phase='ability_decide';state.pendingAbility={actorId:'p0',ability:'elder',context:{}};state=act(state,{type:'ABILITY_DECIDE',actorId:'p0',use:true});expect(state.players[0]!.equipment.quill).toBe(true);expect(leaderId(state,'rose')).toBe('p2');
  });
  it('makes an Inquisitor capture an immediate Secret Order win',()=>{
    let state=game([character('rose',2),character('secret',null),character('beast',3),character('rose',4),character('beast',5),character('rose',6),character('beast',7)]);state.players[1]!.tokens=[{kind:'rank',value:'fleur'},{kind:'affiliation',value:'rose'},{kind:'affiliation',value:'unknown'}] as Token[];state=act(state,{type:'ATTACK',actorId:'p0',targetId:'p1'});state=act(state,{type:'INTERVENE_DECIDE',actorId:'p1'});expect(state.result?.winningClan).toBe('secret');expect(state.result?.inquisitorOverride).toBe(true);
  });
  it('does not project another player’s character or Harlequin knowledge',()=>{
    const state=game([character('rose',3),character('beast',1),character('rose',2),character('beast',4),character('rose',5),character('beast',6)]);state.harlequinViews.p0=['p1','p2'];const own=clientState(state,'p0'),other=clientState(state,'p3');expect(own.harlequinCards).toHaveLength(2);expect(other.harlequinCards).toHaveLength(0);expect((other as any).players[0].character).toBeUndefined();
  });
  it('resolves Assassin wounds one at a time and then transfers the dagger',()=>{
    let state=game([character('rose',2),character('beast',2),character('rose',3),character('beast',3),character('rose',4),character('beast',4)]);state.phase='ability_input';state.pendingAbility={actorId:'p0',ability:'assassin',context:{}};state=act(state,{type:'ABILITY_INPUT',actorId:'p0',kind:'assassin_target',targetIds:['p1']});state=act(state,{type:'TOKEN_SELECT',actorId:'p1',token:{kind:'rank',value:2}});state=act(state,{type:'ABILITY_DECIDE',actorId:'p1',use:false});expect(state.phase).toBe('token_select');state=act(state,{type:'TOKEN_SELECT',actorId:'p1',token:{kind:'affiliation',value:'unknown'}});expect(state.phase).toBe('action');expect(state.daggerHolderId).toBe('p1');
  });
  it('forces Mentalist rank exposure and Staff forces Unknown affiliation',()=>{
    let state=game([character('rose',5),character('beast',8),character('rose',3),character('beast',3),character('rose',4),character('beast',4)]);state.phase='ability_input';state.pendingAbility={actorId:'p0',ability:'mentalist',context:{}};state=act(state,{type:'ABILITY_INPUT',actorId:'p0',kind:'mentalist_target',targetIds:['p1']});expect(state.pendingWound?.forceRank).toBe(true);state=act(state,{type:'TOKEN_SELECT',actorId:'p1',token:{kind:'rank',value:8}});expect(state.phase).toBe('ability_decide');state=act(state,{type:'ABILITY_DECIDE',actorId:'p1',use:false});state.players[1]!.equipment.staffs=1;state.phase='token_select';state.pendingWound={targetId:'p1',sourceId:'p0'};expect(reduce(state,{type:'TOKEN_SELECT',actorId:'p1',token:{kind:'affiliation',value:'beast'}})).toEqual({error:'선택할 수 없는 토큰입니다.'});
  });
  it('skips intervention for a Fan holder and lets the Inquisitor steal a cursed win',()=>{
    let state=game([character('rose',2),character('beast',1),character('secret',null),character('rose',3),character('beast',4),character('rose',5),character('beast',6)]);state.players[1]!.equipment.fans=1;state=act(state,{type:'ATTACK',actorId:'p0',targetId:'p1'});expect(state.phase).toBe('intervention_decide');state=act(state,{type:'INTERVENE_DECIDE',actorId:'p1'});state.players[1]!.tokens=[{kind:'rank',value:1},{kind:'affiliation',value:'beast'},{kind:'affiliation',value:'beast'}];state.players[0]!.curse='true';state.phase='action';state.daggerHolderId='p0';state=act(state,{type:'ATTACK',actorId:'p0',targetId:'p1'});state=act(state,{type:'INTERVENE_DECIDE',actorId:'p1'});expect(state.result?.winningClan).toBe('secret');
  });
});
