import { createFileRoute } from '@tanstack/react-router'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

export const Route = createFileRoute('/api/public/menu')({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { headers: cors }),
      POST: async ({ request }) => {
        try {
          const { sessionToken } = await request.json().catch(() => ({}) as { sessionToken?: unknown })
          if (!sessionToken || typeof sessionToken !== 'string') return json({ ok: false, reason: 'invalid_session' })

          const { supabaseAdmin: supabase } = await import('@/integrations/supabase/client.server')
          const { data: session } = await supabase
            .from('dining_sessions')
            .select('id,table_id,status,expires_at')
            .eq('session_token', sessionToken)
            .maybeSingle()
          if (!session || session.status !== 'active' || new Date(session.expires_at) < new Date())
            return json({ ok: false, reason: 'invalid_session' })

          const { data: table } = await supabase.from('restaurant_tables').select('branch_id').eq('id', session.table_id).maybeSingle()
          const branchId = table!.branch_id
          const { data: branch } = await supabase.from('branches').select('restaurant_id').eq('id', branchId).maybeSingle()
          const restaurantId = branch?.restaurant_id

          // Published (live) Menu Studio menus take over the diner menu, themed. Supports multiple live menus.
          if (restaurantId) {
            const { data: sms } = await supabase.from('studio_menus').select('id,name,currency').eq('restaurant_id', restaurantId).eq('status', 'live').order('updated_at', { ascending: false })
            if (sms && sms.length) {
              const menus: any[] = []
              for (const studio of sms) {
                const { data: theme } = await supabase.from('studio_themes').select('tokens,template_name').eq('menu_id', studio.id).maybeSingle()
                const { data: dig } = await supabase.from('studio_digital_settings').select('biz_name,info,phone,link_url,link_text,logo_url,banner_url,banner_bg,welcome_alert,hours').eq('menu_id', studio.id).maybeSingle()
                const { data: secs } = await supabase.from('studio_sections').select('id,name,sort').eq('menu_id', studio.id).eq('visible', true).order('sort')
                const secIds = (secs ?? []).map((x: any) => x.id)
                const { data: its } = secIds.length
                  ? await supabase.from('studio_items').select('id,section_id,name,description,price_pesewas,price_display,image_url,tags,available,sold_out,sort').in('section_id', secIds).eq('visible', true).order('sort')
                  : { data: [] }
                const bySec: Record<string, any[]> = {}
                for (const it of its ?? []) { (bySec[it.section_id] ||= []).push(it) }
                const sections = (secs ?? [])
                  .map((x: any) => ({ id: x.id, name: x.name, items: bySec[x.id] ?? [] }))
                  .filter((x: any) => x.items.length > 0)
                if (sections.length) menus.push({ id: studio.id, name: studio.name, currency: studio.currency ?? 'GHS', theme: theme?.tokens ?? null, template: theme?.template_name ?? null, digital: dig ?? null, sections })
              }
              if (menus.length) {
                const first = menus[0]
                return json({ ok: true, source: 'studio', currency: first.currency, theme: first.theme, template: first.template, digital: first.digital, sections: first.sections, menus })
              }
            }
          }

          // Fallback: the POS-synced menu (menu_categories / menu_items).
          const { data: categories } = await supabase.from('menu_categories').select('id,name,sort').eq('branch_id', branchId).order('sort')
          const catIds = (categories ?? []).map((c) => c.id)
          const { data: items } = catIds.length
            ? await supabase.from('menu_items').select('id,category_id,name,price_pesewas,image_key,tags,sort,available').in('category_id', catIds).order('sort')
            : { data: [] }
          const { data: recommendations } = await supabase.from('recommendations').select('id,item_id,kind,title,subtitle,sort').eq('branch_id', branchId).order('sort')

          return json({ ok: true, source: 'pos', categories: categories ?? [], items: items ?? [], recommendations: recommendations ?? [] })
        } catch (e) {
          return json({ ok: false, reason: 'error', message: String(e) })
        }
      },
    },
  },
})
