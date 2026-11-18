import { test, expect } from '@playwright/test';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { io, type Socket } from 'socket.io-client';
import { createGameServer } from '../../apps/server/src/server';
import { createGame } from '../../packages/rules-engine/src/index';
import type { GameView, Power, RoomView } from '../../packages/shared-types/src/index';

const cases: { phase: GameView['phase']; power?: Power; title: string; width: number; reduced?: boolean; spectator?: boolean; dead?: boolean }[] = [
  { phase: 'executive', power: 'peek', title: '정책 엿보기', width: 390 },
  { phase: 'executive', power: 'investigate', title: '정체 조사', width: 1440 },
  { phase: 'executive', power: 'special_election', title: '특별 선거', width: 844, reduced: true },
  { phase: 'executive', power: 'execute', title: '처형 대상', width: 390 },
  { phase: 'nomination', title: '수상 후보', width: 390 },
  { phase: 'voting', title: '정부 신임 투표', width: 390 },
  { phase: 'vote_result', title: '투표 결과', width: 390 },
  { phase: 'night', title: '비밀 역할', width: 390 },
  { phase: 'executive', power: 'peek', title: '정책 엿보기', width: 390, spectator: true },
  { phase: 'executive', power: 'investigate', title: '정체 조사', width: 390, dead: true },
];
for (const scenario of cases) {
  test(`진행 안내 ${scenario.phase}/${scenario.power ?? ''} ${scenario.width}px ${scenario.spectator ? '관전자' : scenario.dead ? '처형된 참가자' : ''}`, async ({ page, browser }) => {
    const { phase, power, width, reduced = false } = scenario;
    await page.setViewportSize({ width, height: width === 844 ? 390 : 844 });
    await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
    const dataDir = mkdtempSync(join(tmpdir(), 'sh-activity-'));
    const token = `test-${'x'.repeat(40)}`, code = 'ABCDEF';
    const players = Array.from({ length: 5 }, (_, i) => ({ id: randomUUID(), name: `의원 ${i + 1}`, avatar: i }));
    const game = createGame(players, () => .42);
    const president = players[0], observer = scenario.spectator ? { id: randomUUID(), name: '관전자', avatar: 5 } : players[4];
    game.phase = phase; game.power = power ?? null; game.president = president.id;
    if (scenario.dead) game.players.find(p => p.id === observer.id)!.alive = false;
    if (phase === 'voting') game.votes = { [observer.id]: true };
    if (phase === 'vote_result') {
      game.votes = Object.fromEntries(players.map(p => [p.id, true]));
      game.chancellor = players[1].id;
      game.events.push({ id: game.events.at(-1)!.id + 1, round: game.round, type: 'vote', text: '투표가 완료되었습니다.', votes: game.votes });
    }
    if (phase === 'night' || phase === 'vote_result') game.acknowledged = [observer.id];
    const session = (id: string) => ({ code, id, token });
    const members = [...players, ...(scenario.spectator ? [observer] : [])].map(p => ({ ...p, tokenHash: createHash('sha256').update(token).digest('hex'), ready: true, connected: true, bot: false, spectator: !!scenario.spectator && p.id === observer.id }));
    const room = { code, version: 1, hostId: president.id, members, settings: { maxPlayers: 5, timerSeconds: 0, language: 'ko' }, game, chat: [], paused: false, deadline: null, updated: Date.now(), created: Date.now(), processed: {} };
    writeFileSync(join(dataDir, `${code}.jsonl`), JSON.stringify({ state: room }) + '\n');
    const server = createGameServer({ dataDir, botDelayMs: 1000000 });
    await new Promise<void>(resolve => server.server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${(server.server.address() as { port: number }).port}`;
    const actor = io(origin, { path: '/secret_hitler/socket.io', transports: ['websocket'], forceNew: true, autoConnect: false });
    const call = (socket: Socket, event: string, data: unknown) => new Promise<void>((resolve, reject) => socket.timeout(5000).emit(event, data, (err: Error | null, ack: { ok: boolean; error?: string }) => err ? reject(err) : ack.ok ? resolve() : reject(Error(ack.error))));
    let actorView: RoomView | undefined, observerView: RoomView | undefined;
    actor.on('ROOM_STATE', value => actorView = value);
    page.on('websocket', socket => socket.on('framereceived', ({ payload }) => {
      if (typeof payload !== 'string' || !payload.startsWith('42')) return;
      try { const [event, value] = JSON.parse(payload.slice(2)); if (event === 'ROOM_STATE') observerView = value; } catch {}
    }));
    const actorContext = await browser.newContext();
    const auxiliaries: Socket[] = [];
    try {
      await new Promise<void>((resolve, reject) => { actor.once('connect', resolve); actor.once('connect_error', reject); actor.connect(); });
      await call(actor, 'RESUME', session(president.id));
      for (const player of players.filter(p => p.id !== president.id && p.id !== observer.id)) {
        const client = io(origin, { path: '/secret_hitler/socket.io', transports: ['websocket'], forceNew: true, autoConnect: false });
        auxiliaries.push(client);
        await new Promise<void>((resolve, reject) => { client.once('connect', resolve); client.once('connect_error', reject); client.connect(); });
        await call(client, 'RESUME', session(player.id));
      }
      await page.addInitScript(({ value, reduced }) => {
        localStorage.setItem('sh-session', JSON.stringify(value));
        localStorage.setItem('sh-reduce', reduced ? '1' : '0');
      }, { value: session(observer.id), reduced });
      await page.goto(`${origin}/secret_hitler/`);
      const progress = page.locator('.activity-progress');
      await expect(progress.locator('.activity-copy > strong')).toContainText(scenario.title);
      if (power) await expect(page.locator('.phase-name')).toContainText(president.name);
      await progress.scrollIntoViewIfNeeded();
      await expect(progress).toBeInViewport();
      expect(await progress.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
      if (['night', 'voting', 'vote_result'].includes(phase)) {
        await expect(progress.locator('.activity-count')).toContainText('1 / 5');
        // The count updates on another participant's actual submission.
        await call(actor, 'ACTION', { version: actorView!.game!.version, requestId: randomUUID(), action: phase === 'voting' ? { type: 'vote', ja: false } : { type: 'acknowledge' } });
        await expect(progress.locator('.activity-count')).toContainText('2 / 5');
      } else {
        await expect(progress.locator('.activity-owner')).toContainText(president.name);
        await actorContext.addInitScript(value => localStorage.setItem('sh-session', JSON.stringify(value)), session(president.id));
        const actorPage = await actorContext.newPage();
        await actorPage.goto(`${origin}/secret_hitler/`);
        await expect(actorPage.locator('.action-panel fieldset button').first()).toBeVisible();
        await expect(actorPage.locator('.activity-progress')).toHaveCount(phase === 'nomination' ? 1 : 0);
        if (power === 'peek' || power === 'investigate') {
          const target = players[1];
          if (power === 'peek') await actorPage.getByRole('button', { name: '정책 엿보기', exact: true }).click();
          else {
            await actorPage.locator(`[data-seat-id="${target.id}"]`).click();
            await expect(actorPage.locator('.hold-sign')).toBeEnabled();
            await expect(progress.locator('.activity-target')).toContainText(target.name);
            await actorPage.locator('.hold-sign').focus();
            await actorPage.keyboard.down('Space');
            await actorPage.waitForTimeout(750);
            await actorPage.keyboard.up('Space');
          }
          await expect(actorPage.locator('.private-result')).toBeVisible();
          await expect(page.locator('.scene')).toHaveCount(0);
          await expect(progress.locator('.activity-copy > strong')).toContainText(scenario.title);
          await expect(page.locator('.private-result, .peek-fan, .party-card, .policy-face')).toHaveCount(0);
          expect(observerView?.game?.privateResult).toBeUndefined();
          expect(observerView?.game?.hand).toBeUndefined();
          await page.screenshot({ path: `test-results/activity-${power}-${scenario.spectator ? 'spectator' : scenario.dead ? 'dead' : width}.png` });
          await actorPage.getByRole('button', { name: '열람 완료', exact: true }).click();
          await expect.poll(() => observerView?.game?.phase).not.toBe('executive');
          await expect(page.locator(`.activity-progress[data-activity="${power}"]`)).toHaveCount(0);
        }
      }
      if (reduced) await expect(progress.locator('.activity-indicator i').first()).toHaveCSS('animation-name', 'none');
    } finally {
      await page.goto('about:blank'); await actorContext.close(); actor.disconnect(); auxiliaries.forEach(client => client.disconnect()); await server.close(); rmSync(dataDir, { recursive: true, force: true });
    }
  });
}
