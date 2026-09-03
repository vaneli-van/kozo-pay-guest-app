// Item-level split math. All money in integer pesewas — every allocation sums exactly.
// Server-only: recompute is authoritative, the client never computes a payable amount.

// Largest-remainder integer allocation. Always sums to exactly `total`.
export function allocate(total: number, weights: number[]): number[] {
  const sumW = weights.reduce((s, w) => s + w, 0)
  if (sumW <= 0) return weights.map(() => 0)
  const exact = weights.map((w) => (total * w) / sumW)
  const base = exact.map((v) => Math.floor(v))
  let leftover = total - base.reduce((s, v) => s + v, 0)
  const order = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => (b.frac - a.frac) || (a.i - b.i))
  for (let k = 0; k < order.length && leftover > 0; k++, leftover--) {
    const entry = order[k]!
    base[entry.i] = (base[entry.i] ?? 0) + 1
  }
  return base
}

type Admin = any

// Recompute + persist share amounts for an items-mode split. Idempotent.
export async function recomputeItemSplit(supabaseAdmin: Admin, splitId: string): Promise<void> {
  const { data: split } = await supabaseAdmin.from('bill_splits')
    .select('id,bill_id,mode,status').eq('id', splitId).maybeSingle()
  if (!split || split.mode !== 'items' || split.status !== 'open') return

  const { data: bill } = await supabaseAdmin.from('bills')
    .select('id,subtotal_pesewas,service_charge_pesewas,total_pesewas').eq('id', split.bill_id).maybeSingle()
  if (!bill) return
  const total = Math.trunc(bill.total_pesewas ?? 0)

  const { data: lines } = await supabaseAdmin.from('bill_items')
    .select('id,qty,line_total_pesewas').eq('bill_id', bill.id)
  const { data: assigns } = await supabaseAdmin.from('bill_split_item_assignments')
    .select('bill_item_id,share_id,weight').eq('split_id', split.id)
  const { data: shares } = await supabaseAdmin.from('bill_split_shares')
    .select('id,status,amount_pesewas').eq('split_id', split.id)

  const itemValue = new Map<string, number>()
  let unassignedItemValue = 0

  for (const line of lines ?? []) {
    const lineAssigns = (assigns ?? [])
      .filter((a: any) => a.bill_item_id === line.id && a.share_id)
      .sort((a: any, b: any) => String(a.share_id).localeCompare(String(b.share_id)))
    const used = lineAssigns.reduce((s: number, a: any) => s + Math.max(0, Math.trunc(a.weight ?? 0)), 0)
    const freeUnits = Math.max(0, Math.trunc(line.qty ?? 0) - used)
    const weights = [...lineAssigns.map((a: any) => Math.max(0, Math.trunc(a.weight ?? 0))), freeUnits]
    const slices = allocate(Math.trunc(line.line_total_pesewas ?? 0), weights)
    lineAssigns.forEach((a: any, i: number) => {
      itemValue.set(a.share_id, (itemValue.get(a.share_id) ?? 0) + (slices[i] ?? 0))
    })
    unassignedItemValue += slices[slices.length - 1] ?? 0
  }

  const all = (shares ?? []).slice().sort((a: any, b: any) => String(a.id).localeCompare(String(b.id)))
  const paidTotal = all.filter((s: any) => s.status === 'paid')
    .reduce((n: number, s: any) => n + Math.trunc(s.amount_pesewas ?? 0), 0)
  const remainingTotal = Math.max(0, total - paidTotal)

  const unpaid = all.filter((s: any) => s.status !== 'paid')
  const weights = [...unpaid.map((s: any) => itemValue.get(s.id) ?? 0), unassignedItemValue]
  const slices = allocate(remainingTotal, weights)

  for (let i = 0; i < unpaid.length; i++) {
    const share = unpaid[i]!
    const amount = slices[i] ?? 0
    const hasItems = (assigns ?? []).some((a: any) => a.share_id === share.id && Math.trunc(a.weight ?? 0) > 0)
    if (!hasItems) {
      await supabaseAdmin.from('bill_split_shares').delete().eq('id', share.id)
      continue
    }
    if (amount !== Math.trunc(share.amount_pesewas ?? 0)) {
      await supabaseAdmin.from('bill_split_shares')
        .update({ amount_pesewas: amount, updated_at: new Date().toISOString() }).eq('id', share.id)
    }
  }
}
