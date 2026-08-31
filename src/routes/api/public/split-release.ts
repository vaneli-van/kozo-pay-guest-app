import { createFileRoute } from '@tanstack/react-router'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

export const Route = createFileRoute('/api/public/split-release')({
  server: { handlers: {
    OPTIONS: async () => new Response(null, { headers: cors }),
    POST: async ({ request }) => {
      try {
        const body = await request.json().catch(() => ({} as Record<string, unknown>))
        const sessionToken = body.sessionToken
        const shareId = body.shareId
        if (typeof sessionToken !== 'string') return json({ ok: false, reason: 'invalid_session' })
        if (typeof shareId !== 'string') return json({ ok: false, reason: 'invalid_share' })
        const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
        const { data: session } = await supabaseAdmin.from('dining_sessions').select('id,table_id,status,expires_at').eq('session_token', sessionToken).maybeSingle()
        if (!session || session.status !== 'active' || new Date(session.expires_at) < new Date()) return json({ ok: false, reason: 'invalid_session' })
        const { data: released } = await supabaseAdmin.from('bill_split_shares')
          .update({ status: 'unclaimed', claimed_by_session: null, claimed_by_name: null })
          .eq('id', shareId).eq('status', 'claimed').eq('claimed_by_session', session.id)
          .select('id').maybeSingle()
        if (!released) return json({ ok: false, reason: 'not_yours' })
        return json({ ok: true })
      } catch (e) { return json({ ok: false, reason: 'error', message: String(e) }) }
    },
  } },
})
