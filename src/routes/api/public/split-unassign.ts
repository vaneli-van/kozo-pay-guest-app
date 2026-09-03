import { createFileRoute } from '@tanstack/react-router'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

export const Route = createFileRoute('/api/public/split-unassign')({
  server: { handlers: {
    OPTIONS: async () => new Response(null, { headers: cors }),
    POST: async ({ request }) => {
      try {
        const body = await request.json().catch(() => ({} as Record<string, unknown>))
        const sessionToken = body.sessionToken
        const billItemId = body.billItemId
        if (typeof sessionToken !== 'string') return json({ ok: false, reason: 'invalid_session' })
        if (typeof billItemId !== 'string') return json({ ok: false, reason: 'invalid_item' })

        const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
        const { data: session } = await supabaseAdmin.from('dining_sessions').select('id,table_id,status,expires_at').eq('session_token', sessionToken).maybeSingle()
        if (!session || session.status !== 'active' || new Date(session.expires_at) < new Date()) return json({ ok: false, reason: 'invalid_session' })

        const { resolveOpenItemsSplit, recomputeItemSplit, itemsSplitPayload } = await import('@/integrations/billing/itemsplit.server')
        const res = await resolveOpenItemsSplit(supabaseAdmin, session)
        if ('error' in res) return json({ ok: false, reason: res.error })
        const { split } = res

        const { data: share } = await supabaseAdmin.from('bill_split_shares')
          .select('id,status').eq('split_id', split.id).eq('claimed_by_session', session.id).order('position').limit(1).maybeSingle()
        if (share) {
          if (share.status === 'paid') return json({ ok: false, reason: 'share_paid' })
          await supabaseAdmin.from('bill_split_item_assignments').delete()
            .eq('split_id', split.id).eq('bill_item_id', billItemId).eq('share_id', share.id)
          const { data: left } = await supabaseAdmin.from('bill_split_item_assignments')
            .select('id').eq('split_id', split.id).eq('share_id', share.id).limit(1)
          if ((left ?? []).length === 0) await supabaseAdmin.from('bill_split_shares').delete().eq('id', share.id)
        }

        await recomputeItemSplit(supabaseAdmin, split.id)
        return json(await itemsSplitPayload(supabaseAdmin, split, session.id))
      } catch (e) { return json({ ok: false, reason: 'error', message: String(e) }) }
    },
  } },
})
