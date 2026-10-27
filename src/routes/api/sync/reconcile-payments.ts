import { createFileRoute } from '@tanstack/react-router'

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } })

// Background reconciliation of payment attempts that are still "pending" after the diner has
// left the screen (pg_cron calls this every few minutes with the POS-sync secret).
//
// Why: the diner app only reconciles while it is polling. When MTN never answers Paystack
// (26 Oct at Baobab: 9 of 22 charges), the app gives up after ~3 min and the attempt stays
// "pending" forever, even once Paystack has settled on failed or (late) success.
//
// What it does, per live attempt older than STALE_AFTER and younger than LOOKBACK:
//   Paystack success  -> captured (floor alert, owner SMS, POS close run once, as usual)
//   Paystack failed   -> failed with Paystack's reason
//   still unconfirmed -> after GIVE_UP it is marked failed/not_confirmed so reports and the
//                        admin queue stop showing it as in flight. A later success still wins:
//                        applyProviderCallback lets a Paystack-confirmed capture out of "failed".
// Never touches mock/test refs or cancelled attempts (those keep their own late-capture watch).
const STALE_AFTER_MS = 3 * 60_000
const GIVE_UP_MS = 30 * 60_000
const LOOKBACK_MS = 48 * 3_600_000
const BATCH = 50

export const Route = createFileRoute('/api/sync/reconcile-payments')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
          const { data: secretRow } = await supabaseAdmin.from('app_settings').select('value').eq('key', 'sync_secret').maybeSingle()
          const secret = secretRow?.value || process.env['SYNC_SECRET']
          if (!secret || request.headers.get('x-sync-secret') !== secret) return json({ ok: false, reason: 'unauthorized' }, 401)

          const { verifyPaystackTransaction, applyProviderCallback, isPaystackEnabled } = await import('@/integrations/payments/provider')
          if (!isPaystackEnabled('live')) return json({ ok: true, skipped: 'paystack_disabled' })

          const now = Date.now()
          const { data: stale, error } = await supabaseAdmin.from('payment_attempts')
            .select('id,provider_ref,status,created_at,payment_mode')
            .in('status', ['initiated', 'pending'])
            .lt('created_at', new Date(now - STALE_AFTER_MS).toISOString())
            .gt('created_at', new Date(now - LOOKBACK_MS).toISOString())
            .order('created_at', { ascending: true })
            .limit(BATCH)
          if (error) return json({ ok: false, reason: 'query_failed', message: error.message }, 500)

          const out: Array<{ ref: string; result: string; reason?: string | undefined }> = []
          for (const a of (stale ?? []) as any[]) {
            const ref: string | null = a.provider_ref
            if (!ref || ref.startsWith('mock_') || a.payment_mode === 'test') { out.push({ ref: a.id, result: 'skipped' }); continue }
            try {
              const { outcome, reason } = await verifyPaystackTransaction(ref, 'live')
              if (outcome === 'captured' || outcome === 'failed') {
                const r = await applyProviderCallback(ref, outcome, reason, 'live')
                out.push({ ref, result: `${outcome}:${(r as any).status ?? 'applied'}`, reason })
              } else if (now - new Date(a.created_at).getTime() > GIVE_UP_MS) {
                const r = await applyProviderCallback(ref, 'failed', 'not_confirmed', 'live')
                out.push({ ref, result: `gave_up:${(r as any).status ?? 'applied'}` })
              } else {
                out.push({ ref, result: 'still_pending' })
              }
            } catch (e) {
              out.push({ ref, result: 'error', reason: String(e).slice(0, 200) })
            }
          }
          const changed = out.filter((o) => !['skipped', 'still_pending', 'error'].includes(o.result))
          if (changed.length) {
            await supabaseAdmin.from('audit_events').insert({ session_id: null, type: 'payment.reconciled', data: { count: changed.length, items: changed } })
          }
          return json({ ok: true, checked: out.length, changed: changed.length, items: out })
        } catch (e) {
          return json({ ok: false, reason: 'error', message: String(e) }, 500)
        }
      },
    },
  },
})
