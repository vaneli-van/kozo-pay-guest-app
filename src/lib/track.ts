// Diner funnel tracking. One place to fire events; today it beacons to our own
// backend (/api/public/track). If we ever add Amplitude, add its call here too.

// Anonymous, per-browser id so we can measure repeat visitors without any PII.
function clientId(): string | null {
  if (typeof window === 'undefined') return null
  try {
    let id = localStorage.getItem('klown_cid')
    if (!id) {
      id = (window.crypto && 'randomUUID' in window.crypto)
        ? window.crypto.randomUUID()
        : String(Date.now()) + Math.random().toString(16).slice(2)
      localStorage.setItem('klown_cid', id)
    }
    return id
  } catch { return null }
}

export function track(sessionToken: string | null | undefined, event: string, props?: Record<string, any>) {
  if (!sessionToken || typeof window === 'undefined') return
  try {
    const body = JSON.stringify({ sessionToken, event, screen: props?.screen, props: props || {}, clientId: clientId() })
    // keepalive so the beacon still sends during a navigation/redirect (e.g. to Paystack).
    fetch('/api/public/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {})
  } catch { /* tracking must never break the app */ }
}
