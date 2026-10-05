# Testing and releasing Klown

Every change goes through three gates before diners see it.

## 1. CI (automatic, on every push)

GitHub Actions builds the app and runs the Playwright suite, including the
money-path tests in `tests/money/` (split allocation, quotes, taxes, Paystack
gross-up, payment-mode guards). A red CI run means do not publish.

## 2. The preview (staging)

Every push to `main` (and every edit made in the Lovable editor) lands on the
Lovable preview first:

    https://id-preview--7ca98bfa-f218-47af-a75e-d3dcbb505ee8.lovable.app

It runs the new code against the live database, but the server treats the
preview host as staging:

- live restaurants (Baobab, Naxos, …) can be viewed but cannot take a
  payment there (`live_payments_disabled_on_staging`), so nobody is ever
  charged by an unreleased build;
- test-mode restaurants (`restaurants.payment_mode = 'test'`) pay through
  Paystack TEST mode with test cards / test MoMo numbers. No money moves.

Test with the **Klown Test Kitchen** (tables 01 to 05). Open a table link on
the preview host, e.g.

    https://id-preview--7ca98bfa-f218-47af-a75e-d3dcbb505ee8.lovable.app/s/<table token>

tap "View bill" then "Create a test bill", and run the flow: pay in full,
split by item, partial payment, tip, card, MoMo, receipt, review. Table tokens
are in the project doc `claude/test-mode-and-staging.md`.

Paystack test details (https://paystack.com/docs/payments/test-payments/):
card `4084 0840 8408 4081`, expiry `09/27`, CVV `408` (succeeds with no PIN or
OTP); MTN MoMo `055 123 4987` (succeeds with no prompt). The same page lists
cards that exercise PIN and OTP steps and cards that fail, for the error path.

## 3. Publish (go live)

When the preview is right and CI is green, publish:

- diner app: Lovable → Publish (or ask Claude to run `deploy_project`);
- owner portal (`klown-table-pay`): same, its preview is
  `https://id-preview--65576e1f-3142-41d1-9a5a-81d4bf16e138.lovable.app`.

Publishing ships exactly the build you tested; only the host changes.

## Database changes

Preview and live share one database, so a schema change is live the moment it
is applied. Keep migrations backward compatible: add columns and functions,
never rename or drop something the published build still uses in the same
release. Drop old things in a later release, after the code that used them is
published.

## Secrets

- `PAYSTACK_SECRET_KEY`: live key (sk_live_…). Live restaurants only.
- `PAYSTACK_TEST_SECRET_KEY`: test key (sk_test_…). Test-mode restaurants
  only; the code refuses anything that is not an `sk_test_` key here.
- `KLOWN_ENV=staging`: set only on a separately hosted staging copy, if one is
  ever added; it refuses all live payments.
