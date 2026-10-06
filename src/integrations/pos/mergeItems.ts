// Bring a bill's item rows in line with the POS WITHOUT replacing rows that are still the same
// line. Used while a split is open: an item split points at bill_items rows, so the old
// "delete everything and re-insert" sync would wipe diners' picks, and freezing the rows (what we
// did before) left new rounds off the item board while the bill total still grew, so the new
// round's cost was spread over everyone's picks.
//
// Matching, in order: same name + qty + amount (unchanged line) -> keep; same name (qty or price
// changed on the POS) -> update that row in place, keeping its id and picks; anything new -> add;
// any row left over (voided on the POS) -> remove.
export interface CurItem { id: string; name: string; qty: number; line_total_pesewas: number; sort: number }
export interface NewItem { name: string; qty: number; line_total_pesewas: number; sort: number }
export interface ItemPlan {
  update: { id: string; qty: number; line_total_pesewas: number; sort: number }[]
  insert: NewItem[]
  remove: string[]
}

export function planItemMerge(cur: CurItem[], next: NewItem[]): ItemPlan {
  const used = new Set<string>()
  const pending: NewItem[] = []
  const update: ItemPlan['update'] = []
  for (const n of next) {
    const m = cur.find((c) => !used.has(c.id) && c.name === n.name && c.qty === n.qty && c.line_total_pesewas === n.line_total_pesewas)
    if (m) {
      used.add(m.id)
      if (m.sort !== n.sort) update.push({ id: m.id, qty: m.qty, line_total_pesewas: m.line_total_pesewas, sort: n.sort })
    } else pending.push(n)
  }
  const insert: NewItem[] = []
  for (const n of pending) {
    const m = cur.find((c) => !used.has(c.id) && c.name === n.name)
    if (m) { used.add(m.id); update.push({ id: m.id, qty: n.qty, line_total_pesewas: n.line_total_pesewas, sort: n.sort }) }
    else insert.push(n)
  }
  const remove = cur.filter((c) => !used.has(c.id)).map((c) => c.id)
  return { update, insert, remove }
}
