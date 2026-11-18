import { test, expect } from "@playwright/test";
import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createGameServer } from "../../apps/server/src/server";
import { createGame, transition, eligibleChancellors } from "../../packages/rules-engine/src/index";

// Deterministic, private test server: exercise production rendering and real sockets.
test("모바일: 공유·고정 좌석·10인 결과 확인·정책 엿보기·도움말 예시", async ({ page }) => {
  const dataDir = mkdtempSync(join(tmpdir(), "sh-ui-"));
  const rng = () => .42;
  function fixture(code: string, n: number, mode: "nomination" | "voting" | "result" | "peek") {
    const token = `test-${code}-${"x".repeat(40)}`;
    const players = Array.from({ length: n }, (_, i) => ({ id: randomUUID(), name: `의원 ${i + 1}`, avatar: i }));
    let game = createGame(players, rng);
    for (const p of game.players) game = transition(game, p.id, { type: "acknowledge" }, rng);
    const selfId = players[0].id;
    game.president = selfId;
    if (mode === "result" || mode === "voting") {
      game = transition(game, selfId, { type: "nominate", target: eligibleChancellors(game)[0] }, rng);
      for (const [i, p] of game.players.entries()) {
        if (mode === "voting" && p.id === selfId) continue;
        game = transition(game, p.id, { type: "vote", ja: i < 6 }, rng);
      }
    }
    if (mode === "peek") {
      game.phase = "executive"; game.power = "peek";
      game = transition(game, selfId, { type: "power" }, rng);
    }
    const room = { code, version: 1, hostId: selfId, members: players.map((p) => ({ ...p, tokenHash: createHash("sha256").update(token).digest("hex"), ready: true, connected: true, bot: p.id !== selfId, spectator: false })), settings: { maxPlayers: 10, timerSeconds: 30, language: "ko" }, game, chat: [], paused: false, deadline: null, updated: Date.now(), created: Date.now(), processed: {} };
    writeFileSync(join(dataDir, `${code}.jsonl`), JSON.stringify({ state: room }) + "\n");
    return { code, id: selfId, token };
  }
  const nomination = fixture("ABCDEF", 10, "nomination");
  const result = fixture("GHJKLM", 10, "result");
  const peek = fixture("NPQRST", 5, "peek");
  const voting = fixture("UVWXYZ", 10, "voting");
  const server = createGameServer({ dataDir, botDelayMs: 1000000 });
  await new Promise<void>((resolve) => server.server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${(server.server.address() as { port: number }).port}`;
  async function open(session: typeof nomination, width = 390, height = 844) {
    await page.setViewportSize({ width, height });
    await page.goto(`${origin}/secret_hitler/`);
    await page.evaluate((value) => { localStorage.setItem("sh-session", JSON.stringify(value)); }, session);
    await page.reload();
    await expect(page.locator(".board")).toBeVisible();
  }
  try {
    await open(nomination);
    const before = await page.locator(".seat").evaluateAll((seats) => seats.map((s) => { const b = s.getBoundingClientRect(); return [b.x, b.y, b.width, b.height]; }));
    await page.locator(".seat.candidate").first().click();
    await expect(page.locator(".target-line")).toHaveCount(0);
    await expect(page.locator(".government-proposal .candidate b")).toHaveText("의원 2");
    const after = await page.locator(".seat").evaluateAll((seats) => seats.map((s) => { const b = s.getBoundingClientRect(); return [b.x, b.y, b.width, b.height]; }));
    expect(after).toEqual(before);
    await expect(page.getByRole("button", { name: "공개 조서" })).toHaveCount(0);

    for (const [width, height] of [[390, 844], [1440, 1050]]) {
      await open(voting, width, height);
      await expect(page.locator(".vote-down")).toHaveCount(9);
      await expect(page.locator(".rig-wrap")).toHaveClass(/dual/);
      await expect(page.locator(".rig .warm")).toHaveCount(2);
      // Let the lamps settle after the seat layout has been measured.
      await page.waitForTimeout(900);
      const lamps = await page.evaluate(() => {
        const center = (selector: string) => {
          const b = document.querySelector(selector)!.getBoundingClientRect();
          return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
        };
        return [
          [center(".seat.president"), center(".rig:not(.rig-secondary)")],
          [center(".seat.chancellor"), center(".rig-secondary")],
        ];
      });
      for (const [seat, lamp] of lamps) {
        expect(Math.abs(seat.x - lamp.x)).toBeLessThan(2);
        expect(Math.abs(seat.y - lamp.y)).toBeLessThan(2);
      }
      const namesVisible = await page.locator(".seat > strong").evaluateAll((names) => names.every((name) => {
        const b = name.getBoundingClientRect();
        return document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2) === name;
      }));
      expect(namesVisible).toBe(true);
      await page.screenshot({ path: `test-results/voting-${width}.png`, animations: "disabled" });
    }

    await open(result);
    await expect(page.locator(".ballot-flip")).toHaveCount(10);
    await expect(page.locator(".ballot-card")).toHaveCount(0);
    await page.waitForTimeout(5500);
    await expect(page.locator(".show-vote-result")).toBeVisible();
    const confirm = page.locator(".vote-confirm");
    await expect(confirm).toContainText("/10");
    const visible = await page.locator(".ballot-flip, .vote-confirm").evaluateAll((elements) => elements.every((el) => { const b = el.getBoundingClientRect(); return b.x >= 0 && b.right <= innerWidth && b.y >= 0 && b.bottom <= innerHeight; }));
    expect(visible).toBe(true);
    await page.screenshot({ path: "test-results/vote-result-mobile.png", animations: "disabled" });
    await confirm.click();
    await expect(confirm).toBeDisabled();
    await expect(confirm).toContainText("확인 완료");
    await page.reload();
    await expect(page.locator(".vote-confirm")).toBeDisabled();
    await expect(page.locator(".ballot-flip")).toHaveCount(10);

    await open(peek, 320, 667);
    await expect(page.locator(".peek-card")).toHaveCount(3);
    const boxes = await page.locator(".peek-card").evaluateAll((cards) => cards.map((card) => { const b = card.getBoundingClientRect(); return { left: b.left, right: b.right }; }));
    expect(boxes[0].left).toBeGreaterThanOrEqual(0);
    expect(boxes[2].right).toBeLessThanOrEqual(320);
    expect(boxes[1].left).toBeGreaterThanOrEqual(boxes[0].right);
    await expect(page.getByRole("button", { name: "열람 완료", exact: true })).toBeInViewport();
    await page.screenshot({ path: "test-results/peek-mobile.png", animations: "disabled" });
    await page.getByRole("button", { name: "규칙 열람", exact: true }).click();
    await expect(page.locator(".guide-step")).toHaveCount(11);
    await page.locator('.guide-step[data-guide-step="peek"] summary').click();
    await expect(page.locator(".guide-step[open]")).toContainText("왼쪽 1번");
    await expect(page.locator(".guide-step[open] .policy-face")).toHaveCount(3);
    await page.screenshot({ path: "test-results/help-mobile.png", animations: "disabled" });
  } finally { await page.goto("about:blank"); await server.close(); rmSync(dataDir, { recursive: true, force: true }); }
});

test("대기실 초대 공유와 복사 실패 시 링크 표시", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", { configurable: true, value: async (data: ShareData) => { (window as any).__sharedInvite = data; } });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw new Error("clipboard denied"); } } });
  });
  await page.goto("/secret_hitler/");
  await page.getByPlaceholder("의원 이름").fill("초대 테스트");
  await page.getByRole("button", { name: "새 의회 개설" }).click();
  await page.getByRole("button", { name: "초대 링크 공유" }).click();
  const shared = await page.evaluate(() => (window as any).__sharedInvite);
  expect(shared.url).toContain("?room=");
  await page.getByRole("button", { name: "초대 링크 복사" }).click();
  await expect(page.locator(".invite-url input")).toHaveValue(shared.url);
});
