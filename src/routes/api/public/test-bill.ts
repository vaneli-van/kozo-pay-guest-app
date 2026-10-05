import { createFileRoute } from '@tanstack/react-router'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

// Self-serve bills for TEST-MODE restaurants only (restaurants.payment_mode = 'test'), so the
// whole pay flow can be exercised with Paystack test cards / test MoMo and no POS. Refused for
// every live restaurant. `reset: true` voids the table's current open test bill first.
const MENU: { name: string; qty: number; unit: number }[] = [
  { name: 'Jollof Rice & Grilled Chicken', qty: 2, unit: 8500 },
  { name: 'Banku & Tilapia', qty: 1, unit: 12000 },
  { name: 'Kelewele', qty: 1, unit: 3500 },
  { name: 'Sobolo', qty: 3, unit: 1500 },
  { name: 'Club Beer', qty: 2, unit: 2000 },
]

// Same largest-remainder split the rest of the money code uses.
function allocate(total: number, weights: number[]): number[] {
  const sumW = weights.reduce((s, w) => s + w, 0)
  if (sumW <= 0) return weights.map(() => 0)
  const exact = weights.map((w) => (total * w) / sumW)
  const base = exact.map((v) => Math.floor(v))
  let left = total - base.reduce((s, v) => s + v, 0)
  const order = exact.map((v, i) => ({ i, f: v - Math.floor(v) })).sort((a, b) => (b.f - a.f) || (a.i - b.i))
  for (let k = 0; k < order.length && left > 0; k++, left--) base[order[k]!.i]! += 1
  return base
}

export const Route = createFileRoute('/api/public/test-bill')({
  server: { handlers: {
    OPTIONS: async () => new Response(null, { headers: cors }),
    POST: async ({ request }) => {
      try {
        const body = await request.json().catch(() => ({} as Record<string, unknown>))
        const sessionToken = body.sessionToken
        if (typeof sessionToken !== 'string') return json({ ok: false, reason: 'invalid_session' })
        const reset = body.reset === true
        const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
        const { data: session } = await supabaseAdmin.from('dining_sessions').select('id,table_id,status,expires_at').eq('session_token', sessionToken).maybeSingle()
        if (!session || session.status !== 'active' || new Date(session.expires_at) < new Date() || !session.table_id) return json({ ok: false, reason: 'invalid_session' })

        const { data: table } = await supabaseAdmin.from('restaurant_tables').select('id,label,branch_id').eq('id', session.table_id).maybeSingle()
        const { data: branch } = table ? await supabaseAdmin.from('branches').select('restaurant_id').eq('id', table.branch_id).maybeSingle() : { data: null }
        const { data: restaurant } = branch ? await supabaseAdmin.from('restaurants').select('id,payment_mode').eq('id', branch.restaurant_id).maybeSingle() : { data: null }
        if (!table || !restaurant || (restaurant as any).payment_mode !== 'test') return json({ ok: false, reason: 'not_test_restaurant' })

        const { data: open } = await supabaseAdmin.from('bills').select('id').eq('table_id', table.id).in('status', ['open', 'ready'])
        const openIds = (open ?? []).map((b: any) => b.id as string)
        if (openIds.length && !reset) {
          await supabaseAdmin.from('dining_sessions').update({ active_bill_id: openIds[0], bill_status: 'open' }).eq('id', session.id)
          return json({ ok: true, billId: openIds[0], existing: true })
        }
        if (openIds.length) {
          await supabaseAdmin.from('bill_splits').update({ status: 'cancelled', updated_at: new Date().toISOString() }).in('bill_id', openIds).eq('status', 'open')
          await supabaseAdmin.from('bills').update({ status: 'void' }).in('id', openIds)
          await supabaseAdmin.from('dining_sessions').update({ active_bill_id: null, bill_status: 'none' }).in('active_bill_id', openIds)
        }

        const lines = MENU.map((m, i) => ({ name: m.name, qty: m.qty, line_total_pesewas: m.qty * m.unit, sort: (i + 1) * 10 }))
        const total = lines.reduce((s, l) => s + l.line_total_pesewas, 0)
        // Price-inclusive 20% (VAT 15 + NHIL 2.5 + GETFund 2.5), like a Ghana Odoo POS.
        const tax = Math.round((total * 20) / 120)
        const [vat, nhil, getfund] = allocate(tax, [150, 25, 25])
        const taxLines = [
          { name: 'VAT 15%', rate: 15, amountPesewas: vat },
          { name: 'NHIL 2.5%', rate: 2.5, amountPesewas: nhil },
          { name: 'GETFund 2.5%', rate: 2.5, amountPesewas: getfund },
        ]
        const { data: bill, error } = await supabaseAdmin.from('bills').insert({
          table_id: table.id, status: 'open', subtotal_pesewas: total, service_charge_pesewas: 0, total_pesewas: total,
          tax_lines: taxLines, tax_pesewas: tax, server_name: 'Ama', opened_at: new Date().toISOString(),
        }).select('id').single()
        if (error || !bill) return json({ ok: false, reason: 'error', message: error?.message })
        await supabaseAdmin.from('bill_items').insert(lines.map((l) => ({ ...l, bill_id: bill.id })))
        await supabaseAdmin.from('dining_sessions').update({ active_bill_id: bill.id, bill_status: 'open' }).eq('id', session.id)
        await supabaseAdmin.from('audit_events').insert({ session_id: session.id, type: 'test.bill_created', data: { billId: bill.id, total } })
        return json({ ok: true, billId: bill.id, totalPesewas: total })
      } catch (e) { return json({ ok: false, reason: 'error', message: String(e) }) }
    },
  } },
})
