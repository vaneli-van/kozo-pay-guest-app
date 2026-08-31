import { createFileRoute } from '@tanstack/react-router'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-sync-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

// Read-only mirror: Naxos Odoo open (draft) table orders -> Klown `bills` for the matching table.
// Runs on a schedule (or on demand). Never writes to Odoo. Gated by a shared secret so only the
// scheduler can trigger it. Returns {ok:false, reason:'not_configured'} until Odoo secrets are set,
// so it is safe to deploy before credentials exist.
export const Route = createFileRoute('/api/sync/pos-orders')({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { headers: cors }),
      POST: async ({ request }) => {
        try {
          const secret = process.env['SYNC_SECRET']
          if (!secret || request.headers.get('x-sync-secret') !== secret) return json({ ok: false, reason: 'unauthorized' }, 401)

          const { odooConfigured, searchRead } = await import('@/integrations/pos/odoo.server')
          if (!odooConfigured()) return json({ ok: false, reason: 'not_configured' })

          const { supabaseAdmin } = await import('@/integrations/supabase/client.server')

          // Klown side: Naxos tables, keyed by their numeric label.
          const { data: rest } = await supabaseAdmin.from('restaurants').select('id').eq('name', 'Naxos').maybeSingle()
          if (!rest) return json({ ok: false, reason: 'no_naxos_restaurant' })
          const { data: branches } = await supabaseAdmin.from('branches').select('id').eq('restaurant_id', rest.id)
          const branchIds = (branches ?? []).map((b: any) => b.id)
          const { data: tables } = await supabaseAdmin.from('restaurant_tables').select('id,label').in('branch_id', branchIds)
          const klownByNum = new Map<number, string>()
          const klownTableIds: string[] = []
          for (const t of tables ?? []) { klownByNum.set(parseInt(t.label, 10), t.id); klownTableIds.push(t.id) }

          // Odoo side: current open (draft) orders that are seated at a table.
          const orders = await searchRead('pos.order', [['state', '=', 'draft']], ['id', 'table_id', 'amount_total'])
          const seated = orders.filter((o: any) => Array.isArray(o.table_id))
          const odooTableIds = [...new Set(seated.map((o: any) => o.table_id[0]))]
          const otables = odooTableIds.length ? await searchRead('restaurant.table', [['id', 'in', odooTableIds]], ['id', 'table_number']) : []
          const numByOdooTable = new Map<number, number>()
          for (const t of otables) numByOdooTable.set(t.id, t.table_number)
          const orderIds = seated.map((o: any) => o.id)
          const lines = orderIds.length ? await searchRead('pos.order.line', [['order_id', 'in', orderIds]], ['order_id', 'full_product_name', 'qty', 'price_subtotal_incl']) : []
          const linesByOrder = new Map<number, any[]>()
          for (const l of lines) {
            const oid = Array.isArray(l.order_id) ? l.order_id[0] : l.order_id
            if (!linesByOrder.has(oid)) linesByOrder.set(oid, [])
            linesByOrder.get(oid)!.push(l)
          }

          // Refresh: clear existing open bills for all Naxos tables, then write the current ones.
          if (klownTableIds.length) {
            const { data: openBills } = await supabaseAdmin.from('bills').select('id').in('table_id', klownTableIds).in('status', ['open', 'ready'])
            const openIds = (openBills ?? []).map((b: any) => b.id)
            if (openIds.length) {
              await supabaseAdmin.from('bill_items').delete().in('bill_id', openIds)
              await supabaseAdmin.from('bills').delete().in('id', openIds)
            }
          }

          let written = 0
          for (const o of seated) {
            const num = numByOdooTable.get(o.table_id[0])
            if (num == null) continue
            const klownId = klownByNum.get(num)
            if (!klownId) continue
            const total = Math.round((o.amount_total || 0) * 100)
            const { data: nb } = await supabaseAdmin.from('bills')
              .insert({ table_id: klownId, status: 'open', subtotal_pesewas: total, service_charge_pesewas: 0, total_pesewas: total, opened_at: new Date().toISOString() })
              .select('id').single()
            if (!nb) continue
            const ol = linesByOrder.get(o.id) ?? []
            const items = ol.map((l: any, i: number) => ({
              bill_id: nb.id,
              name: String(l.full_product_name || 'Item').trim(),
              qty: Math.max(1, Math.round(l.qty || 1)),
              line_total_pesewas: Math.round((l.price_subtotal_incl || 0) * 100),
              sort: (i + 1) * 10,
            }))
            if (items.length) await supabaseAdmin.from('bill_items').insert(items)
            written++
          }

          return json({ ok: true, openOrders: seated.length, billsWritten: written })
        } catch (e) {
          return json({ ok: false, reason: 'error', message: String(e) }, 500)
        }
      },
    },
  },
})
