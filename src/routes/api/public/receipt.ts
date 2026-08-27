import { createFileRoute } from '@tanstack/react-router'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

function receiptNumber(): string {
  const a = new Uint8Array(4); crypto.getRandomValues(a)
  return 'KZ-' + [...a].map((b) => b.toString(36)).join('').slice(0, 6).toUpperCase()
}
export const Route = createFileRoute('/api/public/receipt')({
  server: { handlers: {
    OPTIONS: async () => new Response(null, { headers: cors }),
    POST: async ({ request }) => {
      try {
        const { sessionToken } = await request.json().catch(() => ({}) as { sessionToken?: unknown })
        if (!sessionToken || typeof sessionToken !== 'string') return json({ ok: false, reason: 'invalid_session' })
        const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
        const { data: session } = await supabaseAdmin.from('dining_sessions').select('id,table_id,status,expires_at,active_bill_id').eq('session_token', sessionToken).maybeSingle()
        if (!session || session.status !== 'active' || new Date(session.expires_at) < new Date()) return json({ ok: false, reason: 'invalid_session' })
        const { data: caps } = await supabaseAdmin.from('payment_attempts').select('total_pesewas').eq('session_id', session.id).eq('status', 'captured')
        const totalPaid = (caps ?? []).reduce((s: number, r: { total_pesewas: number | null }) => s + (r.total_pesewas ?? 0), 0)
        if (!caps || caps.length === 0) return json({ ok: false, reason: 'no_payment' })
        // restaurant context
        const { data: table } = await supabaseAdmin.from('restaurant_tables').select('branch_id').eq('id', session.table_id).maybeSingle()
        const { data: branch } = table ? await supabaseAdmin.from('branches').select('restaurant_id').eq('id', table.branch_id).maybeSingle() : { data: null }
        const { data: restaurant } = branch ? await supabaseAdmin.from('restaurants').select('name,city').eq('id', branch.restaurant_id).maybeSingle() : { data: null }
        let { data: receipt } = await supabaseAdmin.from('receipts').select('receipt_number,total_paid_pesewas,issued_at').eq('session_id', session.id).maybeSingle()
        if (!receipt) {
          const { data: created } = await supabaseAdmin.from('receipts').insert({ session_id: session.id, bill_id: session.active_bill_id, receipt_number: receiptNumber(), total_paid_pesewas: totalPaid }).select('receipt_number,total_paid_pesewas,issued_at').single()
          receipt = created
          await supabaseAdmin.from('audit_events').insert({ session_id: session.id, type: 'receipt.issued', data: { total: totalPaid } })
        }
        return json({ ok: true, receiptNumber: receipt!.receipt_number, totalPaidPesewas: receipt!.total_paid_pesewas, issuedAt: receipt!.issued_at, restaurant: restaurant ? { name: restaurant.name, city: restaurant.city } : null })
      } catch (e) { return json({ ok: false, reason: 'error', message: String(e) }) }
    },
  } },
})
