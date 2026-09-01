import { createFileRoute } from '@tanstack/react-router'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

function receiptNumber(): string {
  const a = new Uint8Array(4); crypto.getRandomValues(a)
  return 'KZ-' + [...a].map((b) => b.toString(36)).join('').slice(0, 6).toUpperCase()
}
const ghs = (pesewas: number) => (pesewas / 100).toFixed(2)

// Diner-facing: build (or reuse) the receipt PDF for this session and return a signed URL
// the client can open to view / save / print. Read-only w.r.t. the POS; no messaging.
export const Route = createFileRoute('/api/public/receipt-pdf')({
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
        if (!caps || caps.length === 0) return json({ ok: false, reason: 'no_payment' })
        const totalPaid = caps.reduce((s: number, r: { total_pesewas: number | null }) => s + (r.total_pesewas ?? 0), 0)

        const { data: table } = await supabaseAdmin.from('restaurant_tables').select('branch_id').eq('id', session.table_id).maybeSingle()
        const { data: branch } = table ? await supabaseAdmin.from('branches').select('restaurant_id').eq('id', table.branch_id).maybeSingle() : { data: null }
        const { data: restaurant } = branch ? await supabaseAdmin.from('restaurants').select('name,city').eq('id', branch.restaurant_id).maybeSingle() : { data: null }

        let { data: receipt } = await supabaseAdmin.from('receipts').select('receipt_number,total_paid_pesewas,issued_at').eq('session_id', session.id).maybeSingle()
        if (!receipt) {
          const { data: created } = await supabaseAdmin.from('receipts').insert({ session_id: session.id, bill_id: session.active_bill_id, receipt_number: receiptNumber(), total_paid_pesewas: totalPaid }).select('receipt_number,total_paid_pesewas,issued_at').single()
          receipt = created
          await supabaseAdmin.from('audit_events').insert({ session_id: session.id, type: 'receipt.issued', data: { total: totalPaid } })
        }
        if (!receipt) return json({ ok: false, reason: 'error', message: 'receipt_unavailable' })

        const { data: items } = session.active_bill_id
          ? await supabaseAdmin.from('bill_items').select('name,qty,line_total_pesewas,sort').eq('bill_id', session.active_bill_id).order('sort')
          : { data: [] }

        // --- PDF (A4, mirrors the WhatsApp receipt layout) ---
        const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
        const pdf = await PDFDocument.create()
        const page = pdf.addPage([595.28, 841.89])
        const font = await pdf.embedFont(StandardFonts.Helvetica)
        const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
        const black = rgb(0, 0, 0)
        const L = 56
        const R = 595.28 - 56
        let y = 780
        const draw = (t: string, size = 11, f = font) => { page.drawText(t, { x: L, y, size, font: f, color: black }) }
        const drawRight = (t: string, size = 11, f = font) => { page.drawText(t, { x: R - f.widthOfTextAtSize(t, size), y, size, font: f, color: black }) }

        draw((restaurant?.name ?? 'Kozo').toUpperCase(), 24, bold); y -= 18
        draw(restaurant?.city ?? 'Accra', 11); y -= 30
        draw('RECEIPT', 13, bold); y -= 18
        draw(`Receipt number: ${receipt.receipt_number}`, 11); y -= 15
        const issued = new Date(receipt.issued_at ?? Date.now())
        draw(`Date: ${issued.toLocaleString('en-GB', { timeZone: 'Africa/Accra', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}`, 11)
        y -= 26
        page.drawLine({ start: { x: L, y }, end: { x: R, y }, thickness: 1, color: black }); y -= 20

        for (const it of items ?? []) {
          const qty = it.qty ?? 1
          draw(`${it.name}   ${qty} ×`, 11)
          drawRight(`GHS ${ghs(it.line_total_pesewas ?? 0)}`, 11)
          y -= 16
          if (y < 90) break
        }

        y -= 8
        page.drawLine({ start: { x: L, y }, end: { x: R, y }, thickness: 1, color: black }); y -= 22
        draw('TOTAL PAID', 13, bold)
        drawRight(`GHS ${ghs(receipt.total_paid_pesewas ?? totalPaid)}`, 13, bold)
        y -= 30
        draw('Thank you for dining with us.', 11)

        const bytes = await pdf.save()
        const path = `${receipt.receipt_number}.pdf`
        const { error: upErr } = await supabaseAdmin.storage.from('receipts').upload(path, bytes, { contentType: 'application/pdf', upsert: true })
        if (upErr) return json({ ok: false, reason: 'error', message: upErr.message })
        const { data: signed } = await supabaseAdmin.storage.from('receipts').createSignedUrl(path, 60 * 60 * 24 * 7)
        if (!signed?.signedUrl) return json({ ok: false, reason: 'error', message: 'no_media_url' })

        return json({ ok: true, url: signed.signedUrl, receiptNumber: receipt.receipt_number })
      } catch (e) { return json({ ok: false, reason: 'error', message: String(e) }) }
    },
  } },
})
