import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
const { chromium } = require("@playwright/test");
const base = process.env.E2E_BASE_URL || "http://localhost:5180/gomoku/";
let browser;
try {
  browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_CHANNEL || "chrome",
    headless: true,
  });
} catch {
  browser = await chromium.launch({ headless: true });
}
const errors = [];
const a = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    reducedMotion: "reduce",
  }),
  b = await browser.newContext({
    viewport: { width: 1280, height: 1000 },
    reducedMotion: "reduce",
  });
const host = await a.newPage(),
  guest = await b.newPage();
for (const page of [host, guest])
  page.on("pageerror", (e) => errors.push(e.message));
await mkdir(new URL("../artifacts/", import.meta.url), { recursive: true });
const snap = (page, name) =>
  page.screenshot({
    path: new URL(`../artifacts/${name}.png`, import.meta.url).pathname,
    fullPage: true,
  });
async function button(page, name) {
  await page.getByRole("button", { name, exact: true }).click();
}
try {
  await host.goto(base);
  await host.getByRole("heading", { name: "신전으로 들어서다" }).waitFor();
  await host.locator(".connection-banner").waitFor({ state: "hidden" });
  await host.getByLabel("대국자 이름").fill("달빛");
  await snap(host, "home-desktop");
  await button(host, "대국 시작 · 방 만들기");
  await host.getByRole("heading", { name: "달이 머무는 대기실" }).waitFor();
  const code = await host.locator(".invite-bar b").textContent();
  await guest.goto(`${base}?room=${code}`);
  await guest.getByLabel("대국자 이름").fill("별빛");
  await guest.locator(".connection-banner").waitFor({ state: "hidden" });
  await button(guest, "신전에 입장하기");
  await guest.getByRole("heading", { name: "달이 머무는 대기실" }).waitFor();
  await host.getByRole("heading", { name: "별빛", exact: true }).waitFor();
  await button(host, "준비 완료");
  await button(guest, "준비 완료");
  await snap(host, "lobby-desktop");
  await button(host, "대국 시작");
  await host.locator(".board").waitFor();
  await guest.locator(".board").waitFor();
  // Purchase a real shop hero, with both private shops hidden from the other user.
  const shop = host.locator(".shop-cards .hero-card-main").first();
  const heroName = await shop.locator("b").textContent();
  await shop.click();
  await host.locator(".bench-unit").first().waitFor();
  assert.equal(await guest.locator(".bench-unit").count(), 0);
  await snap(host, "game-desktop");
  await host.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await host.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
    "mobile overflow",
  );
  await snap(host, "game-mobile");
  await button(host, "정비 완료");
  await button(guest, "정비 완료");
  await host.waitForTimeout(100);
  const first = (await host.locator(".phase-clock").textContent()).includes(
      "당신의 차례",
    )
      ? host
      : guest,
    second = first === host ? guest : host;
  if (first === host) await host.locator(".bench-main").first().click();
  await first.getByRole("button", { name: "G7 빈 칸", exact: true }).click();
  await button(first, "착수 확정");
  await first.getByRole("button", { name: "턴 마치기", exact: true }).waitFor();
  await second.waitForTimeout(150);
  assert.match(
    await second.locator(".intersection").nth(84).getAttribute("aria-label"),
    /플레인|달빛|별빛/,
  );
  await button(first, "턴 마치기");
  if (second === host) await host.locator(".bench-main").first().click();
  await second.getByRole("button", { name: "A13 빈 칸", exact: true }).click();
  await button(second, "착수 확정");
  await button(second, "턴 마치기");
  await host.waitForTimeout(150);
  const stonesBeforeReload = await host
    .locator(".board .stone:not(.ghost)")
    .count();
  await host.reload();
  await host.locator(".board").waitFor();
  assert.equal(
    await host.locator(".board .stone:not(.ghost)").count(),
    stonesBeforeReload,
  );
  // Drive through the first augmentation and altar using actual UI commands.
  for (let round = 2; round <= 4; round++) {
    if (round === 3) {
      for (const page of [host, guest]) {
        const choices = page.locator(".augment-card");
        await choices.first().waitFor();
        let selected = false;
        for (const name of [
          "비상금",
          "마나 샘",
          "단단한 시작",
          "복리",
          "연쇄 시전",
          "공격적 레벨업",
        ]) {
          const c = choices.filter({
            has: page.getByRole("heading", { name, exact: true }),
          });
          if (await c.count()) {
            await c.click();
            selected = true;
            break;
          }
        }
        assert.ok(selected);
      }
    }
    if (round === 4) {
      for (let i = 0; i < 4; i++) {
        await host.waitForTimeout(150);
        const page = (await host
          .locator(".altar-cards .hero-card-main:not(:disabled)")
          .count())
          ? host
          : guest;
        await page
          .locator(".altar-cards .hero-card-main:not(:disabled)")
          .first()
          .click();
      }
      await host.locator(".choice-backdrop").waitFor({ state: "hidden" });
      break;
    }
    for (const page of [host, guest]) await button(page, "정비 완료");
    await host.waitForTimeout(100);
    for (let i = 0; i < 2; i++) {
      const page = (await host.locator(".phase-clock").textContent()).includes(
        "당신의 차례",
      )
        ? host
        : guest;
      const c = round === 2 ? (i === 0 ? "M1" : "A1") : i === 0 ? "M13" : "C11";
      await page
        .getByRole("button", { name: `${c} 빈 칸`, exact: true })
        .click();
      await button(page, "착수 확정");
      await button(page, "턴 마치기");
      await host.waitForTimeout(100);
    }
  }
  await host.getByRole("button", { name: "대국 정보", exact: true }).click();
  await button(host, "기권하기");
  await host
    .getByRole("dialog", { name: "대국 종료 확인" })
    .getByRole("button", { name: "기권하기", exact: true })
    .click();
  await host.getByRole("dialog", { name: "대국 결과" }).waitFor();
  await snap(host, "result-mobile");
  await host.locator(".replay summary").click();
  const finalStones = await host.locator(".board .stone:not(.ghost)").count();
  const slider = host.getByRole("slider", { name: "복기 장면 번호" });
  const max = Number(await slider.getAttribute("max"));
  await slider.fill("0");
  assert.equal(await host.locator(".replay-stone").count(), 0);
  await slider.fill(String(max));
  assert.equal(await host.locator(".replay-stone").count(), finalStones);
  const saved = host.waitForEvent("download");
  await button(host, "기록 저장");
  const download = await saved;
  await download.saveAs(
    new URL("../artifacts/browser-replay.json", import.meta.url).pathname,
  );

  await button(host, "대기실에서 다시 만나기");
  await guest.getByRole("heading", { name: "달이 머무는 대기실" }).waitFor();
  await host.getByRole("button", { name: "나가기", exact: true }).click();
  await host
    .getByRole("dialog", { name: "대국 종료 확인" })
    .getByRole("button", { name: "나가기", exact: true })
    .click();
  await host.getByRole("heading", { name: "신전으로 들어서다" }).waitFor();
  await snap(host, "home-mobile");
  assert.equal(
    await host.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
  );
  await host.getByRole("button", { name: /사범과 연습/ }).click();
  await host.getByRole("heading", { name: "달빛 사범", exact: true }).waitFor();
  await button(host, "준비 완료");
  await button(host, "대국 시작");
  await button(host, "정비 완료");
  await host
    .locator(".phase-clock", { hasText: "당신의 차례" })
    .waitFor({ timeout: 15000 });
  await host.getByRole("button", { name: "A1 빈 칸", exact: true }).click();
  await button(host, "착수 확정");
  await button(host, "턴 마치기");
  await host
    .locator(".match-top h1", { hasText: "제 2 라운드" })
    .waitFor({ timeout: 10000 });
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify(
      {
        ok: true,
        checks: [
          "home",
          "two-player-lobby",
          "purchase",
          "placement",
          "private-bench",
          "reconnection",
          "augmentation",
          "altar",
          "surrender",
          "rematch",
          "mobile-overflow",
          "board-replay",
          "replay-download",
          "bot-practice",
        ],
        hero: heroName,
        screenshots: "gomoku/artifacts",
        errors,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
