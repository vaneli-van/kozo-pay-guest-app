import { createFileRoute } from '@tanstack/react-router'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

// Real payment providers call this with a signed callback. Signature is verified before any state change.
export const Route = createFileRoute('/api/public/payment-webhook')({
  server: { handlers: {
    OPTIONS: async () => new Response(null, { headers: cors }),
    POST: async ({ request }) => {
      try {
        const { providerRef, outcome, signature } = await request.json().catch(() => ({}) as { providerRef?: unknown; outcome?: unknown; signature?: unknown })
        if (typeof providerRef !== 'string' || (outcome !== 'captured' && outcome !== 'failed') || typeof signature !== 'string')
          return json({ ok: false, reason: 'bad_request' }, 400)
        const { verifyCallback, applyProviderCallback } = await import('@/integrations/payments/provider')
        const valid = await verifyCallback(providerRef, outcome, signature)
        if (!valid) return json({ ok: false, reason: 'bad_signature' }, 401)
        const res = await applyProviderCallback(providerRef, outcome)
        return json(res)
      } catch (e) { return json({ ok: false, reason: 'error', message: String(e) }) }
    },
  } },
})
