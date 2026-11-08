import {
  test,
  expect,
  type Browser,
  type Page,
  type BrowserContext,
} from "@playwright/test";
import type { RoomView } from "@deception/shared";
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
  await expect(
    forensic.page.getByRole("tab", { name: "◉ 마커 배치" }),
  ).toBeVisible({ timeout: 50_000 });
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
      await investigator.page.getByRole("button", { name: "메모" }).click();
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
      await investigator.page.getByRole("button", { name: "메모" }).click();
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
      await investigator.page.screenshot({
        path: `${shots}/result-${count}-390.png`,
      });
      users.forEach((u) => expect(u.errors).toEqual([]));
    } finally {
      for (const u of users) await u.context.close();
    }
  });
