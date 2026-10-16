// One regression check per fix in release 2026.10.14 (report: claude/diner-app-audit-2026-10-14.md).
// Runs the real app against the fake backend in mock.ts, on iPhone 13 and iPhone SE viewports.
//
// Run on phone viewports (iPhone 13 + iPhone SE):   npx playwright test -c tests/diner-ui/playwright.config.ts
// They also run under the root config (desktop + Pixel 7) with the rest of tests/.
// Every /api/** call is answered by the fake backend in mock.ts; nothing touches production.
import { test as base, expect, type Page } from '@playwright/test'
import { installMock, baseScenario, type Scenario, type Captured } from './mock'

type Ctx = { sc: Scenario; captured: Captured[]; errors: string[]; shot: (n: string) => Promise<void>; calls: (p: string) => Captured[]; last: (p: string) => any }
const test = base.extend<{ ctx: Ctx }>({
  ctx: async ({ page }, use, info) => {
    const sc = baseScenario()
    const captured: Captured[] = []
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push('PAGEERROR ' + String(e).slice(0, 300)))
    page.on('console', (m) => { if (m.type() === 'error' && /Rendered (more|fewer) hooks|Maximum update depth|change in the order of Hooks/.test(m.text())) errors.push(m.text().slice(0, 300)) })
    await installMock(page, sc, captured)
    await use({
      sc, captured, errors,
      shot: async (n) => { await page.screenshot({ path: info.outputPath(`${n}.png`) }) },
      calls: (p) => captured.filter((c) => c.path === p),
      last: (p) => [...captured].reverse().find((c) => c.path === p)?.body,
    })
    expect(errors, 'no React errors on the page').toEqual([])
  },
})

const mounted = async (page: Page) => { await page.locator('.app-shell section, .welcome-shell section, .center-screen').first().waitFor({ state: 'attached', timeout: 40_000 }); await page.waitForTimeout(400) }
const open = async (page: Page) => { await page.goto('/s/t1'); await mounted(page) }
const btn = (page: Page, name: string | RegExp) => page.getByRole('button', { name }).first()
const text = (page: Page) => page.locator('body').innerText()
const inView = async (page: Page, name: string | RegExp) => {
  const box = await btn(page, name).boundingBox()
  const vh = page.viewportSize()!.height
  return !!box && box.y >= 0 && box.y + box.height <= vh
}
// bill → tip → review → method → momo → authorise
const toAuthorise = async (page: Page, number = '0552836232') => {
  await btn(page, /Pay in full|Pay the rest/).click(); await page.waitForTimeout(400)
  await btn(page, /Review & pay/).click(); await page.waitForTimeout(500)
  await btn(page, /Choose payment method/).click(); await page.waitForTimeout(300)
  await btn(page, /Continue with Mobile Money/).click(); await page.waitForTimeout(300)
  await page.getByPlaceholder('024 000 0000').fill(number)
  await btn(page, /^Continue/).click(); await page.waitForTimeout(800)
}

// ─────────────── Fix 1 (M1): "Pay in full" after a split charges the whole balance ───────────────
test('fix 1: pay in full after backing out of an item split charges the full balance', async ({ page, ctx }) => {
  await open(page)
  await btn(page, /^Split/).click(); await page.waitForTimeout(300)
  await page.getByText('Pay for your items').click(); await page.waitForTimeout(800)
  await btn(page, /Add one Jollof/).click(); await page.waitForTimeout(800)
  await btn(page, /^Confirm ·/).click(); await page.waitForTimeout(800)
  expect(ctx.last('quote')?.shareId).toBe('my-share') // paying the share on purpose: still works
  await btn(page, 'Back').click(); await page.waitForTimeout(500)
  await page.locator('.split-close').click(); await page.waitForTimeout(400)
  await btn(page, /Pay in full/).click(); await page.waitForTimeout(800)
  expect(ctx.last('quote')?.shareId, 'quote after pay-in-full has no share').toBeUndefined()
  await expect(page.locator('.kz-page')).toContainText('Bill amount')
  await expect(page.locator('.kz-page')).toContainText('GH₵295.00')
  await ctx.shot('tip-full-balance')
  await btn(page, /Review & pay/).click(); await page.waitForTimeout(500)
  await btn(page, /Choose payment method/).click(); await page.waitForTimeout(300)
  await btn(page, /Continue with Mobile Money/).click(); await page.waitForTimeout(300)
  await page.getByPlaceholder('024 000 0000').fill('0552836232'); await btn(page, /^Continue/).click(); await page.waitForTimeout(800)
  const init = ctx.last('payment-init')
  expect(init.shareId).toBeUndefined()
  expect(init.mode).toBe('full')
  expect(init.expectedTotalPesewas).toBe(29500 + 2950)
})

test('fix 1: pay in full after claiming an even share releases the share', async ({ page, ctx }) => {
  await open(page)
  await btn(page, /^Split/).click(); await page.waitForTimeout(300)
  await page.getByText('Divide equally').click(); await page.waitForTimeout(200)
  await btn(page, /^Confirm/).click(); await page.waitForTimeout(1500)
  await btn(page, 'Claim').click(); await page.waitForTimeout(600)
  await btn(page, /^Pay$/).click(); await page.waitForTimeout(600)
  expect(ctx.last('quote')?.shareId).toBe('sh0')
  await btn(page, 'Back').click(); await page.waitForTimeout(400) // tip → lobby
  await btn(page, 'Back').click(); await page.waitForTimeout(400) // lobby → pay
  await page.getByText('Pay the full bill').click(); await page.waitForTimeout(800)
  expect(ctx.calls('split-release').map((c) => c.body.shareId)).toEqual(['sh0'])
  expect(ctx.last('quote')?.shareId).toBeUndefined()
  await expect(page.locator('.kz-page')).toContainText('GH₵295.00')
})

// ─────────────── Fix 2 (M2): no state from an earlier visit ───────────────
const seed = async (page: Page, state: Record<string, unknown>, session = 'sess-old') => {
  await page.addInitScript(([st, sess]) => {
    if (sessionStorage.getItem('__seeded')) return
    sessionStorage.setItem('__seeded', '1')
    sessionStorage.setItem('klown-dining:t1', JSON.stringify(st))
    localStorage.setItem('klown-session:t1', sess as string)
  }, [state, session] as const)
}
const yesterday = { screen: 'success', hasOrder: true, dish: 'x', people: 4, tip: 10, paymentError: false, waiter: false, navigator: false, tableLabel: '12', restaurantName: 'Baobab', shareMode: 'even', claimedShareId: 'sh-yesterday', splitId: 'split-yesterday', tipPercent: 15, method: 'momo', paymentRef: 'att-yesterday', rating: 5, receiptNumber: 'KL-OLD-0007', totalPaidPesewas: 4550, quote: { billTotalPesewas: 18200, remainingPesewas: 4550, sharePesewas: 4550, tipPesewas: 0, grandTotalPesewas: 4550 }, bill: { id: 'bill-yesterday', status: 'settled', items: [{ name: 'Yesterday item', qty: 1, lineTotalPesewas: 18200 }], subtotalPesewas: 18200, serviceChargePesewas: 0, totalPesewas: 18200 } }

test('fix 2: a copy saved for another table session is not restored', async ({ page, ctx }) => {
  await seed(page, { ...yesterday, sessionToken: 'sess-old', savedFor: 'sess-old', savedAt: Date.now() - 13 * 3600_000 })
  await open(page)
  await expect(page.locator('.kz-page')).toContainText('Jollof with chicken')
  await btn(page, /Pay in full/).click(); await page.waitForTimeout(800)
  const q = ctx.last('quote')
  expect(q.shareId).toBeUndefined()
  expect(q.people).toBe(2)
  await btn(page, /Review & pay/).click(); await page.waitForTimeout(500)
  await expect(page.locator('.kz-page')).toContainText('Tip · 10%') // not yesterday's 15%
  await btn(page, /Choose payment method/).click(); await page.waitForTimeout(300)
  await btn(page, /Continue with Mobile Money/).click(); await page.waitForTimeout(300)
  await page.getByPlaceholder('024 000 0000').fill('0552836232'); await btn(page, /^Continue/).click(); await page.waitForTimeout(800)
  ctx.sc.paymentStatus = 'captured'
  await expect(page.locator('.kz-success')).toBeVisible({ timeout: 8000 })
  await expect(page.locator('.kz-success')).toContainText('How was your visit?') // no old 5-star rating
  await btn(page, /View receipt/).click(); await page.waitForTimeout(800)
  const body = await text(page)
  expect(body).not.toContain('KL-OLD-0007')
  expect(body).toContain('KL-0042')
  expect(ctx.calls('receipt').length).toBeGreaterThanOrEqual(1)
  await ctx.shot('receipt-fresh')
})

test('fix 2: same session but a new bill id resets the old checkout', async ({ page, ctx }) => {
  await seed(page, { ...yesterday, screen: 'bill', sessionToken: 'sess-1', savedFor: 'sess-1', savedAt: Date.now(), billId: 'bill-yesterday' }, 'sess-1')
  await open(page)
  await page.waitForTimeout(800)
  await btn(page, /Pay in full/).click(); await page.waitForTimeout(800)
  expect(ctx.last('quote')?.shareId).toBeUndefined()
  await btn(page, /Review & pay/).click(); await page.waitForTimeout(500)
  await expect(page.locator('.kz-page')).toContainText('Tip · 10%')
})

// ─────────────── Fix 3 (M3): giving up releases the payment and keeps watching ───────────────
test('fix 3: "it didn\'t go through" cancels, warns, and a late capture still lands on success', async ({ page, ctx }) => {
  test.setTimeout(120_000)
  await open(page)
  await toAuthorise(page)
  await btn(page, /I've approved it/).click(); await page.waitForTimeout(500)
  await page.getByText("It didn't go through").waitFor({ timeout: 25_000 })
  await page.getByText("It didn't go through").click(); await page.waitForTimeout(800)
  expect(ctx.calls('payment-cancel').map((c) => c.body.paymentRef)).toEqual(['att-1'])
  await expect(page.locator('body')).toContainText("If a payment prompt is still on your phone, don't approve it")
  expect(await inView(page, /Try again/)).toBe(true)
  await ctx.shot('gave-up')
  // the diner tries again with a new prompt...
  await btn(page, /Try again/).click(); await page.waitForTimeout(400)
  await page.getByPlaceholder('024 000 0000').fill('0552836232'); await btn(page, /^Continue/).click(); await page.waitForTimeout(1000)
  expect(ctx.calls('payment-init').length).toBe(2)
  // ...and the first prompt turns out to have been approved after all
  ctx.sc.statusByRef = { ...(ctx.sc.statusByRef ?? {}), 'att-1': 'captured' }
  await expect(page.locator('.kz-success')).toBeVisible({ timeout: 12_000 })
  expect(ctx.calls('payment-cancel').map((c) => c.body.paymentRef)).toContain('att-2') // the newer prompt is withdrawn
  await expect(page.locator('.kz-success-amount')).toContainText('324.50') // the captured amount
  await ctx.shot('late-capture-success')
})

// ─────────────── Fix 4 (M4): the total reviewed is the total charged ───────────────
test('fix 4: review shows the tipped total immediately, never the pre-tip quote', async ({ page, ctx }) => {
  await open(page)
  await btn(page, /Pay in full/).click(); await page.waitForTimeout(600)
  await btn(page, /^Other/).click()
  await page.getByLabel('Custom tip in cedis').fill('12.50'); await page.waitForTimeout(300)
  ctx.sc.delayMs = { quote: 4000 }
  await btn(page, /Review & pay/).click(); await page.waitForTimeout(250)
  const hero = await page.locator('.kz-bill-hero').innerText()
  expect(hero).toContain('307.50')
  await expect(page.locator('.kz-page')).toContainText('Tip · custom')
  await expect(btn(page, /Choose payment method/)).toContainText('307.50')
  const clipped = await page.locator('.kz-dock .kz-btn-label').evaluate((el) => el.scrollWidth > el.clientWidth + 1)
  expect(clipped).toBe(false)
})

test('fix 4: a bill that changes between review and pay sends the diner back to review', async ({ page, ctx }) => {
  await open(page)
  await btn(page, /Pay in full/).click(); await page.waitForTimeout(500)
  await btn(page, /Review & pay/).click(); await page.waitForTimeout(600)
  await btn(page, /Choose payment method/).click(); await page.waitForTimeout(300)
  ctx.sc.items.push({ name: 'Another round', qty: 2, lineTotalPesewas: 7000 }) // kitchen posts more
  await btn(page, /Continue with Mobile Money/).click(); await page.waitForTimeout(300)
  await page.getByPlaceholder('024 000 0000').fill('0552836232'); await btn(page, /^Continue/).click(); await page.waitForTimeout(1500)
  expect(ctx.last('payment-init').expectedTotalPesewas).toBe(32450)
  await expect(page.locator('.kz-notice')).toContainText('Your bill changed since you checked it')
  await expect(page.locator('.kz-bill-hero')).toContainText('401.50') // 365.00 + 10% tip
  await ctx.shot('amount-changed')
})

// ─────────────── Fix 5 (B1): an expired session says so ───────────────
test('fix 5: an expired table session shows "reconnect", not a failed payment', async ({ page, ctx }) => {
  await open(page)
  ctx.sc.fail = { '*': { ok: false, reason: 'invalid_session' } }
  await btn(page, /Pay in full/).click(); await page.waitForTimeout(1000)
  await expect(page.locator('body')).toContainText('Your table session timed out')
  await ctx.shot('expired')
  ctx.sc.fail = {}
  await btn(page, /Reconnect to my table/).click()
  await mounted(page); await page.waitForTimeout(500)
  const resolves = ctx.calls('qr-resolve')
  expect(resolves[resolves.length - 1].body.sessionToken, 'stored session dropped').toBeUndefined()
  await expect(page.locator('.kz-page')).toContainText('Jollof with chicken')
})

// ─────────────── Fix 6 (B2): the last button returns to the table ───────────────
test('fix 6: "Back to my table" reloads to the table, not "Connecting…"', async ({ page, ctx }) => {
  await open(page)
  await toAuthorise(page)
  ctx.sc.paymentStatus = 'captured'
  await expect(page.locator('.kz-success')).toBeVisible({ timeout: 8000 })
  await btn(page, /^Done$/).click(); await page.waitForTimeout(400)
  await btn(page, /Back to my table/).click()
  await mounted(page); await page.waitForTimeout(800)
  const body = await text(page)
  expect(body).not.toContain('Connecting to your table')
  expect(body).toContain('Your bill')
})

// ─────────────── Fix 7 (B3): MoMo number checked before anything is sent ───────────────
test('fix 7: MoMo number is validated, focused, and never shown as a failed payment', async ({ page, ctx }) => {
  await open(page)
  await btn(page, /Pay in full/).click(); await page.waitForTimeout(400)
  await btn(page, /Review & pay/).click(); await page.waitForTimeout(500)
  await btn(page, /Choose payment method/).click(); await page.waitForTimeout(300)
  await btn(page, /Continue with Mobile Money/).click(); await page.waitForTimeout(400)
  const field = page.getByPlaceholder('024 000 0000')
  await expect(field).toBeFocused()
  await expect(btn(page, /^Continue/)).toBeDisabled()
  await field.fill('05'); await field.blur()
  await expect(btn(page, /^Continue/)).toBeDisabled()
  await expect(page.locator('.field-hint')).toContainText("doesn't look like a mobile number")
  expect(await text(page)).not.toContain("didn't go through")
  await field.fill('+233 24 123 4567')
  await btn(page, /^Continue/).click(); await page.waitForTimeout(800)
  expect(ctx.last('payment-init').phone).toBe('0241234567')
})

// ─────────────── Fix 8 (B5): an error does not outlive its screen ───────────────
test('fix 8: a split error is gone after closing and reopening the sheet', async ({ page, ctx }) => {
  ctx.sc.splitExistsMode = 'items'
  await open(page)
  await btn(page, /^Split/).click(); await page.waitForTimeout(300)
  await page.getByText('Divide equally').click(); await page.waitForTimeout(200)
  await btn(page, /^Confirm/).click(); await page.waitForTimeout(800)
  await expect(page.locator('.split-sheet .error')).toContainText('different split')
  await page.locator('.split-close').click(); await page.waitForTimeout(300)
  await btn(page, /^Split/).click(); await page.waitForTimeout(300)
  await expect(page.locator('.split-sheet .error')).toHaveCount(0)
})

// ─────────────── Fix 9 (F1): no GH₵0.00 bill while loading ───────────────
test('fix 9: the bill says it is loading, failed, or absent instead of showing GH₵0.00', async ({ page, ctx }) => {
  ctx.sc.delayMs = { bill: 6000 }
  await open(page)
  await page.waitForTimeout(300)
  await expect(page.locator('.kz-bill-state')).toContainText('Loading your bill')
  await expect(page.locator('.kz-dock')).toHaveCount(0)
  expect(await text(page)).not.toContain('GH₵0.00')
  await ctx.shot('loading')
  // failed load, then retry
  ctx.sc.delayMs = {}
  ctx.sc.fail = { bill: 'down' }
  await page.evaluate(() => { sessionStorage.clear() })
  await open(page); await page.waitForTimeout(500)
  await expect(page.locator('.kz-bill-state')).toContainText("We couldn't load your bill")
  ctx.sc.fail = {}
  await btn(page, 'Try again').click(); await page.waitForTimeout(800)
  await expect(page.locator('.kz-page')).toContainText('Jollof with chicken')
  // fully paid bill: no pay button
  ctx.sc.paidPesewas = 29500
  await page.evaluate(() => { sessionStorage.clear() }); await open(page); await page.waitForTimeout(600)
  await expect(page.locator('.kz-bill-note')).toContainText('fully paid')
  await expect(page.locator('.kz-dock')).toHaveCount(0)
})

// ─────────────── Fix 10 (F2): no GH₵0.00 total while the quote loads ───────────────
test('fix 10: review says it is checking the total, and explains a refused quote', async ({ page, ctx }) => {
  await open(page)
  ctx.sc.delayMs = { quote: 6000 }
  await btn(page, /Pay in full/).click(); await page.waitForTimeout(300)
  await btn(page, /Review & pay/).click(); await page.waitForTimeout(400)
  await expect(page.locator('.kz-bill-state')).toContainText('Checking your total')
  expect(await page.locator('.payment-stage').innerText()).not.toContain('GH₵0.00')
  await expect(page.locator('.kz-dock')).toHaveCount(0)
  ctx.sc.delayMs = {}
  await page.waitForTimeout(6500)
  await expect(btn(page, /Choose payment method/)).toBeVisible()
  // the server refuses: the share is gone
  ctx.sc.quoteOverride = { ok: false, reason: 'invalid_share' }
  await btn(page, /Edit/).click(); await page.waitForTimeout(300)
  await btn(page, /^15%/).click(); await page.waitForTimeout(300)
  await btn(page, /Review & pay/).click(); await page.waitForTimeout(800)
  await expect(page.locator('.kz-bill-state')).toContainText('That share is no longer available')
  await ctx.shot('quote-refused')
})

// ─────────────── Fix 11 (F3): the main button is on screen ───────────────
test('fix 11: review, method, success and receipt buttons are pinned on screen', async ({ page, ctx }) => {
  await open(page)
  await btn(page, /Pay in full/).click(); await page.waitForTimeout(500)
  await btn(page, /Review & pay/).click(); await page.waitForTimeout(700)
  expect(await inView(page, /Choose payment method/)).toBe(true)
  await btn(page, /Choose payment method/).click(); await page.waitForTimeout(400)
  expect(await inView(page, /Continue with Mobile Money/)).toBe(true)
  await btn(page, /Continue with Mobile Money/).click(); await page.waitForTimeout(300)
  await page.getByPlaceholder('024 000 0000').fill('0552836232'); await btn(page, /^Continue/).click(); await page.waitForTimeout(800)
  ctx.sc.paymentStatus = 'captured'
  await expect(page.locator('.kz-success')).toBeVisible({ timeout: 8000 })
  await page.getByRole('radio', { name: '2 stars' }).click(); await page.waitForTimeout(300)
  expect(await inView(page, /^Done$/)).toBe(true)
  await ctx.shot('success-done-pinned')
  await btn(page, /View receipt/).click(); await page.waitForTimeout(500)
  expect(await inView(page, /Save & earn rewards/)).toBe(true)
  expect(await inView(page, /^Skip$/)).toBe(true)
})

// ─────────────── Fix 12 (F5, F6, F7): inputs, targets, copy, honest saves ───────────────
test('fix 12: 16px note field, 44px Retry, network copy, receipt copy, rewards errors', async ({ page, ctx }) => {
  // network failure on load is not "table not found"
  ctx.sc.fail = { 'qr-resolve': 'abort' }
  await page.goto('/s/t1'); await page.waitForTimeout(2500)
  await expect(page.locator('body')).toContainText('reach Klown')
  ctx.sc.fail = {}
  await open(page)
  // offline banner Retry is a real tap target
  await page.context().setOffline(true); await page.waitForTimeout(400)
  const retry = await page.locator('.conn-retry').boundingBox()
  expect(retry!.height).toBeGreaterThanOrEqual(44)
  await page.context().setOffline(false); await page.waitForTimeout(400)
  await toAuthorise(page)
  ctx.sc.paymentStatus = 'captured'
  await expect(page.locator('.kz-success')).toBeVisible({ timeout: 8000 })
  await page.getByRole('radio', { name: '2 stars' }).click(); await page.waitForTimeout(300)
  const fs = await page.locator('.kz-rate-note-input').evaluate((el) => parseFloat(getComputedStyle(el).fontSize))
  expect(fs).toBeGreaterThanOrEqual(16)
  // the note says "passed to the team" only after the server accepted it
  ctx.sc.fail = { feedback: 'down' }
  await page.locator('.kz-rate-note-input').fill('Food was cold')
  await btn(page, /Send to the team/).click(); await page.waitForTimeout(800)
  await expect(page.locator('body')).toContainText("That didn't send")
  ctx.sc.fail = {}
  await btn(page, /Send to the team/).click(); await page.waitForTimeout(800)
  await expect(page.locator('body')).toContainText('passed this privately')
  // receipt: honest copy, number validated, a refused save stays on screen
  await btn(page, /View receipt/).click(); await page.waitForTimeout(500)
  await expect(page.locator('body')).toContainText('Your receipt is ready either way')
  const phone = page.getByPlaceholder('024 000 0000')
  await phone.fill('05')
  await expect(btn(page, /Save & earn rewards/)).toBeDisabled()
  await phone.fill('0241234567')
  ctx.sc.fail = { 'rewards-consent': { ok: false, reason: 'error' } }
  await btn(page, /Save & earn rewards/).click(); await page.waitForTimeout(800)
  await expect(page.locator('body')).toContainText('We could not save your number')
  expect(ctx.last('rewards-consent').phone).toBe('0241234567')
  ctx.sc.fail = {}
  await btn(page, /Save & earn rewards/).click(); await page.waitForTimeout(800)
  await expect(page.locator('body')).toContainText('All')
})

// ─────────────── Fix 13: visible version ───────────────
test('fix 13: the build version is visible', async ({ page, ctx }) => {
  await open(page)
  await expect(page.locator('.kz-version')).toContainText('Klown 2026.10.16')
  expect(await page.evaluate(() => (window as any).__KLOWN_VERSION)).toBe('2026.10.16')
})

// ─────────────── Additional items in this batch ───────────────
test('B4: item split keeps Close and Confirm on screen on a long bill', async ({ page, ctx }) => {
  ctx.sc.items = Array.from({ length: 28 }, (_, i) => ({ name: `Dish number ${i + 1} with a reasonably long name`, qty: 1 + (i % 3), lineTotalPesewas: 2500 + i * 100 }))
  await open(page)
  await btn(page, /^Split/).click(); await page.waitForTimeout(300)
  await page.getByText('Pay for your items').click(); await page.waitForTimeout(900)
  expect(await inView(page, 'Close item split')).toBe(true)
  expect(await inView(page, /Pick an item to pay/)).toBe(true)
  const add = btn(page, /Add one Dish number 20 /)
  await add.scrollIntoViewIfNeeded(); await add.click(); await page.waitForTimeout(900)
  expect(await inView(page, 'Close item split')).toBe(true)
  expect(await inView(page, /^Confirm ·/)).toBe(true)
  await ctx.shot('items-pinned')
})

test('F4: one-line dock label and grouped amounts', async ({ page, ctx }) => {
  ctx.sc.items = [{ name: 'Big order', qty: 1, lineTotalPesewas: 1264100 }]
  ctx.sc.tabs = [{ billId: 'b1', label: 'Ama', main: false, serverName: null, itemCount: 1, preview: ['Big order'], totalPesewas: 1250000, remainingPesewas: 1250000, openedAt: new Date().toISOString() }, { billId: 'b2', label: null, main: true, serverName: null, itemCount: 1, preview: ['Water'], totalPesewas: 500, remainingPesewas: 500, openedAt: new Date().toISOString() }]
  ctx.sc.chooseTab = true
  await open(page); await page.waitForTimeout(600)
  await expect(page.locator('body')).toContainText('GH₵12,500.00')
  await page.locator('button.choice').first().click(); await page.waitForTimeout(900)
  const label = page.locator('.kz-dock .kz-btn-label')
  const m = await label.evaluate((el) => ({ h: el.getBoundingClientRect().height, clipped: el.scrollWidth > el.clientWidth + 1, text: (el as HTMLElement).innerText.trim() }))
  expect(m.h).toBeLessThan(24)                              // one line
  expect(m.clipped, `label "${m.text}" is not cut off`).toBe(false)
  expect(['Pay in full', 'Pay']).toContain(m.text)          // short label on narrow phones
  await expect(page.locator('.kz-dock')).toContainText('12,641.00')
  await expect(btn(page, /Pay in full GH₵12,641.00/)).toBeVisible() // full name for screen readers
  await ctx.shot('dock-one-line')
})

// 2026.10.14.2: on a Mac (real Georgia and Helvetica Neue) the SE bill button read "P..." beside a
// GH₵12,641.00 pill, and "Choose payment method" was cut on iPhone 13. The label is now measured on
// the phone. Every pinned pay button, at small and very large amounts, shows a whole label and a
// whole amount that sits inside the button.
const dockFits = async (page: Page, labels: string[]) => {
  const b = page.locator('.kz-dock .kz-btn-split')
  await b.waitFor(); await page.waitForTimeout(150)
  const m = await b.evaluate((el) => {
    const l = el.querySelector('.kz-btn-label') as HTMLElement, a = el.querySelector('.kz-btn-amount') as HTMLElement
    const br = el.getBoundingClientRect(), ar = a.getBoundingClientRect()
    return { text: l.innerText.trim(), clipped: l.scrollWidth > l.clientWidth + 1, amtClipped: a.scrollWidth > a.clientWidth + 1, amtInside: ar.right <= br.right + 0.5 && ar.left >= br.left - 0.5, h: l.getBoundingClientRect().height, fit: (el as HTMLElement).dataset.fit }
  })
  expect(m.clipped, `label "${m.text}" (${m.fit}) is whole`).toBe(false)
  expect(m.amtClipped, 'amount is whole').toBe(false)
  expect(m.amtInside, 'amount sits inside the button').toBe(true)
  expect(m.h).toBeLessThan(24)
  expect(labels).toContain(m.text)
}
for (const pesewas of [500, 1264100, 12500000]) {
  test(`F4b: bill, tip and review pay buttons fit at GH₵${pesewas / 100}`, async ({ page, ctx }) => {
    ctx.sc.items = [{ name: 'Big order', qty: 1, lineTotalPesewas: pesewas }]
    await open(page)
    await dockFits(page, ['Pay in full', 'Pay'])
    await btn(page, /Pay in full/).click(); await page.waitForTimeout(500)
    await dockFits(page, ['Review & pay', 'Review'])
    await btn(page, /Review & pay/).click(); await page.waitForTimeout(700)
    await dockFits(page, ['Choose payment method', 'Continue'])
    await ctx.shot(`dock-review-${pesewas}`)
  })
}

test('F8: the menu is reachable from an open bill', async ({ page, ctx }) => {
  await open(page)
  await btn(page, /See the menu/).click(); await page.waitForTimeout(500)
  await expect(page.locator('body')).toContainText('in the mood for?')
})

test('F9: even split says "about"', async ({ page, ctx }) => {
  await open(page)
  await btn(page, /^Split/).click(); await page.waitForTimeout(300)
  await page.getByText('Divide equally').click(); await page.waitForTimeout(300)
  await expect(page.locator('.split-sheet')).toContainText('Each pays about')
})

test('hygiene: the menu loads after a slow fetch without a hooks error', async ({ page, ctx }) => {
  ctx.sc.hasActiveBill = false
  ctx.sc.delayMs = { menu: 3000 }
  await open(page)
  await page.getByText('Browse the menu').click(); await page.waitForTimeout(300)
  await expect(page.locator('body')).toContainText('Loading menu')
  await page.waitForTimeout(3500)
  await expect(page.locator('body')).toContainText('in the mood for?')
  // ctx fixture asserts no React errors
})

test('smoke: full happy path still works end to end', async ({ page, ctx }) => {
  await open(page)
  await toAuthorise(page)
  const init = ctx.last('payment-init')
  expect(init.tipPercent).toBe(10)
  expect(init.expectedTotalPesewas).toBe(32450)
  ctx.sc.paymentStatus = 'captured'
  await expect(page.locator('.kz-success')).toBeVisible({ timeout: 8000 })
  await expect(page.locator('.kz-success-amount')).toContainText('324.50')
  await btn(page, /View receipt/).click(); await page.waitForTimeout(400)
  await btn(page, /^Skip$/).click(); await page.waitForTimeout(1500)
  await expect(page.locator('body')).toContainText('All')
})
