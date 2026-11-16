import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 45000,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:3017",
    headless: true,
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : {},
    trace: "retain-on-failure",
  },
  webServer: {
    command:
      "PORT=3017 BOT_DELAY_MS=40 DATA_DIR=/tmp/secret-hitler-e2e-data npm start",
    url: "http://127.0.0.1:3017/health",
    reuseExistingServer: false,
    timeout: 30000,
  },
});
