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
      if(typeof args[1]==='function')args[1](null,{ok:true});
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
      if(width<=640){
        const crown=page.locator(phase==='team_build'?'.cs-crown':phase==='team_vote'?'.leader-crown':'.witness-crown');
        const ribbon=(await page.locator('.phase-ribbon').boundingBox())!;
        await expect.poll(async()=>(await crown.boundingBox())!.y).toBeGreaterThanOrEqual(ribbon.y+ribbon.height+4);
      }
      expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    }
    for(let i=1;i<positions.length;i++)for(let j=0;j<positions[0].length;j++)expect(positions[i][j]).toBeCloseTo(positions[0][j],4);
    await expect(page.locator('.expedition-roster')).toContainText('기사1');
    await expect(page.locator('.expedition-roster')).toContainText('기사2');
    await expect(page.locator('.quest-actions')).toHaveCount(0);
    await page.locator('.qcard.success').click();
    await expect(page.locator('.qcard.success')).toHaveAttribute('aria-pressed','true');
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


test('vote cards submit on the second tap and allow switching before submission',async({page})=>{
  await show(page,council('team_vote'));
  const approve=page.locator('.vote-stage .approve'),reject=page.locator('.vote-stage .reject');
  await approve.tap();
  expect(await page.evaluate(()=>(window as any).__commands.filter((c:any)=>c.event==='TEAM_VOTE'))).toHaveLength(0);
  await reject.tap();
  await expect(reject).toHaveAttribute('aria-pressed','true');
  await reject.tap();
  expect(await page.evaluate(()=>(window as any).__commands.filter((c:any)=>c.event==='TEAM_VOTE'))).toEqual([{event:'TEAM_VOTE',data:{roomCode:'CRESTS',approve:false}}]);
  await expect(page.locator('.vote-stage .seal-btn')).toHaveCount(0);
});

test('quest cards submit once on two taps and good players cannot submit failure',async({page})=>{
  await show(page,council('quest'));
  await expect(page.locator('.qcard.fail')).toBeDisabled();
  await page.locator('.qcard.success').tap();
  expect(await page.evaluate(()=>(window as any).__commands.filter((c:any)=>c.event==='QUEST_CARD'))).toHaveLength(0);
  await page.locator('.qcard.success').tap();
  await expect(page.locator('.quest-stage')).toContainText('제출 중');
  expect(await page.evaluate(()=>(window as any).__commands.filter((c:any)=>c.event==='QUEST_CARD'))).toEqual([{event:'QUEST_CARD',data:{roomCode:'CRESTS',card:'success'}}]);
});

for(const width of [320,390,768,1440]){
  test(`five quest result cards fit in their dedicated stage at ${width}px`,async({page})=>{
    await page.setViewportSize({width,height:900});
    await page.emulateMedia({reducedMotion:'reduce'});
    const state=council('quest_result',10);state.questSize=5;state.proposedTeam=['p0','p1','p2','p3','p4'];state.questResult={success:false,fails:2};state.results=['fail'];
    await show(page,state);
    await expect(page.locator('.cs-quest-verdict')).toContainText('성공 카드 3장');
    await expect(page.locator('.cs-quest-verdict')).toContainText('실패 카드 2장');
    const stage=(await page.locator('.cs-altar-camera').boundingBox())!;
    for(const card of await page.locator('.cs-qcard').all()){
      const box=(await card.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(stage.x);
      expect(box.x+box.width).toBeLessThanOrEqual(stage.x+stage.width);
      expect(box.y).toBeGreaterThanOrEqual(stage.y);
      expect(box.y+box.height).toBeLessThanOrEqual(stage.y+stage.height);
    }
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });
}


for(const viewport of [{width:375,height:667},{width:390,height:844},{width:430,height:932}]){
  for(const phase of ['team_build','team_vote','quest','vote_result','quest_result'] as const){
    test(`${phase} fits above the mobile chat dock at ${viewport.width}x${viewport.height}`,async({page})=>{
      await page.setViewportSize(viewport);
      await page.emulateMedia({reducedMotion:'reduce'});
      const state=council(phase,10);state.questSize=5;state.proposedTeam=['p0','p1','p2','p3','p4'];
      state.players.forEach(p=>p.nickname=`기사${p.id.slice(1)}`);
      if(phase==='vote_result')state.voteResult={approve:6,reject:4,passed:true};
      if(phase==='quest_result'){state.questResult={success:false,fails:2};state.results=['fail'];}
      await show(page,state);
      const target=page.locator(phase==='team_build'?'.cs-propose':phase==='team_vote'?'.vote-stage':phase==='quest'?'.quest-stage':phase==='vote_result'?'.vt-continue':'.cs-quest-verdict .primary');
      const box=(await target.boundingBox())!;
      expect(box.y).toBeGreaterThanOrEqual(0);
      const dock=page.locator('.chat-panel .ac-compose');
      const visibleBottom=await dock.count()?(await dock.boundingBox())!.y:viewport.height;
      expect(box.y+box.height).toBeLessThanOrEqual(visibleBottom);
      expect(await page.evaluate(()=>window.scrollY)).toBe(0);
      const table=page.locator(phase.includes('vote')?'.vt-wrap':phase==='team_build'?'.cs-camera':'.cs-altar-camera');
      const tableBox=(await table.boundingBox())!,roster=(await page.locator('.expedition-roster').boundingBox())!;
      expect(roster.y).toBeGreaterThanOrEqual(tableBox.y+tableBox.height);
    });
  }
}

test('quest report uses the same round markers as the public header',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  const state=council('quest_result');state.questResult={success:true,fails:0};state.results=['success'];
  await show(page,state);
  await expect(page.locator('.cs-quest-verdict .round-history-item')).toHaveCount(5);
  await expect(page.locator('.game-status .round-history-item').first()).toContainText('성공');
  await expect(page.locator('.cs-quest-verdict .round-history')).toHaveText((await page.locator('.game-status .round-history').textContent())!);
  await expect(page.locator('.cs-quest-verdict .cs-score')).toHaveCount(0);
});

test('room creation gives immediate feedback and submits only once while waiting',async({page})=>{
  await page.getByPlaceholder('닉네임을 입력하세요').fill('아서');
  await page.locator('.role-card').filter({hasText:'암살자'}).click();
  await page.evaluate(async()=>{
    const {socket}=await import('/avalon/src/socket.ts');
    socket.emit=(event:string,...args:any[])=>{
      (window as any).__commands.push({event,data:args[0]});
      if(event==='ROOM_CREATE')(window as any).__creationReply=args[1];
      return socket;
    };
  });
  const create=page.getByRole('button',{name:'원탁 열기',exact:true});
  await create.tap();
  await expect(page.getByRole('button',{name:'원탁 여는 중…'})).toBeDisabled();
  expect(await page.evaluate(()=>(window as any).__commands.filter((c:any)=>c.event==='ROOM_CREATE'))).toHaveLength(1);
  await page.evaluate(()=>(window as any).__creationReply(null,{ok:false,error:'다시 시도하세요'}));
  await expect(create).toBeEnabled();
  await create.tap();
  expect(await page.evaluate(()=>(window as any).__commands.filter((c:any)=>c.event==='ROOM_CREATE'))).toHaveLength(2);
});

test('quest keeps one physical table from sealed cards through the camera reveal',async({page})=>{
  const state=council('quest');state.questCardsCompleted=1;
  await show(page,state);
  const table=page.locator('.cs-quest .council-table-art');
  await expect(table).toHaveCount(1);
  await expect(page.locator('.cs-quest .cs-altar-face')).toHaveCount(0);
  await page.evaluate(()=>{(window as any).__questTable=document.querySelector('.cs-quest .council-table-art');});
  state.phase='quest_result';state.questResult={success:false,fails:1};state.results=['fail'];
  await show(page,state);
  expect(await page.evaluate(()=>(window as any).__questTable===document.querySelector('.cs-quest .council-table-art'))).toBe(true);
  await expect(table).toBeVisible();
  await expect(page.locator('.quest-table-verdict')).toHaveCount(0);
  await expect(page.locator('.cs-quest')).not.toHaveClass(/has-revealed-fail/);
  await page.getByRole('button',{name:'결과 바로 보기',exact:true}).click();
  await expect(table).toBeVisible();
  await expect(page.locator('.quest-table-verdict')).toContainText('원정 실패');
  await expect(page.locator('.cs-quest .council-table-art')).toHaveCount(1);
});


for(const viewport of [{width:320,height:640},{width:375,height:667},{width:390,height:844},{width:430,height:932}]){
  test(`mobile toolbar, table and card labels keep their shape at ${viewport.width}px`,async({page})=>{
    await page.setViewportSize(viewport);
    await page.emulateMedia({reducedMotion:'reduce'});
    const state=council('quest',10);state.questSize=5;state.proposedTeam=['p0','p1','p2','p3','p4'];state.questCardsCompleted=3;
    await show(page,state);
    for(const selector of ['.audio-settings-button','.utility-actions .help-button:not(.audio-settings-button)']){
      const box=(await page.locator(selector).boundingBox())!;
      expect(box.width/box.height).toBeCloseTo(1,2);expect(box.height).toBeGreaterThanOrEqual(36);
      const icon=page.locator(`${selector} svg`);
      if(await icon.count()){const b=(await icon.boundingBox())!;expect(b.width).toBe(b.height);}
    }
    const exit=(await page.locator('.leave-room').boundingBox())!,role=(await page.locator('.dossier-button').boundingBox())!;
    expect(exit.height).toBe(role.height);expect(exit.height).toBeGreaterThanOrEqual(36);expect(exit.x+exit.width).toBeLessThan(role.x);
    await page.locator('.quest-cards .qcard.success').click();
    for(const choice of await page.locator('.quest-cards .qcard').all()){
      const box=(await choice.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(88);
      for(const text of await choice.locator(':scope > span,:scope > small').all()){
        const label=(await text.boundingBox())!;
        expect(label.x).toBeGreaterThanOrEqual(box.x);
        expect(label.x+label.width).toBeLessThanOrEqual(box.x+box.width);
        expect(label.y+label.height).toBeLessThanOrEqual(box.y+box.height);
      }
    }
    const stage=(await page.locator('.cs-altar-camera').boundingBox())!;
    expect(stage.height).toBeGreaterThanOrEqual(220);
    const stack=(await page.locator('.cs-qcard').first().boundingBox())!;
    expect(stack.width).toBeGreaterThanOrEqual(35);
    expect(stack.y).toBeGreaterThan(stage.y);
    expect(stack.y+stack.height).toBeLessThan(stage.y+stage.height);
    const action=(await page.locator('.quest-stage').boundingBox())!;
    expect(action.y+action.height).toBeLessThanOrEqual(viewport.height);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
  });
}
