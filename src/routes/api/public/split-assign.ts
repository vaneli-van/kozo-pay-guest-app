import { createFileRoute } from '@tanstack/react-router'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

export const Route = createFileRoute('/api/public/split-assign')({
  server: { handlers: {
    OPTIONS: async () => new Response(null, { headers: cors }),
    POST: async ({ request }) => {
      try {
        const body = await request.json().catch(() => ({} as Record<string, unknown>))
        const sessionToken = body.sessionToken
        const billItemId = body.billItemId
        if (typeof sessionToken !== 'string') return json({ ok: false, reason: 'invalid_session' })
        if (typeof billItemId !== 'string') return json({ ok: false, reason: 'invalid_item' })
        const units = Math.trunc(Number(body.units ?? 0))
        if (!Number.isFinite(units)) return json({ ok: false, reason: 'invalid_units' })
        const name = typeof body.name === 'string' ? body.name : undefined

        const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
        const { data: session } = await supabaseAdmin.from('dining_sessions').select('id,table_id,status,expires_at').eq('session_token', sessionToken).maybeSingle()
        if (!session || session.status !== 'active' || new Date(session.expires_at) < new Date()) return json({ ok: false, reason: 'invalid_session' })

        const { resolveOpenItemsSplit, ensureMyShare, recomputeItemSplit, itemsSplitPayload } = await import('@/integrations/billing/itemsplit.server')
        const res = await resolveOpenItemsSplit(supabaseAdmin, session)
        if ('error' in res) return json({ ok: false, reason: res.error })
        const { split, bill } = res

        const { data: line } = await supabaseAdmin.from('bill_items').select('id,qty,bill_id').eq('id', billItemId).maybeSingle()
        if (!line || line.bill_id !== bill.id) return json({ ok: false, reason: 'invalid_item' })

        const share = await ensureMyShare(supabaseAdmin, split.id, session.id, name)
        if (!share) return json({ ok: false, reason: 'share_failed' })
        if (share.status === 'paid') return json({ ok: false, reason: 'share_paid' })

        if (units <= 0) {
          await supabaseAdmin.from('bill_split_item_assignments').delete()
            .eq('split_id', split.id).eq('bill_item_id', line.id).eq('share_id', share.id)
        } else {
          const weight = Math.min(units, Math.max(1, Math.trunc(line.qty ?? 1)))
          await supabaseAdmin.from('bill_split_item_assignments')
            .upsert({ split_id: split.id, bill_item_id: line.id, share_id: share.id, weight }, { onConflict: 'split_id,bill_item_id,share_id' })
        }

        await recomputeItemSplit(supabaseAdmin, split.id)
        const { data: fresh } = await supabaseAdmin.from('bill_splits').select('id,mode,total_pesewas,status,bill_id').eq('id', split.id).maybeSingle()
        return json(await itemsSplitPayload(supabaseAdmin, fresh ?? split, session.id))
      } catch (e) { return json({ ok: false, reason: 'error', message: String(e) }) }
    },
  } },
})
