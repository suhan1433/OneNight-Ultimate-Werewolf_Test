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
      const begin = forensic.page.getByRole("button", {
        name: "토론 마치고 발표 시작",
      });
      if (await begin.isVisible()) await begin.click();
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
async function start(users: User[]) {
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
  await expect(
    forensic.page.getByRole("tab", { name: "◉ 마커 배치" }),
  ).toBeVisible();
  const investigator = users.find(
    (u) => u.view!.game!.private.myRole === "investigator",
  )!;
  await expect(investigator.page.getByLabel("채팅 메시지")).toBeDisabled();
  await forensic.page.getByRole("tab", { name: "◉ 마커 배치" }).click();
  for (let i = 0; i < 6; i++) {
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
