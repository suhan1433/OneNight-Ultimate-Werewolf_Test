import { describe, expect, it } from 'vitest';
import type { Player, RoleType, Room } from '@werewolf/shared';
import { advanceNight, applyNightAction, assignRoles, buildNightActionQueue, calculateResult, calculateVotes, determineExecutions, shuffleRoles, startCurrentAction, startNightIntro, validateNightAction } from './engine.js';

const player = (id: string, role: RoleType = 'villager'): Player => ({ id, nickname: id, sessionToken: id, socketId: id, originalRole: role, currentRole: role, isReady: true, hasConfirmedCard: true, hasActedTonight: false, vote: null, connected: true });
const room = (players: Player[], votes: Record<string,string> = {}): Room => ({ roomCode:'ABC234',hostId:players[0]!.id,maxPlayers:players.length,players,selectedRoles:[],centerCards:[],phase:'voting',nightActionQueue:[],currentNightActionIndex:0,actionTimeLimitSeconds:5,dayTimeLimitSeconds:300,ttsEnabled:true,nightLog:[],votes,processedRequestIds:[],chat:[],publicReveals:[],privateResults:{},protectedPlayerId:null,dayExpiresAt:null,result:null,createdAt:0,updatedAt:0 });
const actionRoom = (role: RoleType, players: Player[]): Room => ({ ...room(players), phase:'night', centerCards:[{id:'center-0',role:'tanner',originalRole:'tanner'},{id:'center-1',role:'villager',originalRole:'villager'},{id:'center-2',role:'seer',originalRole:'seer'}], nightActionQueue:[{id:'action',role,playerIds:[players[0]!.id],actedPlayerIds:[],order:1,startedAt:0,expiresAt:9_999,status:'active'}] });

describe('role assignment', () => {
  it.each([3,5,10])('%i players require player count + 3 cards', (count) => { const ps=Array.from({length:count},(_,i)=>player(String(i))); const roles=Array.from({length:count+3},()=> 'villager' as RoleType); const result=assignRoles(ps,roles,()=>.5); expect(result.players).toHaveLength(count); expect(result.centerCards).toHaveLength(3); });
  it('rejects a malformed deck',()=>expect(()=>assignRoles([player('a')],['villager'])).toThrow());
  it('does not mutate input while shuffling',()=>{const source=[1,2,3];expect(shuffleRoles(source,()=>.2)).not.toBe(source);expect(source).toEqual([1,2,3])});
});
describe('night queue',()=>{
  it('uses canonical order and includes roles with no owner',()=>{const q=buildNightActionQueue(['seer','mason','werewolf','shield_bearer','doppelganger','drunk','villager'],[player('a','seer')]);expect(q.map(x=>x.role)).toEqual(['shield_bearer','doppelganger','werewolf','mason','seer','drunk']);expect(q[0]!.playerIds).toEqual([])});
  it('gives an unassigned selected role the full configured action time',()=>{let r=room([player('a','seer'),player('b'),player('c')]);r.phase='night';r.actionTimeLimitSeconds=10;r.nightActionQueue=buildNightActionQueue(['werewolf','seer','villager','villager','villager','drunk'],r.players);r=startCurrentAction(r,1_000);expect(r.nightActionQueue[0]!.playerIds).toEqual([]);expect(r.nightActionQueue[0]!.expiresAt).toBe(11_000)});
  it('holds the first action until the night-start narration completes',()=>{let r=room([player('a','seer')]);r.phase='night';r.nightActionQueue=buildNightActionQueue(['seer'],r.players);r=startNightIntro(r,1_000);expect(r.nightActionQueue[0]).toMatchObject({status:'pending',startedAt:1_000,expiresAt:5_300});r=startCurrentAction(r,5_300);expect(r.nightActionQueue[0]).toMatchObject({status:'active',startedAt:5_300,expiresAt:10_300});});
  it('times out into the next action',()=>{let r=room([player('a','seer')]);r.phase='night';r.nightActionQueue=buildNightActionQueue(['seer','drunk'],r.players);r=startCurrentAction(r,100);expect(r.nightActionQueue[0]!.expiresAt).toBe(5100);r=advanceNight(r,'timeout',5100);expect(r.currentNightActionIndex).toBe(1);expect(r.nightActionQueue[1]!.status).toBe('active')});
});
describe('voting',()=>{
  it('executes all tied leaders',()=>expect(determineExecutions({a:2,b:2,c:1})).toEqual(['a','b']));
  it('executes nobody when maximum is one',()=>expect(determineExecutions({a:1,b:1,c:1})).toEqual([]));
  it('bodyguard makes every vote for its target zero',()=>{const r=room([player('a','bodyguard'),player('b'),player('c')],{a:'b',c:'b',b:'c'});expect(calculateVotes(r).b).toBe(0)});
  it('prince receives zero votes',()=>{const r=room([player('a'),player('b','prince'),player('c')],{a:'b',c:'b',b:'a'});expect(calculateVotes(r).b).toBe(0)});
  it('hunter takes their vote target with them',()=>{const r=room([player('a','hunter'),player('b','werewolf'),player('c')],{a:'b',b:'a',c:'a'});const result=calculateResult(r);expect(result.executedIds).toEqual(expect.arrayContaining(['a','b']));expect(result.winners).toContain('village')});
});
describe('victory',()=>{
  it('village wins when a wolf dies',()=>{const r=room([player('a','werewolf'),player('b'),player('c')],{a:'b',b:'a',c:'a'});expect(calculateResult(r).winners).toContain('village')});
  it('wolves win when no wolf dies',()=>{const r=room([player('a','werewolf'),player('b'),player('c')],{a:'b',b:'c',c:'b'});expect(calculateResult(r).winners).toContain('werewolf')});
  it('village wins with no wolves and no execution',()=>{const r=room([player('a'),player('b'),player('c')],{a:'b',b:'c',c:'a'});expect(calculateResult(r).winners).toContain('village')});
  it('tanner can share a village win',()=>{const r=room([player('a','werewolf'),player('b','tanner'),player('c'),player('d')],{a:'b',b:'a',c:'a',d:'b'});expect(calculateResult(r).winners).toEqual(expect.arrayContaining(['village','tanner']))});
  it('a cursed player becomes a wolf when voted by one',()=>{const r=room([player('a','werewolf'),player('b','cursed'),player('c')],{a:'b',b:'a',c:'a'});expect(calculateResult(r).players.find(p=>p.id==='b')!.currentRole).toBe('werewolf')});
});
describe('night actions',()=>{
  it('shows minion only teammate nicknames without internal ids or roles',()=>{const r=actionRoom('minion',[player('minion','minion'),player('수한2','werewolf'),player('수한3','werewolf')]);const result=applyNightAction(r,'minion',{type:'confirm'}).result;expect(result).toMatchObject({kind:'people',title:'늑대인간'});expect(result.people).toEqual([{nickname:'수한2'},{nickname:'수한3'}]);expect(JSON.stringify(result)).not.toContain('role')});
  it('seer reveals only the selected card and never swaps it',()=>{const r=actionRoom('seer',[player('seer','seer'),player('민수','robber'),player('영희','tanner')]);const next=applyNightAction(r,'seer',{type:'inspect_player',targetPlayerIds:['민수']});expect(next.result).toMatchObject({kind:'cards',cards:[{label:'민수',role:'robber'}]});expect(next.room.players[1]!.currentRole).toBe('robber')});
  it('robber swaps both cards and privately receives both new card identities',()=>{const r=actionRoom('robber',[player('도둑','robber'),player('철수','seer'),player('영희')]);const next=applyNightAction(r,'도둑',{type:'swap_player',targetPlayerIds:['철수']});expect(next.room.players.map(p=>p.currentRole)).toEqual(['seer','robber','villager']);expect(next.result).toMatchObject({kind:'robber_swap',targetNickname:'철수',myNewRole:'seer',targetNewRole:'robber'});});
  it('troublemaker swaps the two targets but keeps their roles secret in its result',()=>{const r=actionRoom('troublemaker',[player('말썽','troublemaker'),player('수한2','werewolf'),player('수한3','seer')]);const next=applyNightAction(r,'말썽',{type:'swap_players',targetPlayerIds:['수한2','수한3']});expect(next.room.players.slice(1).map(p=>p.currentRole)).toEqual(['seer','werewolf']);expect(next.result).toEqual({kind:'troublemaker_swap',firstNickname:'수한2',secondNickname:'수한3'});});
  it('witch first sees a center card, then swaps it with the chosen player',()=>{const r=actionRoom('witch',[player('마법사','witch'),player('철수','robber'),player('영희')]);expect(validateNightAction(r,'마법사','action',{type:'inspect_center',centerIndexes:[0]})).toBeNull();expect(validateNightAction(r,'마법사','action',{type:'swap_center',targetPlayerIds:['철수'],centerIndexes:[0]})).toContain('확인한 센터 카드만');const seen=applyNightAction(r,'마법사',{type:'inspect_center',centerIndexes:[0]});expect(seen.result).toEqual({kind:'witch_seen',centerIndex:0,seenRole:'tanner'});expect(seen.room.nightActionQueue[0]!.actedPlayerIds).toEqual([]);seen.room.privateResults['마법사']=seen.result;expect(validateNightAction(seen.room,'마법사','action',{type:'swap_center',targetPlayerIds:['철수'],centerIndexes:[0]})).toBeNull();const next=applyNightAction(seen.room,'마법사',{type:'swap_center',targetPlayerIds:['철수'],centerIndexes:[0]});expect(next.room.centerCards[0]!.role).toBe('robber');expect(next.room.players[1]!.currentRole).toBe('tanner');expect(next.result).toMatchObject({kind:'witch_swap',seenRole:'tanner',targetNickname:'철수'});});
  it('drunk swaps their card with the selected center card without revealing it',()=>{const r=actionRoom('drunk',[player('주정','drunk'),player('철수'),player('영희')]);const next=applyNightAction(r,'주정',{type:'swap_center',centerIndexes:[1]});expect(next.room.players[0]!.currentRole).toBe('villager');expect(next.room.centerCards[1]!.role).toBe('drunk');expect(next.result).toEqual({kind:'drunk_swap',centerIndex:2});});
  it('doppelganger copies the target role and creates an immediate follow-up action',()=>{const r=actionRoom('doppelganger',[player('도플','doppelganger'),player('철수','seer'),player('영희')]);const next=applyNightAction(r,'도플',{type:'inspect_player',targetPlayerIds:['철수']});expect(next.room.players[0]!.currentRole).toBe('seer');expect(next.room.nightActionQueue).toHaveLength(2);expect(next.result).toMatchObject({kind:'copied',targetNickname:'철수',role:'seer'});});
  it('werewolf, minion, apprentice tanner, and mason expose only the relevant people',()=>{
    const wolf=applyNightAction(actionRoom('werewolf',[player('늑대1','werewolf'),player('늑대2','werewolf'),player('하수인','minion')]),'늑대1',{type:'confirm'}).result;
    const apprentice=applyNightAction(actionRoom('apprentice_tanner',[player('견습','apprentice_tanner'),player('무두','tanner'),player('영희')]),'견습',{type:'confirm'}).result;
    const mason=applyNightAction(actionRoom('mason',[player('메이슨1','mason'),player('메이슨2','mason'),player('영희')]),'메이슨1',{type:'confirm'}).result;
    expect(wolf).toMatchObject({kind:'people',people:[{nickname:'늑대2'}]});
    expect(apprentice).toMatchObject({kind:'people',people:[{nickname:'무두'}]});
    expect(mason).toMatchObject({kind:'people',title:'다른 프리메이슨',people:[{nickname:'메이슨2'}]});
  });
  it('alpha wolf, mystic wolf, apprentice seer, journalist, and insomniac use their intended card effects',()=>{
    const alpha=applyNightAction(actionRoom('alpha_wolf',[player('대장','alpha_wolf'),player('철수','seer'),player('영희')]),'대장',{type:'swap_player',targetPlayerIds:['철수']});
    const mystic=applyNightAction(actionRoom('mystic_wolf',[player('신비','mystic_wolf'),player('철수','robber'),player('영희')]),'신비',{type:'inspect_player',targetPlayerIds:['철수']});
    const apprentice=applyNightAction(actionRoom('apprentice_seer',[player('견습','apprentice_seer'),player('철수'),player('영희')]),'견습',{type:'inspect_center',centerIndexes:[2]});
    const journalist=applyNightAction(actionRoom('journalist',[player('기자','journalist'),player('철수','villager'),player('영희')]),'기자',{type:'inspect_player',targetPlayerIds:['철수']});
    const insomniac=applyNightAction(actionRoom('insomniac',[player('불면','insomniac'),player('철수'),player('영희')]),'불면',{type:'confirm'});
    expect(alpha.room.players[1]!.currentRole).toBe('werewolf'); expect(alpha.result).toMatchObject({kind:'alpha_swap',targetNickname:'철수'});
    expect(mystic.result).toMatchObject({kind:'cards',cards:[{label:'철수',role:'robber'}]});
    expect(apprentice.result).toMatchObject({kind:'cards',cards:[{label:'센터 카드 3',role:'seer'}]});
    expect(journalist.room.publicReveals).toEqual(['철수님은 마을 진영입니다.']);
    expect(insomniac.result).toMatchObject({kind:'cards',cards:[{label:'내 카드',role:'insomniac'}]});
  });
  it('rejects attempting to inspect or exchange a shielded player',()=>{const r=actionRoom('seer',[player('예언자','seer'),player('보호','robber'),player('영희')]);r.protectedPlayerId='보호';expect(validateNightAction(r,'예언자','action',{type:'inspect_player',targetPlayerIds:['보호']})).toContain('방패병');});
});
