import { createFileRoute } from '@tanstack/react-router'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

// Records exactly what the diner consented to (receipt / rewards / marketing are SEPARATE purposes),
// with the phone used, the restaurant, and a consent version. The MoMo transaction number is never
// auto-reused — the client must explicitly pass the phone the diner chose.
export const Route = createFileRoute('/api/public/rewards-consent')({
  server: { handlers: {
    OPTIONS: async () => new Response(null, { headers: cors }),
    POST: async ({ request }) => {
      try {
        const b = await request.json().catch(() => ({}) as Record<string, unknown>)
        const sessionToken = b.sessionToken
        const phone = b.phone
        if (!sessionToken || typeof sessionToken !== 'string') return json({ ok: false, reason: 'invalid_session' })
        if (!phone || typeof phone !== 'string' || phone.replace(/\D/g, '').length < 9) return json({ ok: false, reason: 'invalid_phone' })
        const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
        const { data: session } = await supabaseAdmin.from('dining_sessions').select('id,table_id,status,expires_at').eq('session_token', sessionToken).maybeSingle()
        if (!session || session.status !== 'active' || new Date(session.expires_at) < new Date()) return json({ ok: false, reason: 'invalid_session' })
        const { data: table } = await supabaseAdmin.from('restaurant_tables').select('branch_id').eq('id', session.table_id).maybeSingle()
        const { data: branch } = table ? await supabaseAdmin.from('branches').select('restaurant_id').eq('id', table.branch_id).maybeSingle() : { data: null }
        const restaurantId = branch ? branch.restaurant_id : null
        const receipt_consent = b.receiptConsent === true
        const rewards_consent = b.rewardsConsent === true
        const marketing_consent = b.marketingConsent === true
        const consent_version = typeof b.consentVersion === 'string' ? b.consentVersion : 'v1'
        const first_name = typeof b.firstName === 'string' && b.firstName.trim() ? b.firstName.trim().slice(0, 80) : null
        const { data: consent } = await supabaseAdmin.from('rewards_consent').insert({ session_id: session.id, restaurant_id: restaurantId, phone, first_name, receipt_consent, rewards_consent, marketing_consent, consent_version }).select('id').single()
        let points = 0
        if (rewards_consent && consent) {
          points = 120
          await supabaseAdmin.from('rewards_activity').insert({ consent_id: consent.id, phone, points, reason: 'signup' })
        }
        await supabaseAdmin.from('audit_events').insert({ session_id: session.id, type: 'rewards.consent', data: { receipt_consent, rewards_consent, marketing_consent, consent_version } })
        return json({ ok: true, points })
      } catch (e) { return json({ ok: false, reason: 'error', message: String(e) }) }
    },
  } },
})
