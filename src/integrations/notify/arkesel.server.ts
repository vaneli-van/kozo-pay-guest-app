// Arkesel SMS (Ghana) — server only. Best-effort: if unconfigured or the call fails,
// it never throws into the caller (payments / rewards must not break on an SMS problem).
// Docs: POST https://sms.arkesel.com/api/v2/sms/send with header `api-key`.
const ARKESEL_URL = 'https://sms.arkesel.com/api/v2/sms/send'

function apiKey(): string | null {
  return process.env['ARKESEL_API_KEY'] || null
}
function senderId(): string {
  // Sender ID must be a pre-approved Arkesel sender (max 11 chars).
  return (process.env['ARKESEL_SENDER_ID'] || 'Klown').slice(0, 11)
}

// Normalise a Ghana number to MSISDN (233XXXXXXXXX). Returns null if it can't.
export function ghMsisdn(raw: string | null | undefined): string | null {
  const d = (raw ?? '').replace(/\D/g, '')
  if (!d) return null
  if (d.startsWith('233') && d.length === 12) return d
  if (d.startsWith('0') && d.length === 10) return '233' + d.slice(1)
  if (d.length === 9) return '233' + d // missing leading 0
  if (d.startsWith('233')) return d
  return null
}

export type SmsResult = { ok: boolean; skipped?: boolean; status?: number; message?: string }

// Send one message to one or more recipients. Recipients are normalised + de-duped.
export async function sendSms(recipients: (string | null | undefined)[], message: string): Promise<SmsResult> {
  const key = apiKey()
  if (!key) return { ok: false, skipped: true, message: 'ARKESEL_API_KEY not set' }
  const to = Array.from(new Set(recipients.map(ghMsisdn).filter((x): x is string => !!x)))
  if (!to.length) return { ok: false, skipped: true, message: 'no valid recipients' }
  const body = { sender: senderId(), message: message.slice(0, 900), recipients: to }
  try {
    const res = await fetch(ARKESEL_URL, {
      method: 'POST',
      headers: { 'api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const j = await res.json().catch(() => ({}))
    const ok = res.ok && (j?.status === 'success' || j?.code === 'ok' || j?.status === 'ok')
    return { ok, status: res.status, message: typeof j?.message === 'string' ? j.message : undefined }
  } catch (e) {
    return { ok: false, message: String(e) }
  }
}

// Parse a comma/space/newline-separated phone list (restaurants.notify_phones).
export function parsePhoneList(raw: string | null | undefined): string[] {
  if (!raw) return []
  return raw.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean)
}
