import { defineConfig, devices } from '@playwright/test';
export default defineConfig({ testDir: './e2e', timeout: 60_000, use: { baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:8080', ...devices['iPhone 13'] }, reporter: 'list' });
