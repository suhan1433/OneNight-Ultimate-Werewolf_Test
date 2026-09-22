# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: full-game.spec.ts >> three devices can finish one authoritative game
- Location: e2e/full-game.spec.ts:9:1

# Error details

```
Error: page.goto: Could not connect to the server.
Call log:
  - navigating to "http://localhost:8080/", waiting until "load"

```

# Test source

```ts
  1  | import { expect, test, type Browser, type Page } from '@playwright/test';
  2  | 
  3  | async function join(browser: Browser, nickname: string, code: string) {
  4  |   const context = await browser.newContext(); const page = await context.newPage(); await page.goto('/');
  5  |   await page.getByRole('button', { name: '방 코드로 합류' }).click(); await page.getByPlaceholder('이름을 입력하세요').fill(nickname); await page.getByPlaceholder('A7K29P').fill(code); await page.getByRole('button', { name: '입장하기' }).click(); await expect(page.getByText(nickname, { exact: true })).toBeVisible(); return { context, page };
  6  | }
  7  | async function reveal(page: Page) { await page.locator('.flip').click(); await page.getByRole('button', { name: '역할을 확인했습니다' }).click(); }
  8  | 
  9  | test('three devices can finish one authoritative game', async ({ browser, page }) => {
> 10 |   await page.goto('/'); await page.getByRole('button', { name: '새로운 밤 열기' }).click(); await page.getByPlaceholder('이름을 입력하세요').fill('달빛');
     |              ^ Error: page.goto: Could not connect to the server.
  11 |   await page.getByRole('button', { name: '−' }).first().click(); await page.getByRole('button', { name: '−' }).first().click(); await page.getByRole('button', { name: '방 만들기' }).click();
  12 |   const code = (await page.locator('.room-code').textContent())!.trim(); const second = await join(browser, '은빛', code); const third = await join(browser, '새벽', code);
  13 |   for (const p of [page, second.page, third.page]) await p.getByRole('button', { name: '준비 완료' }).click();
  14 |   await page.getByRole('button', { name: '게임 시작' }).click(); for (const p of [page, second.page, third.page]) await reveal(p);
  15 |   await expect(page.getByText('날이 밝았습니다')).toBeVisible({ timeout: 35_000 }); await page.getByRole('button', { name: '지금 투표 시작' }).click();
  16 |   for (const p of [page, second.page, third.page]) { await p.locator('.vote').first().click(); await p.getByRole('button', { name: '이 선택으로 확정' }).click(); }
  17 |   for (const p of [page, second.page, third.page]) await expect(p.getByText('THE NIGHT IS OVER')).toBeVisible();
  18 |   await second.context.close(); await third.context.close();
  19 | });
  20 | 
```