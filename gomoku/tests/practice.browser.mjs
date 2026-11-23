import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium, webkit } from "@playwright/test";
import { createServer } from "vite";
import { createGameServer } from "../server/app.ts";
const root = fileURLToPath(new URL("../", import.meta.url));
const backend = createGameServer();
await new Promise((r) => backend.server.listen(0, "127.0.0.1", r));
const vite = await createServer({
  root,
  configFile: root + "vite.config.ts",
  server: {
    host: "127.0.0.1",
    port: 0,
    strictPort: false,
    proxy: {
      "/api/gomoku/socket": {
        target: `http://127.0.0.1:${backend.server.address().port}`,
        ws: true,
      },
    },
  },
});
await vite.listen();
const origin = `http://127.0.0.1:${vite.httpServer.address().port}/gomoku/`;
const engine = process.env.MOBILE_BROWSER === "webkit" ? webkit : chromium;
let browser;
try {
  browser = await engine.launch({
    headless: true,
    ...(engine === chromium
      ? { channel: process.env.PLAYWRIGHT_CHANNEL || "chrome" }
      : {}),
  });
} catch (error) {
  await vite.close();
  await backend.close();
  throw error;
}
const errors = [];
let lessons = 0;
const widths =
  process.env.MOBILE_BROWSER === "webkit" ? [320, 390] : [320, 390, 1024];
await mkdir(root + "artifacts/practice/", { recursive: true });
try {
  for (const width of widths) {
    const context = await browser.newContext({
      viewport: { width, height: width === 320 ? 568 : 844 },
      hasTouch: true,
      isMobile: width < 700,
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(origin);
    await page.getByRole("button", { name: /첫 대국 안내/ }).click();
    const dialog = page.getByRole("dialog", { name: "게임 방법", exact: true });
    await dialog.waitFor();
    assert.equal(backend.rooms.size, 0);
    for (let lesson = 0; lesson < 8; lesson++) {
      let steps = 0;
      while (
        !(await dialog.locator(".practice-task.complete").count()) &&
        steps++ < 12
      ) {
        const task = await dialog.locator(".practice-task").innerText();
        if (lesson === 0 && steps === 2) {
          await dialog
            .getByRole("button", { name: "H7 빈 칸", exact: true })
            .click();
          assert.equal(
            await dialog.locator(".practice-task").innerText(),
            task,
          );
        }
        const cue = dialog.locator("button.practice-cue");
        assert.equal(
          await cue.count(),
          1,
          `one action should be highlighted in lesson ${lesson + 1}`,
        );
        await cue.click();
        await page.waitForFunction(
          (old) => document.querySelector(".practice-task")?.innerText !== old,
          task,
        );
        const overflow = await dialog.evaluate(
          (el) =>
            el.scrollWidth > el.clientWidth + 1 ||
            document.documentElement.scrollWidth > innerWidth + 1,
        );
        assert.equal(
          overflow,
          false,
          `${width}px lesson ${lesson + 1}: overflow`,
        );
      }
      assert.ok(
        await dialog.locator(".practice-task.complete").count(),
        `lesson ${lesson + 1} must complete through actual UI`,
      );
      lessons++;
      await page.waitForTimeout(100);
      if (lesson < 7) {
        const next = dialog.getByRole('button', { name: /^다음 연습 ·/ });
        await next.scrollIntoViewIfNeeded();
        assert.equal(await next.evaluate(el => { const r=el.getBoundingClientRect(); const target=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2); return target===el||el.contains(target); }),true,'the next lesson button must not be covered by instructions');
      }
      if ([0, 3, 7].includes(lesson))
        await page.screenshot({
          path:
            root +
            `artifacts/practice/${process.env.MOBILE_BROWSER || "chromium"}-${width}-lesson-${lesson + 1}.png`,
          fullPage: false,
        });
      if (lesson < 7)
        await dialog.getByRole("button", { name: /^다음 연습 ·/ }).click();
    }
    assert.equal(
      backend.rooms.size,
      0,
      "help practice must never create a multiplayer room",
    );
    assert.equal(
      await page.evaluate(() => localStorage.getItem("cheonwon-session")),
      null,
    );
    await dialog
      .getByRole("button", { name: "자세한 규칙 읽기", exact: true })
      .click();
    await dialog
      .getByRole("heading", { name: "내 돌 5개를 한 줄로 먼저 이으면 승리!" })
      .waitFor();
    await dialog
      .getByRole("button", { name: "직접 연습", exact: true })
      .click();
    await dialog.locator(".practice-task").waitFor();
    await dialog
      .getByRole("button", { name: "연습 닫기", exact: true })
      .click();
    await dialog.waitFor({ state: "hidden" });
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify(
      {
        lessons,
        widths,
        errors,
        checks: [
          "no nickname or room required",
          "all eight guided lessons",
          "incorrect move hint",
          "preview and confirmation",
          "shop and bench",
          "seal mana cost",
          "trait shields",
          "real five-stone win",
          "augmentation and altar",
          "written rules switch",
          "no multiplayer state changes",
        ],
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
  await vite.close();
  await backend.close();
}
