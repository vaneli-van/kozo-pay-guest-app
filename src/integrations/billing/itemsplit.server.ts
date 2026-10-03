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

// The item-split math now lives in Postgres (items_split_recompute / items_split_payload and the
// session-facing items_split_assign / items_split_assign_remaining / split_board), so a tap or a poll
// is ONE round trip from the Worker instead of ten. klown_allocate() in the DB is a bit-for-bit port
// of allocate() above (float8 arithmetic, ties to the lower index) and is tested against it.

// Recompute + persist share amounts for an items-mode split. Idempotent.
export async function recomputeItemSplit(supabaseAdmin: Admin, splitId: string, _knownSplit?: any): Promise<void> {
  const { error } = await supabaseAdmin.rpc('items_split_recompute', { p_split_id: splitId })
  if (error) throw new Error(error.message)
}

// Shared payload for every items-mode endpoint, so the client can patch state in one call.
export async function itemsSplitPayload(supabaseAdmin: Admin, split: { id: string }, sessionId: string): Promise<Record<string, unknown>> {
  const { data, error } = await supabaseAdmin.rpc('items_split_payload', { p_split_id: split.id, p_session_id: sessionId })
  if (error) throw new Error(error.message)
  return (data ?? { ok: false, reason: 'no_split' }) as Record<string, unknown>
}
