import { test, expect } from '@playwright/test';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGameServer } from '../../apps/server/src/server';
import { createGame, transition, eligibleChancellors } from '../../packages/rules-engine/src/index';
import type { GameState } from '../../packages/shared-types/src/index';

for (const width of [390, 1440]) test(`입법 카드 ${width}px: 두 번 누르기·위로 밀기·선택 변경·취소·키보드`, async ({ page }) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width, height: width === 390 ? 844 : 1050 });
  const dataDir = mkdtempSync(join(tmpdir(), 'sh-policy-'));
  const rng = () => .42;
  function fixture(code: string, phase: 'president_discard' | 'chancellor_enact') {
    const token = `test-${code}-${'x'.repeat(40)}`;
    const players = Array.from({ length: 5 }, (_, i) => ({ id: randomUUID(), name: `의원 ${i + 1}`, avatar: i }));
    let game = createGame(players, rng);
    for (const p of players) game = transition(game, p.id, { type: 'acknowledge' }, rng);
    game.president = players[0].id;
    game = transition(game, players[0].id, { type: 'nominate', target: eligibleChancellors(game)[0] }, rng);
    for (const p of players) game = transition(game, p.id, { type: 'vote', ja: true }, rng);
    for (const p of players) game = transition(game, p.id, { type: 'acknowledge' }, rng);
    if (phase === 'chancellor_enact') game = transition(game, game.president, { type: 'discard', index: 0 }, rng);
    const selfId = phase === 'president_discard' ? game.president : game.chancellor!;
    const room = { code, version: 1, hostId: players[0].id, members: players.map(p => ({ ...p, tokenHash: createHash('sha256').update(token).digest('hex'), ready: true, connected: true, bot: p.id !== selfId, spectator: false })), settings: { maxPlayers: 5, timerSeconds: 0, language: 'ko' }, game, chat: [], paused: false, deadline: null, updated: Date.now(), created: Date.now(), processed: {} };
    writeFileSync(join(dataDir, `${code}.jsonl`), JSON.stringify({ state: room }) + '\n');
    return { code, id: selfId, token };
  }
  const discard = fixture('ABCDEF', 'president_discard');
  const enact = fixture('GHJKLM', 'chancellor_enact');
  const dragDiscard = fixture('NPQRST', 'president_discard');
  const dragEnact = fixture('UVWXYZ', 'chancellor_enact');
  const keyboard = fixture('ABCHJK', 'president_discard');
  const server = createGameServer({ dataDir, botDelayMs: 1000000 });
  await new Promise<void>(resolve => server.server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.server.address() as { port: number }).port}`;
  const state = (code: string): GameState => JSON.parse(readFileSync(join(dataDir, `${code}.jsonl`), 'utf8')).state.game;
  async function open(session: typeof discard) {
    await page.goto(`${origin}/secret_hitler/`);
    await page.evaluate(value => { localStorage.setItem('sh-session', JSON.stringify(value)); }, session);
    await page.reload();
    await expect(page.locator('.policy-hand .policy-card')).toHaveCount(state(session.code).hand.length);
  }
  async function swipe(deltaY: number, cancel = false) {
    const card = page.locator('.policy-hand .policy-card').first();
    await card.scrollIntoViewIfNeeded();
    const rect = (await card.boundingBox())!;
    const x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
    if (width === 390) {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      for (let step = 1; step <= 8; step++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - deltaY * step / 8 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: cancel ? 'touchCancel' : 'touchEnd', touchPoints: [] });
      await cdp.detach();
    } else {
      await page.mouse.move(x, y); await page.mouse.down();
      await page.mouse.move(x, y - deltaY, { steps: 8 });
      if (cancel) await card.dispatchEvent('pointercancel', { pointerId: 1 });
      await page.mouse.up();
    }
  }
  try {
    await open(discard);
    const before = state(discard.code);
    const cards = page.locator('.policy-hand .policy-card');
    await cards.nth(0).click();
    await expect(cards.nth(0)).toHaveAttribute('aria-pressed', 'true');
    expect(state(discard.code).version).toBe(before.version);
    await cards.nth(1).click();
    await expect(cards.nth(0)).toHaveAttribute('aria-pressed', 'false');
    await expect(cards.nth(1)).toHaveAttribute('aria-pressed', 'true');
    expect(state(discard.code).phase).toBe('president_discard');
    await page.screenshot({ path: `test-results/policy-selected-${width}.png` });
    await cards.nth(1).click();
    await expect.poll(() => state(discard.code).phase).toBe('chancellor_enact');
    expect(state(discard.code).version).toBe(before.version + 1);
    expect(state(discard.code).hand).toEqual(before.hand.filter((_, i) => i !== 1));

    await open(enact);
    const enactBefore = state(enact.code);
    const policy = page.locator('.policy-hand .policy-card').first();
    await policy.dblclick();
    await expect.poll(() => state(enact.code).version).toBe(enactBefore.version + 1);
    expect(state(enact.code).liberal + state(enact.code).fascist).toBe(enactBefore.liberal + enactBefore.fascist + 1);

    await open(dragDiscard);
    const dragBefore = state(dragDiscard.code);
    await swipe(30); // Below the confirmation threshold.
    expect(state(dragDiscard.code).version).toBe(dragBefore.version);
    await expect(page.locator('.policy-card.armed')).toHaveCount(0);
    await swipe(-85); // A downward gesture must never discard.
    expect(state(dragDiscard.code).version).toBe(dragBefore.version);
    await swipe(85, true); // Cancellation must not confirm a completed drag.
    expect(state(dragDiscard.code).version).toBe(dragBefore.version);
    await swipe(85);
    await expect.poll(() => state(dragDiscard.code).phase).toBe('chancellor_enact');
    expect(state(dragDiscard.code).version).toBe(dragBefore.version + 1);

    await open(dragEnact);
    const dragEnactBefore = state(dragEnact.code);
    await swipe(85);
    await expect.poll(() => state(dragEnact.code).version).toBe(dragEnactBefore.version + 1);
    expect(state(dragEnact.code).liberal + state(dragEnact.code).fascist).toBe(dragEnactBefore.liberal + dragEnactBefore.fascist + 1);

    await open(keyboard);
    const first = page.locator('.policy-card').first();
    await first.focus(); await page.keyboard.press('Enter');
    await expect(first).toHaveAttribute('aria-pressed', 'true');
    expect(state(keyboard.code).phase).toBe('president_discard');
    await page.keyboard.press('Enter');
    await expect.poll(() => state(keyboard.code).phase).toBe('chancellor_enact');
  } finally { await page.goto('about:blank'); await server.close(); rmSync(dataDir, { recursive: true, force: true }); }
});
