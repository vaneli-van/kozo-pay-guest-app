// The Paystack reference in the URL when the diner returns from Paystack's hosted card / MoMo
// page (callback_url?reference=…&trxref=…). Null otherwise.
export function checkoutReturnRef(): string | null {
  if (typeof window === 'undefined') return null
  const p = new URLSearchParams(window.location.search)
  return p.get('reference') || p.get('trxref') || null
}
