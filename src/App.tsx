import { useEffect, useReducer, useRef, useState } from 'react'
import { reducer, initial, go, type State, type Screen } from './session/machine'
import { Shell } from './ui/primitives'
import { Connect, Welcome, map } from './screens/screens'

const POST = (url: string, body: unknown): Promise<any> =>
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    .then((r) => r.json())
    .catch(() => null)

// Paystack's checkout sends X-Frame-Options: SAMEORIGIN, so it cannot load inside an
// embedded preview iframe. Navigate the top-level window when we're framed; if the
// browser blocks cross-origin top navigation, fall back to opening a new tab.
function openCheckout(url: string) {
  if (typeof window === 'undefined') return
  const framed = window.top !== window.self
  if (!framed) { window.location.href = url; return }
  try {
    if (window.top) { window.top.location.href = url; return }
  } catch { /* cross-origin parent — cannot navigate it */ }
  const w = window.open(url, '_blank', 'noopener')
  if (!w) window.location.href = url
}



export default function App({
  initialState,
  storageKey = 'klown-dining-session',
  sessionToken,
}: { initialState?: Partial<State>; storageKey?: string; sessionToken?: string } = {}) {
  const [s, dispatch] = useReducer(reducer, { ...initial, ...initialState })
  const [hydrated, setHydrated] = useState(false)
  const idemRef = useRef<string>('')

  useEffect(() => { if (sessionToken && s.sessionToken !== sessionToken) patch({ sessionToken }) }, [sessionToken])

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
    // Going back into the checkout means starting a fresh charge — drop the old attempt
    // so a retry (or a changed amount/method) initiates a new, idempotent payment.
    const target: string | null = action.type === 'screen' ? action.value : action.type === 'patch-go' ? action.to : null
    if (target && ['pay', 'split', 'split-share', 'split-lobby', 'tip', 'review', 'method', 'momo', 'authorise'].includes(target) && s.paymentRef) {
      idemRef.current = ''
      patch({ paymentRef: undefined })
    }
    switch (action.type) {
      case 'split-create': {
        if (!sessionToken) return
        patch({ splitError: undefined })
        POST('/api/public/split-create', { sessionToken, mode: action.mode, partySize: action.people, amounts: action.amounts }).then((r) => {
          if (r?.ok) { patch({ splitId: r.splitId }); goScreen('split-lobby') }
          else if (r?.reason === 'split_exists') goScreen('split-lobby')
          else patch({ splitError: r?.reason === 'shares_do_not_sum' ? 'Shares must add up to the bill total.' : r?.reason === 'already_paying' ? 'Payment has already started on this bill.' : 'Could not start the split. Please try again.' })
        })
        return
      }
      case 'split-claim':
        if (sessionToken) POST('/api/public/split-claim', { sessionToken, shareId: action.shareId }).then((r) => { if (r?.ok) patch({ claimedShareId: r.shareId }) })
        return
      case 'split-release':
        if (sessionToken) POST('/api/public/split-release', { sessionToken, shareId: action.shareId }).then(() => patch({ claimedShareId: undefined }))
        return
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
        // No verification step: the receipt goes straight to the diner's WhatsApp.
        if (action.value?.phone) patch({ phone: action.value.phone })
        if (sessionToken && action.value?.phone) {
          POST('/api/public/receipt-whatsapp', { sessionToken, phone: action.value.phone }).then((r) => {
            if (r?.ok && !r.sent && r.waLink) window.open(r.waLink, '_blank', 'noopener')
          })
        }
        goScreen('name')
        return
      case 'otp-verify':
        goScreen('name')
        return

      case 'whatsapp-receipt': {
        const wp = action.value?.phone
        if (!sessionToken || !wp) { patch({ waStatus: 'error', waError: 'Enter a valid number.' }); return }
        patch({ waStatus: 'sending', waError: undefined })
        POST('/api/public/whatsapp-receipt', { sessionToken, phone: wp }).then((r) => {
          if (r?.ok) { patch({ waStatus: 'sent', waError: undefined }); return }
          const reason = r?.reason
          const msg = reason === 'not_configured' ? "WhatsApp isn't set up yet"
            : reason === 'bad_phone' ? 'That number does not look right.'
            : reason === 'no_payment' ? 'No completed payment on this table yet.'
            : reason === 'invalid_session' ? 'This table session has expired.'
            : 'We could not send your receipt. Try again.'
          patch({ waStatus: 'error', waError: msg })
        })
        return
      }
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

  // Live bill from the POS — refreshed whenever the diner is on a bill/payment screen.
  useEffect(() => {
    const billScreens = ['welcome', 'bill', 'bill-ready', 'waiting-bill', 'full-check', 'pay', 'split', 'split-share', 'split-lobby', 'tip', 'review', 'method']
    if (!sessionToken || !billScreens.includes(s.screen)) return
    let cancelled = false
    const load = async () => {
      const r = await POST('/api/public/bill', { sessionToken })
      if (cancelled) return
      if (r?.ok && r.bill) {
        patch({ bill: r.bill })
        if (s.screen === 'waiting-bill') goScreen('bill-ready')
      }
    }
    load()
    const id = window.setInterval(load, s.screen === 'waiting-bill' ? 8000 : 30000)
    return () => { cancelled = true; window.clearInterval(id) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.screen, sessionToken])

  // Live split state — polled while the diner is on the split lobby.
  useEffect(() => {
    if (!sessionToken || s.screen !== 'split-lobby') return
    let cancelled = false
    const load = async () => {
      const r = await POST('/api/public/split', { sessionToken })
      if (cancelled) return
      if (r?.ok) patch({ split: r.split ? { ...r.split, paidPesewas: r.paidPesewas, remainingPesewas: r.remainingPesewas, shares: r.shares } : undefined })
    }
    load()
    const id = window.setInterval(load, 3000)
    return () => { cancelled = true; window.clearInterval(id) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.screen, sessionToken])

  // Invite link: /s/<token>?claim=<shareToken> — auto-claim that share, then show the lobby.
  useEffect(() => {
    if (!sessionToken || typeof window === 'undefined') return
    const claim = new URLSearchParams(window.location.search).get('claim')
    if (!claim) return
    window.history.replaceState({}, '', window.location.pathname)
    POST('/api/public/split-claim', { sessionToken, shareToken: claim }).then((r) => {
      if (r?.ok) patch({ claimedShareId: r.shareId })
      goScreen('split-lobby')
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionToken])

  // Load the real menu once (categories, items, recommendations) and pick a default category.
  useEffect(() => {
    if (!sessionToken || s.menu) return
    POST('/api/public/menu', { sessionToken }).then((r) => {
      if (r?.ok) patch({ menu: { categories: r.categories ?? [], items: r.items ?? [], recommendations: r.recommendations ?? [] }, activeCategoryId: s.activeCategoryId ?? (r.categories?.[0]?.id) })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionToken, s.menu])

  // Server-authoritative quote (share + tip) behind every amount shown during checkout.
  useEffect(() => {
    if (!sessionToken) return
    const quoteScreens = ['pay', 'split', 'split-share', 'tip', 'review', 'method', 'momo', 'authorise']
    if (!quoteScreens.includes(s.screen)) return
    const preTip = s.screen === 'pay' || s.screen === 'split' || s.screen === 'split-share' || s.screen === 'tip'
    POST('/api/public/quote', {
      sessionToken,
      shareId: s.claimedShareId,
      mode: s.shareMode ?? 'full',
      people: s.people,
      customAmountPesewas: s.customAmountPesewas,
      tipPercent: preTip ? 0 : (s.tipPercent ?? s.tip),
    }).then((r) => { if (r?.ok && r.quote) patch({ quote: r.quote }) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.screen, s.shareMode, s.people, s.customAmountPesewas, s.tipPercent, sessionToken])

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
        if (r.redirectUrl) { openCheckout(r.redirectUrl); return } // card / hosted MoMo → Paystack page
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
      if (r?.paymentRef) patch({ paymentRef: r.paymentRef }) // poll by attempt id, not the gateway reference
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
      if (saved) {
        // Keep the diner on whatever screen they were on, but let the freshly-resolved
        // table + order state win over a stale saved copy (order placed since last visit, etc.).
        const prev = JSON.parse(saved)
        dispatch({ type: 'restore', value: { ...prev, hasOrder: initialState?.hasOrder ?? prev.hasOrder, tableLabel: initialState?.tableLabel ?? prev.tableLabel, restaurantName: initialState?.restaurantName ?? prev.restaurantName } })
      }
    } catch {}
    setHydrated(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!hydrated) return
    try {
      const { menu, selectedItem, ...persist } = s
      sessionStorage.setItem(storageKey, JSON.stringify(persist))
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
      {s.screen === 'connect' || s.screen === 'welcome' ? (
        <div className="app-shell">
          {s.screen === 'connect' ? <Connect dispatch={navigate} /> : <Welcome s={s} dispatch={navigate} />}
        </div>
      ) : (
        <Shell s={s} dispatch={navigate}>
          <C s={s} dispatch={navigate} />
        </Shell>
      )}
    </>
  )
}
