import { createFileRoute } from '@tanstack/react-router'
import { computeQuote, QuoteError, type ShareMode } from '@/integrations/billing/calc'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

// Server-authoritative quote (share + tip). One database round trip (payment_context), same math
// as payment-init, so the amount shown is the amount charged.
export const Route = createFileRoute('/api/public/quote')({
  server: { handlers: {
    OPTIONS: async () => new Response(null, { headers: cors }),
    POST: async ({ request }) => {
      try {
        const body = await request.json().catch(() => ({} as Record<string, unknown>))
        const sessionToken = body.sessionToken
        if (!sessionToken || typeof sessionToken !== 'string') return json({ ok: false, reason: 'invalid_session' })
        const { paymentContext } = await import('@/integrations/payments/context.server')
        const ctx = await paymentContext({ sessionToken, shareId: typeof body.shareId === 'string' ? body.shareId : undefined })
        if (!ctx.ok) return json({ ok: false, reason: ctx.reason })
        if ('existing' in ctx) return json({ ok: false, reason: 'error' })
        const share = ctx.share
        try {
          const quote = computeQuote({
            totalPesewas: ctx.bill.totalPesewas, amountPaidPesewas: ctx.paidPesewas,
            mode: share ? 'custom' : ((body.mode as ShareMode) ?? 'full'),
            people: typeof body.people === 'number' ? body.people : undefined,
            customAmountPesewas: share ? share.amountPesewas : (typeof body.customAmountPesewas === 'number' ? body.customAmountPesewas : undefined),
            capToRemaining: !!share,
            tipPesewas: typeof body.tipPesewas === 'number' ? body.tipPesewas : undefined,
            tipPercent: typeof body.tipPercent === 'number' ? body.tipPercent : undefined,
          })
          return json({ ok: true, quote, pendingOthersPesewas: ctx.pendingOthersPesewas })
        } catch (e) { if (e instanceof QuoteError) return json({ ok: false, reason: e.reason }); throw e }
      } catch (e) { return json({ ok: false, reason: 'error', message: String(e) }) }
    },
  } },
})
