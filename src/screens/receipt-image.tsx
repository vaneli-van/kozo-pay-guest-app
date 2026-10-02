import { useState, useEffect } from "react";

// Render an Odoo-POS-style receipt as a PNG blob, drawn on a canvas so it downloads
// as a picture. The restaurant logo loads cross-origin (the branding bucket allows it);
// if it can't, we simply omit it rather than taint the canvas.
export async function renderOdooReceiptPng(d: any): Promise<Blob> {
  const W = 560, PAD = 30, SCALE = 2;
  const ink = "#1b1b1b", muted = "#6b6b6b";
  const MONO = "'Courier New', ui-monospace, Menlo, monospace";
  const ghs = (p: number) =>
    ((p || 0) / 100).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  let logo: HTMLImageElement | null = null, logoW = 0, logoH = 0;
  if (d.restaurant?.logoUrl) {
    logo = await new Promise<HTMLImageElement | null>((res) => {
      const im = new Image();
      im.crossOrigin = "anonymous";
      im.onload = () => res(im);
      im.onerror = () => res(null);
      im.src = d.restaurant.logoUrl;
    });
    if (logo && logo.naturalWidth) {
      logoW = 150; logoH = Math.round(logo.naturalHeight * (logoW / logo.naturalWidth));
      if (logoH > 84) { logoH = 84; logoW = Math.round(logo.naturalWidth * (84 / logo.naturalHeight)); }
    } else logo = null;
  }

  const mc = document.createElement("canvas").getContext("2d")!;
  const setFont = (ctx: CanvasRenderingContext2D, size: number, bold = false) => {
    ctx.font = `${bold ? "bold " : ""}${size}px ${MONO}`;
  };
  const fit = (ctx: CanvasRenderingContext2D, text: string, max: number) => {
    if (ctx.measureText(text).width <= max) return text;
    let t = text;
    while (t.length > 1 && ctx.measureText(t + "…").width > max) t = t.slice(0, -1);
    return t + "…";
  };

  type Op = { kind: string; h: number; a?: any; b?: any; size?: number; bold?: boolean; color?: string };
  const ops: Op[] = [];
  const divider = () => ops.push({ kind: "div", h: 20 });
  const gap = (h: number) => ops.push({ kind: "gap", h });
  const center = (text: string, size: number, bold = false, color = ink) =>
    ops.push({ kind: "center", a: text, size, bold, color, h: size + 10 });
  const lr = (a: string, b: string, size = 15, bold = false, color = ink) =>
    ops.push({ kind: "lr", a, b, size, bold, color, h: size + 10 });

  if (logo) ops.push({ kind: "logo", h: logoH + 12 });
  center(String(d.restaurant?.name || "Restaurant"), 22, true);
  if (d.restaurant?.city) center(String(d.restaurant.city), 13, false, muted);
  gap(6); divider();
  const dt = new Date(d.issuedAt || Date.now());
  const dts = dt.toLocaleString("en-GB", {
    timeZone: "Africa/Accra", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
  lr(`Receipt ${d.receiptNumber || ""}`.trim(), "", 13, false, muted);
  lr(dts, "", 13, false, muted);
  lr(`Table ${d.tableLabel || "-"}${d.serverName ? "  Served by " + d.serverName : ""}`, "", 13, false, muted);
  divider();
  setFont(mc, 15);
  const priceCol = 92;
  for (const l of (d.lines || [])) {
    const left = `${l.qty || 1} x ${l.name}`;
    lr(fit(mc, left, W - PAD * 2 - priceCol), ghs(l.amount), 15);
  }
  divider();
  lr("Subtotal", ghs(d.subtotalPesewas), 15);
  if ((d.serviceChargePesewas || 0) > 0) lr("Service charge", ghs(d.serviceChargePesewas), 15);
  const t = d.tax || {}, r = t.rates || {};
  if (t.net != null) {
    gap(4);
    lr("Taxes & levies (incl.)", "", 12, false, muted);
    lr("  Net (excl. tax)", ghs(t.net), 12, false, muted);
    lr(`  NHIL ${r.nhil ?? 2.5}%`, ghs(t.nhil), 12, false, muted);
    lr(`  GETFund ${r.getfund ?? 2.5}%`, ghs(t.getfund), 12, false, muted);
    lr(`  VAT ${r.vat ?? 15}%`, ghs(t.vat), 12, false, muted);
    lr(`  Tourism ${r.tourism ?? 1}%`, ghs(t.tourism), 12, false, muted);
  }
  divider();
  lr("TOTAL PAID", `GH₵ ${ghs(d.totalPaidPesewas)}`, 18, true);
  if ((d.tipPesewas || 0) > 0) lr("Incl. tip", ghs(d.tipPesewas), 13, false, muted);
  if (d.method) lr(`Paid via ${String(d.method).toUpperCase()}`, "", 13, false, muted);
  divider();
  center("Powered by Klown", 12, false, muted);
  center("Thank you — see you soon!", 13, false, ink);

  const totalH = ops.reduce((s, o) => s + o.h, 0) + PAD * 2;

  const cv = document.createElement("canvas");
  cv.width = W * SCALE; cv.height = Math.ceil(totalH) * SCALE;
  const ctx = cv.getContext("2d")!;
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, W, totalH);
  ctx.textBaseline = "top";
  let y = PAD;
  for (const o of ops) {
    if (o.kind === "gap") { y += o.h; continue; }
    if (o.kind === "div") {
      ctx.strokeStyle = "#cfcfcf"; ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(PAD, y + 9.5); ctx.lineTo(W - PAD, y + 9.5); ctx.stroke();
      ctx.setLineDash([]); y += o.h; continue;
    }
    if (o.kind === "logo" && logo) { ctx.drawImage(logo, (W - logoW) / 2, y, logoW, logoH); y += o.h; continue; }
    setFont(ctx, o.size!, o.bold); ctx.fillStyle = o.color!;
    if (o.kind === "center") { ctx.textAlign = "center"; ctx.fillText(o.a, W / 2, y); }
    else {
      ctx.textAlign = "left"; ctx.fillText(o.a, PAD, y);
      if (o.b) { ctx.textAlign = "right"; ctx.fillText(o.b, W - PAD, y); }
    }
    ctx.textAlign = "left";
    y += o.h;
  }
  return await new Promise<Blob>((res, rej) =>
    cv.toBlob((b) => (b ? res(b) : rej(new Error("toBlob failed"))), "image/png"));
}

export function ReceiptImage({ s }: any) {
  const [url, setUrl] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState<string | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const d = await fetch("/api/public/receipt-data", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionToken: s?.sessionToken }),
        }).then((r) => r.json());
        if (!d?.ok) throw new Error(d?.reason || "nodata");
        const b = await renderOdooReceiptPng(d);
        if (!alive) return;
        setBlob(b); setUrl(URL.createObjectURL(b)); setBusy(false);
      } catch {
        if (alive) { setErr("Could not prepare the receipt. Please try again."); setBusy(false); }
      }
    })();
    return () => { alive = false; };
  }, [s?.sessionToken]);
  const download = () => {
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `receipt-${s?.receiptNumber || "klown"}.png`;
    document.body.appendChild(a); a.click(); a.remove();
  };
  return (
    <div className="kz-receipt-img">
      {busy && <p className="muted">Preparing your receipt…</p>}
      {url && <img src={url} alt="Receipt" className="kz-receipt-preview" />}
      {url && <button className="outline-button" onClick={download}>Download receipt (PNG)</button>}
      {err && <p className="muted receipt-error">{err}</p>}
    </div>
  );
}
