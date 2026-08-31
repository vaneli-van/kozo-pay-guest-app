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
        if (allIds.length) {
          const { data: open } = await supabaseAdmin.from('bills').select('id').in('table_id', allIds).in('status', ['open', 'ready'])
          const openIds = (open ?? []).map((b: any) => b.id)
          if (openIds.length) { await supabaseAdmin.from('bill_items').delete().in('bill_id', openIds); await supabaseAdmin.from('bills').delete().in('id', openIds) }
        }
        let written = 0
        for (const t of tables) {
          const tid = idByLabel.get(String(t.label)) || idByLabel.get(String(parseInt(t.label, 10)))
          if (!tid) continue
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
