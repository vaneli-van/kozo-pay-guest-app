import { createFileRoute } from '@tanstack/react-router'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

export const Route = createFileRoute('/api/public/feedback')({
  server: { handlers: {
    OPTIONS: async () => new Response(null, { headers: cors }),
    POST: async ({ request }) => {
      try {
        const { sessionToken, rating, comment } = await request.json().catch(() => ({}) as { sessionToken?: unknown; rating?: unknown; comment?: unknown })
        if (!sessionToken || typeof sessionToken !== 'string') return json({ ok: false, reason: 'invalid_session' })
        const r = typeof rating === 'number' ? Math.trunc(rating) : NaN
        if (!(r >= 1 && r <= 5)) return json({ ok: false, reason: 'invalid_rating' })
        const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
        const { data: session } = await supabaseAdmin.from('dining_sessions').select('id,status,expires_at').eq('session_token', sessionToken).maybeSingle()
        if (!session || session.status !== 'active' || new Date(session.expires_at) < new Date()) return json({ ok: false, reason: 'invalid_session' })
        const sentiment = r >= 4 ? 'positive' : r <= 2 ? 'negative' : 'neutral'
        const safeComment = typeof comment === 'string' ? comment.slice(0, 1000) : null
        await supabaseAdmin.from('feedback').insert({ session_id: session.id, rating: r, comment: safeComment, sentiment })
        await supabaseAdmin.from('audit_events').insert({ session_id: session.id, type: 'feedback.submitted', data: { rating: r, sentiment } })
        return json({ ok: true, sentiment })
      } catch (e) { return json({ ok: false, reason: 'error', message: String(e) }) }
    },
  } },
})
