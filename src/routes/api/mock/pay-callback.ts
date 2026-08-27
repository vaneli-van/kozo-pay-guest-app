import { createFileRoute } from '@tanstack/react-router'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

// DEMO ONLY — stands in for the real payment provider. In production this route is removed and the
// real provider calls /api/public/payment-webhook with its own signed callback.
export const Route = createFileRoute('/api/mock/pay-callback')({
  server: { handlers: {
    OPTIONS: async () => new Response(null, { headers: cors }),
    POST: async ({ request }) => {
      try {
        const { sessionToken, paymentRef, outcome } = await request.json().catch(() => ({}) as { sessionToken?: unknown; paymentRef?: unknown; outcome?: unknown })
        if (!sessionToken || typeof sessionToken !== 'string') return json({ ok: false, reason: 'invalid_session' })
        if (typeof paymentRef !== 'string' || (outcome !== 'captured' && outcome !== 'failed')) return json({ ok: false, reason: 'bad_request' })
        const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
        const { data: session } = await supabaseAdmin.from('dining_sessions').select('id,status,expires_at').eq('session_token', sessionToken).maybeSingle()
        if (!session || session.status !== 'active' || new Date(session.expires_at) < new Date()) return json({ ok: false, reason: 'invalid_session' })
        const { data: attempt } = await supabaseAdmin.from('payment_attempts').select('provider_ref').eq('id', paymentRef).eq('session_id', session.id).maybeSingle()
        if (!attempt || !attempt.provider_ref) return json({ ok: false, reason: 'unknown_ref' })
        const { applyProviderCallback } = await import('@/integrations/payments/provider')
        const res = await applyProviderCallback(attempt.provider_ref, outcome, outcome === 'failed' ? 'insufficient_funds' : undefined)
        return json(res)
      } catch (e) { return json({ ok: false, reason: 'error', message: String(e) }) }
    },
  } },
})
