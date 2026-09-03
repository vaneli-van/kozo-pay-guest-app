import { createFileRoute } from '@tanstack/react-router'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

export const Route = createFileRoute('/api/public/assign-remaining')({
  server: { handlers: {
    OPTIONS: async () => new Response(null, { headers: cors }),
    POST: async ({ request }) => {
      try {
        const body = await request.json().catch(() => ({} as Record<string, unknown>))
        const sessionToken = body.sessionToken
        if (typeof sessionToken !== 'string') return json({ ok: false, reason: 'invalid_session' })
        const name = typeof body.name === 'string' ? body.name : undefined

        const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
        const { data: session } = await supabaseAdmin.from('dining_sessions').select('id,table_id,status,expires_at').eq('session_token', sessionToken).maybeSingle()
        if (!session || session.status !== 'active' || new Date(session.expires_at) < new Date()) return json({ ok: false, reason: 'invalid_session' })

        const { resolveOpenItemsSplit, ensureMyShare, recomputeItemSplit, itemsSplitPayload } = await import('@/integrations/billing/itemsplit.server')
        const res = await resolveOpenItemsSplit(supabaseAdmin, session)
        if ('error' in res) return json({ ok: false, reason: res.error })
        const { split, bill } = res

        const share = await ensureMyShare(supabaseAdmin, split.id, session.id, name)
        if (!share) return json({ ok: false, reason: 'share_failed' })
        if (share.status === 'paid') return json({ ok: false, reason: 'share_paid' })

        const { data: lines } = await supabaseAdmin.from('bill_items').select('id,qty').eq('bill_id', bill.id)
        const { data: assigns } = await supabaseAdmin.from('bill_split_item_assignments')
          .select('bill_item_id,share_id,weight').eq('split_id', split.id)

        for (const line of lines ?? []) {
          const onLine = (assigns ?? []).filter((a: any) => a.bill_item_id === line.id)
          const used = onLine.reduce((n: number, a: any) => n + Math.max(0, Math.trunc(a.weight ?? 0)), 0)
          const free = Math.max(0, Math.trunc(line.qty ?? 0) - used)
          if (free <= 0) continue
          const existing = onLine.find((a: any) => a.share_id === share.id)
          const weight = Math.max(0, Math.trunc(existing?.weight ?? 0)) + free
          await supabaseAdmin.from('bill_split_item_assignments')
            .upsert({ split_id: split.id, bill_item_id: line.id, share_id: share.id, weight }, { onConflict: 'split_id,bill_item_id,share_id' })
        }

        await recomputeItemSplit(supabaseAdmin, split.id)
        return json(await itemsSplitPayload(supabaseAdmin, split, session.id))
      } catch (e) { return json({ ok: false, reason: 'error', message: String(e) }) }
    },
  } },
})
