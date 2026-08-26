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

          const { data: categories } = await supabase.from('menu_categories').select('id,name,sort').eq('branch_id', branchId).order('sort')
          const catIds = (categories ?? []).map((c) => c.id)
          const { data: items } = catIds.length
            ? await supabase.from('menu_items').select('id,category_id,name,price_pesewas,image_key,tags,sort,available').in('category_id', catIds).order('sort')
            : { data: [] }
          const { data: recommendations } = await supabase.from('recommendations').select('id,item_id,kind,title,subtitle,sort').eq('branch_id', branchId).order('sort')

          return json({ ok: true, categories: categories ?? [], items: items ?? [], recommendations: recommendations ?? [] })
        } catch (e) {
          return json({ ok: false, reason: 'error', message: String(e) })
        }
      },
    },
  },
})
