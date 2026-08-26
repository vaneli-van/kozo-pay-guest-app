import { createFileRoute } from '@tanstack/react-router'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}
const COOLDOWN_MS = 120000

export const Route = createFileRoute('/api/public/waiter-request')({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { headers: cors }),
      POST: async ({ request }) => {
        try {
          const { sessionToken, kind } = await request.json().catch(() => ({}) as { sessionToken?: unknown; kind?: unknown })
          if (!sessionToken || typeof sessionToken !== 'string') return json({ ok: false, reason: 'invalid_session' })

          const { supabaseAdmin: supabase } = await import('@/integrations/supabase/client.server')
          const { data: session } = await supabase
            .from('dining_sessions')
            .select('id,table_id,status,expires_at')
            .eq('session_token', sessionToken)
            .maybeSingle()
          if (!session || session.status !== 'active' || new Date(session.expires_at) < new Date())
            return json({ ok: false, reason: 'invalid_session' })

          const { data: last } = await supabase
            .from('waiter_requests')
            .select('id,created_at')
            .eq('session_id', session.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
          if (last && Date.now() - new Date(last.created_at).getTime() < COOLDOWN_MS)
            return json({ ok: true, cooldown: true })

          const safeKind = typeof kind === 'string' && kind.length <= 40 ? kind : 'assistance'
          await supabase.from('waiter_requests').insert({ session_id: session.id, table_id: session.table_id, kind: safeKind })
          await supabase.from('audit_events').insert({ session_id: session.id, type: 'waiter.requested', data: { kind: safeKind } })
          return json({ ok: true, cooldown: false })
        } catch (e) {
          return json({ ok: false, reason: 'error', message: String(e) })
        }
      },
    },
  },
})
