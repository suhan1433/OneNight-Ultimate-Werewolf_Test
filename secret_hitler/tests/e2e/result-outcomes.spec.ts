import { test, expect } from '@playwright/test';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGameServer } from '../../apps/server/src/server';
import { createGame } from '../../packages/rules-engine/src/index';
import { copy } from '../../apps/client/src/i18n';
import type { Party, Role } from '../../packages/shared-types/src/index';

const scenarios: { winner: Party | null; width: number; reduced?: boolean; viewer?: number; spectator?: boolean; en?: boolean }[] = [
  { winner: 'liberal', width: 390 },
  { winner: 'fascist', width: 1440, viewer: 1 },
  { winner: 'fascist', width: 844, reduced: true },
  { winner: null, width: 390 },
  { winner: 'fascist', width: 390, spectator: true },
  { winner: 'liberal', width: 390, en: true },
];
for (const scenario of scenarios) {
  test(`결과 승패 ${scenario.winner} ${scenario.width}px ${scenario.spectator ? '관전' : scenario.en ? '영문' : ''}`, async ({ page }) => {
    const { winner, width, reduced = false, en = false } = scenario;
    await page.setViewportSize({ width, height: width === 844 ? 390 : 900 });
    await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
    const dataDir = mkdtempSync(join(tmpdir(), 'sh-results-'));
    const token = `test-${'x'.repeat(40)}`, code = 'ABCDEF';
    const players = Array.from({ length: 5 }, (_, i) => ({ id: randomUUID(), name: `의원 ${i + 1}`, avatar: i }));
    const game = createGame(players, () => .42);
    const roles: Role[] = ['liberal', 'fascist', 'hitler', 'liberal', 'liberal'];
    game.players.forEach((p, i) => { p.role = roles[i]; p.alive = i >= 2; });
    game.phase = 'finished'; game.winner = winner;
    if (winner === 'liberal') game.liberal = 5;
    if (winner === 'fascist') game.fascist = 6;
    const viewer = scenario.spectator ? { id: randomUUID(), name: '관전자', avatar: 5 } : players[scenario.viewer ?? 0];
    const members = [...players, ...(scenario.spectator ? [viewer] : [])].map(p => ({ ...p, tokenHash: createHash('sha256').update(token).digest('hex'), ready: true, connected: true, bot: p.id !== viewer.id, spectator: !!scenario.spectator && p.id === viewer.id }));
    const room = { code, version: 1, hostId: players[0].id, members, settings: { maxPlayers: 5, timerSeconds: 0, language: en ? 'en' : 'ko' }, game, chat: [], paused: false, deadline: null, updated: Date.now(), created: Date.now(), processed: {} };
    writeFileSync(join(dataDir, `${code}.jsonl`), JSON.stringify({ state: room }) + '\n');
    const server = createGameServer({ dataDir, botDelayMs: 1000000 });
    await new Promise<void>(resolve => server.server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${(server.server.address() as { port: number }).port}`;
    try {
      await page.addInitScript(({ value, reduced }) => { localStorage.setItem('sh-session', JSON.stringify(value)); localStorage.setItem('sh-reduce', reduced ? '1' : '0'); }, { value: { code, id: viewer.id, token }, reduced });
      await page.goto(`${origin}/secret_hitler/`);
      await expect(page.locator('.result-player')).toHaveCount(5);
      await expect(page.locator('.scene')).toHaveCount(0);
      for (const [i, player] of game.players.entries()) {
        const team = player.role === 'liberal' ? 'liberal' : 'fascist';
        const outcome = winner ? team === winner ? 'winner' : 'loser' : 'neutral';
        const card = page.locator(`[data-player-id="${player.id}"]`);
        await expect(card).toHaveAttribute('data-outcome', outcome);
        await expect(card.locator('.result-defeat-mark')).toHaveCount(outcome === 'loser' ? 1 : 0);
        await expect(card.locator('.result-victor-seal')).toHaveCount(outcome === 'winner' ? 1 : 0);
        await expect(card.locator('.result-player-outcome')).toContainText(outcome === 'winner' ? en ? 'Victory' : '승리' : outcome === 'loser' ? en ? 'Defeat' : '패배' : '승부 미결정');
        // Dead players still win with their team; Hitler belongs to the Fascist team.
        await expect(card.locator('.result-player-state')).toContainText(i < 2 ? en ? 'Executed' : '처형됨' : en ? 'Survived' : '생존');
      }
      if (winner) {
        await expect(page.locator('.result-team-summary .winning-team b')).toHaveText(copy[en ? 'en' : 'ko'][winner]);
        await expect(page.locator('.result-personal')).toHaveCount(scenario.spectator ? 0 : 1);
        if (!scenario.spectator) {
          const role = roles[scenario.viewer ?? 0];
          const won = (role === 'liberal' ? 'liberal' : 'fascist') === winner;
          await expect(page.locator('.result-personal')).toHaveClass(new RegExp(won ? 'won' : 'lost'));
        }
      } else await expect(page.locator('.result-outcome-summary, .result-defeat-mark, .result-victor-seal')).toHaveCount(0);
      const grid = page.locator('.result-roles');
      await grid.scrollIntoViewIfNeeded();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (reduced) await expect(page.locator('.result-cross').first()).toHaveCSS('animation-name', 'none');
      await page.screenshot({ path: `test-results/results-${winner}-${width}-${en ? 'en' : scenario.spectator ? 'spectator' : 'ko'}.png`, fullPage: true, animations: 'disabled' });
    } finally {
      await page.goto('about:blank'); await server.close(); rmSync(dataDir, { recursive: true, force: true });
    }
  });
}
