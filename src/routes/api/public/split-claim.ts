import { createFileRoute } from '@tanstack/react-router'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

export const Route = createFileRoute('/api/public/split-claim')({
  server: { handlers: {
    OPTIONS: async () => new Response(null, { headers: cors }),
    POST: async ({ request }) => {
      try {
        const body = await request.json().catch(() => ({} as Record<string, unknown>))
        const sessionToken = body.sessionToken
        if (typeof sessionToken !== 'string') return json({ ok: false, reason: 'invalid_session' })
        const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
        const { data: session } = await supabaseAdmin.from('dining_sessions').select('id,table_id,status,expires_at').eq('session_token', sessionToken).maybeSingle()
        if (!session || session.status !== 'active' || new Date(session.expires_at) < new Date()) return json({ ok: false, reason: 'invalid_session' })
        // Resolve the share by id or by invite token.
        const q = supabaseAdmin.from('bill_split_shares').select('id,split_id,status,claimed_by_session')
        const { data: share } = typeof body.shareId === 'string' ? await q.eq('id', body.shareId).maybeSingle()
          : typeof body.shareToken === 'string' ? await q.eq('share_token', body.shareToken).maybeSingle() : { data: null }
        if (!share) return json({ ok: false, reason: 'invalid_share' })
        // Verify the share's split belongs to this session's table (no cross-table claims).
        const { data: split } = await supabaseAdmin.from('bill_splits').select('id,bill_id,status').eq('id', share.split_id).maybeSingle()
        if (!split || split.status !== 'open') return json({ ok: false, reason: 'invalid_share' })
        const { posProvider } = await import('@/integrations/pos/provider')
        const bill = await posProvider.getActiveBillForTable(session.table_id)
        if (!bill || bill.id !== split.bill_id) return json({ ok: false, reason: 'invalid_share' })
        if (share.status === 'paid') return json({ ok: false, reason: 'share_paid' })
        if (share.status === 'claimed' && share.claimed_by_session === session.id) return json({ ok: true, shareId: share.id, alreadyMine: true })
        const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : null
        // Race-safe: only the caller who flips it from unclaimed wins.
        const { data: won } = await supabaseAdmin.from('bill_split_shares')
          .update({ status: 'claimed', claimed_by_session: session.id, claimed_by_name: name })
          .eq('id', share.id).eq('status', 'unclaimed').select('id').maybeSingle()
        if (!won) return json({ ok: false, reason: 'already_claimed' })
        return json({ ok: true, shareId: share.id })
      } catch (e) { return json({ ok: false, reason: 'error', message: String(e) }) }
    },
  } },
})
