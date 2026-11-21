import { expect, test, type Page } from '@playwright/test';

async function reveal(page: Page) {
  await page.locator('.flip').focus();await page.keyboard.press('Enter');
  await page.getByRole('button',{name:'역할을 확인했습니다',exact:true}).click();
}
async function chooseNight(page: Page) {
  const choice=page.locator('.night-choice');
  if(!await choice.count())return;
  const confirm=choice.locator('.action-confirm');
  const target=choice.locator('.target:enabled').first();
  const center=choice.locator('.center-card:enabled').first();
  if(await target.count()) {
    await target.click();
    if(!await confirm.isEnabled())await choice.locator('.target:enabled').nth(1).click();
    // Selecting a card must leave the choice editable until confirmation.
    await expect(choice.locator('.target.selected')).not.toHaveCount(0);
    await expect(confirm).toBeEnabled();
  } else if(await center.count()) {
    await center.click();
    if(!await confirm.isEnabled())await choice.locator('.center-card:enabled').nth(1).click();
  }
  if(await confirm.isEnabled())await confirm.click();
}

test('compact role settings preserve the selected deck and edition descriptions',async({page})=>{
  await page.goto('./');
  await expect(page.getByRole('button',{name:'새로운 밤 열기',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'새로운 밤 열기',exact:true}).click();
  await expect(page.locator('.deck-selected .deck-token')).toHaveCount(5);
  await expect(page.locator('.deck-catalog')).not.toBeVisible();
  await page.getByText('역할 편집 · 전체 역할 보기',{exact:true}).click();
  await page.getByRole('button',{name:'Daybreak',exact:true}).click();
  await expect(page.getByText('센터 카드 한 장을 먼저 확인하고', {exact:false})).toBeVisible();
  await page.getByRole('button',{name:'커스텀',exact:true}).click();
  await expect(page.locator('.deck-catalog')).toContainText('신문기자');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});

test('three mobile devices finish ordered night, private voting, replay and a rematch',async({browser,page},testInfo)=>{
  const calls: Array<{id:string;role:string}> = [];
  const durations: number[] = [];
  page.on('websocket',ws=>ws.on('framereceived',frame=>{
    const payload=frame.payload.toString();
    if(!payload.startsWith('42'))return;
    try {
      const [event,state]=JSON.parse(payload.slice(2));
      if(event!=='ROOM_STATE'||state.phase!=='night'||state.currentNightAction?.status!=='active')return;
      const action=state.currentNightAction;
      durations.push(action.expiresAt-action.startedAt);
      if(calls.at(-1)?.id!==action.id)calls.push({id:action.id,role:action.role});
    } catch { /* Ignore non-game Socket.IO frames. */ }
  }));
  await page.goto('./');await page.getByRole('button',{name:'새로운 밤 열기',exact:true}).click();
  await page.getByPlaceholder('이름을 입력하세요').fill('달빛');
  await page.getByRole('button',{name:'−',exact:true}).first().click();await page.getByRole('button',{name:'−',exact:true}).first().click();
  await page.getByRole('button',{name:'방 만들기',exact:true}).click();
  const code=await page.locator('.invite .code-tiles').innerText();
  const roomCode=code.replace(/\s/g,'');
  const contexts=await Promise.all([browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'}),browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'})]);
  const guests=await Promise.all(contexts.map(async(context,i)=>{
    const p=await context.newPage();await p.goto(new URL(`?code=${roomCode}`,page.url()).toString());await p.getByPlaceholder('이름을 입력하세요').fill(i?'새벽':'은빛');await p.getByRole('button',{name:'입장하기',exact:true}).click();return p;
  }));
  const pages=[page,...guests];const errors:string[]=[];pages.forEach(p=>p.on('pageerror',e=>errors.push(e.message)));
  await expect(page.getByRole('button',{name:'음성 참가',exact:true})).toBeVisible();
  await page.getByLabel('밤 행동 시간',{exact:true}).selectOption('8');
  for(const p of pages)await p.getByRole('button',{name:'준비 완료',exact:true}).click();
  await page.getByRole('button',{name:'게임 시작',exact:true}).click();for(const p of pages)await reveal(p);
  await page.locator('.smooth-countdown').waitFor();
  const frames=await page.evaluate(async()=>{
    const values:string[]=[];
    for(let i=0;i<24;i++){
      await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
      values.push(document.querySelector('.smooth-countdown .ring-fg')?.getAttribute('stroke-dashoffset')??'');
    }
    return values;
  });
  expect(new Set(frames).size).toBeGreaterThan(8);
  await page.screenshot({path:testInfo.outputPath('night.png'),fullPage:true});
  let capturedChoice=false;
  const deadline=Date.now()+110_000;
  while(!await page.getByRole('heading',{name:'날이 밝았습니다',exact:true}).count()){
    if(Date.now()>deadline)throw new Error('night did not finish');
    for(const p of pages){
      if(!capturedChoice&&await p.locator('.night-choice').count()){
        await p.screenshot({path:testInfo.outputPath('night-choice.png'),fullPage:true});capturedChoice=true;
      }
      await chooseNight(p);
    }
    await page.waitForTimeout(400);
  }
  expect(durations.length).toBeGreaterThan(0);
  expect(durations.every(duration=>duration===8_000)).toBe(true);
  expect(calls.map(call=>call.role)).toEqual(['werewolf','seer','robber','troublemaker']);
  expect(new Set(calls.map(call=>call.id)).size).toBe(calls.length);
  await expect.poll(()=>page.evaluate(()=>window.scrollY)).toBe(0);
  await page.screenshot({path:testInfo.outputPath('day.png'),fullPage:true});
  for(const p of pages){
    await expect(p.locator('.village-seats')).toBeVisible();
    await expect(p.getByRole('tab',{name:'마을 대화',exact:true})).toBeVisible();
    await p.getByRole('button',{name:'투표하기 동의',exact:false}).click();
  }
  for(const p of pages){await p.locator('.suspect').first().click();await p.locator('.hold-confirm').focus();await p.keyboard.press('Enter');}
  for(const p of pages){
    const skip=p.getByRole('button',{name:'건너뛰기',exact:false});
    if(await skip.count())await skip.click();
    await expect(p.getByRole('heading',{name:'이렇게 판정되었습니다',exact:true})).toBeVisible();
    await expect(p.locator('.replay-cards')).toBeVisible();
    await p.getByRole('button',{name:'다음 밤 행동',exact:true}).click();
    await expect(p.locator('.replay-event')).toBeVisible();
    expect(await p.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  }
  await page.screenshot({path:testInfo.outputPath('result.png'),fullPage:true});
  expect(errors).toEqual([]);
  await page.getByRole('button',{name:'모두 대기실로 돌아가기',exact:true}).click();
  for(const p of pages)await expect(p.getByRole('button',{name:'준비 완료',exact:true})).toBeVisible();
  for(const context of contexts)await context.close();
});
