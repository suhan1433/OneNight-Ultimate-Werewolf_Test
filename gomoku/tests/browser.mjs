import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium, webkit } from "@playwright/test";
import { io } from "socket.io-client";
import { createGameServer } from "../server/app.ts";
const mobile = process.argv.includes("--mobile");
const browserType = process.env.MOBILE_BROWSER === "webkit" ? webkit : chromium;
const service = createGameServer({
  staticDir: fileURLToPath(new URL("../dist", import.meta.url)),
});
await new Promise((resolve) => service.server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${service.server.address().port}`;
const browser = await browserType.launch({
  headless: true,
  channel: process.env.PLAYWRIGHT_CHANNEL,
});
const artifacts = new URL("../artifacts/viewport-review/", import.meta.url);
await mkdir(artifacts, { recursive: true });
const errors = [];
async function open(width, height, extra = {}) {
  const context = await browser.newContext({
    viewport: { width, height },
    hasTouch: mobile,
    isMobile: mobile,
    ...extra,
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${origin}/gomoku/`);
  await page.waitForFunction(
    () => !document.querySelector(".start-actions button")?.disabled,
  );
  return { context, page };
}
const press = (locator) => (mobile ? locator.tap() : locator.click());
async function checkScreen(page, label) {
  const report = await page.evaluate(() => {
    const compact =
      getComputedStyle(document.querySelector(".app")).display === "flex";
    const dialog = document.querySelector("dialog[open]");
    const elements = dialog
      ? [dialog, ...dialog.querySelectorAll("button")]
      : [
          ...document.querySelectorAll(
            "button,input,.board-stage>.board-frame,.room-code",
          ),
        ];
    return {
      compact,
      view: [innerWidth, innerHeight],
      scroll: [
        document.documentElement.scrollWidth,
        document.documentElement.scrollHeight,
      ],
      bad: elements
        .filter((e) => e.getClientRects().length)
        .flatMap((e) => {
          const r = e.getBoundingClientRect();
          return r.left < -1 ||
            r.right > innerWidth + 1 ||
            (compact && (r.top < -1 || r.bottom > innerHeight + 1))
            ? [
                `${e.tagName}.${e.className} ${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}`,
              ]
            : [];
        }),
    };
  });
  assert.ok(
    report.scroll[0] <= report.view[0] + 1,
    `${label}: horizontal scroll ${JSON.stringify(report)}`,
  );
  if (report.compact)
    assert.ok(
      report.scroll[1] <= report.view[1] + 1,
      `${label}: vertical scroll ${JSON.stringify(report)}`,
    );
  assert.deepEqual(
    report.bad,
    [],
    `${label}: controls must be inside the visible screen`,
  );
}
async function capture(page, width, height, stage) {
  await page.screenshot({
    path: fileURLToPath(
      new URL(
        `${browserType.name()}-${width}x${height}-${stage}.png`,
        artifacts,
      ),
    ),
    animations: "disabled",
    fullPage: true,
  });
  await checkScreen(page, `${width}x${height} ${stage}`);
}
async function peer() {
  const socket = io(origin, {
    path: "/api/gomoku/socket",
    transports: ["websocket"],
    forceNew: true,
    reconnection: false,
  });
  await new Promise((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("connect_error", reject);
  });
  const ask = async (event, data = {}) => {
    const result = await socket.timeout(3000).emitWithAck(event, data);
    assert.equal(result.ok, true, result.error);
    return result;
  };
  return { socket, ask };
}
async function rules(page) {
  const trigger = page.getByRole("button", { name: "게임 방법", exact: true });
  await press(trigger);
  await page.getByRole("dialog").waitFor();
  await checkScreen(page, "rules dialog");
  await page.keyboard.press("Tab");
  assert.equal(
    await page.evaluate(() => document.activeElement.textContent),
    "닫기",
  );
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("dialog").count(), 0);
  assert.equal(
    await trigger.evaluate((el) => el === document.activeElement),
    true,
    "closing help restores focus",
  );
}
try {
  const requested = process.env.MOBILE_WIDTH
    ? Number(process.env.MOBILE_WIDTH)
    : null;
  const sizes = (
    mobile
      ? [
          [320, 480],
          [320, 568],
          [360, 640],
          [375, 667],
          [390, 664],
          [390, 844],
          [430, 932],
          [568, 320],
          [667, 375],
          [844, 390],
          [768, 1024],
          [1024, 768],
        ]
      : [[1280, 900]]
  ).filter(([width]) => !requested || width === requested);
  assert.ok(sizes.length, "requested viewport exists");
  for (const [width, height] of sizes) {
    const { context, page } = await open(width, height);
    let opponent;
    try {
      await capture(page, width, height, "home");
      await page
        .getByLabel("대국자 이름")
        .fill("가나다라마바사아자차카타파하가나");
      await press(page.getByRole("button", { name: "효과음 끄기" }));
      await press(page.getByRole("button", { name: "AI와 바로 두기" }));
      await page.getByRole("status").filter({ hasText: "내 차례" }).waitFor();
      await capture(page, width, height, "play");
      const before = await page
        .locator(".board-stage>.board-frame")
        .boundingBox();
      assert.ok(
        before.width >= 220,
        "board remains usable even on a short screen",
      );
      assert.equal(await page.locator(".cell").count(), 225);
      assert.equal(
        await page.locator('.cell[tabindex="0"]').count(),
        1,
        "board has a single keyboard entry",
      );
      await press(page.locator('[data-cell="112"]'));
      await page.waitForFunction(
        () => document.querySelector(".move-counter")?.textContent === "2수",
      );
      assert.equal(
        await page.locator(".board .stone").count(),
        2,
        "one touch places one stone and the AI replies",
      );
      assert.equal(
        await page
          .locator(".cell.is-new .stone")
          .evaluate((el) => getComputedStyle(el).animationName),
        "stone-land",
      );
      assert.equal(
        await page
          .getByRole("button", { name: /착수 확정|턴 마치기|보급|스킬|준비/ })
          .count(),
        0,
      );
      if (mobile && browserType.name() === "chromium") {
        const rect = await page.locator('[data-cell="112"]').boundingBox();
        const cdp = await context.newCDPSession(page);
        const x = rect.x + rect.width / 2,
          y = rect.y + rect.height / 2;
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [{ x, y }],
        });
        for (let i = 1; i <= 4; i++)
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchMove",
            touchPoints: [{ x, y: y - i * 8 }],
          });
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchEnd",
          touchPoints: [],
        });
        await cdp.detach();
        assert.equal(
          await page.locator(".board .stone").count(),
          2,
          "a swipe is not a placement",
        );
      }
      await rules(page);
      await page.reload();
      await page.waitForFunction(
        () => document.querySelectorAll(".board .stone").length === 2,
      );
      assert.equal(
        await page.locator(".cell.is-new").count(),
        0,
        "resume never replays old effects",
      );
      assert.equal(
        await page
          .getByRole("button", { name: "효과음 켜기" })
          .getAttribute("aria-pressed"),
        "false",
      );
      await press(page.getByRole("button", { name: "효과음 켜기" }));
      await press(page.getByRole("button", { name: "나가기", exact: true }));
      await page.getByRole("button", { name: "AI와 바로 두기" }).waitFor();
      assert.equal(
        await page.getByRole("dialog").count(),
        0,
        "AI exit takes one click",
      );
      await press(
        page.getByRole("button", { name: "친구와 두기 · 방 만들기" }),
      );
      await page.getByRole("heading", { name: "상대를 기다려요" }).waitFor();
      await capture(page, width, height, "waiting");
      await page.evaluate(() => {
        Object.defineProperty(navigator, "clipboard", {
          configurable: true,
          value: {
            writeText: async (value) => {
              window.__invite = value;
            },
          },
        });
      });
      await press(
        page.getByRole("button", { name: "초대 링크 복사", exact: true }),
      );
      assert.equal(
        await page.getByRole("button", { name: "초대 링크 복사 완료" }).count(),
        1,
      );
      const code = await page.locator(".room-code").textContent();
      assert.equal(
        await page.evaluate(() => window.__invite),
        `${origin}/gomoku/?room=${code}`,
      );
      if (width === 320 && height === 480) {
        await page.evaluate(() => {
          Object.defineProperty(navigator, "clipboard", {
            configurable: true,
            value: undefined,
          });
          document.execCommand = (command) => {
            if (command === "copy") {
              window.__fallbackCopy = document.activeElement.value;
              return true;
            }
            return false;
          };
        });
        await press(page.getByRole("button", { name: "초대 링크 복사 완료" }));
        await page
          .getByRole("button", { name: "초대 링크 복사 완료" })
          .waitFor();
        assert.equal(
          await page.evaluate(() => window.__fallbackCopy),
          `${origin}/gomoku/?room=${code}`,
        );
        assert.equal(
          await page.locator("textarea").count(),
          0,
          "clipboard fallback cleans up its temporary field",
        );
        await page.evaluate(() => {
          document.execCommand = () => false;
        });
        await press(page.getByRole("button", { name: "초대 링크 복사 완료" }));
        await page.getByRole("alert").waitFor();
        await checkScreen(page, "copy failure notification");
        assert.equal(
          await page
            .getByRole("button", { name: "초대 링크 복사", exact: true })
            .count(),
          1,
          "failed copy cannot claim success",
        );
        await press(page.getByRole("button", { name: "알림 닫기" }));
      }
      opponent = await peer();
      await opponent.ask("room:join", { name: "상대 대국자", code });
      await page.getByRole("status").filter({ hasText: "내 차례" }).waitFor();
      await press(page.getByRole("button", { name: "나가기", exact: true }));
      await page.getByRole("dialog").waitFor();
      await checkScreen(page, "human exit dialog");
      await press(page.getByRole("button", { name: "계속 두기" }));
      const stable = await page
        .locator(".board-stage>.board-frame")
        .boundingBox();
      for (let i = 0; i < 5; i++) {
        await press(page.locator(`[data-cell="${105 + i}"]`));
        if (i < 4) {
          await opponent.ask("game:action", { type: "place", cell: 150 + i });
          await page
            .getByRole("status")
            .filter({ hasText: "내 차례" })
            .waitFor();
        }
      }
      await page.getByRole("status").filter({ hasText: "승리" }).waitFor();
      await capture(page, width, height, "result");
      const after = await page
        .locator(".board-stage>.board-frame")
        .boundingBox();
      if (mobile)
        for (const prop of ["x", "y", "width", "height"])
          assert.ok(
            Math.abs(stable[prop] - after[prop]) < 1,
            `result must not move or shrink the board: ${prop}`,
          );
      assert.equal(await page.locator(".cell.winning").count(), 5);
      assert.equal(await page.locator(".win-connection line").count(), 1);
      await press(page.getByRole("button", { name: "한 판 더 두기" }));
      assert.equal(
        await page.locator(".board .stone").count(),
        9,
        "human rematch waits for consent",
      );
      await opponent.ask("room:rematch");
      await page.waitForFunction(
        () => document.querySelector(".move-counter")?.textContent === "0수",
      );
      await opponent.ask("game:action", { type: "place", cell: 112 });
      await page.getByRole("status").filter({ hasText: "내 차례" }).waitFor();
      if (!mobile) {
        await page.locator('[data-cell="113"]').focus();
        await page.keyboard.press("ArrowRight");
        assert.equal(
          await page.evaluate(() => document.activeElement.dataset.cell),
          "114",
        );
        await page.keyboard.press("Enter");
        await page.waitForFunction(
          () => document.querySelector(".move-counter")?.textContent === "2수",
        );
      }
      // Resizing mid-game must not lose stones or push controls offscreen.
      if (mobile && width === 390 && height === 664) {
        await page.setViewportSize({ width: 664, height: 390 });
        await checkScreen(page, "rotated during game");
        await page.setViewportSize({ width, height });
        await checkScreen(page, "rotated back");
      }
      await opponent.ask("game:action", { type: "surrender" });
      await page.getByRole("status").filter({ hasText: "승리" }).waitFor();
      await press(page.getByRole("button", { name: "한 판 더 두기" }));
      await opponent.ask("room:leave");
      await page.getByRole("status").filter({ hasText: "승리" }).waitFor();
      assert.equal(
        await page.getByRole("button", { name: "새 대국" }).isEnabled(),
        true,
        "opponent leaving cannot strand the player",
      );
      await press(page.getByRole("button", { name: "새 대국" }));
      await page.getByRole("button", { name: "AI와 바로 두기" }).waitFor();
      await checkScreen(page, "return home");
    } finally {
      opponent?.socket.disconnect();
      await context.close();
    }
  }
  // A real invite link goes directly to a prefilled code; one submit joins the table.
  const a = await open(390, 664),
    b = await open(390, 664);
  try {
    await a.page.getByLabel("대국자 이름").fill("흑");
    await press(
      a.page.getByRole("button", { name: "친구와 두기 · 방 만들기" }),
    );
    const code = await a.page.locator(".room-code").textContent();
    await b.page.goto(`${origin}/gomoku/?room=${code}`);
    assert.equal(
      await b.page.getByLabel("방 코드", { exact: true }).inputValue(),
      code,
    );
    await b.page.getByLabel("대국자 이름").fill("백");
    await press(b.page.getByRole("button", { name: "입장", exact: true }));
    await a.page.getByRole("status").filter({ hasText: "내 차례" }).waitFor();
    await press(a.page.locator('[data-cell="112"]'));
    await b.page.getByRole("status").filter({ hasText: "내 차례" }).waitFor();
    assert.equal(await b.page.locator(".board .stone").count(), 1);
    await press(b.page.getByRole("button", { name: "나가기", exact: true }));
    await press(b.page.getByRole("button", { name: "기권하고 나가기" }));
    await a.page.getByRole("status").filter({ hasText: "승리" }).waitFor();
  } finally {
    await a.context.close();
    await b.context.close();
  }
  const reduced = await open(390, 664, { reducedMotion: "reduce" });
  try {
    const page = reduced.page;
    assert.equal(
      await page
        .locator(".showcase-board")
        .evaluate((el) => getComputedStyle(el).animationName),
      "none",
    );
    await press(page.getByRole("button", { name: "AI와 바로 두기" }));
    await page.getByRole("status").filter({ hasText: "내 차례" }).waitFor();
    await press(page.locator('[data-cell="112"]'));
    await page.waitForFunction(
      () => document.querySelector(".move-counter")?.textContent === "2수",
    );
    assert.equal(
      await page
        .locator(".cell.is-new .stone")
        .evaluate((el) => getComputedStyle(el).animationName),
      "none",
    );
  } finally {
    await reduced.context.close();
  }
  assert.deepEqual(errors, []);
  console.log(
    `PASS ${browserType.name()}: ${sizes.map(([w, h]) => `${w}x${h}`).join(", ")}; full-screen home/lobby/play/result, one-touch play, stable board, single-click AI exit, consent, reconnect, rotate, keyboard, reduced motion`,
  );
} finally {
  await browser.close();
  await service.close();
}
