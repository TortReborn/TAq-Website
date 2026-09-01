import { defineConfig, devices } from '@playwright/test';

/**
 * E2E tests for the map page (live + history modes).
 *
 * Runs against the Next.js dev server on :3000 — an already-running server is
 * reused, otherwise one is started. The API routes talk to the real database,
 * so tests are written to assert behavior and instrumentation, not exact data.
 *
 * Run with: npm run test:e2e
 */
export default defineConfig({
  testDir: './e2e',
  // Serial: tests share one dev server and a rate-limited API (120 req/min),
  // and the history tab background-fetches event chunks while a page is open.
  workers: 1,
  fullyParallel: false,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
