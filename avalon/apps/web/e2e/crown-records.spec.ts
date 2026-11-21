import {expect,test,type Page} from '@playwright/test';
import type {ClientGameState} from '../../../packages/shared/src/types';

function game(phase:ClientGameState['phase']='team_vote'):ClientGameState{
  return {roomCode:'CROWN',playerId:'p0',hostId:'p0',maxPlayers:10,phase,stateVersion:1,
    players:Array.from({length:10},(_,i)=>({id:`p${i}`,nickname:`원탁기사${i}`,ready:true,connected:true,isBot:false,isHost:i===0,hasVoted:phase==='vote_result',hasQuestCard:false})),
    selfRole:'loyal',hasAssassinationAbility:false,roleIntel:[],options:{assassin:true,assassinationAbilityRole:null,percival:false,morgana:false,mordred:false,oberon:false,revealVoteIdentities:true},
    activeRoles:['merlin','assassin','loyal'],round:0,leaderId:'p3',rejectCount:1,results:[],roundHistory:[],roleConfirmedCount:10,continueConfirmedCount:0,hasContinued:false,
    questSize:5,proposedTeam:['p1','p3','p5','p7','p9'],teamVotesCompleted:phase==='vote_result'?10:0,questCardsCompleted:0,chat:[]};
}
async function show(page:Page,state:ClientGameState){await page.evaluate(async state=>(await import('/avalon/src/store.ts')).useGame.getState().setGame(state),state);}
async function expectAnchor(page:Page,index:number){
  await expect.poll(async()=>page.evaluate(index=>{
    const crown=document.querySelector('.vote-crown')!.getBoundingClientRect(),seat=document.querySelectorAll('.vt-seat')[index]!.getBoundingClientRect();
    return Math.abs(crown.x+crown.width/2-seat.x-seat.width/2);
  },index)).toBeLessThan(1);
  await expect.poll(async()=>page.evaluate(index=>{
    const crown=document.querySelector('.vote-crown')!.getBoundingClientRect(),seat=document.querySelectorAll('.vt-seat')[index]!.getBoundingClientRect();
    return seat.y-crown.bottom;
  },index)).toBeGreaterThanOrEqual(.5);
  await expect.poll(async()=>page.evaluate(index=>{
    const crown=document.querySelector('.vote-crown')!.getBoundingClientRect(),seat=document.querySelectorAll('.vt-seat')[index]!.getBoundingClientRect();
    return seat.y-crown.bottom;
  },index)).toBeLessThan(4);
}
test.beforeEach(async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('avalon-intro-seen','1'));
  await page.goto('/avalon/');await expect(page.getByRole('button',{name:'음향 설정',exact:true})).toBeVisible();
  await page.evaluate(async()=>{await document.fonts.ready;const {socket}=await import('/avalon/src/socket.ts');socket.disconnect();socket.emit=(...args:any[])=>socket;});
});
for(const leader of [3,9]){
  test(`one crown travels from actual leader ${leader} to the next seat`,async({page})=>{
    const state=game('vote_result');state.leaderId=`p${leader}`;state.voteResult={approve:4,reject:6,passed:false};
    await show(page,state);await expect(page.locator('.vote-crown')).toHaveCount(1);await page.waitForTimeout(250);
    await expect(page.locator('.vote-crown')).toHaveAttribute('data-from',`p${leader}`);
    await expect(page.locator('.vote-crown')).toHaveAttribute('data-to',`p${(leader+1)%10}`);
    await page.locator('.vote-crown').evaluate(el=>{const animation=el.getAnimations().find(a=>a.id==='crown-pass')!;animation.pause();animation.currentTime=0;});
    await expectAnchor(page,leader);
    await page.locator('.vote-crown').evaluate(el=>{const a=el.getAnimations().find(a=>a.id==='crown-pass')!,timing=a.effect!.getTiming();a.currentTime=timing.delay+Number(timing.duration)/2;});
    await expect(page.locator('.leader-crown,.vt-crown')).toHaveCount(1);
    await page.locator('.vote-crown').evaluate(async el=>{const a=el.getAnimations().find(a=>a.id==='crown-pass')!;a.finish();await a.finished;});
    await expect(page.locator('.vote-crown')).toHaveAttribute('data-state','arrived');await expectAnchor(page,(leader+1)%10);
    state.continueConfirmedCount=1;await show(page,state);await expect(page.locator('.vote-crown')).toHaveAttribute('data-state','arrived');
    state.phase='team_build';state.leaderId=`p${(leader+1)%10}`;await show(page,state);
    await expect(page.locator('.vote-crown')).toHaveCount(0);await expect(page.locator('.cs-seat.leader')).toContainText(`원탁기사${(leader+1)%10}`);
  });
}
test('approved proposals keep the single crown on their leader',async({page})=>{
  const state=game('vote_result');state.voteResult={approve:7,reject:3,passed:true};await show(page,state);await page.waitForTimeout(200);
  await expectAnchor(page,3);expect(await page.locator('.vote-crown').evaluate(el=>el.getAnimations().some(a=>a.id==='crown-pass'))).toBe(false);
});
test('reduced motion places the crown directly over the next leader',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});const state=game('vote_result');state.voteResult={approve:4,reject:6,passed:false};await show(page,state);
  await expect(page.locator('.vote-crown')).toHaveAttribute('data-state','arrived');await expectAnchor(page,4);
});
test('quest information unfolds its members, vote evidence and card counts',async({page})=>{
  const state=game('team_build');state.roundHistory=[{round:0,leaderId:'p3',team:state.proposedTeam,approveCount:6,rejectCount:4,success:false,fails:2}];state.results=['fail'];
  await show(page,state);await page.locator('.game-status .round-history-item button').first().click();
  await expect(page.locator('.round-detail')).toHaveCSS('animation-name','questDossierOpen');
  await expect(page.locator('.round-detail .member-chips>span')).toHaveCount(5);
  await expect(page.locator('.round-detail')).toContainText('원정 실패');await expect(page.locator('.round-detail .quest-card-count')).toContainText('실패 2');
});
for(const width of [320,390,1440]){
  test(`the final chronicle fits its round cards at ${width}px`,async({page})=>{
    await page.setViewportSize({width,height:900});await page.emulateMedia({reducedMotion:'reduce'});
    const state=game('result');state.winner='evil';state.winReason='원정 3회가 실패했습니다.';state.round=4;state.results=['fail','success','fail','success','fail'];
    state.roundHistory=state.results.map((outcome,round)=>({round,leaderId:`p${round}`,team:state.proposedTeam,approveCount:6,rejectCount:4,success:outcome==='success',fails:outcome==='success'?0:2}));
    state.revealedRoles=state.players.map((player,i)=>({id:player.id,role:i===0?'merlin':i===1?'assassin':'loyal',hasAssassinationAbility:i===1}));
    await show(page,state);const chronicle=page.getByRole('region',{name:'원탁에 남겨진 기록',exact:true});
    await expect(chronicle.locator('.chronicle-entry')).toHaveCount(5);await expect(chronicle.locator('.round-track-slot')).toHaveCount(5);
    await expect(chronicle.locator('.chronicle-heading')).toContainText('완료된 원정 5회');await expect(chronicle.locator('.chronicle-leader').first()).toContainText('원탁기사0');
    for(const entry of await chronicle.locator('.chronicle-entry').all()){
      const box=(await entry.boundingBox())!;expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(width);
      for(const field of await entry.locator('.chronicle-members>li,.chronicle-metrics').all()){
        const child=(await field.boundingBox())!;expect(child.x).toBeGreaterThanOrEqual(box.x);expect(child.x+child.width).toBeLessThanOrEqual(box.x+box.width);
      }
    }
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });
}

test('the fifth rejection keeps its crown because there is no next proposal',async({page})=>{
  const state=game('vote_result');state.rejectCount=4;state.voteResult={approve:4,reject:6,passed:false};await show(page,state);
  await expectAnchor(page,3);await expect(page.locator('.vote-crown')).not.toHaveAttribute('data-to',/./);
  expect(await page.locator('.vote-crown').evaluate(el=>el.getAnimations().some(a=>a.id==='crown-pass'))).toBe(false);
  await expect(page.locator('.next-leader-note')).toContainText('원정대 구성 종료');
});
