import { expect, test, type Page } from '@playwright/test';
import type { ClientGameState, Phase, RoleType } from '../../../packages/shared/src/types';

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
  return page.evaluate(() => (window as any).__recordings.map(({ audio, src, pauses }: { audio: HTMLAudioElement; src: string; pauses: number }) => ({
    src: decodeURI(src), paused: audio.paused, time: audio.currentTime, duration: audio.duration, loop: audio.loop, error: audio.error?.code, pauses,
  })) as Array<{ src: string; paused: boolean; time: number; duration: number; loop: boolean; error?: number; pauses: number }>);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).__recordings = [];
    const Native = window.Audio;
    (window as any).Audio = function (src: string) {
      const audio = new Native(src);
      const record = { audio, src, pauses: 0 };
      audio.addEventListener('pause', () => record.pauses++);
      (window as any).__recordings.push(record);
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

test('start bell, role voice and vote landing use the provided effects without duplicate updates', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await setGame(page, game('lobby'));
  await page.getByRole('button', { name: '음향 설정', exact: true }).click();
  await page.getByRole('button', { name: '음향 설정 닫기' }).click();
  await setGame(page, { ...game('role_reveal'), selfRole: 'merlin' });
  await expect.poll(async () => (await tracks(page)).some(t => t.src.includes('게임시작_종소리') && t.time > 0)).toBe(true);
  expect((await tracks(page)).find(t => t.src.includes('대기실_벽난로'))?.paused).toBe(false);
  expect((await tracks(page)).find(t => t.src.includes('대기실_벽난로'))?.pauses).toBe(0);
  await page.getByRole('button', { name: '길게 누르기 어렵다면 — 탭으로 바로 확인' }).click();
  await expect.poll(async () => (await tracks(page)).some(t => t.src.includes('avalon_role_mp3/멀린.mp3') && t.duration > 0)).toBe(true);
  expect((await tracks(page)).filter(t => t.src.includes('역할확인_카드넘어갈때'))).toHaveLength(0);
  await setGame(page, game('team_vote'));
  const voted = { ...game('team_vote'), teamVotesCompleted: 1 };
  await setGame(page, voted);
  await expect.poll(async () => (await tracks(page)).some(t => t.src.includes('투표_코인착지음') && t.time > 0)).toBe(true);
  await setGame(page, { ...voted, stateVersion: 2 });
  expect((await tracks(page)).filter(t => t.src.includes('투표_코인착지음'))).toHaveLength(1);
});

for (const [role, name] of Object.entries({ merlin: '멀린', percival: '퍼시벌', assassin: '암살자', morgana: '모르가나', mordred: '모드레드', oberon: '오베론' })) {
  test(`${name} recording plays only when the role card is revealed`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const state = { ...game('role_reveal'), selfRole: role as RoleType };
    await setGame(page, state);
    expect((await tracks(page)).filter(t => t.src.includes('avalon_role_mp3'))).toHaveLength(0);
    await page.getByRole('button', { name: '길게 누르기 어렵다면 — 탭으로 바로 확인' }).click();
    await expect.poll(async () => (await tracks(page)).some(t => t.src.includes(`avalon_role_mp3/${name}.mp3`) && t.time > 0 && t.duration > 0)).toBe(true);
    await setGame(page, { ...state, stateVersion: 2 });
    expect((await tracks(page)).filter(t => t.src.includes('avalon_role_mp3'))).toHaveLength(1);
    await setGame(page, game('team_build'));
    await expect.poll(async () => (await tracks(page)).filter(t => t.src.includes('avalon_role_mp3')).every(t => t.paused)).toBe(true);
  });
}

test('ending MP3 waits for the title and plays once when the ending is skipped', async ({ page }) => {
  await setGame(page, game('quest'));
  await page.getByRole('button', { name: '음향 설정', exact: true }).click();
  await page.getByRole('button', { name: '음향 설정 닫기' }).click();
  await setGame(page, { ...game('result'), winner: 'good', winReason: '원정 성공' });
  expect((await tracks(page)).filter(t => t.src.includes('엔딩'))).toHaveLength(0);
  await page.getByRole('button', { name: '엔딩 바로 보기' }).click();
  await expect.poll(async () => (await tracks(page)).some(t => t.src.includes('엔딩') && t.time > 0 && t.duration > 7)).toBe(true);
  expect((await tracks(page)).find(t => t.src.includes('토론'))?.paused).toBe(false);
  expect((await tracks(page)).find(t => t.src.includes('토론'))?.pauses).toBe(0);
  await setGame(page, { ...game('result'), winner: 'good', winReason: '원정 성공', stateVersion: 2 });
  expect((await tracks(page)).filter(t => t.src.includes('엔딩'))).toHaveLength(1);
});

test('background never pauses or restarts during vote, quest and assassination reveal effects', async ({ page }) => {
  await setGame(page, game('team_build'));
  await page.getByRole('button', { name: '음향 설정', exact: true }).click();
  await page.getByRole('button', { name: '음향 설정 닫기' }).click();
  await expect.poll(async () => (await tracks(page)).some(t => t.src.includes('토론') && t.time > 0)).toBe(true);
  const initialTime = (await tracks(page)).find(t => t.src.includes('토론'))!.time;
  await setGame(page, game('team_vote'));
  await setGame(page, { ...game('vote_result'), voteResult: { approve: 3, reject: 2, passed: true } });
  // Observe the actual cinematic silence window, rather than emulating it.
  await page.waitForFunction(() => document.documentElement.hasAttribute('data-vt-still'));
  expect((await tracks(page)).find(t => t.src.includes('토론'))?.paused).toBe(false);
  await page.waitForFunction(() => !document.documentElement.hasAttribute('data-vt-still'));
  await setGame(page, game('quest'));
  await setGame(page, { ...game('quest_result'), questResult: { fails: 0, success: true } });
  await page.waitForFunction(() => document.documentElement.hasAttribute('data-cs-still'));
  expect((await tracks(page)).find(t => t.src.includes('토론'))?.paused).toBe(false);
  await page.waitForFunction(() => !document.documentElement.hasAttribute('data-cs-still'));
  await setGame(page, { ...game('team_build'), round: 1 });
  const discussion = (await tracks(page)).filter(t => t.src.includes('토론'));
  expect(discussion).toHaveLength(1);
  expect(discussion[0]!.pauses).toBe(0);
  expect(discussion[0]!.time).toBeGreaterThan(initialTime + 4);
  await setGame(page, game('assassination'));
  await expect.poll(async () => (await tracks(page)).some(t => t.src.includes('암살') && t.time > 0)).toBe(true);
  const beforeLock = (await tracks(page)).find(t => t.src.includes('암살'))!.time;
  await page.evaluate(async () => {
    const path = '/avalon/src/socket.ts';
    const { socket } = await import(path);
    // Dispatch the same public event the server sends when the target is locked.
    socket.emitEvent(['ASSASSIN_AIM', { roomCode: 'SOUND', targetId: 'p1', actorId: 'p2', locked: true }]);
  });
  await page.waitForFunction(() => document.documentElement.hasAttribute('data-cs-still'));
  await expect.poll(async () => (await tracks(page)).find(t => t.src.includes('암살'))!.time).toBeGreaterThan(beforeLock + .3);
  expect((await tracks(page)).find(t => t.src.includes('암살'))?.pauses).toBe(0);
});

test('an outgoing background keeps playing while the next recording loads', async ({ page }) => {
  await setGame(page, game('lobby'));
  await page.getByRole('button', { name: '음향 설정', exact: true }).click();
  await page.getByRole('button', { name: '음향 설정 닫기' }).click();
  await expect.poll(async () => (await tracks(page)).some(t => t.src.includes('대기실_벽난로') && t.time > 0)).toBe(true);
  let release!: () => void;
  let requested = false;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  await page.route(url => decodeURI(url.pathname).includes('토론') && url.pathname.endsWith('.mp3'), async route => {
    requested = true;
    await waiting;
    await route.continue();
  });
  try {
    await setGame(page, game('team_build'));
    await expect.poll(() => requested).toBe(true);
    const before = (await tracks(page)).find(t => t.src.includes('대기실_벽난로'))!.time;
    await expect.poll(async () => (await tracks(page)).find(t => t.src.includes('대기실_벽난로'))!.time).toBeGreaterThan(before + .3);
    expect((await tracks(page)).find(t => t.src.includes('대기실_벽난로'))?.paused).toBe(false);
  } finally { release(); }
  await expect.poll(async () => (await tracks(page)).some(t => t.src.includes('토론') && t.time > 0)).toBe(true);
  expect((await tracks(page)).find(t => t.src.includes('대기실_벽난로'))?.paused).toBe(true);
});
