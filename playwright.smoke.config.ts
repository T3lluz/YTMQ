import { defineConfig, devices } from '@playwright/test'

/**
 * Mocked-backend smoke config: runs the Vite dev server pointed at a stub
 * API and intercepts every request to it inside the page. Used to verify UI
 * behaviour without a running YTMQ server.
 */
export default defineConfig({
  testDir: './tests/smoke',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: 'http://localhost:5173/ytmq/',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173/ytmq/',
    reuseExistingServer: true,
    timeout: 120_000,
    env: {
      ...process.env,
      VITE_API_URL: 'https://stub.ytmq.test/api',
      VITE_PUBLIC_SITE_URL:
        process.env.VITE_PUBLIC_SITE_URL ?? 'https://stub.ytmq.test/ytmq',
      VITE_SPOTIFY_CLIENT_ID:
        process.env.VITE_SPOTIFY_CLIENT_ID ?? 'stub-spotify-client-id',
    },
  },
})
