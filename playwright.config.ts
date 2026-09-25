import { defineConfig, devices } from "@playwright/test";

// Klown diner app (kozo-pay-guest-app) smoke config.
// The app is a TanStack Start SSR build (nitro/Cloudflare target), so we test
// against `vite dev`, not `vite preview`. Readiness is checked against a static
// asset so a missing-Supabase SSR error never stalls the server startup probe.

const PORT = 4321;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  // Locally this boots the dev server for you. In CI the workflow starts it
  // first, and reuseExistingServer makes Playwright attach to that one.
  webServer: {
    command: `bun run dev --port ${PORT} --host 127.0.0.1`,
    url: `${BASE_URL}/robots.txt`,
    reuseExistingServer: true,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
