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

          const { searchRead, loadOdooTaxes, odooTaxLines } = await import('@/integrations/pos/odoo.server')

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
              const orders = await searchRead(cfg, 'pos.order', [['state', '=', 'draft']], ['id', 'table_id', 'session_id', 'amount_total', 'amount_tax', 'employee_id', 'cashier'])
              const seated = orders.filter((o: any) => Array.isArray(o.table_id))
              const odooTableIds = [...new Set(seated.map((o: any) => o.table_id[0]))]
              const otables = odooTableIds.length ? await searchRead(cfg, 'restaurant.table', [['id', 'in', odooTableIds]], ['id', 'table_number']) : []
              const numByOdooTable = new Map<number, number>()
              for (const t of otables) numByOdooTable.set(t.id, t.table_number)
              const orderIds = seated.map((o: any) => o.id)
              const lines = orderIds.length ? await searchRead(cfg, 'pos.order.line', [['order_id', 'in', orderIds]], ['order_id', 'full_product_name', 'qty', 'price_subtotal', 'price_subtotal_incl', 'tax_ids']) : []
              const linesByOrder = new Map<number, any[]>()
              for (const l of lines) {
                const oid = Array.isArray(l.order_id) ? l.order_id[0] : l.order_id
                if (!linesByOrder.has(oid)) linesByOrder.set(oid, [])
                linesByOrder.get(oid)!.push(l)
              }
              // The taxes those lines carry, so the bill can show the POS's real VAT/levy split.
              const taxIds = [...new Set(lines.flatMap((l: any) => (Array.isArray(l.tax_ids) ? l.tax_ids : [])))] as number[]
              const taxes = taxIds.length ? await loadOdooTaxes(cfg, taxIds) : new Map()

              // ---- Reconcile Klown bills with the POS (upsert, never delete+recreate) ----
              // Each live Klown bill is keyed by the Odoo order it mirrors (bills.odoo_order_id).
              // Keeping the bill id stable across syncs is what keeps dining_sessions.active_bill_id,
              // payment_attempts.bill_id and an open split pointing at a real bill. Legacy bills
              // without an order id are adopted by table on first sight.
              const nowMs = Date.now()
              const { data: existBills } = klownTableIds.length
                ? await supabaseAdmin.from('bills').select('id, table_id, status, odoo_order_id, odoo_order_ids, subtotal_pesewas, total_pesewas, tax_pesewas, server_name').in('table_id', klownTableIds).in('status', ['open', 'ready'])
                : { data: [] as any[] }
              const liveBills = (existBills ?? []) as any[]
              const billIds = liveBills.map((b) => b.id as string)

              // Money on a bill: a captured payment always pins it; an unapproved MoMo prompt only briefly.
              const FRESH_MS = 15 * 60 * 1000
              const paidBillIds = new Set<string>()
              const pendingBillIds = new Set<string>()
              if (billIds.length) {
                const { data: pays } = await supabaseAdmin.from('payment_attempts').select('bill_id,status,created_at').in('bill_id', billIds).in('status', ['pending', 'captured'])
                for (const pmt of pays ?? []) {
                  if (!pmt.bill_id) continue
                  if (pmt.status === 'captured') paidBillIds.add(pmt.bill_id)
                  else if (nowMs - new Date(pmt.created_at as string).getTime() < FRESH_MS) pendingBillIds.add(pmt.bill_id)
                }
              }

              // Splits: protected while someone is actually using them (last activity across the
              // split, its shares and item assignments), auto-cancelled once idle for an hour so an
              // abandoned split can never freeze a table.
              const SPLIT_IDLE_MS = 60 * 60 * 1000
              const activeSplitBillIds = new Set<string>()
              if (billIds.length) {
                const { data: openSplits } = await supabaseAdmin.from('bill_splits').select('id,bill_id,created_at,updated_at').in('bill_id', billIds).eq('status', 'open')
                const splits = (openSplits ?? []) as any[]
                if (splits.length) {
                  const sids = splits.map((s) => s.id as string)
                  const lastBySplit = new Map<string, number>()
                  const bump = (sid: string, ts: string | null | undefined) => { if (!ts) return; const ms = new Date(ts).getTime(); if (ms > (lastBySplit.get(sid) ?? 0)) lastBySplit.set(sid, ms) }
                  for (const s of splits) { bump(s.id, s.created_at); bump(s.id, s.updated_at) }
                  const [{ data: shares }, { data: assigns }] = await Promise.all([
                    supabaseAdmin.from('bill_split_shares').select('split_id,updated_at,created_at').in('split_id', sids),
                    supabaseAdmin.from('bill_split_item_assignments').select('split_id,created_at').in('split_id', sids),
                  ])
                  for (const sh of shares ?? []) { bump(sh.split_id, sh.updated_at); bump(sh.split_id, sh.created_at) }
                  for (const a of assigns ?? []) bump(a.split_id, a.created_at)
                  const idle = splits.filter((s) => nowMs - (lastBySplit.get(s.id) ?? 0) > SPLIT_IDLE_MS).map((s) => s.id as string)
                  if (idle.length) await supabaseAdmin.from('bill_splits').update({ status: 'cancelled', updated_at: new Date(nowMs).toISOString() }).in('id', idle)
                  for (const s of splits) if (!idle.includes(s.id)) activeSplitBillIds.add(s.bill_id)
                }
              }

              // ---- One Klown bill per table, covering EVERY open POS order on that table ----
              // Odoo lets several orders sit on one table (a second round punched as a new ticket,
              // or an older order nobody closed). Klown shows the table as one bill: items, totals
              // and tax lines summed across those orders. Orders already paid in full through Klown
              // (a settled bill that covered them) stay out until staff close them on the POS, so a
              // paid order is never shown to the table again as unpaid.
              const ordersByTable = new Map<string, any[]>()
              for (const o of seated) {
                const num = numByOdooTable.get(o.table_id[0])
                const klownId = num == null ? undefined : klownByNum.get(num)
                if (!klownId) continue
                if (!ordersByTable.has(klownId)) ordersByTable.set(klownId, [])
                ordersByTable.get(klownId)!.push(o)
              }
              const seatedIds = seated.map((o: any) => o.id as number)
              const paidOrderIds = new Set<number>()
              if (seatedIds.length && klownTableIds.length) {
                const { data: settled } = await supabaseAdmin.from('bills').select('odoo_order_ids,odoo_order_id')
                  .in('table_id', klownTableIds).eq('status', 'settled').overlaps('odoo_order_ids', seatedIds)
                for (const b of (settled ?? []) as any[]) for (const id of (b.odoo_order_ids ?? [b.odoo_order_id])) if (id != null) paidOrderIds.add(id)
              }
              for (const [k, list] of ordersByTable) {
                const unpaid = list.filter((o) => !paidOrderIds.has(o.id)).sort((a, b) => a.id - b.id)
                if (unpaid.length) ordersByTable.set(k, unpaid); else ordersByTable.delete(k)
              }
              const liveByTable = new Map<string, any>()
              for (const b of liveBills) if (!liveByTable.has(b.table_id)) liveByTable.set(b.table_id, b)

              // Live bills on a table with no unpaid open order left on the POS are finished:
              // settled if anything was captured on them, void otherwise. Odoo is the source of
              // truth for "still open". (A bill with a MoMo prompt still awaiting approval gets one
              // more cycle before closing.)
              const finished = liveBills.filter((b) => !ordersByTable.has(b.table_id) && !pendingBillIds.has(b.id))
              if (finished.length) {
                const ids = finished.map((b) => b.id as string)
                const settledIds = ids.filter((id) => paidBillIds.has(id))
                const voidIds = ids.filter((id) => !paidBillIds.has(id))
                await supabaseAdmin.from('bill_splits').update({ status: 'cancelled', updated_at: new Date(nowMs).toISOString() }).in('bill_id', ids).eq('status', 'open')
                if (settledIds.length) await supabaseAdmin.from('bills').update({ status: 'settled' }).in('id', settledIds)
                if (voidIds.length) await supabaseAdmin.from('bills').update({ status: 'void' }).in('id', voidIds)
                await supabaseAdmin.from('dining_sessions').update({ active_bill_id: null, bill_status: 'none' }).in('active_bill_id', ids)
              }

              let written = 0
              for (const [klownId, orders] of ordersByTable) {
                const orderIds = orders.map((o) => o.id as number)
                let total = 0, taxPesewas = 0
                const taxByName = new Map<string, { name: string; rate: number | null; amountPesewas: number }>()
                let anyTaxLines = false
                const items: { name: string; qty: number; line_total_pesewas: number; sort: number }[] = []
                for (const o of orders) {
                  total += Math.round((o.amount_total || 0) * 100)
                  const ol = linesByOrder.get(o.id) ?? []
                  const tp = Math.round((o.amount_tax || 0) * 100)
                  taxPesewas += tp
                  const tl = odooTaxLines(ol, taxes, tp)
                  if (tl) {
                    anyTaxLines = true
                    for (const l of tl) {
                      const cur = taxByName.get(l.name)
                      if (cur) cur.amountPesewas += l.amountPesewas; else taxByName.set(l.name, { ...l })
                    }
                  }
                  for (const l of ol) items.push({
                    name: String(l.full_product_name || 'Item').trim(),
                    qty: Math.max(1, Math.round(l.qty || 1)),
                    line_total_pesewas: Math.round((l.price_subtotal_incl || 0) * 100),
                    sort: (items.length + 1) * 10,
                  })
                }
                const taxLines = anyTaxLines ? [...taxByName.values()].sort((a, b) => b.amountPesewas - a.amountPesewas) : null
                // The waiter on the most recent order (employee_id = who punched it; cashier as fallback).
                // First name only keeps the tip prompt friendly.
                const latest = orders[orders.length - 1]
                const rawServer = (Array.isArray(latest.employee_id) ? latest.employee_id[1] : '') || (typeof latest.cashier === 'string' ? latest.cashier : '')
                const serverName = rawServer ? String(rawServer).trim().split(/\s+/)[0] || null : null
                const header = {
                  subtotal_pesewas: total, service_charge_pesewas: 0, total_pesewas: total,
                  tax_lines: taxLines, tax_pesewas: taxLines ? taxPesewas : null, server_name: serverName as string | null,
                  odoo_order_id: orderIds[0]!, odoo_order_ids: orderIds,
                  odoo_session_id: Array.isArray(latest.session_id) ? latest.session_id[0] : null,
                }

                const existing = liveByTable.get(klownId)
                if (!existing) {
                  const { data: nb, error: insErr } = await supabaseAdmin.from('bills').insert({ table_id: klownId, status: 'open', opened_at: new Date().toISOString(), ...header }).select('id').single()
                  if (!nb) { if (insErr) console.error('pos-orders: bill insert failed', klownId, insErr.message); continue }
                  if (items.length) await supabaseAdmin.from('bill_items').insert(items.map((it) => ({ ...it, bill_id: nb.id })))
                  written++
                  continue
                }

                // Existing bill: update in place. Items are replaced only when nothing references
                // them (an item split assigns diners to bill_items rows). While a split is in use
                // the totals still refresh, so the diner never sees a stale balance.
                const sameIds = JSON.stringify(existing.odoo_order_ids ?? (existing.odoo_order_id != null ? [existing.odoo_order_id] : [])) === JSON.stringify(orderIds)
                const changed = !sameIds || existing.total_pesewas !== total || existing.subtotal_pesewas !== total || (existing.tax_pesewas ?? null) !== (taxLines ? taxPesewas : null) || (existing.server_name ?? null) !== serverName
                const { data: curItems } = await supabaseAdmin.from('bill_items').select('id,name,qty,line_total_pesewas,sort').eq('bill_id', existing.id).order('sort')
                const sameItems = (curItems ?? []).length === items.length && (curItems ?? []).every((ci: any, i: number) => ci.name === items[i]!.name && ci.qty === items[i]!.qty && ci.line_total_pesewas === items[i]!.line_total_pesewas)
                if (!changed && sameItems) continue
                if (changed) await supabaseAdmin.from('bills').update(header).eq('id', existing.id)
                if (!sameItems && !activeSplitBillIds.has(existing.id)) {
                  await supabaseAdmin.from('bill_items').delete().eq('bill_id', existing.id)
                  if (items.length) await supabaseAdmin.from('bill_items').insert(items.map((it) => ({ ...it, bill_id: existing.id })))
                } else if (!sameItems) {
                  // A split is open: merge in place so picks survive and a new round shows on the board.
                  const { planItemMerge } = await import('@/integrations/pos/mergeItems')
                  const plan = planItemMerge((curItems ?? []) as any[], items)
                  for (const u of plan.update) await supabaseAdmin.from('bill_items').update({ qty: u.qty, line_total_pesewas: u.line_total_pesewas, sort: u.sort }).eq('id', u.id)
                  if (plan.insert.length) await supabaseAdmin.from('bill_items').insert(plan.insert.map((it) => ({ ...it, bill_id: existing.id })))
                  if (plan.remove.length) await supabaseAdmin.from('bill_items').delete().in('id', plan.remove)
                }
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
