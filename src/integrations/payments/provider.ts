import { supabaseAdmin } from '@/integrations/supabase/client.server'

const enc = new TextEncoder()

// ── Provider adapter ──────────────────────────────────────────────────────────
// The whole payment layer talks to this interface, never to a gateway directly.
// MockPaymentProvider drives the demo; PaystackProvider is the real Ghana gateway.
// Selection is by env: set PAYSTACK_SECRET_KEY and the real provider is used.

export interface InitiateInput {
  paymentAttemptId: string        // our attempt id — also used as the Paystack reference
  provider: string                // 'momo' | 'card'
  method?: string
  totalPesewas: number            // GHS subunit — Paystack's `amount` is the same unit
  email?: string                  // Paystack requires an email; a guest placeholder is fine
  phone?: string                  // MoMo number (transaction-only, never persisted)
  momoProvider?: string           // 'mtn' | 'vod' | 'atl' (derived from the number if absent)
  callbackUrl?: string            // where Paystack returns the diner after the hosted card page
}
export type InitiateAction = 'phone_approval' | 'redirect' | 'otp' | 'none'
export interface InitiateResult {
  providerRef: string
  status: 'pending'
  action: InitiateAction
  displayText?: string            // MoMo: instruction to show ("Approve on your phone")
  redirectUrl?: string            // card: Paystack hosted page URL
}
export interface PaymentProvider {
  initiate(input: InitiateInput): Promise<InitiateResult>
}

// ── Mobile-money network inference (Ghana MSISDN prefixes) ────────────────────
// Lets the diner just type their number — no network picker needed on the locked UI.
export function momoProviderFromNumber(phone?: string): 'mtn' | 'vod' | 'atl' {
  const d = (phone ?? '').replace(/\D/g, '')
  const local = d.startsWith('233') ? '0' + d.slice(3) : d.startsWith('0') ? d : '0' + d
  const p = local.slice(0, 3)
  if (['024', '025', '053', '054', '055', '059'].includes(p)) return 'mtn'
  if (['020', '050'].includes(p)) return 'vod'            // Telecel (ex-Vodafone)
  if (['026', '027', '056', '057'].includes(p)) return 'atl' // AirtelTigo
  return 'mtn'
}

// ── Mock provider (demo / local) ──────────────────────────────────────────────
export class MockPaymentProvider implements PaymentProvider {
  async initiate(input: InitiateInput): Promise<InitiateResult> {
    return {
      providerRef: `mock_${input.paymentAttemptId}`,
      status: 'pending',
      action: input.provider === 'card' ? 'none' : 'phone_approval',
      displayText: 'Demo — approve the prompt to complete',
    }
  }
}

// ── Paystack provider (real, Ghana) ───────────────────────────────────────────
const PAYSTACK_BASE = 'https://api.paystack.co'
function paystackSecret(): string {
  const k = process.env['PAYSTACK_SECRET_KEY']
  if (!k) throw new Error('PAYSTACK_SECRET_KEY is not set')
  return k
}
async function paystackPost(path: string, body: unknown): Promise<any> {
  const res = await fetch(`${PAYSTACK_BASE}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${paystackSecret()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json().catch(() => ({}))
}

export class PaystackProvider implements PaymentProvider {
  async initiate(input: InitiateInput): Promise<InitiateResult> {
    const reference = input.paymentAttemptId
    const email = input.email || `guest-${reference}@guests.kozopay.app`
    const amount = String(Math.trunc(input.totalPesewas)) // GHS subunit == pesewas

    if (input.provider === 'card') {
      // PCI-safe: never handle the PAN ourselves. Paystack hosts card entry + 3DS/OTP.
      const r = await paystackPost('/transaction/initialize', {
        email, amount, currency: 'GHS', reference, channels: ['card'],
        callback_url: input.callbackUrl,
      })
      const url = r?.data?.authorization_url
      if (!r?.status || !url) throw new Error(r?.message || 'paystack_init_failed')
      return { providerRef: r.data.reference || reference, status: 'pending', action: 'redirect', redirectUrl: url }
    }

    // Mobile money: try the direct charge first — the diner approves the prompt on their own phone.
    if (input.phone) {
      const r = await paystackPost('/charge', {
        email, amount, currency: 'GHS', reference,
        mobile_money: { phone: input.phone, provider: input.momoProvider || momoProviderFromNumber(input.phone) },
      })
      if (r?.status) {
        const st = r?.data?.status
        const action: InitiateAction = st === 'send_otp' ? 'otp' : 'phone_approval'
        return { providerRef: r?.data?.reference || reference, status: 'pending', action, displayText: r?.data?.display_text }
      }
      // Direct charge unavailable (account/channel/test-mode restrictions) → fall through
      // to Paystack's hosted mobile-money checkout so the diner can still pay.
    }

    // Hosted mobile-money checkout. The reference is suffixed because Paystack burns a
    // reference once a charge has been attempted against it.
    const hostedRef = input.phone ? `${reference}-hc` : reference
    const h = await paystackPost('/transaction/initialize', {
      email, amount, currency: 'GHS', reference: hostedRef,
      channels: ['mobile_money'], callback_url: input.callbackUrl,
      metadata: { attempt: reference },
    })
    const hostedUrl = h?.data?.authorization_url
    if (!h?.status || !hostedUrl) throw new Error(h?.message || 'paystack_charge_failed')
    return { providerRef: h?.data?.reference || hostedRef, status: 'pending', action: 'redirect', redirectUrl: hostedUrl }
  }
}

// Lazily pick the provider so the env is read at call time (inside a server handler).
let _pp: PaymentProvider | undefined
export const paymentProvider: PaymentProvider = {
  initiate: (input) => {
    if (!_pp) _pp = process.env['PAYSTACK_SECRET_KEY'] ? new PaystackProvider() : new MockPaymentProvider()
    return _pp.initiate(input)
  },
}

// ── Paystack post-init helpers (verify, OTP, webhook signature) ───────────────
// Verify is authoritative: it asks Paystack the real status of a reference.
export async function verifyPaystackTransaction(reference: string): Promise<'captured' | 'failed' | 'pending'> {
  const res = await fetch(`${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${paystackSecret()}` },
  })
  const r = await res.json().catch(() => ({}))
  const st = r?.data?.status
  if (st === 'success') return 'captured'
  if (st === 'failed' || st === 'abandoned' || st === 'reversed') return 'failed'
  return 'pending'
}

// For MoMo transactions that come back as send_otp.
export async function submitPaystackOtp(reference: string, otp: string): Promise<any> {
  return paystackPost('/charge/submit_otp', { reference, otp })
}

// Paystack signs every webhook: HMAC-SHA512 of the raw body with the SECRET KEY.
export async function verifyPaystackSignature(rawBody: string, header: string | null): Promise<boolean> {
  if (!header) return false
  const key = await crypto.subtle.importKey('raw', enc.encode(paystackSecret()), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(rawBody))
  const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
  if (hex.length !== header.length) return false
  let diff = 0
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ header.charCodeAt(i)
  return diff === 0
}

export function isPaystackEnabled(): boolean {
  return !!process.env['PAYSTACK_SECRET_KEY']
}

// ── Mock webhook signing (demo path only; unrelated to Paystack) ──────────────
function webhookSecret(): string {
  return process.env['PAYMENT_WEBHOOK_SECRET'] || 'dev_webhook_secret_change_me'
}
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

// ── Capture (shared by every provider) ────────────────────────────────────────
// Sum of captured payments toward a bill (remaining-balance math).
export async function amountPaidForBill(billId: string): Promise<number> {
  const { data } = await supabaseAdmin.from('payment_attempts').select('amount_pesewas').eq('bill_id', billId).eq('status', 'captured')
  return (data ?? []).reduce((s: number, r: { amount_pesewas: number | null }) => s + (r.amount_pesewas ?? 0), 0)
}

// Authoritative capture. Idempotent by provider_ref — a repeat callback never double-applies.
export async function applyProviderCallback(providerRef: string, outcome: 'captured' | 'failed', failureReason?: string) {
  const { data: attempt } = await supabaseAdmin
    .from('payment_attempts').select('id,status,session_id,bill_id,amount_pesewas,split_share_id').eq('provider_ref', providerRef).maybeSingle()
  if (!attempt) return { ok: false as const, reason: 'unknown_ref' }
  if (attempt.status === 'captured' || attempt.status === 'failed')
    return { ok: true as const, idempotent: true, status: attempt.status }
  const status = outcome === 'captured' ? 'captured' : 'failed'
  await supabaseAdmin.from('payment_attempts')
    .update({ status, failure_reason: failureReason ?? null, updated_at: new Date().toISOString() }).eq('id', attempt.id)
  if (status === 'captured' && attempt.split_share_id) {
    await supabaseAdmin.from('bill_split_shares')
      .update({ status: 'paid', payment_attempt_id: attempt.id }).eq('id', attempt.split_share_id)
    const { data: share } = await supabaseAdmin.from('bill_split_shares')
      .select('split_id').eq('id', attempt.split_share_id).maybeSingle()
    if (share?.split_id) {
      const { data: shares } = await supabaseAdmin.from('bill_split_shares')
        .select('status').eq('split_id', share.split_id)
      if ((shares ?? []).length > 0 && (shares ?? []).every((x: any) => x.status === 'paid'))
        await supabaseAdmin.from('bill_splits').update({ status: 'settled' }).eq('id', share.split_id)
    }
  }
  if (status === 'captured' && attempt.bill_id) {
    const { data: bill } = await supabaseAdmin.from('bills').select('id,total_pesewas').eq('id', attempt.bill_id).maybeSingle()
    if (bill) {
      const paid = await amountPaidForBill(bill.id)
      if (paid >= bill.total_pesewas) {
        await supabaseAdmin.from('bills').update({ status: 'settled' }).eq('id', bill.id)
        await onBillSettled(bill.id, bill.total_pesewas)
      }
    }
  }
  await supabaseAdmin.from('audit_events').insert({ session_id: attempt.session_id, type: `payment.${status}`, data: { providerRef } })
  return { ok: true as const, status }
}



// ── On full payment: alert the floor and (if enabled) close the table on the POS ──
// Read-only-safe by default: the Odoo write only happens when the restaurant has
// writeback_enabled = true AND a Klown payment method configured.
export async function onBillSettled(billId: string, totalPesewas: number) {
  try {
    const { data: bill } = await supabaseAdmin.from('bills').select('table_id').eq('id', billId).maybeSingle()
    if (!bill?.table_id) return
    const { data: table } = await supabaseAdmin.from('restaurant_tables').select('label,branch_id').eq('id', bill.table_id).maybeSingle()
    if (!table) return
    const { data: branch } = await supabaseAdmin.from('branches').select('restaurant_id').eq('id', table.branch_id).maybeSingle()
    const restaurantId = branch?.restaurant_id
    if (!restaurantId) return

    // Floor alert (admin subscribes to this table via realtime).
    await supabaseAdmin.from('staff_notifications').insert({
      restaurant_id: restaurantId,
      table_label: table.label,
      kind: 'payment',
      amount_pesewas: totalPesewas,
      message: `Table ${table.label} paid via Klown`,
    })

    // Close the table on the POS, only if this restaurant opted in.
    // Odoo write-back (cloud POS: settle directly).
    const { data: creds } = await supabaseAdmin.from('pos_odoo_credentials')
      .select('base_url, db, username, api_key, active, writeback_enabled, klown_payment_method_id')
      .eq('restaurant_id', restaurantId).maybeSingle()
    if (creds?.active && creds.writeback_enabled && creds.klown_payment_method_id) {
      const { settleTableOrder } = await import('@/integrations/pos/odoo.server')
      const cfg = { base_url: creds.base_url, db: creds.db, username: creds.username || 'admin', api_key: creds.api_key }
      const num = parseInt(table.label, 10)
      const res = await settleTableOrder(cfg, creds.klown_payment_method_id, num, totalPesewas)
      if (!res.ok) {
        await supabaseAdmin.from('staff_notifications').insert({
          restaurant_id: restaurantId, table_label: table.label, kind: 'settle_warning',
          amount_pesewas: totalPesewas, message: `Auto-close skipped for table ${table.label} (${res.reason}) — settle on the POS`,
        })
      }
    }

    // On-prem connector write-back (e.g. SambaPOS): queue a settle command the connector executes.
    const { data: conn } = await supabaseAdmin.from('pos_connectors')
      .select('id, writeback_enabled, active').eq('restaurant_id', restaurantId).eq('active', true).maybeSingle()
    if (conn?.writeback_enabled) {
      await supabaseAdmin.from('pos_commands').insert({
        restaurant_id: restaurantId, kind: 'settle_ticket',
        payload: { table_label: table.label, amount_pesewas: totalPesewas, bill_id: billId },
      })
    }
  } catch (e) {
    // Never let settlement failure break payment capture; the money is already taken.
    try { await supabaseAdmin.from('audit_events').insert({ type: 'pos.settle_error', data: { billId, message: String(e) } }) } catch {}
  }
}
