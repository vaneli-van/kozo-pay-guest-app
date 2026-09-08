// QSR counter pay (Model A) — server only.
// Reads the current Klown-tendered order from the register's Odoo POS and mirrors it into a
// table-less `bills` row so the whole existing pay/quote/capture/receipt/rewards flow reuses.
import { supabaseAdmin } from '@/integrations/supabase/client.server'
import { currentKlownOrder, type KlownOrder } from '@/integrations/pos/odoo.server'

export type RegisterBillSync =
  | { order: null; reason: 'unconfigured' | 'closed' | 'waiting' | 'error'; billId?: undefined }
  | { order: KlownOrder; reason: 'ready'; billId: string }

type SessionLike = { id: string; register_id: string | null }

export async function syncRegisterBill(session: SessionLike): Promise<RegisterBillSync> {
  if (!session.register_id) return { order: null, reason: 'waiting' }

  const { data: reg } = await supabaseAdmin
    .from('pos_registers')
    .select('id,restaurant_id,odoo_pos_config_id,active')
    .eq('id', session.register_id)
    .maybeSingle()
  if (!reg || !reg.active || !reg.odoo_pos_config_id) return { order: null, reason: 'unconfigured' }

  const { data: creds } = await supabaseAdmin
    .from('pos_odoo_credentials')
    .select('base_url,db,username,api_key,active,klown_payment_method_id')
    .eq('restaurant_id', reg.restaurant_id)
    .maybeSingle()
  if (!creds?.active || !creds.klown_payment_method_id) return { order: null, reason: 'unconfigured' }

  // Odoo order ids Klown has already collected for this restaurant — never resurface them.
  const { data: collected } = await supabaseAdmin
    .from('klown_collected_orders')
    .select('odoo_order_id')
    .eq('restaurant_id', reg.restaurant_id)
  const excludeIds = (collected ?? []).map((c: any) => c.odoo_order_id).filter((n: any) => typeof n === 'number')

  const cfg = { base_url: creds.base_url, db: creds.db, username: creds.username || 'admin', api_key: creds.api_key }
  let res: { sessionId: number | null; order: KlownOrder | null }
  try {
    res = await currentKlownOrder(cfg, reg.odoo_pos_config_id, creds.klown_payment_method_id, excludeIds)
  } catch {
    // Odoo unreachable / auth error: don't crash the diner. 'error' is shown to the diner
    // exactly like 'waiting', but is distinguishable in the resolve response for diagnostics.
    return { order: null, reason: 'error' }
  }
  if (res.sessionId == null) return { order: null, reason: 'closed' }
  if (!res.order) return { order: null, reason: 'waiting' }

  const order = res.order

  // Reuse an existing bill for this Odoo order, else create one + its line items.
  const { data: existing } = await supabaseAdmin
    .from('bills')
    .select('id,status')
    .eq('restaurant_id', reg.restaurant_id)
    .eq('odoo_order_id', order.odooOrderId)
    .maybeSingle()

  let billId: string
  if (existing) {
    billId = existing.id
    if (existing.status === 'settled') {
      // Already paid but not yet in the ledger (rare race). Treat as done → waiting.
      return { order: null, reason: 'waiting' }
    }
  } else {
    const { data: created, error } = await supabaseAdmin
      .from('bills')
      .insert({
        restaurant_id: reg.restaurant_id,
        register_id: reg.id,
        odoo_pos_config_id: reg.odoo_pos_config_id,
        odoo_order_id: order.odooOrderId,
        odoo_session_id: order.sessionId,
        status: 'open',
        subtotal_pesewas: order.amountPesewas,
        service_charge_pesewas: 0,
        total_pesewas: order.amountPesewas,
      })
      .select('id')
      .single()
    if (error || !created) {
      // Unique-index race: another request created it first — fetch and use that.
      const { data: raced } = await supabaseAdmin
        .from('bills').select('id').eq('restaurant_id', reg.restaurant_id).eq('odoo_order_id', order.odooOrderId).maybeSingle()
      if (!raced) return { order: null, reason: 'waiting' }
      billId = raced.id
    } else {
      billId = created.id
      const rows = order.lines.map((l, i) => ({ bill_id: billId, name: l.name, qty: Math.round(l.qty), line_total_pesewas: l.amountPesewas, sort: i }))
      if (rows.length) await supabaseAdmin.from('bill_items').insert(rows)
    }
  }

  await supabaseAdmin.from('dining_sessions').update({ active_bill_id: billId, bill_status: 'open' }).eq('id', session.id)
  return { order, reason: 'ready', billId }
}
