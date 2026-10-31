import { createFileRoute } from '@tanstack/react-router'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

// Self-serve bills for TEST-MODE restaurants only (restaurants.payment_mode = 'test'), so the
// whole pay flow can be exercised with Paystack test cards / test MoMo and no POS. Refused for
// every live restaurant. `reset: true` voids the table's current open test bill first.
// The lines come from the restaurant's own menu (live Menu Studio menu, else the POS-synced
// menu), so a demo bill shows dishes the venue actually sells. FALLBACK_MENU is used only when
// the restaurant has no menu loaded.
type Line = { name: string; qty: number; unit: number }
const FALLBACK_MENU: Line[] = [
  { name: 'Jollof Rice & Grilled Chicken', qty: 2, unit: 8500 },
  { name: 'Banku & Tilapia', qty: 1, unit: 12000 },
  { name: 'Kelewele', qty: 1, unit: 3500 },
  { name: 'Sobolo', qty: 3, unit: 1500 },
  { name: 'Club Beer', qty: 2, unit: 2000 },
]
const SERVERS = ['Ama', 'Kwame', 'Efua', 'Kofi', 'Akosua', 'Yaw']

function shuffle<T>(a: T[]): T[] {
  const b = a.slice()
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[b[i], b[j]] = [b[j]!, b[i]!]
  }
  return b
}

// Pick a believable table order: one dish from each of up to `max` different sections (so it
// reads like starter / main / dessert rather than five pizzas). Cheap items sometimes x2.
type Item = { name: string; price: number }
function pickLines(groups: Item[][], max = 5, seen = new Set<string>()): Line[] {
  const usable = groups
    .map((g) => g.filter((i) => i.price > 0 && !/^add\b/i.test(i.name.trim())))
    .filter((g) => g.length > 0)
  if (!usable.length) return []
  const lines: Line[] = []
  for (const g of shuffle(usable).slice(0, max)) {
    const it = g[Math.floor(Math.random() * g.length)]!
    if (seen.has(it.name)) continue
    seen.add(it.name)
    const qty = it.price <= 20000 && Math.random() < 0.35 ? 2 : 1
    lines.push({ name: it.name, qty, unit: it.price })
  }
  // A menu with only one or two sections: top up with other dishes.
  if (lines.length < 3) {
    for (const it of shuffle(usable.flat())) {
      if (lines.length >= Math.min(4, max)) break
      if (seen.has(it.name)) continue
      seen.add(it.name)
      lines.push({ name: it.name, qty: 1, unit: it.price })
    }
  }
  return lines
}

async function menuLines(supabaseAdmin: any, restaurantId: string, branchId: string): Promise<Line[]> {
  try {
    // Same order the diner shows menus in (most recently updated first = the main menu).
    const { data: menus } = await supabaseAdmin.from('studio_menus').select('id').eq('restaurant_id', restaurantId).eq('status', 'live').order('updated_at', { ascending: false })
    const menuIds: string[] = (menus ?? []).map((m: any) => m.id)
    if (menuIds.length) {
      const { data: secs } = await supabaseAdmin.from('studio_sections').select('id,menu_id').in('menu_id', menuIds).eq('visible', true)
      const secMenu: Record<string, string> = {}
      for (const x of secs ?? []) secMenu[x.id] = x.menu_id
      const secIds = Object.keys(secMenu)
      if (secIds.length) {
        const { data: items } = await supabaseAdmin.from('studio_items').select('section_id,name,price_pesewas,available,sold_out,visible').in('section_id', secIds)
        const main: Record<string, Item[]> = {}
        const extra: Record<string, Item[]> = {}
        for (const i of items ?? []) {
          if (i.visible === false || i.available === false || i.sold_out === true) continue
          const into = secMenu[i.section_id] === menuIds[0] ? main : extra
          ;(into[i.section_id] ||= []).push({ name: i.name, price: Number(i.price_pesewas) || 0 })
        }
        // Mostly food from the main menu, plus a drink from the venue's other menus if it has any.
        const seen = new Set<string>()
        const hasExtra = Object.keys(extra).length > 0
        const lines = pickLines(Object.values(main), hasExtra ? 4 : 5, seen)
        if (hasExtra) lines.push(...pickLines(Object.values(extra), 1, seen).slice(0, 1))
        if (lines.length) return lines
      }
    }
    const { data: cats } = await supabaseAdmin.from('menu_categories').select('id').eq('branch_id', branchId)
    const catIds = (cats ?? []).map((c: any) => c.id)
    if (catIds.length) {
      const { data: items } = await supabaseAdmin.from('menu_items').select('category_id,name,price_pesewas,available').in('category_id', catIds)
      const by: Record<string, { name: string; price: number }[]> = {}
      for (const i of items ?? []) {
        if (i.available === false) continue
        ;(by[i.category_id] ||= []).push({ name: i.name, price: Number(i.price_pesewas) || 0 })
      }
      const lines = pickLines(Object.values(by))
      if (lines.length) return lines
    }
  } catch {
    // fall through to the fallback bill
  }
  return FALLBACK_MENU
}

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
          await supabaseAdmin.from('dining_sessions').update({ active_bill_id: openIds[0] ?? null, bill_status: 'open' }).eq('id', session.id)
          return json({ ok: true, billId: openIds[0], existing: true })
        }
        if (openIds.length) {
          await supabaseAdmin.from('bill_splits').update({ status: 'cancelled', updated_at: new Date().toISOString() }).in('bill_id', openIds).eq('status', 'open')
          await supabaseAdmin.from('bills').update({ status: 'void' }).in('id', openIds)
          await supabaseAdmin.from('dining_sessions').update({ active_bill_id: null, bill_status: 'none' }).in('active_bill_id', openIds)
        }

        const picked = await menuLines(supabaseAdmin, (restaurant as any).id, table.branch_id)
        const lines = picked.map((m, i) => ({ name: m.name, qty: m.qty, line_total_pesewas: m.qty * m.unit, sort: (i + 1) * 10 }))
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
          tax_lines: taxLines, tax_pesewas: tax, server_name: SERVERS[Math.floor(Math.random() * SERVERS.length)] ?? 'Ama', opened_at: new Date().toISOString(),
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
