import { createFileRoute } from '@tanstack/react-router'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

// One Postgres call does the whole thing (session check, split lookup, write, recompute, board):
// see items_split_* / split_board in the database. Keeps a tap or a poll to a single round trip.
export const Route = createFileRoute('/api/public/split-assign')({
  server: { handlers: {
    OPTIONS: async () => new Response(null, { headers: cors }),
    POST: async ({ request }) => {
      try {
        const body = await request.json().catch(() => ({} as Record<string, unknown>))
        const sessionToken = body.sessionToken
        if (typeof sessionToken !== 'string') return json({ ok: false, reason: 'invalid_session' })
        const billItemId = body.billItemId
        if (typeof billItemId !== 'string') return json({ ok: false, reason: 'invalid_item' })
        const units = Math.trunc(Number(body.units ?? 0))
        if (!Number.isFinite(units)) return json({ ok: false, reason: 'invalid_units' })
        const name = typeof body.name === 'string' ? body.name : null
        const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
        const { data, error } = await supabaseAdmin.rpc('items_split_assign', { p_session_token: sessionToken, p_bill_item_id: billItemId, p_units: units, p_name: name })
        if (error) return json({ ok: false, reason: 'error', message: error.message })
        return json(data ?? { ok: false, reason: 'error' })
      } catch (e) { return json({ ok: false, reason: 'error', message: String(e) }) }
    },
  } },
})
