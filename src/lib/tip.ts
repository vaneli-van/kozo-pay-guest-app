// Tip selection shared by the checkout screens. A diner picks a preset percentage or types
// a custom cedi amount; the custom amount wins whenever it is set. The server recomputes
// the tip from the same inputs (integrations/billing/calc.ts), so these helpers only shape
// what the diner sees before the quote comes back.

export const DEFAULT_TIP_PERCENT = 10
export const TIP_PRESETS = [10, 12.5, 15]
// Fat-finger guard for the custom field, in pesewas (GHS 1,000). The server does not cap.
export const MAX_CUSTOM_TIP_PESEWAS = 100_000

export type TipState = { tipPercent?: number | undefined; tipCustomPesewas?: number | undefined; tip?: number | undefined }

export function isCustomTip(s: TipState | null | undefined): boolean {
  return typeof s?.tipCustomPesewas === 'number' && Number.isFinite(s.tipCustomPesewas)
}

export function tipPercentOf(s: TipState | null | undefined): number {
  return s?.tipPercent ?? s?.tip ?? DEFAULT_TIP_PERCENT
}

/** Tip in pesewas for a given share, mirroring the server's rounding. */
export function tipPesewasFor(s: TipState | null | undefined, sharePesewas: number): number {
  if (isCustomTip(s)) return Math.max(0, Math.trunc(s!.tipCustomPesewas as number))
  return Math.max(0, Math.round((sharePesewas * tipPercentOf(s)) / 100))
}

/** "10%", "12.5%" or "custom" for summary rows. */
export function tipLabel(s: TipState | null | undefined): string {
  if (isCustomTip(s)) return 'custom'
  return `${tipPercentOf(s)}%`
}

/** What the quote and payment-init endpoints need: a fixed amount when custom, else a percent. */
export function tipRequestFields(s: TipState | null | undefined, preTip: boolean): { tipPesewas?: number; tipPercent?: number } {
  if (preTip) return { tipPercent: 0 }
  if (isCustomTip(s)) return { tipPesewas: Math.max(0, Math.trunc(s!.tipCustomPesewas as number)) }
  return { tipPercent: tipPercentOf(s) }
}

/** "12", "12.5", "12,50", "GHS 12.50" -> 1250. Empty or junk -> null. Capped at MAX_CUSTOM_TIP_PESEWAS. */
export function parseCediInput(raw: string): number | null {
  const cleaned = (raw ?? '').replace(/[^\d.,]/g, '').replace(',', '.')
  if (!cleaned || cleaned === '.') return null
  const n = Number(cleaned)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.min(MAX_CUSTOM_TIP_PESEWAS, Math.round(n * 100))
}
