import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 150_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["json", { outputFile: "../../docs/e2e-results.json" }]],
  use: {
    baseURL: "http://127.0.0.1:3304",
    viewport: { width: 390, height: 844 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "PORT=3304 pnpm --filter @deception/server start",
    cwd: "../..",
    url: "http://127.0.0.1:3304/health",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
