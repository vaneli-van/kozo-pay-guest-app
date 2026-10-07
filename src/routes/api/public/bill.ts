import { createFileRoute } from '@tanstack/react-router'
import { billTax } from '@/integrations/billing/tax'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } }) }

export const Route = createFileRoute('/api/public/bill')({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { headers: cors }),
      POST: async ({ request }) => {
        try {
          const { sessionToken } = await request.json().catch(() => ({}) as { sessionToken?: unknown })
          if (!sessionToken || typeof sessionToken !== 'string') return json({ ok: false, reason: 'invalid_session' })
          const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
          const { data: session } = await supabaseAdmin.from('dining_sessions').select('id,table_id,register_id,status,expires_at').eq('session_token', sessionToken).maybeSingle()
          if (!session || session.status !== 'active' || new Date(session.expires_at) < new Date()) return json({ ok: false, reason: 'invalid_session' })

          // QSR counter session (no table): read the live Klown-tendered order from the register.
          if (!session.table_id! && session.register_id) {
            const { syncRegisterBill } = await import('@/integrations/pos/register.server')
            const sync = await syncRegisterBill({ id: session.id, register_id: session.register_id })
            if (sync.reason !== 'ready' || !sync.billId) return json({ ok: true, bill: null, orderStatus: sync.reason })
            const { data: bill } = await supabaseAdmin.from('bills').select('status,subtotal_pesewas,service_charge_pesewas,total_pesewas,tax_lines,tax_pesewas').eq('id', sync.billId).maybeSingle()
            const { data: items } = await supabaseAdmin.from('bill_items').select('name,qty,line_total_pesewas').eq('bill_id', sync.billId).order('sort')
            if (!bill) return json({ ok: true, bill: null, orderStatus: 'waiting' })
            const { amountPaidForBill: paidFor } = await import('@/integrations/payments/provider')
            const qPaid = await paidFor(sync.billId)
            const qRemaining = Math.max(0, (bill.total_pesewas ?? 0) - qPaid)
            return json({ ok: true, orderStatus: 'ready', bill: { status: bill.status, items: (items ?? []).map((i: any) => ({ name: i.name, qty: i.qty, lineTotalPesewas: i.line_total_pesewas })), subtotalPesewas: bill.subtotal_pesewas, serviceChargePesewas: bill.service_charge_pesewas, totalPesewas: bill.total_pesewas, tax: billTax(bill.subtotal_pesewas, bill as any), paidPesewas: qPaid, remainingPesewas: qRemaining, serverName: null } })
          }

          const { getBillForSession } = await import('@/integrations/pos/provider')
          const { bill, chooseTab, tabs } = await getBillForSession(session as any)
          // Several groups at this table, each with its own bill: the diner picks theirs first.
          if (!bill) return json({ ok: true, bill: null, chooseTab, tabs: chooseTab ? tabs : [] })
          // Partial payments (e.g. a paid split share) reduce what's left: surface paid/remaining so
          // the bill screen shows the remaining balance rather than the original total.
          const { amountPaidForBill } = await import('@/integrations/payments/provider')
          const paidPesewas = await amountPaidForBill(bill.id)
          const remainingPesewas = Math.max(0, (bill.totalPesewas ?? 0) - paidPesewas)
          // Read-only: the diner can never mutate bill items.
          return json({ ok: true, bill: { status: bill.status, items: bill.items, subtotalPesewas: bill.subtotalPesewas, serviceChargePesewas: bill.serviceChargePesewas, totalPesewas: bill.totalPesewas, tax: bill.tax, paidPesewas, remainingPesewas, serverName: bill.serverName ?? null, tabLabel: bill.tabLabel ?? null }, tabCount: tabs.length, tabs: tabs.length > 1 ? tabs : [] })
        } catch (e) { return json({ ok: false, reason: 'error', message: String(e) }) }
      },
    },
  },
})
