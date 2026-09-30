import { createFileRoute } from '@tanstack/react-router'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type, x-connector-token', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
function json(b: unknown, s = 200) { return new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } }) }

// On-prem connector -> cloud: push the current snapshot of open table tickets. The cloud refreshes
// `bills`/`bill_items` for that restaurant (same seam the diner app reads). Auth by connector token.
// body: { token, tables: [{ label, total_pesewas, items: [{ name, qty, line_total_pesewas }] }] }
export const Route = createFileRoute('/api/connector/sync')({
  server: { handlers: {
    OPTIONS: async () => new Response(null, { headers: cors }),
    POST: async ({ request }) => {
      try {
        const body: any = await request.json().catch(() => ({}))
        const token = body?.token || request.headers.get('x-connector-token')
        if (!token) return json({ ok: false, reason: 'no_token' }, 401)
        const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
        const { data: conn } = await supabaseAdmin.from('pos_connectors').select('id,restaurant_id,active').eq('token', token).maybeSingle()
        if (!conn || !conn.active) return json({ ok: false, reason: 'invalid_token' }, 401)
        await supabaseAdmin.from('pos_connectors').update({ last_seen_at: new Date().toISOString() }).eq('id', conn.id)

        const tables = Array.isArray(body?.tables) ? body.tables : []
        const { data: branches } = await supabaseAdmin.from('branches').select('id').eq('restaurant_id', conn.restaurant_id)
        const branchIds = (branches ?? []).map((b: any) => b.id)
        const { data: rtables } = await supabaseAdmin.from('restaurant_tables').select('id,label').in('branch_id', branchIds)
        const idByLabel = new Map<string, string>()
        const allIds: string[] = []
        for (const t of rtables ?? []) { idByLabel.set(String(t.label), t.id); idByLabel.set(String(parseInt(t.label, 10)), t.id); allIds.push(t.id) }

        // Refresh: clear this restaurant's open bills, then write the current snapshot.
        // PRESERVE any bill a diner is mid-paying (payment_attempts.bill_id is SET NULL on delete,
        // which severs the settle/auto-close link) or has an in-progress split on (bill_splits
        // cascade-deletes, stranding the diner on "setting up the split"). Protect by TABLE and skip
        // recreating those, so we never leave two open bills on one table. Bounded by freshness so an
        // abandoned payment/split can't freeze a table forever.
        const protectedTableIds = new Set<string>()
        if (allIds.length) {
          const { data: open } = await supabaseAdmin.from('bills').select('id,table_id').in('table_id', allIds).in('status', ['open', 'ready'])
          const billTable = new Map<string, string>()
          for (const b of open ?? []) billTable.set(b.id, b.table_id!)
          const openBillIds = [...billTable.keys()]
          if (openBillIds.length) {
            const FRESH_MS = 60 * 60 * 1000
            const nowMs = Date.now()
            const splitCutoff = new Date(nowMs - FRESH_MS).toISOString()
            const { data: pays } = await supabaseAdmin.from('payment_attempts').select('bill_id,status,created_at').in('bill_id', openBillIds).in('status', ['pending', 'captured'])
            for (const p of pays ?? []) {
              const t = p.bill_id ? billTable.get(p.bill_id) : undefined
              if (t && (p.status === 'captured' || nowMs - new Date(p.created_at as string).getTime() < 15 * 60 * 1000)) protectedTableIds.add(t)
            }
            const { data: liveSplits } = await supabaseAdmin.from('bill_splits').select('bill_id').in('bill_id', openBillIds).eq('status', 'open').gt('created_at', splitCutoff)
            for (const sp of liveSplits ?? []) {
              const t = sp.bill_id ? billTable.get(sp.bill_id) : undefined
              if (t) protectedTableIds.add(t)
            }
          }
          const deleteIds = (open ?? []).filter((b: any) => !protectedTableIds.has(b.table_id)).map((b: any) => b.id)
          if (deleteIds.length) { await supabaseAdmin.from('bill_items').delete().in('bill_id', deleteIds); await supabaseAdmin.from('bills').delete().in('id', deleteIds) }
        }
        let written = 0
        for (const t of tables) {
          const tid = idByLabel.get(String(t.label)) || idByLabel.get(String(parseInt(t.label, 10)))
          if (!tid) continue
          if (protectedTableIds.has(tid)) continue // diner mid-payment or mid-split — leave their bill intact
          const total = Math.round(Number(t.total_pesewas) || 0)
          const { data: nb } = await supabaseAdmin.from('bills').insert({ table_id: tid, status: 'open', subtotal_pesewas: total, service_charge_pesewas: 0, total_pesewas: total, opened_at: new Date().toISOString() }).select('id').single()
          if (!nb) continue
          const items = (Array.isArray(t.items) ? t.items : []).map((i: any, n: number) => ({ bill_id: nb.id, name: String(i.name || 'Item').slice(0, 200), qty: Math.max(1, Math.round(Number(i.qty) || 1)), line_total_pesewas: Math.round(Number(i.line_total_pesewas) || 0), sort: (n + 1) * 10 }))
          if (items.length) await supabaseAdmin.from('bill_items').insert(items)
          written++
        }
        return json({ ok: true, billsWritten: written })
      } catch (e) { return json({ ok: false, reason: 'error', message: String(e) }, 500) }
    },
  } },
})
