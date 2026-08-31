import { createFileRoute } from '@tanstack/react-router'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type, x-connector-token', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
function json(b: unknown, s = 200) { return new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } }) }

// Connector long-polls this for work (cloud never dials the LAN). Two modes:
//   { token }                          -> returns pending commands and marks them picked
//   { token, ack: { id, ok, result } } -> marks a command done/failed
export const Route = createFileRoute('/api/connector/commands')({
  server: { handlers: {
    OPTIONS: async () => new Response(null, { headers: cors }),
    POST: async ({ request }) => {
      try {
        const body: any = await request.json().catch(() => ({}))
        const token = body?.token || request.headers.get('x-connector-token')
        if (!token) return json({ ok: false, reason: 'no_token' }, 401)
        const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
        const { data: conn } = await supabaseAdmin.from('pos_connectors').select('id,restaurant_id,active').eq('token', token).maybeSingle()
        if (!conn || !conn.active) return json({ ok: false, reason: 'invalid_token' }, 401)
        await supabaseAdmin.from('pos_connectors').update({ last_seen_at: new Date().toISOString() }).eq('id', conn.id)

        if (body?.ack?.id) {
          await supabaseAdmin.from('pos_commands')
            .update({ status: body.ack.ok ? 'done' : 'failed', result: String(body.ack.result || '').slice(0, 500), done_at: new Date().toISOString() })
            .eq('id', body.ack.id).eq('restaurant_id', conn.restaurant_id)
          return json({ ok: true })
        }

        const { data: cmds } = await supabaseAdmin.from('pos_commands')
          .select('id,kind,payload').eq('restaurant_id', conn.restaurant_id).eq('status', 'pending')
          .order('created_at').limit(20)
        const ids = (cmds ?? []).map((c: any) => c.id)
        if (ids.length) await supabaseAdmin.from('pos_commands').update({ status: 'picked', picked_at: new Date().toISOString() }).in('id', ids)
        return json({ ok: true, commands: cmds ?? [] })
      } catch (e) { return json({ ok: false, reason: 'error', message: String(e) }, 500) }
    },
  } },
})
