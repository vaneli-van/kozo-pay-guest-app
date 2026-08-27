import { createFileRoute } from '@tanstack/react-router'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

// Called when the diner returns from Paystack's hosted card page (?reference=...), and as a
// belt-and-braces fallback if the webhook is slow. Paystack's verify endpoint is authoritative;
// capture is still applied through the shared idempotent path.
export const Route = createFileRoute('/api/public/payment-verify')({
  server: { handlers: {
    OPTIONS: async () => new Response(null, { headers: cors }),
    POST: async ({ request }) => {
      try {
        const { sessionToken, reference } = await request.json().catch(() => ({}) as { sessionToken?: unknown; reference?: unknown })
        if (!sessionToken || typeof sessionToken !== 'string') return json({ ok: false, reason: 'invalid_session' })
        if (!reference || typeof reference !== 'string') return json({ ok: false, reason: 'missing_ref' })
        const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
        const { data: session } = await supabaseAdmin.from('dining_sessions').select('id,status,expires_at').eq('session_token', sessionToken).maybeSingle()
        if (!session || session.status !== 'active' || new Date(session.expires_at) < new Date()) return json({ ok: false, reason: 'invalid_session' })
        const { data: attempt } = await supabaseAdmin.from('payment_attempts').select('id,status,provider_ref').eq('provider_ref', reference).eq('session_id', session.id).maybeSingle()
        if (!attempt || !attempt.provider_ref) return json({ ok: false, reason: 'unknown_ref' })
        if (attempt.status === 'captured' || attempt.status === 'failed') return json({ ok: true, status: attempt.status, paymentRef: attempt.id })

        const { verifyPaystackTransaction, applyProviderCallback, isPaystackEnabled } = await import('@/integrations/payments/provider')
        if (!isPaystackEnabled()) return json({ ok: true, status: attempt.status, paymentRef: attempt.id })
        const outcome = await verifyPaystackTransaction(attempt.provider_ref)
        if (outcome === 'captured' || outcome === 'failed') await applyProviderCallback(attempt.provider_ref, outcome)
        return json({ ok: true, status: outcome, paymentRef: attempt.id })
      } catch (e) { return json({ ok: false, reason: 'error', message: String(e) }) }
    },
  } },
})
