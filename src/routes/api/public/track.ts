import { createFileRoute } from '@tanstack/react-router'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

// Lightweight diner funnel tracking. The client beacons screen views (and a few
// key actions) here; we resolve the restaurant server-side from the session token
// so attribution can't be spoofed, and log to analytics_events. Fire-and-forget:
// never blocks or breaks the diner flow.
export const Route = createFileRoute('/api/public/track')({
  server: { handlers: {
    OPTIONS: async () => new Response(null, { headers: cors }),
    POST: async ({ request }) => {
      try {
        const body = await request.json().catch(() => ({} as any))
        const sessionToken = typeof body?.sessionToken === 'string' ? body.sessionToken : null
        const event = typeof body?.event === 'string' ? body.event.slice(0, 64) : null
        const screen = typeof body?.screen === 'string' ? body.screen.slice(0, 64) : null
        const props = body?.props && typeof body.props === 'object' ? body.props : {}
        if (!sessionToken || !event) return json({ ok: false })

        const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
        const { data: session } = await supabaseAdmin.from('dining_sessions').select('id,table_id').eq('session_token', sessionToken).maybeSingle()
        if (!session) return json({ ok: false })

        let restaurant_id: string | null = null
        let branch_id: string | null = null
        let table_label: string | null = null
        if (session.table_id) {
          const { data: table } = await supabaseAdmin.from('restaurant_tables').select('label,branch_id').eq('id', session.table_id).maybeSingle()
          if (table) {
            table_label = table.label
            branch_id = table.branch_id
            const { data: branch } = await supabaseAdmin.from('branches').select('restaurant_id').eq('id', table.branch_id).maybeSingle()
            restaurant_id = branch?.restaurant_id ?? null
          }
        }

        // Keep props small and JSON-safe.
        let safeProps: Record<string, unknown> = {}
        try { safeProps = JSON.parse(JSON.stringify(props)); if (JSON.stringify(safeProps).length > 2000) safeProps = {} } catch { safeProps = {} }

        await supabaseAdmin.from('analytics_events').insert({
          session_id: session.id, restaurant_id, branch_id, table_label, event, screen, props: safeProps,
        })
        return json({ ok: true })
      } catch { return json({ ok: false }) }
    },
  } },
})
