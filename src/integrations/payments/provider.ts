import { supabaseAdmin } from '@/integrations/supabase/client.server'

const enc = new TextEncoder()

// ── Provider adapter ──────────────────────────────────────────────────────────
// The whole payment layer talks to this interface, never to a gateway directly.
// MockPaymentProvider drives the demo; PaystackProvider is the real Ghana gateway.
// Selection is by env: set PAYSTACK_SECRET_KEY and the real provider is used.

// Which Paystack key a payment runs on. 'live' = PAYSTACK_SECRET_KEY (real money);
// 'test' = PAYSTACK_TEST_SECRET_KEY (Paystack test cards / test MoMo, no money moves).
// Decided per restaurant (restaurants.payment_mode) and stamped on the attempt, so every
// later call for that attempt (verify, OTP, webhook) uses the same key.
export type PayMode = 'live' | 'test'

export interface InitiateInput {
  paymentAttemptId: string        // our attempt id — also used as the Paystack reference
  mode?: PayMode                  // defaults to 'live'
  provider: string                // 'momo' | 'card'
  method?: string
  totalPesewas: number            // GHS subunit — Paystack's `amount` is the same unit
  email?: string                  // Paystack requires an email; a guest placeholder is fine
  phone?: string                  // MoMo number (transaction-only, never persisted)
  momoProvider?: string           // 'mtn' | 'vod' | 'atl' (derived from the number if absent)
  callbackUrl?: string            // where Paystack returns the diner after the hosted card page
  // -- Transaction split (direct-to-restaurant settlement) --
  // When `subaccount` is set, `totalPesewas` is the grossed-up charge (T); the
  // subaccount receives (T - transactionChargePesewas) and Klown's main account
  // keeps transactionChargePesewas. Absent -> single-account collection (unchanged).
  subaccount?: string                 // Paystack subaccount code (ACCT_...)
  transactionChargePesewas?: number   // flat amount routed to Klown's main account (= T - B)
  bearer?: 'account' | 'subaccount'   // who bears the Paystack fee; 'account' = Klown main
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

// True on the staging deployment. Staging only ever charges test-mode restaurants.
export function isStaging(): boolean {
  return (process.env['KLOWN_ENV'] || '').toLowerCase() === 'staging'
}

// Lovable's preview (the unpublished build every push lands on) runs with the SAME secrets as
// live, so it is recognised by host instead: id-preview--…/preview--… on lovable.app, the
// *.lovableproject.com sandbox, and localhost. Requests there are treated as staging, so a
// change can be tried end to end on the preview without ever charging a real restaurant.
export function isStagingHost(host: string | null | undefined): boolean {
  const h = (host || '').toLowerCase().split(':')[0] || ''
  return h.startsWith('id-preview--') || h.startsWith('preview--') || h.endsWith('.lovableproject.com')
    || h === 'localhost' || h === '127.0.0.1'
}
export function isStagingRequest(request: Request): boolean {
  if (isStaging()) return true
  try { return isStagingHost(new URL(request.url).host) } catch { return false }
}

function keyFor(mode: PayMode): string | undefined {
  const k = mode === 'test' ? process.env['PAYSTACK_TEST_SECRET_KEY'] : process.env['PAYSTACK_SECRET_KEY']
  return k && k.trim() ? k.trim() : undefined
}

// Secret for a mode, with guards so a misconfigured key can never move real money in
// test mode, or charge real money from the staging deployment.
export function paystackSecret(mode: PayMode = 'live'): string {
  const k = keyFor(mode)
  if (!k) throw new Error(mode === 'test' ? 'PAYSTACK_TEST_SECRET_KEY is not set' : 'PAYSTACK_SECRET_KEY is not set')
  if (mode === 'test' && !k.startsWith('sk_test_')) throw new Error('PAYSTACK_TEST_SECRET_KEY must be a sk_test_ key')
  if (mode === 'live' && isStaging()) throw new Error('live_payments_disabled_on_staging')
  return k
}
async function paystackPost(path: string, body: unknown, mode: PayMode = 'live'): Promise<any> {
  const res = await fetch(`${PAYSTACK_BASE}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${paystackSecret(mode)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json().catch(() => ({}))
}

export class PaystackProvider implements PaymentProvider {
  async initiate(input: InitiateInput): Promise<InitiateResult> {
    const reference = input.paymentAttemptId
    const mode: PayMode = input.mode ?? 'live'
    const email = input.email || `guest-${reference}@guests.kozopay.app`
    const amount = String(Math.trunc(input.totalPesewas)) // GHS subunit == pesewas

    // Transaction-split fields, only when the restaurant has a subaccount configured.
    // Kept as a spreadable fragment so the single-account path is byte-for-byte unchanged.
    const split = input.subaccount
      ? {
          subaccount: input.subaccount,
          transaction_charge: Math.max(0, Math.trunc(input.transactionChargePesewas ?? 0)),
          bearer: input.bearer ?? 'account',
        }
      : {}

    if (input.provider === 'card') {
      // PCI-safe: never handle the PAN ourselves. Paystack hosts card entry + 3DS/OTP.
      const r = await paystackPost('/transaction/initialize', {
        email, amount, currency: 'GHS', reference, channels: input.method === 'applepay' ? ['apple_pay'] : ['card', 'apple_pay'],
        callback_url: input.callbackUrl,
        ...split,
      }, mode)
      const url = r?.data?.authorization_url
      if (!r?.status || !url) throw new Error(r?.message || 'paystack_init_failed')
      return { providerRef: r.data.reference || reference, status: 'pending', action: 'redirect', redirectUrl: url }
    }

    // Mobile money: try the direct charge first — the diner approves the prompt on their own phone.
    if (input.phone) {
      const r = await paystackPost('/charge', {
        email, amount, currency: 'GHS', reference,
        mobile_money: { phone: input.phone, provider: input.momoProvider || momoProviderFromNumber(input.phone) },
        ...split,
      }, mode)
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
      ...split,
    }, mode)
    const hostedUrl = h?.data?.authorization_url
    if (!h?.status || !hostedUrl) throw new Error(h?.message || 'paystack_charge_failed')
    return { providerRef: h?.data?.reference || hostedRef, status: 'pending', action: 'redirect', redirectUrl: hostedUrl }
  }
}

// Pick the provider per call so the env is read at call time (inside a server handler).
// Test mode never falls back to the mock: no test key means the payment is refused, so a
// test restaurant can't silently "pay" without Paystack. Live mode keeps the old demo
// fallback (no key -> mock) except on staging, where live payments are refused outright.
const paystack = new PaystackProvider()
const mock = new MockPaymentProvider()
export const paymentProvider: PaymentProvider = {
  initiate: (input) => {
    const mode: PayMode = input.mode ?? 'live'
    if (mode === 'test') { paystackSecret('test'); return paystack.initiate(input) }
    if (isStaging()) throw new Error('live_payments_disabled_on_staging')
    return keyFor('live') ? paystack.initiate(input) : mock.initiate(input)
  },
}

// ── Paystack post-init helpers (verify, OTP, webhook signature) ───────────────
// Verify is authoritative: it asks Paystack the real status of a reference.
export type VerifyResult = { outcome: 'captured' | 'failed' | 'pending'; reason?: string }
export async function verifyPaystackTransaction(reference: string, mode: PayMode = 'live'): Promise<VerifyResult> {
  const res = await fetch(`${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${paystackSecret(mode)}` },
  })
  const r = await res.json().catch(() => ({}))
  const st = r?.data?.status
  const reason = r?.data?.gateway_response || r?.data?.message || r?.message || undefined
  if (st === 'success') return { outcome: 'captured' }
  if (st === 'failed' || st === 'abandoned' || st === 'reversed') return { outcome: 'failed', reason: reason || st }
  return { outcome: 'pending' }
}

// For MoMo transactions that come back as send_otp.
export async function submitPaystackOtp(reference: string, otp: string, mode: PayMode = 'live'): Promise<any> {
  return paystackPost('/charge/submit_otp', { reference, otp }, mode)
}

// Paystack signs every webhook: HMAC-SHA512 of the raw body with the SECRET KEY of the
// mode the event belongs to (test events are signed with the test key). Returns the mode
// whose key produced the signature, or null. The caller must only apply the event to an
// attempt of that same mode.
async function hmac512Matches(secret: string, rawBody: string, header: string): Promise<boolean> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(rawBody))
  const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
  if (hex.length !== header.length) return false
  let diff = 0
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ header.charCodeAt(i)
  return diff === 0
}
export async function verifyPaystackSignature(rawBody: string, header: string | null): Promise<PayMode | null> {
  if (!header) return null
  const live = keyFor('live')
  if (live && !isStaging() && await hmac512Matches(live, rawBody, header)) return 'live'
  const test = keyFor('test')
  if (test && test.startsWith('sk_test_') && await hmac512Matches(test, rawBody, header)) return 'test'
  return null
}

// Can we talk to Paystack for this mode? (live without a key = demo/mock mode)
export function isPaystackEnabled(mode: PayMode = 'live'): boolean {
  if (mode === 'live' && isStaging()) return false
  return !!keyFor(mode)
}

// Payment mode of the restaurant that owns a bill ('live' when unknown).
export async function paymentModeForBill(billId: string): Promise<PayMode> {
  const { resolveRestaurantForBill } = await import('@/integrations/payments/split.server')
  const rid = await resolveRestaurantForBill(billId)
  if (!rid) return 'live'
  const { data } = await supabaseAdmin.from('restaurants').select('payment_mode').eq('id', rid).maybeSingle()
  return (data as any)?.payment_mode === 'test' ? 'test' : 'live'
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
// `via` says how the outcome was established and is checked against the attempt:
//   'live' / 'test' = confirmed by Paystack with that mode's key (verify call or signed webhook);
//   'mock'          = the demo flow, only ever valid for attempts the mock provider created.
// So a demo "approve" can never settle a real Paystack payment, and a test-mode event can
// never settle a live one.
export type CallbackVia = PayMode | 'mock'
export async function applyProviderCallback(providerRef: string, outcome: 'captured' | 'failed', failureReason: string | undefined, via: CallbackVia) {
  const { data: attempt } = await supabaseAdmin
    .from('payment_attempts').select('id,status,session_id,bill_id,amount_pesewas,split_share_id,payment_mode').eq('provider_ref', providerRef).maybeSingle()
  if (!attempt) return { ok: false as const, reason: 'unknown_ref' }
  const isMockRef = providerRef.startsWith('mock_')
  const attemptMode: PayMode = (attempt as any).payment_mode === 'test' ? 'test' : 'live'
  if (via === 'mock' ? !isMockRef : (isMockRef || via !== attemptMode))
    return { ok: false as const, reason: 'channel_mismatch' }
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
        await supabaseAdmin.from('bill_splits').update({ status: 'settled' }).eq('bill_id', bill.id).eq('status', 'open')
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
// Owner payment SMS (Arkesel). Best-effort: never throws into the settle path.
async function notifyOwnerPaid(restaurantId: string, label: string, totalPesewas: number, billId: string) {
  try {
    const { data: r } = await supabaseAdmin.from('restaurants').select('name, notify_phones').eq('id', restaurantId).maybeSingle()
    const { parsePhoneList, sendSms } = await import('@/integrations/notify/arkesel.server')
    const phones = parsePhoneList((r as any)?.notify_phones)
    if (!phones.length) return
    const { data: items } = await supabaseAdmin.from('bill_items').select('name, qty').eq('bill_id', billId).order('sort')
    const list = (items ?? []).map((i: any) => `${i.qty}x ${i.name}`)
    const shown = list.slice(0, 6).join(', ')
    const more = list.length > 6 ? ` (+${list.length - 6} more)` : ''
    const amt = (totalPesewas / 100).toFixed(2)
    const name = (r as any)?.name || 'your restaurant'
    const msg = `Klown: ${label} paid GHS ${amt} at ${name}.` + (shown ? ` Items: ${shown}${more}.` : '')
    await sendSms(phones, msg)
  } catch { /* SMS is best-effort */ }
}

export async function onBillSettled(billId: string, totalPesewas: number) {
  try {
    const { data: bill } = await supabaseAdmin.from('bills')
      .select('table_id, register_id, restaurant_id, odoo_pos_config_id, odoo_order_id, odoo_session_id')
      .eq('id', billId).maybeSingle()

    // ── QSR counter (Model A): order was already paid under the Klown tender in Odoo. ──
    // No POS write-back — just record the collection (idempotent) and alert the owner.
    if (bill?.register_id && bill?.odoo_order_id && bill?.restaurant_id) {
      const { data: regRow } = await supabaseAdmin.from('pos_registers').select('name').eq('id', bill.register_id).maybeSingle()
      const regName = regRow?.name ?? 'Counter'
      const { error: ledgerErr } = await supabaseAdmin.from('klown_collected_orders').insert({
        restaurant_id: bill.restaurant_id, register_id: bill.register_id,
        odoo_pos_config_id: bill.odoo_pos_config_id as number, odoo_session_id: bill.odoo_session_id as number,
        odoo_order_id: bill.odoo_order_id, amount_pesewas: totalPesewas,
      })
      // Unique(restaurant_id, odoo_order_id) makes a repeat capture a no-op; don't alert twice.
      if (!ledgerErr) {
        await supabaseAdmin.from('staff_notifications').insert({
          restaurant_id: bill.restaurant_id, table_label: regName, kind: 'payment',
          amount_pesewas: totalPesewas, message: `${regName} paid via Klown`,
        })
        await notifyOwnerPaid(bill.restaurant_id, regName, totalPesewas, billId)
      }
      return
    }

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
    await notifyOwnerPaid(restaurantId, `Table ${table.label}`, totalPesewas, billId)

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
