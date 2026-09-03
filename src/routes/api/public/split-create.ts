import { createFileRoute } from '@tanstack/react-router'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })
const hex = (bytes = 24) => { const a = new Uint8Array(bytes); crypto.getRandomValues(a); return [...a].map(b => b.toString(16).padStart(2, '0')).join('') }

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
        const { posProvider } = await import('@/integrations/pos/provider')
        const bill = await posProvider.getActiveBillForTable(session.table_id)
        if (!bill) return json({ ok: false, reason: 'no_bill' })
        const { amountPaidForBill } = await import('@/integrations/payments/provider')
        const paid = await amountPaidForBill(bill.id)
        if (paid > 0) return json({ ok: false, reason: 'already_paying' })
        const total = Math.trunc(bill.totalPesewas)
        if (total <= 0) return json({ ok: false, reason: 'nothing_due' })

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

        const { data: split, error } = await supabaseAdmin.rpc('create_bill_split', {
          p_bill: bill.id, p_session: session.id, p_mode: mode, p_total: total, p_shares: shares,
        })
        if (error) {
          const reason = /split_exists/.test(error.message) ? 'split_exists' : /shares_do_not_sum/.test(error.message) ? 'shares_do_not_sum' : 'error'
          return json({ ok: false, reason })
        }
        const { data: rows } = await supabaseAdmin.from('bill_split_shares').select('id,position,label,amount_pesewas,status,claimed_by_name,share_token').eq('split_id', split.id).order('position')
        return json({ ok: true, splitId: split.id, mode, totalPesewas: total, shares: (rows ?? []).map((r: any) => ({ id: r.id, position: r.position, label: r.label, amountPesewas: r.amount_pesewas, status: r.status, claimedByName: r.claimed_by_name, shareToken: r.share_token })) })
      } catch (e) { return json({ ok: false, reason: 'error', message: String(e) }) }
    },
  } },
})
