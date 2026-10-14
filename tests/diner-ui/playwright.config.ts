import { defineConfig, devices } from '@playwright/test'

// Diner UI regression checks on real phone viewports (see fixes.spec.ts). Same dev server as the
// root config; the backend is faked per test, so no Supabase or Paystack is needed.
const PORT = 4321
const BASE_URL = `http://127.0.0.1:${PORT}`
const i13 = devices['iPhone 13']
const se = devices['iPhone SE']
const phone = (d: typeof i13) => ({ browserName: 'chromium' as const, viewport: d.viewport, userAgent: d.userAgent, deviceScaleFactor: d.deviceScaleFactor, isMobile: true, hasTouch: true })

export default defineConfig({
  testDir: '.',
  timeout: 90_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: BASE_URL, actionTimeout: 8_000, navigationTimeout: 30_000, serviceWorkers: 'block', screenshot: 'only-on-failure' },
  projects: [
    { name: 'iphone13', use: phone(i13) },
    { name: 'iphoneSE', use: phone(se) },
  ],
  webServer: {
    command: `bun run dev --port ${PORT} --host 127.0.0.1`,
    url: `${BASE_URL}/robots.txt`,
    reuseExistingServer: true,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
})
