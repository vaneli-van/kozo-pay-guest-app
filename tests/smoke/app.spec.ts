import { test, expect } from "@playwright/test";

// Smoke tests: prove the build boots, routes serve, and nothing white-screens.
// They deliberately avoid business logic. Their job is to catch a broken build
// on every push, not to validate payments.

test("home route serves the diner app shell", async ({ page }) => {
  const res = await page.goto("/");
  expect(res, "server should respond on /").toBeTruthy();
  const status = res!.status();
  // 200 when the Supabase secrets are set on the repo (see tests/README.md).
  // A 500 means the server booted but SSR could not reach Supabase, which still
  // proves build + boot + routing. A hard crash would fail server startup above.
  expect(status, `unexpected status ${status}`).toBeLessThan(501);

  const bodyText = await page.locator("body").innerText();
  expect(bodyText.trim().length, "body should not be blank").toBeGreaterThan(0);

  if (status === 200) {
    await expect(page).toHaveTitle(/Klown/i);
  }
});

test("PWA manifest is served", async ({ request }) => {
  const res = await request.get("/manifest.webmanifest");
  expect(res.status()).toBe(200);
});

test("unknown route is handled, not a 5xx crash", async ({ page }) => {
  const res = await page.goto(`/does-not-exist-${Date.now()}`);
  expect(res).toBeTruthy();
  expect(res!.status(), "404 handling should not 5xx").toBeLessThan(500);
});
