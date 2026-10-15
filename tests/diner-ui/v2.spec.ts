// New diner screens (redesign B), switched on per restaurant (restaurants.diner_ui = 'v2').
// Same fake backend as fixes.spec.ts. Bill: Jollof 95 + Banku 130 + 2 Club beer 70 = GH₵295.00.
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
}
const btn = (page: Page, name: string | RegExp) => page.getByRole('button', { name }).first()
const inView = async (page: Page, name: string | RegExp) => {
  const box = await btn(page, name).boundingBox()
  const vh = page.viewportSize()!.height
  return !!box && box.y >= 0 && box.y + box.height <= vh + 1
}
const noSideScroll = async (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
const toSheet = async (page: Page) => { await btn(page, /^Pay GH₵/).click(); await page.waitForTimeout(600) }
const chooseMomo = async (page: Page, number = '024 123 4567') => {
  await page.getByLabel('MoMo number').fill(number)
  await page.waitForTimeout(100)
}

test('v2: only restaurants switched on get the new screens', async ({ page, ctx }) => {
  ctx.sc.dinerUi = 'classic'
  await open(page)
  await expect(page.locator('[data-ui="v2"]')).toHaveCount(0)
  await expect(page.locator('body')).toContainText('Pay in full')
})

test('v2: bill shows the restaurant, the amount once, the till note and Powered by', async ({ page, ctx }) => {
  await open(page)
  await expect(page.locator('[data-ui="v2"]')).toHaveCount(1)
  await expect(page.getByTestId('v2-due')).toHaveText('GH₵295.00')
  const body = page.locator('body')
  await expect(body).toContainText('Baobab')
  await expect(body).toContainText('Joel is looking after you')
  await expect(body).toContainText('Includes NHIL, GETFund and VAT')
  await expect(body).toContainText("From Baobab's till")
  await expect(body).toContainText('Powered by')
  await expect(page.locator('.kz-version')).toContainText('Klown ')
  expect(await inView(page, /^Pay GH₵295\.00$/)).toBe(true)
  expect(await noSideScroll(page)).toBe(true)
  await ctx.shot('v2-bill')
})

test('v2: part-paid bill says what is left and how much the table has paid', async ({ page, ctx }) => {
  ctx.sc.paidPesewas = 10000
  await open(page)
  await expect(page.getByTestId('v2-due')).toHaveText('GH₵195.00')
  await expect(page.locator('body')).toContainText('Left to pay')
  await expect(page.locator('body')).toContainText('GH₵100.00 of GH₵295.00 already paid at your table')
  await expect(btn(page, /^Pay the rest GH₵195\.00$/)).toBeVisible()
})

test('v2: no tip is preselected and Pay waits for one', async ({ page, ctx }) => {
  await open(page)
  await toSheet(page)
  await expect(page.getByRole('dialog', { name: 'Pay the bill' })).toBeVisible()
  const checked = await page.getByRole('radiogroup', { name: 'Tip' }).getByRole('radio', { checked: true }).count()
  expect(checked).toBe(0)
  await chooseMomo(page)
  const pay = page.locator('.v2-sheet-foot .v2-btn-primary')
  await expect(pay).toHaveText('Choose a tip to continue')
  await expect(pay).toBeDisabled()
  await page.getByRole('radio', { name: /^10%/ }).click()
  await expect(pay).toHaveText('Pay GH₵324.50')
  await expect(pay).toBeEnabled()
  expect(await noSideScroll(page)).toBe(true)
  await ctx.shot('v2-pay-sheet')
})

test('v2: MoMo pay sends the reviewed total, tip and normalised number, then shows the approve screen', async ({ page, ctx }) => {
  await open(page)
  await toSheet(page)
  await page.getByRole('radio', { name: /^10%/ }).click()
  await chooseMomo(page, '+233 24 123 4567')
  await expect(page.locator('.v2-sheet')).toContainText('MTN number')
  await btn(page, /^Pay GH₵324\.50$/).click()
  await page.waitForTimeout(900)
  const init = ctx.last('payment-init')
  expect(init.tipPercent).toBe(10)
  expect(init.expectedTotalPesewas).toBe(32450)
  expect(init.phone).toBe('0241234567')
  expect(init.method).toBe('momo')
  const body = page.locator('body')
  await expect(body).toContainText('Check your phone')
  await expect(body).toContainText('Approve GH₵324.50 to Baobab with your MoMo PIN')
  await expect(body).toContainText('ending 4567')
  await expect(body).toContainText('Dial *170#')
  await ctx.shot('v2-approve')
})

test('v2: a bad number keeps Pay off and never reaches the server', async ({ page, ctx }) => {
  await open(page)
  await toSheet(page)
  await page.getByRole('radio', { name: /^None/ }).click()
  await chooseMomo(page, '12345')
  await page.getByLabel('MoMo number').blur()
  await expect(page.locator('.v2-sheet')).toContainText('10 digits, starting with 0')
  await expect(page.locator('.v2-sheet-foot .v2-btn-primary')).toBeDisabled()
  expect(ctx.calls('payment-init').length).toBe(0)
})

test('v2: None sends a zero tip; Other sends the typed amount', async ({ page, ctx }) => {
  await open(page)
  await toSheet(page)
  await page.getByRole('radio', { name: /^None/ }).click()
  await chooseMomo(page)
  await btn(page, /^Pay GH₵295\.00$/).click()
  await page.waitForTimeout(900)
  expect(ctx.last('payment-init').tipPercent).toBe(0)
  expect(ctx.last('payment-init').expectedTotalPesewas).toBe(29500)
  // back to the sheet: the choice is kept for the retry
  await btn(page, /Use another number or card/).click()
  await page.waitForTimeout(600)
  await expect(page.getByRole('radio', { name: /^None/ })).toHaveAttribute('aria-checked', 'true')
  await page.getByRole('radio', { name: /^Other/ }).click()
  await page.getByLabel('Tip amount in GH₵').fill('12.50')
  await btn(page, /^Pay GH₵307\.50$/).click()
  await page.waitForTimeout(900)
  expect(ctx.last('payment-init').tipPesewas).toBe(1250)
  expect(ctx.last('payment-init').expectedTotalPesewas).toBe(30750)
})

test('v2: captured payment lands on Paid with the captured amount, table status and rating', async ({ page, ctx }) => {
  await open(page)
  await toSheet(page)
  await page.getByRole('radio', { name: /^15%/ }).click()
  await chooseMomo(page)
  await btn(page, /^Pay GH₵339\.25$/).click()
  await page.waitForTimeout(600)
  ctx.sc.paymentStatus = 'captured'
  await expect(page.getByTestId('v2-paid')).toHaveText('GH₵339.25', { timeout: 10_000 })
  await expect(page.locator('body')).toContainText('Table 12 is fully paid')
  await expect(page.locator('body')).toContainText('MTN ••4567')
  await page.getByRole('radio', { name: '5 stars' }).click()
  await page.waitForTimeout(300)
  expect(ctx.last('feedback').rating).toBe(5)
  await expect(page.locator('body')).toContainText('Say it on Google too')
  expect(await inView(page, /^Done$/)).toBe(true)
  await ctx.shot('v2-paid')
})

test('v2: a bill that changed since the sheet sends the diner back to it with a notice', async ({ page, ctx }) => {
  await open(page)
  await toSheet(page)
  await page.getByRole('radio', { name: /^None/ }).click()
  await chooseMomo(page)
  await page.waitForTimeout(800) // let the quote for the chosen tip land first
  ctx.sc.items.push({ name: 'Water', qty: 1, lineTotalPesewas: 500 })
  await btn(page, /^Pay GH₵295\.00$/).click()
  await page.waitForTimeout(1200)
  expect(ctx.last('payment-init').expectedTotalPesewas).toBe(29500)
  await expect(page.getByRole('dialog', { name: 'Pay the bill' })).toBeVisible()
  await expect(page.locator('.v2-notice')).toBeVisible()
})

test('v2: a declined payment says so and Try again returns to the sheet', async ({ page, ctx }) => {
  await open(page)
  await toSheet(page)
  await page.getByRole('radio', { name: /^5%/ }).click()
  await chooseMomo(page)
  await btn(page, /^Pay GH₵309\.75$/).click()
  await page.waitForTimeout(600)
  ctx.sc.paymentStatus = 'failed'
  await expect(page.locator('body')).toContainText('Payment didn’t go through', { timeout: 10_000 })
  await expect(page.locator('body')).toContainText('Declined by your provider')
  await btn(page, /^Try again$/).click()
  await page.waitForTimeout(600)
  await expect(page.getByRole('dialog', { name: 'Pay the bill' })).toBeVisible()
  await expect(page.getByLabel('MoMo number')).toHaveValue('0241234567')
})

test('v2: card goes to the secure page step with the card method', async ({ page, ctx }) => {
  ctx.sc.paymentInit = 'card'
  await open(page)
  await toSheet(page)
  await page.getByRole('radio', { name: /^None/ }).click()
  await page.getByRole('radio', { name: /^Card/ }).click()
  await btn(page, /^Pay GH₵295\.00$/).click()
  await page.waitForTimeout(900)
  expect(ctx.last('payment-init').method).toBe('card')
  expect(ctx.last('payment-init').provider).toBe('card')
})

test('v2: no bill yet shows the waiting screen, and a test restaurant can make a test bill', async ({ page, ctx }) => {
  ctx.sc.hasActiveBill = false
  ctx.sc.testMode = true
  await open(page)
  const body = page.locator('body')
  await expect(body).toContainText('No bill at this table yet')
  await expect(body).toContainText('Checked just now')
  await expect(btn(page, /Create a test bill/)).toBeVisible()
  expect(await inView(page, /See the menu/)).toBe(true)
  await ctx.shot('v2-no-bill')
})

test('v2: split equally starts the same server split as before', async ({ page, ctx }) => {
  await open(page)
  await btn(page, /^Split the bill$/).click()
  await page.waitForTimeout(400)
  await btn(page, /^Split equally/).click()
  await btn(page, /One more person/).click()
  await expect(page.locator('.v2-sheet')).toContainText('GH₵98.34')
  await btn(page, /^Split 3 ways$/).click()
  await page.waitForTimeout(600)
  const create = ctx.last('split-create')
  expect(create.mode).toBe('even')
  expect(create.partySize).toBe(3)
})

test('v2: the pay sheet fits a small phone without sideways scrolling', async ({ page, ctx }) => {
  await open(page)
  await toSheet(page)
  await page.getByRole('radio', { name: /^10%/ }).click()
  await chooseMomo(page)
  expect(await noSideScroll(page)).toBe(true)
  const clipped = await page.locator('.v2-chip').evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1).length)
  expect(clipped).toBe(0)
  expect(await inView(page, /^Pay GH₵324\.50$/)).toBe(true)
})

test('v2: footer stays pinned while a long bill scrolls (page itself never scrolls)', async ({ page, ctx }) => {
  ctx.sc.items = Array.from({ length: 24 }, (_, n) => ({ ...ctx.sc.items[0], name: `Dish ${n + 1}`, qty: 1, lineTotalPesewas: 1000 }))
  await open(page)
  const foot = page.locator('.v2-actions')
  const before = await foot.boundingBox()
  const vh = page.viewportSize()!.height
  expect(before && Math.round(before.y + before.height)).toBeGreaterThanOrEqual(vh - 1)
  // Scroll the content like a thumb would, all the way down.
  const area = page.locator('.v2-scroll')
  const box = (await area.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  for (let i = 0; i < 12; i++) await page.mouse.wheel(0, 600)
  await page.waitForTimeout(300)
  const scrolled = await area.evaluate((el) => el.scrollTop)
  expect(scrolled).toBeGreaterThan(200)
  const after = await foot.boundingBox()
  expect(after!.y).toBeCloseTo(before!.y, 0)
  expect(await page.evaluate(() => (document.scrollingElement || document.documentElement).scrollTop)).toBe(0)
  // The end of the bill is reachable above the footer, not hidden behind it.
  const ver = (await page.locator('.kz-version').boundingBox())!
  expect(ver.y + ver.height).toBeLessThanOrEqual(after!.y + 1)
  expect(await inView(page, /^Pay GH₵/)).toBe(true)
  await ctx.shot('v2-long-bill-scrolled')
})
