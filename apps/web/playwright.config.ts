import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';
const external = process.env.E2E_BASE_URL;
const root = fileURLToPath(new URL('../..',import.meta.url));
export default defineConfig({
  testDir:'./e2e',timeout:150_000,workers:1,fullyParallel:false,
  use:{baseURL:external??'http://localhost:5173/werewolf/',...devices['iPhone 13'],browserName:'chromium',channel:process.env.PLAYWRIGHT_CHANNEL,reducedMotion:'reduce',trace:'retain-on-failure'},
  reporter:'list',
  webServer:external?undefined:[
    {command:'npm run build -w @werewolf/shared && npm run build -w @werewolf/server && npm run start -w @werewolf/server',cwd:root,url:'http://localhost:3001/health',reuseExistingServer:!process.env.CI,timeout:60_000},
    {command:'npm run dev -w @werewolf/web',env:{E2E_NO_WATCH:'1'},cwd:root,url:'http://localhost:5173/werewolf/',reuseExistingServer:!process.env.CI,timeout:60_000}
  ]
});
