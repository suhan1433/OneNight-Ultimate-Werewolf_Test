import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium, webkit } from "@playwright/test";
import { io } from "socket.io-client";
import { createGameServer } from "../server/app.ts";
import { createGame, gameView } from "../shared/engine.ts";
import { HEROES } from "../shared/data.ts";

const artifacts = fileURLToPath(
  new URL(
    `../artifacts/mobile-${process.env.MOBILE_BROWSER || "chromium"}/`,
    import.meta.url,
  ),
);
await mkdir(artifacts, { recursive: true });
const backend = createGameServer();
await new Promise((resolve) => backend.server.listen(0, "127.0.0.1", resolve));
const vite = await createServer({
  root: fileURLToPath(new URL("../", import.meta.url)),
  configFile: fileURLToPath(new URL("../vite.config.ts", import.meta.url)),
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
const origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
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
  if (engine === webkit) {
    await vite.close();
    await backend.close();
    throw error;
  }
  browser = await chromium.launch({ headless: true });
}
const peers = [];
const errors = [];
const failures = [];
let scenarios = 0;
function publish(room) {
  for (const p of room.seats) {
    if (p.socketId)
      backend.io
        .to(p.socketId)
        .emit("state", {
          code: room.code,
          host: room.host,
          self: p.id,
          public: room.public,
          tutorial: room.tutorial,
          serverTime: Date.now(),
          seats: room.seats.map(({ token, socketId, ...s }) => s),
          chat: room.chat,
          game: room.game ? gameView(room.game, p.id) : null,
        });
  }
}
function fixture(room, phase) {
  const g = createGame(
    room.seats.map((p) => ({ id: p.id, name: p.name })),
    123,
    Date.now(),
  );
  const me = g.players.find((p) => p.id === room.host);
  me.gold = 999;
  me.level = 8;
  me.xp = 62;
  me.mana = 10;
  me.bench = HEROES.slice(0, 9).map((h, i) => ({
    uid: `fixture-${i}`,
    hero: h.id,
    star: 2,
    copies: 3,
    paid: h.cost * 3,
  }));
  const enemy = g.players.find((p) => p.id !== me.id);
  enemy.gold = 999;
  enemy.level = 8;
  enemy.mana = 10;
  g.phase = phase;
  g.turn = me.id;
  g.deadline = Date.now() + 25000;
  if (phase === "augment") {
    me.choices = ["cash", "shields", "mana", "emblem"];
    enemy.choices = ["cash"];
    me.augmentRerolls = 1;
  }
  if (phase === "altar") {
    g.altar = ["guard", "thunder", "summoner", "dealer"];
    g.altarOrder = [me.id, enemy.id, enemy.id, me.id];
  }
  if (phase === "result") {
    g.winner = me.id;
    g.reason = "다섯 개의 돌이 하나의 선을 이었습니다.";
  }
  if (phase === "turn") {
    g.board[84] = {
      uid: "fixture-legend",
      hero: "legend",
      star: 1,
      copies: 1,
      paid: 5,
      owner: me.id,
      placed: 0,
      protectedUntil: -1,
      sealedUntil: 0,
      shield: false,
      shieldRegen: 0,
      cooldown: 0,
      uses: 0,
      tokenUntil: 0,
    };
  }
  room.game = g;
  return g;
}
async function audit(page, label) {
  await page.evaluate(() => document.fonts.ready);
  const issues = await page.evaluate(() => {
    const problems = [];
    const rect = (e) => e.getBoundingClientRect();
    const visible = (e) => {
      const r = rect(e);
      return (
        r.width > 0 &&
        r.height > 0 &&
        getComputedStyle(e).visibility !== "hidden"
      );
    };
    const intersects = (a, b) =>
      a.left < b.right - 1 &&
      a.right > b.left + 1 &&
      a.top < b.bottom - 1 &&
      a.bottom > b.top + 1;
    if (document.documentElement.scrollWidth > innerWidth + 1)
      problems.push(
        `page width ${document.documentElement.scrollWidth} > ${innerWidth}`,
      );
    for (const selector of [
      ".topbar",
      ".player-card",
      ".match-top",
      ".action-dock",
      ".shop-section > .section-heading",
      ".invite-bar",
      ".lobby-controls",
      ".augment-options",
      ".result-bar",
    ]) {
      for (const parent of document.querySelectorAll(selector)) {
        if (!visible(parent)) continue;
        const children = [...parent.children].filter(visible);
        for (let i = 0; i < children.length; i++)
          for (let j = i + 1; j < children.length; j++)
            if (intersects(rect(children[i]), rect(children[j])))
              problems.push(`${selector}: children overlap`);
        for (const child of children) {
          const r = rect(child),
            p = rect(parent);
          if (r.left < p.left - 1 || r.right > p.right + 1)
            problems.push(`${selector}: child outside panel`);
        }
      }
    }
    const board = document.querySelector(".board");
    if (board) {
      const r = rect(board);
      if (r.width < Math.min(innerWidth * 0.75, 400))
        problems.push(`collapsed board ${r.width}`);
      if (Math.abs(r.width - r.height) > 2) problems.push("board not square");
      const dock = document.querySelector(".action-dock");
      if (dock && intersects(r, rect(dock)))
        problems.push("action dock covers board");
    }
    return problems;
  });
  scenarios++;
  if (issues.length) {
    failures.push({ label, issues });
  }
  await page.screenshot({
    path: `${artifacts}/${label}.png`,
    fullPage: true,
    animations: "disabled",
  });
}
try {
  for (const { width, height } of [
    { width: 320, height: 568 },
    { width: 360, height: 640 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
    { width: 667, height: 375 },
    { width: 768, height: 1024 },
  ].filter(
    (v) =>
      !process.env.MOBILE_WIDTH || v.width === Number(process.env.MOBILE_WIDTH),
  )) {
    const context = await browser.newContext({
      viewport: { width, height },
      isMobile: width <= 700,
      hasTouch: true,
      deviceScaleFactor: 1,
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`${origin}/gomoku/`);
    await page.locator(".connection-banner").waitFor({ state: "hidden" });
    const prefix = `${width}x${height}`;
    await audit(page, `${prefix}-home`);
    await page
      .getByLabel("대국자 이름")
      .fill("달빛아래전략을읽는긴이름의대국자".slice(0, 16));
    await page
      .getByRole("button", { name: "대국 시작 · 방 만들기", exact: true })
      .click();
    await page.locator(".lobby").waitFor();
    const session = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("cheonwon-session")),
    );
    const room = backend.rooms.get(session.code);
    const peer = io(origin, {
      path: "/api/gomoku/socket",
      transports: ["websocket"],
      forceNew: true,
    });
    peers.push(peer);
    await new Promise((r) => peer.once("connect", r));
    assert.equal(
      (
        await peer
          .timeout(5000)
          .emitWithAck("room:join", {
            code: session.code,
            name: "상대의아주긴닉네임도겹치지않게".slice(0, 16),
          })
      ).ok,
      true,
    );
    await audit(page, `${prefix}-lobby`);
    for (const phase of ["prep", "turn", "augment", "altar", "result"]) {
      fixture(room, phase);
      publish(room);
      await page.locator(`.phase-${phase}`).waitFor();
      await page.locator(".act-card").waitFor({ state: "hidden" });
      await page.evaluate(() => scrollTo(0, 0));
      await audit(page, `${prefix}-${phase}`);
      if (phase === "turn") {
        // A short press must stay short even when the 250ms clock rerenders the UI.
        const stone = page.locator(".intersection").nth(84);
        await stone.dispatchEvent("pointerdown", {
          pointerId: 1,
          pointerType: "touch",
          isPrimary: true,
          button: 0,
        });
        await page.waitForTimeout(300);
        await stone.dispatchEvent("pointerup", {
          pointerId: 1,
          pointerType: "touch",
          isPrimary: true,
          button: 0,
        });
        await page.waitForTimeout(250);
        assert.equal(
          await page
            .getByRole("dialog", { name: "석혼 상세", exact: true })
            .count(),
          0,
          "short touch opened a long-press dialog",
        );
        await stone.dispatchEvent("pointerdown", {
          pointerId: 2,
          pointerType: "touch",
          isPrimary: true,
          button: 0,
        });
        await page.waitForTimeout(500);
        await stone.dispatchEvent("pointerup", {
          pointerId: 2,
          pointerType: "touch",
          isPrimary: true,
          button: 0,
        });
        const detail = page.getByRole("dialog", {
          name: "석혼 상세",
          exact: true,
        });
        await detail.waitFor();
        await detail.getByRole("button", { name: "닫기", exact: true }).click();
        await stone.tap();
        await audit(page, `${prefix}-stone-selected`);
        await page.locator(".action-dock .primary").click();
        await audit(page, `${prefix}-skill-target`);
        if (width <= 900) {
          await page
            .getByRole("button", { name: "대국 정보", exact: true })
            .click();
          await audit(page, `${prefix}-panels`);
        }
      }
    }
    await page.getByRole("button", { name: "설정", exact: true }).click();
    await page.getByRole("dialog", { name: "설정", exact: true }).waitFor();
    await audit(page, `${prefix}-settings`);
    await context.close();
    peer.disconnect();
  }
  assert.deepEqual(errors, [], "browser errors");
  console.log(
    JSON.stringify({ scenarios, failures, errors, artifacts }, null, 2),
  );
  if (process.env.MOBILE_AUDIT_ONLY !== "1")
    assert.deepEqual(failures, [], "mobile layout failures");
} finally {
  peers.forEach((p) => p.disconnect());
  await browser.close();
  await vite.close();
  await backend.close();
}
