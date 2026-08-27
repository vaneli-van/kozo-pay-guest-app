import { createFileRoute } from '@tanstack/react-router'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-paystack-signature', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

// Paystack calls this URL for every event. The signature (x-paystack-signature header,
// HMAC-SHA512 of the raw body with the account secret key) is verified before any state
// change — the capture is server-authoritative and idempotent by provider_ref.
export const Route = createFileRoute('/api/public/paystack-webhook')({
  server: { handlers: {
    OPTIONS: async () => new Response(null, { headers: cors }),
    POST: async ({ request }) => {
      try {
        const raw = await request.text()
        const header = request.headers.get('x-paystack-signature')
        const { verifyPaystackSignature, applyProviderCallback } = await import('@/integrations/payments/provider')
        const valid = await verifyPaystackSignature(raw, header)
        if (!valid) return json({ ok: false, reason: 'bad_signature' }, 401)

        const event = JSON.parse(raw) as { event?: string; data?: { reference?: string; status?: string; gateway_response?: string } }
        const reference = event?.data?.reference
        if (!reference) return json({ received: true, ignored: 'no_reference' })

        if (event.event === 'charge.success') {
          await applyProviderCallback(reference, 'captured')
        } else if (event.event === 'charge.failed') {
          await applyProviderCallback(reference, 'failed', event?.data?.gateway_response || 'charge_failed')
        }
        // Always 200 so Paystack stops retrying once we've accepted the event.
        return json({ received: true })
      } catch (e) { return json({ ok: false, reason: 'error', message: String(e) }) }
    },
  } },
})
