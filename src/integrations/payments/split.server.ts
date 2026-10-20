import { supabaseAdmin } from '@/integrations/supabase/client.server'

// ── Paystack Transaction Split (direct-to-restaurant settlement) ──────────────
// Each restaurant with a Paystack subaccount is settled directly to its bank.
// The diner covers the fee, folded into the charge and surfaced ONLY at the
// MoMo USSD prompt / card confirmation (never itemised on the Klown screen).
//
// Money model (all in integer pesewas; GH₵1 = 100):
//   B = what the diner intends to pay (share + tip) — the bill-settling figure,
//       and exactly what the restaurant subaccount must receive.
//   T = grossed-up amount actually charged to the diner.
//   Paystack fee  = PAYSTACK_FEE_BPS on T (bearer = 'account' → Klown bears it).
//   Klown net     = klown_fee_bps on B.
//   transaction_charge = T − B  (flat, routed to Klown's main account; this
//       OVERRIDES the subaccount percentage, so the subaccount gets exactly B).
//
//   Solve for made-whole T:  T(1 − r) = B(1 + k)  →  T = B(1+k)/(1−r)
//   with r = PAYSTACK_FEE_BPS/10000, k = klownFeeBps/10000.
//
// Worked (B = GH₵200 = 20000p, k = 50bps, r = 195bps):
//   T = 20000 * 10050 / 9805 = 20499.7 → ceil 20500  (diner pays GH₵205.00)
//   transaction_charge = 500  (GH₵5.00 to Klown main)
//   subaccount receives 20000 (GH₵200.00) · Paystack fee ≈ 400 (GH₵4.00 off main)
//   Klown net ≈ 100 (GH₵1.00 = 0.50% of B). Diner surcharge ≈ 2.5%.

export const PAYSTACK_FEE_BPS = 195     // Paystack Ghana: 1.95% flat, no cap (MoMo / local card / bank)
export const DEFAULT_KLOWN_FEE_BPS = 50 // 0.50%

// Who bears Paystack's 1.95% (restaurants.paystack_fee_bearer):
//   'customer'   (default, the model above): the diner's surcharge covers Paystack's fee AND
//                Klown's fee; the restaurant receives exactly B. bearer = 'account'.
//   'restaurant': the diner's surcharge is only Klown's fee (k on B, bill and tip alike);
//                Paystack deducts its fee from the restaurant's share. bearer = 'subaccount'.
//                T = B(1+k); transaction_charge = T − B (Klown); restaurant receives B − r·T.
//                Worked (B = GH₵100, k = 100bps): diner pays 101.00, Klown 1.00, Paystack 1.97
//                (1.95% of 101), restaurant 98.03.
export type FeeBearer = 'customer' | 'restaurant'

export interface SplitConfig {
  subaccountCode: string
  klownFeeBps: number
  feeBearer?: FeeBearer
}

export interface GrossUp {
  basePesewas: number          // B — the bill-settling figure (share + tip)
  totalPesewas: number         // T — diner is charged this
  transactionChargePesewas: number // T − B — flat to Klown main account
  klownFeeBps: number
  feeBearer: FeeBearer
  bearer: 'account' | 'subaccount' // what we tell Paystack
}

// Gross-up. Rounds T UP so the fees are always fully covered (the diner absorbs the sub-pesewa).
// 'customer': the restaurant always receives the full base. 'restaurant': Klown always receives
// its full fee; the restaurant receives the base less Paystack's fee on the charge.
export function computeGrossUp(basePesewas: number, klownFeeBps = DEFAULT_KLOWN_FEE_BPS, feeBearer: FeeBearer = 'customer'): GrossUp {
  const B = Math.max(0, Math.trunc(basePesewas))
  const k = Math.max(0, Math.trunc(klownFeeBps))
  const bearer = feeBearer === 'restaurant' ? 'subaccount' : 'account'
  const denom = feeBearer === 'restaurant' ? 10000 : 10000 - PAYSTACK_FEE_BPS
  // Guard against a nonsensical fee config; fall back to no gross-up.
  if (denom <= 0 || B <= 0) {
    return { basePesewas: B, totalPesewas: B, transactionChargePesewas: 0, klownFeeBps: k, feeBearer, bearer }
  }
  const T = Math.ceil((B * (10000 + k)) / denom)
  const transactionCharge = Math.max(0, T - B)
  return { basePesewas: B, totalPesewas: T, transactionChargePesewas: transactionCharge, klownFeeBps: k, feeBearer, bearer }
}

// A tip held back for the waiter (tips to staff) is added to transaction_charge so it stays
// with Klown. When the restaurant bears Paystack's fee, Klown gives back the fee on that tip
// (the tip isn't the restaurant's money), so the restaurant only ever pays the fee on its bill.
export function heldTipCharge(tipPesewas: number, feeBearer: FeeBearer): number {
  const P = Math.max(0, Math.trunc(tipPesewas))
  if (feeBearer !== 'restaurant') return P
  return Math.max(0, P - Math.ceil((P * PAYSTACK_FEE_BPS) / 10000))
}

// restaurants.paystack_fee_bearer, tolerant of the column not existing yet (code before migration).
export async function feeBearerFor(restaurantId: string | null): Promise<FeeBearer> {
  if (!restaurantId) return 'customer'
  const { data, error } = await supabaseAdmin.from('restaurants').select('paystack_fee_bearer' as any).eq('id', restaurantId).maybeSingle()
  if (error) return 'customer'
  return (data as any)?.paystack_fee_bearer === 'restaurant' ? 'restaurant' : 'customer'
}

// Resolve the owning restaurant for a bill.
//   • QSR / counter bills carry restaurant_id directly.
//   • Table bills resolve table → branch → restaurant.
export async function resolveRestaurantForBill(billId: string): Promise<string | null> {
  const { data: bill } = await supabaseAdmin
    .from('bills').select('table_id, register_id, restaurant_id').eq('id', billId).maybeSingle()
  if (!bill) return null
  if ((bill as any).restaurant_id) return (bill as any).restaurant_id as string
  if (bill.table_id) {
    const { data: table } = await supabaseAdmin.from('restaurant_tables').select('branch_id').eq('id', bill.table_id).maybeSingle()
    if (table?.branch_id) {
      const { data: branch } = await supabaseAdmin.from('branches').select('restaurant_id').eq('id', table.branch_id).maybeSingle()
      return branch?.restaurant_id ?? null
    }
  }
  return null
}

// Split config for a restaurant. Returns null (split OFF → current single-account
// behaviour) unless a Paystack subaccount is configured.
// In test mode the TEST-mode subaccount is used (Paystack keeps test and live subaccounts apart).
export async function getSplitConfigForRestaurant(restaurantId: string, mode: 'live' | 'test' = 'live'): Promise<SplitConfig | null> {
  const { data } = await supabaseAdmin
    .from('restaurants').select('paystack_subaccount_code, paystack_test_subaccount_code, klown_fee_bps').eq('id', restaurantId).maybeSingle()
  const code = mode === 'test' ? (data as any)?.paystack_test_subaccount_code : (data as any)?.paystack_subaccount_code
  if (!code || typeof code !== 'string') return null
  const bps = typeof (data as any)?.klown_fee_bps === 'number' ? (data as any).klown_fee_bps : DEFAULT_KLOWN_FEE_BPS
  return { subaccountCode: code, klownFeeBps: bps }
}

// Convenience: config for a bill in one call. Null when the bill has no
// resolvable restaurant or that restaurant has no subaccount.
export async function getSplitConfigForBill(billId: string, mode: 'live' | 'test' = 'live'): Promise<SplitConfig | null> {
  const restaurantId = await resolveRestaurantForBill(billId)
  if (!restaurantId) return null
  return getSplitConfigForRestaurant(restaurantId, mode)
}

// ── Paystack subaccount provisioning (used by the owner Payout-account flow) ──
const PAYSTACK_BASE = 'https://api.paystack.co'
function paystackSecret(): string {
  const k = process.env['PAYSTACK_SECRET_KEY']
  if (!k) throw new Error('PAYSTACK_SECRET_KEY is not set')
  return k
}
async function paystackGet(path: string): Promise<any> {
  const res = await fetch(`${PAYSTACK_BASE}${path}`, { headers: { Authorization: `Bearer ${paystackSecret()}` } })
  return res.json().catch(() => ({}))
}
async function paystackPost(path: string, body: unknown): Promise<any> {
  const res = await fetch(`${PAYSTACK_BASE}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${paystackSecret()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json().catch(() => ({}))
}

// List Ghana banks (code + name) for the Payout-account picker.
export async function listGhanaBanks(): Promise<Array<{ name: string; code: string }>> {
  const r = await paystackGet('/bank?currency=GHS')
  if (!r?.status || !Array.isArray(r.data)) return []
  return r.data.map((b: any) => ({ name: b.name, code: b.code }))
}

// Resolve an account number to its registered name (verification before creating a subaccount).
export async function resolveBankAccount(accountNumber: string, bankCode: string): Promise<{ ok: boolean; accountName?: string; reason?: string }> {
  const r = await paystackGet(`/bank/resolve?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`)
  if (r?.status && r?.data?.account_name) return { ok: true, accountName: r.data.account_name }
  return { ok: false, reason: r?.message || 'resolve_failed' }
}

// Create a subaccount. percentage_charge is set to 0 because the per-transaction
// transaction_charge fully controls the split at charge time.
export async function createPaystackSubaccount(input: {
  businessName: string; bankCode: string; accountNumber: string;
}): Promise<{ ok: boolean; subaccountCode?: string; reason?: string; raw?: any }> {
  const r = await paystackPost('/subaccount', {
    business_name: input.businessName,
    bank_code: input.bankCode,
    account_number: input.accountNumber,
    percentage_charge: 0,
  })
  const code = r?.data?.subaccount_code
  if (r?.status && code) return { ok: true, subaccountCode: code, raw: r.data }
  return { ok: false, reason: r?.message || 'subaccount_create_failed', raw: r }
}
