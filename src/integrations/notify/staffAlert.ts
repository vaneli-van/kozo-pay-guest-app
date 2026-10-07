// Floor-staff payment SMS: who gets told, and what the text says. Pure functions, unit-tested in
// tests/money/staffalert.spec.ts. The send itself is in payments/provider.ts (notifyStaffPayment).
//
// Who: the waiter whose order it is, plus every active cashier. Klown only knows the waiter's first
// name (bills.server_name comes from the Odoo employee on the order, first name only), so the match
// is on first name, case-insensitive. If nobody matches, only the cashiers are texted; the waiter's
// name is still in the message so the cashier knows whose table it was.

export interface StaffRow { name: string; role: string; phone: string | null; active?: boolean | null }

export function firstName(name: string | null | undefined): string {
  return String(name ?? '').trim().split(/\s+/)[0]?.toLowerCase() ?? ''
}

export function pickStaffRecipients(staff: StaffRow[], serverName: string | null | undefined): { phones: string[]; waiter: StaffRow | null } {
  const live = staff.filter((s) => s.active !== false && s.phone)
  const fn = firstName(serverName)
  const waiters = fn ? live.filter((s) => s.role === 'waiter' && firstName(s.name) === fn) : []
  const cashiers = live.filter((s) => s.role === 'cashier')
  const phones = Array.from(new Set([...waiters, ...cashiers].map((s) => s.phone as string)))
  return { phones, waiter: waiters[0] ?? null }
}

export interface StaffAlertInput {
  tableLabel: string
  tabLabel?: string | null
  serverName?: string | null
  full: boolean
  amountPesewas: number        // this payment, excluding tip
  tipPesewas?: number | null
  paidPesewas: number          // total captured on the bill so far, including this payment
  totalPesewas: number         // the bill
  channel?: string | null      // 'momo' | 'card' | ...
}

const ghs = (p: number) => `GHS ${(Math.max(0, p) / 100).toFixed(2)}`

// "08" -> "8"; "A3" stays.
export function tableNo(label: string): string {
  const t = String(label ?? '').trim()
  return /^\d+$/.test(t) ? String(parseInt(t, 10)) : t
}

export function channelWord(channel: string | null | undefined): string {
  const c = String(channel ?? '').toLowerCase()
  if (c.includes('momo') || c.includes('mobile')) return 'MoMo'
  if (c.includes('card')) return 'card'
  return ''
}

// Kept short: one SMS segment where possible. Examples:
//   Klown: Table 8 (Ama) PAID IN FULL GHS 120.00 by MoMo via Paystack. Waiter: Joel. Tip GHS 10.00.
//   Klown: Table 8 PAID IN FULL GHS 120.00 via Paystack (final part GHS 40.00). Waiter: Joel.
//   Klown: Table 8 PART PAYMENT GHS 50.00 of GHS 120.00 via Paystack. GHS 70.00 still to pay. Waiter: Joel.
export function staffPaymentMessage(i: StaffAlertInput): string {
  const where = `Table ${tableNo(i.tableLabel)}${i.tabLabel ? ` (${i.tabLabel})` : ''}`
  const by = channelWord(i.channel)
  const via = `${by ? `by ${by} ` : ''}via Paystack`
  const waiter = i.serverName ? ` Waiter: ${String(i.serverName).trim()}.` : ''
  const tip = i.tipPesewas && i.tipPesewas > 0 ? ` Tip ${ghs(i.tipPesewas)}.` : ''
  if (i.full) {
    // A bill closed by its last split share: lead with the bill total, then the final part.
    const part = i.paidPesewas > i.amountPesewas ? ` (final part ${ghs(i.amountPesewas)})` : ''
    return `Klown: ${where} PAID IN FULL ${ghs(Math.max(i.totalPesewas, i.amountPesewas))} ${via}${part}.${waiter}${tip}`
  }
  const left = Math.max(0, i.totalPesewas - i.paidPesewas)
  return `Klown: ${where} PART PAYMENT ${ghs(i.amountPesewas)} of ${ghs(i.totalPesewas)} ${via}. ${ghs(left)} still to pay.${waiter}${tip}`
}
