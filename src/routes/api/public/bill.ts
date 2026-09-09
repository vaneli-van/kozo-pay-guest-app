import { createFileRoute } from '@tanstack/react-router'

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
            const { data: bill } = await supabaseAdmin.from('bills').select('status,subtotal_pesewas,service_charge_pesewas,total_pesewas').eq('id', sync.billId).maybeSingle()
            const { data: items } = await supabaseAdmin.from('bill_items').select('name,qty,line_total_pesewas').eq('bill_id', sync.billId).order('sort')
            if (!bill) return json({ ok: true, bill: null, orderStatus: 'waiting' })
            return json({ ok: true, orderStatus: 'ready', bill: { status: bill.status, items: (items ?? []).map((i: any) => ({ name: i.name, qty: i.qty, lineTotalPesewas: i.line_total_pesewas })), subtotalPesewas: bill.subtotal_pesewas, serviceChargePesewas: bill.service_charge_pesewas, totalPesewas: bill.total_pesewas, serverName: null } })
          }

          const { posProvider } = await import('@/integrations/pos/provider')
          const bill = await posProvider.getActiveBillForTable(session.table_id!)
          if (!bill) return json({ ok: true, bill: null })
          // Read-only: the diner can never mutate bill items.
          return json({ ok: true, bill: { status: bill.status, items: bill.items, subtotalPesewas: bill.subtotalPesewas, serviceChargePesewas: bill.serviceChargePesewas, totalPesewas: bill.totalPesewas, serverName: bill.serverName ?? null } })
        } catch (e) { return json({ ok: false, reason: 'error', message: String(e) }) }
      },
    },
  },
})
