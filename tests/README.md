# Tests (Playwright smoke)

These smoke tests run in GitHub Actions on every push (`.github/workflows/ci.yml`)
and gate every build. They check that the app builds, the dev server boots, and
the key routes serve real HTML. `tests/money/` adds the money-path checks: unit tests for the split allocation,
quote, tax and Paystack gross-up math (`math.spec.ts`) and contract tests that
every public money endpoint refuses a missing session with a JSON `{ok:false}`
(`api.spec.ts`). They run against the same dev server and need no secrets.

## Run locally

    bun add -d @playwright/test        # once, if not already installed
    bunx playwright install chromium   # once
    bunx playwright test               # boots `bun run dev` for you

## CI secrets (optional but recommended)

The build gate needs no secrets. The smoke job renders the diner home route,
which server-side-renders against Supabase. To make `/` return 200 (instead of
the graceful SSR error page), add these as GitHub repo secrets
(Settings > Secrets and variables > Actions). They are the publishable client
values, safe to expose:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_PROJECT_ID`

Without them the smoke job still passes (it proves boot + routing); with them it
also asserts the home route returns 200 with the Klown title.

## Playwright is not committed as a dependency

To keep Lovable's own install and build untouched, `@playwright/test` is NOT in
`package.json`. CI installs it at runtime; locally you install it yourself (see
above). This means `bun.lock` stays in sync with what Lovable builds.

## Diner UI checks (`tests/diner-ui/`)

One check per fix in diner release 2026.10.14 (audit: `claude/diner-app-audit-2026-10-14.md`
in the Klown project). They drive the real app on iPhone 13 and iPhone SE viewports with every
`/api/**` call answered by a fake backend (`mock.ts`), so they need no Supabase or Paystack:

    bunx playwright test -c tests/diner-ui/playwright.config.ts

They are excluded from the root config (and so from the CI gate) until they have passed in CI
once; then drop the `testIgnore` for `diner-ui` in `playwright.config.ts`.
