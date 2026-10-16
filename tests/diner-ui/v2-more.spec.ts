// New diner screens, part 2: split by item, split lobby, menu, waiter, which-bill, receipt, code,
// session ended. Same fake backend as v2.spec.ts. Bill: Jollof 95 + Banku 130 + 2 Club beer 70 = GH₵295.00.
import { test as base, expect, type Page } from '@playwright/test'
import { installMock, baseScenario, type Scenario, type Captured } from './mock'

type Ctx = { sc: Scenario; captured: Captured[]; errors: string[]; shot: (n: string) => Promise<void>; last: (p: string) => any; calls: (p: string) => Captured[] }
const test = base.extend<{ ctx: Ctx }>({
  ctx: async ({ page }, use, info) => {
    const sc = baseScenario({ dinerUi: 'v2' })
    const captured: Captured[] = []
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push('PAGEERROR ' + String(e).slice(0, 300)))
    page.on('console', (m) => { if (m.type() === 'error' && /Rendered (more|fewer) hooks|Maximum update depth|change in the order of Hooks/.test(m.text())) errors.push(m.text().slice(0, 300)) })
    await installMock(page, sc, captured)
    await use({
      sc, captured, errors,
      shot: async (n) => { await page.screenshot({ path: info.outputPath(`${n}.png`) }) },
      last: (p) => [...captured].reverse().find((c) => c.path === p)?.body,
      calls: (p) => captured.filter((c) => c.path === p),
    })
    expect(errors, 'no React errors on the page').toEqual([])
  },
})

const open = async (page: Page) => {
  await page.goto('/s/t1')
  await page.locator('[data-ui="v2"], .app-shell section, .welcome-shell section').first().waitFor({ state: 'attached', timeout: 40_000 })
  await page.waitForTimeout(400)
  // The new screens open on the restaurant's home screen; the bill is one tap away.
  if (await page.locator('.v2-welcome').count()) {
    await page.getByRole('button', { name: /View & pay your bill/ }).click()
    await page.waitForTimeout(400)
  }
}
const btn = (page: Page, name: string | RegExp) => page.getByRole('button', { name }).first()
const v2 = (page: Page) => page.locator('[data-ui="v2"]')
const noClassic = async (page: Page) => expect(page.locator('.app-shell, .welcome-shell, .kz-dock')).toHaveCount(0)
const noSideScroll = async (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
const footerPinned = async (page: Page) => {
  const f = await page.locator('.v2-actions').last().boundingBox()
  const vh = page.viewportSize()!.height
  return !!f && Math.round(f.y + f.height) >= vh - 1
}
const toItems = async (page: Page) => {
  await btn(page, /^Split the bill$/).click()
  await page.waitForTimeout(300)
  await btn(page, /Pay for what you had/).click()
  await expect(page.locator('.v2-subhead-title')).toHaveText('Pay for what you had')
}

test('v2 split by item: pick, pay just your items, close returns to the picker', async ({ page, ctx }) => {
  await open(page)
  await toItems(page)
  await noClassic(page)
  await expect(page.locator('.v2-picks li')).toHaveCount(3)
  await expect(btn(page, /^Pick what you had$/)).toBeDisabled()
  await btn(page, 'Add one Jollof with chicken').click()
  await page.waitForTimeout(900)
  const a = ctx.last('split-assign')
  expect(a.units).toBe(1)
  await expect(page.getByTestId('v2-my-items')).toHaveText('GH₵95.00')
  await expect(page.locator('.v2-actions')).toContainText('Your items (1)')
  expect(await footerPinned(page)).toBe(true)
  expect(await noSideScroll(page)).toBe(true)
  await ctx.shot('v2-split-items')
  await btn(page, /^Pay GH₵95\.00$/).click()
  await expect(page.locator('.v2-sheet')).toContainText('Pay your share')
  await page.locator('.v2-sheet-head').getByRole('button', { name: 'Close' }).click()
  await expect(page.locator('.v2-subhead-title')).toHaveText('Pay for what you had')
})

test('v2 split by item: two of an item, take one back, and cover what is left', async ({ page, ctx }) => {
  await open(page)
  await toItems(page)
  await btn(page, 'Add one Club beer').click()
  await btn(page, 'Add one Club beer').click()
  await page.waitForTimeout(900)
  await expect(page.getByTestId('v2-my-items')).toHaveText('GH₵70.00')
  await btn(page, 'Remove one Club beer').click()
  await page.waitForTimeout(900)
  await expect(page.getByTestId('v2-my-items')).toHaveText('GH₵35.00')
  await expect(page.locator('body')).toContainText('not picked yet')
  await btn(page, /pay for everything not picked yet/).click()
  await page.waitForTimeout(600)
  expect(ctx.calls('assign-remaining').length).toBe(1)
  await expect(page.getByTestId('v2-my-items')).toHaveText('GH₵295.00')
})

test('v2 split equally: the shares screen, take one, pay it, give it back', async ({ page, ctx }) => {
  await open(page)
  await btn(page, /^Split the bill$/).click()
  await page.waitForTimeout(300)
  await btn(page, /^Split equally/).click()
  await btn(page, /^Split 2 ways$/).click()
  await expect(page.locator('.v2-subhead-title')).toHaveText('Split the bill')
  await noClassic(page)
  await expect(page.locator('.v2-shares li')).toHaveCount(2)
  await expect(page.locator('.v2-actions')).toContainText('Take a share to pay it')
  await btn(page, /^Take it$/).click()
  await page.waitForTimeout(3600) // the lobby re-reads the split every 3s
  expect(ctx.last('split-claim').shareId).toBe('sh0')
  await expect(page.locator('.v2-shares')).toContainText('Your share')
  await ctx.shot('v2-split-lobby')
  await btn(page, /^Pay my share GH₵147\.50$/).click()
  await expect(page.locator('.v2-sheet')).toContainText('Pay your share')
  await page.locator('.v2-sheet-head').getByRole('button', { name: 'Close' }).click()
  await expect(page.locator('.v2-subhead-title')).toHaveText('Split the bill')
  await btn(page, /^Give back$/).click()
  await page.waitForTimeout(400)
  expect(ctx.last('split-release').shareId).toBe('sh0')
})

test('v2 menu: sections, search, a dish, and calling the waiter', async ({ page, ctx }) => {
  await open(page)
  await btn(page, /^See the menu$/).click()
  await expect(page.locator('.v2-subhead-title')).toHaveText('Menu')
  await noClassic(page)
  await expect(page.locator('.v2-tabs-line button')).toHaveText(['Mains', 'Drinks'])
  await expect(page.getByRole('tab', { name: 'Mains' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('.v2-dishes li')).toHaveCount(2)
  await page.getByLabel('Search the menu').fill('beer')
  await expect(page.locator('.v2-dishes li')).toHaveCount(1)
  await expect(page.locator('.v2-dishes')).toContainText('Club beer')
  await page.getByLabel('Search the menu').fill('')
  await expect(page.locator('.v2-dishes li')).toHaveCount(2)
  await expect(btn(page, /^See my bill · GH₵295\.00$/)).toBeVisible()
  expect(await footerPinned(page)).toBe(true)
  await ctx.shot('v2-menu')
  await page.locator('.v2-dishes button').first().click()
  await expect(page.locator('.v2-sheet')).toContainText('Jollof with chicken')
  await expect(page.locator('.v2-sheet')).toContainText('GH₵95.00')
  await btn(page, /^Ask your waiter about it$/).click()
  await expect(page.locator('.v2-subhead-title')).toHaveText('Call your waiter')
  await btn(page, /Come to my table/).click()
  await page.waitForTimeout(400)
  expect(ctx.last('waiter-request').kind).toBe('assistance')
  await expect(page.locator('body')).toContainText('Joel is on the way')
  await btn(page, /^Back to my bill$/).click()
  await expect(page.getByTestId('v2-due')).toHaveText('GH₵295.00')
})

test('v2 menu: a Menu Studio menu shows its sections, prices as written, and sold-out items', async ({ page, ctx }) => {
  ctx.sc.menuOverride = {
    ok: true, source: 'studio', categories: [], items: [], recommendations: [], currency: 'GHS',
    menus: [
      { id: 'mn1', name: 'Food', digital: { welcome_alert: 'Kitchen closes at 10pm' }, sections: [
        { id: 's1', name: 'Locals', items: [
          { id: 'i1', name: 'Banku & Okro', description: 'With fresh tilapia', price_pesewas: 14000 },
          { id: 'i2', name: 'Fufu (L)', price_pesewas: 3000, sold_out: true },
        ] },
        { id: 's2', name: 'Soups', items: [{ id: 'i3', name: 'Light soup', price_display: 'From GH₵40' }] },
      ] },
      { id: 'mn2', name: 'Drinks', sections: [{ id: 's3', name: 'Beers', items: [{ id: 'i4', name: 'Club', price_pesewas: 3500 }] }] },
    ],
  }
  await open(page)
  await btn(page, /^See the menu$/).click()
  await expect(page.locator('body')).toContainText('Kitchen closes at 10pm')
  await expect(page.locator('.v2-dishes').first()).toContainText('GH₵140.00')
  await expect(page.locator('body')).toContainText('From GH₵40')
  await expect(page.locator('body')).toContainText('Sold out')
  await page.getByRole('tab', { name: 'Drinks' }).click()
  await expect(page.locator('.v2-dishes li')).toHaveCount(1)
  await expect(page.locator('.v2-dishes')).toContainText('Club')
})

test('v2 which bill is yours: separate groups at one table', async ({ page, ctx }) => {
  ctx.sc.chooseTab = true
  ctx.sc.tabs = [
    { billId: 'b1', label: 'Ama', itemCount: 3, preview: ['Jollof', 'Banku'], serverName: 'Joel', openedAt: new Date().toISOString(), remainingPesewas: 29500 },
    { billId: 'b2', label: 'Kofi', itemCount: 1, preview: ['Club beer'], serverName: 'Joel', openedAt: new Date().toISOString(), remainingPesewas: 3500 },
  ]
  await open(page)
  await expect(page.locator('.v2-subhead-title')).toHaveText('Which bill is yours?')
  await noClassic(page)
  await expect(page.locator('.v2-tabs-list li')).toHaveCount(2)
  await ctx.shot('v2-choose-tab')
  await page.locator('.v2-tabs-list button').first().click()
  await page.waitForTimeout(800)
  expect(ctx.last('tab-select').billId).toBe('b1')
  await expect(page.getByTestId('v2-due')).toHaveText('GH₵295.00')
})

const payAndCapture = async (page: Page, ctx: Ctx) => {
  await btn(page, /^Pay GH₵/).click()
  await page.waitForTimeout(600)
  await page.getByRole('radio', { name: /^None/ }).click()
  await page.getByLabel('MoMo number').fill('024 123 4567')
  await btn(page, /^Pay GH₵295\.00$/).click()
  await page.waitForTimeout(600)
  ctx.sc.paymentStatus = 'captured'
  await expect(page.getByTestId('v2-paid')).toBeVisible({ timeout: 10_000 })
}

test('v2 receipt: rewards screen, skip to the receipt picture, download, back to Paid', async ({ page, ctx }) => {
  await open(page)
  await payAndCapture(page, ctx)
  await btn(page, /View or download the receipt/).click()
  await expect(page.locator('.v2-subhead-title')).toHaveText('Your receipt')
  await noClassic(page)
  await expect(page.locator('.v2-paidcard')).toContainText('GH₵295.00')
  // The MoMo number is wiped once the payment starts, so it is never prefilled here.
  await expect(page.getByLabel('Phone number')).toHaveValue('')
  await expect(btn(page, /^Save and see my receipt$/)).toBeDisabled()
  await ctx.shot('v2-receipt-rewards')
  await btn(page, /Skip, just show the receipt/).click()
  await expect(page.locator('img.v2-receipt-img')).toBeVisible({ timeout: 10_000 })
  await expect(btn(page, /^Download receipt$/)).toBeEnabled()
  await ctx.shot('v2-receipt')
  await btn(page, /^Done$/).click()
  await expect(page.getByTestId('v2-paid')).toBeVisible()
})

test('v2 receipt: saving the number sends it for rewards and shows the receipt', async ({ page, ctx }) => {
  await open(page)
  await payAndCapture(page, ctx)
  await btn(page, /View or download the receipt/).click()
  await page.getByLabel('First name (optional)').fill('Ama')
  await page.getByLabel('Phone number').fill('024 123 4567')
  await btn(page, /^Save and see my receipt$/).click()
  await page.waitForTimeout(600)
  const c = ctx.last('rewards-consent')
  expect(c.phone).toBe('0241234567')
  expect(c.firstName).toBe('Ama')
  await expect(page.locator('img.v2-receipt-img')).toBeVisible({ timeout: 10_000 })
})

test('v2 code step: a payment that needs a one-time code asks for it in the new look', async ({ page, ctx }) => {
  ctx.sc.paymentInit = 'otp'
  await open(page)
  await btn(page, /^Pay GH₵/).click()
  await page.waitForTimeout(600)
  await page.getByRole('radio', { name: /^None/ }).click()
  await page.getByLabel('MoMo number').fill('020 123 4567')
  await btn(page, /^Pay GH₵295\.00$/).click()
  await expect(page.locator('.v2-subhead-title')).toHaveText('Enter the code', { timeout: 10_000 })
  await noClassic(page)
  await page.getByLabel('Payment code').fill('123456')
  await btn(page, /^Confirm payment$/).click()
  await page.waitForTimeout(500)
  expect(ctx.last('payment-otp').otp).toBe('123456')
})

test('v2 session ended: reconnect screen in the new look', async ({ page, ctx }) => {
  await open(page)
  ctx.sc.fail = { '*': { ok: false, reason: 'invalid_session' } }
  await btn(page, /^Pay GH₵/).click()
  await page.waitForTimeout(1200)
  await expect(v2(page)).toContainText('This table link has timed out')
  await noClassic(page)
  ctx.sc.fail = {}
  await btn(page, /^Reconnect to my table$/).click()
  await page.waitForTimeout(1500)
  await expect(page.locator('.v2-welcome')).toBeVisible()
})

// ── Found in the live run on Test Kitchen (15 Oct) ──

test('v2 live fix: Done after a fully paid table opens the table, never the Paid screen again', async ({ page, ctx }) => {
  await open(page)
  // Live, the receipt number was still loading when Done was tapped; it arrived while the page
  // was reloading (the live server is slow to send the page) and saved the Paid screen back.
  ctx.sc.delayMs = { receipt: 1200 }
  await payAndCapture(page, ctx)
  ctx.sc.hasActiveBill = false
  let loads = 0
  await page.route('**/s/t1', async (route) => { if (route.request().resourceType() === 'document' && loads++ >= 0) await new Promise((r) => setTimeout(r, 2000)); await route.continue() })
  await btn(page, /^Done$/).click()
  await page.waitForTimeout(6000)
  await expect(page.getByTestId('v2-paid')).toHaveCount(0)
  await expect(page.locator('.v2-welcome')).toBeVisible()
})

test('v2 live fix: asking for a different split than the one already open goes to that split and says why', async ({ page, ctx }) => {
  ctx.sc.splitExistsMode = 'items'
  await open(page)
  await btn(page, /^Split the bill$/).click()
  await page.waitForTimeout(300)
  await btn(page, /^Split equally/).click()
  await btn(page, /^Split 2 ways$/).click()
  await expect(page.locator('.v2-subhead-title')).toHaveText('Pay for what you had')
  await expect(page.locator('.v2-notice')).toContainText('already paying for what they had')
})

test('v2 live fix: the loading splash is the new one, always with the Klown logo', async ({ page, ctx }) => {
  ctx.sc.delayMs = { 'qr-resolve': 1500 }
  ctx.sc.logoUrl = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>')
  await page.goto('/s/t1')
  const splash = page.locator('[data-ui="v2-splash"]')
  await expect(splash).toContainText('Connecting to your table')
  await expect(splash.locator('.v2-splash-klown')).toHaveAttribute('alt', 'Klown')
  await expect(page.locator('body')).not.toContainText('feel closer')
  await page.locator('[data-ui="v2"]').waitFor({ timeout: 40_000 })
  // a returning phone still sees Klown, not the restaurant
  await page.reload()
  await expect(splash.locator('.v2-splash-klown')).toHaveAttribute('alt', 'Klown')
  await expect(splash).not.toContainText('Baobab')
  await page.locator('[data-ui="v2"]').waitFor({ timeout: 40_000 })
})

test('v2 live fix: picking an item does not push the other rows down', async ({ page, ctx }) => {
  ctx.sc.items = [{ name: 'Jollof Rice & Grilled Chicken with extra shito', qty: 2, lineTotalPesewas: 17000 }, ...ctx.sc.items]
  await open(page)
  await toItems(page)
  const second = page.locator('.v2-picks li').nth(1)
  const before = (await second.boundingBox())!.y
  await btn(page, 'Add one Jollof Rice & Grilled Chicken with extra shito').click()
  await page.waitForTimeout(300)
  expect((await second.boundingBox())!.y).toBeCloseTo(before, 0)
})

// ── Home screen (restaurant photo, View & pay your bill, Browse the menu) ──
const home = async (page: Page) => {
  await page.goto('/s/t1')
  await page.locator('.v2-welcome').waitFor({ timeout: 40_000 })
}

test('v2 home: the restaurant photo, logo and welcome line come first, then the bill', async ({ page, ctx }) => {
  ctx.sc.logoUrl = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="100"><rect width="160" height="100" rx="12" fill="#000"/><text x="80" y="60" font-size="26" text-anchor="middle" fill="#fff">BAOBAB</text></svg>')
  await home(page)
  await noClassic(page)
  await expect(page.locator('.v2-hero-eyebrow')).toHaveText(/welcome to/i)
  await expect(page.locator('.v2-hero-logo img')).toHaveAttribute('alt', 'Baobab')
  await expect(page.locator('.v2-hero-table')).toContainText('Table 12')
  await expect(page.locator('.v2-welcome-copy')).toContainText('View your bill')
  await expect(page.locator('.v2-welcome')).toContainText('Powered by')
  await expect(page.locator('body')).not.toContainText('Klown 20')
  expect(await noSideScroll(page)).toBe(true)
  await ctx.shot('v2-home')
  await btn(page, /View & pay your bill/).click()
  await expect(page.getByTestId('v2-due')).toHaveText('GH₵295.00')
  // the logo in the bill header goes back home
  await page.getByRole('button', { name: /Baobab, home/ }).click()
  await expect(page.locator('.v2-welcome')).toBeVisible()
})

test('v2 home: with no bill yet, "View & pay your bill" shows the no-bill screen', async ({ page, ctx }) => {
  ctx.sc.hasActiveBill = false
  await home(page)
  await btn(page, /View & pay your bill/).click()
  await expect(v2(page)).toContainText('No bill at this table yet')
})

test('v2 home: Browse the menu opens the menu, and Back returns home', async ({ page, ctx }) => {
  await home(page)
  await btn(page, /Browse the menu/).click()
  await expect(page.locator('.v2-subhead-title')).toHaveText('Menu')
  await btn(page, /^Back$/).click()
  await expect(page.locator('.v2-welcome')).toBeVisible()
})

test('v2 home: several groups at the table stay on home until the diner asks for the bill', async ({ page, ctx }) => {
  ctx.sc.chooseTab = true
  ctx.sc.tabs = [
    { billId: 'b1', label: 'Ama', itemCount: 3, preview: ['Jollof'], serverName: 'Joel', openedAt: new Date().toISOString(), remainingPesewas: 29500 },
    { billId: 'b2', label: 'Kofi', itemCount: 1, preview: ['Club beer'], serverName: 'Joel', openedAt: new Date().toISOString(), remainingPesewas: 3500 },
  ]
  await home(page)
  await page.waitForTimeout(1500)
  await expect(page.locator('.v2-welcome')).toBeVisible()
  await btn(page, /View & pay your bill/).click()
  await expect(page.locator('.v2-subhead-title')).toHaveText('Which bill is yours?')
})

test('v2 Apple Pay: the Apple Pay mark in "Pay with" and Apple\'s own button to pay', async ({ page, ctx }) => {
  // Stand in for an iPhone with Apple Pay set up: Safari exposes ApplePaySession and draws -apple-pay-button.
  await page.addInitScript(() => {
    ;(window as any).ApplePaySession = { canMakePayments: () => true }
    const orig = CSS.supports.bind(CSS)
    ;(CSS as any).supports = (a: string, b?: string) => (a === '-webkit-appearance' && b === '-apple-pay-button') || (b === undefined ? orig(a) : orig(a, b))
  })
  ctx.sc.paymentInit = 'card'
  await open(page)
  await btn(page, /^Pay GH₵/).click()
  await page.waitForTimeout(600)
  const chip = page.getByRole('radio', { name: /Apple Pay/ })
  await expect(chip.locator('.v2-applepay-mark')).toHaveCount(1)
  await expect(chip).not.toContainText('On this iPhone')
  await expect(page.getByRole('radio', { name: /MoMo/ }).locator('.v2-method-icon')).toHaveCount(1)
  await expect(page.getByRole('radio', { name: /Card/ }).locator('.v2-method-icon')).toHaveCount(1)
  await chip.click()
  // no tip chosen yet: the normal button asks for one
  await expect(page.locator('.v2-applepay-btn')).toHaveCount(0)
  await page.getByRole('radio', { name: /^None/ }).click()
  const pay = page.locator('.v2-applepay-btn')
  await expect(pay).toHaveAttribute('aria-label', 'Pay GH₵295.00 with Apple Pay')
  await pay.click()
  await page.waitForTimeout(800)
  expect(ctx.last('payment-init').method).toBe('applepay')
})

test('v2 menu: the section tab follows the list as you scroll, and a tab jumps to its section', async ({ page, ctx }) => {
  const sec = (id: string, name: string) => ({ id, name, items: Array.from({ length: 9 }, (_, n) => ({ id: `${id}-${n}`, name: `${name} dish ${n + 1}`, price_pesewas: 1500 + n * 500 })) })
  ctx.sc.menuOverride = { ok: true, source: 'studio', categories: [], items: [], recommendations: [], currency: 'GHS',
    menus: [{ id: 'local', name: 'Local', sections: [sec('sw', 'Swallows'), sec('so', 'Soups'), sec('st', 'Stews & Sauces'), sec('fi', 'Fish & Seafood')] }] }
  await open(page)
  await btn(page, /^See the menu$/).click()
  const tab = (n: string) => page.getByRole('tab', { name: n })
  await expect(tab('Swallows')).toHaveAttribute('aria-selected', 'true')
  const area = page.locator('.v2-scroll')
  // scroll the list down to the soups
  await area.evaluate((box) => { const el = box.querySelector('[data-sec="so"]') as HTMLElement; box.scrollTop += el.getBoundingClientRect().top - box.getBoundingClientRect().top })
  await page.waitForTimeout(300)
  await expect(tab('Soups')).toHaveAttribute('aria-selected', 'true')
  await expect(tab('Swallows')).toHaveAttribute('aria-selected', 'false')
  // to the very bottom: the last section
  await area.evaluate((box) => { box.scrollTop = box.scrollHeight })
  await page.waitForTimeout(300)
  await expect(tab('Fish & Seafood')).toHaveAttribute('aria-selected', 'true')
  // tapping a tab scrolls to that section and selects it
  await tab('Stews & Sauces').click()
  await page.waitForTimeout(1200)
  await expect(tab('Stews & Sauces')).toHaveAttribute('aria-selected', 'true')
  const y = await area.evaluate((box) => (box.querySelector('[data-sec="st"]') as HTMLElement).getBoundingClientRect().top - box.getBoundingClientRect().top)
  expect(Math.abs(y)).toBeLessThan(30)
  await ctx.shot('v2-menu-scrollspy')
})
