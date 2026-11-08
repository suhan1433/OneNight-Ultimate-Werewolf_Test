import {
  test,
  expect,
  type Browser,
  type Page,
  type BrowserContext,
} from "@playwright/test";
import { content, type RoomView } from "@deception/shared";
import { mkdir } from "node:fs/promises";
const shots = "../../docs/screenshots";
interface User {
  page: Page;
  context: BrowserContext;
  view: RoomView | null;
  errors: string[];
}
async function user(
  browser: Browser,
  width = 390,
  height = 844,
): Promise<User> {
  const context = await browser.newContext({
    viewport: { width, height },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const record: User = { page, context, view: null, errors: [] };
  page.on("pageerror", (e) => record.errors.push(e.message));
  page.on("websocket", (ws) =>
    ws.on("framereceived", (event) => {
      const data = event.payload.toString();
      if (data.startsWith("42")) {
        try {
          const [event, view] = JSON.parse(data.slice(2));
          if (event === "state") record.view = view;
        } catch {
          /* transport control frame */
        }
      }
    }),
  );
  await page.goto("/");
  await expect(page.getByLabel("닉네임")).toBeVisible();
  return record;
}
async function hold(page: Page, selector: string, duration = 650) {
  const locator = page.locator(selector);
  await locator.scrollIntoViewIfNeeded();
  const rect = await locator.boundingBox();
  if (!rect) throw new Error("Missing hold target");
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(duration);
  await page.mouse.up();
}

test("6 users complete all three rounds without solving", async ({
  browser,
}) => {
  await mkdir(shots, { recursive: true });
  const { users } = await setup(browser, 6);
  try {
    const { forensic, investigator } = await start(users);
    for (let round = 1; round <= 3; round++) {
      if (round > 1) {
        await expect
          .poll(() => forensic.view?.game?.phase)
          .toBe("ROUND_TRANSITION");
        await forensic.page
          .getByRole("button", { name: /교체 →/ })
          .first()
          .click();
        await forensic.page.locator(".tile-options button").first().click();
        await hold(forensic.page, ".tile .hold");
      }
      for (const u of users)
        await u.page.getByRole("button", { name: /발표 하기/ }).click();
      for (let i = 0; i < 5; i++) {
        await expect
          .poll(() => forensic.view?.game?.phase)
          .toBe("PRESENTATION");
        const presenter = users.find(
          (u) => u.view!.selfId === forensic.view!.game!.presenterId,
        )!;
        await expect(presenter.page.getByLabel("채팅 메시지")).toBeEnabled();
        await presenter.page.getByRole("button", { name: "발표 마침" }).click();
        await expect
          .poll(() => forensic.view?.game?.presenterId)
          .not.toBe(presenter.view!.selfId);
      }
    }
    await expect(
      investigator.page.getByRole("heading", { name: "범인팀 승리" }),
    ).toBeVisible();
    await investigator.page.screenshot({
      path: `${shots}/result-final-round-390.png`,
    });
    users.forEach((u) => expect(u.errors).toEqual([]));
  } finally {
    for (const u of users) await u.context.close();
  }
});
async function setup(browser: Browser, count: number) {
  const users: User[] = [];
  for (let i = 0; i < count; i++)
    users.push(await user(browser, i === 0 ? 360 : 390, i === 0 ? 640 : 844));
  const host = users[0];
  await host.page.getByLabel("닉네임").fill("형사01");
  await host.page.getByRole("button", { name: "수사실 만들기" }).click();
  await expect(host.page.locator(".room-code")).toBeVisible();
  const code = (await host.page.locator(".room-code").innerText()).match(
    /\d{4}/,
  )![0];
  for (let i = 1; i < count; i++) {
    await users[i].page
      .getByLabel("닉네임")
      .fill(`형사${String(i + 1).padStart(2, "0")}`);
    await users[i].page.getByLabel("방 코드", { exact: true }).fill(code);
    await users[i].page.getByRole("button", { name: "코드로 입장" }).click();
    await expect(users[i].page.locator(".room-code")).toHaveText(
      `ROOM ${code}`,
    );
  }
  await expect(host.page.locator(".member-card")).toHaveCount(count);
  return { users, host, code };
}
async function start(users: User[], inspectComparison?: (forensic: User) => Promise<void>) {
  for (const u of users)
    await u.page.getByRole("button", { name: "준비하기", exact: true }).click();
  await users[0].page.getByRole("button", { name: "사건 시작" }).click();
  for (const u of users) {
    await expect(u.page.getByLabel("누르는 동안 비밀 역할 보기")).toBeVisible();
    await hold(u.page, ".role-dossier", 100);
    await u.page.getByRole("button", { name: "역할을 확인했어요" }).click();
  }
  await expect
    .poll(() => users.every((u) => u.view?.game?.phase === "CRIME_NIGHT"))
    .toBe(true);
  const murderer = users.find(
    (u) => u.view!.game!.private.myRole === "murderer",
  )!;
  const forensic = users.find(
    (u) => u.view!.game!.private.myRole === "forensic",
  )!;
  await expect(murderer.page.locator(".night-cards")).toBeVisible();
  await expect(murderer.page.locator(".night-cards .card-art")).toHaveCount(8);
  await murderer.page.getByRole("button", { name: "다른 사람 공개 카드 보기" }).click();
  const comparison = murderer.page.getByRole("dialog", { name: "범행 선택 · 공개 카드 비교" });
  await expect(comparison.locator(".comparison-card")).toHaveCount((users.length - 1) * 8);
  const crimeCards = murderer.view!.game!.players.find((p) => p.id === murderer.view!.selfId)!.cards;
  await comparison.getByLabel("비교 중 핵심 단서").selectOption(crimeCards.find((c) => c.kind === "clue")!.id);
  await comparison.getByLabel("비교 중 범행 수단").selectOption(crimeCards.find((c) => c.kind === "means")!.id);
  await expect(comparison.getByRole("button", { name: "확정하고 다음 단계", exact: true })).toBeEnabled();
  if (murderer.view!.settings.accomplice) {
    await expect.poll(() => murderer.view?.game?.private.accompliceId).toBeTruthy();
    const accomplice = murderer.view!.game!.players.find((p) => p.id === murderer.view!.game!.private.accompliceId)!;
    await expect(comparison.getByText(`${accomplice.name} · 공범`, { exact: true })).toBeVisible();
  }
  await comparison.getByRole("button", { name: "닫기", exact: true }).click();
  const own = murderer.view!.game!.players.find(
    (p) => p.id === murderer.view!.selfId,
  )!;
  const clue = own.cards.find((c) => c.kind === "clue")!;
  const means = own.cards.find((c) => c.kind === "means")!;
  await murderer.page
    .locator(".night-cards .clue")
    .filter({ hasText: clue.label })
    .click();
  await murderer.page
    .locator(".night-cards .means")
    .filter({ hasText: means.label })
    .click();
  await murderer.page
    .getByRole("button", { name: "이 두 장으로 확정" })
    .click();
  await expect(forensic.page.getByText("범행 장소 타일을 선택하면 수사를 시작합니다.")).toBeVisible({ timeout: 50_000 });
  await forensic.page.getByRole("button", { name: /안개 부두/ }).click();
  await expect(forensic.page.getByRole("dialog", { name: "힌트와 카드 비교" })).toBeVisible();
  if (inspectComparison) await inspectComparison(forensic);
  await forensic.page.getByRole("button", { name: "비교 닫기", exact: true }).click();
  await expect(
    forensic.page.getByRole("tab", { name: "◉ 마커 배치" }),
  ).toBeVisible();
  const investigator = users.find(
    (u) => u.view!.game!.private.myRole === "investigator",
  )!;
  if (Object.keys(investigator.view!.game!.markers).length === 0)
    await expect(investigator.page.getByLabel("채팅 메시지")).toBeDisabled();
  else await expect(investigator.page.getByLabel("채팅 메시지")).toBeEnabled();
  await forensic.page.getByRole("tab", { name: "◉ 마커 배치" }).click();
  for (let i = 0; i < 6; i++) {
    if (forensic.view!.game!.markers[forensic.view!.game!.tiles[i].id] !== undefined) continue;
    await forensic.page
      .locator(".tile")
      .nth(i)
      .locator(".tile-options button")
      .first()
      .click();
    await hold(forensic.page, `.tile:nth-child(${i + 1}) .hold`);
  }
  await expect(investigator.page.getByLabel("채팅 메시지")).toBeEnabled();
  await investigator.page
    .getByLabel("채팅 메시지")
    .fill("법의학자의 마커를 함께 확인해요.");
  await investigator.page
    .getByRole("button", { name: "메시지 보내기" })
    .click();
  return { murderer, forensic, investigator, clue, means };
}
async function solve(u: User, targetName: string, clue: string, means: string) {
  await u.page.getByRole("button", { name: "해결 시도" }).click();
  await u.page
    .locator(".target-option")
    .filter({ hasText: targetName })
    .click();
  await expect(u.page.locator(".solve-cards .card-art")).toHaveCount(4);
  await u.page.locator(".solve-cards button").filter({ hasText: clue }).click();
  await u.page
    .locator(".solve-cards button")
    .filter({ hasText: means })
    .click();
  await hold(u.page, '[data-testid="commit-solve"]', 1300);
}

test("mobile home, help, invite QR, lobby chat, ready, kick and leave", async ({
  browser,
}) => {
  await mkdir(shots, { recursive: true });
  const mobile = await user(browser, 360, 640);
  await mobile.page.screenshot({ path: `${shots}/home-360.png` });
  expect(
    await mobile.page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await mobile.page.getByRole("button", { name: "도움말" }).click();
  await expect(
    mobile.page.getByRole("dialog", { name: "수사 지침" }),
  ).toBeVisible();
  await mobile.page.getByRole("button", { name: "닫기", exact: true }).click();
  await mobile.context.close();
  const { users, host } = await setup(browser, 4);
  try {
    await host.page.getByLabel("채팅 메시지").fill("모두 준비되셨나요?");
    await host.page.getByRole("button", { name: "메시지 보내기" }).click();
    await expect(users[1].page.getByText("모두 준비되셨나요?")).toBeVisible();
    await host.page.screenshot({ path: `${shots}/lobby-360.png` });
    await host.page.locator(".invite-card").click();
    await expect(host.page.getByAltText(/초대 QR 코드/)).toBeVisible();
    await host.page.getByRole("button", { name: "닫기", exact: true }).click();
    await host.page
      .getByRole("button", { name: "형사04 추방", exact: true })
      .click();
    await expect(users[3].page.getByLabel("닉네임")).toBeVisible();
    await expect(host.page.locator(".member-card")).toHaveCount(3);
    await users[1].page
      .getByRole("button", { name: "나가기", exact: true })
      .click();
    await users[1].page
      .getByRole("dialog")
      .getByRole("button", { name: "나가기", exact: true })
      .click();
    await expect(users[1].page.getByLabel("닉네임")).toBeVisible();
    users.forEach((u) => expect(u.errors).toEqual([]));
  } finally {
    for (const u of users) await u.context.close();
  }
});
for (const count of [6, 12])
  test(`${count} independent users complete a case${count === 12 ? " with witness reversal" : ""}`, async ({
    browser,
  }) => {
    await mkdir(shots, { recursive: true });
    const { users } = await setup(browser, count);
    try {
      const { murderer, forensic, investigator, clue, means } =
        await start(users);
      await investigator.page.getByRole("tab", { name: "⌕ 공개 카드" }).click();
      await investigator.page.setViewportSize({ width: 360, height: 640 });
      await expect(investigator.page.locator(".evidence-card")).toHaveCount(8);
      const pictures = investigator.page.locator(".card-grid .card-art");
      await expect(pictures).toHaveCount(8);
      await expect.poll(() => pictures.evaluateAll((images) =>
        images.every((image) => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0),
      )).toBe(true);
      const firstPicture = await pictures.first().getAttribute("src");
      await pictures.first().click();
      const enlarged = investigator.page.getByRole("dialog", { name: "증거 확대" });
      await expect(enlarged.locator(".card-art")).toHaveAttribute("src", firstPicture!);
      await expect(enlarged.getByText("그림보다 문구를 기준으로 추리하세요.")).toBeVisible();
      await enlarged.getByRole("button", { name: "닫기", exact: true }).click();
      expect(
        await investigator.page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      const grid = await investigator.page
        .locator(".card-grid")
        .evaluate((el) => ({
          visible: el.clientHeight,
          full: el.scrollHeight,
        }));
      expect(grid.full).toBeLessThanOrEqual(grid.visible + 1);
      await investigator.page.screenshot({
        path: `${shots}/investigation-${count}-360.png`,
      });
      await investigator.page.setViewportSize({ width: 390, height: 844 });
      await investigator.page.screenshot({
        path: `${shots}/investigation-${count}-390.png`,
      });
      await forensic.page.screenshot({
        path: `${shots}/forensic-${count}-390.png`,
      });
      await investigator.page.locator(".game-dock").getByRole("button", { name: "메모" }).click();
      const memo = investigator.page.getByLabel("개인 메모");
      await memo.fill("첫 단서: ");
      await memo.pressSequentially("항만", { delay: 300 });
      await expect(memo).toBeFocused();
      await expect(memo).toHaveValue("첫 단서: 항만");
      await investigator.page
        .getByRole("button", { name: "닫기", exact: true })
        .click();
      await investigator.page.reload();
      await expect(investigator.page.locator(".phase-bar")).toBeVisible();
      await investigator.page.locator(".game-dock").getByRole("button", { name: "메모" }).click();
      await expect(investigator.page.getByLabel("개인 메모")).toHaveValue(
        "첫 단서: 항만",
      );
      await investigator.page
        .getByRole("button", { name: "닫기", exact: true })
        .click();
      const murdererName = murderer.view!.game!.players.find(
        (p) => p.id === murderer.view!.selfId,
      )!.name;
      await solve(investigator, murdererName, clue.label, means.label);
      if (count === 12) {
        await expect(
          murderer.page.getByRole("heading", { name: "마지막 반전" }),
        ).toBeVisible();
        const witness = users.find(
          (u) => u.view!.game!.private.myRole === "witness",
        )!;
        const name = witness.view!.game!.players.find(
          (p) => p.id === witness.view!.selfId,
        )!.name;
        const accomplice = users.find((u) => u.view!.game!.private.myRole === "accomplice")!;
        await accomplice.page.locator(".target-option").filter({ hasText: name }).click();
        await accomplice.page.getByRole("button", { name: "후보 의견 보내기", exact: true }).click();
        await expect(murderer.page.getByText(`[목격자 후보] ${name}`, { exact: true })).toBeVisible();
        await expect(investigator.page.getByText(`[목격자 후보] ${name}`, { exact: true })).toHaveCount(0);
        await murderer.page
          .getByLabel("채팅 메시지")
          .fill("목격자 후보를 지목하겠습니다.");
        await murderer.page
          .getByRole("button", { name: "메시지 보내기" })
          .click();
        await expect(
          investigator.page.getByText("목격자 후보를 지목하겠습니다."),
        ).toHaveCount(0);
        await murderer.page
          .locator(".target-option")
          .filter({ hasText: name })
          .click();
        await hold(murderer.page, ".hold", 1300);
      }
      await expect(
        investigator.page.getByRole("heading", {
          name: count === 12 ? "범인팀 승리" : "수사팀 승리",
        }),
      ).toBeVisible();
      await expect(investigator.page.locator(".case-answer .card-art")).toHaveCount(2);
      await investigator.page.screenshot({
        path: `${shots}/result-${count}-390.png`,
      });
      users.forEach((u) => expect(u.errors).toEqual([]));
    } finally {
      for (const u of users) await u.context.close();
    }
  });

test("mobile chat keeps focus while sending and preserves the next draft", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  try {
    await page.goto("/");
    await page.getByLabel("닉네임").fill("모바일 채팅");
    await page.getByRole("button", { name: "수사실 만들기" }).click();
    const input = page.getByLabel("채팅 메시지");
    await expect(input).toBeEnabled();
    // Delay the outbound chat packet so assertions cover the in-flight state.
    await page.evaluate(() => {
      const original = WebSocket.prototype.send;
      WebSocket.prototype.send = function (data) {
        if (typeof data === "string" && data.includes('["chat",')) {
          const ws = this;
          setTimeout(() => original.call(ws, data), 600);
        } else original.call(this, data);
      };
    });
    await input.fill("첫 메시지");
    await input.focus();
    await page.getByRole("button", { name: "메시지 보내기" }).tap();
    await expect(input).toBeEnabled();
    await expect(input).toBeFocused();
    await expect(input).toHaveValue("");
    await input.fill("전송 중 다음 초안");
    await expect(page.getByText("첫 메시지", { exact: true })).toBeVisible();
    await expect(input).toHaveValue("전송 중 다음 초안");
    await expect(input).toBeFocused();
    await input.press("Enter");
    await expect(page.getByText("전송 중 다음 초안", { exact: true })).toBeVisible();
    await expect(input).toBeFocused();
  } finally { await context.close(); }
});

test("invite sharing copies or opens native share and guests join from the link", async ({ browser }) => {
  const { users, host, code } = await setup(browser, 1);
  const guest = await user(browser);
  try {
    await host.page.evaluate(() => {
      Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
        writeText: async (value: string) => { sessionStorage.setItem("test-invite", value); },
      } });
    });
    await host.page.getByRole("button", { name: "🔗 초대 링크 보내기" }).click();
    await expect(host.page.getByRole("button", { name: "✓ 초대 링크 복사됨" })).toBeVisible();
    const link = await host.page.evaluate(() => sessionStorage.getItem("test-invite"));
    expect(new URL(link!).searchParams.get("room")).toBe(code);
    await guest.page.goto(link!);
    await expect(guest.page.getByLabel("방 코드", { exact: true })).toHaveValue(code);
    await guest.page.getByLabel("닉네임").fill("링크 손님");
    await guest.page.getByRole("button", { name: "코드로 입장" }).click();
    await expect(host.page.getByText("링크 손님", { exact: true })).toBeVisible();
    await host.page.evaluate(() => {
      Object.defineProperty(navigator, "share", { configurable: true, value: async (data: ShareData) => {
        sessionStorage.setItem("native-share", data.url!);
      } });
    });
    await host.page.locator(".invite-share").click();
    expect(await host.page.evaluate(() => sessionStorage.getItem("native-share"))).toBe(link);
    await host.page.evaluate(() => {
      Object.defineProperty(navigator, "share", { configurable: true, value: async () => {
        throw new DOMException("cancelled", "AbortError");
      } });
    });
    await host.page.locator(".invite-share").click();
    await expect(host.page.getByRole("alert")).toHaveCount(0);
  } finally {
    for (const u of [...users, guest]) await u.context.close();
  }
});

test("lobby test bots stay ready after settings and allow solo game start", async ({ browser }) => {
  const { users, host } = await setup(browser, 1);
  try {
    for (let i = 0; i < 3; i++) {
      await host.page.getByRole("button", { name: "🤖 테스트 봇 추가" }).click();
      await expect(host.page.locator(".member-card")).toHaveCount(i + 2);
    }
    await expect(host.page.locator(".member-card.is-ready")).toHaveCount(3);
    await host.page.getByRole("button", { name: "⚙ 수사실 설정" }).click();
    await host.page.getByRole("button", { name: "설정 저장" }).click();
    await expect(host.page.locator(".member-card.is-ready")).toHaveCount(3);
    await host.page.getByRole("button", { name: "준비하기", exact: true }).click();
    await host.page.getByRole("button", { name: "사건 시작" }).click();
    await expect(host.page.getByLabel("누르는 동안 비밀 역할 보기")).toBeVisible();
    await hold(host.page, ".role-dossier", 100);
    await host.page.getByRole("button", { name: "역할을 확인했어요" }).click();
    await expect.poll(() => host.view?.game?.phase).toBe("CRIME_NIGHT");
    expect(host.errors).toEqual([]);
  } finally { for (const u of users) await u.context.close(); }
});


test("all 120 card illustrations are local, distinct SVG assets with matching labels", async ({ request }) => {
  const illustrations = await Promise.all(content.cards.map(async (card) => {
    const response = await request.get(`/cards/${card.id}.svg`);
    expect(response.status(), card.id).toBe(200);
    expect(response.headers()["content-type"], card.id).toContain("image/svg+xml");
    const body = await response.text();
    expect(body, card.id).toContain(`<title id="title">${card.label}</title>`);
    expect(body, card.id).toContain('viewBox="0 0 128 128"');
    expect(body, card.id).not.toMatch(/(?:href|src)=["']https?:/);
    return body.replace(/<title[^>]*>.*?<\/title>/, "");
  }));
  expect(illustrations).toHaveLength(120);
  expect(new Set(illustrations).size).toBe(120);
});

test("discussion settings, public guesses, unanimous start and mobile keyboard layout", async ({ browser }) => {
  const { users, host } = await setup(browser, 6);
  try {
    await host.page.getByRole("button", { name: "⚙ 수사실 설정" }).click();
    await host.page.getByLabel("다같이 토론하는 시간").selectOption("300");
    await host.page.getByLabel("범인의 카드 선택 시간").selectOption("90");
    await host.page.getByLabel("한 사람의 발표 시간").selectOption("0");
    await host.page.getByRole("button", { name: "설정 저장" }).click();
    await expect.poll(() => host.view?.settings.discussionSeconds).toBe(300);
    const { forensic, murderer, investigator } = await start(users);
    const game = investigator.view!.game!;
    expect(game.settings.crimeSeconds).toBe(90);
    expect(game.timer.deadline! - investigator.view!.serverNow).toBeGreaterThan(280_000);
    const wrongTarget = game.players.find((p) => p.id !== game.forensicId && p.id !== investigator.view!.selfId && p.id !== murderer.view!.selfId)!;
    const clue = wrongTarget.cards.find((c) => c.kind === "clue")!;
    const means = wrongTarget.cards.find((c) => c.kind === "means")!;
    await solve(investigator, wrongTarget.name, clue.label, means.label);
    await expect(murderer.page.locator(".solve-verdict")).toContainText("카드 기록 보기");
    await murderer.page.locator(".solve-verdict").click();
    const history = murderer.page.getByRole("dialog", { name: "공개 해결 시도 기록" });
    await expect(history).toContainText(wrongTarget.name);
    await expect(history).toContainText(game.players.find((p) => p.id === investigator.view!.selfId)!.name);
    await expect(history).toContainText(clue.label);
    await expect(history).toContainText(means.label);
    await expect(history.locator(".card-art")).toHaveCount(2);
    await history.getByRole("button", { name: "닫기", exact: true }).click();

    const page = investigator.page;
    const input = page.getByLabel("채팅 메시지");
    for (let i = 0; i < 3; i++) {
      await input.fill(`${i + 1}번째 의견: ${"공개 카드를 보며 단서를 비교합니다. ".repeat(10)}`);
      await page.getByRole("button", { name: "메시지 보내기" }).click();
    }
    await input.fill("발표 전 작성 중인 초안");
    await input.focus();
    await page.evaluate(() => {
      Object.defineProperty(window.visualViewport!, "height", { configurable: true, value: 420 });
      Object.defineProperty(window.visualViewport!, "offsetTop", { configurable: true, value: 12 });
      window.visualViewport!.dispatchEvent(new Event("resize"));
    });
    await expect.poll(() => page.locator(".app-frame").evaluate((el) => el.getBoundingClientRect().height)).toBe(420);
    const before = await input.boundingBox();
    expect(before!.y).toBeGreaterThanOrEqual(12);
    expect(before!.y + before!.height).toBeLessThanOrEqual(432);
    expect(await page.locator(".chat-log").evaluate((el) => el.clientHeight)).toBeGreaterThan(80);
    await page.locator(".chat-log").evaluate((el) => { el.scrollTop = 0; });
    await murderer.page.getByLabel("채팅 메시지").fill("새 의견이 도착해도 읽던 위치를 유지해요.");
    await murderer.page.getByRole("button", { name: "메시지 보내기" }).click();
    await expect(page.getByText("새 의견이 도착해도 읽던 위치를 유지해요.", { exact: true })).toHaveCount(1);
    await expect.poll(() => page.locator(".chat-log").evaluate((el) => el.scrollTop)).toBe(0);
    await expect(input).toHaveValue("발표 전 작성 중인 초안");
    expect(await input.boundingBox()).toEqual(before);
    await page.locator(".app-frame").screenshot({ path: `${shots}/discussion-keyboard-390.png` });

    for (const u of users.slice(0, -1)) await u.page.getByRole("button", { name: /발표 하기/ }).click();
    await expect(users.at(-1)!.page.getByRole("button", { name: /발표 하기.*5\/6/ })).toBeVisible();
    expect(forensic.view!.game!.phase).toBe("EVIDENCE_COLLECTION");
    await users.at(-1)!.page.getByRole("button", { name: /발표 하기/ }).click();
    await expect.poll(() => forensic.view?.game?.phase).toBe("PRESENTATION");
    const presenter = users.find((u) => u.view!.selfId === forensic.view!.game!.presenterId)!;
    await presenter.page.setViewportSize({ width: 360, height: 640 });
    const presenterInput = presenter.page.getByLabel("채팅 메시지");
    await presenterInput.fill("개인 발표를 작성합니다.");
    await presenterInput.focus();
    await presenter.page.evaluate(() => {
      Object.defineProperty(window.visualViewport!, "height", { configurable: true, value: 350 });
      Object.defineProperty(window.visualViewport!, "offsetTop", { configurable: true, value: 0 });
      window.visualViewport!.dispatchEvent(new Event("resize"));
    });
    await expect.poll(() => presenter.page.locator(".app-frame").evaluate((el) => el.getBoundingClientRect().height)).toBe(350);
    const bounds = await presenterInput.boundingBox();
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(350);
    expect(await presenter.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await presenter.page.getByRole("button", { name: "메시지 보내기" }).click();
    await expect(presenterInput).toBeFocused();
    await expect(presenter.page.getByText("개인 발표를 작성합니다.", { exact: true })).toBeVisible();
    await presenter.page.locator(".app-frame").screenshot({ path: `${shots}/presentation-keyboard-360.png` });
    users.forEach((u) => expect(u.errors).toEqual([]));
  } finally { for (const u of users) await u.context.close(); }
});


test("hint and card workspace keeps forensic answers and public comparisons visible on mobile and desktop", async ({ browser }) => {
  const { users, host } = await setup(browser, 6);
  await mkdir(shots, { recursive: true });
  try {
    await host.page.getByRole("button", { name: "⚙ 수사실 설정" }).click();
    await host.page.getByLabel("다같이 토론하는 시간").selectOption("300");
    await host.page.getByRole("button", { name: "설정 저장" }).click();
    const { forensic, investigator, clue, means } = await start(users, async (fs) => {
      await fs.page.setViewportSize({ width: 360, height: 640 });
      const desk = fs.page.getByRole("dialog", { name: "힌트와 카드 비교" });
      const reference = desk.getByLabel("법의학자 전용 정답 참고");
      const answer = fs.view!.game!.private.solution!;
      const owner = fs.view!.game!.players.find((p) => p.id === answer.murdererId)!;
      await expect(reference).toContainText(owner.name);
      await expect(reference.locator(".reference-card")).toHaveCount(2);
      await expect(desk.getByLabel("카드 비교 대상", { exact: true })).toHaveValue(owner.id);
      const referenceBox = await reference.boundingBox();
      await desk.locator(".tile-options button").first().click();
      await hold(fs.page, ".comparison-desk .hold");
      await expect.poll(() => Object.keys(fs.view!.game!.markers).length).toBe(1);
      await expect(desk.getByLabel("비교할 힌트")).toHaveValue(fs.view!.game!.tiles[1].id);
      expect(await reference.boundingBox()).toEqual(referenceBox);
      await fs.page.locator(".app-frame").screenshot({ path: `${shots}/comparison-forensic-360.png` });
      await desk.getByRole("button", { name: "채팅 열기", exact: true }).click();
      await expect(desk.getByLabel("채팅 메시지")).toHaveCount(0);
      await desk.locator(".tile-options button").first().click();
      await hold(fs.page, ".comparison-desk .hold");
      await expect.poll(() => Object.keys(fs.view!.game!.markers).length).toBe(2);
      await desk.getByRole("button", { name: "채팅 접기", exact: true }).click();
      const other = fs.view!.game!.players.find((p) => p.id !== fs.view!.game!.forensicId && p.id !== owner.id)!;
      await desk.getByLabel("함께 비교할 사람").selectOption(other.id);
      await expect(desk.locator(".comparison-suspect")).toHaveCount(2);
      await expect(reference).toContainText(owner.cards.find((c) => c.id === answer.clueId)!.label);
      await desk.getByRole("button", { name: "가리기", exact: true }).click();
      await expect(reference.locator(".reference-card")).toHaveCount(0);
      await desk.getByRole("button", { name: "정답 보기", exact: true }).click();
      await expect(reference.locator(".reference-card")).toHaveCount(2);
      expect(await fs.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
    await investigator.page.getByRole("button", { name: "⇄ 힌트·카드 비교", exact: true }).click();
    const desk = investigator.page.getByRole("dialog", { name: "힌트와 카드 비교" });
    await expect(desk.getByLabel("전체 공개 힌트").getByRole("button")).toHaveCount(6);
    await expect(desk.locator(".solution-reference")).toHaveCount(0);
    const publicPlayer = investigator.view!.game!.players.find((p) => p.id !== investigator.view!.game!.forensicId)!;
    const second = investigator.view!.game!.players.find((p) => p.id !== investigator.view!.game!.forensicId && p.id !== publicPlayer.id)!;
    await desk.getByLabel("카드 비교 대상", { exact: true }).selectOption(publicPlayer.id);
    await desk.getByLabel("함께 비교할 사람").selectOption(second.id);
    await expect(desk.locator(".comparison-card-list .evidence-card")).toHaveCount(16);
    const summary = desk.getByLabel("전체 공개 힌트");
    const before = await summary.boundingBox();
    await desk.locator(".comparison-card-list").first().evaluate((el) => { el.scrollTop = el.scrollHeight; });
    expect(await summary.boundingBox()).toEqual(before);
    await desk.locator(".comparison-card-list").first().evaluate((el) => { el.scrollTop = 0; });
    await summary.getByRole("button").first().click();
    await expect(desk.locator(".tile-options span")).toHaveCount(6);
    await expect(desk.locator(".tile-options button")).toHaveCount(0);
    await desk.getByRole("button", { name: "항목 접기", exact: true }).click();
    await investigator.page.locator(".app-frame").screenshot({ path: `${shots}/comparison-investigator-390.png` });
    await desk.locator(".comparison-card-list button").first().click();
    await expect(investigator.page.getByRole("dialog", { name: "증거 확대", exact: true })).toBeVisible();
    await investigator.page.getByRole("button", { name: "닫기", exact: true }).click();
    await investigator.page.setViewportSize({ width: 1440, height: 900 });
    await expect.poll(() => investigator.page.locator(".app-frame").evaluate((el) => el.clientWidth)).toBe(1240);
    const hints = await desk.locator(".comparison-hints").boundingBox();
    const cards = await desk.locator(".comparison-evidence").boundingBox();
    expect(cards!.x).toBeGreaterThanOrEqual(hints!.x + hints!.width - 1);
    await investigator.page.locator(".app-frame").screenshot({ path: `${shots}/comparison-desktop.png` });
    await desk.getByRole("button", { name: "비교 닫기", exact: true }).click();
    await expect(investigator.page.getByLabel("채팅 메시지")).toBeEnabled();
    await forensic.page.getByRole("button", { name: "⇄ 힌트·카드 비교", exact: true }).click();
    const fsDesk = forensic.page.getByRole("dialog", { name: "힌트와 카드 비교" });
    await expect(fsDesk.getByLabel("법의학자 전용 정답 참고")).toContainText(clue.label);
    await expect(fsDesk.getByLabel("법의학자 전용 정답 참고")).toContainText(means.label);
    await forensic.page.setViewportSize({ width: 1440, height: 900 });
    if (await fsDesk.getByRole("button", { name: "힌트 6개 펼치기", exact: true }).isVisible())
      await fsDesk.getByRole("button", { name: "힌트 6개 펼치기", exact: true }).click();
    await expect(fsDesk.getByLabel("전체 공개 힌트")).toBeVisible();
    await forensic.page.locator(".app-frame").screenshot({ path: `${shots}/comparison-forensic-desktop.png` });
    for (const u of users) {
      const scope = u === forensic ? fsDesk : u.page;
      await scope.getByRole("button", { name: /발표 하기/ }).click();
    }
    await expect.poll(() => forensic.view?.game?.phase).toBe("PRESENTATION");
    for (let i = 0; i < 5; i++) {
      const presenter = users.find((u) => u.view!.selfId === forensic.view!.game!.presenterId)!;
      await presenter.page.getByRole("button", { name: "발표 마침" }).click();
      await expect.poll(() => forensic.view?.game?.presenterId).not.toBe(presenter.view!.selfId);
    }
    await expect.poll(() => forensic.view?.game?.phase).toBe("ROUND_TRANSITION");
    const incoming = forensic.view!.game!.pendingTile!.id;
    await fsDesk.getByRole("button", { name: /교체 →/ }).first().click();
    await expect(fsDesk.getByLabel("비교할 힌트")).toHaveValue(incoming);
    await fsDesk.locator(".tile-options button").first().click();
    await hold(forensic.page, ".comparison-desk .hold");
    await expect.poll(() => forensic.view?.game?.markers[incoming]).toBe(0);
    await expect(fsDesk.getByLabel("법의학자 전용 정답 참고")).toContainText(clue.label);
    users.forEach((u) => expect(u.errors).toEqual([]));
  } finally { for (const u of users) await u.context.close(); }
});


test("all roles keep their workspace, chat, private references, notes and solve candidates", async ({ browser }) => {
  const { users, host } = await setup(browser, 8);
  await mkdir(shots, { recursive: true });
  try {
    await host.page.getByRole("button", { name: "⚙ 수사실 설정" }).click();
    await host.page.getByLabel("다같이 토론하는 시간").selectOption("300");
    await host.page.getByLabel("범인의 카드 선택 시간").selectOption("90");
    await host.page.getByLabel("한 사람의 발표 시간").selectOption("0");
    await host.page.getByRole("button", { name: "설정 저장" }).click();
    const { forensic, investigator, murderer } = await start(users);
    const roleUser = (role: string) => users.find((u) => u.view!.game!.private.myRole === role)!;
    const open = async (u: User) => {
      await u.page.getByRole("button", { name: "⇄ 힌트·카드 비교", exact: true }).click();
      return u.page.getByRole("dialog", { name: "힌트와 카드 비교" });
    };
    const fsDesk = await open(forensic);
    await forensic.page.setViewportSize({ width: 360, height: 640 });
    await fsDesk.getByRole("button", { name: "힌트 6개 펼치기", exact: true }).click();
    await expect(fsDesk.getByLabel("전체 공개 힌트").getByRole("button")).toHaveCount(6);
    await fsDesk.getByRole("button", { name: "힌트 6개 접기", exact: true }).click();
    await fsDesk.getByRole("button", { name: "채팅 열기", exact: true }).click();
    await expect(fsDesk.getByText("법의학자의 마커를 함께 확인해요.", { exact: true })).toBeVisible();
    await expect(fsDesk.getByLabel("채팅 메시지")).toHaveCount(0);
    await expect(fsDesk.getByText("읽기 전용", { exact: true })).toBeVisible();
    await forensic.page.locator(".app-frame").screenshot({ path: `${shots}/role-forensic-chat-360.png` });

    for (const role of ["murderer", "accomplice", "witness"]) {
      const u = roleUser(role);
      const desk = await open(u);
      await expect(desk.getByLabel("전체 공개 힌트").getByRole("button")).toHaveCount(6);
      const secret = desk.getByLabel("나만 보는 역할 정보");
      await expect(secret.locator(".reference-card")).toHaveCount(0);
      await secret.getByRole("button", { name: "비밀 정보 보기", exact: true }).click();
      if (role === "witness") {
        await expect(secret.locator(".reference-card")).toHaveCount(0);
        await secret.getByRole("button", { name: "밤에 본 두 사람 비교", exact: true }).click();
        const pair = u.view!.game!.private.witnessCandidates!;
        await expect(desk.getByLabel("카드 비교 대상", { exact: true })).toHaveValue(pair[0]);
        await expect(desk.getByLabel("함께 비교할 사람")).toHaveValue(pair[1]);
        await expect(secret).not.toContainText("범인:");
        await expect(secret).not.toContainText("공범:");
      } else {
        await expect(secret.locator(".reference-card")).toHaveCount(2);
        const ally = u.view!.game!.players.find((p) => p.id === u.view!.game!.private.accompliceId)!;
        await expect(secret).toContainText(ally.name);
      }
      await secret.getByRole("button", { name: "가리기", exact: true }).click();
      await expect(secret.locator(".reference-card")).toHaveCount(0);
      await desk.getByRole("button", { name: "비교 닫기", exact: true }).click();
    }

    const page = investigator.page;
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByLabel("채팅 메시지").fill("비교하면서 작성한 초안");
    const desk = await open(investigator);
    await expect(desk.getByLabel("나만 보는 역할 정보")).toHaveCount(0);
    const game = investigator.view!.game!;
    const target = game.players.find((p) => p.id !== game.forensicId && p.id !== investigator.view!.selfId && p.id !== murderer.view!.selfId)!;
    const other = game.players.find((p) => p.id !== game.forensicId && p.id !== target.id)!;
    const clue = target.cards.find((c) => c.kind === "clue")!;
    const means = target.cards.find((c) => c.kind === "means")!;
    await desk.getByLabel("카드 비교 대상", { exact: true }).selectOption(target.id);
    await desk.getByLabel("함께 비교할 사람").selectOption(other.id);
    await desk.getByLabel("비교할 힌트").selectOption(game.tiles[1].id);
    await desk.getByRole("button", { name: `${clue.label} 메모: 메모 없음`, exact: true }).click();
    await expect(desk.getByRole("button", { name: `${clue.label} 메모: 유력`, exact: true })).toBeVisible();
    await desk.getByRole("button", { name: `${target.name} ${clue.label} 지목 후보`, exact: true }).click();
    await desk.getByRole("button", { name: `${target.name} ${means.label} 지목 후보`, exact: true }).click();
    const list = desk.getByLabel(`${target.name}의 공개 카드`).locator(".comparison-card-list");
    await list.evaluate((el) => { el.scrollTop = el.scrollHeight; });
    const scroll = await list.evaluate((el) => el.scrollTop);
    expect(scroll).toBeGreaterThan(0);
    await desk.getByRole("button", { name: "비교 닫기", exact: true }).click();
    await expect(page.getByLabel("채팅 메시지")).toHaveValue("비교하면서 작성한 초안");
    const reopened = await open(investigator);
    await expect(reopened.getByLabel("카드 비교 대상", { exact: true })).toHaveValue(target.id);
    await expect(reopened.getByLabel("함께 비교할 사람")).toHaveValue(other.id);
    await expect(reopened.getByLabel("비교할 힌트")).toHaveValue(game.tiles[1].id);
    await expect.poll(() => reopened.getByLabel(`${target.name}의 공개 카드`).locator(".comparison-card-list").evaluate((el) => el.scrollTop)).toBe(scroll);
    await expect(reopened.getByLabel("선택한 지목 후보")).toContainText(clue.label);
    await reopened.getByRole("button", { name: "채팅 열기", exact: true }).click();
    const input = reopened.getByLabel("채팅 메시지");
    await expect(input).toHaveValue("비교하면서 작성한 초안");
    await input.fill("비교 화면에서 의견을 보냅니다.");
    await reopened.getByRole("button", { name: "메시지 보내기", exact: true }).click();
    await expect(input).toBeFocused();
    await expect(reopened.getByText("비교 화면에서 의견을 보냅니다.", { exact: true })).toBeVisible();
    await expect(fsDesk.getByText("비교 화면에서 의견을 보냅니다.", { exact: true })).toBeVisible();
    await page.evaluate(() => {
      Object.defineProperty(window.visualViewport!, "height", { configurable: true, value: 400 });
      window.visualViewport!.dispatchEvent(new Event("resize"));
    });
    await expect.poll(() => page.locator(".app-frame").evaluate((el) => el.clientHeight)).toBe(400);
    const bounds = await input.boundingBox();
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(400);
    await page.locator(".app-frame").screenshot({ path: `${shots}/role-comparison-keyboard.png` });
    await page.evaluate(() => { delete (window.visualViewport as unknown as { height?: number }).height; window.visualViewport!.dispatchEvent(new Event("resize")); });
    await reopened.getByRole("button", { name: "채팅 접기", exact: true }).click();
    await reopened.getByRole("button", { name: "선택한 두 장으로 해결", exact: true }).click();
    const wizard = page.getByRole("dialog", { name: "사건 해결 시도" });
    await expect(wizard.locator(".solve-summary")).toContainText(clue.label);
    await expect(wizard.locator(".solve-summary")).toContainText(means.label);
    await expect(wizard.getByTestId("commit-solve")).toBeVisible();
    await wizard.locator(".solve-bottom").getByRole("button", { name: "시도 취소", exact: true }).click();
    await expect.poll(() => investigator.view?.game?.players.find((p) => p.id === investigator.view!.selfId)?.hasBadge).toBe(true);
    await expect(reopened.getByLabel("선택한 지목 후보")).toContainText(means.label);
    for (const u of users) {
      if (u === investigator) await reopened.getByRole("button", { name: /발표 하기/ }).click();
      else if (u === forensic) await fsDesk.getByRole("button", { name: /발표 하기/ }).click();
      else await u.page.getByRole("button", { name: /발표 하기/ }).click();
    }
    await expect.poll(() => investigator.view?.game?.phase).toBe("PRESENTATION");
    const presenter = users.find((u) => u.view!.selfId === investigator.view!.game!.presenterId)!;
    const presenterDesk = presenter === investigator ? reopened : await open(presenter);
    await expect(presenterDesk.getByRole("status")).toContainText("내 차례");
    await presenterDesk.getByRole("button", { name: "채팅 열기", exact: true }).click();
    await presenterDesk.getByLabel("채팅 메시지").fill("비교 화면에서 개인 발표를 합니다.");
    await presenterDesk.getByRole("button", { name: "메시지 보내기", exact: true }).click();
    await presenterDesk.getByRole("button", { name: "발표 마침" }).click();
    await expect.poll(() => investigator.view?.game?.presenterId).not.toBe(presenter.view!.selfId);
    users.forEach((u) => expect(u.errors).toEqual([]));
  } finally { for (const u of users) await u.context.close(); }
});
