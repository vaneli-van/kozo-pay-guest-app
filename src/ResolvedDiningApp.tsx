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
  // The "demo" token has no qr_tokens row; in dev, render the diner UI directly so the preview is viewable.
  if (token === 'demo' && import.meta.env.DEV) {
    return <App initialState={{ screen: 'welcome', mode: 'table', tableLabel: '12', restaurantName: 'Klown Kitchen' }} storageKey="klown-dining:demo-preview" />
  }
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
    ...(r.paymentMode === 'test' ? { testMode: true } : {}),
  }
  const isOrder = (s as any).mode === 'order'
  const startScreen = isOrder ? (s.hasActiveBill ? 'bill' : 'waiting-bill') : (s.hasActiveBill ? 'bill' : 'welcome')
  return <App initialState={{ screen: startScreen, hasOrder: s.hasActiveBill, mode: isOrder ? 'order' : 'table', tableLabel: s.table.label, restaurantName: s.restaurant.name, ...branding }} storageKey={`klown-dining:${token}`} sessionToken={s.sessionToken} />
}
