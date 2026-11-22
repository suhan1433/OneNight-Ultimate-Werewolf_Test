import {expect,test} from '@playwright/test';
test('one lobby supports bots, human invitations, removal and game start',async({page,browser})=>{
  await page.goto('./');await page.getByRole('button',{name:'새로운 밤 열기',exact:true}).click();
  await expect(page.getByRole('button',{name:'테스트 봇 방 만들기'})).toHaveCount(0);
  await page.getByPlaceholder('이름을 입력하세요').fill('방장');
  await page.getByRole('button',{name:'−',exact:true}).first().click();await page.getByRole('button',{name:'−',exact:true}).first().click();
  await page.getByRole('button',{name:'방 만들기',exact:true}).click();
  await page.getByRole('button',{name:'봇 추가',exact:true}).click();await expect(page.getByRole('button',{name:'봇 1 제거',exact:true})).toBeVisible();
  const code=(await page.locator('.invite .code-tiles').innerText()).replace(/\s/g,'');
  const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
  try{
    const guest=await context.newPage();await guest.goto(new URL(`?code=${code}`,page.url()).toString());await guest.getByPlaceholder('이름을 입력하세요').fill('친구');await guest.getByRole('button',{name:'입장하기',exact:true}).click();
    await expect(guest.locator('.round-table')).toContainText('봇 1');await expect(guest.getByRole('button',{name:'봇 추가',exact:true})).toHaveCount(0);
    await expect(page.getByRole('button',{name:'봇 추가',exact:true})).toBeDisabled();
    await page.getByRole('button',{name:'봇 1 제거',exact:true}).click();await expect(guest.locator('.round-table')).not.toContainText('봇 1');
    await page.getByRole('button',{name:'봇 추가',exact:true}).click();await expect(page.getByRole('button',{name:'봇 1 제거',exact:true})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
    await page.getByRole('button',{name:'준비 완료',exact:true}).click();await guest.getByRole('button',{name:'준비 완료',exact:true}).click();
    await page.getByRole('button',{name:'게임 시작',exact:true}).click();await expect(page.locator('.flip')).toBeVisible();await expect(guest.locator('.flip')).toBeVisible();
  }finally{await context.close();}
});
