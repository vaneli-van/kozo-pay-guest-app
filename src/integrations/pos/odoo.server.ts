// Read-only Odoo POS reader over JSON-RPC. Server-only.
// Credentials are passed per call (loaded from the DB, admin-managed) — nothing here reads env.
export type OdooConfig = { base_url: string; db: string; username: string; api_key: string }

async function rpc(cfg: OdooConfig, service: string, method: string, args: unknown[]): Promise<any> {
  const res = await fetch(`${cfg.base_url.replace(/\/$/, '')}/jsonrpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { service, method, args }, id: Date.now() }),
  })
  const j = await res.json()
  if (j.error) throw new Error(`Odoo RPC error: ${JSON.stringify(j.error)}`)
  return j.result
}

const uidCache = new Map<string, number>()
async function uid(cfg: OdooConfig): Promise<number> {
  const k = `${cfg.base_url}|${cfg.db}|${cfg.username}`
  const cached = uidCache.get(k)
  if (cached) return cached
  const u = await rpc(cfg, 'common', 'authenticate', [cfg.db, cfg.username, cfg.api_key, {}])
  if (!u || typeof u !== 'number') throw new Error('Odoo authentication failed (check URL / database / API key)')
  uidCache.set(k, u)
  return u
}

// Read-only search_read. Never call a write method here.
export async function searchRead(cfg: OdooConfig, model: string, domain: unknown[], fields: string[], limit = 0): Promise<any[]> {
  const u = await uid(cfg)
  const kwargs: Record<string, unknown> = { fields }
  if (limit) kwargs['limit'] = limit
  return (await rpc(cfg, 'object', 'execute_kw', [cfg.db, u, cfg.api_key, model, 'search_read', [domain], kwargs])) as any[]
}

// Lightweight connectivity test used by the admin "Test connection" action.
export async function testConnection(cfg: OdooConfig): Promise<{ ok: boolean; message: string }> {
  try {
    const u = await uid(cfg)
    return { ok: true, message: `Connected (uid ${u})` }
  } catch (e) {
    return { ok: false, message: String(e) }
  }
}

// ── Write helpers (used only for settlement; gated per-restaurant in the caller) ──
export async function createRecord(cfg: OdooConfig, model: string, values: Record<string, unknown>): Promise<number> {
  const u = await uid(cfg)
  return (await rpc(cfg, 'object', 'execute_kw', [cfg.db, u, cfg.api_key, model, 'create', [values]])) as number
}
export async function writeRecord(cfg: OdooConfig, model: string, ids: number[], values: Record<string, unknown>): Promise<boolean> {
  const u = await uid(cfg)
  return (await rpc(cfg, 'object', 'execute_kw', [cfg.db, u, cfg.api_key, model, 'write', [ids, values]])) as boolean
}

// Close a table's open (draft) order on the POS by registering a Klown payment and marking it paid.
// Read-safe until called; callers must check writeback_enabled + a valid payment method id first.
export async function settleTableOrder(cfg: OdooConfig, paymentMethodId: number, tableNumber: number, amountPesewas: number) {
  const tables = await searchRead(cfg, 'restaurant.table', [['table_number', '=', tableNumber]], ['id'])
  const tableIds = tables.map((t: any) => t.id)
  if (!tableIds.length) return { ok: false as const, reason: 'no_table' }
  const orders = await searchRead(cfg, 'pos.order', [['state', '=', 'draft'], ['table_id', 'in', tableIds]], ['id', 'amount_total', 'amount_paid'])
  if (!orders.length) return { ok: false as const, reason: 'no_open_order' }
  const order = orders.sort((a: any, b: any) => b.id - a.id)[0]
  const amount = Math.round(amountPesewas) / 100
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ')
  await createRecord(cfg, 'pos.payment', { pos_order_id: order.id, payment_method_id: paymentMethodId, amount, payment_date: now })
  await writeRecord(cfg, 'pos.order', [order.id], { state: 'paid', amount_paid: order.amount_total })
  return { ok: true as const, orderId: order.id }
}

// ── QSR counter pay (Model A) ──
// A counter order becomes visible to Klown the moment the cashier selects the "Klown" tender
// (Odoo validates it as paid under that payment method). This reads the latest such order on
// the register's OPEN session that Klown hasn't collected yet. excludeOrderIds are Odoo order
// ids already recorded in Klown's collected ledger (passed by the caller).
export type KlownOrderLine = { name: string; qty: number; amountPesewas: number }
export type KlownOrder = {
  odooOrderId: number
  sessionId: number
  reference: string
  amountPesewas: number
  dateOrder: string
  lines: KlownOrderLine[]
}
export async function currentKlownOrder(
  cfg: OdooConfig,
  posConfigId: number,
  klownMethodId: number,
  excludeOrderIds: number[] = [],
): Promise<{ sessionId: number | null; order: KlownOrder | null }> {
  // 1. the register's currently open session
  const cfgs = await searchRead(cfg, 'pos.config', [['id', '=', posConfigId]], ['current_session_id'])
  const sess = cfgs[0]?.current_session_id
  const sessionId = Array.isArray(sess) ? sess[0] : (typeof sess === 'number' ? sess : null)
  if (!sessionId) return { sessionId: null, order: null }

  // 2. Klown-tendered orders on that session, newest first, minus already-collected ids
  const domain: unknown[] = [
    ['session_id', '=', sessionId],
    ['payment_ids.payment_method_id', '=', klownMethodId],
  ]
  if (excludeOrderIds.length) domain.push(['id', 'not in', excludeOrderIds])
  const orders = await searchRead(cfg, 'pos.order', domain, ['id', 'pos_reference', 'amount_total', 'date_order'], 20)
  if (!orders.length) return { sessionId, order: null }
  const latest = orders.sort((a: any, b: any) => b.id - a.id)[0]

  // 3. its lines for display
  const lines = await searchRead(cfg, 'pos.order.line', [['order_id', '=', latest.id]], ['full_product_name', 'product_id', 'qty', 'price_subtotal_incl'])
  return {
    sessionId,
    order: {
      odooOrderId: latest.id,
      sessionId,
      reference: latest.pos_reference || String(latest.id),
      amountPesewas: Math.round((latest.amount_total || 0) * 100),
      dateOrder: latest.date_order || '',
      lines: lines.map((l: any) => ({
        name: l.full_product_name || (Array.isArray(l.product_id) ? l.product_id[1] : 'Item'),
        qty: l.qty || 1,
        amountPesewas: Math.round((l.price_subtotal_incl || 0) * 100),
      })),
    },
  }
}
