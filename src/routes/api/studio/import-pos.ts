import { createFileRoute } from '@tanstack/react-router'

// Owner-portal-triggered POS import: pulls a restaurant's Odoo POS products and
// seeds a studio menu (sections by POS category, items by product). Called by the
// owner portal with the owner's Supabase access token; authorises server-side that
// the caller owns the menu's restaurant, then writes with the service role.
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
function json(b: unknown, s = 200) { return new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } }) }

export const Route = createFileRoute('/api/studio/import-pos')({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { headers: cors }),
      POST: async ({ request }) => {
        try {
          const { token, menuId } = await request.json().catch(() => ({}) as { token?: unknown; menuId?: unknown })
          if (!token || typeof token !== 'string') return json({ ok: false, reason: 'no_token' }, 401)
          if (!menuId || typeof menuId !== 'string') return json({ ok: false, reason: 'bad_menu' })

          const { supabaseAdmin } = await import('@/integrations/supabase/client.server')

          const { data: userRes, error: uErr } = await supabaseAdmin.auth.getUser(token)
          if (uErr || !userRes?.user) return json({ ok: false, reason: 'unauthorized' }, 401)
          const user = userRes.user
          const email = (user.email || '').toLowerCase()

          const { data: ru } = await supabaseAdmin.from('restaurant_users').select('restaurant_id,user_id,email')
          const own = new Set((ru ?? []).filter((r: any) => r.user_id === user.id || (r.email || '').toLowerCase() === email).map((r: any) => r.restaurant_id))

          const { data: menu } = await supabaseAdmin.from('studio_menus').select('id,restaurant_id').eq('id', menuId).maybeSingle()
          if (!menu) return json({ ok: false, reason: 'menu_not_found' }, 404)
          if (!own.has(menu.restaurant_id)) return json({ ok: false, reason: 'forbidden' }, 403)
          const rid = menu.restaurant_id

          const { data: cred } = await supabaseAdmin.from('pos_odoo_credentials').select('base_url,db,username,api_key,active').eq('restaurant_id', rid).maybeSingle()
          if (!cred || !cred.active || !cred.base_url || !cred.api_key) return json({ ok: false, reason: 'no_pos' })
          const cfg = { base_url: cred.base_url, db: cred.db, username: cred.username || 'admin', api_key: cred.api_key }

          const { searchRead } = await import('@/integrations/pos/odoo.server')
          const cats = await searchRead(cfg, 'pos.category', [], ['id', 'name', 'sequence'])
          const catById = new Map<number, { name: string; sequence: number }>()
          for (const c of cats) catById.set(c.id, { name: String(c.name || '').trim() || 'Menu', sequence: c.sequence ?? 999 })
          const prods = await searchRead(cfg, 'product.template', [['available_in_pos', '=', true]], ['id', 'display_name', 'list_price', 'description_sale', 'pos_categ_ids'])

          const { data: job } = await supabaseAdmin.from('studio_import_jobs').insert({ restaurant_id: rid, menu_id: menuId, source: 'odoo', status: 'committed', created_by: user.id }).select('id').single()

          const { data: existSecs } = await supabaseAdmin.from('studio_sections').select('id,name,sort').eq('menu_id', menuId)
          const sectionByName = new Map<string, string>()
          let maxSort = 0
          for (const s of existSecs ?? []) { sectionByName.set(String(s.name || '').toLowerCase(), s.id); if ((s.sort ?? 0) > maxSort) maxSort = s.sort }
          const secIds = (existSecs ?? []).map((s: any) => s.id)
          const existPos = new Set<string>()
          if (secIds.length) {
            const { data: ei } = await supabaseAdmin.from('studio_items').select('pos_id').in('section_id', secIds)
            for (const it of ei ?? []) if (it.pos_id) existPos.add(String(it.pos_id))
          }
          const { data: cat0 } = await supabaseAdmin.from('studio_catalogue_items').select('id,pos_id').eq('restaurant_id', rid)
          const catByPos = new Map<string, string>()
          for (const c of cat0 ?? []) if (c.pos_id) catByPos.set(String(c.pos_id), c.id)

          type P = { id: number; name: string; price: number; desc: string | null }
          const groups = new Map<number, P[]>()
          for (const p of prods) {
            const catId = Array.isArray(p.pos_categ_ids) && p.pos_categ_ids.length ? p.pos_categ_ids[0] : -1
            const rec: P = {
              id: p.id,
              name: String(p.display_name || '').trim() || 'Item',
              price: Math.round((p.list_price || 0) * 100),
              desc: p.description_sale && String(p.description_sale).trim() ? String(p.description_sale).trim() : null,
            }
            if (!groups.has(catId)) groups.set(catId, [])
            groups.get(catId)!.push(rec)
          }
          const keys = [...groups.keys()].sort((a, b) => {
            const sa = a > 0 ? (catById.get(a)?.sequence ?? 999) : 9999
            const sb = b > 0 ? (catById.get(b)?.sequence ?? 999) : 9999
            return sa - sb || a - b
          })

          let sectionsAdded = 0, itemsAdded = 0, skipped = 0
          for (const key of keys) {
            const list = groups.get(key)!
            const catName = key > 0 ? (catById.get(key)?.name || 'Menu') : 'Other'
            let sid = sectionByName.get(catName.toLowerCase())
            if (!sid) {
              maxSort += 10
              const { data: ns } = await supabaseAdmin.from('studio_sections').insert({ menu_id: menuId, restaurant_id: rid, name: catName, type: 'Standard', sort: maxSort }).select('id').single()
              if (!ns) continue
              sid = ns.id as string
              sectionByName.set(catName.toLowerCase(), sid)
              sectionsAdded++
            }
            const { data: cur } = await supabaseAdmin.from('studio_items').select('sort').eq('section_id', sid).order('sort', { ascending: false }).limit(1)
            let isort = (cur?.[0]?.sort ?? 0)
            for (const p of list) {
              const pid = String(p.id)
              if (existPos.has(pid)) { skipped++; continue }
              let catItemId = catByPos.get(pid) || null
              if (!catItemId) {
                const { data: nc } = await supabaseAdmin.from('studio_catalogue_items').insert({ restaurant_id: rid, name: p.name, description: p.desc, price_pesewas: p.price, pos_id: pid, updated_by: user.id }).select('id').single()
                if (nc) { catItemId = nc.id as string; catByPos.set(pid, catItemId) }
              }
              isort += 10
              const { error: iErr } = await supabaseAdmin.from('studio_items').insert({ section_id: sid, restaurant_id: rid, catalogue_item_id: catItemId, name: p.name, description: p.desc, price_pesewas: p.price, pos_id: pid, sort: isort, updated_by: user.id })
              if (!iErr) { itemsAdded++; existPos.add(pid) }
            }
          }
          await supabaseAdmin.from('studio_menus').update({ source: 'pos' }).eq('id', menuId)
          return json({ ok: true, sections_added: sectionsAdded, items_added: itemsAdded, skipped, total_products: prods.length, job_id: job?.id ?? null })
        } catch (e) {
          return json({ ok: false, reason: 'error', message: String(e) }, 500)
        }
      },
    },
  },
})
