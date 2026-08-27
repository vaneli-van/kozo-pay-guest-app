import { useEffect, useReducer, useRef, useState } from 'react'
import { reducer, initial, go, type State, type Screen } from './session/machine'
import { Shell } from './ui/primitives'
import { Connect, Welcome, map } from './screens/screens'

const POST = (url: string, body: unknown): Promise<any> =>
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    .then((r) => r.json())
    .catch(() => null)

export default function App({
  initialState,
  storageKey = 'klown-dining-session',
  sessionToken,
}: { initialState?: Partial<State>; storageKey?: string; sessionToken?: string } = {}) {
  const [s, dispatch] = useReducer(reducer, { ...initial, ...initialState })
  const [hydrated, setHydrated] = useState(false)
  const idemRef = useRef<string>('')

  const patch = (value: Partial<State>) => dispatch({ type: 'patch', value })
  const goScreen = (screen: Screen) => {
    if (typeof window !== 'undefined') window.history.pushState({ screen }, '', window.location.pathname)
    dispatch(go(screen))
  }

  const checkStatusOnce = async (ref?: string) => {
    const paymentRef = ref ?? s.paymentRef
    if (!sessionToken || !paymentRef) return
    const r = await POST('/api/public/payment-status', { sessionToken, paymentRef })
    if (r?.status === 'captured') goScreen('success')
    else if (r?.status === 'failed') goScreen('payment-error')
  }

  const navigate = (action: any) => {
    if (!action) return
    switch (action.type) {
      case 'waiter':
        if (sessionToken) POST('/api/public/waiter-request', { sessionToken, kind: action.kind ?? 'assistance' })
        break
      case 'dispute':
        if (sessionToken) POST('/api/public/bill-dispute', { sessionToken, note: action.note })
        goScreen('waiter-notified')
        return
      case 'patch-go':
        patch(action.value ?? {})
        if (action.to) goScreen(action.to as Screen)
        return
      case 'otp-send':
        if (action.value?.phone) patch({ phone: action.value.phone })
        if (sessionToken && action.value?.phone) POST('/api/public/otp-send', { sessionToken, phone: action.value.phone })
        goScreen('otp-rewards')
        return
      case 'otp-verify':
        if (sessionToken) POST('/api/public/otp-verify', { sessionToken, code: action.value?.code ?? '123456' })
        goScreen('name')
        return
      case 'rewards-consent':
        if (sessionToken) {
          POST('/api/public/rewards-consent', {
            sessionToken,
            phone: action.value?.phone ?? s.phone,
            firstName: action.value?.firstName,
            receiptConsent: true,
            rewardsConsent: true,
            marketingConsent: !!action.value?.marketing,
            consentVersion: 'v1',
          })
        }
        goScreen('rewards')
        return
      case 'feedback': {
        const rating = action.value?.rating ?? 5
        if (sessionToken) {
          POST('/api/public/feedback', { sessionToken, rating }).then(async (r) => {
            if (r?.sentiment === 'positive') {
              const rl = await POST('/api/public/review-link', { sessionToken })
              if (rl?.url) {
                patch({ reviewUrl: rl.url })
                goScreen('review-handoff')
                return
              }
            }
            goScreen('complete')
          })
        } else {
          goScreen(rating >= 4 ? 'review-handoff' : 'complete')
        }
        return
      }
      case 'pay-otp':
        if (sessionToken && s.paymentRef) {
          POST('/api/public/payment-otp', { sessionToken, paymentRef: s.paymentRef, otp: action.value?.otp }).then(() => goScreen('processing'))
        } else {
          goScreen('processing')
        }
        return
      case 'pay-mock':
        if (sessionToken && s.paymentRef) {
          POST('/api/mock/pay-callback', { sessionToken, paymentRef: s.paymentRef, outcome: action.outcome }).then(() =>
            checkStatusOnce(),
          )
        } else {
          goScreen(action.outcome === 'captured' ? 'success' : 'payment-error')
        }
        return
      case 'screen':
        if (typeof window !== 'undefined') window.history.pushState({ screen: action.value }, '', window.location.pathname)
        break
    }
    dispatch(action)
  }

  // Initiate the payment server-side (idempotent) when the diner commits — amounts are computed on the server.
  useEffect(() => {
    if (!sessionToken) return
    if ((s.screen === 'authorise' || s.screen === 'processing') && !s.paymentRef) {
      if (!idemRef.current) idemRef.current = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`
      const callbackUrl = typeof window !== 'undefined' ? window.location.origin + window.location.pathname : undefined
      POST('/api/public/payment-init', {
        sessionToken,
        idempotencyKey: idemRef.current,
        mode: s.shareMode ?? 'full',
        people: s.people,
        customAmountPesewas: s.customAmountPesewas,
        tipPercent: s.tipPercent ?? s.tip,
        method: s.method ?? 'momo',
        provider: s.method === 'card' ? 'card' : 'momo',
        phone: s.momoNumber, // MoMo number — transaction-only, cleared once initiated
        callbackUrl,
      }).then((r) => {
        if (!r?.ok) { goScreen('payment-error'); return }
        if (r.paymentRef) patch({ paymentRef: r.paymentRef, momoNumber: undefined })
        if (r.redirectUrl) { window.location.href = r.redirectUrl; return } // card → Paystack hosted page
        if (r.action === 'otp') goScreen('otp') // MoMo send_otp path
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.screen, s.paymentRef, sessionToken])

  // Poll payment status while processing — success is reached only when the server confirms capture.
  useEffect(() => {
    if (s.screen !== 'processing' || !sessionToken || !s.paymentRef) return
    let n = 0
    const id = window.setInterval(async () => {
      n++
      const r = await POST('/api/public/payment-status', { sessionToken, paymentRef: s.paymentRef })
      if (r?.status === 'captured') {
        window.clearInterval(id)
        goScreen('success')
      } else if (r?.status === 'failed') {
        window.clearInterval(id)
        goScreen('payment-error')
      } else if (n > 40) {
        window.clearInterval(id)
      }
    }, 1500)
    return () => window.clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.screen, s.paymentRef, sessionToken])

  // Returning from Paystack's hosted card page (?reference=…): verify server-side, then route.
  useEffect(() => {
    if (!sessionToken || typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const reference = params.get('reference') || params.get('trxref')
    if (!reference) return
    window.history.replaceState({}, '', window.location.pathname)
    patch({ paymentRef: reference })
    goScreen('processing')
    POST('/api/public/payment-verify', { sessionToken, reference }).then((r) => {
      if (r?.status === 'captured') goScreen('success')
      else if (r?.status === 'failed') goScreen('payment-error')
      // otherwise stay on processing — the polling effect continues via paymentRef
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionToken])

  // Issue / fetch the receipt once payment is captured.
  useEffect(() => {
    if (!sessionToken) return
    if ((s.screen === 'success' || s.screen === 'receipt-choice' || s.screen === 'guest-receipt') && !s.receiptNumber) {
      POST('/api/public/receipt', { sessionToken }).then((r) => {
        if (r?.ok) patch({ receiptNumber: r.receiptNumber, totalPaidPesewas: r.totalPaidPesewas })
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.screen, s.receiptNumber, sessionToken])

  const C = map[s.screen] || Connect

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(storageKey)
      if (saved) dispatch({ type: 'restore', value: JSON.parse(saved) })
    } catch {}
    setHydrated(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!hydrated) return
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(s))
    } catch {}
  }, [s, hydrated, storageKey])

  useEffect(() => {
    const onPop = (event: PopStateEvent) => {
      if (event.state?.screen) dispatch(go(event.state.screen))
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  return (
    <>
      {isHandoff ? (
        <Handoff dispatch={navigate} />
      ) : s.screen === 'connect' || s.screen === 'welcome' ? (
        <div className="app-shell">
          {s.screen === 'connect' ? <Connect dispatch={navigate} /> : <Welcome s={s} dispatch={navigate} />}
        </div>
      ) : (
        <Shell s={s} dispatch={navigate}>
          <C s={s} dispatch={navigate} />
        </Shell>
      )}
      {showToggle && (
        <button
          className="prototype-toggle"
          onClick={() => {
            window.location.hash = isHandoff ? '' : 'handoff'
            window.location.reload()
          }}
          aria-label="Open prototype navigator"
        >
          {isHandoff ? 'Close handoff' : 'Prototype map'}
        </button>
      )}
    </>
  )
}
