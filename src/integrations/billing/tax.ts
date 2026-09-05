// Ghana regulatory levy breakdown for a VAT-INCLUSIVE amount.
//
// Restaurant prices are shown tax-inclusive. This decomposes an inclusive price
// into the statutory parts a GRA VAT invoice must show. Naxos applies:
//   NHIL 2.5%, GETFund 2.5%, VAT 15%, Tourism Levy 1%  — each on the NET
//   (VAT-exclusive) value, so net + the four levies sum EXACTLY to the price.
//   (Inclusive factor = 1 + (2.5+2.5+15+1)/100 = 1.21, matching the POS net.)
//
// Everything is in integer pesewas and allocated by largest remainder, so the
// five parts always add back to the exact inclusive total — no rounding drift.

export type TaxRates = { nhil: number; getfund: number; vat: number; tourism: number }

// Default (Ghana / Naxos). A restaurant could override these later.
export const GH_TAX_RATES: TaxRates = { nhil: 2.5, getfund: 2.5, vat: 15, tourism: 1 }

export type TaxBreakdown = {
  net: number; nhil: number; getfund: number; vat: number; tourism: number
  total: number; rates: TaxRates
}

// Largest-remainder split of `total` across integer weights (parts sum to total).
function allocate(total: number, weights: number[]): number[] {
  const sumW = weights.reduce((s, w) => s + w, 0)
  if (sumW <= 0) return weights.map(() => 0)
  const exact = weights.map((w) => (total * w) / sumW)
  const base = exact.map((v) => Math.floor(v))
  let leftover = total - base.reduce((s, v) => s + v, 0)
  const order = exact.map((v, i) => ({ i, frac: v - Math.floor(v) })).sort((a, b) => (b.frac - a.frac) || (a.i - b.i))
  for (let k = 0; k < order.length && leftover > 0; k++, leftover--) base[order[k]!.i] = (base[order[k]!.i] ?? 0) + 1
  return base
}

export function taxBreakdown(inclusivePesewas: number, rates: TaxRates = GH_TAX_RATES): TaxBreakdown {
  const total = Math.max(0, Math.round(inclusivePesewas || 0))
  // Weights: net=100 plus each levy rate. ×2 turns 2.5 into an integer weight.
  const w = [100, rates.nhil, rates.getfund, rates.vat, rates.tourism].map((x) => Math.round(x * 2))
  const [net, nhil, getfund, vat, tourism] = allocate(total, w)
  return { net: net!, nhil: nhil!, getfund: getfund!, vat: vat!, tourism: tourism!, total, rates }
}
