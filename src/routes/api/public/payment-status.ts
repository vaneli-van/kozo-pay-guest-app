import { createFileRoute } from '@tanstack/react-router'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

export const Route = createFileRoute('/api/public/payment-status')({
  server: { handlers: {
    OPTIONS: async () => new Response(null, { headers: cors }),
    POST: async ({ request }) => {
      try {
        const { sessionToken, paymentRef } = await request.json().catch(() => ({}) as { sessionToken?: unknown; paymentRef?: unknown })
        if (!sessionToken || typeof sessionToken !== 'string') return json({ ok: false, reason: 'invalid_session' })
        if (!paymentRef || typeof paymentRef !== 'string') return json({ ok: false, reason: 'missing_ref' })
        const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
        const { data: session } = await supabaseAdmin.from('dining_sessions').select('id,status,expires_at').eq('session_token', sessionToken).maybeSingle()
        if (!session || session.status !== 'active' || new Date(session.expires_at) < new Date()) return json({ ok: false, reason: 'invalid_session' })
        const { data: attempt } = await supabaseAdmin.from('payment_attempts').select('id,status,provider_ref,amount_pesewas,tip_pesewas,total_pesewas,failure_reason').eq('id', paymentRef).eq('session_id', session.id).maybeSingle()
        if (!attempt) return json({ ok: false, reason: 'unknown_ref' })

        // Fallback: if the gateway webhook is slow, ask Paystack directly and reconcile.
        let status = attempt.status
        let failureReason = attempt.failure_reason
        if ((status === 'pending' || status === 'initiated') && attempt.provider_ref) {
          try {
            const { verifyPaystackTransaction, applyProviderCallback, isPaystackEnabled } = await import('@/integrations/payments/provider')
            if (isPaystackEnabled()) {
              const outcome = await verifyPaystackTransaction(attempt.provider_ref)
              if (outcome === 'captured' || outcome === 'failed') {
                await applyProviderCallback(attempt.provider_ref, outcome)
                const { data: fresh } = await supabaseAdmin.from('payment_attempts').select('status,failure_reason').eq('id', attempt.id).maybeSingle()
                if (fresh) { status = fresh.status; failureReason = fresh.failure_reason }
              }
            }
          } catch { /* best-effort; fall through to stored status */ }
        }
        return json({ ok: true, status, amountPesewas: attempt.amount_pesewas, tipPesewas: attempt.tip_pesewas, totalPesewas: attempt.total_pesewas, failureReason })
      } catch (e) { return json({ ok: false, reason: 'error', message: String(e) }) }
    },
  } },
})
