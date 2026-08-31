import { createFileRoute } from '@tanstack/react-router'
import { computeQuote, QuoteError, type ShareMode } from '@/integrations/billing/calc'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

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
        const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
        const { data: session } = await supabaseAdmin.from('dining_sessions').select('id,table_id,status,expires_at').eq('session_token', sessionToken).maybeSingle()
        if (!session || session.status !== 'active' || new Date(session.expires_at) < new Date()) return json({ ok: false, reason: 'invalid_session' })

        // Idempotency: one attempt per (session, key). A repeat call returns the same attempt — never double-charges.
        const { data: existing } = await supabaseAdmin.from('payment_attempts').select('id,status,amount_pesewas,tip_pesewas,total_pesewas,provider_ref').eq('session_id', session.id).eq('idempotency_key', idempotencyKey).maybeSingle()
        if (existing) return json({ ok: true, paymentRef: existing.id, providerRef: existing.provider_ref, status: existing.status, amountPesewas: existing.amount_pesewas, tipPesewas: existing.tip_pesewas, totalPesewas: existing.total_pesewas, idempotent: true })

        const { posProvider } = await import('@/integrations/pos/provider')
        const bill = await posProvider.getActiveBillForTable(session.table_id)
        if (!bill) return json({ ok: false, reason: 'no_bill' })
        const { amountPaidForBill, paymentProvider } = await import('@/integrations/payments/provider')
        const amountPaidPesewas = await amountPaidForBill(bill.id)

        let shareBasePesewas: number | undefined
        let splitShareId: string | undefined
        if (typeof body.shareId === 'string') {
          const { data: sh } = await supabaseAdmin.from('bill_split_shares')
            .select('id,amount_pesewas,status,split_id').eq('id', body.shareId).maybeSingle()
          if (!sh) return json({ ok: false, reason: 'invalid_share' })
          if (sh.status === 'paid') return json({ ok: false, reason: 'share_paid' })
          const { data: sp } = await supabaseAdmin.from('bill_splits')
            .select('bill_id,status').eq('id', sh.split_id).maybeSingle()
          if (!sp || sp.status !== 'open' || sp.bill_id !== bill.id) return json({ ok: false, reason: 'invalid_share' })
          shareBasePesewas = sh.amount_pesewas
          splitShareId = sh.id
        }

        let quote
        try {
          quote = computeQuote({
            totalPesewas: bill.totalPesewas, amountPaidPesewas,
            mode: shareBasePesewas != null ? 'custom' : ((body.mode as ShareMode) ?? 'full'),
            people: typeof body.people === 'number' ? body.people : undefined,
            customAmountPesewas: shareBasePesewas != null ? shareBasePesewas : (typeof body.customAmountPesewas === 'number' ? body.customAmountPesewas : undefined),
            tipPesewas: typeof body.tipPesewas === 'number' ? body.tipPesewas : undefined,
            tipPercent: typeof body.tipPercent === 'number' ? body.tipPercent : undefined,
          })
        } catch (e) { if (e instanceof QuoteError) return json({ ok: false, reason: e.reason }); throw e }

        const provider = typeof body.provider === 'string' ? body.provider : 'momo'
        const method = typeof body.method === 'string' ? body.method : null
        // Amounts are SERVER-computed; client totals are never trusted. MoMo number / PIN / card / CVV are never received or stored.
        const { data: attempt, error } = await supabaseAdmin.from('payment_attempts').insert({
          session_id: session.id, bill_id: bill.id, idempotency_key: idempotencyKey, provider, method,
          split_share_id: splitShareId ?? null,
          share_mode: shareBasePesewas != null ? 'share' : ((body.mode as string) ?? 'full'), amount_pesewas: quote.sharePesewas, tip_pesewas: quote.tipPesewas, total_pesewas: quote.grandTotalPesewas, status: 'initiated',
        }).select('id').single()

        if (error || !attempt) {
          const { data: raced } = await supabaseAdmin.from('payment_attempts').select('id,status,amount_pesewas,tip_pesewas,total_pesewas,provider_ref').eq('session_id', session.id).eq('idempotency_key', idempotencyKey).maybeSingle()
          if (raced) return json({ ok: true, paymentRef: raced.id, providerRef: raced.provider_ref, status: raced.status, amountPesewas: raced.amount_pesewas, tipPesewas: raced.tip_pesewas, totalPesewas: raced.total_pesewas, idempotent: true })
          return json({ ok: false, reason: 'init_failed' })
        }
        // MoMo number and card details are used only to initiate the charge with the gateway — never stored.
        const phone = typeof body.phone === 'string' ? body.phone : undefined
        const callbackUrl = typeof body.callbackUrl === 'string' ? body.callbackUrl : undefined
        let init
        try {
          init = await paymentProvider.initiate({ paymentAttemptId: attempt.id, provider, method: method ?? undefined, totalPesewas: quote.grandTotalPesewas, phone, callbackUrl })
        } catch (e) {
          await supabaseAdmin.from('payment_attempts').update({ status: 'failed', failure_reason: 'gateway_error', updated_at: new Date().toISOString() }).eq('id', attempt.id)
          return json({ ok: false, reason: 'gateway_error', message: String(e) })
        }
        await supabaseAdmin.from('payment_attempts').update({ provider_ref: init.providerRef, status: 'pending', updated_at: new Date().toISOString() }).eq('id', attempt.id)
        await supabaseAdmin.from('audit_events').insert({ session_id: session.id, type: 'payment.initiated', data: { paymentRef: attempt.id, provider, total: quote.grandTotalPesewas } })
        return json({ ok: true, paymentRef: attempt.id, providerRef: init.providerRef, status: 'pending', action: init.action, displayText: init.displayText, redirectUrl: init.redirectUrl, amountPesewas: quote.sharePesewas, tipPesewas: quote.tipPesewas, totalPesewas: quote.grandTotalPesewas })
      } catch (e) { return json({ ok: false, reason: 'error', message: String(e) }) }
    },
  } },
})
