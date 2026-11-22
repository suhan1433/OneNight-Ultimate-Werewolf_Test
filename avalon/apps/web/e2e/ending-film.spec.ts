import {expect,test,type Page} from '@playwright/test';
import type {ClientGameState} from '../../../packages/shared/src/types';
function game(count=5):ClientGameState{return {roomCode:'BLADE',playerId:'p0',hostId:'p0',maxPlayers:count,phase:'assassination',stateVersion:1,players:Array.from({length:count},(_,i)=>({id:`p${i}`,nickname:`기사${i}`,ready:true,connected:true,isBot:false,isHost:i===0,hasVoted:false,hasQuestCard:false})),selfRole:'assassin',hasAssassinationAbility:true,roleIntel:[],options:{assassin:true,assassinationAbilityRole:null,percival:false,morgana:false,mordred:false,oberon:false,revealVoteIdentities:true},activeRoles:['merlin','assassin','loyal'],round:2,leaderId:'p0',rejectCount:0,results:['success','success','success'],roundHistory:[],roleConfirmedCount:count,continueConfirmedCount:0,hasContinued:false,questSize:2,proposedTeam:['p0','p1'],teamVotesCompleted:0,questCardsCompleted:0,chat:[]};}
async function show(page:Page,state:ClientGameState){await page.evaluate(async state=>(await import('/avalon/src/store.ts')).useGame.getState().setGame(state),state);}
function result(hit:boolean,count=5){const state=game(count);state.phase='result';state.assassinTarget=hit?'p2':'p3';state.winner=hit?'evil':'good';state.winReason=hit?'멀린을 찾아냈습니다.':'멀린이 살아남았습니다.';state.revealedRoles=state.players.map((player,i)=>({id:player.id,role:i===0?'assassin':i===2?'merlin':'loyal',hasAssassinationAbility:i===0}));return state;}
for(const winner of ['good','evil'] as const)for(const width of [320,390,1440])test(`${winner} ending fits ${width}px and reveals every identity`,async({page})=>{
  await page.setViewportSize({width,height:900});await page.emulateMedia({reducedMotion:'reduce'});
  await page.addInitScript(()=>localStorage.setItem('avalon-intro-seen','1'));await page.goto('/avalon/');
  await page.evaluate(async()=>(await import('/avalon/src/socket.ts')).socket.disconnect());
  const state=result(winner==='evil',10);delete state.assassinTarget;await show(page,state);
  await expect(page.locator('.cs-ending-title h1')).toHaveText(winner==='good'?'선의 승리':'악의 승리');
  await expect(page.locator('.cs-identity')).toHaveCount(10);await expect(page.locator('.ending-role-name')).toHaveCount(10);
  for(const name of await page.locator('.cs-identity-player').all())await expect(name).toBeVisible();
  await expect(page.getByRole('button',{name:'새 게임 시작'})).toBeEnabled();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);
});
test('all failed expeditions use the same shadow effect without ravens',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await page.addInitScript(()=>localStorage.setItem('avalon-intro-seen','1'));await page.goto('/avalon/');
  await page.evaluate(async()=>(await import('/avalon/src/socket.ts')).socket.disconnect());
  for(let round=0;round<5;round++){
    const state=game();state.phase='quest_result';state.round=round;state.questResult={success:false,fails:1};state.results=['fail'];await show(page,state);
    await expect(page.locator('.tc-failure-shadow')).toHaveCount(1);await expect(page.locator('.tc-raven-overlay')).toHaveCount(0);await expect(page.locator('.quest-table-verdict strong')).toHaveText('원정 실패');
  }
});
