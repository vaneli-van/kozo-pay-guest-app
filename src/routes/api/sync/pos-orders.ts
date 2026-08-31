import { createFileRoute } from '@tanstack/react-router'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-sync-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

// Read-only mirror: for every restaurant that has admin-entered Odoo credentials, pull its open
// (draft) table orders and refresh the live `bills` for the matching tables. Never writes to Odoo.
// Credentials + the shared secret live in the DB (admin-managed), so no Lovable env is required.
export const Route = createFileRoute('/api/sync/pos-orders')({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { headers: cors }),
      POST: async ({ request }) => {
        try {
          const { supabaseAdmin } = await import('@/integrations/supabase/client.server')

          // Auth: shared secret stored in app_settings (falls back to env for convenience).
          const { data: secretRow } = await supabaseAdmin.from('app_settings').select('value').eq('key', 'sync_secret').maybeSingle()
          const secret = secretRow?.value || process.env['SYNC_SECRET']
          if (!secret || request.headers.get('x-sync-secret') !== secret) return json({ ok: false, reason: 'unauthorized' }, 401)

          const { searchRead } = await import('@/integrations/pos/odoo.server')

          // All restaurants with active Odoo credentials.
          const { data: creds } = await supabaseAdmin.from('pos_odoo_credentials')
            .select('restaurant_id, base_url, db, username, api_key, active')
          const active = (creds ?? []).filter((c: any) => c.active && c.base_url && c.api_key)
          if (!active.length) return json({ ok: true, reason: 'no_connections', restaurants: [] })

          const results: any[] = []
          for (const c of active) {
            try {
              const cfg = { base_url: c.base_url, db: c.db, username: c.username || 'admin', api_key: c.api_key }

              // Klown tables for this restaurant, keyed by numeric label.
              const { data: branches } = await supabaseAdmin.from('branches').select('id').eq('restaurant_id', c.restaurant_id)
              const branchIds = (branches ?? []).map((b: any) => b.id)
              if (!branchIds.length) { results.push({ restaurant_id: c.restaurant_id, billsWritten: 0, note: 'no_branches' }); continue }
              const { data: tables } = await supabaseAdmin.from('restaurant_tables').select('id,label').in('branch_id', branchIds)
              const klownByNum = new Map<number, string>()
              const klownTableIds: string[] = []
              for (const t of tables ?? []) { klownByNum.set(parseInt(t.label, 10), t.id); klownTableIds.push(t.id) }

              // Odoo open (draft) orders seated at a table.
              const orders = await searchRead(cfg, 'pos.order', [['state', '=', 'draft']], ['id', 'table_id', 'amount_total'])
              const seated = orders.filter((o: any) => Array.isArray(o.table_id))
              const odooTableIds = [...new Set(seated.map((o: any) => o.table_id[0]))]
              const otables = odooTableIds.length ? await searchRead(cfg, 'restaurant.table', [['id', 'in', odooTableIds]], ['id', 'table_number']) : []
              const numByOdooTable = new Map<number, number>()
              for (const t of otables) numByOdooTable.set(t.id, t.table_number)
              const orderIds = seated.map((o: any) => o.id)
              const lines = orderIds.length ? await searchRead(cfg, 'pos.order.line', [['order_id', 'in', orderIds]], ['order_id', 'full_product_name', 'qty', 'price_subtotal_incl']) : []
              const linesByOrder = new Map<number, any[]>()
              for (const l of lines) {
                const oid = Array.isArray(l.order_id) ? l.order_id[0] : l.order_id
                if (!linesByOrder.has(oid)) linesByOrder.set(oid, [])
                linesByOrder.get(oid)!.push(l)
              }

              // Refresh: clear this restaurant's open bills, then write current ones.
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

              // Reflect a successful sync on the POS connection card, if present.
              await supabaseAdmin.from('pos_connections').update({ health: 'healthy', status: 'live', last_sync_at: new Date().toISOString() }).eq('restaurant_id', c.restaurant_id).eq('provider', 'odoo')
              results.push({ restaurant_id: c.restaurant_id, openOrders: seated.length, billsWritten: written })
            } catch (e) {
              await supabaseAdmin.from('pos_connections').update({ health: 'issue' }).eq('restaurant_id', c.restaurant_id).eq('provider', 'odoo')
              results.push({ restaurant_id: c.restaurant_id, error: String(e) })
            }
          }
          return json({ ok: true, restaurants: results })
        } catch (e) {
          return json({ ok: false, reason: 'error', message: String(e) }, 500)
        }
      },
    },
  },
})
