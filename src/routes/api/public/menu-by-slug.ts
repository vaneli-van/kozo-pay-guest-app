import { createFileRoute } from '@tanstack/react-router'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

export const Route = createFileRoute('/api/public/menu-by-slug')({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { headers: cors }),
      POST: async ({ request }) => {
        try {
          const { slug } = await request.json().catch(() => ({}) as { slug?: unknown })
          if (!slug || typeof slug !== 'string') return json({ ok: false, reason: 'invalid_slug' })

          const { supabaseAdmin: supabase } = await import('@/integrations/supabase/client.server')

          const { data: dig } = await supabase
            .from('studio_digital_settings')
            .select('menu_id,biz_name,info,phone,link_url,link_text,logo_url,banner_url,banner_bg,welcome_alert,published')
            .eq('public_slug', slug)
            .maybeSingle()
          if (!dig || !dig.published) return json({ ok: false, reason: 'not_found' })

          const { data: menu } = await supabase
            .from('studio_menus')
            .select('id,name,currency,status')
            .eq('id', dig.menu_id)
            .maybeSingle()
          if (!menu || menu.status !== 'live') return json({ ok: false, reason: 'not_found' })

          const { data: theme } = await supabase.from('studio_themes').select('tokens,template_name').eq('menu_id', menu.id).maybeSingle()
          const { data: secs } = await supabase.from('studio_sections').select('id,name,sort').eq('menu_id', menu.id).eq('visible', true).order('sort')
          const secIds = (secs ?? []).map((x: any) => x.id)
          const { data: its } = secIds.length
            ? await supabase.from('studio_items').select('id,section_id,name,description,price_pesewas,price_display,image_url,tags,available,sold_out,sort').in('section_id', secIds).eq('visible', true).order('sort')
            : { data: [] }
          const bySec: Record<string, any[]> = {}
          for (const it of its ?? []) { (bySec[it.section_id] ||= []).push(it) }
          const sections = (secs ?? [])
            .map((x: any) => ({ id: x.id, name: x.name, items: bySec[x.id] ?? [] }))
            .filter((x: any) => x.items.length > 0)

          return json({ ok: true, source: 'studio', menu_name: menu.name, currency: menu.currency ?? 'GHS', theme: theme?.tokens ?? null, template: theme?.template_name ?? null, digital: dig, sections })
        } catch (e) {
          return json({ ok: false, reason: 'error', message: String(e) })
        }
      },
    },
  },
})
