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
        const { posProvider } = await import('@/integrations/pos/provider')
        const bill = await posProvider.getActiveBillForTable(session.table_id)
        if (!bill) return json({ ok: true, split: null })
        const { data: split } = await supabaseAdmin.from('bill_splits').select('id,mode,total_pesewas,status').eq('bill_id', bill.id).eq('status', 'open').maybeSingle()
        if (!split) return json({ ok: true, split: null })
        // Lazy auto-release: claimed-but-unpaid shares idle > 10 min become unclaimed.
        const cutoff = new Date(Date.now() - 10 * 60_000).toISOString()
        await supabaseAdmin.from('bill_split_shares').update({ status: 'unclaimed', claimed_by_session: null, claimed_by_name: null }).eq('split_id', split.id).eq('status', 'claimed').lt('updated_at', cutoff)
        const { data: rows } = await supabaseAdmin.from('bill_split_shares').select('id,position,label,amount_pesewas,status,claimed_by_session,claimed_by_name,share_token').eq('split_id', split.id).order('position')
        const { amountPaidForBill } = await import('@/integrations/payments/provider')
        const paid = await amountPaidForBill(bill.id)
        return json({ ok: true, split: { id: split.id, mode: split.mode, totalPesewas: split.total_pesewas, status: split.status },
          paidPesewas: paid, remainingPesewas: Math.max(0, split.total_pesewas - paid),
          shares: (rows ?? []).map((r: any) => ({ id: r.id, position: r.position, label: r.label, amountPesewas: r.amount_pesewas, status: r.status, claimedByName: r.claimed_by_name, mine: r.claimed_by_session === session.id, shareToken: r.share_token })) })
      } catch (e) { return json({ ok: false, reason: 'error', message: String(e) }) }
    },
  } },
})
