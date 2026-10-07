import { defineConfig, devices } from '@playwright/test';

// The tests share the harness database, so they run one at a time.
export default defineConfig({
  testDir: 'tests',
  workers: 1,
  forbidOnly: !!process.env.CI,
  reporter: [['list']],
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:8080',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
