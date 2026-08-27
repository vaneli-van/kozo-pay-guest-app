import { createFileRoute } from '@tanstack/react-router'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

const W = 32
const pes = (n: number) => (n / 100).toFixed(2)
const center = (t: string) => {
  const p = Math.max(0, Math.floor((W - t.length) / 2))
  return ' '.repeat(p) + t
}
const line = (l: string, r: string) => {
  const gap = Math.max(1, W - l.length - r.length)
  return l.slice(0, W - r.length - 1) + ' '.repeat(gap) + r
}
const rule = (c = '-') => c.repeat(W)

// E.164 for Ghana (defaults to +233 when a local 0-prefixed number is given).
function toE164(raw: string): string | null {
  const d = raw.replace(/\D/g, '')
  if (!d) return null
  if (raw.trim().startsWith('+')) return '+' + d
  if (d.startsWith('233')) return '+' + d
  if (d.startsWith('0')) return '+233' + d.slice(1)
  if (d.length === 9) return '+233' + d
  return '+' + d
}

export const Route = createFileRoute('/api/public/receipt-whatsapp')({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { headers: cors }),
      POST: async ({ request }) => {
        try {
          const { sessionToken, phone } = await request.json().catch(() => ({}) as { sessionToken?: unknown; phone?: unknown })
          if (!sessionToken || typeof sessionToken !== 'string') return json({ ok: false, reason: 'invalid_session' })
          if (typeof phone !== 'string') return json({ ok: false, reason: 'invalid_phone' })
          const e164 = toE164(phone)
          if (!e164 || e164.replace(/\D/g, '').length < 11) return json({ ok: false, reason: 'invalid_phone' })

          const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
          const { data: session } = await supabaseAdmin
            .from('dining_sessions').select('id,table_id,status,expires_at,active_bill_id').eq('session_token', sessionToken).maybeSingle()
          if (!session || session.status !== 'active' || new Date(session.expires_at) < new Date()) return json({ ok: false, reason: 'invalid_session' })

          // Restaurant / table context
          const { data: table } = await supabaseAdmin.from('restaurant_tables').select('label,branch_id').eq('id', session.table_id).maybeSingle()
          const { data: branch } = table ? await supabaseAdmin.from('branches').select('restaurant_id').eq('id', table.branch_id).maybeSingle() : { data: null }
          const { data: restaurant } = branch ? await supabaseAdmin.from('restaurants').select('name,city').eq('id', branch.restaurant_id).maybeSingle() : { data: null }

          // Receipt record (created by /api/public/receipt after capture)
          const { data: receipt } = await supabaseAdmin
            .from('receipts').select('receipt_number,total_paid_pesewas,issued_at').eq('session_id', session.id).maybeSingle()

          // Line items + totals
          const { data: bill } = session.active_bill_id
            ? await supabaseAdmin.from('bills').select('id,subtotal_pesewas,service_charge_pesewas,total_pesewas').eq('id', session.active_bill_id).maybeSingle()
            : { data: null }
          const { data: items } = bill
            ? await supabaseAdmin.from('bill_items').select('name,qty,line_total_pesewas,sort').eq('bill_id', bill.id).order('sort')
            : { data: [] }
          const { data: caps } = await supabaseAdmin
            .from('payment_attempts').select('total_pesewas,tip_pesewas,provider').eq('session_id', session.id).eq('status', 'captured')
          const paid = (caps ?? []).reduce((s: number, r: { total_pesewas: number | null }) => s + (r.total_pesewas ?? 0), 0)
          const tip = (caps ?? []).reduce((s: number, r: { tip_pesewas: number | null }) => s + (r.tip_pesewas ?? 0), 0)
          const method = (caps ?? [])[0]?.provider === 'card' ? 'CARD' : 'MOBILE MONEY'
          const totalPaid = receipt?.total_paid_pesewas ?? paid

          const issued = new Date(receipt?.issued_at ?? Date.now())
          const stamp = issued.toLocaleString('en-GB', { timeZone: 'Africa/Accra', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })

          const rows: string[] = []
          rows.push(center((restaurant?.name ?? 'Kozo').toUpperCase()))
          rows.push(center(restaurant?.city ?? 'Accra'))
          rows.push(center('CUSTOMER RECEIPT'))
          rows.push(rule('='))
          rows.push(line(`TABLE ${table?.label ?? '--'}`, stamp.split(',')[0] ?? ''))
          rows.push(line(`RCPT ${receipt?.receipt_number ?? '--'}`, (stamp.split(',')[1] ?? '').trim()))
          rows.push(rule())
          for (const it of items ?? []) {
            const q = it.qty ?? 1
            const amt = pes(it.line_total_pesewas ?? 0)
            rows.push(line(`${q} x ${it.name}`, amt))
          }
          rows.push(rule())
          if (bill) {
            rows.push(line('SUBTOTAL', pes(bill.subtotal_pesewas ?? 0)))
            rows.push(line('SERVICE CHARGE', pes(bill.service_charge_pesewas ?? 0)))
          }
          if (tip > 0) rows.push(line('TIP', pes(tip)))
          rows.push(rule('='))
          rows.push(line('TOTAL PAID GHS', pes(totalPaid)))
          rows.push(rule('='))
          rows.push(line('METHOD', method))
          rows.push(line('STATUS', 'PAID'))
          rows.push('')
          rows.push(center('THANK YOU'))
          rows.push(center('Powered by Klown Pay'))
          rows.push(center('*** END OF RECEIPT ***'))

          const receiptText = rows.join('\n')
          const message = '```\n' + receiptText + '\n```'

          // Deep link the client can fall back to (opens WhatsApp with the receipt prefilled).
          const waLink = `https://wa.me/${e164.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`

          // Direct send through Twilio WhatsApp when the connector is linked.
          const twilioKey = process.env['TWILIO_API_KEY']
          const lovableKey = process.env['LOVABLE_API_KEY']
          const from = process.env['TWILIO_WHATSAPP_FROM']
          if (twilioKey && lovableKey && from) {
            const res = await fetch('https://connector-gateway.lovable.dev/twilio/Messages.json', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${lovableKey}`,
                'X-Connection-Api-Key': twilioKey,
                'Content-Type': 'application/x-www-form-urlencoded',
              },
              body: new URLSearchParams({ To: `whatsapp:${e164}`, From: `whatsapp:${from}`, Body: message }),
            })
            const body = await res.text()
            if (!res.ok) {
              console.error(`Twilio WhatsApp send failed [${res.status}]: ${body}`)
              await supabaseAdmin.from('audit_events').insert({ session_id: session.id, type: 'receipt.whatsapp_failed', data: { status: res.status } })
              return json({ ok: true, sent: false, waLink, receiptText, error: `[${res.status}] ${body}` })
            }
            await supabaseAdmin.from('audit_events').insert({ session_id: session.id, type: 'receipt.whatsapp_sent', data: {} })
            return json({ ok: true, sent: true, waLink, receiptText })
          }

          await supabaseAdmin.from('audit_events').insert({ session_id: session.id, type: 'receipt.whatsapp_link', data: {} })
          return json({ ok: true, sent: false, waLink, receiptText })
        } catch (e) { return json({ ok: false, reason: 'error', message: String(e) }) }
      },
    },
  },
})
