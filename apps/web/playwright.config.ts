import { defineConfig, devices } from '@playwright/test';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';

// Use `next start` (production server, faster) in CI or when
// PLAYWRIGHT_SERVER_MODE=production is set. Otherwise use `next dev`
// for hot-reload during local development.
const WEB_SERVER_CMD =
  process.env.PLAYWRIGHT_SERVER_MODE === 'production'
    ? 'NODE_ENV=test NEXT_PUBLIC_DEMO_MODE=true npx next start --port 3000'
    : 'NODE_ENV=test NEXT_PUBLIC_DEMO_MODE=true npx next dev --port 3000';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['list'],
  ],
  timeout: 60_000,
  expect: {
    timeout: 15_000,
  },
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  // Auto-start the Next.js server with the test run.
  // Set PLAYWRIGHT_BASE_URL to skip the webServer and test against an
  // external deployment (e.g. preview URL in CI).
  // Set PLAYWRIGHT_SERVER_MODE=production to use `next start` (faster).
  webServer: {
    command: WEB_SERVER_CMD,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'desktop-chrome',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: 'mobile-chrome',
      use: {
        ...devices['Pixel 5'],
        viewport: { width: 393, height: 851 },
      },
    },
    {
      name: 'tablet-chrome',
      use: {
        ...devices['iPad Pro 11'],
        viewport: { width: 834, height: 1194 },
      },
    },
  ],
});
