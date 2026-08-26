import { useEffect, useState } from 'react'

export type ResolveResult =
  | { status: 'loading' }
  | { status: 'error'; reason: string }
  | { status: 'ready'; sessionToken: string; restaurant: { name: string; city: string }; branch: { name: string }; table: { label: string }; hasActiveBill: boolean; billStatus: string; expiresAt: string }

const key = (qrToken: string) => `klown-session:${qrToken}`

export function useDiningSession(qrToken: string): ResolveResult {
  const [state, setState] = useState<ResolveResult>({ status: 'loading' })
  useEffect(() => {
    let cancelled = false
    async function run() {
      let stored: string | null = null
      try { stored = localStorage.getItem(key(qrToken)) } catch {}
      try {
        const res = await fetch('/api/public/qr-resolve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ qrToken, sessionToken: stored ?? undefined }),
        })
        const data = await res.json()
        if (cancelled) return
        if (!data?.ok) { setState({ status: 'error', reason: data?.reason ?? 'invalid' }); return }
        try { localStorage.setItem(key(qrToken), data.sessionToken) } catch {}
        setState({ status: 'ready', sessionToken: data.sessionToken, restaurant: data.restaurant, branch: data.branch, table: data.table, hasActiveBill: data.hasActiveBill, billStatus: data.billStatus, expiresAt: data.expiresAt })
      } catch {
        if (!cancelled) setState({ status: 'error', reason: 'network' })
      }
    }
    run()
    return () => { cancelled = true }
  }, [qrToken])
  return state
}
