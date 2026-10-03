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

// One tax/levy line as shown on the bill and receipt. `rate` is a percentage or null when unknown.
export type TaxLine = { name: string; rate: number | null; amountPesewas: number }
export type BillTax = { net: number; total: number; lines: TaxLine[]; estimated: boolean }

// What the bill/receipt should show for taxes. Prefers the breakdown the POS reported for the
// bill (bills.tax_lines / tax_pesewas, written by the sync); otherwise falls back to the statutory
// Ghana decomposition of the inclusive amount, flagged `estimated` so the UI can say so.
export function billTax(inclusivePesewas: number, stored?: { tax_lines?: unknown; tax_pesewas?: number | null } | null): BillTax {
  const inclusive = Math.max(0, Math.round(inclusivePesewas || 0))
  const raw = stored?.tax_lines
  if (Array.isArray(raw) && raw.length) {
    const lines: TaxLine[] = raw
      .map((l: any) => ({ name: String(l?.name ?? 'Tax'), rate: typeof l?.rate === 'number' ? l.rate : null, amountPesewas: Math.round(Number(l?.amountPesewas ?? l?.amount_pesewas ?? 0)) }))
      .filter((l) => Number.isFinite(l.amountPesewas))
    const total = lines.reduce((s, l) => s + l.amountPesewas, 0)
    if (lines.length && total >= 0 && total <= inclusive) return { net: inclusive - total, total, lines, estimated: false }
  }
  const tb = taxBreakdown(inclusive)
  return {
    net: tb.net,
    total: tb.nhil + tb.getfund + tb.vat + tb.tourism,
    lines: [
      { name: `NHIL ${tb.rates.nhil}%`, rate: tb.rates.nhil, amountPesewas: tb.nhil },
      { name: `GETFund ${tb.rates.getfund}%`, rate: tb.rates.getfund, amountPesewas: tb.getfund },
      { name: `VAT ${tb.rates.vat}%`, rate: tb.rates.vat, amountPesewas: tb.vat },
      { name: `Tourism Levy ${tb.rates.tourism}%`, rate: tb.rates.tourism, amountPesewas: tb.tourism },
    ],
    estimated: true,
  }
}
