import { createFileRoute } from '@tanstack/react-router'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

// The diner closed the Paystack checkout without paying. Mark their own unfinished attempt
// "cancelled" so it stops holding the bill / share for other diners (payment_reserve counts
// unfinished attempts for 10 minutes). If Paystack later confirms the money anyway, the capture
// still wins (applyProviderCallback moves cancelled -> captured).
export const Route = createFileRoute('/api/public/payment-cancel')({
  server: { handlers: {
    OPTIONS: async () => new Response(null, { headers: cors }),
    POST: async ({ request }) => {
      try {
        const { sessionToken, paymentRef } = await request.json().catch(() => ({}) as { sessionToken?: unknown; paymentRef?: unknown })
        if (typeof sessionToken !== 'string') return json({ ok: false, reason: 'invalid_session' })
        if (typeof paymentRef !== 'string') return json({ ok: false, reason: 'missing_ref' })
        const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
        const { data: session } = await supabaseAdmin.from('dining_sessions').select('id,status,expires_at').eq('session_token', sessionToken).maybeSingle()
        if (!session || session.status !== 'active' || new Date(session.expires_at) < new Date()) return json({ ok: false, reason: 'invalid_session' })
        const { data: done } = await supabaseAdmin.from('payment_attempts')
          .update({ status: 'cancelled', failure_reason: 'cancelled_by_diner', updated_at: new Date().toISOString() })
          .eq('id', paymentRef).eq('session_id', session.id).in('status', ['initiated', 'pending']).select('id')
        return json({ ok: true, cancelled: (done ?? []).length > 0 })
      } catch (e) { return json({ ok: false, reason: 'error', message: String(e) }) }
    },
  } },
})
