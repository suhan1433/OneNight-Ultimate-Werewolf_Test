import { test, expect } from "@playwright/test";

test("데스크톱: 홈 → 대기실 → 봇 4명 → 역할 열람 → 실시간 플레이 → 결과", async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.goto("/secret_hitler/");
  await expect(
    page.getByRole("button", { name: "새 의회 개설" }),
  ).toBeDisabled();
  await page.getByPlaceholder("의원 이름").fill("테스트 의원");
  await page.getByRole("button", { name: "새 의회 개설" }).click();
  await expect(
    page.getByRole("heading", { name: "개회 대기실" }),
  ).toBeVisible();
  for (let i = 0; i < 4; i++) {
    await page
      .getByRole("button", { name: "훈련 의원 추가", exact: true })
      .click();
    await expect(page.locator(".dossier")).toHaveCount(i + 2);
  }
  await page.getByRole("button", { name: "준비 완료", exact: true }).click();
  await page.screenshot({
    path: "test-results/lobby-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "개회 선언" }).click();
  await expect(
    page.getByRole("heading", { name: "비밀 역할 확인" }),
  ).toBeVisible();
  await page.locator(".hold-file").hover();
  await page.mouse.down();
  await expect(page.locator(".hold-file")).toHaveClass(/opened/);
  await page.mouse.up();
  await expect(page.locator(".hold-file")).not.toHaveClass(/opened/);
  await page
    .getByRole("button", { name: "역할 확인 완료", exact: true })
    .click();
  await expect(page.locator(".policy-board")).toBeVisible();
  await page.screenshot({
    path: "test-results/board-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  for (let i = 0; i < 150; i++) {
    if (await page.locator(".results").count()) break;
    const candidate = page.locator(".seat.candidate").first();
    if (await candidate.isVisible()) {
      await candidate.click();
      const sign = page.locator(".hold-sign");
      await expect(sign).toBeEnabled();
      if (await sign.isEnabled()) {
        await sign.focus();
        await page.keyboard.down("Space");
        await page.waitForTimeout(1200);
        await page.keyboard.up("Space");
      }
    }
    const result = page.locator(".vote-confirm");
    if (await result.isVisible() && await result.isEnabled()) await result.click();
    if (await page.locator("dialog[open]").count()) {
      const confirm = page
        .locator("dialog[open]")
        .getByRole("button", { name: "확인", exact: true });
      if (await confirm.count()) await confirm.click();
    }
    const vote = page.getByRole("button", { name: "자! · 찬성", exact: true });
    if (await vote.isVisible()) await vote.click();
    const policy = page.locator(".policy-hand button").first();
    if (await policy.isVisible()) await policy.click();
    for (const name of ["정책 엿보기", "열람 완료"]) {
      const button = page
        .locator(".action-panel")
        .getByRole("button", { name, exact: true });
      if (await button.isVisible()) await button.click();
    }
    await page.waitForTimeout(160);
  }
  await expect(page.locator(".results")).toBeVisible({ timeout: 10000 });
  await expect(page.locator(".result-roles article")).toHaveCount(5);
  await page.screenshot({
    path: "test-results/result-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.reload();
  await expect(page.locator(".results")).toBeVisible();
  expect(errors).toEqual([]);
});

test("모바일 390px: 가로 넘침·키보드 접근·규칙·크레딧·PWA", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/secret_hitler/");
  await expect(
    page.getByRole("button", { name: "새 의회 개설" }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/home-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "규칙 열람", exact: true }).click();
  await expect(page.locator("dialog")).toBeVisible();
  await expect(page.locator("dialog")).toContainText("정책 카드는 총 17장");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "크레딧 ↗" }).click();
  await expect(page.locator("dialog")).toContainText("CC BY-NC-SA 4.0");
  await page.keyboard.press("Escape");
  await page.getByPlaceholder("의원 이름").fill("모바일 의원");
  await page.getByRole("button", { name: "새 의회 개설" }).click();
  for (let i = 0; i < 4; i++) {
    await page
      .getByRole("button", { name: "훈련 의원 추가", exact: true })
      .click();
    await expect(page.locator(".dossier")).toHaveCount(i + 2);
  }
  await page.getByRole("button", { name: "준비 완료", exact: true }).click();
  await page.getByRole("button", { name: "개회 선언" }).click();
  await page.locator(".hold-file").focus();
  await page.keyboard.down("Space");
  await expect(page.locator(".hold-file")).toHaveClass(/opened/);
  await page.keyboard.up("Space");
  await expect(page.locator(".hold-file")).not.toHaveClass(/opened/);
  await page
    .getByRole("button", { name: "역할 확인 완료", exact: true })
    .click();
  await expect(page.locator(".policy-board")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/board-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  const manifest = await page.request.get(
    "/secret_hitler/manifest.webmanifest",
  );
  expect(manifest.ok()).toBe(true);
  expect((await manifest.json()).display).toBe("standalone");
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
});
