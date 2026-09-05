import { createFileRoute } from '@tanstack/react-router'
import { taxBreakdown } from '@/integrations/billing/tax'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

function receiptNumber(): string {
  const a = new Uint8Array(4); crypto.getRandomValues(a)
  return 'KZ-' + [...a].map((b) => b.toString(36)).join('').slice(0, 6).toUpperCase()
}
const ghs = (pesewas: number) => (pesewas / 100).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// Diner-facing: build (or reuse) an 80mm thermal-style receipt PDF for this session
// and return a signed URL the client can open to view / save / print. It carries the
// restaurant logo and the statutory levy breakdown (NHIL, GETFund, VAT, Tourism).
// Read-only w.r.t. the POS; no messaging.
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

        const { data: caps } = await supabaseAdmin.from('payment_attempts').select('amount_pesewas,tip_pesewas,total_pesewas').eq('session_id', session.id).eq('status', 'captured')
        if (!caps || caps.length === 0) return json({ ok: false, reason: 'no_payment' })
        const totalPaid = caps.reduce((s: number, r: any) => s + (r.total_pesewas ?? 0), 0)
        const tipPaid = caps.reduce((s: number, r: any) => s + (r.tip_pesewas ?? 0), 0)

        const { data: table } = await supabaseAdmin.from('restaurant_tables').select('branch_id,label').eq('id', session.table_id).maybeSingle()
        const { data: branch } = table ? await supabaseAdmin.from('branches').select('restaurant_id').eq('id', table.branch_id).maybeSingle() : { data: null }
        const { data: restaurant } = branch ? await supabaseAdmin.from('restaurants').select('name,city,logo_url').eq('id', branch.restaurant_id).maybeSingle() : { data: null }

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
        const lines = (items ?? []).map((i: any) => ({ name: String(i.name ?? 'Item'), qty: i.qty ?? 1, amount: i.line_total_pesewas ?? 0 }))
        const itemsTotal = lines.reduce((s, l) => s + l.amount, 0)
        const tax = taxBreakdown(itemsTotal)

        // ---- 80mm thermal-style PDF ----
        const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
        const pdf = await PDFDocument.create()
        const mono = await pdf.embedFont(StandardFonts.Courier)
        const monoB = await pdf.embedFont(StandardFonts.CourierBold)
        const black = rgb(0.06, 0.06, 0.06)
        const grey = rgb(0.45, 0.45, 0.45)

        const W = 226.77 // 80mm
        const L = 14
        const R = W - 14
        const CW = R - L

        // Optional logo (best-effort fetch + embed).
        let logo: any = null, logoDims: { w: number; h: number } | null = null
        const logoUrl = (restaurant as any)?.logo_url as string | undefined
        if (logoUrl) {
          try {
            let buf: Uint8Array | null = null
            // Prefer the storage client (server-side, no reliance on outbound fetch).
            const m = logoUrl.match(/\/storage\/v1\/object\/(?:public\/)?([^/]+)\/(.+)$/)
            if (m) {
              const bucket = m[1]!, objectPath = (m[2]!.split('?')[0]) as string
              const dl = await supabaseAdmin.storage.from(bucket).download(objectPath)
              if (dl.data) buf = new Uint8Array(await dl.data.arrayBuffer())
            }
            if (!buf) { const resp = await fetch(logoUrl); if (resp.ok) buf = new Uint8Array(await resp.arrayBuffer()) }
            if (buf) {
              const isPng = logoUrl.toLowerCase().includes('.png') || (buf[0] === 0x89 && buf[1] === 0x50)
              try { logo = isPng ? await pdf.embedPng(buf) : await pdf.embedJpg(buf) }
              catch { try { logo = isPng ? await pdf.embedJpg(buf) : await pdf.embedPng(buf) } catch { logo = null } }
              if (logo) {
                const maxW = 120, maxH = 58
                const sc = Math.min(maxW / logo.width, maxH / logo.height, 1)
                logoDims = { w: logo.width * sc, h: logo.height * sc }
              }
            }
          } catch { logo = null }
        }

        const wrap = (text: string, font: any, size: number, maxW: number): string[] => {
          const words = String(text).split(/\s+/).filter(Boolean)
          const out: string[] = []; let cur = ''
          for (const w of words) {
            const t = cur ? cur + ' ' + w : w
            if (font.widthOfTextAtSize(t, size) <= maxW || !cur) cur = t
            else { out.push(cur); cur = w }
          }
          if (cur) out.push(cur)
          return out.length ? out : ['']
        }

        // Pre-compute item name wraps (leave room for the amount column).
        const IS = 9 // item font size
        const amtW = (a: number) => monoB.widthOfTextAtSize(`GHS ${ghs(a)}`, IS)
        const itemLineSets = lines.map((l) => {
          const label = `${l.qty} x ${l.name}`
          return { lines: wrap(label, mono, IS, CW - amtW(l.amount) - 8), amount: l.amount }
        })

        // ---- height pass ----
        let H = 16 // top pad
        if (logoDims) H += logoDims.h + 8
        H += 15 // name
        if (restaurant?.city) H += 12
        H += 14 // VAT INVOICE
        H += 12 // rule
        H += 12 * 3 // receipt no, date, table
        H += 12 // rule
        for (const s of itemLineSets) H += 12 * s.lines.length
        H += 12 // rule
        H += 12 // breakdown title
        H += 12 * 5 // 5 levy lines
        H += 12 // rule
        H += 12 // order total
        if (tipPaid > 0) H += 12 // tip
        H += 20 // TOTAL PAID
        H += 12 // rule
        H += 12 * 3 // footer
        H += 16 // bottom pad

        const page = pdf.addPage([W, H])
        let y = H - 16

        const center = (t: string, size: number, f = mono, color = black) => {
          const x = L + (CW - f.widthOfTextAtSize(t, size)) / 2
          page.drawText(t, { x, y, size, font: f, color }); }
        const left = (t: string, size: number, f = mono, color = black) => page.drawText(t, { x: L, y, size, font: f, color })
        const right = (t: string, size: number, f = mono, color = black) => page.drawText(t, { x: R - f.widthOfTextAtSize(t, size), y, size, font: f, color })
        const rule = (dashed = true) => { page.drawLine({ start: { x: L, y: y + 4 }, end: { x: R, y: y + 4 }, thickness: 0.7, color: grey, ...(dashed ? { dashArray: [2, 2] } : {}) }) }

        if (logo && logoDims) { page.drawImage(logo, { x: L + (CW - logoDims.w) / 2, y: y - logoDims.h + 6, width: logoDims.w, height: logoDims.h }); y -= logoDims.h + 8 }
        center((restaurant?.name ?? 'Kozo').toUpperCase(), 13, monoB); y -= 15
        if (restaurant?.city) { center(restaurant.city, 9, mono, grey); y -= 12 }
        center('VAT INVOICE', 9, monoB); y -= 12
        rule(); y -= 12

        left(`Receipt  ${receipt.receipt_number}`, 8, mono, grey)
        y -= 12
        const issued = new Date(receipt.issued_at ?? Date.now())
        left(`Date     ${issued.toLocaleString('en-GB', { timeZone: 'Africa/Accra', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}`, 8, mono, grey)
        y -= 12
        left(`Table    ${table?.label ?? '-'}`, 8, mono, grey)
        y -= 12
        rule(); y -= 12

        for (const set of itemLineSets) {
          for (let i = 0; i < set.lines.length; i++) {
            left(set.lines[i]!, IS, mono)
            if (i === 0) right(`GHS ${ghs(set.amount)}`, IS, monoB)
            y -= 12
          }
        }
        rule(); y -= 12

        left('TAX BREAKDOWN', 8, monoB, grey); y -= 12
        const taxRow = (label: string, amt: number) => { left(label, 8, mono, grey); right(`GHS ${ghs(amt)}`, 8, mono); y -= 12 }
        taxRow('Net (excl. tax)', tax.net)
        taxRow('NHIL 2.5%', tax.nhil)
        taxRow('GETFund 2.5%', tax.getfund)
        taxRow('VAT 15%', tax.vat)
        taxRow('Tourism Levy 1%', tax.tourism)
        rule(); y -= 12

        left('Order total (incl. tax)', 8, mono); right(`GHS ${ghs(itemsTotal)}`, 8, mono); y -= 12
        if (tipPaid > 0) { left('Tip', 8, mono); right(`GHS ${ghs(tipPaid)}`, 8, mono); y -= 12 }
        left('TOTAL PAID', 11, monoB); right(`GHS ${ghs(receipt.total_paid_pesewas ?? totalPaid)}`, 11, monoB); y -= 20
        rule(); y -= 12

        center('Thank you for dining with us.', 8, mono, grey); y -= 12
        center(`${(restaurant?.name ?? 'Kozo')} - ${restaurant?.city ?? 'Accra'}`, 7, mono, grey); y -= 12
        center('Powered by Klown', 7, mono, grey)

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
