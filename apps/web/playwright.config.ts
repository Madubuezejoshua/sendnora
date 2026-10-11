import { defineConfig, devices } from '@playwright/test';

/**
 * Local run (default): boots the API (with its in-process outbox worker) and the production web build,
 * against the database in apps/api/.env. Build the web app first: `npm run build --workspace=@sendnaro/web`.
 * Set E2E_BASE_URL to test an already-deployed site instead (no servers are started).
 */
const remote = Boolean(process.env.E2E_BASE_URL);

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000, // cold Prisma + argon2 on first login is slow
  expect: { timeout: 15_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 3,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: remote
    ? undefined
    : [
        {
          command: 'npm run dev --workspace=@sendnaro/api',
          url: 'http://localhost:4000/health',
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          env: { WORKER_INLINE: 'true', ALLOW_LOCAL_WEBHOOK_TARGETS: 'true' },
        },
        {
          command: 'npm run start --workspace=@sendnaro/web',
          url: 'http://localhost:3000',
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      ],
});
