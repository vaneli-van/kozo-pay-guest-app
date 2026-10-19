// Waiters can move an open POS order to another table (Baobab waiter app v13, Odoo's own
// "Transfer"). The sync keys Klown bills by "<klown table id>|<tab key>", so without this a
// moved order would look like: the old table's bill finished (voided, or "settled" if someone
// had paid part of it) and a brand-new bill on the new table for the full amount. Anyone who
// had paid a share would be asked for it again, and an open split would be lost.
//
// planTableMoves works out, for every live bill whose table/tab no longer has an open order,
// where its order went:
//   - its order (by Odoo order id) or its lines (by Odoo line id, when the POS merged the
//     order into another one) now sit under another key;
//   - that key has no live bill yet  -> "rehome": the same bill moves (payments, split and
//     diners' sessions come with it);
//   - that key already has a live bill -> "merge": that bill carries on; this bill's captured
//     payments and diners move onto it and this one is closed as merged.
// A bill with a mobile-money prompt still awaiting approval is held for a cycle instead.
// Pure function: no I/O, unit-tested in tests/money/table-moves.spec.ts.

export type MoveBill = {
  id: string
  table_id: string
  tab_key: string | null
  odoo_order_id?: number | null
  odoo_order_ids?: number[] | null
  odoo_line_ids?: number[] | null
}
export type MoveOrder = { id: number }
export type MoveLine = { id: number }

export type TableMovePlan = {
  rehome: { billId: string; key: string; tableId: string; tabKey: string }[]
  merge: { fromBillId: string; intoBillId: string; key: string }[]
  hold: string[]
}

export const billKeyOf = (b: { table_id: string; tab_key: string | null }) => `${b.table_id}|${b.tab_key ?? ''}`

export function planTableMoves(input: {
  liveBills: MoveBill[]
  ordersByKey: Map<string, MoveOrder[]>
  linesByOrder: Map<number, MoveLine[]>
  pendingBillIds: Set<string>
}): TableMovePlan {
  const { liveBills, ordersByKey, linesByOrder, pendingBillIds } = input
  const plan: TableMovePlan = { rehome: [], merge: [], hold: [] }

  const keyByOrder = new Map<number, string>()
  const keyByLine = new Map<number, string>()
  for (const [k, list] of ordersByKey) {
    for (const o of list) {
      keyByOrder.set(o.id, k)
      for (const l of linesByOrder.get(o.id) ?? []) keyByLine.set(l.id, k)
    }
  }

  // Which live bill owns each key right now (first one wins, as in the sync).
  const owner = new Map<string, string>()
  for (const b of liveBills) if (!owner.has(billKeyOf(b))) owner.set(billKeyOf(b), b.id)

  // Bills whose own key still has orders are untouched; only "orphans" can have moved.
  // Oldest first, so when two bills land on one free table the older one carries on.
  const orphans = liveBills.filter((b) => !ordersByKey.has(billKeyOf(b)))

  for (const b of orphans) {
    const orderIds = b.odoo_order_ids?.length ? b.odoo_order_ids : b.odoo_order_id != null ? [b.odoo_order_id] : []
    let dest: string | undefined
    for (const id of orderIds) { dest = keyByOrder.get(id); if (dest) break }
    if (!dest) for (const id of b.odoo_line_ids ?? []) { dest = keyByLine.get(id); if (dest) break }
    if (!dest || dest === billKeyOf(b)) continue

    if (pendingBillIds.has(b.id)) { plan.hold.push(b.id); continue }

    const into = owner.get(dest)
    if (!into) {
      const sep = dest.indexOf('|')
      plan.rehome.push({ billId: b.id, key: dest, tableId: dest.slice(0, sep), tabKey: dest.slice(sep + 1) })
      owner.set(dest, b.id)
    } else if (into !== b.id) {
      plan.merge.push({ fromBillId: b.id, intoBillId: into, key: dest })
    }
  }
  return plan
}
