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
        const { data: session } = await supabaseAdmin.from('dining_sessions').select('id,table_id,register_id,status,expires_at').eq('session_token', sessionToken).maybeSingle()
        if (!session || session.status !== 'active' || new Date(session.expires_at) < new Date()) return json({ ok: false, reason: 'invalid_session' })
        const { data: table } = await supabaseAdmin.from('restaurant_tables').select('branch_id').eq('id', session.table_id!).maybeSingle()
        const { data: branch } = table ? await supabaseAdmin.from('branches').select('restaurant_id').eq('id', table.branch_id).maybeSingle() : { data: null }
        let restaurantId = branch ? branch.restaurant_id : null
        if (!restaurantId && (session as any).register_id) {
          const { data: reg } = await supabaseAdmin.from('pos_registers').select('restaurant_id').eq('id', (session as any).register_id).maybeSingle()
          restaurantId = reg?.restaurant_id ?? null
        }
        const receipt_consent = b.receiptConsent === true
        const rewards_consent = b.rewardsConsent === true
        const marketing_consent = b.marketingConsent === true
        const consent_version = typeof b.consentVersion === 'string' ? b.consentVersion : 'v1'
        const first_name = typeof b.firstName === 'string' && b.firstName.trim() ? b.firstName.trim().slice(0, 80) : null
        // One subscriber record per phone per restaurant: reuse the existing consent
        // row if this diner has checked out here before, OR-merging the consent
        // flags (once opted in, they stay opted in) rather than inserting a duplicate.
        let priorQ = supabaseAdmin.from('rewards_consent').select('id,first_name,receipt_consent,rewards_consent,marketing_consent').eq('phone', phone)
        priorQ = restaurantId ? priorQ.eq('restaurant_id', restaurantId) : priorQ.is('restaurant_id', null)
        const { data: prior } = await priorQ.order('created_at', { ascending: true }).limit(1).maybeSingle()
        let consent: { id: string } | null = prior ? { id: prior.id } : null
        if (prior) {
          await supabaseAdmin.from('rewards_consent').update({ session_id: session.id, first_name: first_name ?? prior.first_name, receipt_consent: receipt_consent || prior.receipt_consent, rewards_consent: rewards_consent || prior.rewards_consent, marketing_consent: marketing_consent || prior.marketing_consent, consent_version }).eq('id', prior.id)
        } else {
          const { data: inserted } = await supabaseAdmin.from('rewards_consent').insert({ session_id: session.id, restaurant_id: restaurantId, phone, first_name, receipt_consent, rewards_consent, marketing_consent, consent_version }).select('id').single()
          consent = inserted
        }
        // The 120-point welcome bonus is Klown-wide and awarded once per phone, ever.
        let points = 0
        if (rewards_consent && consent) {
          const { count: priorSignups } = await supabaseAdmin.from('rewards_activity').select('id', { count: 'exact', head: true }).eq('phone', phone).eq('reason', 'signup')
          if (!priorSignups) {
            points = 120
            await supabaseAdmin.from('rewards_activity').insert({ consent_id: consent.id, phone, points, reason: 'signup' })
            // Thank-you SMS with points earned (Arkesel, best-effort).
            try {
              const { data: rest } = restaurantId
                ? await supabaseAdmin.from('restaurants').select('name').eq('id', restaurantId).maybeSingle()
                : { data: null as any }
              const rName = rest?.name || 'us'
              const { sendSms } = await import('@/integrations/notify/arkesel.server')
              await sendSms([phone], `Thank you for dining at ${rName}! You earned ${points} Klown points. Show your number on your next visit to redeem. - Klown`)
            } catch { /* SMS is best-effort */ }
          }
        }
        await supabaseAdmin.from('audit_events').insert({ session_id: session.id, type: 'rewards.consent', data: { receipt_consent, rewards_consent, marketing_consent, consent_version } })
        return json({ ok: true, points })
      } catch (e) { return json({ ok: false, reason: 'error', message: String(e) }) }
    },
  } },
})
