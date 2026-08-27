import { createFileRoute } from '@tanstack/react-router'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

// Some mobile-money charges come back as send_otp. The diner enters that MoMo OTP on the
// existing verification screen; we relay it to Paystack. Final capture still arrives via the
// signed webhook (or verify fallback) — this route never marks the payment captured itself.
export const Route = createFileRoute('/api/public/payment-otp')({
  server: { handlers: {
    OPTIONS: async () => new Response(null, { headers: cors }),
    POST: async ({ request }) => {
      try {
        const { sessionToken, paymentRef, otp } = await request.json().catch(() => ({}) as { sessionToken?: unknown; paymentRef?: unknown; otp?: unknown })
        if (!sessionToken || typeof sessionToken !== 'string') return json({ ok: false, reason: 'invalid_session' })
        if (typeof paymentRef !== 'string' || typeof otp !== 'string' || !otp) return json({ ok: false, reason: 'bad_request' })
        const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
        const { data: session } = await supabaseAdmin.from('dining_sessions').select('id,status,expires_at').eq('session_token', sessionToken).maybeSingle()
        if (!session || session.status !== 'active' || new Date(session.expires_at) < new Date()) return json({ ok: false, reason: 'invalid_session' })
        const { data: attempt } = await supabaseAdmin.from('payment_attempts').select('id,provider_ref').eq('id', paymentRef).eq('session_id', session.id).maybeSingle()
        if (!attempt || !attempt.provider_ref) return json({ ok: false, reason: 'unknown_ref' })

        const { submitPaystackOtp, isPaystackEnabled } = await import('@/integrations/payments/provider')
        if (!isPaystackEnabled()) return json({ ok: true, status: 'pending' }) // demo: no gateway, just proceed to polling
        const r = await submitPaystackOtp(attempt.provider_ref, otp)
        return json({ ok: !!r?.status, status: r?.data?.status ?? 'pending', message: r?.message })
      } catch (e) { return json({ ok: false, reason: 'error', message: String(e) }) }
    },
  } },
})
