import { createFileRoute } from '@tanstack/react-router'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } }) }

export const Route = createFileRoute('/api/public/bill-dispute')({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { headers: cors }),
      POST: async ({ request }) => {
        try {
          const { sessionToken, note } = await request.json().catch(() => ({}) as { sessionToken?: unknown; note?: unknown })
          if (!sessionToken || typeof sessionToken !== 'string') return json({ ok: false, reason: 'invalid_session' })
          const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
          const { data: session } = await supabaseAdmin.from('dining_sessions').select('id,table_id,status,expires_at').eq('session_token', sessionToken).maybeSingle()
          if (!session || session.status !== 'active' || new Date(session.expires_at) < new Date()) return json({ ok: false, reason: 'invalid_session' })
          const { data: bill } = await supabaseAdmin.from('bills').select('id').eq('table_id', session.table_id).in('status', ['open', 'ready']).order('opened_at', { ascending: false }).maybeSingle()
          const safeNote = typeof note === 'string' ? note.slice(0, 500) : null
          // A bill problem creates a waiter-assistance request — the diner never edits the bill.
          await supabaseAdmin.from('bill_disputes').insert({ session_id: session.id, bill_id: bill?.id ?? null, note: safeNote })
          await supabaseAdmin.from('waiter_requests').insert({ session_id: session.id, table_id: session.table_id, kind: 'bill_issue' })
          await supabaseAdmin.from('audit_events').insert({ session_id: session.id, type: 'bill.disputed', data: { note: safeNote } })
          return json({ ok: true })
        } catch (e) { return json({ ok: false, reason: 'error', message: String(e) }) }
      },
    },
  },
})
