import { createFileRoute } from '@tanstack/react-router'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

export const Route = createFileRoute('/api/public/split')({
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

        // Resolve the split to show for this table: the current OPEN split, else a just-SETTLED one
        // (within the last 30 min). After settlement the bill leaves 'open', so we resolve via the
        // table's bills rather than getActiveBillForTable, which would return null and blank the lobby.
        const { data: tableBills } = await supabaseAdmin.from('bills').select('id').eq('table_id', session.table_id)
        const billIds = (tableBills ?? []).map((b: any) => b.id)
        if (billIds.length === 0) return json({ ok: true, split: null })

        let { data: split } = await supabaseAdmin.from('bill_splits')
          .select('id,mode,total_pesewas,status,bill_id')
          .in('bill_id', billIds).eq('status', 'open').order('created_at', { ascending: false }).limit(1).maybeSingle()
        if (!split) {
          const cutoff = new Date(Date.now() - 30 * 60_000).toISOString()
          const recent = await supabaseAdmin.from('bill_splits')
            .select('id,mode,total_pesewas,status,bill_id')
            .in('bill_id', billIds).eq('status', 'settled').gt('updated_at', cutoff).order('updated_at', { ascending: false }).limit(1).maybeSingle()
          split = recent.data
        }
        if (!split) return json({ ok: true, split: null })

        // Items mode: amounts are derived from item picks — recompute, then return the items board.
        if (split.mode === 'items') {
          const { recomputeItemSplit, itemsSplitPayload } = await import('@/integrations/billing/itemsplit.server')
          await recomputeItemSplit(supabaseAdmin, split.id)
          const { data: fresh } = await supabaseAdmin.from('bill_splits').select('id,mode,total_pesewas,status,bill_id').eq('id', split.id).maybeSingle()
          return json(await itemsSplitPayload(supabaseAdmin, fresh ?? split, session.id))
        }

        // Lazy auto-release: claimed-but-unpaid shares idle > 10 min become unclaimed (open splits only).
        if (split.status === 'open') {
          const rel = new Date(Date.now() - 10 * 60_000).toISOString()
          await supabaseAdmin.from('bill_split_shares').update({ status: 'unclaimed', claimed_by_session: null, claimed_by_name: null }).eq('split_id', split.id).eq('status', 'claimed').lt('updated_at', rel)
        }

        const { data: rows } = await supabaseAdmin.from('bill_split_shares')
          .select('id,position,label,amount_pesewas,status,claimed_by_session,claimed_by_name,share_token')
          .eq('split_id', split.id).order('position')
        const { amountPaidForBill } = await import('@/integrations/payments/provider')
        const paid = await amountPaidForBill(split.bill_id)
        return json({ ok: true,
          split: { id: split.id, mode: split.mode, totalPesewas: split.total_pesewas, status: split.status },
          paidPesewas: paid, remainingPesewas: Math.max(0, split.total_pesewas - paid),
          shares: (rows ?? []).map((r: any) => ({ id: r.id, position: r.position, label: r.label, amountPesewas: r.amount_pesewas, status: r.status, claimedByName: r.claimed_by_name, mine: r.claimed_by_session === session.id, shareToken: r.share_token })) })
      } catch (e) { return json({ ok: false, reason: 'error', message: String(e) }) }
    },
  } },
})
