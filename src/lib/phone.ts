// Ghana mobile numbers as diners type them: "024 123 4567", "0241234567", "241234567",
// "+233 24 123 4567". Same rule as the database's klown_gh_msisdn, so a number the app accepts is
// one the server accepts.

/** Digits only, in the local 0XXXXXXXXX form, or null when it is not a Ghana mobile number. */
export function normalizeGhanaMobile(raw: string): string | null {
  const d = (raw ?? '').replace(/\D/g, '')
  if (/^0\d{9}$/.test(d)) return d
  if (/^233\d{9}$/.test(d)) return '0' + d.slice(3)
  if (/^\d{9}$/.test(d)) return '0' + d
  return null
}

export const isGhanaMobile = (raw: string) => normalizeGhanaMobile(raw) !== null
