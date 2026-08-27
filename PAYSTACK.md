# Kozo Pay — Paystack integration (Ghana: MoMo + card)

Paystack drops in behind the existing `PaymentProvider` interface. **No diner-facing screen
was redesigned** — the change is server-side plus a few handler wirings. Money stays in integer
pesewas end to end, which is exactly the subunit Paystack's `amount` expects (no conversion).

## What changed

**Server**
- `src/integrations/payments/provider.ts` — added `PaystackProvider` (selected automatically when
  `PAYSTACK_SECRET_KEY` is set; otherwise the mock runs). MoMo uses Paystack's **direct charge**;
  card uses **`transaction/initialize`** (hosted page — we never touch the card number, so no
  PCI-DSS burden). Plus `verifyPaystackTransaction`, `submitPaystackOtp`, and
  `verifyPaystackSignature` (HMAC-SHA512, verified byte-for-byte against Node's crypto).
- `src/routes/api/public/paystack-webhook.ts` — **new.** The signed webhook. Verifies
  `x-paystack-signature` on the raw body, then applies `charge.success` / `charge.failed` through
  the existing idempotent capture. **This is the URL you register in the Paystack dashboard.**
- `src/routes/api/public/payment-verify.ts` — **new.** Verifies a reference with Paystack on the
  card return and as a webhook-lag fallback.
- `src/routes/api/public/payment-otp.ts` — **new.** Relays a MoMo OTP for the `send_otp` case.
- `payment-init.ts` — passes the MoMo number + card `callback_url`, returns the next action
  (`phone_approval` / `redirect` / `otp`). `payment-status.ts` — reconciles against Paystack while polling.

**Client (behaviour only, markup/CSS untouched)**
- MoMo number screen sends the number (transaction-only; cleared the moment the charge starts).
- Card → Paystack hosted page → returns to `/s/<token>?reference=…` → verified → success/failure.
- The card-verification screen is reused for the MoMo `send_otp` edge case.

## Two decisions worth knowing

1. **MoMo network is inferred from the number's prefix** (024/025/053/054/055/059 → MTN,
   020/050 → Telecel, 026/027/056/057 → AirtelTigo). So the diner just types their number — no
   network picker was added to the locked design. Unknown prefixes default to MTN.
2. **Cards use Paystack's hosted page, not an in-app card form.** Collecting a raw card number in
   your own UI triggers PCI-DSS obligations; the hosted redirect (with 3DS/OTP handled by Paystack)
   is the compliant, standard flow and is the brief redirect you signed off on. The in-app
   "card verification" OTP screen is now used only for the MoMo `send_otp` path — its copy still
   reads "from your bank", so tweak that wording if you want it to read for MoMo (design sign-off).

## Setup (once)

1. **Secrets in Lovable** (Cloud → project env). Use **test** keys first:
   - `PAYSTACK_SECRET_KEY` = `sk_test_…`  ← turns on the real provider and signs/verifies webhooks
   - (optional) `PAYMENT_WEBHOOK_SECRET` — only used by the mock webhook; not needed for Paystack.
2. **Currency:** the Paystack account must have **GHS** enabled (Ghana business).
3. **Webhook URL** — in the Paystack dashboard → Settings → API Keys & Webhooks, set:
   `https://<your-preview-or-prod>.lovable.app/api/public/paystack-webhook`
   Paystack signs it with your secret key; the route rejects anything unsigned.

## Smoke test after deploy

MoMo (test mode uses Paystack's test MoMo numbers — see their dashboard):

```bash
BASE=https://<your-preview>.lovable.app
T=$(curl -s -X POST $BASE/api/public/qr-resolve -H 'content-type: application/json' -d '{"qrToken":"demo"}' | jq -r .sessionToken)
K=$(uuidgen)
curl -s $BASE/api/public/payment-init -H 'content-type: application/json' \
  -d "{\"sessionToken\":\"$T\",\"idempotencyKey\":\"$K\",\"mode\":\"full\",\"tipPercent\":10,\"provider\":\"momo\",\"method\":\"momo\",\"phone\":\"0551234567\"}"
# → { ok:true, paymentRef, action:"phone_approval", displayText:"..." }  (approve the prompt on the test line)
curl -s $BASE/api/public/payment-status -H 'content-type: application/json' -d "{\"sessionToken\":\"$T\",\"paymentRef\":\"<paymentRef>\"}" | jq .status
```

Card: call `payment-init` with `"provider":"card"` → open the returned `redirectUrl`, complete
Paystack's test card + OTP, and confirm you land back on the success screen.

Idempotency, signed capture, no PIN/card/CVV stored, and RLS-everywhere are all unchanged from the
Phase 5–8 baseline — Paystack simply replaces the mock behind the same guarantees.

## Before going live
- Swap `sk_test_…` for `sk_live_…` and repoint the dashboard webhook at the prod URL.
- Remove the demo simulator route `src/routes/api/mock/pay-callback.ts` (and the "Demo:" buttons on
  the Processing screen) so only the real webhook can move a payment.
