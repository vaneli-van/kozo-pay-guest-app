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

        let quote
        try {
          quote = computeQuote({
            totalPesewas: bill.totalPesewas, amountPaidPesewas,
            mode: (body.mode as ShareMode) ?? 'full',
            people: typeof body.people === 'number' ? body.people : undefined,
            customAmountPesewas: typeof body.customAmountPesewas === 'number' ? body.customAmountPesewas : undefined,
            tipPesewas: typeof body.tipPesewas === 'number' ? body.tipPesewas : undefined,
            tipPercent: typeof body.tipPercent === 'number' ? body.tipPercent : undefined,
          })
        } catch (e) { if (e instanceof QuoteError) return json({ ok: false, reason: e.reason }); throw e }

        const provider = typeof body.provider === 'string' ? body.provider : 'momo'
        const method = typeof body.method === 'string' ? body.method : null
        // Amounts are SERVER-computed; client totals are never trusted. MoMo number / PIN / card / CVV are never received or stored.
        const { data: attempt, error } = await supabaseAdmin.from('payment_attempts').insert({
          session_id: session.id, bill_id: bill.id, idempotency_key: idempotencyKey, provider, method,
          share_mode: (body.mode as string) ?? 'full', amount_pesewas: quote.sharePesewas, tip_pesewas: quote.tipPesewas, total_pesewas: quote.grandTotalPesewas, status: 'initiated',
        }).select('id').single()
        if (error || !attempt) {
          const { data: raced } = await supabaseAdmin.from('payment_attempts').select('id,status,amount_pesewas,tip_pesewas,total_pesewas,provider_ref').eq('session_id', session.id).eq('idempotency_key', idempotencyKey).maybeSingle()
          if (raced) return json({ ok: true, paymentRef: raced.id, providerRef: raced.provider_ref, status: raced.status, amountPesewas: raced.amount_pesewas, tipPesewas: raced.tip_pesewas, totalPesewas: raced.total_pesewas, idempotent: true })
          return json({ ok: false, reason: 'init_failed' })
        }
        const init = await paymentProvider.initiate({ paymentAttemptId: attempt.id, provider, method: method ?? undefined, totalPesewas: quote.grandTotalPesewas })
        await supabaseAdmin.from('payment_attempts').update({ provider_ref: init.providerRef, status: 'pending', updated_at: new Date().toISOString() }).eq('id', attempt.id)
        await supabaseAdmin.from('audit_events').insert({ session_id: session.id, type: 'payment.initiated', data: { paymentRef: attempt.id, provider, total: quote.grandTotalPesewas } })
        return json({ ok: true, paymentRef: attempt.id, providerRef: init.providerRef, status: 'pending', amountPesewas: quote.sharePesewas, tipPesewas: quote.tipPesewas, totalPesewas: quote.grandTotalPesewas })
      } catch (e) { return json({ ok: false, reason: 'error', message: String(e) }) }
    },
  } },
})
