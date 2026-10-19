// Tips to the waiter, paid daily to their mobile money wallet (Baobab first).
//
// At payment time (payment-init): when the restaurant has tips_to_staff on, the payment is live,
// the restaurant settles through a Paystack subaccount and the bill's waiter (the one who opened
// the order on the POS) has an approved payout account, the tip is held back from the
// restaurant's share: transaction_charge grows by the tip, so the subaccount receives the bill
// without the tip and the tip stays in Klown's Paystack balance. The attempt records who the
// tip is for (tip_payout_account_id), fixed at that moment.
//
// Once a day (runTipPayouts, called by /api/sync/tip-payouts from pg_cron): every captured tip
// paid before the start of today (Accra time = UTC) is gathered into one payout per waiter
// (tip_payouts_claim, atomic, a tip can never be claimed twice) and sent with a Paystack
// Transfer. Paystack's GH₵1 mobile money transfer fee is deducted from the payout. A waiter
// whose tips don't cover the fee plus GH₵1 waits for the next day.
//
// Money safety: a transfer reference is unique per payout attempt; before ever re-sending a
// payout, the previous reference is verified with Paystack and adopted if it went through.
import { supabaseAdmin as typedAdmin } from '@/integrations/supabase/client.server'
import { paystackSecret } from '@/integrations/payments/provider'

// staff_payout_accounts / tip_payouts are newer than the generated types; use an untyped handle.
const supabaseAdmin: any = typedAdmin

export const MOMO_TRANSFER_FEE_PESEWAS = 100   // Paystack Ghana: GH₵1 per completed mobile money transfer
export const MIN_NET_PAYOUT_PESEWAS = 100      // never send less than GH₵1 after the fee

// Ghana mobile money network by number prefix (NCA numbering).
export function momoProvider(number: string): 'MTN' | 'VOD' | 'ATL' | null {
  const n = String(number || '').replace(/\D/g, '').replace(/^233/, '0')
  if (!/^0\d{9}$/.test(n)) return null
  const p = n.slice(0, 3)
  if (['024', '025', '053', '054', '055', '059'].includes(p)) return 'MTN'
  if (['020', '050'].includes(p)) return 'VOD'
  if (['026', '056', '027', '057'].includes(p)) return 'ATL'
  return null
}

// Loose name match between the name the restaurant gave and the wallet's registered name:
// at least two name words in common (any order), or the whole of a one-word name.
export function namesMatch(given: string, registered: string): boolean {
  const words = (s: string) => new Set(String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z\s]/g, ' ').split(/\s+/).filter((w) => w.length > 1))
  const a = words(given), b = words(registered)
  if (!a.size || !b.size) return false
  let common = 0
  for (const w of a) if (b.has(w)) common++
  return common >= Math.min(2, a.size, b.size)
}

// payment-init: who should this payment's tip go to? null = the tip settles with the bill.
export async function tipRecipientForBill(billId: string, restaurantId: string | null): Promise<string | null> {
  if (!restaurantId) return null
  const { data: r } = await supabaseAdmin.from('restaurants').select('tips_to_staff').eq('id', restaurantId).maybeSingle()
  if (!(r as any)?.tips_to_staff) return null
  const { data: bill } = await supabaseAdmin.from('bills').select('server_employee_id').eq('id', billId).maybeSingle()
  const emp = (bill as any)?.server_employee_id
  if (emp == null) return null
  const { data: acct } = await supabaseAdmin.from('staff_payout_accounts')
    .select('id, active, paystack_recipient_code, approved').eq('restaurant_id', restaurantId).eq('odoo_employee_id', emp).maybeSingle()
  const a = acct as any
  return a && a.active && a.approved && a.paystack_recipient_code ? (a.id as string) : null
}

// ---- Paystack transfer API (live key only) ----
const PAYSTACK = 'https://api.paystack.co'
async function ps(method: 'GET' | 'POST', path: string, body?: unknown): Promise<any> {
  const init: RequestInit = { method, headers: { Authorization: `Bearer ${paystackSecret('live')}`, 'Content-Type': 'application/json' } }
  if (body) init.body = JSON.stringify(body)
  const res = await fetch(PAYSTACK + path, init)
  const j = await res.json().catch(() => ({}))
  return { httpStatus: res.status, ...j }
}

// Create the Paystack transfer recipient for each account that has none, and check the wallet's
// registered name. A matching name approves the account; a mismatch (or no name from Paystack)
// leaves it unapproved, and its waiter's tips keep settling with the bill until someone checks.
export async function ensureRecipients(restaurantId: string) {
  const out: any[] = []
  const { data: accts } = await supabaseAdmin.from('staff_payout_accounts').select('*').eq('restaurant_id', restaurantId).eq('active', true)
  for (const a of (accts ?? []) as any[]) {
    if (a.paystack_recipient_code && a.verified_name) { out.push({ account: a.id, staff: a.staff_name, recipient: a.paystack_recipient_code, registeredName: a.verified_name, approved: a.approved }); continue }
    let name: string | null = a.verified_name
    if (!name) {
      const r = await ps('GET', `/bank/resolve?account_number=${a.momo_number}&bank_code=${a.momo_provider}`)
      name = r?.status && r?.data?.account_name ? String(r.data.account_name) : null
    }
    let code: string | null = a.paystack_recipient_code
    if (!code) {
      const r = await ps('POST', '/transferrecipient', { type: 'mobile_money', name: a.staff_name, account_number: a.momo_number, bank_code: a.momo_provider, currency: 'GHS' })
      code = r?.status && r?.data?.recipient_code ? String(r.data.recipient_code) : null
      if (!name && r?.data?.details?.account_name) name = String(r.data.details.account_name)
      if (!code) { out.push({ account: a.id, staff: a.staff_name, error: r?.message || 'recipient_failed' }); continue }
    }
    const approved = !!name && namesMatch(a.staff_name, name)
    await supabaseAdmin.from('staff_payout_accounts').update({ paystack_recipient_code: code, verified_name: name, approved: a.approved || approved, updated_at: new Date().toISOString() } as any).eq('id', a.id)
    out.push({ account: a.id, staff: a.staff_name, recipient: code, registeredName: name, approved: a.approved || approved })
  }
  return out
}

const refFor = (payoutId: string, attempt: number) => `tip_${payoutId.replace(/-/g, '').slice(0, 20)}_${attempt}`

function statusFromTransfer(s: string | undefined): 'paid' | 'processing' | 'failed' | 'needs_otp' {
  if (s === 'success') return 'paid'
  if (s === 'otp') return 'needs_otp'
  if (s === 'failed' || s === 'reversed' || s === 'abandoned' || s === 'blocked' || s === 'rejected') return 'failed'
  return 'processing'   // pending, received, queued
}

async function setPayout(id: string, patch: Record<string, unknown>) {
  await supabaseAdmin.from('tip_payouts').update({ ...patch, updated_at: new Date().toISOString() } as any).eq('id', id)
}

// Send (or re-check) one payout. Never sends twice: a previous reference is verified first.
export async function sendPayout(p: any, recipientCode: string, reason: string) {
  if (p.transfer_reference) {
    const v = await ps('GET', `/transfer/verify/${encodeURIComponent(p.transfer_reference)}`)
    if (v?.status && v?.data) {
      const st = statusFromTransfer(v.data.status)
      if (st !== 'failed') {
        await setPayout(p.id, { status: st, transfer_code: v.data.transfer_code ?? p.transfer_code, ...(st === 'paid' ? { paid_at: new Date().toISOString(), failure_reason: null } : {}) })
        return { payout: p.id, status: st, reference: p.transfer_reference, adopted: true }
      }
    } else if (v?.httpStatus !== 404 && !/not found/i.test(String(v?.message || ''))) {
      // Paystack unreachable or unclear: do not risk a second transfer, try again next run.
      return { payout: p.id, status: p.status, reference: p.transfer_reference, skipped: 'verify_unavailable' }
    }
  }
  const attempt = (p.transfer_attempt || 0) + 1
  const reference = refFor(p.id, attempt)
  await setPayout(p.id, { transfer_attempt: attempt, transfer_reference: reference, status: 'processing' })
  const r = await ps('POST', '/transfer', { source: 'balance', amount: p.amount_pesewas, recipient: recipientCode, reference, reason, currency: 'GHS' })
  if (r?.status && r?.data) {
    const st = statusFromTransfer(r.data.status)
    await setPayout(p.id, { status: st, transfer_code: r.data.transfer_code ?? null, failure_reason: st === 'needs_otp' ? 'Paystack asked for an OTP: turn off OTP for transfers in the Paystack dashboard' : null, ...(st === 'paid' ? { paid_at: new Date().toISOString() } : {}) })
    return { payout: p.id, status: st, reference }
  }
  await setPayout(p.id, { status: 'failed', failure_reason: String(r?.message || 'transfer_failed').slice(0, 300) })
  return { payout: p.id, status: 'failed', reference, error: r?.message }
}

// The daily run for one restaurant. cutoff = start of today in Accra (UTC+0).
export async function runTipPayouts(restaurantId: string, now = new Date()) {
  const cutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const recipients = await ensureRecipients(restaurantId)
  const { data: claimed, error } = await supabaseAdmin.rpc('tip_payouts_claim' as any, { p_restaurant: restaurantId, p_cutoff: cutoff.toISOString(), p_fee: MOMO_TRANSFER_FEE_PESEWAS, p_min_net: MIN_NET_PAYOUT_PESEWAS } as any)
  if (error) return { restaurantId, recipients, error: error.message }
  // Everything not yet paid: today's new payouts, plus earlier ones still processing or failed.
  const { data: open } = await supabaseAdmin.from('tip_payouts').select('*').eq('restaurant_id', restaurantId).in('status', ['claimed', 'processing', 'failed'])
  const { data: rest } = await supabaseAdmin.from('restaurants').select('name').eq('id', restaurantId).maybeSingle()
  const sent: any[] = []
  for (const p of (open ?? []) as any[]) {
    const { data: acct } = await supabaseAdmin.from('staff_payout_accounts').select('paystack_recipient_code, approved, active').eq('id', p.payout_account_id).maybeSingle()
    const a = acct as any
    if (!a?.paystack_recipient_code || !a.approved || !a.active) { sent.push({ payout: p.id, status: p.status, skipped: 'account_not_ready' }); continue }
    const day = new Date(new Date(p.period_end).getTime() - 1).toISOString().slice(0, 10)
    sent.push(await sendPayout(p, a.paystack_recipient_code, `${(rest as any)?.name ?? 'Klown'} tips to ${day}`))
  }
  return { restaurantId, cutoff: cutoff.toISOString(), recipients, claimed: (claimed as any[] | null)?.length ?? 0, payouts: sent }
}

// Paystack transfer webhooks (transfer.success / transfer.failed / transfer.reversed).
export async function applyTransferEvent(event: string, reference: string, transferCode?: string, reason?: string) {
  if (!reference.startsWith('tip_')) return false
  const { data: p } = await supabaseAdmin.from('tip_payouts').select('id, status').eq('transfer_reference', reference).maybeSingle()
  if (!p) return false
  if (event === 'transfer.success') await setPayout((p as any).id, { status: 'paid', paid_at: new Date().toISOString(), transfer_code: transferCode ?? null, failure_reason: null })
  else if (event === 'transfer.failed' || event === 'transfer.reversed') await setPayout((p as any).id, { status: 'failed', failure_reason: (reason || event).slice(0, 300) })
  return true
}
