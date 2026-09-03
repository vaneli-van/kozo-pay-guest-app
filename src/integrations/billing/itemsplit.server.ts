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

// Shared payload for every items-mode endpoint, so the client can patch state in one call.
export async function itemsSplitPayload(supabaseAdmin: Admin, split: any, sessionId: string) {
  const { data: lines } = await supabaseAdmin.from('bill_items')
    .select('id,name,qty,line_total_pesewas,sort').eq('bill_id', split.bill_id).order('sort')
  const { data: shares } = await supabaseAdmin.from('bill_split_shares')
    .select('id,position,label,amount_pesewas,status,claimed_by_session,claimed_by_name,share_token')
    .eq('split_id', split.id).order('position')
  const { data: assigns } = await supabaseAdmin.from('bill_split_item_assignments')
    .select('bill_item_id,share_id,weight').eq('split_id', split.id)
  const { amountPaidForBill } = await import('@/integrations/payments/provider')
  const paid = await amountPaidForBill(split.bill_id)

  const shareById = new Map<string, any>((shares ?? []).map((s: any) => [s.id, s]))
  const items = (lines ?? []).map((l: any) => {
    const takers = (assigns ?? [])
      .filter((a: any) => a.bill_item_id === l.id && shareById.has(a.share_id))
      .map((a: any) => {
        const s = shareById.get(a.share_id)
        return { shareId: a.share_id, name: s.claimed_by_name || s.label, units: Math.trunc(a.weight ?? 0), paid: s.status === 'paid' }
      })
    const used = takers.reduce((n: number, t: any) => n + t.units, 0)
    return {
      billItemId: l.id, name: l.name, qty: l.qty, lineTotalPesewas: l.line_total_pesewas,
      unitsFree: Math.max(0, Math.trunc(l.qty ?? 0) - used), takers,
    }
  })

  const mine = (shares ?? []).find((s: any) => s.claimed_by_session === sessionId) ?? null
  const unpaidSum = (shares ?? []).filter((s: any) => s.status !== 'paid')
    .reduce((n: number, s: any) => n + Math.trunc(s.amount_pesewas ?? 0), 0)
  const total = Math.trunc(split.total_pesewas ?? 0)

  return {
    ok: true,
    split: { id: split.id, mode: split.mode, totalPesewas: total, status: split.status },
    paidPesewas: paid,
    remainingPesewas: Math.max(0, total - paid),
    items,
    shares: (shares ?? []).map((s: any) => ({
      id: s.id, position: s.position, label: s.label, amountPesewas: s.amount_pesewas,
      status: s.status, claimedByName: s.claimed_by_name, mine: s.claimed_by_session === sessionId,
      shareToken: s.share_token,
    })),
    myShareId: mine?.id ?? null,
    myShareAmountPesewas: mine ? Math.trunc(mine.amount_pesewas ?? 0) : null,
    unassignedPesewas: Math.max(0, total - paid - unpaidSum),
  }
}

// Resolve the OPEN items split for a session's table, confirming it matches the active bill.
export async function resolveOpenItemsSplit(supabaseAdmin: Admin, session: { id: string; table_id: string }) {
  const { posProvider } = await import('@/integrations/pos/provider')
  const bill = await posProvider.getActiveBillForTable(session.table_id)
  if (!bill) return { error: 'no_bill' as const }
  const { data: split } = await supabaseAdmin.from('bill_splits')
    .select('id,mode,total_pesewas,status,bill_id')
    .eq('bill_id', bill.id).eq('status', 'open').eq('mode', 'items')
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (!split) return { error: 'no_split' as const }
  return { split, bill }
}

// Find or create the caller's (non-paid) share on an items split.
export async function ensureMyShare(supabaseAdmin: Admin, splitId: string, sessionId: string, name?: string) {
  const { data: existing } = await supabaseAdmin.from('bill_split_shares')
    .select('id,status').eq('split_id', splitId).eq('claimed_by_session', sessionId)
    .order('position').limit(1).maybeSingle()
  if (existing) return existing
  const { data: rows } = await supabaseAdmin.from('bill_split_shares')
    .select('position').eq('split_id', splitId).order('position', { ascending: false }).limit(1)
  const position = ((rows ?? [])[0]?.position ?? 0) + 1
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  const token = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
  const label = (typeof name === 'string' && name.trim()) ? name.trim() : 'Guest'
  const { data: created } = await supabaseAdmin.from('bill_split_shares').insert({
    split_id: splitId, position, label, amount_pesewas: 0, status: 'claimed',
    claimed_by_session: sessionId, claimed_by_name: (typeof name === 'string' && name.trim()) ? name.trim() : null,
    share_token: token,
  }).select('id,status').single()
  return created
}
