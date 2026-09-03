import { createFileRoute } from '@tanstack/react-router'
import { computeQuote, QuoteError, type ShareMode } from '@/integrations/billing/calc'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

export const Route = createFileRoute('/api/public/quote')({
  server: { handlers: {
    OPTIONS: async () => new Response(null, { headers: cors }),
    POST: async ({ request }) => {
      try {
        const body = await request.json().catch(() => ({} as Record<string, unknown>))
        const sessionToken = body.sessionToken
        if (!sessionToken || typeof sessionToken !== 'string') return json({ ok: false, reason: 'invalid_session' })
        const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
        const { data: session } = await supabaseAdmin.from('dining_sessions').select('id,table_id,status,expires_at').eq('session_token', sessionToken).maybeSingle()
        if (!session || session.status !== 'active' || new Date(session.expires_at) < new Date()) return json({ ok: false, reason: 'invalid_session' })
        const { posProvider } = await import('@/integrations/pos/provider')
        const bill = await posProvider.getActiveBillForTable(session.table_id)
        if (!bill) return json({ ok: false, reason: 'no_bill' })
        const { amountPaidForBill } = await import('@/integrations/payments/provider')
        const amountPaidPesewas = await amountPaidForBill(bill.id)
        let shareBasePesewas: number | undefined
        let splitShareId: string | undefined
        if (typeof body.shareId === 'string') {
          let { data: sh } = await supabaseAdmin.from('bill_split_shares')
            .select('id,amount_pesewas,status,split_id').eq('id', body.shareId).maybeSingle()
          if (!sh) return json({ ok: false, reason: 'invalid_share' })
          if (sh.status === 'paid') return json({ ok: false, reason: 'share_paid' })
          const { data: sp } = await supabaseAdmin.from('bill_splits')
            .select('bill_id,status,mode').eq('id', sh.split_id).maybeSingle()
          if (!sp || sp.status !== 'open' || sp.bill_id !== bill.id) return json({ ok: false, reason: 'invalid_share' })
          if (sp.mode === 'items') {
            // Item amounts move as diners pick — recompute so we charge the current figure.
            const { recomputeItemSplit } = await import('@/integrations/billing/itemsplit.server')
            await recomputeItemSplit(supabaseAdmin, sh.split_id)
            const refreshed = await supabaseAdmin.from('bill_split_shares')
              .select('id,amount_pesewas,status,split_id').eq('id', body.shareId).maybeSingle()
            if (!refreshed.data) return json({ ok: false, reason: 'invalid_share' })
            sh = refreshed.data
          }
          shareBasePesewas = sh.amount_pesewas
          splitShareId = sh.id
        }
        void splitShareId
        try {
          const quote = computeQuote({
            totalPesewas: bill.totalPesewas, amountPaidPesewas,
            mode: shareBasePesewas != null ? 'custom' : ((body.mode as ShareMode) ?? 'full'),
            people: typeof body.people === 'number' ? body.people : undefined,
            customAmountPesewas: shareBasePesewas != null ? shareBasePesewas : (typeof body.customAmountPesewas === 'number' ? body.customAmountPesewas : undefined),
            tipPesewas: typeof body.tipPesewas === 'number' ? body.tipPesewas : undefined,
            tipPercent: typeof body.tipPercent === 'number' ? body.tipPercent : undefined,
          })

          return json({ ok: true, quote })
        } catch (e) { if (e instanceof QuoteError) return json({ ok: false, reason: e.reason }); throw e }
      } catch (e) { return json({ ok: false, reason: 'error', message: String(e) }) }
    },
  } },
})
