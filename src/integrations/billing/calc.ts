// Server-authoritative split + tip math. All money in integer pesewas (GH₵1 = 100).
// This is the single source of truth for what a diner owes — the client is never trusted.
export type ShareMode = 'full' | 'even' | 'custom' | 'invite'

export interface QuoteInput {
  totalPesewas: number
  amountPaidPesewas: number
  mode: ShareMode
  people?: number
  customAmountPesewas?: number
  tipPesewas?: number
  tipPercent?: number
}
export interface Quote {
  billTotalPesewas: number
  remainingPesewas: number
  sharePesewas: number
  tipPesewas: number
  grandTotalPesewas: number
}
export class QuoteError extends Error {
  reason: string
  constructor(reason: string) {
    super(reason)
    this.name = 'QuoteError'
    this.reason = reason
  }
}

export function computeQuote(input: QuoteInput): Quote {
  const total = Math.max(0, Math.trunc(input.totalPesewas))
  const paid = Math.max(0, Math.trunc(input.amountPaidPesewas))
  const remaining = Math.max(0, total - paid)
  if (remaining <= 0) throw new QuoteError('nothing_due')

  let share: number
  switch (input.mode) {
    case 'full':
      share = remaining
      break
    case 'even':
    case 'invite': {
      const people = Math.max(2, Math.trunc(input.people ?? 2))
      share = Math.round(remaining / people)
      break
    }
    case 'custom':
      share = Math.trunc(input.customAmountPesewas ?? 0)
      break
    default:
      throw new QuoteError('invalid_mode')
  }

  if (share <= 0) throw new QuoteError('zero_value')
  if (share > remaining) throw new QuoteError('overpay')

  let tip = 0
  if (typeof input.tipPesewas === 'number') tip = Math.max(0, Math.trunc(input.tipPesewas))
  else if (typeof input.tipPercent === 'number') tip = Math.max(0, Math.round((share * input.tipPercent) / 100))

  const grand = share + tip
  if (grand <= 0) throw new QuoteError('zero_value')

  return {
    billTotalPesewas: total,
    remainingPesewas: remaining,
    sharePesewas: share,
    tipPesewas: tip,
    grandTotalPesewas: grand,
  }
}
