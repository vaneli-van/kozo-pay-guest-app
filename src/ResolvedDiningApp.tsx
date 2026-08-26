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
  return <App initialState={{ screen: 'welcome', hasOrder: s.hasActiveBill }} storageKey={`klown-dining:${token}`} showToggle={false} />
}
