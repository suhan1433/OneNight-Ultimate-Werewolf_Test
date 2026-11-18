import { test, expect } from '@playwright/test';

for (const [width,language] of [[320,'ko'],[390,'ko'],[1440,'ko'],[390,'en']] as const) {
  test(`초보자 도움말 ${width}px ${language}: 카드 수·승리 조건·입법 연습·단계 설명`, async ({page}) => {
    await page.setViewportSize({width,height:844});
    const actions:string[]=[];
    page.on('websocket',socket=>socket.on('framesent',({payload})=>{
      if(typeof payload==='string'&&payload.startsWith('42["ACTION"'))actions.push(payload);
    }));
    await page.goto('/secret_hitler/');
    if(language==='en') await page.getByRole('combobox',{name:'언어'}).selectOption('en');
    const ko=language==='ko';
    await page.getByRole('button',{name:ko?'규칙 열람':'Rulebook',exact:true}).click();
    const dialog=page.locator('dialog[open]');
    const deck=dialog.locator('.guide-deck');
    await expect(deck).toContainText(ko?'정책 카드는 총 17장':'17 cards');
    await expect(deck).toContainText(ko?'자유당 정책 6장':'6 Liberal policies');
    await expect(deck).toContainText(ko?'파시스트 정책 11장':'11 Fascist policies');
    await expect(deck).toContainText(ko?'비밀 역할 카드와는 별개':'separate from');
    await expect(deck.locator('.guide-important')).toContainText(ko?'5장·6장은':'5 and 6');
    await expect(dialog.locator('.guide-win-grid')).toContainText(ko?'자유 정책 5장':'5 Liberal policies');
    await expect(dialog.locator('.guide-win-grid')).toContainText(ko?'파시스트 정책 6장':'6 Fascist policies');
    await deck.scrollIntoViewIfNeeded();
    await page.screenshot({path:`test-results/help-deck-${width}-${language}.png`});

    await dialog.getByRole('button',{name:ko?'입법 예시':'Policy example',exact:true}).click();
    const demo=dialog.locator('.guide-legislation-demo');
    await expect(demo.locator('h3')).toBeFocused();
    await expect(demo).toContainText(ko?'실제 게임에 영향을 주지 않아요':'do not affect your game');
    await expect(demo.locator('.policy-face')).toHaveCount(3);
    await expect(demo.locator('[role="status"]')).toContainText(ko?'버릴 1장':'discard');
    await demo.getByRole('button',{name:ko?'파시스트 1장 버려 보기':'Discard 1 Fascist card',exact:true}).click();
    await expect(demo.locator('.policy-face')).toHaveCount(2);
    await expect(demo.locator('[role="status"]')).toContainText(ko?'통과시킬 1장':'enact');
    await demo.getByRole('button',{name:ko?'자유 정책 제정해 보기':'Enact the Liberal policy',exact:true}).click();
    await expect(demo.locator('.policy-face')).toHaveCount(1);
    await expect(demo.locator('[role="status"]')).toContainText(ko?'공개':'Everyone');
    await page.screenshot({path:`test-results/help-example-${width}-${language}.png`});
    await demo.getByRole('button',{name:ko?'처음부터 다시 보기':'Try again',exact:true}).click();
    await expect(demo.locator('.policy-face')).toHaveCount(3);
    expect(actions).toEqual([]);

    await dialog.getByRole('button',{name:ko?'단계별 도움말':'Each step',exact:true}).click();
    const discard=dialog.locator('[data-guide-step="president_discard"]');
    await discard.locator('summary').click();
    await expect(discard.locator('.guide-instructions')).toContainText(ko?'두 번 누르거나 위로 밀어':'twice or slide');
    await expect(discard).toContainText(ko?'버릴 카드':'discard');
    await discard.locator('summary').click();
    const peek=dialog.locator('[data-guide-step="peek"]');
    await peek.locator('summary').focus();await page.keyboard.press('Enter');
    await expect(peek).toHaveAttribute('open','');
    await expect(peek.locator('.policy-face')).toHaveCount(3);
    await expect(peek).toContainText(ko?'왼쪽 1번':'Card 1 on the left');

    await dialog.getByRole('button',{name:ko?'자주 묻는 질문':'Questions',exact:true}).click();
    const question=dialog.locator('.guide-questions details').filter({has:page.locator('summary',{hasText:ko?'왜 받은 카드가 모두 파시스트인가요?':'Can all the cards I receive be Fascist?'})});
    await question.locator('summary').click();
    await expect(question.locator('p')).toBeVisible();
    await expect(question).toContainText(ko?'받은 카드 중에서만':'only choose from');
    expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
  });
}
