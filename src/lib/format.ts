// Cedis with thousands separators and two decimals: GH₵12,641.00. Same grouping as the Money
// component (ui/kz.tsx), so a total reads the same in a list, a button and the bill hero.
export const money = (n: number) =>
  `GH₵${(Number.isFinite(n) ? n : 0).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
