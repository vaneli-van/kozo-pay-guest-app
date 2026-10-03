import { createFileRoute } from '@tanstack/react-router'
import { billTax } from '@/integrations/billing/tax'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

function receiptNumber(): string {
  const a = new Uint8Array(4); crypto.getRandomValues(a)
  return 'KZ-' + [...a].map((b) => b.toString(36)).join('').slice(0, 6).toUpperCase()
}

// Structured receipt data for the diner-side Odoo-style receipt image. Read-only w.r.t. the POS.
export const Route = createFileRoute('/api/public/receipt-data')({
  server: { handlers: {
    OPTIONS: async () => new Response(null, { headers: cors }),
    POST: async ({ request }) => {
      try {
        const { sessionToken } = await request.json().catch(() => ({} as { sessionToken?: unknown }))
        if (!sessionToken || typeof sessionToken !== 'string') return json({ ok: false, reason: 'invalid_session' })
        const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
        const { data: session } = await supabaseAdmin.from('dining_sessions').select('id,table_id,status,expires_at,active_bill_id').eq('session_token', sessionToken).maybeSingle()
        if (!session || session.status !== 'active' || new Date(session.expires_at) < new Date()) return json({ ok: false, reason: 'invalid_session' })

        const { data: caps } = await supabaseAdmin.from('payment_attempts').select('amount_pesewas,tip_pesewas,total_pesewas,method').eq('session_id', session.id).eq('status', 'captured')
        if (!caps || caps.length === 0) return json({ ok: false, reason: 'no_payment' })
        const totalPaid = caps.reduce((s: number, r: any) => s + (r.total_pesewas ?? 0), 0)
        const tipPaid = caps.reduce((s: number, r: any) => s + (r.tip_pesewas ?? 0), 0)
        const method = (caps.find((c: any) => c.method)?.method as string | undefined) ?? null

        const { data: table } = await supabaseAdmin.from('restaurant_tables').select('branch_id,label').eq('id', session.table_id!).maybeSingle()
        const { data: branch } = table ? await supabaseAdmin.from('branches').select('restaurant_id').eq('id', table.branch_id).maybeSingle() : { data: null }
        const { data: restaurant } = branch ? await supabaseAdmin.from('restaurants').select('name,city,logo_url').eq('id', branch.restaurant_id).maybeSingle() : { data: null }

        let { data: receipt } = await supabaseAdmin.from('receipts').select('receipt_number,total_paid_pesewas,issued_at').eq('session_id', session.id).maybeSingle()
        if (!receipt) {
          const { data: created } = await supabaseAdmin.from('receipts').insert({ session_id: session.id, bill_id: session.active_bill_id, receipt_number: receiptNumber(), total_paid_pesewas: totalPaid }).select('receipt_number,total_paid_pesewas,issued_at').single()
          receipt = created
          await supabaseAdmin.from('audit_events').insert({ session_id: session.id, type: 'receipt.issued', data: { total: totalPaid } })
        }

        const { data: bill } = session.active_bill_id ? await supabaseAdmin.from('bills').select('subtotal_pesewas,service_charge_pesewas,total_pesewas,server_name,tax_lines,tax_pesewas').eq('id', session.active_bill_id).maybeSingle() : { data: null }
        const { data: items } = session.active_bill_id ? await supabaseAdmin.from('bill_items').select('name,qty,line_total_pesewas,sort').eq('bill_id', session.active_bill_id).order('sort') : { data: [] }
        const lines = (items ?? []).map((i: any) => ({ name: String(i.name ?? 'Item'), qty: i.qty ?? 1, amount: i.line_total_pesewas ?? 0 }))
        const itemsTotal = lines.reduce((s, l) => s + l.amount, 0)
        const tax = billTax(itemsTotal, bill as any)

        return json({
          ok: true,
          receiptNumber: receipt?.receipt_number ?? null,
          issuedAt: receipt?.issued_at ?? new Date().toISOString(),
          restaurant: { name: restaurant?.name ?? 'Restaurant', city: restaurant?.city ?? null, logoUrl: restaurant?.logo_url ?? null },
          tableLabel: table?.label ?? null,
          serverName: bill?.server_name ?? null,
          currency: 'GHS',
          lines,
          subtotalPesewas: itemsTotal,
          serviceChargePesewas: bill?.service_charge_pesewas ?? 0,
          tax: { net: tax.net, total: tax.total, lines: tax.lines, estimated: tax.estimated },
          totalPaidPesewas: totalPaid,
          tipPesewas: tipPaid,
          method,
        })
      } catch (e) { return json({ ok: false, reason: 'error', message: String(e) }) }
    },
  } },
})
