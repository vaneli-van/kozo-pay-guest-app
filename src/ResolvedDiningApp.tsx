import { useEffect, useState } from 'react'
import App from './App'
import { useDiningSession } from './session/useDiningSession'
import { Connect } from './screens/screens'
import { InvalidSession } from './screens/InvalidSession'
import { checkoutReturnRef } from './session/checkoutReturn'
import { Center } from './ui/primitives'

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
  // After 8 s still loading, the splash offers "Try again".
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    if (s.status !== 'loading') return
    const t = setTimeout(() => setSlow(true), 8000)
    return () => clearTimeout(t)
  }, [s.status])
  // Back from Paystack's full-page checkout (fallback path): say what is happening while the
  // table session reloads, instead of the generic "connecting to your table" splash.
  if (s.status === 'loading') return <div className="app-shell">{checkoutReturnRef()
    ? <Center eyebrow="SECURE PAYMENT" title={"Confirming your<br /><em>payment.</em>"} copy="One moment while we check with your bank…"><div className="loader large" /></Center>
    : <Connect slow={slow} onRetry={() => window.location.reload()} />}</div>
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
  // Coming back from Paystack's card / MoMo page (?reference=…): open straight on "processing"
  // (with the reference already set, so no new payment is started) instead of flashing the
  // bill or welcome screen before the success screen.
  const checkoutRef = checkoutReturnRef()
  // Several groups at this table, each with its own bill: ask which is theirs first.
  const startScreen = checkoutRef ? 'processing' : isOrder ? (s.hasActiveBill ? 'bill' : 'waiting-bill') : ((s as any).chooseTab ? 'choose-tab' : s.hasActiveBill ? 'bill' : 'welcome')
  return <App initialState={{ screen: startScreen, ...(checkoutRef ? { paymentRef: checkoutRef } : {}), hasOrder: s.hasActiveBill, mode: isOrder ? 'order' : 'table', tableLabel: s.table.label, restaurantName: s.restaurant.name, ...branding }} storageKey={`klown-dining:${token}`} sessionToken={s.sessionToken} />
}
