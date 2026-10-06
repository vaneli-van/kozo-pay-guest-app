// One-round-trip payment context + atomic reservation (Postgres: payment_context / payment_reserve).
// Before this, payment-init made ~15 sequential Supabase calls (session, bill, items, restaurant
// via table -> branch -> restaurant twice, paid, share, recompute, split config...) — 3 to 5 s
// before the MoMo prompt. Now: one read, one reserve, then the gateway call.
import { supabaseAdmin } from '@/integrations/supabase/client.server'
import type { PayMode } from '@/integrations/payments/provider'

export interface PaymentContext {
  ok: true
  sessionId: string
  tableId: string | null
  registerId: string | null
  bill: { id: string; totalPesewas: number; status: string }
  restaurantId: string | null
  payMode: PayMode
  splitConfig: { subaccountCode: string; klownFeeBps: number } | null
  paidPesewas: number
  pendingOthersPesewas: number
  share: { id: string; amountPesewas: number; status: string; splitMode: 'even' | 'amounts' | 'items' } | null
}
export interface ExistingAttempt {
  paymentRef: string; status: string; providerRef: string | null
  amountPesewas: number; tipPesewas: number; totalPesewas: number
}
export type ContextResult =
  | PaymentContext
  | { ok: true; sessionId: string; existing: ExistingAttempt }
  | { ok: false; reason: string; sessionId?: string; tableId?: string | null; registerId?: string | null }

export async function paymentContext(args: { sessionToken: string; shareId?: string; idempotencyKey?: string; billId?: string }): Promise<ContextResult> {
  const { data, error } = await supabaseAdmin.rpc('payment_context' as any, {
    p_session_token: args.sessionToken,
    p_share_id: args.shareId ?? null,
    p_idem: args.idempotencyKey ?? null,
    p_bill_id: args.billId ?? null,
  } as any)
  if (error) throw new Error(error.message)
  return (data ?? { ok: false, reason: 'error' }) as ContextResult
}

export type ReserveResult =
  | { ok: true; paymentRef: string; status: string; idempotent?: boolean; providerRef?: string | null; amountPesewas?: number; tipPesewas?: number; totalPesewas?: number }
  | { ok: false; reason: string; pendingPesewas?: number; remainingPesewas?: number }

export async function reservePayment(a: {
  sessionId: string; billId: string; idempotencyKey: string; shareId: string | null; shareMode: string
  amountPesewas: number; tipPesewas: number; totalPesewas: number; provider: string; method: string | null
  payMode: PayMode; chargedPesewas: number; transactionChargePesewas: number | null
}): Promise<ReserveResult> {
  const { data, error } = await supabaseAdmin.rpc('payment_reserve' as any, {
    p_session_id: a.sessionId, p_bill_id: a.billId, p_idem: a.idempotencyKey, p_share_id: a.shareId,
    p_share_mode: a.shareMode, p_amount: a.amountPesewas, p_tip: a.tipPesewas, p_total: a.totalPesewas,
    p_provider: a.provider, p_method: a.method, p_pay_mode: a.payMode,
    p_charged: a.chargedPesewas, p_transaction_charge: a.transactionChargePesewas,
  } as any)
  if (error) throw new Error(error.message)
  return (data ?? { ok: false, reason: 'error' }) as ReserveResult
}

// Plain-language messages for the reasons a diner can actually hit.
export const PAYMENT_REASON_MESSAGE: Record<string, string> = {
  payment_in_progress: 'Someone at your table is paying right now. If their payment was cancelled, try again in a few minutes.',
  share_being_paid: 'Someone else is paying this share right now. Pick another share, or try again in a few minutes.',
  share_paid: 'This share has already been paid.',
  nothing_due: 'This bill has already been paid in full.',
  overpay: 'That is more than what is left on the bill.',
  no_bill: 'There is no open bill for this table.',
  invalid_share: 'That share is no longer available. Go back to the split and pick again.',
}
