// Diner funnel tracking. One place to fire events; today it beacons to our own
// backend (/api/public/track). If we ever add Amplitude, add its call here too.
export function track(sessionToken: string | null | undefined, event: string, props?: Record<string, any>) {
  if (!sessionToken || typeof window === 'undefined') return
  try {
    const body = JSON.stringify({ sessionToken, event, screen: props?.screen, props: props || {} })
    // keepalive so the beacon still sends during a navigation/redirect (e.g. to Paystack).
    fetch('/api/public/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {})
  } catch { /* tracking must never break the app */ }
}
