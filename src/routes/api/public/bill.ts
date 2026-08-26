import { createFileRoute } from '@tanstack/react-router'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } }) }

export const Route = createFileRoute('/api/public/bill')({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { headers: cors }),
      POST: async ({ request }) => {
        try {
          const { sessionToken } = await request.json().catch(() => ({}) as { sessionToken?: unknown })
          if (!sessionToken || typeof sessionToken !== 'string') return json({ ok: false, reason: 'invalid_session' })
          const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
          const { data: session } = await supabaseAdmin.from('dining_sessions').select('id,table_id,status,expires_at').eq('session_token', sessionToken).maybeSingle()
          if (!session || session.status !== 'active' || new Date(session.expires_at) < new Date()) return json({ ok: false, reason: 'invalid_session' })
          const { posProvider } = await import('@/integrations/pos/provider')
          const bill = await posProvider.getActiveBillForTable(session.table_id)
          if (!bill) return json({ ok: true, bill: null })
          // Read-only: the diner can never mutate bill items.
          return json({ ok: true, bill: { status: bill.status, items: bill.items, subtotalPesewas: bill.subtotalPesewas, serviceChargePesewas: bill.serviceChargePesewas, totalPesewas: bill.totalPesewas } })
        } catch (e) { return json({ ok: false, reason: 'error', message: String(e) }) }
      },
    },
  },
})
