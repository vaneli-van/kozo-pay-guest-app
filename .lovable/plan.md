# Fix Apple Pay checkout

## What will change
- Stop sending `applepay` as a Paystack transaction channel, because Paystack does not accept it in the hosted-checkout `channels` list.
- Keep the Klown Apple Pay choice, but initialize it through Paystack's supported `card` channel; Paystack will then display Apple Pay for eligible verified Apple devices.
- Leave Mobile Money, payment amounts, split billing, and settlement logic unchanged.

## Verification
- Confirm both Bank card and Apple Pay choices initialize a supported hosted checkout.
- Check the app builds cleanly after the focused change.
