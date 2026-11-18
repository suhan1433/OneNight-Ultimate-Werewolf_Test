import {expect,test,type Page} from '@playwright/test';
import type {ClientGameState} from '../../../packages/shared/src/types';

function council(phase:ClientGameState['phase']='team_build',count=5):ClientGameState{
  return {
    roomCode:'CRESTS',playerId:'p0',hostId:'p0',maxPlayers:count,phase,stateVersion:1,
    players:Array.from({length:count},(_,i)=>({id:`p${i}`,nickname:`기사${i+1}`,avatar:i===0?'lion':i===1?'wolf':undefined,ready:true,connected:true,isBot:false,isHost:i===0,hasVoted:false,hasQuestCard:false})),
    selfRole:'loyal',hasAssassinationAbility:false,roleIntel:[],
    options:{assassin:true,assassinationAbilityRole:null,percival:false,morgana:false,mordred:false,oberon:false,revealVoteIdentities:false},
    activeRoles:['merlin','assassin','loyal'],round:0,leaderId:'p0',rejectCount:0,
    results:[],roundHistory:[],roleConfirmedCount:count,continueConfirmedCount:0,hasContinued:false,
    questSize:2,proposedTeam:['p0','p1'],teamVotesCompleted:0,questCardsCompleted:0,chat:[],
  };
}
async function show(page:Page,state:ClientGameState){
  await page.evaluate(async state=>{
    const path='/avalon/src/store.ts';
    (await import(path)).useGame.getState().setGame(state);
  },state);
}
test.beforeEach(async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('avalon-intro-seen','1'));
  await page.goto('/avalon/');
  await expect(page.getByRole('button',{name:'음향 설정',exact:true})).toBeVisible();
  await page.evaluate(async()=>{
    const path='/avalon/src/socket.ts';const {socket}=await import(path);
    socket.disconnect();
    (window as any).__commands=[];
    socket.emit=(event:string,...args:any[])=>{
      (window as any).__commands.push({event,data:args[0]});
      if(typeof args[1]==='function')args[1]({ok:true});
      return socket;
    };
  });
});

test('house choice is saved and appears in the public seat without exposing a role',async({page})=>{
  await show(page,council('lobby'));
  await page.locator('.lb-seat.me').click();
  const dialog=page.getByRole('dialog',{name:'가문 문장 선택',exact:true});
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('radio',{name:'늑대 가문 (사용 중)',exact:true})).toBeDisabled();
  await dialog.getByRole('radio',{name:'용 가문',exact:true}).click();
  await dialog.getByRole('button',{name:'저장',exact:true}).click();
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(()=>localStorage.getItem('avalon-profile-avatar'))).toBe('dragon');
  await expect(page.locator('.lb-seat.me .house-crest')).toHaveCount(1);
  expect(await page.evaluate(()=>(window as any).__commands.some((c:any)=>c.event==='PROFILE_UPDATE'&&c.data.avatar==='dragon'))).toBe(true);
  expect((await page.locator('.lb-seat').allTextContents()).join(' ')).not.toContain('충성스러운 신하');
});

for(const width of [320,390,768,1440]){
  test(`ten knights retain their seats across team, vote and quest at ${width}px`,async({page})=>{
    await page.setViewportSize({width,height:900});
    const positions:number[][]=[];
    for(const phase of ['team_build','team_vote','quest'] as const){
      await show(page,council(phase,10));
      const seats=page.locator(phase==='team_build'?'.cs-team .cs-seat':phase==='team_vote'?'.vt-seat':'.quest-witness');
      await expect(seats).toHaveCount(10);
      const layout=await seats.evaluateAll(nodes=>nodes.map(n=>{
        const el=n as HTMLElement,b=el.getBoundingClientRect();
        return {left:parseFloat(el.style.left),top:parseFloat(el.style.top),x:b.x,right:b.right};
      }));
      positions.push(layout.flatMap(p=>[p.left,p.top]));
      for(const seat of layout){expect(seat.x).toBeGreaterThanOrEqual(-1);expect(seat.right).toBeLessThanOrEqual(width+1);}
      expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    }
    for(let i=1;i<positions.length;i++)for(let j=0;j<positions[0].length;j++)expect(positions[i][j]).toBeCloseTo(positions[0][j],4);
    if(width<=390){
      const action=page.locator('.quest-actions');
      const box=await action.boundingBox();
      expect(box!.y+box!.height).toBeLessThanOrEqual(901);
      await page.locator('.qcard.success').click();
      await expect(action.getByRole('button')).toBeEnabled();
    }
  });
}

test('quest outcome is hidden in the public history until the reveal is resolved',async({page})=>{
  const state=council('quest_result');state.results=['fail'];
  state.questResult={success:false,fails:1};
  state.roundHistory=[{round:0,leaderId:'p0',team:['p0','p1'],approveCount:3,rejectCount:2,success:false,fails:1}];
  await show(page,state);
  const round=page.locator('.round-history-item').first();
  await expect(round).toContainText('진행 중');
  await page.getByRole('button',{name:'결과 바로 보기',exact:true}).click();
  await expect(round).toContainText('실패');
  await expect(page.locator('.cs-quest-verdict')).toContainText('실패 카드 1장');
});

test('reduced motion keeps results and the continue action available',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  const state=council('quest_result');state.results=['success'];state.questResult={success:true,fails:0};
  await show(page,state);
  await expect(page.locator('.cs-quest-verdict .primary')).toBeEnabled();
  await expect(page.locator('.cs-quest-verdict')).toContainText('원정 성공');
});
