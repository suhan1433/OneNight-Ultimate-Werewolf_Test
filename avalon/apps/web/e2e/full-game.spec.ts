import { expect, test, type Browser, type Page } from '@playwright/test';

async function join(browser: Browser, nickname: string, code: string) {
  const context = await browser.newContext(); const page = await context.newPage(); await page.goto('/');
  await page.getByRole('button', { name: '방 코드로 합류' }).click(); await page.getByPlaceholder('이름을 입력하세요').fill(nickname); await page.getByPlaceholder('A7K29P').fill(code); await page.getByRole('button', { name: '입장하기' }).click(); await expect(page.getByText(nickname, { exact: true })).toBeVisible(); return { context, page };
}
async function reveal(page: Page) { await page.locator('.flip').click(); await page.getByRole('button', { name: '역할을 확인했습니다' }).click(); }

test('three devices can finish one authoritative game', async ({ browser, page }) => {
  await page.goto('/'); await page.getByRole('button', { name: '새로운 밤 열기' }).click(); await page.getByPlaceholder('이름을 입력하세요').fill('달빛');
  await page.getByRole('button', { name: '−' }).first().click(); await page.getByRole('button', { name: '−' }).first().click(); await page.getByRole('button', { name: '방 만들기' }).click();
  const code = (await page.locator('.room-code').textContent())!.trim(); const second = await join(browser, '은빛', code); const third = await join(browser, '새벽', code);
  for (const p of [page, second.page, third.page]) await p.getByRole('button', { name: '준비 완료' }).click();
  await page.getByRole('button', { name: '게임 시작' }).click(); for (const p of [page, second.page, third.page]) await reveal(p);
  await expect(page.getByText('날이 밝았습니다')).toBeVisible({ timeout: 35_000 }); await page.getByRole('button', { name: '지금 투표 시작' }).click();
  for (const p of [page, second.page, third.page]) { await p.locator('.vote').first().click(); await p.getByRole('button', { name: '이 선택으로 확정' }).click(); }
  for (const p of [page, second.page, third.page]) await expect(p.getByText('THE NIGHT IS OVER')).toBeVisible();
  await second.context.close(); await third.context.close();
});
