import { test, expect } from '@playwright/test';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { io, type Socket } from 'socket.io-client';
import { createGameServer } from '../../apps/server/src/server';
import { createGame } from '../../packages/rules-engine/src/index';
import type { Action, RoomView } from '../../packages/shared-types/src/index';

const scenarios = [
  { width: 390, height: 844, reduced: false, fascist: 3, hitler: true },
  { width: 1440, height: 1050, reduced: false, fascist: 4, hitler: true },
  { width: 844, height: 390, reduced: true, fascist: 3, hitler: true },
  { width: 390, height: 844, reduced: false, fascist: 2, hitler: true },
  { width: 390, height: 844, reduced: false, fascist: 3, hitler: false },
];
for (const scenario of scenarios) {
  test(`정부 구성부터 당선까지 ${scenario.width}px · 파시스트 ${scenario.fascist} · 히틀러 ${scenario.hitler}`, async ({ page, browser }) => {
    test.setTimeout(60000);
    const { width, height, reduced, fascist, hitler } = scenario;
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
    const dataDir = mkdtempSync(join(tmpdir(), 'sh-government-'));
    const token = `test-${'x'.repeat(40)}`, code = 'ABCDEF';
    const players = Array.from({ length: 5 }, (_, i) => ({ id: randomUUID(), name: `의원 ${i + 1}`, avatar: i }));
    const game = createGame(players, () => .42);
    const president = game.players.find(p => p.role !== 'hitler')!;
    const candidate = game.players.find(p => p.id !== president.id && (hitler ? p.role === 'hitler' : p.role !== 'hitler'))!;
    const observer = game.players.find(p => p.id !== president.id && p.id !== candidate.id)!;
    game.phase = 'nomination'; game.president = president.id; game.fascist = fascist;
    game.acknowledged = players.map(p => p.id);
    const session = (id: string) => ({ code, id, token });
    const room = { code, version: 1, hostId: president.id, members: players.map(p => ({ ...p, tokenHash: createHash('sha256').update(token).digest('hex'), ready: true, connected: true, bot: false, spectator: false })), settings: { maxPlayers: 5, timerSeconds: 0, language: 'ko' }, game, chat: [], paused: false, deadline: null, updated: Date.now(), created: Date.now(), processed: {} };
    writeFileSync(join(dataDir, `${code}.jsonl`), JSON.stringify({ state: room }) + '\n');
    const server = createGameServer({ dataDir, botDelayMs: 1000000 });
    await new Promise<void>(resolve => server.server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${(server.server.address() as { port: number }).port}`;
    const call = (socket: Socket, event: string, data: unknown) => new Promise<void>((resolve, reject) => socket.timeout(5000).emit(event, data, (err: Error | null, ack: { ok: boolean; error?: string }) => err ? reject(err) : ack.ok ? resolve() : reject(Error(ack.error))));
    const clients: { socket: Socket; view?: RoomView }[] = [];
    const action = (client: typeof clients[number], value: Action) => call(client.socket, 'ACTION', { version: client.view!.game!.version, requestId: randomUUID(), action: value });
    const actorContext = await browser.newContext({ viewport: { width, height }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
    try {
      for (const player of players.filter(p => p.id !== president.id && p.id !== observer.id)) {
        const socket = io(origin, { path: '/secret_hitler/socket.io', transports: ['websocket'], forceNew: true, autoConnect: false });
        const client: typeof clients[number] = { socket }; clients.push(client);
        socket.on('ROOM_STATE', value => client.view = value);
        await new Promise<void>((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); socket.connect(); });
        await call(socket, 'RESUME', session(player.id));
      }
      await page.addInitScript(({ value, reduced }) => {
        localStorage.setItem('sh-session', JSON.stringify(value)); localStorage.setItem('sh-reduce', reduced ? '1' : '0');
      }, { value: session(observer.id), reduced });
      await actorContext.addInitScript(({ value, reduced }) => {
        localStorage.setItem('sh-session', JSON.stringify(value)); localStorage.setItem('sh-reduce', reduced ? '1' : '0');
      }, { value: session(president.id), reduced });
      const actorPage = await actorContext.newPage();
      await page.goto(`${origin}/secret_hitler/`);
      await actorPage.goto(`${origin}/secret_hitler/`);
      const proposal = page.locator('.government-proposal');
      await proposal.scrollIntoViewIfNeeded();
      await expect(proposal.locator('.proposal-placeholder')).toBeVisible();
      await actorPage.locator(`[data-seat-id="${candidate.id}"]`).click();
      await expect(proposal.locator('.candidate b')).toHaveText(candidate.name);
      await expect(proposal).toHaveAttribute('data-confirmed', 'false');
      await expect(proposal.locator('.activity-copy > strong')).toContainText('아직 지명 전');
      await expect(proposal.locator('.election-risk')).toHaveCount(fascist >= 3 ? 1 : 0);
      await page.screenshot({ path: `test-results/proposal-${width}-${fascist}-${hitler}.png` });
      await expect(actorPage.locator('.hold-sign')).toBeEnabled();
      await actorPage.locator('.hold-sign').focus();
      await actorPage.keyboard.down('Space'); await actorPage.waitForTimeout(750); await actorPage.keyboard.up('Space');
      for (const screen of [page, actorPage]) {
        await expect(screen.locator('.sc-nomination')).toBeVisible();
        await expect(screen.locator('.nomination-person.president strong')).toHaveText(president.name);
        await expect(screen.locator('.nomination-person.candidate strong')).toHaveText(candidate.name);
        await expect(screen.locator('.sc-election, .results')).toHaveCount(0);
      }
      await page.screenshot({ path: `test-results/nomination-${width}-${fascist}-${hitler}.png` });
      await expect(page.locator('.sc-nomination')).toHaveCount(0);
      await expect(actorPage.locator('.sc-nomination')).toHaveCount(0);
      await expect(proposal).toHaveAttribute('data-confirmed', 'true');
      await expect(page.locator('.ballot-card')).toHaveCount(2);
      for (const client of clients) await action(client, { type: 'vote', ja: true });
      await page.locator('.ballot-card.ja').dblclick();
      await actorPage.locator('.ballot-card.ja').dblclick();
      await expect(page.locator('.vote-confirm')).toBeVisible();
      await expect(page.locator('.sc-election, .results')).toHaveCount(0);
      for (const client of clients) await action(client, { type: 'acknowledge' });
      await page.locator('.vote-confirm').click();
      await actorPage.locator('.vote-confirm').click();
      if (fascist >= 3 && hitler) {
        const reveal = page.locator('.sc-election');
        await expect(reveal).toBeVisible();
        await expect(reveal.locator('h2')).toContainText(candidate.name);
        await expect(reveal.locator('.election-identity-front strong')).toHaveText('히틀러');
        await expect(reveal.locator('.election-policy-count')).toContainText(`${fascist}개`);
        await expect(reveal.locator('.election-tally')).toContainText('5');
        await expect(page.locator('.results, .sc-victory')).toHaveCount(0);
        if (reduced) await expect(reveal.locator('.election-identity-inner')).toHaveCSS('animation-name', 'none');
        // Keep the reason readable, then advance automatically without a confirmation.
        await expect(reveal.getByRole('button')).toHaveCount(0);
        await page.waitForTimeout(reduced ? 1300 : 1700);
        await expect(reveal).toBeVisible();
        await reveal.scrollIntoViewIfNeeded();
        expect(await reveal.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
        await page.screenshot({ path: `test-results/hitler-election-${width}.png` });
        await expect(page.locator('.sc-victory.fascist')).toBeVisible();
        await expect(page.locator('.sc-victory h2')).toHaveText('의회는 침묵했다');
        await expect(page.locator('.sc-victory p')).toContainText('히틀러');
        await expect(page.locator('.results')).toBeVisible({ timeout: 10000 });
        await page.reload();
        await expect(page.locator('.results')).toBeVisible();
        await expect(page.locator('.scene')).toHaveCount(0);
      } else {
        await expect(actorPage.locator('.policy-hand .policy-card')).toHaveCount(3);
        await expect(page.locator('.sc-election, .results')).toHaveCount(0);
      }
    } finally {
      await page.goto('about:blank'); await actorContext.close(); clients.forEach(client => client.socket.disconnect()); await server.close(); rmSync(dataDir, { recursive: true, force: true });
    }
  });
}
