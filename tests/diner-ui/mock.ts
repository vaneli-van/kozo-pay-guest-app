// Fake Klown backend for the diner app (release 2026.10.14 checks). Every /api/** request the browser makes is answered
// here from a mutable scenario, so every state is reachable without touching production.
import type { Page, Route } from '@playwright/test'

export type Item = { name: string; qty: number; lineTotalPesewas: number }
export type Scenario = {
  restaurantName: string
  tableLabel: string
  hasActiveBill: boolean
  chooseTab?: boolean
  tabs?: any[]
  items: Item[]
  serviceChargePesewas: number
  paidPesewas: number
  serverName: string | null
  tabLabel?: string | null
  menuItems: any[]
  menuCategories: any[]
  // behaviour knobs
  delayMs: Partial<Record<string, number>>      // per endpoint (last path segment) delay
  fail: Partial<Record<string, 'down' | 'abort' | { ok: false; reason: string; message?: string; failureReason?: string }>>
  paymentStatus: 'pending' | 'captured' | 'failed'
  paymentInit: 'otp' | 'pending' | 'card'       // momo otp, momo prompt, or card redirect
  splitExistsMode?: string                      // split-create -> split_exists; /split returns this mode
  quoteOverride?: any
  // per-attempt status (attempt ids att-1, att-2, ...); falls back to paymentStatus
  statusByRef?: Record<string, 'pending' | 'captured' | 'failed' | 'cancelled'>
  attempts?: { ref: string; total: number; share: number; tip: number }[]
  billId?: string
  // New diner screens (restaurants.diner_ui) and test-mode restaurant, as qr-resolve reports them
  dinerUi?: 'classic' | 'v2'
  testMode?: boolean
  sessionTokenOut?: string
  // the item board for items-mode splits (server state)
  split?: any
}

export const LONG = 'Grilled tilapia with banku, shito, pepper sauce and a side of kelewele, extra large portion for sharing'

export function baseScenario(over: Partial<Scenario> = {}): Scenario {
  return {
    restaurantName: 'Baobab',
    tableLabel: '12',
    hasActiveBill: true,
    items: [
      { name: 'Jollof with chicken', qty: 1, lineTotalPesewas: 9500 },
      { name: 'Banku and tilapia', qty: 1, lineTotalPesewas: 13000 },
      { name: 'Club beer', qty: 2, lineTotalPesewas: 7000 },
    ],
    serviceChargePesewas: 0,
    paidPesewas: 0,
    serverName: 'Joel',
    menuCategories: [{ id: 'c1', name: 'Mains', sort: 10 }, { id: 'c2', name: 'Drinks', sort: 210 }],
    menuItems: [
      { id: 'm1', category_id: 'c1', name: 'Jollof with chicken', price_pesewas: 9500, image_key: null, tags: {}, sort: 1, available: true },
      { id: 'm2', category_id: 'c2', name: 'Club beer', price_pesewas: 3500, image_key: null, tags: {}, sort: 1, available: true },
    ],
    delayMs: {},
    fail: {},
    paymentStatus: 'pending',
    paymentInit: 'pending',
    ...over,
  }
}

export type Captured = { path: string; body: any; at: number }

export function billOf(sc: Scenario) {
  const subtotal = sc.items.reduce((a, i) => a + (i.lineTotalPesewas || 0), 0)
  const total = subtotal + sc.serviceChargePesewas
  const remaining = Math.max(0, total - sc.paidPesewas)
  return {
    id: sc.billId ?? 'bill-1', status: 'open', serverName: sc.serverName, tabLabel: sc.tabLabel ?? null,
    items: sc.items, subtotalPesewas: subtotal, serviceChargePesewas: sc.serviceChargePesewas, totalPesewas: total,
    paidPesewas: sc.paidPesewas, remainingPesewas: remaining,
    tax: { net: Math.round(total / 1.219), total: total - Math.round(total / 1.219), estimated: true, lines: [
      { name: 'NHIL 2.5%', rate: 2.5, amountPesewas: Math.round(total * 0.02) },
      { name: 'GETFund 2.5%', rate: 2.5, amountPesewas: Math.round(total * 0.02) },
      { name: 'VAT 15%', rate: 15, amountPesewas: Math.round(total * 0.13) },
    ] },
  }
}

function quoteOf(sc: Scenario, body: any) {
  const b = billOf(sc)
  const remaining = b.remainingPesewas
  let share = remaining
  if (body.shareId && sc.split) {
    const sh = (sc.split.shares || []).find((x: any) => x.id === body.shareId)
    share = sh ? Math.min(sh.amountPesewas, remaining) : remaining
    if (!sh) return { ok: false, reason: 'invalid_share' }
  } else if (body.mode === 'even') share = Math.round(remaining / Math.max(2, body.people || 2))
  else if (body.mode === 'custom') share = Math.min(remaining, body.customAmountPesewas || 0)
  if (remaining <= 0) return { ok: false, reason: 'nothing_due' }
  let tip = 0
  if (typeof body.tipPesewas === 'number') tip = Math.max(0, Math.trunc(body.tipPesewas))
  else if (typeof body.tipPercent === 'number') tip = Math.round((share * body.tipPercent) / 100)
  return { ok: true, quote: { billTotalPesewas: b.totalPesewas, remainingPesewas: remaining, sharePesewas: share, tipPesewas: tip, grandTotalPesewas: share + tip } }
}

function itemsBoard(sc: Scenario) {
  const b = billOf(sc)
  const items = sc.items.map((it, n) => ({ billItemId: `bi${n}`, name: it.name, qty: it.qty, lineTotalPesewas: it.lineTotalPesewas, unitsFree: it.qty, takers: [] as any[] }))
  return { id: 'split-items-1', mode: 'items', totalPesewas: b.totalPesewas, status: 'open', paidPesewas: 0, remainingPesewas: b.totalPesewas, shares: [] as any[], items, myShareId: null, myShareAmountPesewas: 0, unassignedPesewas: b.totalPesewas }
}

function splitPayload(sp: any) {
  return { ok: true, split: { id: sp.id, mode: sp.mode, totalPesewas: sp.totalPesewas, status: sp.status }, paidPesewas: sp.paidPesewas, remainingPesewas: sp.remainingPesewas, shares: sp.shares, items: sp.items, myShareId: sp.myShareId, myShareAmountPesewas: sp.myShareAmountPesewas, unassignedPesewas: sp.unassignedPesewas }
}

export async function installMock(page: Page, sc: Scenario, captured: Captured[]) {
  await page.route('**/api/**', async (route: Route) => {
    const url = new URL(route.request().url())
    const path = url.pathname.split('/').pop() || ''
    let body: any = {}
    try { body = route.request().postDataJSON() } catch {}
    captured.push({ path, body, at: Date.now() })
    const delay = sc.delayMs[path] ?? sc.delayMs['*'] ?? 0
    if (delay) await new Promise((r) => setTimeout(r, delay))
    const f = sc.fail[path] ?? sc.fail['*']
    if (f === 'down') return route.fulfill({ status: 500, contentType: 'text/html', body: '<h1>502 Bad Gateway</h1>' })
    if (f === 'abort') return route.abort('connectionfailed')
    if (f && typeof f === 'object') return route.fulfill({ json: f })
    const json = (o: any) => route.fulfill({ json: o })

    switch (path) {
      case 'qr-resolve':
        return json({ ok: true, sessionToken: sc.sessionTokenOut ?? 'sess-1', restaurant: { name: sc.restaurantName, city: 'Accra', logoUrl: null, heroUrl: null, accentColor: null, taglineTop: null, taglineBottom: null, welcomeCopy: null, paymentMode: sc.testMode ? 'test' : 'live', dinerUi: sc.dinerUi ?? 'classic' }, branch: { name: 'Main' }, table: { label: sc.tableLabel }, hasActiveBill: sc.hasActiveBill, chooseTab: !!sc.chooseTab, billStatus: sc.hasActiveBill ? 'open' : 'none', expiresAt: new Date(Date.now() + 4 * 3600e3).toISOString(), mode: 'table' })
      case 'bill':
        if (sc.chooseTab) return json({ ok: true, bill: null, chooseTab: true, tabs: sc.tabs ?? [] })
        if (!sc.hasActiveBill) return json({ ok: true, bill: null, chooseTab: false, tabs: [] })
        return json({ ok: true, bill: billOf(sc), tabCount: (sc.tabs?.length ?? 1), tabs: (sc.tabs?.length ?? 0) > 1 ? sc.tabs : [] })
      case 'tab-select': {
        sc.chooseTab = false; sc.hasActiveBill = true
        const t = (sc.tabs ?? []).find((x: any) => x.billId === body.billId)
        if (t) sc.tabLabel = t.label
        return json({ ok: true })
      }
      case 'menu':
        return json({ ok: true, source: 'pos', categories: sc.menuCategories, items: sc.menuItems, recommendations: [], currency: 'GHS' })
      case 'quote':
        return json(sc.quoteOverride ?? quoteOf(sc, body))
      case 'split-create': {
        if (sc.splitExistsMode) return json({ ok: false, reason: 'split_exists' })
        const b = billOf(sc)
        if (body.mode === 'items') { sc.split = itemsBoard(sc); return json({ ...splitPayload(sc.split), splitId: sc.split.id }) }
        if (body.mode === 'even') {
          const n = Math.max(2, body.partySize || 2)
          const each = Math.floor(b.remainingPesewas / n)
          const shares = Array.from({ length: n }, (_, i) => ({ id: `sh${i}`, position: i + 1, label: `Share ${i + 1}`, amountPesewas: i === 0 ? b.remainingPesewas - each * (n - 1) : each, status: 'unclaimed', claimedByName: null, mine: false, shareToken: `tok${i}` }))
          sc.split = { id: 'split-even-1', mode: 'even', totalPesewas: b.remainingPesewas, status: 'open', paidPesewas: 0, remainingPesewas: b.remainingPesewas, shares }
          return json({ ok: true, splitId: sc.split.id })
        }
        if (body.mode === 'amounts') {
          const shares = (body.amounts || []).map((a: any, i: number) => ({ id: `sh${i}`, position: i + 1, label: a.label || `Share ${i + 1}`, amountPesewas: a.amount, status: 'unclaimed', claimedByName: null, mine: false, shareToken: `tok${i}` }))
          sc.split = { id: 'split-amt-1', mode: 'amounts', totalPesewas: b.remainingPesewas, status: 'open', paidPesewas: 0, remainingPesewas: b.remainingPesewas, shares }
          return json({ ok: true, splitId: sc.split.id })
        }
        return json({ ok: false, reason: 'bad_mode' })
      }
      case 'split':
        if (sc.splitExistsMode) return json({ ok: true, split: { id: 'x', mode: sc.splitExistsMode, totalPesewas: 1, status: 'open' }, shares: [] })
        if (!sc.split) return json({ ok: true, split: null })
        return json(splitPayload(sc.split))
      case 'split-claim': {
        const sp = sc.split
        if (sp) for (const sh of sp.shares) if (sh.id === body.shareId || sh.shareToken === body.shareToken) { sh.status = 'claimed'; sh.mine = true; sh.claimedByName = 'You'; return json({ ok: true, shareId: sh.id }) }
        return json({ ok: false, reason: 'invalid_share' })
      }
      case 'split-release': {
        const sp = sc.split
        if (sp) for (const sh of sp.shares) if (sh.id === body.shareId) { sh.status = 'unclaimed'; sh.mine = false; sh.claimedByName = null }
        return json({ ok: true })
      }
      case 'split-assign': case 'split-unassign': case 'assign-remaining': {
        const sp = sc.split
        if (!sp || sp.mode !== 'items') return json({ ok: false, reason: 'no_split' })
        if (!sp.myShareId) { sp.myShareId = 'my-share'; sp.shares.push({ id: 'my-share', position: 1, label: 'You', amountPesewas: 0, status: 'claimed', claimedByName: 'You', mine: true, shareToken: 'tokme' }) }
        for (const it of sp.items) {
          if (path === 'assign-remaining') { const mine = it.takers.find((t: any) => t.shareId === 'my-share'); const add = it.unitsFree; if (add > 0) { if (mine) mine.units += add; else it.takers.push({ shareId: 'my-share', name: 'You', units: add, paid: false }) } }
          else if (it.billItemId === body.billItemId) {
            it.takers = it.takers.filter((t: any) => t.shareId !== 'my-share')
            const u = path === 'split-unassign' ? 0 : Math.min(it.qty, body.units)
            if (u > 0) it.takers.push({ shareId: 'my-share', name: 'You', units: u, paid: false })
          }
          it.unitsFree = it.qty - it.takers.reduce((a: number, t: any) => a + t.units, 0)
        }
        let mine = 0, assigned = 0
        for (const it of sp.items) { const unit = it.qty ? it.lineTotalPesewas / it.qty : it.lineTotalPesewas; for (const t of it.takers) { assigned += t.units * unit; if (t.shareId === 'my-share') mine += t.units * unit } }
        sp.myShareAmountPesewas = Math.round(mine); sp.unassignedPesewas = Math.round(sp.totalPesewas - assigned)
        const me = sp.shares.find((s: any) => s.id === 'my-share'); if (me) me.amountPesewas = sp.myShareAmountPesewas
        return json(splitPayload(sp))
      }
      case 'payment-init': {
        const q = quoteOf(sc, { ...body, mode: body.shareId ? 'custom' : body.mode })
        if (!q.ok) return json({ ok: false, reason: q.reason })
        // mirror of the server's reviewed-total guard (20 pesewas of drift allowed)
        if (typeof body.expectedTotalPesewas === 'number' && Math.abs(body.expectedTotalPesewas - q.quote.grandTotalPesewas) > 20) return json({ ok: false, reason: 'amount_changed', totalPesewas: q.quote.grandTotalPesewas })
        sc.attempts = sc.attempts ?? []
        const ref = `att-${sc.attempts.length + 1}`
        sc.attempts.push({ ref, total: q.quote.grandTotalPesewas, share: q.quote.sharePesewas, tip: q.quote.tipPesewas })
        const base = { ok: true, paymentRef: ref, providerRef: `ps-${ref}`, status: 'pending', amountPesewas: q.quote.sharePesewas, tipPesewas: q.quote.tipPesewas, totalPesewas: q.quote.grandTotalPesewas }
        if (sc.paymentInit === 'card') return json({ ...base, redirectUrl: `${url.origin}/__paystack`, accessCode: 'ac_1' })
        if (sc.paymentInit === 'otp') return json({ ...base, action: 'otp', displayText: 'Enter the OTP' })
        return json({ ...base, action: 'pending', displayText: 'Approve on your phone' })
      }
      case 'payment-status': {
        const st = sc.statusByRef?.[body.paymentRef] ?? sc.paymentStatus
        const a = (sc.attempts ?? []).find((x) => x.ref === body.paymentRef)
        return json({ ok: true, status: st, failureReason: st === 'failed' ? 'Declined by your provider' : undefined, ...(a ? { amountPesewas: a.share, tipPesewas: a.tip, totalPesewas: a.total } : {}) })
      }
      case 'payment-cancel': {
        sc.statusByRef = sc.statusByRef ?? {}
        if ((sc.statusByRef[body.paymentRef] ?? 'pending') === 'pending') sc.statusByRef[body.paymentRef] = 'cancelled'
        return json({ ok: true, cancelled: true })
      }
      case 'payment-verify': {
        const a = (sc.attempts ?? [])[0]
        return json({ ok: true, status: sc.paymentStatus, paymentRef: a?.ref ?? 'att-1', ...(a ? { amountPesewas: a.share, tipPesewas: a.tip, totalPesewas: a.total } : {}) })
      }
      case 'receipt':
        return json({ ok: true, receiptNumber: 'KL-0042', totalPaidPesewas: billOf(sc).totalPesewas })
      case 'receipt-data':
        return json({ ok: true, restaurant: { name: sc.restaurantName, city: 'Accra', logoUrl: null }, receiptNumber: 'KL-0042', issuedAt: new Date().toISOString(), tableLabel: sc.tableLabel, serverName: sc.serverName, lines: sc.items.map((i) => ({ name: i.name, qty: i.qty, amount: i.lineTotalPesewas })), subtotalPesewas: billOf(sc).subtotalPesewas, serviceChargePesewas: 0, tax: billOf(sc).tax, totalPaidPesewas: billOf(sc).totalPesewas, tipPesewas: 0, method: 'momo' })
      case 'review-link':
        return json({ ok: true, url: 'https://g.page/r/example/review' })
      default:
        return json({ ok: true })
    }
  })
  // Stand-in for the Paystack hosted page (the real one is cross-origin and blocked here).
  await page.route('**/__paystack', (route) => route.fulfill({ contentType: 'text/html', body: '<html><body style="font:16px Arial"><h1>Paystack checkout (stand-in)</h1><a id="done" href="/s/t1?reference=ps-ref-1&trxref=ps-ref-1">Pay</a></body></html>' }))
  await page.route('https://js.paystack.co/**', (route) => route.abort())
  await page.route(/amplitude|google\.com|gstatic|googleapis|engagement/, (route) => route.abort())
  await page.route('https://fonts.googleapis.com/**', (route) => route.abort())
}
