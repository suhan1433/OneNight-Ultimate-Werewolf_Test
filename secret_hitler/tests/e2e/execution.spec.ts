import { test, expect } from '@playwright/test';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { io, type Socket } from 'socket.io-client';
import { createGameServer } from '../../apps/server/src/server';
import { createGame } from '../../packages/rules-engine/src/index';

for (const [width, height, reduced] of [[390, 844, false], [1440, 1050, false], [844, 390, true]] as const) {
  test(`처형 장면 ${width}px · 모션 줄임 ${reduced}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
    const dataDir = mkdtempSync(join(tmpdir(), 'sh-execution-'));
    const token = `test-${'x'.repeat(40)}`, code = 'ABCDEF';
    const players = Array.from({ length: 5 }, (_, i) => ({ id: randomUUID(), name: `의원 ${i + 1}`, avatar: i }));
    const game = createGame(players, () => .42);
    const president = players[0], observer = players[4];
    const target = game.players.find(p => p.id !== president.id && p.id !== observer.id && p.role !== 'hitler')!;
    game.phase = 'executive'; game.power = 'execute'; game.president = president.id;
    const session = (id: string) => ({ code, id, token });
    const room = { code, version: 1, hostId: president.id, members: players.map(p => ({ ...p, tokenHash: createHash('sha256').update(token).digest('hex'), ready: true, connected: true, bot: ![president.id, observer.id].includes(p.id), spectator: false })), settings: { maxPlayers: 5, timerSeconds: 0, language: 'ko' }, game, chat: [], paused: false, deadline: null, updated: Date.now(), created: Date.now(), processed: {} };
    writeFileSync(join(dataDir, `${code}.jsonl`), JSON.stringify({ state: room }) + '\n');
    const server = createGameServer({ dataDir, botDelayMs: 1000000 });
    await new Promise<void>(resolve => server.server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${(server.server.address() as { port: number }).port}`;
    const actor = io(origin, { path: '/secret_hitler/socket.io', transports: ['websocket'], forceNew: true, autoConnect: false });
    const call = (socket: Socket, event: string, data: unknown) => new Promise<void>((resolve, reject) => socket.timeout(5000).emit(event, data, (err: Error | null, ack: { ok: boolean; error?: string }) => err ? reject(err) : ack.ok ? resolve() : reject(Error(ack.error))));
    try {
      await new Promise<void>((resolve, reject) => { actor.once('connect', resolve); actor.once('connect_error', reject); actor.connect(); });
      await call(actor, 'RESUME', session(president.id));
      await page.addInitScript(({ value, reduced }) => {
        localStorage.setItem('sh-session', JSON.stringify(value));
        localStorage.setItem('sh-reduce', reduced ? '1' : '0');
      }, { value: session(observer.id), reduced });
      await page.goto(`${origin}/secret_hitler/`);
      await expect(page.locator(`[data-seat-id="${target.id}"]`)).toBeVisible();
      await call(actor, 'ACTION', { version: game.version, requestId: randomUUID(), action: { type: 'power', target: target.id } });
      const scene = page.locator('.sc-exec');
      await expect(scene).toBeVisible();
      await expect(scene.locator('h2')).toHaveText(target.name);
      await expect(scene.locator('.exec-file .portrait')).toBeVisible();
      await expect(scene.locator('.exec-tableau')).toBeVisible();
      expect(await scene.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
      if (!reduced) {
        await expect(scene.locator('.exec-pending')).toHaveCSS('opacity', '1');
        await page.screenshot({ path: `test-results/execution-before-${width}.png` });
      }
      await expect(scene.locator('.exec-complete')).toHaveCSS('opacity', '1');
      await page.screenshot({ path: `test-results/execution-after-${width}.png` });
      if (reduced) {
        await expect(scene.locator('.exec-person')).toHaveCSS('animation-name', 'none');
      }
      await expect(scene).toHaveCount(0);
      await expect(page.locator(`[data-seat-id="${target.id}"]`)).toHaveClass(/dead/);
    } finally {
      await page.goto('about:blank'); actor.disconnect(); await server.close(); rmSync(dataDir, { recursive: true, force: true });
    }
  });
}
