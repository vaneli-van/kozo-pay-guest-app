import { useEffect, useState } from 'react'
import App from './App'
import { useDiningSession } from './session/useDiningSession'
import { InvalidSession } from './screens/InvalidSession'
import { checkoutReturnRef } from './session/checkoutReturn'
import { V2Splash } from './screens/v2'

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

// The new diner screens are switched on per restaurant. On the preview (unpublished build) only,
// ?ui=v2 or ?ui=classic overrides that for testing, and is remembered for the tab.
function wantsV2(dinerUi?: string): boolean {
  if (typeof window === 'undefined') return dinerUi === 'v2'
  const h = window.location.hostname.toLowerCase()
  const preview = h.startsWith('id-preview--') || h.startsWith('preview--') || h.endsWith('.lovableproject.com') || h === 'localhost' || h === '127.0.0.1'
  if (preview) {
    try {
      const q = new URLSearchParams(window.location.search).get('ui')
      if (q === 'v2' || q === 'classic') sessionStorage.setItem('klown-ui', q)
      const o = sessionStorage.getItem('klown-ui')
      if (o === 'v2' || o === 'classic') return o === 'v2'
    } catch {}
  }
  return dinerUi === 'v2'
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
  // Loading: the new splash with the Klown logo. Back from Paystack's full-page checkout, it says
  // the payment is being checked.
  if (s.status === 'loading') return <V2Splash slow={slow} confirming={!!checkoutReturnRef()} onRetry={() => window.location.reload()} />
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
    uiV2: wantsV2(r.dinerUi),
  }
  const isOrder = (s as any).mode === 'order'
  // Coming back from Paystack's card / MoMo page (?reference=…): open straight on "processing"
  // (with the reference already set, so no new payment is started) instead of flashing the
  // bill or welcome screen before the success screen.
  const checkoutRef = checkoutReturnRef()
  // Several groups at this table, each with its own bill: ask which is theirs first.
  // The new screens always open on the restaurant's home screen; the bill comes after "View and pay".
  const startScreen = checkoutRef ? 'processing' : isOrder ? (s.hasActiveBill ? 'bill' : 'waiting-bill') : branding.uiV2 ? 'welcome' : ((s as any).chooseTab ? 'choose-tab' : s.hasActiveBill ? 'bill' : 'welcome')
  return <App initialState={{ screen: startScreen, ...(checkoutRef ? { paymentRef: checkoutRef } : {}), hasOrder: s.hasActiveBill, mode: isOrder ? 'order' : 'table', tableLabel: s.table.label, restaurantName: s.restaurant.name, ...branding }} storageKey={`klown-dining:${token}`} sessionToken={s.sessionToken} qrToken={token} />
}
