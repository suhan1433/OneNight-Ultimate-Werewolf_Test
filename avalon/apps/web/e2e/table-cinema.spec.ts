import {expect,test,type Page} from '@playwright/test';
import type {ClientGameState} from '../../../packages/shared/src/types';

function game(phase:ClientGameState['phase']='team_build'):ClientGameState{
  return {roomCode:'FILM',playerId:'p0',hostId:'p0',maxPlayers:5,phase,stateVersion:1,
    players:Array.from({length:5},(_,i)=>({id:`p${i}`,nickname:`기사${i}`,ready:true,connected:true,isBot:false,isHost:i===0,hasVoted:false,hasQuestCard:false})),
    selfRole:'loyal',hasAssassinationAbility:false,roleIntel:[],options:{assassin:true,assassinationAbilityRole:null,percival:false,morgana:false,mordred:false,oberon:false,revealVoteIdentities:true},
    activeRoles:['merlin','assassin','loyal'],round:0,leaderId:'p0',rejectCount:0,results:[],roundHistory:[],roleConfirmedCount:5,continueConfirmedCount:0,hasContinued:false,
    questSize:2,proposedTeam:['p0','p1'],teamVotesCompleted:0,questCardsCompleted:0,chat:[]};
}
async function show(page:Page,state:ClientGameState){await page.evaluate(async state=>(await import('/avalon/src/store.ts')).useGame.getState().setGame(state),state);}
test.beforeEach(async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('avalon-intro-seen','1'));await page.goto('/avalon/');
  await expect(page.getByRole('button',{name:'음향 설정',exact:true})).toBeVisible();
  await page.evaluate(async()=>{
    const {socket}=await import('/avalon/src/socket.ts');socket.disconnect();(window as any).__commands=[];
    socket.emit=(event:string,...args:any[])=>{(window as any).__commands.push({event,data:args[0],at:performance.now()});return socket;};
  });
});
test('the oath scene never delays or duplicates a proposal',async({page})=>{
  await show(page,game());await page.locator('.cs-seat button').nth(0).click();await page.locator('.cs-seat button').nth(1).click();
  await expect(page.locator('.tc-oath')).toHaveCSS('pointer-events','none');
  const duration=await page.locator('.tc-oath').evaluate(el=>parseFloat(getComputedStyle(el).animationDuration));expect(duration).toBeLessThanOrEqual(2);
  await page.locator('.cs-propose').evaluate((el:HTMLButtonElement)=>{(window as any).__clickAt=performance.now();el.click();el.click();});
  const commands=await page.evaluate(()=>(window as any).__commands.filter((c:any)=>c.event==='TEAM_PROPOSE'));
  expect(commands).toHaveLength(1);expect(commands[0].at-await page.evaluate(()=>(window as any).__clickAt)).toBeLessThan(150);
});
test('the departure shot leaves quest choices usable and does not cover the screen',async({page})=>{
  await show(page,game('team_vote'));await show(page,game('quest'));
  await expect(page.locator('.phase-banner')).toHaveCount(0);await expect(page.locator('.tc-departure')).toHaveCSS('pointer-events','none');
  await expect(page.locator('.qcard.success')).toBeEnabled();
  await page.locator('.qcard.success').click();await page.locator('.qcard.success').click();
  expect(await page.evaluate(()=>(window as any).__commands.filter((c:any)=>c.event==='QUEST_CARD'))).toHaveLength(1);
});
for(const success of [false,true])test(`the ${success?'dawn':'shadow'} scene waits for the result without delaying play`,async({page})=>{
  const state=game('quest_result');state.questResult={success,fails:success?0:1};state.results=[success?'success':'fail'];await show(page,state);
  await expect(page.locator('.tc-reveal')).toHaveCount(1);await expect(page.locator('.tc-shadow,.tc-dawn')).toHaveCount(0);
  await page.locator('.tc-reveal').evaluate(el=>(window as any).__shot=el);
  state.continueConfirmedCount=1;await show(page,state);
  expect(await page.locator('.tc-reveal').evaluate(el=>(window as any).__shot===el)).toBe(true);
  const shot=page.locator(success?'.tc-dawn':'.tc-shadow');
  await expect(shot).toHaveCount(1,{timeout:7000});
  await expect(page.locator('.cs-qcard.fail')).toHaveCount(success?0:1);
  await expect(page.locator('.cs-quest-verdict .primary')).toBeEnabled({timeout:2000});
  const time=await shot.evaluate(el=>Number(el.getAnimations().find(a=>(a as CSSAnimation).animationName==='tcShot')?.currentTime));
  expect(time).toBeLessThan(1800);
  await page.locator('.cs-quest-verdict .primary').click();
  expect(await page.evaluate(()=>(window as any).__commands.filter((c:any)=>c.event==='QUEST_RESULT_CONTINUE'))).toHaveLength(1);
});
test('motion reduction removes the inserts while preserving decisions',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await show(page,game('quest'));
  await expect(page.locator('.table-cinema')).toHaveCSS('display','none');await expect(page.locator('.qcard.success')).toBeEnabled();
  expect(await page.locator('.table-cinema').evaluate(el=>el.getAnimations({subtree:true}).length)).toBe(0);
});
for(const width of [320,390,1440]){
  test(`film inserts stay inside the table and stop on their own at ${width}px`,async({page})=>{
    await page.setViewportSize({width,height:844});await show(page,game('quest'));
    const film=page.locator('.table-cinema'),table=page.locator('.cs-altar-camera');
    const f=(await film.boundingBox())!,t=(await table.boundingBox())!;
    expect(f.x).toBeGreaterThanOrEqual(t.x);expect(f.x+f.width).toBeLessThanOrEqual(t.x+t.width);
    expect(f.y).toBeGreaterThanOrEqual(t.y);expect(f.y+f.height).toBeLessThanOrEqual(t.y+t.height);
    await expect(film).toHaveCSS('opacity','0',{timeout:3500});await expect(page.locator('.qcard.success')).toBeEnabled();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });
}
