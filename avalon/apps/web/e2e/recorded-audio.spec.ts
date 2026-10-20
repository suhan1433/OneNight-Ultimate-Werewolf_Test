import { expect, test, type Page } from '@playwright/test';
import type { ClientGameState, Phase } from '../../../packages/shared/src/types';

// Run against a freshly started Vite server with E2E_BASE_URL=http://127.0.0.1:5174.
function game(phase: Phase): ClientGameState {
  return {
    roomCode: 'SOUND', playerId: 'p0', hostId: 'p0', maxPlayers: 5, phase, stateVersion: 1,
    players: Array.from({ length: 5 }, (_, i) => ({ id: `p${i}`, nickname: `기사${i}`, ready: true, connected: true, isBot: false, isHost: i === 0, hasVoted: false, hasQuestCard: false })),
    selfRole: 'loyal', hasAssassinationAbility: false, roleIntel: [],
    options: { assassin: true, assassinationAbilityRole: null, percival: true, morgana: true, mordred: false, oberon: false, revealVoteIdentities: false },
    activeRoles: ['merlin', 'assassin', 'loyal'], round: 0, leaderId: 'p0', rejectCount: 0,
    results: [], roundHistory: [], roleConfirmedCount: 0, continueConfirmedCount: 0, hasContinued: false,
    questSize: 2, proposedTeam: ['p0', 'p1'], teamVotesCompleted: 0, questCardsCompleted: 0,
  };
}

async function setGame(page: Page, state: ClientGameState | null) {
  await page.evaluate(async state => {
    const path = '/avalon/src/store.ts';
    (await import(path)).useGame.getState().setGame(state);
  }, state);
}

async function tracks(page: Page) {
  return page.evaluate(() => (window as any).__recordings.map(({ audio, src }: { audio: HTMLAudioElement; src: string }) => ({
    src: decodeURI(src), paused: audio.paused, time: audio.currentTime, duration: audio.duration, loop: audio.loop, error: audio.error?.code,
  })) as Array<{ src: string; paused: boolean; time: number; duration: number; loop: boolean; error?: number }>);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).__recordings = [];
    const Native = window.Audio;
    (window as any).Audio = function (src: string) {
      const audio = new Native(src);
      (window as any).__recordings.push({ audio, src });
      return audio;
    };
  });
  await page.goto('/avalon/');
  await expect(page.getByRole('button', { name: '음향 설정', exact: true })).toBeVisible();
});

test('MP3 backgrounds play after a gesture, respect volume, switch scenes and stop on leave', async ({ page }) => {
  await setGame(page, game('lobby'));
  expect(await tracks(page)).toEqual([]);
  await page.getByRole('button', { name: '음향 설정', exact: true }).click();
  await expect.poll(async () => (await tracks(page)).some(t => t.src.includes('대기실_벽난로') && t.time > 0 && t.duration > 700 && t.loop)).toBe(true);
  await page.getByRole('slider', { name: '배경음', exact: true }).fill('0');
  await expect.poll(async () => (await tracks(page)).every(t => t.paused)).toBe(true);
  await page.getByRole('slider', { name: '배경음', exact: true }).fill('35');
  await expect.poll(async () => (await tracks(page)).some(t => !t.paused)).toBe(true);
  await page.getByRole('button', { name: '음향 설정 닫기' }).click();
  await setGame(page, game('team_build'));
  await expect.poll(async () => (await tracks(page)).some(t => t.src.includes('토론') && t.time > 0 && t.duration > 150)).toBe(true);
  expect((await tracks(page)).find(t => t.src.includes('대기실_벽난로'))?.paused).toBe(true);
  await setGame(page, game('quest'));
  expect((await tracks(page)).filter(t => t.src.includes('토론'))).toHaveLength(1);
  await setGame(page, game('assassination'));
  await expect.poll(async () => (await tracks(page)).some(t => t.src.includes('암살') && t.time > 0 && t.duration > 20)).toBe(true);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(async () => (await tracks(page)).every(t => t.paused)).toBe(true);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(async () => (await tracks(page)).some(t => t.src.includes('암살') && !t.paused)).toBe(true);
  await setGame(page, null);
  await expect.poll(async () => (await tracks(page)).every(t => t.paused)).toBe(true);
});

test('start bell, role reveal and vote landing use the provided effects without duplicate updates', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await setGame(page, game('lobby'));
  await page.getByRole('button', { name: '음향 설정', exact: true }).click();
  await page.getByRole('button', { name: '음향 설정 닫기' }).click();
  await setGame(page, game('role_reveal'));
  await expect.poll(async () => (await tracks(page)).some(t => t.src.includes('게임시작_종소리') && t.time > 0)).toBe(true);
  await page.getByRole('button', { name: '길게 누르기 어렵다면 — 탭으로 바로 확인' }).click();
  await expect.poll(async () => (await tracks(page)).some(t => t.src.includes('역할확인_카드넘어갈때') && t.duration > .5)).toBe(true);
  await setGame(page, game('team_vote'));
  const voted = { ...game('team_vote'), teamVotesCompleted: 1 };
  await setGame(page, voted);
  await expect.poll(async () => (await tracks(page)).some(t => t.src.includes('투표_코인착지음') && t.time > 0)).toBe(true);
  await setGame(page, { ...voted, stateVersion: 2 });
  expect((await tracks(page)).filter(t => t.src.includes('투표_코인착지음'))).toHaveLength(1);
});

test('ending MP3 waits for the title and plays once when the ending is skipped', async ({ page }) => {
  await setGame(page, game('quest'));
  await page.getByRole('button', { name: '음향 설정', exact: true }).click();
  await page.getByRole('button', { name: '음향 설정 닫기' }).click();
  await setGame(page, { ...game('result'), winner: 'good', winReason: '원정 성공' });
  expect((await tracks(page)).filter(t => t.src.includes('엔딩'))).toHaveLength(0);
  await page.getByRole('button', { name: '엔딩 바로 보기' }).click();
  await expect.poll(async () => (await tracks(page)).some(t => t.src.includes('엔딩') && t.time > 0 && t.duration > 7)).toBe(true);
  await setGame(page, { ...game('result'), winner: 'good', winReason: '원정 성공', stateVersion: 2 });
  expect((await tracks(page)).filter(t => t.src.includes('엔딩'))).toHaveLength(1);
});
