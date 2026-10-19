import { createFileRoute } from '@tanstack/react-router'

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } })

// Daily tip payouts to waiters' mobile money (pg_cron calls this once a morning with the same
// shared secret as the POS sync). Safe to call again: tips are claimed once, and a payout is
// never re-sent without first checking its previous transfer with Paystack.
export const Route = createFileRoute('/api/sync/tip-payouts')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
          const { data: secretRow } = await supabaseAdmin.from('app_settings').select('value').eq('key', 'sync_secret').maybeSingle()
          const secret = secretRow?.value || process.env['SYNC_SECRET']
          if (!secret || request.headers.get('x-sync-secret') !== secret) return json({ ok: false, reason: 'unauthorized' }, 401)
          const { runTipPayouts, ensureRecipients } = await import('@/integrations/payments/tips.server')
          // ?check=recipients : set up / re-check the waiters' Paystack recipients and show each
          // wallet's registered name, without claiming or sending anything. Works before the
          // restaurant's tips_to_staff switch is on, so names can be checked first.
          if (new URL(request.url).searchParams.get('check') === 'recipients') {
            const { data: accts } = await (supabaseAdmin as any).from('staff_payout_accounts').select('restaurant_id').eq('active', true)
            const ids = [...new Set(((accts ?? []) as any[]).map((a) => a.restaurant_id as string))]
            const out: any[] = []
            for (const id of ids) out.push({ restaurantId: id, recipients: await ensureRecipients(id) })
            return json({ ok: true, check: 'recipients', restaurants: out })
          }
          const { data: rests } = await supabaseAdmin.from('restaurants').select('id').eq('tips_to_staff' as any, true)
          const results: any[] = []
          for (const r of (rests ?? []) as any[]) {
            try { results.push(await runTipPayouts(r.id)) } catch (e) { results.push({ restaurantId: r.id, error: String(e) }) }
          }
          return json({ ok: true, restaurants: results })
        } catch (e) {
          return json({ ok: false, reason: 'error', message: String(e) }, 500)
        }
      },
    },
  },
})
