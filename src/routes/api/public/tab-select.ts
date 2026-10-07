import { createFileRoute } from '@tanstack/react-router'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

// The diner picks which bill (tab) at their table is theirs, when separate groups share a table.
// The bill must be open and on the diner's own table.
export const Route = createFileRoute('/api/public/tab-select')({
  server: { handlers: {
    OPTIONS: async () => new Response(null, { headers: cors }),
    POST: async ({ request }) => {
      try {
        const { sessionToken, billId } = await request.json().catch(() => ({}) as { sessionToken?: unknown; billId?: unknown })
        if (typeof sessionToken !== 'string') return json({ ok: false, reason: 'invalid_session' })
        if (typeof billId !== 'string') return json({ ok: false, reason: 'invalid_bill' })
        const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
        const { data: session } = await supabaseAdmin.from('dining_sessions').select('id,table_id,status,expires_at').eq('session_token', sessionToken).maybeSingle()
        if (!session || session.status !== 'active' || new Date(session.expires_at) < new Date() || !session.table_id) return json({ ok: false, reason: 'invalid_session' })
        const { data: bill } = await supabaseAdmin.from('bills').select('id,table_id,status,tab_label').eq('id', billId).maybeSingle()
        if (!bill || bill.table_id !== session.table_id || !['open', 'ready'].includes(bill.status)) return json({ ok: false, reason: 'invalid_bill' })
        await supabaseAdmin.from('dining_sessions').update({ active_bill_id: bill.id, active_bill_chosen: true, bill_status: 'open' } as any).eq('id', session.id)
        await supabaseAdmin.from('audit_events').insert({ session_id: session.id, type: 'tab.selected', data: { billId: bill.id, label: (bill as any).tab_label ?? null } })
        return json({ ok: true })
      } catch (e) { return json({ ok: false, reason: 'error', message: String(e) }) }
    },
  } },
})
