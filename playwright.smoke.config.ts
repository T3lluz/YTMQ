import { defineConfig, devices } from '@playwright/test'

/**
 * Mocked-backend smoke config: runs the Vite dev server with placeholder
 * env vars and intercepts every Supabase request inside the page. Used to
 * verify UI behaviour without real Supabase credentials.
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
    baseURL: 'http://localhost:5173/YTMQ/',
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
    url: 'http://localhost:5173/YTMQ/',
    reuseExistingServer: true,
    timeout: 120_000,
    env: {
      ...process.env,
      VITE_SUPABASE_URL:
        process.env.VITE_SUPABASE_URL ?? 'https://stub.supabase.co',
      VITE_SUPABASE_ANON_KEY:
        process.env.VITE_SUPABASE_ANON_KEY ?? 'stub-anon-key',
      VITE_PUBLIC_SITE_URL:
        process.env.VITE_PUBLIC_SITE_URL ?? 'https://stub.github.io/YTMQ',
    },
  },
})
