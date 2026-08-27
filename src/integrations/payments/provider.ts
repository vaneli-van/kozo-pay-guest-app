import { supabaseAdmin } from '@/integrations/supabase/client.server'

export interface InitiateInput { paymentAttemptId: string; provider: string; method?: string; totalPesewas: number }
export interface InitiateResult { providerRef: string; status: 'pending' }
export interface PaymentProvider { initiate(input: InitiateInput): Promise<InitiateResult> }

// Mock provider. A real MoMo/card adapter (Paystack, Hubtel, Flutterwave, …) pushes the prompt /
// redirect to the provider and returns its own reference; capture then arrives via signed webhook.
export class MockPaymentProvider implements PaymentProvider {
  async initiate(input: InitiateInput): Promise<InitiateResult> {
    return { providerRef: `mock_${input.paymentAttemptId}`, status: 'pending' }
  }
}
export const paymentProvider: PaymentProvider = new MockPaymentProvider()

function webhookSecret(): string {
  return process.env['PAYMENT_WEBHOOK_SECRET'] || 'dev_webhook_secret_change_me'
}
const enc = new TextEncoder()
async function hmacHex(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(webhookSecret()), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
export async function signCallback(providerRef: string, outcome: string): Promise<string> {
  return hmacHex(`${providerRef}:${outcome}`)
}
export async function verifyCallback(providerRef: string, outcome: string, signature: string): Promise<boolean> {
  const expected = await hmacHex(`${providerRef}:${outcome}`)
  if (!signature || expected.length !== signature.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i)
  return diff === 0
}

// Sum of captured payments toward a bill (remaining-balance math).
export async function amountPaidForBill(billId: string): Promise<number> {
  const { data } = await supabaseAdmin.from('payment_attempts').select('amount_pesewas').eq('bill_id', billId).eq('status', 'captured')
  return (data ?? []).reduce((s: number, r: { amount_pesewas: number | null }) => s + (r.amount_pesewas ?? 0), 0)
}

// Authoritative capture. Idempotent by provider_ref — a repeat callback never double-applies.
export async function applyProviderCallback(providerRef: string, outcome: 'captured' | 'failed', failureReason?: string) {
  const { data: attempt } = await supabaseAdmin
    .from('payment_attempts').select('id,status,session_id,bill_id,amount_pesewas').eq('provider_ref', providerRef).maybeSingle()
  if (!attempt) return { ok: false as const, reason: 'unknown_ref' }
  if (attempt.status === 'captured' || attempt.status === 'failed')
    return { ok: true as const, idempotent: true, status: attempt.status }
  const status = outcome === 'captured' ? 'captured' : 'failed'
  await supabaseAdmin.from('payment_attempts')
    .update({ status, failure_reason: failureReason ?? null, updated_at: new Date().toISOString() }).eq('id', attempt.id)
  if (status === 'captured' && attempt.bill_id) {
    const { data: bill } = await supabaseAdmin.from('bills').select('id,total_pesewas').eq('id', attempt.bill_id).maybeSingle()
    if (bill) {
      const paid = await amountPaidForBill(bill.id)
      if (paid >= bill.total_pesewas) await supabaseAdmin.from('bills').update({ status: 'settled' }).eq('id', bill.id)
    }
  }
  await supabaseAdmin.from('audit_events').insert({ session_id: attempt.session_id, type: `payment.${status}`, data: { providerRef } })
  return { ok: true as const, status }
}
