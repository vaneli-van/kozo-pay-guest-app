// A table paid through Klown, then staff added a new round onto the SAME POS order instead of
// closing it (Baobab table 5, 29 Oct: order #371 paid GHS 50 via Klown, then grew to GHS 185).
// Until now the sync hid every order covered by a settled bill, so the new round never showed.
//
// This decides which settled bills have GROWN on the POS: every order the bill covered is still
// open, all of them sit on one table/tab now, and together they total more than the bill did.
// Those bills are reopened at the new total by the sync; the captures already on them still
// count, so the diner sees "GHS 50 paid, GHS 135 to pay". Anything else keeps today's rule
// (paid orders stay out until staff close them on the POS), so a paid order is never re-shown
// as unpaid because of a partial close, a merge, or a total that went down.
export type SettledBill = {
  id: string
  table_id: string
  tab_key: string | null
  total_pesewas: number
  odoo_order_id: number | null
  odoo_order_ids: number[] | null
}
export type SeatedOrder = { id: number; amount_total: number }

export function planPaidGrowth(
  settled: SettledBill[],
  seated: SeatedOrder[],
  keyOfOrder: (orderId: number) => string | undefined,
): { grown: { billId: string; key: string; orderIds: number[]; newTotalPesewas: number }[]; stillPaidOrderIds: Set<number> } {
  const byId = new Map(seated.map((o) => [o.id, o]))
  const grown: { billId: string; key: string; orderIds: number[]; newTotalPesewas: number }[] = []
  const stillPaid = new Set<number>()
  const claimed = new Set<number>()
  // Newest bill first wins if two settled bills ever point at the same order.
  for (const b of settled) {
    const ids = (b.odoo_order_ids && b.odoo_order_ids.length ? b.odoo_order_ids : b.odoo_order_id != null ? [b.odoo_order_id] : [])
    if (!ids.length) continue
    const open = ids.filter((id) => byId.has(id))
    const keys = new Set(open.map((id) => keyOfOrder(id)))
    const total = open.reduce((s, id) => s + Math.round((byId.get(id)!.amount_total || 0) * 100), 0)
    const onlyKey = keys.size === 1 ? [...keys][0] : undefined
    const isGrown = open.length === ids.length && !!onlyKey && total > (b.total_pesewas ?? 0) && !ids.some((id) => claimed.has(id))
    if (isGrown) {
      grown.push({ billId: b.id, key: onlyKey!, orderIds: ids, newTotalPesewas: total })
      for (const id of ids) claimed.add(id)
    } else {
      for (const id of ids) stillPaid.add(id)
    }
  }
  // An order claimed by a grown bill is not "paid" any more, even if an older bill also listed it.
  for (const id of claimed) stillPaid.delete(id)
  return { grown, stillPaidOrderIds: stillPaid }
}
