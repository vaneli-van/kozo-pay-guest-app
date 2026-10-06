import { createFileRoute } from '@tanstack/react-router'
import { computeQuote, QuoteError, type ShareMode } from '@/integrations/billing/calc'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

// Payment start. Database work is two round trips:
//   1. payment_context  — session, idempotent replay, bill, restaurant, pay mode, Paystack split
//                         config, amount captured, share (item shares recomputed first).
//   2. payment_reserve  — under a per-bill lock: re-check the amount still fits what is owed
//                         (counting other diners' in-flight payments) and that nobody else is
//                         paying the same share, then insert the attempt. Idempotent per key.
// Amounts are SERVER-computed; client totals are never trusted. MoMo number / PIN / card / CVV
// are never received or stored (the number is only passed to the gateway).
export const Route = createFileRoute('/api/public/payment-init')({
  server: { handlers: {
    OPTIONS: async () => new Response(null, { headers: cors }),
    POST: async ({ request }) => {
      try {
        const body = await request.json().catch(() => ({}) as Record<string, unknown>)
        const sessionToken = body.sessionToken
        const idempotencyKey = body.idempotencyKey
        if (!sessionToken || typeof sessionToken !== 'string') return json({ ok: false, reason: 'invalid_session' })
        if (!idempotencyKey || typeof idempotencyKey !== 'string') return json({ ok: false, reason: 'missing_idempotency_key' })
        const shareIdIn = typeof body.shareId === 'string' ? body.shareId : undefined
        const { paymentContext, reservePayment, PAYMENT_REASON_MESSAGE } = await import('@/integrations/payments/context.server')
        const fail = (reason: string, extra: Record<string, unknown> = {}) =>
          json({ ok: false, reason, ...(PAYMENT_REASON_MESSAGE[reason] ? { message: PAYMENT_REASON_MESSAGE[reason], failureReason: PAYMENT_REASON_MESSAGE[reason] } : {}), ...extra })
        const replay = (e: { paymentRef: string; providerRef?: string | null; status: string; amountPesewas?: number; tipPesewas?: number; totalPesewas?: number }) =>
          json({ ok: true, paymentRef: e.paymentRef, providerRef: e.providerRef ?? null, status: e.status, amountPesewas: e.amountPesewas, tipPesewas: e.tipPesewas, totalPesewas: e.totalPesewas, idempotent: true })

        let ctx = await paymentContext({ sessionToken, shareId: shareIdIn, idempotencyKey })
        if (ctx.ok && 'existing' in ctx) return replay(ctx.existing)
        if (!ctx.ok && ctx.reason === 'no_bill' && !ctx.tableId && ctx.registerId && ctx.sessionId) {
          // QSR counter: the bill mirrors the live Klown-tendered order; sync it, then read again.
          const { syncRegisterBill } = await import('@/integrations/pos/register.server')
          const sync = await syncRegisterBill({ id: ctx.sessionId, register_id: ctx.registerId })
          if (sync.reason === 'ready' && sync.billId) ctx = await paymentContext({ sessionToken, shareId: shareIdIn, idempotencyKey, billId: sync.billId })
        }
        if (!ctx.ok) return fail(ctx.reason)
        if ('existing' in ctx) return replay(ctx.existing)

        const { paymentProvider, isStagingRequest } = await import('@/integrations/payments/provider')
        // Test-mode restaurants charge with the Paystack TEST key; staging refuses live restaurants.
        const payMode = ctx.payMode
        if (payMode === 'live' && isStagingRequest(request)) return json({ ok: false, reason: 'live_payments_disabled_on_staging', message: 'This preview only takes payments for test-mode restaurants. Use the Klown Test Kitchen, or test on the live app.' })

        const share = ctx.share
        let quote
        try {
          quote = computeQuote({
            totalPesewas: ctx.bill.totalPesewas, amountPaidPesewas: ctx.paidPesewas,
            mode: share ? 'custom' : ((body.mode as ShareMode) ?? 'full'),
            people: typeof body.people === 'number' ? body.people : undefined,
            customAmountPesewas: share ? share.amountPesewas : (typeof body.customAmountPesewas === 'number' ? body.customAmountPesewas : undefined),
            capToRemaining: !!share,
            tipPesewas: typeof body.tipPesewas === 'number' ? body.tipPesewas : undefined,
            tipPercent: typeof body.tipPercent === 'number' ? body.tipPercent : undefined,
          })
        } catch (e) { if (e instanceof QuoteError) return fail(e.reason); throw e }

        // Transaction split (direct-to-restaurant settlement). With a Paystack subaccount the charge
        // is grossed up so the diner covers the fee (shown only at the MoMo prompt / card page), the
        // restaurant is settled exactly B, and Klown keeps its bps. No subaccount: charge B, no split.
        const { computeGrossUp } = await import('@/integrations/payments/split.server')
        const g = ctx.splitConfig ? computeGrossUp(quote.grandTotalPesewas, ctx.splitConfig.klownFeeBps) : null
        const chargePesewas = g ? g.totalPesewas : quote.grandTotalPesewas
        const splitFields: { subaccount?: string; transactionChargePesewas?: number; bearer?: 'account' | 'subaccount' } =
          g && ctx.splitConfig ? { subaccount: ctx.splitConfig.subaccountCode, transactionChargePesewas: g.transactionChargePesewas, bearer: 'account' } : {}

        const provider = typeof body.provider === 'string' ? body.provider : 'momo'
        const method = typeof body.method === 'string' ? body.method : null
        const reserved = await reservePayment({
          sessionId: ctx.sessionId, billId: ctx.bill.id, idempotencyKey, shareId: share?.id ?? null,
          shareMode: share ? 'share' : ((body.mode as string) ?? 'full'),
          amountPesewas: quote.sharePesewas, tipPesewas: quote.tipPesewas, totalPesewas: quote.grandTotalPesewas,
          provider, method, payMode, chargedPesewas: chargePesewas, transactionChargePesewas: g ? g.transactionChargePesewas : null,
        })
        if (!reserved.ok) return fail(reserved.reason, { pendingPesewas: reserved.pendingPesewas, remainingPesewas: reserved.remainingPesewas })
        if (reserved.idempotent) return replay(reserved)
        const attemptId = reserved.paymentRef

        const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
        const phone = typeof body.phone === 'string' ? body.phone : undefined
        const callbackUrl = typeof body.callbackUrl === 'string' ? body.callbackUrl : undefined
        const splitAudit = g && ctx.splitConfig
          ? supabaseAdmin.from('audit_events').insert({ session_id: ctx.sessionId, type: 'payment.split', data: { paymentRef: attemptId, base: g.basePesewas, charged: g.totalPesewas, transactionCharge: g.transactionChargePesewas, subaccount: ctx.splitConfig.subaccountCode, klownFeeBps: g.klownFeeBps } })
          : null

        let init
        try {
          ;[init] = await Promise.all([
            paymentProvider.initiate({ paymentAttemptId: attemptId, mode: payMode, provider, method: method ?? undefined, totalPesewas: chargePesewas, phone, callbackUrl, ...splitFields }),
            splitAudit,
          ])
        } catch (e) {
          const gatewayMsg = (e instanceof Error ? e.message : String(e)) || 'gateway_error'
          await supabaseAdmin.from('payment_attempts').update({ status: 'failed', failure_reason: gatewayMsg, updated_at: new Date().toISOString() }).eq('id', attemptId)
          return json({ ok: false, reason: 'gateway_error', message: gatewayMsg, failureReason: gatewayMsg })
        }
        await Promise.all([
          supabaseAdmin.from('payment_attempts').update({ provider_ref: init.providerRef, status: 'pending', updated_at: new Date().toISOString() }).eq('id', attemptId),
          supabaseAdmin.from('audit_events').insert({ session_id: ctx.sessionId, type: 'payment.initiated', data: { paymentRef: attemptId, provider, total: quote.grandTotalPesewas, charged: chargePesewas, mode: payMode, ...(init.directChargeError ? { directChargeFallback: init.directChargeError } : {}) } }),
        ])
        return json({ ok: true, paymentRef: attemptId, providerRef: init.providerRef, status: 'pending', action: init.action, displayText: init.displayText, redirectUrl: init.redirectUrl, accessCode: init.accessCode, amountPesewas: quote.sharePesewas, tipPesewas: quote.tipPesewas, totalPesewas: quote.grandTotalPesewas })
      } catch (e) { return json({ ok: false, reason: 'error', message: String(e) }) }
    },
  } },
})
