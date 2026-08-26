import { createFileRoute } from '@tanstack/react-router'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

function opaqueToken(bytes = 24) {
  const a = new Uint8Array(bytes)
  crypto.getRandomValues(a)
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export const Route = createFileRoute('/api/public/qr-resolve')({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { headers: cors }),
      POST: async ({ request }) => {
        try {
          const { qrToken, sessionToken } = await request
            .json()
            .catch(() => ({}) as { qrToken?: unknown; sessionToken?: unknown })

          if (!qrToken || typeof qrToken !== 'string') return json({ ok: false, reason: 'invalid' })

          const { supabaseAdmin: supabase } = await import('@/integrations/supabase/client.server')

          const { data: qr } = await supabase
            .from('qr_tokens')
            .select('token,status,expires_at,table_id')
            .eq('token', qrToken)
            .maybeSingle()
          if (!qr || qr.status !== 'active') return json({ ok: false, reason: 'invalid' })
          if (qr.expires_at && new Date(qr.expires_at) < new Date())
            return json({ ok: false, reason: 'expired' })

          const { data: table } = await supabase
            .from('restaurant_tables')
            .select('id,label,branch_id')
            .eq('id', qr.table_id)
            .maybeSingle()
          if (!table) return json({ ok: false, reason: 'invalid' })

          const { data: branch } = await supabase
            .from('branches')
            .select('id,name,restaurant_id')
            .eq('id', table.branch_id)
            .maybeSingle()
          const { data: restaurant } = await supabase
            .from('restaurants')
            .select('id,name,city,google_place_id')
            .eq('id', branch!.restaurant_id)
            .maybeSingle()

          const { data: bill } = await supabase
            .from('bills')
            .select('id,status,subtotal_pesewas,service_charge_pesewas,total_pesewas')
            .eq('table_id', table.id)
            .in('status', ['open', 'ready'])
            .order('opened_at', { ascending: false })
            .maybeSingle()
          const billStatus = bill ? bill.status : 'none'

          let session: Record<string, any> | null = null
          if (sessionToken && typeof sessionToken === 'string') {
            const { data } = await supabase
              .from('dining_sessions')
              .select('*')
              .eq('session_token', sessionToken)
              .eq('table_id', table.id)
              .maybeSingle()
            if (data && data.status === 'active' && new Date(data.expires_at) > new Date())
              session = data
          }

          if (!session) {
            const { data: created } = await supabase
              .from('dining_sessions')
              .insert({
                session_token: opaqueToken(),
                table_id: table.id,
                active_bill_id: bill?.id ?? null,
                bill_status: billStatus,
              })
              .select('*')
              .single()
            session = created
          } else {
            await supabase
              .from('dining_sessions')
              .update({ active_bill_id: bill?.id ?? null, bill_status: billStatus })
              .eq('id', session['id'])
          }

          await supabase
            .from('audit_events')
            .insert({ session_id: session!['id'], type: 'session.resolved', data: { qrToken } })

          return json({
            ok: true,
            sessionToken: session!['session_token'],
            restaurant: { name: restaurant!.name, city: restaurant!.city },
            branch: { name: branch!.name },
            table: { label: table.label },
            sessionStatus: session!['status'],
            hasActiveBill: !!bill,
            billStatus,
            expiresAt: session!['expires_at'],
          })
        } catch (e) {
          return json({ ok: false, reason: 'error', message: String(e) })
        }
      },
    },
  },
})
