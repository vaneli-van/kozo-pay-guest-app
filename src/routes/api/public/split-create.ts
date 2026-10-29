import { createFileRoute } from '@tanstack/react-router'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })
const hex = (bytes = 24) => { const a = new Uint8Array(bytes); crypto.getRandomValues(a); return [...a].map(b => b.toString(16).padStart(2, '0')).join('') }

async function cancelUntouchedSplit(db: any, billId: string, sessionId: string): Promise<boolean> {
  const { data: open } = await db.from('bill_splits').select('id,mode').eq('bill_id', billId).eq('status', 'open').maybeSingle()
  if (!open || (open.mode !== 'even' && open.mode !== 'amounts')) return false
  const { data: rows } = await db.from('bill_split_shares').select('id,status,claimed_by_session').eq('split_id', open.id)
  const list = (rows ?? []) as any[]
  if (list.some((r) => r.status === 'paid')) return false
  if (list.some((r) => r.status === 'claimed' && r.claimed_by_session && r.claimed_by_session !== sessionId)) return false
  if (list.length) {
    const since = new Date(Date.now() - 15 * 60_000).toISOString()
    const { data: paying } = await db.from('payment_attempts').select('id').in('split_share_id', list.map((r) => r.id)).in('status', ['initiated', 'pending']).gt('created_at', since).limit(1)
    if ((paying ?? []).length) return false
  }
  const { data: cancelled } = await db.from('bill_splits').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', open.id).eq('status', 'open').select('id')
  return ((cancelled ?? []) as any[]).length > 0
}

export const Route = createFileRoute('/api/public/split-create')({
  server: { handlers: {
    OPTIONS: async () => new Response(null, { headers: cors }),
    POST: async ({ request }) => {
      try {
        const body = await request.json().catch(() => ({} as Record<string, unknown>))
        const sessionToken = body.sessionToken
        const mode = body.mode
        if (typeof sessionToken !== 'string') return json({ ok: false, reason: 'invalid_session' })
        if (mode !== 'even' && mode !== 'amounts' && mode !== 'items') return json({ ok: false, reason: 'invalid_mode' })
        const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
        const { data: session } = await supabaseAdmin.from('dining_sessions').select('id,table_id,status,expires_at').eq('session_token', sessionToken).maybeSingle()
        if (!session || session.status !== 'active' || new Date(session.expires_at) < new Date()) return json({ ok: false, reason: 'invalid_session' })
        const { getBillForSession } = await import('@/integrations/pos/provider')
        const { bill, chooseTab } = await getBillForSession(session as any)
        if (!bill && chooseTab) return json({ ok: false, reason: 'choose_tab' })
        if (!bill) return json({ ok: false, reason: 'no_bill' })
        const { amountPaidForBill } = await import('@/integrations/payments/provider')
        const paid = await amountPaidForBill(bill.id)
        const billTotal = Math.trunc(bill.totalPesewas)
        // A split can start after someone has already paid part of the bill ("I'll get the
        // drinks, split the rest"): even / amounts shares divide what is LEFT. Item splits track
        // the live bill and subtract every captured payment in the database recompute.
        const total = billTotal - paid
        if (total <= 0) return json({ ok: false, reason: 'nothing_due' })
        // Items mode: no shares up front — diners create their own share as they pick items.
        // Return the full item board in the create response so the client renders immediately
        // without a second /split round trip (and on a pre-existing split, hand back its board).
        if (mode === 'items') {
          const { itemsSplitPayload } = await import('@/integrations/billing/itemsplit.server')
          const { data: created, error: insErr } = await supabaseAdmin.from('bill_splits').insert({
            bill_id: bill.id, mode: 'items', total_pesewas: billTotal, status: 'open', created_by_session: session.id,
          }).select('id').single()
          if (insErr || !created) {
            if (insErr && /uq_bill_splits_open|duplicate key/.test(insErr.message)) {
              // A split is already open for this bill. If it's an items split, return its board so
              // the diner lands straight on it; otherwise surface the conflict as before.
              const { data: existing } = await supabaseAdmin.from('bill_splits')
                .select('id,mode,total_pesewas,status,bill_id')
                .eq('bill_id', bill.id).eq('status', 'open').eq('mode', 'items')
                .order('created_at', { ascending: false }).limit(1).maybeSingle()
              if (existing) return json({ ...(await itemsSplitPayload(supabaseAdmin, existing, session.id)), splitId: existing.id })
              return json({ ok: false, reason: 'split_exists' })
            }
            return json({ ok: false, reason: 'error' })
          }
          const split = { id: created.id, mode: 'items', total_pesewas: billTotal, bill_id: bill.id, status: 'open' }
          return json({ ...(await itemsSplitPayload(supabaseAdmin, split, session.id)), splitId: created.id })
        }


        let shares: { label: string; amount_pesewas: number; token: string }[]
        if (mode === 'even') {
          const n = Math.max(2, Math.trunc(Number(body.partySize ?? 2)))
          const base = Math.floor(total / n), rem = total - base * n
          shares = Array.from({ length: n }, (_, i) => ({ label: `Share ${i + 1}`, amount_pesewas: base + (i < rem ? 1 : 0), token: hex() }))
        } else {
          const input = Array.isArray(body.amounts) ? body.amounts : []
          if (input.length < 2) return json({ ok: false, reason: 'need_two_shares' })
          shares = input.map((a: any, i: number) => ({ label: (typeof a?.label === 'string' && a.label.trim()) ? a.label.trim() : `Share ${i + 1}`, amount_pesewas: Math.trunc(Number(a?.amount)), token: hex() }))
          if (shares.some(s => !Number.isFinite(s.amount_pesewas) || s.amount_pesewas <= 0)) return json({ ok: false, reason: 'invalid_amount' })
          const sum = shares.reduce((n, s) => n + s.amount_pesewas, 0)
          if (sum !== total) return json({ ok: false, reason: 'shares_do_not_sum', total, sum })
        }

        const createSplit = () => supabaseAdmin.rpc('create_bill_split', {
          p_bill: bill.id, p_session: session.id, p_mode: mode, p_total: total, p_shares: shares,
        })
        let { data: split, error } = await createSplit()
        // Changing the amounts: the first "Continue" already created a split, so a second attempt
        // hit split_exists and the app showed the old shares again (Baobab table 5, 29 Oct: GHS 120
        // typed, every retype came back as 120). Replace an equal/amount split that nobody has
        // touched yet: no share paid, none being paid, none taken by another phone.
        if (error && /split_exists/.test(error.message) && await cancelUntouchedSplit(supabaseAdmin, bill.id, session.id)) {
          ({ data: split, error } = await createSplit())
        }
        if (error) {
          const reason = /split_exists/.test(error.message) ? 'split_exists' : /shares_do_not_sum/.test(error.message) ? 'shares_do_not_sum' : 'error'
          return json({ ok: false, reason })
        }
        if (!split) return json({ ok: false, reason: 'error' })
        const { data: rows } = await supabaseAdmin.from('bill_split_shares').select('id,position,label,amount_pesewas,status,claimed_by_name,share_token').eq('split_id', split.id).order('position')
        return json({ ok: true, splitId: split.id, mode, totalPesewas: total, shares: (rows ?? []).map((r: any) => ({ id: r.id, position: r.position, label: r.label, amountPesewas: r.amount_pesewas, status: r.status, claimedByName: r.claimed_by_name, shareToken: r.share_token })) })
      } catch (e) { return json({ ok: false, reason: 'error', message: String(e) }) }
    },
  } },
})
