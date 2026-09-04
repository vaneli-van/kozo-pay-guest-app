import { useEffect, useState } from 'react'
import App from './App'
import { useDiningSession } from './session/useDiningSession'
import { Connect } from './screens/screens'
import { InvalidSession } from './screens/InvalidSession'

// Client-only: the diner experience uses window/sessionStorage/history.
export default function ResolvedDiningApp({ token }: { token: string }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return null
  return <ResolvedInner token={token} />
}

function ResolvedInner({ token }: { token: string }) {
  const s = useDiningSession(token)
  if (s.status === 'loading') return <div className="app-shell"><Connect dispatch={() => {}} /></div>
  if (s.status === 'error') return <div className="app-shell"><InvalidSession reason={s.reason} onRetry={() => window.location.reload()} /></div>
  const r = s.restaurant
  const branding = {
    ...(r.logoUrl ? { logoUrl: r.logoUrl } : {}),
    ...(r.heroUrl ? { heroUrl: r.heroUrl } : {}),
    ...(r.accentColor ? { accentColor: r.accentColor } : {}),
    ...(r.taglineTop ? { taglineTop: r.taglineTop } : {}),
    ...(r.taglineBottom ? { taglineBottom: r.taglineBottom } : {}),
    ...(r.welcomeCopy ? { welcomeCopy: r.welcomeCopy } : {}),
  }
  return <App initialState={{ screen: s.hasActiveBill ? 'bill' : 'welcome', hasOrder: s.hasActiveBill, tableLabel: s.table.label, restaurantName: s.restaurant.name, ...branding }} storageKey={`klown-dining:${token}`} sessionToken={s.sessionToken} />
}
