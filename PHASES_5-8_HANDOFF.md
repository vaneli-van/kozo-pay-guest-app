# Kozo Pay — Phases 5–8 handoff

This change set completes the payment money-path, receipts, optional identity + rewards,
private feedback, the Google-review handoff, and drops in the four real photos. It builds on
Phases 0–4 already in the repo.

## What's in here

**Backend (server-authoritative — the client is never trusted with money)**
- `src/integrations/billing/calc.ts` — split + tip math (integer pesewas). Overpay / zero-value / nothing-due are rejected here. **Unit-tested: 11/11 pass.**
- `src/integrations/payments/provider.ts` — `PaymentProvider` interface + `MockPaymentProvider`, HMAC callback signing/verification, idempotent capture (`applyProviderCallback`), remaining-balance helper.
- `src/routes/api/public/quote.ts` — server quote preview.
- `src/routes/api/public/payment-init.ts` — **idempotent** initiation (unique per `session + idempotencyKey`), server-computed amount, no PIN/CVV/card/MoMo-number stored.
- `src/routes/api/public/payment-status.ts` — poll status (client waits on this; success only after server capture).
- `src/routes/api/public/payment-webhook.ts` — **signed** provider callback → capture/fail.
- `src/routes/api/mock/pay-callback.ts` — DEMO-only provider simulator (remove in prod; real provider hits the webhook).
- `receipt.ts`, `otp-send.ts`, `otp-verify.ts`, `rewards-consent.ts`, `feedback.ts`, `review-link.ts` — receipts, mock OTP (no OTP stored), separated consents (receipt / rewards / marketing are distinct), private feedback with sentiment, Google review deep-link.

**Frontend (design-locked — only handlers/data changed, never markup/CSS)**
- `src/App.tsx` — centralised interceptors + effects: payment init on commit, status polling, receipt fetch, OTP/consent/feedback, and the feedback→Google-review branch on positive sentiment.
- `src/screens/screens.tsx` — wired the payment, receipt, rewards, and feedback screens to the real endpoints; added the **ReviewHandoff** screen (required state that the prototype lacked). Selection (share mode / people / tip / method) is captured and sent to the server.
- `src/session/machine.ts` — added the `review-handoff` screen, a `patch` action, and optional runtime fields.

**Data + assets**
- `supabase/migrations/20260826230000_phase4_7_schema.sql` — repo record of the tables (already applied to the live DB).
- `src/integrations/supabase/types.ts` — added the new tables' types.
- `public/klown-logo.png`, `public/assets/{sea-bass,chocolate-fondant,restaurant-hero}.png` — the four real photos.

## The ONE thing to set

Add a secret named **`PAYMENT_WEBHOOK_SECRET`** in Lovable (Cloud → secrets / project env). Any random
string. It signs the payment webhook. The mock demo works without it (falls back to a dev value), but set it before wiring a real provider.

`routeTree.gen.ts` does **not** need hand-editing — Lovable's `vite build` regenerates it from the new route files on push.

## How this was verified (and its limits)

- ✅ `calc.ts` money math — unit-tested locally, 11/11 (overpay, zero-value, partial-remaining, rounding, tip precedence).
- ✅ Frontend — every new/changed screen rendered under Vite with **zero runtime/console errors**; a pixel diff vs the Phase-0 baseline shows **no regression** (the only geometry changes are the intended Phase-4 "Report a problem" link and the dev handoff navigator).
- ✅ Google-review screen renders on-brand (Center pattern, square corners, Georgia-italic).
- ⚠️ The **server routes were not executed locally** — the project depends on private `@lovable.dev/*` packages that can't be installed outside Lovable, and the Supabase service-role secret isn't in git. They match the exact pattern of the Phase 2–4 routes that already build in Lovable, and the DB logic was validated with direct SQL. **Please run the checklist below after pushing.**

## Post-push verification checklist

Resolve a session token, then exercise the endpoints (replace `$T`):

```bash
BASE=https://<your-preview>.lovable.app
T=$(curl -s -X POST $BASE/api/public/qr-resolve -H 'content-type: application/json' -d '{"qrToken":"demo"}' | jq -r .sessionToken)

# split/tip quote
curl -s $BASE/api/public/quote -H 'content-type: application/json' -d "{\"sessionToken\":\"$T\",\"mode\":\"full\",\"tipPercent\":10}"      # share 34650 tip 3465 grand 38115
curl -s $BASE/api/public/quote -H 'content-type: application/json' -d "{\"sessionToken\":\"$T\",\"mode\":\"custom\",\"customAmountPesewas\":99999}"  # overpay

# payment: init (idempotent) -> mock capture -> status
K=$(uuidgen)
R=$(curl -s $BASE/api/public/payment-init -H 'content-type: application/json' -d "{\"sessionToken\":\"$T\",\"idempotencyKey\":\"$K\",\"mode\":\"full\",\"tipPercent\":10,\"provider\":\"momo\"}")
echo $R; PR=$(echo $R | jq -r .paymentRef)
curl -s $BASE/api/public/payment-init -H 'content-type: application/json' -d "{\"sessionToken\":\"$T\",\"idempotencyKey\":\"$K\",\"mode\":\"full\"}" | jq .idempotent   # true, same ref
curl -s $BASE/api/mock/pay-callback -H 'content-type: application/json' -d "{\"sessionToken\":\"$T\",\"paymentRef\":\"$PR\",\"outcome\":\"captured\"}"
curl -s $BASE/api/public/payment-status -H 'content-type: application/json' -d "{\"sessionToken\":\"$T\",\"paymentRef\":\"$PR\"}" | jq .status  # captured
curl -s $BASE/api/public/receipt -H 'content-type: application/json' -d "{\"sessionToken\":\"$T\"}"                # receiptNumber + total
curl -s $BASE/api/public/feedback -H 'content-type: application/json' -d "{\"sessionToken\":\"$T\",\"rating\":5}"  # sentiment positive
```

Then walk the UI at `/s/demo`: full pay → tip → Mobile Money → number → approve → processing → **Demo: complete** → success → receipt → save receipt → phone → code `123456` → name → rewards → 5 stars → **Google review handoff** → done.

## Design sign-off (three screens with no v0 baseline)

Built in the established Center / sheet-options pattern — please eyeball:
1. **InvalidSession** (Phase 2) — expired/invalid QR.
2. **BillIssue** (Phase 4) — report a bill problem.
3. **ReviewHandoff** (Phase 7) — Google review after positive feedback.

## Phase 8 status
Done: RLS on every table (no anon policies), secrets server-side only, idempotent payments, server-authoritative capture, no PIN/CVV/OTP storage, money-math unit test, frontend visual-regression vs baseline.
Remaining: full accessibility pass (44px targets on stars/tabs/text-links, focus states, aria), automated tests for the journeys, a security review, and swapping the mock POS/MoMo/card/SMS adapters for real providers (documented in each adapter).
