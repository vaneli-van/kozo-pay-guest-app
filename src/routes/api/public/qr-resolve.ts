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
            .select('token,status,expires_at,table_id,register_id')
            .eq('token', qrToken)
            .maybeSingle()
          if (!qr || qr.status !== 'active') return json({ ok: false, reason: 'invalid' })
          if (qr.expires_at && new Date(qr.expires_at) < new Date())
            return json({ ok: false, reason: 'expired' })

          // ── QSR register (order-and-pay) token: mirror the live Klown-tendered order into a bill ──
          if ((qr as any).register_id) {
            const { data: reg } = await supabase
              .from('pos_registers')
              .select('id,name,branch_id,restaurant_id,odoo_pos_config_id,mode,active')
              .eq('id', (qr as any).register_id)
              .maybeSingle()
            if (!reg || !reg.active) return json({ ok: false, reason: 'invalid' })
            const { data: rbranch } = await supabase
              .from('branches').select('id,name,restaurant_id').eq('id', reg.branch_id!).maybeSingle()
            const { data: rrestaurant } = await supabase
              .from('restaurants')
              .select('id,name,city,google_place_id,logo_url,hero_url,accent_color,tagline_top,tagline_bottom,welcome_copy')
              .eq('id', reg.restaurant_id).maybeSingle()

            let osession: Record<string, any> | null = null
            if (sessionToken && typeof sessionToken === 'string') {
              const { data } = await supabase
                .from('dining_sessions').select('*')
                .eq('session_token', sessionToken).eq('register_id', reg.id).maybeSingle()
              if (data && data.status === 'active' && new Date(data.expires_at) > new Date()) osession = data
            }
            if (!osession) {
              const { data: created } = await supabase
                .from('dining_sessions')
                .insert({ session_token: opaqueToken(), register_id: reg.id, bill_status: 'none' })
                .select('*').single()
              osession = created
            }

            // Read the current Klown-tendered order from Odoo and mirror it into a bill.
            const { syncRegisterBill } = await import('@/integrations/pos/register.server')
            const sync = await syncRegisterBill({ id: osession!['id'], register_id: reg.id })
            const hasOrder = sync.reason === 'ready'

            await supabase.from('audit_events').insert({ session_id: osession!['id'], type: 'session.resolved', data: { qrToken, mode: 'order', orderStatus: sync.reason } })

            return json({
              ok: true,
              mode: 'order',
              orderStatus: sync.reason,
              sessionToken: osession!['session_token'],
              restaurant: {
                name: rrestaurant!.name,
                city: rrestaurant!.city,
                logoUrl: (rrestaurant as any)!.logo_url ?? null,
                heroUrl: (rrestaurant as any)!.hero_url ?? null,
                accentColor: (rrestaurant as any)!.accent_color ?? null,
                taglineTop: (rrestaurant as any)!.tagline_top ?? null,
                taglineBottom: (rrestaurant as any)!.tagline_bottom ?? null,
                welcomeCopy: (rrestaurant as any)!.welcome_copy ?? null,
              },
              branch: { name: rbranch!.name },
              table: { label: reg.name },
              register: { id: reg.id, name: reg.name },
              hasActiveBill: hasOrder,
              billStatus: hasOrder ? 'open' : 'none',
              sessionStatus: osession!['status'],
              expiresAt: osession!['expires_at'],
            })
          }

          const { data: table } = await supabase
            .from('restaurant_tables')
            .select('id,label,branch_id')
            .eq('id', qr.table_id!)
            .maybeSingle()
          if (!table) return json({ ok: false, reason: 'invalid' })

          const { data: branch } = await supabase
            .from('branches')
            .select('id,name,restaurant_id')
            .eq('id', table.branch_id)
            .maybeSingle()
          const { data: restaurant } = await supabase
            .from('restaurants')
            .select('id,name,city,google_place_id,logo_url,hero_url,accent_color,tagline_top,tagline_bottom,welcome_copy')
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
            mode: 'table',
            sessionToken: session!['session_token'],
            restaurant: {
              name: restaurant!.name,
              city: restaurant!.city,
              logoUrl: (restaurant as any)!.logo_url ?? null,
              heroUrl: (restaurant as any)!.hero_url ?? null,
              accentColor: (restaurant as any)!.accent_color ?? null,
              taglineTop: (restaurant as any)!.tagline_top ?? null,
              taglineBottom: (restaurant as any)!.tagline_bottom ?? null,
              welcomeCopy: (restaurant as any)!.welcome_copy ?? null,
            },
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
