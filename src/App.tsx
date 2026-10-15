import { useEffect, useReducer, useRef, useState } from 'react'
import { reducer, initial, go, type State, type Screen } from './session/machine'
import { Shell, accentStyle, ConnBanner } from './ui/primitives'
import { checkoutReturnRef } from './session/checkoutReturn'
import { postResilient } from './lib/net'
import { track } from './lib/track'
import { Connect, Welcome, SessionExpired, map } from './screens/screens'
import { DEMO_MODE_ENABLED, DEMO_BILL, createDemoSplit, demoQuote } from './lib/demo-bill'
import { tipRequestFields } from './lib/tip'
import { KLOWN_VERSION } from './lib/version'
import { NOT_STARTED_REASONS, REASON_COPY } from './lib/reasons'
import { DinerV2, V2_SCREENS } from './screens/v2'

// Set by the mounted App. Any reply saying the table session has expired switches the app to the
// "reconnect to your table" screen, instead of each screen failing quietly on its own.
let onSessionExpired: (() => void) | null = null

const POST = (url: string, body: unknown): Promise<any> =>
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    .then((r) => r.json())
    .then((j) => { if (j?.reason === 'invalid_session') onSessionExpired?.(); return j })
    .catch(() => null)

// Sentinel share id used only for the optimistic (pre-server) local update on the first tap.
// It is never a real share and must never be sent to the pay path (see the patch-go guard).
const LOCAL_PENDING = '__local_pending__'

// Everything that belongs to one checkout of one bill. Cleared when the server hands back a
// different bill than the one this state was built on (table closed, new order opened), so a
// returning diner never pays with yesterday's share, tip or receipt.
const CHECKOUT_RESET = {
  split: undefined, splitId: undefined, splitError: undefined, claimedShareId: undefined, pendingConfirm: false,
  shareMode: undefined, people: 2, customAmountPesewas: undefined, tipPercent: undefined, tipCustomPesewas: undefined,
  quote: undefined, quoteError: undefined, reviewedTotalPesewas: undefined, amountChanged: false,
  paymentRef: undefined, lateRef: undefined, capturedRef: undefined, lastPaid: undefined, failureReason: undefined, failureKind: undefined,
  receiptNumber: undefined, totalPaidPesewas: undefined, rating: undefined,
} as const

// Paystack's checkout sends X-Frame-Options: SAMEORIGIN, so it cannot load inside an
// embedded preview iframe. Navigate the top-level window when we're framed; if the
// browser blocks cross-origin top navigation, fall back to opening a new tab.
function optimisticUnits(split: any, billItemId: string, units: number) {
  if (!split) return split
  // On the very first tap we may not have a server share yet — use a provisional local id
  // so the tapped count still shows instantly. The server response replaces it moments later.
  const myId = split.myShareId || LOCAL_PENDING
  const myName = (split.shares || []).find((sh: any) => sh.mine)?.name || 'You'
  const items = (split.items || []).map((it: any) => {
    if (it.billItemId !== billItemId) return it
    let takers = (it.takers || []).filter((t: any) => t.shareId !== myId)
    const clamped = Math.max(0, Math.min(units, it.qty))
    if (clamped > 0) takers = [...takers, { shareId: myId, name: myName, units: clamped, paid: false }]
    const used = takers.reduce((a: number, t: any) => a + (t.units || 0), 0)
    return { ...it, takers, unitsFree: Math.max(0, it.qty - used) }
  })
  const myAmount = items.reduce((a: number, it: any) => {
    const u = (it.takers || []).find((t: any) => t.shareId === myId)?.units || 0
    const unit = it.qty > 0 ? it.lineTotalPesewas / it.qty : it.lineTotalPesewas
    return a + u * unit
  }, 0)
  // Gross the raw item value up to the bill's tax/service-inclusive basis (total / subtotal),
  // matching the server's allocation, so "You pay" doesn't jump when the server confirms.
  const subtotal = items.reduce((a: number, it: any) => a + (it.lineTotalPesewas || 0), 0)
  const total = split.totalPesewas ?? subtotal
  const gross = subtotal > 0 ? total / subtotal : 1
  return { ...split, myShareId: myId, items, myShareAmountPesewas: Math.round(myAmount * gross) }
}

// Paystack's checkout as a popup over Klown (InlineJS v2), so the diner never leaves the app and
// lands straight on the success screen. Falls back to the full-page checkout if the script can't
// load. The access code comes from our server's /transaction/initialize (amount, split, reference
// all fixed server-side); no key is used in the browser.
let paystackScript: Promise<boolean> | null = null
function loadPaystackInline(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false)
  if ((window as any).PaystackPop) return Promise.resolve(true)
  if (paystackScript) return paystackScript
  paystackScript = new Promise<boolean>((resolve) => {
    const el = document.createElement('script')
    el.src = 'https://js.paystack.co/v2/inline.js'
    el.async = true
    const timer = window.setTimeout(() => resolve(!!(window as any).PaystackPop), 6000)
    el.onload = () => { window.clearTimeout(timer); resolve(!!(window as any).PaystackPop) }
    el.onerror = () => { window.clearTimeout(timer); paystackScript = null; resolve(false) }
    document.head.appendChild(el)
  })
  return paystackScript
}
async function openInlineCheckout(accessCode: string, cb: { onSuccess: () => void; onCancel: () => void; onUnavailable: () => void }) {
  const ok = await loadPaystackInline()
  if (!ok) { cb.onUnavailable(); return }
  try {
    const popup = new (window as any).PaystackPop()
    popup.resumeTransaction(accessCode, {
      onSuccess: () => cb.onSuccess(),
      onCancel: () => cb.onCancel(),
      onError: () => cb.onUnavailable(),
    })
  } catch { cb.onUnavailable() }
}

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



// Lovable preview / sandbox / localhost: the unpublished build. Mirrors isStagingHost() on the server.
function onPreviewHost(): boolean {
  if (typeof window === 'undefined') return false
  const h = window.location.hostname.toLowerCase()
  return h.startsWith('id-preview--') || h.startsWith('preview--') || h.endsWith('.lovableproject.com') || h === 'localhost' || h === '127.0.0.1'
}

export default function App({
  initialState,
  storageKey = 'klown-dining-session',
  sessionToken,
  qrToken,
}: { initialState?: Partial<State>; storageKey?: string; sessionToken?: string; qrToken?: string } = {}) {
  const [s, dispatch] = useReducer(reducer, { ...initial, ...initialState })
  // Latest state for timers, polls and helpers (their closures would otherwise see an old copy).
  const sRef = useRef(s)
  sRef.current = s
  // Captured once at load: the ?reference= effect strips the URL, so read it before that runs.
  const checkoutRefAtLoad = useRef<string | null>(checkoutReturnRef())
  const [hydrated, setHydrated] = useState(false)
  const idemRef = useRef<string>('')
  const [retryTick, setRetryTick] = useState(0)
  // Timestamp of the diner's last split tap. While it's recent, the background /split poll
  // leaves their optimistic edits alone instead of overwriting them (that made taps feel laggy
  // and undone). Debounce timers coalesce rapid taps into one network write per item.
  const editWindowRef = useRef(0)
  const assignTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const itemWritesRef = useRef<Promise<unknown>>(Promise.resolve())
  // How many item-assignment writes are in flight. While > 0 (or a debounce timer is pending),
  // the background /split poll must not overwrite the diner's optimistic picks.
  const inFlightWritesRef = useRef(0)
  // Set by reset/rescan: the page is about to reload, so nothing may be saved any more.
  const leavingRef = useRef(false)
  // Latest split state for async callbacks (avoids stale closures in timers/polls).
  const splitRef = useRef<any>(undefined)
  splitRef.current = s.split

  const demo = DEMO_MODE_ENABLED && !sessionToken

  useEffect(() => { if (sessionToken && s.sessionToken !== sessionToken) patch({ sessionToken }) }, [sessionToken])
  useEffect(() => {
    onSessionExpired = () => patch({ sessionExpired: true })
    try { (window as any).__KLOWN_VERSION = KLOWN_VERSION } catch {}
    return () => { onSessionExpired = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    if (demo && hydrated && !s.bill) patch({ bill: DEMO_BILL })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demo, hydrated, s.bill])
  // A retry after a failed/declined attempt must not reuse the burned attempt or its idempotency key.
  useEffect(() => { if (!s.paymentRef) idemRef.current = '' }, [s.paymentRef])
  // Track connectivity so the pay path can retry safely instead of showing a false failure.
  useEffect(() => {
    if (typeof window === 'undefined') return
    patch({ netOnline: navigator.onLine, connLost: false })
    const onOnline = () => { patch({ netOnline: true, connLost: false }); setRetryTick((n) => n + 1) }
    const onOffline = () => patch({ netOnline: false })
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // Diner funnel tracking: fire one screen_view per screen change (deduped).
  const lastScreenRef = useRef<string>('')
  useEffect(() => {
    if (!s.sessionToken || !s.screen) return
    if (lastScreenRef.current === s.screen) return
    lastScreenRef.current = s.screen
    track(s.sessionToken, 'screen_view', { screen: s.screen })
  }, [s.screen, s.sessionToken])

  const patch = (value: Partial<State>) => dispatch({ type: 'patch', value })
  const goScreen = (screen: Screen) => {
    if (typeof window !== 'undefined') window.history.pushState({ screen }, '', window.location.pathname)
    dispatch(go(screen))
  }

  const applyItemsSplit = (r: any, startedAt = 0) => {
    // A newer tap happened after this request left — its own response will reconcile.
    if (startedAt && editWindowRef.current > startedAt) return
    if (r?.ok && r.split) patch({ split: { ...r.split, paidPesewas: r.paidPesewas, remainingPesewas: r.remainingPesewas, shares: r.shares, items: r.items, myShareId: r.myShareId, myShareAmountPesewas: r.myShareAmountPesewas, unassignedPesewas: r.unassignedPesewas }, splitError: undefined })
    else patch({ splitError: r?.reason === 'no_bill' ? 'There is no open bill for this table.' : 'Could not save your items. Please try again.' })
  }

  // The diner stopped waiting on a payment that may still be live (a MoMo prompt on their phone,
  // a closed checkout, "it didn't go through", a timeout, going back to change the number). Cancel
  // it so the bill is free for others at the table right away (the server otherwise holds it for
  // 10 minutes), and keep watching it: a prompt approved late still captures, and the diner must
  // land on success instead of paying twice. Never applied to a payment already confirmed.
  const abandonAttempt = (ref?: string) => {
    if (!ref || ref === sRef.current.capturedRef) return
    if (sessionToken) POST('/api/public/payment-cancel', { sessionToken, paymentRef: ref })
    patch({ lateRef: ref })
  }

  // The one place a server-confirmed capture lands. Records what was actually paid (amounts from
  // the payment row, not the pre-pay quote) and stops watching any abandoned attempt.
  const onCaptured = (ref: string | undefined, r: any) => {
    const paid = typeof r?.amountPesewas === 'number'
      ? { lastPaid: { amountPesewas: r.amountPesewas, tipPesewas: r.tipPesewas ?? 0, totalPesewas: r.totalPesewas ?? r.amountPesewas + (r.tipPesewas ?? 0) } }
      : {}
    patch({ capturedRef: ref, lateRef: undefined, failureReason: undefined, failureKind: undefined, checkoutOpen: false, ...paid })
    goScreen('success')
  }

  const checkStatusOnce = async (ref?: string) => {
    const paymentRef = ref ?? s.paymentRef
    if (!sessionToken || !paymentRef) return
    const r = await POST('/api/public/payment-status', { sessionToken, paymentRef })
    if (r?.status === 'captured') onCaptured(paymentRef, r)
    else if (r?.status === 'failed') { patch({ failureReason: r?.failureReason, failureKind: 'declined' }); goScreen('payment-error') }
  }

  const navigate = (action: any) => {
    if (!action) return
    // Going back into the checkout means starting a fresh charge — drop the old attempt
    // so a retry (or a changed amount/method) initiates a new, idempotent payment.
    const target: string | null = action.type === 'screen' ? action.value : action.type === 'patch-go' ? action.to : null
    if (target && ['pay', 'split', 'split-share', 'split-lobby', 'split-items', 'tip', 'review', 'method', 'momo', 'authorise'].includes(target) && s.paymentRef) {
      abandonAttempt(s.paymentRef) // the old prompt may still be live on the phone
      idemRef.current = ''
      patch({ paymentRef: undefined })
    }
    switch (action.type) {
      case 'pay-full': {
        // "Pay in full" means the whole remaining balance, even after the diner tried a split and
        // backed out. Drop any share they had claimed (and free an even/amounts share for the
        // others at the table) so the charge is the full balance, not their old share.
        const prevShare = s.claimedShareId
        if (sessionToken && prevShare && prevShare !== LOCAL_PENDING && s.split?.mode && s.split.mode !== 'items')
          POST('/api/public/split-release', { sessionToken, shareId: prevShare })
        if (s.paymentRef) abandonAttempt(s.paymentRef)
        idemRef.current = ''
        patch({ shareMode: 'full', claimedShareId: undefined, customAmountPesewas: undefined, paymentRef: undefined, quote: undefined, quoteError: undefined })
        goScreen((action.to as Screen) ?? 'tip')
        return
      }
      case 'give-up': {
        // "It didn't go through" on the processing screen.
        abandonAttempt(s.paymentRef)
        idemRef.current = ''
        patch({ paymentRef: undefined, failureReason: action.reason, failureKind: 'timeout' })
        goScreen('payment-error')
        return
      }
      case 'reset': {
        // "Back to my table" at the end of a visit: forget this visit's screens and load the
        // table fresh (an open bill shows the bill, a closed one the welcome screen).
        if (!sessionToken) break
        // Stop saving first: a late poll/receipt update between removeItem and the reload used to
        // write the Paid screen back, so "Done" reopened Paid instead of the table.
        leavingRef.current = true
        try { sessionStorage.removeItem(storageKey) } catch {}
        window.location.reload()
        return
      }
      case 'retry': {
        // "Try again" on a bill or total that failed to load: ask the server again now.
        patch({ billError: false, quoteError: undefined })
        setRetryTick((n) => n + 1)
        return
      }
      case 'rescan': {
        // The table session timed out: drop the stored session so the reload starts a new one.
        leavingRef.current = true
        try {
          sessionStorage.removeItem(storageKey)
          if (qrToken) localStorage.removeItem(`klown-session:${qrToken}`)
        } catch {}
        window.location.reload()
        return
      }
      case 'split-create': {
        const dest: Screen = action.mode === 'items' ? 'split-items' : 'split-lobby'
        if (demo) {
          const split = createDemoSplit(action.mode, { people: action.people, amounts: action.amounts })
          patch({ split: (splitRef.current = split), splitId: split.id, splitError: undefined, claimedShareId: undefined })
          goScreen(dest)
          return
        }
        if (!sessionToken) {
          // Navigate first: a screen change clears errors, so the message must be set after it.
          if (action.mode === 'items') goScreen(dest)
          patch({ splitError: 'Scan the QR code on your table to split this bill.' })
          return
        }
        patch({ splitError: undefined })
        if (action.mode === 'items') goScreen(dest)
        POST('/api/public/split-create', { sessionToken, mode: action.mode, partySize: action.people, amounts: action.amounts }).then((r) => {
          if (r?.ok) {
            if (action.mode === 'items' && r.split) {
              // Server returns the full item board on create — render it now, skip the extra /split.
              patch({ splitId: r.splitId, split: (splitRef.current = { ...r.split, paidPesewas: r.paidPesewas, remainingPesewas: r.remainingPesewas, shares: r.shares, items: r.items, myShareId: r.myShareId, myShareAmountPesewas: r.myShareAmountPesewas, unassignedPesewas: r.unassignedPesewas }), splitError: undefined, claimedShareId: undefined })
            } else { patch({ splitId: r.splitId }); goScreen(dest) }
          }
           else if (r?.reason === 'split_exists') {
             POST('/api/public/split', { sessionToken }).then((current) => {
               if (current?.ok && current.split?.mode === action.mode) { patch({ splitError: undefined }); goScreen(dest) }
               else if (s.uiV2 && current?.ok && current.split) {
                 // New screens: take the diner to the split the table already started, and say why.
                 const items = current.split.mode === 'items'
                 goScreen(items ? 'split-items' : 'split-lobby')
                 patch({ splitNotice: items
                   ? 'Someone at your table is already paying for what they had, so the rest of the table pays the same way. Pick what you had.'
                   : 'This bill is already split into shares. Take one to pay it.' })
               }
               else patch({ splitError: 'A different split is already open for this bill.' })
             })
           }
           else patch({ splitError: r?.reason === 'no_bill' ? 'There is no open bill for this table.' : r?.reason === 'shares_do_not_sum' ? 'Shares must add up to the bill total.' : r?.reason === 'already_paying' ? 'Payment has already started on this bill.' : 'Could not start the split. Please try again.' })
        })
        return
      }
      case 'split-assign': {
        if (demo) { patch({ split: (splitRef.current = optimisticUnits(splitRef.current, action.billItemId, action.units)) }); return }
        if (!sessionToken) return
        editWindowRef.current = Date.now()
        // Instant feedback: apply the tapped count locally right away — even before the server
        // has created our share (provisional id) — so the number never lags behind the tap.
        patch({ split: (splitRef.current = optimisticUnits(splitRef.current, action.billItemId, action.units)) })
        // Debounce the network write per item: rapid taps send one request with the final count,
        // which also stops out-of-order responses from flickering the number.
        const prev = assignTimersRef.current[action.billItemId]
        if (prev) clearTimeout(prev)
        assignTimersRef.current[action.billItemId] = setTimeout(() => {
          delete assignTimersRef.current[action.billItemId]
           const t0 = Date.now()
           inFlightWritesRef.current++
           itemWritesRef.current = itemWritesRef.current.catch(() => {}).then(async () => {
             try {
               const r = await POST('/api/public/split-assign', { sessionToken, billItemId: action.billItemId, units: action.units, name: action.name })
               applyItemsSplit(r, t0)
             } finally {
               inFlightWritesRef.current = Math.max(0, inFlightWritesRef.current - 1)
               editWindowRef.current = Date.now()
             }
           })
        }, 300)
        return
      }
      case 'split-unassign':
        if (demo) { patch({ split: (splitRef.current = optimisticUnits(splitRef.current, action.billItemId, 0)) }); return }
        if (!sessionToken) return
        editWindowRef.current = Date.now()
        patch({ split: (splitRef.current = optimisticUnits(splitRef.current, action.billItemId, 0)) })
         { const t0 = Date.now(); inFlightWritesRef.current++; itemWritesRef.current = itemWritesRef.current.catch(() => {}).then(async () => {
           try {
             const r = await POST('/api/public/split-unassign', { sessionToken, billItemId: action.billItemId })
             applyItemsSplit(r, t0)
           } finally {
             inFlightWritesRef.current = Math.max(0, inFlightWritesRef.current - 1)
             editWindowRef.current = Date.now()
           }
         }) }
        return
      case 'assign-remaining':
        if (demo) {
          let next = splitRef.current
          for (const it of next?.items ?? []) {
            const mine = (it.takers || []).find((t: any) => t.shareId === next?.myShareId)?.units || 0
            if (it.unitsFree > 0) next = optimisticUnits(next, it.billItemId, mine + it.unitsFree)
          }
          patch({ split: (splitRef.current = next) })
          return
        }
        if (!sessionToken) return
        editWindowRef.current = Date.now()
        inFlightWritesRef.current++
        POST('/api/public/assign-remaining', { sessionToken, name: action.name }).then(applyItemsSplit).finally(() => { inFlightWritesRef.current = Math.max(0, inFlightWritesRef.current - 1); editWindowRef.current = Date.now() })
        return
      case 'split-claim':
        if (demo && s.split) {
          patch({ claimedShareId: action.shareId, split: { ...s.split, shares: s.split.shares.map((sh) => ({ ...sh, mine: sh.id === action.shareId, claimedByName: sh.id === action.shareId ? 'You' : null })) } })
          return
        }
        if (sessionToken) POST('/api/public/split-claim', { sessionToken, shareId: action.shareId }).then((r) => { if (r?.ok) patch({ claimedShareId: r.shareId }) })
        return
      case 'split-release':
        if (demo && s.split) {
          patch({ claimedShareId: undefined, split: { ...s.split, shares: s.split.shares.map((sh) => ({ ...sh, mine: false, claimedByName: null })) } })
          return
        }
        if (sessionToken) POST('/api/public/split-release', { sessionToken, shareId: action.shareId }).then(() => patch({ claimedShareId: undefined }))
        return
      case 'tab-select': {
        // The diner picked which group's bill is theirs.
        if (!sessionToken || !action.billId) return
        patch({ tabSelectBusy: true })
        POST('/api/public/tab-select', { sessionToken, billId: action.billId }).then(async (r) => {
          if (!r?.ok) { patch({ tabSelectBusy: false }); return }
          const b = await POST('/api/public/bill', { sessionToken })
          patch({ tabSelectBusy: false, hasOrder: true, split: undefined, splitId: undefined, claimedShareId: undefined, quote: undefined, ...(b?.ok && b.bill ? { bill: b.bill, billId: b.bill.id, noBill: false, tabCount: b.tabCount ?? 1 } : {}) })
          goScreen('bill')
        })
        return
      }
      case 'test-bill': {
        // Test-mode restaurants only: the server refuses this for live restaurants.
        if (!sessionToken) return
        patch({ testBillBusy: true, testBillError: undefined })
        POST('/api/public/test-bill', { sessionToken, reset: !!action.value?.reset }).then(async (r) => {
          if (!r?.ok) { patch({ testBillBusy: false, testBillError: 'Could not create a test bill.' }); return }
          const b = await POST('/api/public/bill', { sessionToken })
          patch({ testBillBusy: false, hasOrder: true, ...(b?.ok && b.bill ? { bill: b.bill } : {}) })
          goScreen('bill')
        })
        return
      }
      case 'waiter':
        if (sessionToken) POST('/api/public/waiter-request', { sessionToken, kind: action.kind ?? 'assistance' })
        break
      case 'dispute':
        if (sessionToken) POST('/api/public/bill-dispute', { sessionToken, note: action.note })
        goScreen('waiter-notified')
        return
      case 'patch-go': {
        // If the diner confirms before the server has minted their share id, don't ignore the
        // tap. Show a brief "getting ready" state and proceed the moment the real id lands (the
        // in-flight assign resolves within ~1-2s), or surface an error if it never does.
        if (action.value?.claimedShareId === LOCAL_PENDING) {
          patch({ pendingConfirm: true })
          const waitForShare = (tries = 0) => {
            const id = splitRef.current?.myShareId
            if (id && id !== LOCAL_PENDING) { patch({ claimedShareId: id }); goScreen((action.to as Screen) ?? 'tip'); return }
            if (!splitRef.current || tries > 40) { patch({ pendingConfirm: false, splitError: 'Could not prepare your share. Please try again.' }); return }
            window.setTimeout(() => waitForShare(tries + 1), 150)
          }
          waitForShare()
          return
        }
        patch(action.value ?? {})
        if (action.to) goScreen(action.to as Screen)
        return
      }
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
      case 'rewards-consent': {
        const rphone = action.value?.phone ?? s.phone
        if (rphone) patch({ phone: rphone })
        if (!sessionToken || !rphone) { goScreen('guest-receipt'); return }
        // Only move on once the number is actually saved; a refused number stays on screen with
        // a reason instead of looking saved.
        patch({ rewardsBusy: true, rewardsError: undefined })
        POST('/api/public/rewards-consent', {
          sessionToken,
          phone: rphone,
          firstName: action.value?.firstName,
          receiptConsent: true,
          rewardsConsent: true,
          marketingConsent: !!action.value?.marketing,
          consentVersion: 'v1',
        }).then((r) => {
          if (r?.ok) { patch({ rewardsBusy: false }); goScreen('guest-receipt'); return }
          if (r?.reason === 'invalid_session') { patch({ rewardsBusy: false }); return }
          patch({
            rewardsBusy: false,
            rewardsError: r?.reason === 'invalid_phone'
              ? 'That number does not look right. Check it and try again.'
              : 'We could not save your number just now. Try again, or skip to your receipt.',
          })
        })
        return
      }
      case 'feedback': {
        // Persists the star rating in place — the combined review screen stays put.
        const rating = action.value?.rating ?? 5
        const comment = typeof action.value?.comment === 'string' ? action.value.comment : undefined
        patch({ rating })
        if (sessionToken) POST('/api/public/feedback', { sessionToken, rating, comment }).then((r) => action.onDone?.(!!r?.ok))
        else action.onDone?.(true)
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
    const billScreens = ['welcome', 'choose-tab', 'empty', 'bill', 'bill-ready', 'waiting-bill', 'pay', 'split', 'split-share', 'tip', 'review', 'method']
    if (!sessionToken || !billScreens.includes(s.screen)) return
    let cancelled = false
    const load = async () => {
      const r = await POST('/api/public/bill', { sessionToken })
      if (cancelled) return
      // No usable reply (offline, server error page). Only matters when there is no bill on
      // screen yet: then the bill screen says so and offers a retry instead of showing GH₵0.00.
      if (!r) { if (!sRef.current.bill) patch({ billError: true }); return }
      if (!r.ok) return
      // Several groups at this table and this phone has not picked its bill: ask.
      if (!r.bill && r.chooseTab) {
        patch({ tabs: r.tabs ?? [], tabCount: (r.tabs ?? []).length, billError: false })
        if (s.screen !== 'choose-tab') goScreen('choose-tab')
        return
      }
      // No open bill at this table right now (nothing ordered yet, or it was settled).
      if (!r.bill) { patch({ bill: undefined, noBill: true, billError: false, hasOrder: false }); return }
      if (r.bill) {
        // A different bill than the one this checkout state was built on: the table closed and a
        // new order opened. Start the checkout again rather than carry the old share, tip,
        // payment or receipt across.
        const prevId = sRef.current.billId
        const newBill = !!r.bill.id && !!prevId && r.bill.id !== prevId
        patch({ ...(newBill ? CHECKOUT_RESET : {}), bill: r.bill, billId: r.bill.id ?? prevId, noBill: false, billError: false, tabCount: r.tabCount ?? 1, ...(Array.isArray(r.tabs) && r.tabs.length ? { tabs: r.tabs } : {}) })
        // On the picker with only one bill left at the table: nothing to choose, show it.
        if (s.screen === 'choose-tab' && (r.tabCount ?? 1) <= 1) { goScreen('bill'); return }
        if (s.screen === 'choose-tab') return
        if (s.screen === 'waiting-bill') goScreen('bill-ready')
        // Waiting on the empty screen? The first order has landed — show the live bill.
        else if (s.screen === 'empty' && (r.bill.items?.length ?? 0) > 0) goScreen('bill')
      }
    }
    load()
    const id = window.setInterval(load, (s.screen === 'waiting-bill' || s.screen === 'empty') ? 8000 : 30000)
    return () => { cancelled = true; window.clearInterval(id) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.screen, sessionToken, retryTick])

  // Live split state — polled while the diner is on the split lobby.
  useEffect(() => {
    if (!sessionToken || (s.screen !== 'split-lobby' && s.screen !== 'split-items')) return
    let cancelled = false
    let inFlight = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const load = async () => {
      // One request at a time, and none while the phone screen is off/backgrounded —
      // piled-up polls on slow networks were the main source of lag.
      if (inFlight || (typeof document !== 'undefined' && document.hidden)) return schedule()
      inFlight = true
      const startedAt = Date.now()
      const r = await POST('/api/public/split', { sessionToken }).catch(() => null)
      inFlight = false
      if (cancelled) return
      // Ignore responses that started before (or during) the diner's latest tap — they're stale.
      if (startedAt <= editWindowRef.current || Date.now() - editWindowRef.current < 2500 || inFlightWritesRef.current > 0 || Object.keys(assignTimersRef.current).length > 0) return schedule()
      if (r?.ok && r.split) patch({ split: { ...r.split, paidPesewas: r.paidPesewas, remainingPesewas: r.remainingPesewas, shares: r.shares, items: r.items, myShareId: r.myShareId, myShareAmountPesewas: r.myShareAmountPesewas, unassignedPesewas: r.unassignedPesewas } })
      else if (r?.ok && !r.split && splitRef.current) patch({ split: undefined, splitError: 'That split could not be found. Please start it again.' })
      schedule()
    }
    const schedule = () => { if (!cancelled) { clearTimeout(timer); timer = setTimeout(load, 3000) } }
    const onVisible = () => { if (!document.hidden) { clearTimeout(timer); load() } }
    document.addEventListener('visibilitychange', onVisible)
    load()
    return () => { cancelled = true; clearTimeout(timer); document.removeEventListener('visibilitychange', onVisible) }
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
      if (r?.ok) patch({ menu: { source: r.source ?? 'pos', categories: r.categories ?? [], items: r.items ?? [], recommendations: r.recommendations ?? [], sections: r.sections ?? [], theme: r.theme ?? null, digital: r.digital ?? null, currency: r.currency ?? 'GHS', menus: r.menus ?? null }, activeCategoryId: s.activeCategoryId ?? (r.categories?.[0]?.id) })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionToken, s.menu])

  // Server-authoritative quote (share + tip) behind every amount shown during checkout.
  useEffect(() => {
    const quoteScreens = ['pay', 'split', 'split-share', 'tip', 'review', 'method', 'momo', 'authorise']
    if (demo) { if (quoteScreens.includes(s.screen)) patch({ quote: demoQuote(s) }); return }
    if (!sessionToken) return
    if (!quoteScreens.includes(s.screen)) return
    const preTip = s.screen === 'pay' || s.screen === 'split' || s.screen === 'split-share' || s.screen === 'tip'
    // Only the latest request may update the amount — stepper taps used to race.
    let cancelled = false
    const t = setTimeout(() => POST('/api/public/quote', {
      sessionToken,
      shareId: s.claimedShareId,
      mode: s.shareMode ?? 'full',
      people: s.people,
      customAmountPesewas: s.customAmountPesewas,
      ...tipRequestFields(s, preTip),
    }).then((r) => {
      if (cancelled) return
      if (r?.ok && r.quote) patch({ quote: r.quote, quoteError: undefined })
      // The server refused to price this (share gone, bill already paid...): say why on the review
      // screen instead of leaving an old amount up. Network failures keep the last quote.
      else if (r && !r.ok && r.reason !== 'invalid_session') patch({ quote: undefined, quoteError: r.reason ?? 'error' })
    }), 150)
    return () => { cancelled = true; clearTimeout(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.screen, s.shareMode, s.people, s.customAmountPesewas, s.tipPercent, s.tipCustomPesewas, s.claimedShareId, sessionToken, demo, s.split?.myShareAmountPesewas, retryTick])

  // Initiate the payment server-side (idempotent) when the diner commits — amounts are computed on the server.
  useEffect(() => {
    if (demo && s.screen === 'processing') {
      const t = setTimeout(() => { patch({ paymentRef: 'DEMO-PAYMENT', receiptNumber: 'DEMO-0001' }); goScreen('success') }, 1500)
      return () => clearTimeout(t)
    }
    if (!sessionToken) return
    if ((s.screen === 'authorise' || s.screen === 'processing') && !s.paymentRef) {
      if (!idemRef.current) idemRef.current = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`
      const callbackUrl = typeof window !== 'undefined' ? window.location.origin + window.location.pathname : undefined
      let cancelled = false
      patch({ connLost: false })
      // Idempotent init: retry transparently on a dropped connection with the SAME key
      // (the server dedupes, so a retry can never double-charge). A real gateway/decline
      // response routes to payment-error; a pure network failure does NOT — we keep the
      // diner here, show a connection notice, and auto-retry when the signal returns.
      postResilient('/api/public/payment-init', {
        sessionToken,
        shareId: s.claimedShareId,
        idempotencyKey: idemRef.current,
        mode: s.shareMode ?? 'full',
        people: s.people,
        customAmountPesewas: s.customAmountPesewas,
        ...tipRequestFields(s, false),
        // The total shown on "Review & pay". The server refuses to charge anything else.
        ...(typeof s.reviewedTotalPesewas === 'number' ? { expectedTotalPesewas: s.reviewedTotalPesewas } : {}),
        method: s.method ?? 'momo',
        provider: s.method === 'card' || s.method === 'applepay' ? 'card' : 'momo',
        phone: s.momoNumber, // MoMo number — transaction-only, cleared once initiated
        callbackUrl,
      }, { retries: 4 }).then((r) => {
        if (cancelled) return
        if (r?.reason === 'invalid_session') { onSessionExpired?.(); return }
        if (r?.reason === 'amount_changed') {
          // The bill moved between review and pay (another round posted, an item voided).
          idemRef.current = ''
          patch({ amountChanged: true, quote: undefined, reviewedTotalPesewas: undefined, momoNumber: undefined })
          goScreen('review')
          return
        }
        if (!r?.ok) {
          const blocked = !!r?.reason && NOT_STARTED_REASONS.has(r.reason)
          patch({ failureReason: r?.failureReason ?? r?.message ?? (r?.reason ? REASON_COPY[r.reason] : undefined), failureKind: blocked ? 'blocked' : 'declined' })
          goScreen('payment-error')
          return
        }
        // A new payment: whatever receipt or rating belonged to an earlier one no longer applies.
        if (r.paymentRef) patch({ paymentRef: r.paymentRef, momoNumber: undefined, connLost: false, receiptNumber: undefined, totalPaidPesewas: undefined, rating: undefined, lastPaid: undefined })
        if (r.redirectUrl) { // card / hosted MoMo → Paystack checkout
          if (!r.accessCode) { openCheckout(r.redirectUrl); return }
          // Popup over Klown. Polling pauses while it is open (an unfinished checkout is not a
          // result); on success we confirm with the server and go straight to the success screen.
          patch({ checkoutOpen: true })
          if (s.screen !== 'processing') goScreen('processing')
          openInlineCheckout(r.accessCode, {
            onSuccess: () => { patch({ checkoutOpen: false }); checkStatusOnce(r.paymentRef) },
            onCancel: () => {
              // Free the bill/share for others at the table (the server keeps an unfinished payment
              // reserved for 10 minutes), and keep watching it: a late Paystack capture still counts.
              abandonAttempt(r.paymentRef)
              idemRef.current = ''; patch({ checkoutOpen: false, paymentRef: undefined }); goScreen('method')
            },
            onUnavailable: () => { patch({ checkoutOpen: false }); openCheckout(r.redirectUrl) },
          })
          return
        }
        if (r.action === 'otp') goScreen('otp') // MoMo send_otp path
      }).catch(() => {
        if (cancelled) return
        patch({ connLost: true })
      })
      return () => { cancelled = true }
    }
    return undefined
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.screen, s.paymentRef, s.claimedShareId, sessionToken, retryTick, demo])

  // Poll payment status while the diner is approving (MoMo prompt on their phone) or waiting
  // on "processing" — the screen moves on by itself the moment the server confirms capture
  // (Paystack webhook or our own verify), no "I've approved it" tap needed. Success is only
  // ever reached on a server-confirmed capture. Also checks immediately when the diner comes
  // back to the tab from their MoMo app / USSD prompt.
  useEffect(() => {
    const waiting = s.screen === 'processing' || s.screen === 'authorise'
    if (!waiting || !sessionToken || !s.paymentRef || s.checkoutOpen) return
    const onAuthorise = s.screen === 'authorise'
    let n = 0
    let stopped = false
    let inFlight = false
    const tick = async () => {
      if (inFlight || stopped) return
      n++
      inFlight = true
      const r = await POST('/api/public/payment-status', { sessionToken, paymentRef: s.paymentRef }).catch(() => null)
      inFlight = false
      if (stopped) return // diner left this screen / attempt changed — ignore this late reply
      if (r?.status === 'captured') {
        stop()
        onCaptured(s.paymentRef, r)
      } else if (r?.status === 'failed') {
        stop()
        patch({ failureReason: r?.failureReason, failureKind: 'declined' })
        goScreen('payment-error')
      } else if (!onAuthorise && n > 120) {
        // ~3 min with no confirmation (e.g. the MoMo prompt was never approved): stop guessing
        // and show the fallback instead of spinning forever. Release the payment so the table is
        // free, and keep watching it in case it was approved late.
        stop()
        abandonAttempt(s.paymentRef)
        idemRef.current = ''
        patch({ paymentRef: undefined, failureReason: 'The payment was not confirmed in time.', failureKind: 'timeout' })
        goScreen('payment-error')
      }
    }
    // While the prompt is on the diner's phone, check a little less often; they can still tap
    // "I've approved it" to jump to the processing screen.
    const id = window.setInterval(tick, onAuthorise ? 2500 : 1500)
    const onVisible = () => { if (document.visibilityState === 'visible') tick() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    function stop() {
      stopped = true
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
    return stop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.screen, s.paymentRef, sessionToken, s.checkoutOpen])

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
      if (r?.status === 'captured') onCaptured(r.paymentRef, r)
      else if (r?.status === 'failed') { patch({ failureReason: r?.failureReason, failureKind: 'declined' }); goScreen('payment-error') }
      // otherwise stay on processing — the polling effect continues via paymentRef
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionToken])

  // Watch a payment the diner stopped waiting on (see abandonAttempt) for 3 minutes. If it was
  // approved after all: show success, and cancel any newer attempt still waiting so the diner is
  // not charged twice (if that one is approved too, the server flags the overpayment for refund).
  useEffect(() => {
    const late = s.lateRef
    if (!sessionToken || !late) return
    let n = 0
    let stopped = false
    const id = window.setInterval(async () => {
      if (stopped) return
      n++
      const r = await POST('/api/public/payment-status', { sessionToken, paymentRef: late })
      if (stopped) return
      if (r?.status === 'captured') {
        stopped = true
        window.clearInterval(id)
        const live = sRef.current.paymentRef
        if (live && live !== late) POST('/api/public/payment-cancel', { sessionToken, paymentRef: live })
        idemRef.current = ''
        patch({ paymentRef: late })
        onCaptured(late, r)
      } else if (r?.status === 'failed' || r?.ok === false || n >= 36) {
        stopped = true
        window.clearInterval(id)
        patch({ lateRef: undefined })
      }
    }, 5000)
    return () => { stopped = true; window.clearInterval(id) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.lateRef, sessionToken])

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

  // Fetch the Google review link when the combined review screen opens.
  useEffect(() => {
    if (!sessionToken) return
    if ((s.screen === 'review-handoff' || s.screen === 'success') && s.reviewUrl === undefined) {
      POST('/api/public/review-link', { sessionToken }).then((r) => patch({ reviewUrl: r?.url ?? null }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.screen, s.reviewUrl, sessionToken])



  const C = map[s.screen] || Connect

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(storageKey)
      const prev = saved ? JSON.parse(saved) : null
      // Only restore a copy written for this table session and within the last 12 hours. A copy
      // from an earlier visit (a different session token, or none recorded) would bring back an
      // old share, tip, rating and receipt number as if they were today's.
      const owner = prev ? (prev.savedFor ?? prev.sessionToken) : undefined
      const tooOld = !!prev && typeof prev.savedAt === 'number' && Date.now() - prev.savedAt > 12 * 3600_000
      const otherSession = !!prev && !!sessionToken && owner !== sessionToken
      if (prev && (tooOld || otherSession)) sessionStorage.removeItem(storageKey)
      else if (prev) {
        // Keep the diner on whatever screen they were on, but let the freshly-resolved
        // table + order state win over a stale saved copy (order placed since last visit, etc.).
        dispatch({ type: 'restore', value: { ...prev, checkoutOpen: false, ...(checkoutRefAtLoad.current ? { paymentRef: prev.paymentRef ?? checkoutRefAtLoad.current } : {}), screen: checkoutRefAtLoad.current ? 'processing' : initialState?.screen === 'choose-tab' ? 'choose-tab' : initialState?.hasOrder ? 'bill' : (initialState?.mode === 'order' && !prev.paymentRef ? (prev.screen && prev.screen !== 'welcome' ? prev.screen : 'waiting-bill') : prev.screen), hasOrder: initialState?.hasOrder ?? prev.hasOrder, mode: initialState?.mode ?? prev.mode, tableLabel: initialState?.tableLabel ?? prev.tableLabel, restaurantName: initialState?.restaurantName ?? prev.restaurantName, logoUrl: initialState?.logoUrl ?? prev.logoUrl, heroUrl: initialState?.heroUrl ?? prev.heroUrl, accentColor: initialState?.accentColor ?? prev.accentColor, taglineTop: initialState?.taglineTop ?? prev.taglineTop, taglineBottom: initialState?.taglineBottom ?? prev.taglineBottom, welcomeCopy: initialState?.welcomeCopy ?? prev.welcomeCopy, testMode: initialState?.testMode ?? false, uiV2: initialState?.uiV2 ?? false } })
      }
    } catch {}
    setHydrated(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!hydrated || leavingRef.current) return
    try {
      const { menu, selectedItem, sessionExpired, ...persist } = s
      sessionStorage.setItem(storageKey, JSON.stringify({ ...persist, savedAt: Date.now(), savedFor: sessionToken ?? s.sessionToken }))
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
      {s.testMode ? (
        <div className="test-banner" role="status">Test mode · Paystack test payments, no real money</div>
      ) : onPreviewHost() ? (
        <div className="test-banner is-preview" role="status">Preview · payments only work at test restaurants</div>
      ) : null}
      {(s.netOnline === false || s.connLost) && (
        <ConnBanner offline={s.netOnline === false} onRetry={() => setRetryTick((n) => n + 1)} />
      )}
      {s.sessionExpired && s.uiV2 && s.mode !== 'order' ? (
        <DinerV2 s={s} dispatch={navigate} />
      ) : s.sessionExpired ? (
        <div className="app-shell" style={accentStyle(s.accentColor)}>
          <SessionExpired s={s} dispatch={navigate} />
        </div>
      ) : s.uiV2 && s.mode !== 'order' && V2_SCREENS.has(s.screen) ? (
        <DinerV2 s={s} dispatch={navigate} />
      ) : s.screen === 'welcome' ? (
        <div className="welcome-shell" style={accentStyle(s.accentColor)}>
          <Welcome s={s} dispatch={navigate} />
        </div>
      ) : s.screen === 'connect' ? (
        <div className="app-shell" style={accentStyle(s.accentColor)}>
          <Connect dispatch={navigate} />
        </div>
      ) : (
        <Shell s={s} dispatch={navigate}>
          <C s={s} dispatch={navigate} />
        </Shell>
      )}
    </>
  )
}
