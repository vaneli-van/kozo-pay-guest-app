import type { State } from '../session/machine'

// Preview-only stand-in for the POS. Used when the app runs in development without a
// table session (no QR token), so the bill, split and checkout screens show real numbers.
// Production builds and real table sessions never touch this.
export const DEMO_MODE_ENABLED = import.meta.env.DEV

export const DEMO_SHARE_ID = 'demo-share-me'

const DEMO_ITEMS = [
  { billItemId: 'demo-1', name: 'Jollof rice & grilled chicken', qty: 2, lineTotalPesewas: 19000 },
  { billItemId: 'demo-2', name: 'Banku & grilled tilapia', qty: 1, lineTotalPesewas: 12000 },
  { billItemId: 'demo-3', name: 'Kelewele', qty: 1, lineTotalPesewas: 3500 },
  { billItemId: 'demo-4', name: 'Sobolo', qty: 2, lineTotalPesewas: 4000 },
  { billItemId: 'demo-5', name: 'Club lager', qty: 2, lineTotalPesewas: 5000 },
]

const subtotal = DEMO_ITEMS.reduce((a, it) => a + it.lineTotalPesewas, 0)
const service = Math.round(subtotal * 0.1)

export const DEMO_BILL: NonNullable<State['bill']> = {
  status: 'open',
  serverName: 'Akosua',
  items: DEMO_ITEMS.map(({ name, qty, lineTotalPesewas }) => ({ name, qty, lineTotalPesewas })),
  subtotalPesewas: subtotal,
  serviceChargePesewas: service,
  totalPesewas: subtotal + service,
}

type Split = NonNullable<State['split']>
type Share = Split['shares'][number]

const share = (id: string, position: number, label: string, amountPesewas: number, mine = false): Share => ({
  id, position, label, amountPesewas, status: 'open', claimedByName: mine ? 'You' : null, mine, shareToken: id,
})

export function createDemoSplit(
  mode: 'items' | 'even' | 'amounts',
  opts: { people?: number; amounts?: { label: string; amount: number }[] } = {},
): Split {
  const total = DEMO_BILL.totalPesewas
  const base = { id: `demo-split-${mode}`, mode, totalPesewas: total, status: 'open', paidPesewas: 0, remainingPesewas: total }

  if (mode === 'items') {
    return {
      ...base,
      shares: [share(DEMO_SHARE_ID, 1, 'You', 0, true)],
      items: DEMO_ITEMS.map((it) => ({ ...it, unitsFree: it.qty, takers: [] })),
      myShareId: DEMO_SHARE_ID,
      myShareAmountPesewas: 0,
      unassignedPesewas: total,
    }
  }

  if (mode === 'even') {
    const people = Math.max(2, opts.people ?? 2)
    const each = Math.floor(total / people)
    const shares = Array.from({ length: people }, (_, i) =>
      share(`demo-share-${i + 1}`, i + 1, `Share ${i + 1}`, i === people - 1 ? total - each * (people - 1) : each),
    )
    return { ...base, shares }
  }

  const shares = (opts.amounts ?? []).map((a, i) => share(`demo-share-${i + 1}`, i + 1, a.label || `Share ${i + 1}`, a.amount))
  return { ...base, shares }
}

export function demoQuote(s: State): NonNullable<State['quote']> {
  const total = DEMO_BILL.totalPesewas
  const preTip = s.screen === 'pay' || s.screen === 'split' || s.screen === 'split-share' || s.screen === 'tip'
  let sharePesewas = total
  if (s.claimedShareId && s.split) {
    sharePesewas = s.split.mode === 'items'
      ? (s.split.myShareAmountPesewas ?? 0)
      : (s.split.shares.find((sh) => sh.id === s.claimedShareId)?.amountPesewas ?? total)
  } else if (s.shareMode === 'even') {
    sharePesewas = Math.round(total / Math.max(1, s.people || 1))
  } else if (s.shareMode === 'custom' && s.customAmountPesewas) {
    sharePesewas = Math.min(total, s.customAmountPesewas)
  }
  const tipPercent = preTip ? 0 : (s.tipPercent ?? s.tip ?? 0)
  const tipPesewas = Math.round((sharePesewas * tipPercent) / 100)
  return { billTotalPesewas: total, remainingPesewas: total, sharePesewas, tipPesewas, grandTotalPesewas: sharePesewas + tipPesewas }
}
