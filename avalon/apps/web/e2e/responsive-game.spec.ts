import { expect, test, type Page } from '@playwright/test';
import type { ClientGameState } from '../../../packages/shared/src/types';

function game(phase: ClientGameState['phase'] = 'team_vote'): ClientGameState {
  return {
    roomCode: 'UITEST', playerId: 'p0', hostId: 'p0', maxPlayers: 5, phase, stateVersion: 1,
    players: Array.from({ length: 5 }, (_, i) => ({ id: `p${i}`, nickname: `기사${i}`, ready: true, connected: true, isBot: false, isHost: i === 0, hasVoted: false, hasQuestCard: false })),
    selfRole: 'minion', hasAssassinationAbility: false, roleIntel: [],
    options: { assassin: true, assassinationAbilityRole: null, percival: false, morgana: false, mordred: false, oberon: false, revealVoteIdentities: true },
    activeRoles: ['merlin', 'assassin', 'minion', 'loyal'], round: 0, leaderId: 'p0', rejectCount: 0,
    results: [], roundHistory: [], roleConfirmedCount: 5, continueConfirmedCount: 0, hasContinued: false,
    questSize: 2, proposedTeam: ['p0', 'p1'], teamVotesCompleted: 0, questCardsCompleted: 0,
    chat: [{ id: 'm1', playerId: 'p1', nickname: '기사1', text: '이번 원정대에 대해 이야기해요.', at: Date.now() }],
  };
}

async function setGame(page: Page, state: ClientGameState) {
  await page.evaluate(async state => {
    const path = '/avalon/src/store.ts';
    (await import(path)).useGame.getState().setGame(state);
  }, state);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/avalon/');
  await expect(page.getByRole('button', { name: '음향 설정', exact: true })).toBeVisible();
  await page.evaluate(async () => {
    const path = '/avalon/src/socket.ts';
    const { socket } = await import(path);
    const original = socket.emit.bind(socket);
    (window as any).__votes = [];
    socket.emit = (event: string, ...args: any[]) => {
      if (event === 'TEAM_VOTE') {
        (window as any).__votes.push(args[0]);
        (window as any).__finishVote = args[1];
        return socket;
      }
      if (event === 'CHAT_SEND') {
        args[1]?.({ ok: true });
        return socket;
      }
      return original(event, ...args);
    };
  });
});

test('a delayed vote immediately locks both controls, and a rejection allows retry', async ({ page }) => {
  await setGame(page, game());
  await page.locator('.token.approve').click();
  await page.getByRole('button', { name: '원정 투표하기' }).click();
  await expect(page.locator('.vote-stage [role="status"]')).toContainText('투표 제출 중');
  await expect(page.locator('.chat-panel .ac-act button')).toBeDisabled();
  expect(await page.evaluate(() => (window as any).__votes.length)).toBe(1);
  await page.evaluate(() => (window as any).__finishVote(null, { ok: false, error: '다시 시도해주세요.' }));
  await expect(page.getByRole('button', { name: '원정 투표하기' })).toBeEnabled();
  await page.getByRole('button', { name: '원정 투표하기' }).click();
  expect(await page.evaluate(() => (window as any).__votes.length)).toBe(2);
  const state = game(); state.players[0].hasVoted = true; state.teamVotesCompleted = 1;
  await setGame(page, state);
  await page.evaluate(() => (window as any).__finishVote(null, { ok: true }));
  await expect(page.locator('.vote-stage [role="status"]')).toContainText('다른 기사를 기다리는 중');
});

test('vote results start immediately and can be shown without waiting for the cinematic', async ({ page }) => {
  await setGame(page, game());
  await page.locator('.token.reject').scrollIntoViewIfNeeded();
  const state = game('vote_result');
  state.teamVotesCompleted = 5;
  state.players.forEach(player => player.hasVoted = true);
  // A server without identity data must still start the result immediately.
  state.voteResult = { approve: 3, reject: 2, passed: true };
  await setGame(page, state);
  await expect(page.getByRole('button', { name: '투표 결과 바로 보기' })).toBeVisible({ timeout: 700 });
  expect(await page.locator('.vt').evaluate(el => el.getBoundingClientRect().top)).toBeGreaterThanOrEqual(-1);
  await page.getByRole('button', { name: '투표 결과 바로 보기' }).click();
  await expect(page.locator('.vt-summary')).toHaveCSS('opacity', '1');
  await expect(page.locator('.vt-continue')).toHaveCSS('opacity', '1');
  await expect(page.locator('.chat-panel .ac-act-go')).toHaveText('계속');
});

for (const width of [320, 390, 768, 1440]) {
  test(`choices retain their proportions at ${width}px, including selected choices`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await setGame(page, game());
    const token = page.locator('.token.approve');
    await token.click();
    await expect.poll(async () => token.evaluate(el => Number.parseFloat(getComputedStyle(el).scale))).toBeCloseTo(1.04);
    const coin = await token.boundingBox();
    expect(coin!.width / coin!.height).toBeCloseTo(1, 1);
    expect(coin!.width).toBeLessThan(110);
    await setGame(page, game('quest'));
    const card = page.locator('.qcard.success');
    await card.click();
    await expect.poll(async () => card.evaluate(el => Number.parseFloat(getComputedStyle(el).scale))).toBeCloseTo(1.04);
    for (const choice of await page.locator('.qcard').all()) {
      const box = await choice.boundingBox();
      expect(box!.height / box!.width).toBeCloseTo(1.4, 1);
      expect(box!.width).toBeLessThan(143);
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    }
  });
}

test('chat leaves the board visible, keeps drafts and fits a multiline dock', async ({ page }) => {
  await setGame(page, game('team_build'));
  const input = page.getByRole('textbox', { name: '채팅 메시지' });
  await input.fill('원정대는\n누구로 할까요?\n계속 이야기해요');
  const panel = page.locator('.chat-panel');
  await expect.poll(async () => panel.evaluate(el => el.getBoundingClientRect().bottom - (visualViewport?.height ?? innerHeight))).toBeLessThanOrEqual(1);
  await page.getByRole('button', { name: '지난 대화 보기' }).click();
  await expect(panel).toHaveAttribute('data-size', 'half');
  const box = await panel.boundingBox();
  expect(box!.height).toBeLessThanOrEqual(page.viewportSize()!.height / 2);
  await expect(page.getByText('이번 원정대에 대해 이야기해요.', { exact: true })).toBeVisible();
  await expect(input).toHaveValue('원정대는\n누구로 할까요?\n계속 이야기해요');
  await page.getByRole('button', { name: '채팅 접기', exact: true }).last().click();
  await expect(panel).toHaveAttribute('data-size', 'mini');
  await expect(input).toHaveValue('원정대는\n누구로 할까요?\n계속 이야기해요');
});

test('chat follows a smaller keyboard viewport while leaving the board scrollable', async ({ page }) => {
  await setGame(page, game('team_build'));
  await page.getByRole('button', { name: '지난 대화 보기' }).click();
  const panel = page.locator('.chat-panel');
  await page.evaluate(() => {
    const viewport = visualViewport!;
    Object.defineProperty(viewport, 'height', { configurable: true, value: 360 });
    Object.defineProperty(viewport, 'offsetTop', { configurable: true, value: 24 });
    viewport.dispatchEvent(new Event('resize'));
  });
  await expect(panel).toHaveAttribute('data-keyboard', 'true');
  await expect.poll(async () => panel.evaluate(el => Math.round(el.getBoundingClientRect().bottom))).toBe(384);
  const box = await panel.boundingBox();
  expect(box!.y).toBeGreaterThan(100);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflowY)).not.toBe('hidden');
  const input = await page.getByRole('textbox', { name: '채팅 메시지' }).boundingBox();
  expect(input!.y + input!.height).toBeLessThan(384);
});
