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

export interface SplitConfig {
  subaccountCode: string
  klownFeeBps: number
}

export interface GrossUp {
  basePesewas: number          // B — restaurant receives this
  totalPesewas: number         // T — diner is charged this
  transactionChargePesewas: number // T − B — flat to Klown main account
  klownFeeBps: number
}

// Made-whole gross-up. Rounds T UP so the restaurant always receives the full
// base and the fees are always fully covered (the diner absorbs the sub-pesewa).
export function computeGrossUp(basePesewas: number, klownFeeBps = DEFAULT_KLOWN_FEE_BPS): GrossUp {
  const B = Math.max(0, Math.trunc(basePesewas))
  const k = Math.max(0, Math.trunc(klownFeeBps))
  const denom = 10000 - PAYSTACK_FEE_BPS
  // Guard against a nonsensical fee config; fall back to no gross-up.
  if (denom <= 0 || B <= 0) {
    return { basePesewas: B, totalPesewas: B, transactionChargePesewas: 0, klownFeeBps: k }
  }
  const T = Math.ceil((B * (10000 + k)) / denom)
  const transactionCharge = Math.max(0, T - B)
  return { basePesewas: B, totalPesewas: T, transactionChargePesewas: transactionCharge, klownFeeBps: k }
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
export async function getSplitConfigForRestaurant(restaurantId: string): Promise<SplitConfig | null> {
  const { data } = await supabaseAdmin
    .from('restaurants').select('paystack_subaccount_code, klown_fee_bps').eq('id', restaurantId).maybeSingle()
  const code = (data as any)?.paystack_subaccount_code
  if (!code || typeof code !== 'string') return null
  const bps = typeof (data as any)?.klown_fee_bps === 'number' ? (data as any).klown_fee_bps : DEFAULT_KLOWN_FEE_BPS
  return { subaccountCode: code, klownFeeBps: bps }
}

// Convenience: config for a bill in one call. Null when the bill has no
// resolvable restaurant or that restaurant has no subaccount.
export async function getSplitConfigForBill(billId: string): Promise<SplitConfig | null> {
  const restaurantId = await resolveRestaurantForBill(billId)
  if (!restaurantId) return null
  return getSplitConfigForRestaurant(restaurantId)
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
