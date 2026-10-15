// New diner screens (redesign "B", prototype: claude/diner-redesign.md in the Klown project).
// Switched on per restaurant (restaurants.diner_ui = 'v2'); everyone else keeps screens.tsx.
//
// These are a new presentation over the SAME state machine and server calls as the classic
// screens: every money step dispatches the actions App.tsx already handles (pay-full, patch-go to
// 'authorise' / 'processing', split-create, feedback, whatsapp-receipt, give-up, reset...).
// Amounts come from the server quote; payment-init still refuses any total other than the one the
// diner saw (reviewedTotalPesewas). Every table-mode screen has a new version; QSR order mode
// (counter ordering) still uses the classic screens.
import { useEffect, useRef, useState } from "react";
import { go } from "../session/machine";
import { money } from "../lib/format";
import { tipPesewasFor, isCustomTip, parseCediInput } from "../lib/tip";
import { normalizeGhanaMobile } from "../lib/phone";
import { REASON_COPY } from "../lib/reasons";
import { billTax } from "../integrations/billing/tax";
import { openState, hoursLine } from "../lib/hours";
import { useReceiptPng } from "./receipt-image";
import "../styles/kozo-v2.css";

const pes = (v?: number | null) => money((v ?? 0) / 100);

// The screens this file draws. Anything else falls back to the classic screen.
export const V2_SCREENS = new Set([
  "welcome", "bill", "bill-ready", "empty", "waiting-bill", "pay", "choose-tab",
  "split", "split-items", "split-lobby", "tip", "review", "method", "momo", "otp",
  "authorise", "processing", "payment-error", "success",
  "receipt-choice", "guest-receipt", "feedback", "review-handoff", "complete",
  "menu", "category", "dish", "waiter", "waiter-notified",
]);

const PAY_SHEET = new Set(["tip", "review", "method", "momo"]);
const TIPS = [5, 10, 15];
const REMEMBER_KEY = "klown-momo-number";
// The number typed in this tab, so a retry does not ask for it again. Memory only, never stored.
let lastNumber = "";

const NETWORKS: Record<string, string> = {
  "024": "MTN", "025": "MTN", "053": "MTN", "054": "MTN", "055": "MTN", "059": "MTN",
  "020": "Telecel", "050": "Telecel",
  "026": "AirtelTigo", "027": "AirtelTigo", "056": "AirtelTigo", "057": "AirtelTigo",
};
const networkOf = (normalized: string | null) => (normalized ? NETWORKS[normalized.slice(0, 3)] : undefined);

function onPreviewHost(): boolean {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname.toLowerCase();
  return h.startsWith("id-preview--") || h.startsWith("preview--") || h.endsWith(".lovableproject.com") || h === "localhost" || h === "127.0.0.1";
}

function useFont() {
  useEffect(() => {
    if (typeof document === "undefined" || document.getElementById("v2-font")) return;
    const l = document.createElement("link");
    l.id = "v2-font";
    l.rel = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700&display=swap";
    document.head.appendChild(l);
  }, []);
}

// "VAT, NHIL and GETFund" from the bill's own tax lines (falls back to the statutory estimate).
function taxLine(b: any): string | null {
  const est = billTax(b?.subtotalPesewas ?? b?.totalPesewas ?? 0, null);
  const tax = b?.tax && Array.isArray(b.tax.lines) ? b.tax : est;
  const lines = (tax?.lines ?? []).filter((l: any) => (l?.amountPesewas ?? 0) > 0);
  if (!lines.length) return null;
  const names = lines.map((l: any) => String(l.name).replace(/\s*\d+(\.\d+)?%$/, "").trim());
  const total = lines.reduce((a: number, l: any) => a + (l.amountPesewas || 0), 0);
  const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0];
  return `Includes ${list} of ${tax.estimated ? "about " : ""}${pes(total)}`;
}

const Emoji = ({ name, size, className = "" }: { name: string; size: number; className?: string }) => (
  <img src={`/emoji/${name}.png`} alt="" width={size} height={size} className={`v2-emoji ${className}`} />
);

function Spinner({ size = 18 }: { size?: number }) {
  return (
    <svg className="v2-spin" width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function Check({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12l5 5L19 7" />
    </svg>
  );
}

function PoweredBy() {
  return (
    <p className="v2-powered">
      Powered by <img src="/klown-logo.png" alt="Klown" />
    </p>
  );
}

function Header({ s, sub, onHome }: { s: any; sub?: string | null; onHome?: (() => void) | undefined }) {
  const name = s?.restaurantName || "Your table";
  const brand = s?.logoUrl ? <img className="v2-brand-logo" src={s.logoUrl} alt={name} /> : <span className="v2-brand-name">{name}</span>;
  return (
    <header className="v2-header">
      <div className="v2-header-row">
        <h1 className="v2-brand">
          {onHome ? <button type="button" className="v2-home" aria-label={`${name}, home`} onClick={onHome}>{brand}</button> : brand}
        </h1>
        {s?.tableLabel ? <span className="v2-table">Table {s.tableLabel}</span> : null}
      </div>
      {sub ? <p className="v2-header-sub">{sub}</p> : null}
    </header>
  );
}

const serverOf = (s: any) => (s?.bill?.serverName || "").toString().trim();

// ───────────────────────────── Bill ─────────────────────────────
function BillView({ s, dispatch, underlay = false }: any) {
  const b = s?.bill;
  const items = b?.items ?? [];
  const paid = b?.paidPesewas ?? 0;
  const total = b?.totalPesewas ?? 0;
  const remaining = b?.remainingPesewas ?? total;
  const partial = paid > 0 && remaining > 0;
  const server = serverOf(s);
  const tax = taxLine(b);
  const restaurant = s?.restaurantName || "the restaurant";
  return (
    <div className="v2-screen" aria-hidden={underlay || undefined} inert={underlay || undefined}>
      <Header s={s} sub={server ? `${server} is looking after you` : null} onHome={underlay ? undefined : () => dispatch(go("welcome"))} />
      <div className="v2-scroll">
      <main className="v2-body">
        <section className="v2-due">
          <p className="v2-muted">{partial ? "Left to pay" : remaining <= 0 && paid > 0 ? "Paid" : "Your bill"}</p>
          <p className="v2-amount-xl" data-testid="v2-due">{pes(remaining > 0 ? remaining : total)}</p>
          {partial ? (
            <div className="v2-progress-wrap">
              <div className="v2-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((paid / Math.max(1, total)) * 100)} aria-label="Share of the bill already paid">
                <div style={{ width: `${Math.min(100, Math.round((paid / Math.max(1, total)) * 100))}%` }} />
              </div>
              <p className="v2-small">{pes(paid)} of {pes(total)} already paid at your table</p>
            </div>
          ) : null}
          {tax ? <p className="v2-small">{tax}</p> : null}
        </section>

        {remaining <= 0 ? (
          <p className="v2-note-card" role="status">
            {paid > 0 ? "This bill is fully paid. Thank you!" : "There is nothing to pay on this bill yet."}
          </p>
        ) : null}

        <div className="v2-card v2-items">
          {items.length === 0 ? (
            <p className="v2-muted">No items on this bill yet.</p>
          ) : (
            <ul>
              {items.map((i: any, n: number) => (
                <li key={`${i.name}-${n}`}>
                  <span className="v2-qty">{i.qty}×</span>
                  <span className="v2-item-name">{i.name}</span>
                  <span>{pes(i.lineTotalPesewas)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className="v2-small v2-pad">
          From {restaurant}&apos;s till, updated just now. Something not right? Ask {server || "your waiter"} before you pay.
        </p>
        <div className="v2-links">
          {(s?.tabCount ?? 1) > 1 ? (
            <button type="button" className="v2-link" onClick={() => dispatch(go("choose-tab"))}>Not your bill? Switch</button>
          ) : null}
          <button type="button" className="v2-link" onClick={() => dispatch(go("menu"))}>See the menu</button>
        </div>
      </main>
      </div>
      <footer className="v2-actions">
        {remaining > 0 ? (
          <>
            <button type="button" className="v2-btn v2-btn-primary" onClick={() => dispatch({ type: "pay-full", to: "review" })}>
              {partial ? "Pay the rest" : "Pay"} {pes(remaining)}
            </button>
            <button type="button" className="v2-btn v2-btn-secondary" onClick={() => dispatch(go("split"))}>
              Split the bill
            </button>
          </>
        ) : null}
        <PoweredBy />
      </footer>
    </div>
  );
}

function NoBill({ s, dispatch }: any) {
  const restaurant = s?.restaurantName || "the restaurant";
  return (
    <div className="v2-screen">
      <Header s={s} onHome={() => dispatch(go("welcome"))} />
      <div className="v2-scroll">
      <main className="v2-body v2-center">
        <Emoji name="receipt" size={84} />
        <h2 className="v2-title">No bill at this table yet</h2>
        <p className="v2-lead">
          Your order appears here as soon as it is entered on {restaurant}&apos;s till. This page checks by itself, so you can leave it open.
        </p>
        <p className="v2-small v2-row-center" role="status">
          <Spinner size={16} /> Checked just now
        </p>
        {s?.testMode ? (
          <>
            <button type="button" className="v2-btn v2-btn-secondary" disabled={!!s?.testBillBusy} onClick={() => dispatch({ type: "test-bill" })}>
              {s?.testBillBusy ? "Creating a test bill…" : "Create a test bill"}
            </button>
            {s?.testBillError ? <p className="v2-error-text">{s.testBillError}</p> : null}
          </>
        ) : null}
      </main>
      </div>
      <footer className="v2-actions">
        <button type="button" className="v2-btn v2-btn-primary" onClick={() => dispatch(go("menu"))}>
          <Emoji name="fork_and_knife_with_plate" size={26} /> See the menu
        </button>
        <p className="v2-small v2-centered">Already ordered a while ago? Ask your waiter to check it was sent to the till.</p>
        <PoweredBy />
      </footer>
    </div>
  );
}

function BillOrState({ s, dispatch }: any) {
  const b = s?.bill;
  if (b) return <BillView s={s} dispatch={dispatch} />;
  if (s?.noBill || s?.screen === "empty" || s?.screen === "waiting-bill") return <NoBill s={s} dispatch={dispatch} />;
  return (
    <div className="v2-screen">
      <Header s={s} onHome={() => dispatch(go("welcome"))} />
      <div className="v2-scroll">
      <main className="v2-body v2-center">
        {s?.billError ? (
          <div role="alert" className="v2-center">
            <h2 className="v2-title">We couldn&apos;t load your bill</h2>
            <p className="v2-lead">Check your signal, then try again.</p>
            <button type="button" className="v2-btn v2-btn-secondary" onClick={() => dispatch({ type: "retry" })}>Try again</button>
          </div>
        ) : (
          <p className="v2-lead v2-row-center" role="status" aria-live="polite"><Spinner /> Loading your bill…</p>
        )}
      </main>
      </div>
      <footer className="v2-actions"><PoweredBy /></footer>
    </div>
  );
}

// ───────────────────────────── Sheets ─────────────────────────────
function Sheet({ s, dispatch, title, onClose, children, footer, under }: any) {
  return (
    <div className="v2-overlay">
      <div className="v2-underlay">{under ?? <BillView s={s} dispatch={dispatch} underlay />}</div>
      <button type="button" className="v2-scrim" aria-label="Close" onClick={onClose} />
      <section className="v2-sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="v2-grabber" aria-hidden="true" />
        <div className="v2-sheet-head">
          <h2>{title}</h2>
          <button type="button" className="v2-icon-btn" aria-label="Close" onClick={onClose}><CloseIcon /></button>
        </div>
        <div className="v2-sheet-body">{children}</div>
        {footer ? <div className="v2-sheet-foot">{footer}</div> : null}
      </section>
    </div>
  );
}

function PaySheet({ s, dispatch }: any) {
  const q = s?.quote;
  const err = s?.quoteError;
  const share = q?.sharePesewas ?? 0;
  const server = serverOf(s);
  const isShare = !!s?.claimedShareId || (s?.shareMode && s.shareMode !== "full");
  // No tip is preselected: the diner picks one (None included) before paying. Coming back to the
  // sheet in the same checkout (a retry, "use another number") keeps what they picked.
  const reviewed = typeof s?.reviewedTotalPesewas === "number";
  const [choice, setChoice] = useState<string | null>(() => {
    if (!reviewed) return null;
    if (isCustomTip(s)) return "other";
    if (s?.tipPercent === 0) return "none";
    return TIPS.includes(s?.tipPercent) ? String(s.tipPercent) : null;
  });
  const [customText, setCustomText] = useState(() => (reviewed && isCustomTip(s) ? ((s.tipCustomPesewas as number) / 100).toFixed(2) : ""));
  const [method, setMethod] = useState<"momo" | "card" | "applepay">(s?.method === "card" || s?.method === "applepay" ? s.method : "momo");
  const [applePay, setApplePay] = useState(false);
  const [number, setNumber] = useState("");
  const [remember, setRemember] = useState(false);
  const [touched, setTouched] = useState(false);
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    try {
      const A = (window as any).ApplePaySession;
      setApplePay(!!A && A.canMakePayments());
    } catch { setApplePay(false); }
    try {
      const saved = localStorage.getItem(REMEMBER_KEY);
      if (saved) { setNumber(saved); setRemember(true); }
      else if (lastNumber) setNumber(lastNumber);
    } catch {}
  }, []);
  useEffect(() => {
    if (q) return;
    setSlow(false);
    const t = setTimeout(() => setSlow(true), 10000);
    return () => clearTimeout(t);
  }, [!!q]);

  const pick = (key: string) => {
    setChoice(key);
    if (key === "none") dispatch({ type: "patch", value: { tipPercent: 0, tipCustomPesewas: undefined } });
    else if (key === "other") {
      const p = parseCediInput(customText);
      dispatch({ type: "patch", value: { tipCustomPesewas: p ?? 0 } });
    } else dispatch({ type: "patch", value: { tipPercent: Number(key), tipCustomPesewas: undefined } });
  };
  const onCustom = (v: string) => {
    setCustomText(v);
    const p = parseCediInput(v);
    dispatch({ type: "patch", value: { tipCustomPesewas: p ?? 0 } });
  };
  const chosen = choice !== null && (choice !== "other" || (parseCediInput(customText) ?? -1) >= 0);
  const tip = chosen ? tipPesewasFor(s, share) : 0;
  const grand = share + tip;
  const normalized = normalizeGhanaMobile(number);
  const network = networkOf(normalized);
  const badNumber = method === "momo" && !normalized;
  const shareGone = err === "invalid_share" || err === "share_paid";
  const canPay = !!q && !err && chosen && !badNumber;
  const backTo = s?.claimedShareId && s?.split ? (s.split.mode === "items" ? "split-items" : "split-lobby") : "bill";
  const close = () => dispatch(shareGone ? { type: "pay-full", to: "bill" } : go(backTo));
  const pay = () => {
    if (!canPay) { setTouched(true); return; }
    if (method === "momo" && normalized) lastNumber = normalized;
    try {
      if (method === "momo" && remember && normalized) localStorage.setItem(REMEMBER_KEY, normalized);
      else if (method === "momo" && !remember) localStorage.removeItem(REMEMBER_KEY);
    } catch {}
    dispatch({
      type: "patch-go",
      value: {
        method,
        reviewedTotalPesewas: grand,
        amountChanged: false,
        ...(method === "momo" ? { momoNumber: normalized, momoHint: { network, last4: normalized?.slice(-4) } } : {}),
      },
      to: method === "momo" ? "authorise" : "processing",
    });
  };
  const chips = [
    { key: "none", label: "None", amt: "GH₵0" },
    ...TIPS.map((p) => ({ key: String(p), label: `${p}%`, amt: pes(Math.round((share * p) / 100)) })),
    { key: "other", label: "Other", amt: "Custom" },
  ];
  const methods = [
    { key: "momo" as const, label: "MoMo", sub: "All networks" },
    { key: "card" as const, label: "Card", sub: "Visa, Mastercard" },
    ...(applePay ? [{ key: "applepay" as const, label: "Apple Pay", sub: "On this iPhone" }] : []),
  ];
  const payLabel = !chosen ? "Choose a tip to continue" : method === "applepay" ? `Pay ${pes(grand)} with Apple Pay` : `Pay ${pes(grand)}`;
  const hint = method === "momo" ? "You approve it on your phone with your MoMo PIN" : method === "applepay" ? "Confirm with Face ID or your passcode" : "Next, a secure page for your card details";
  return (
    <Sheet
      s={s}
      dispatch={dispatch}
      title={isShare ? "Pay your share" : "Pay the bill"}
      onClose={close}
      footer={!err && q ? (
        <>
          <button type="button" className="v2-btn v2-btn-primary" disabled={!canPay} onClick={pay}>{payLabel}</button>
          <p className="v2-small v2-centered">{hint}</p>
        </>
      ) : null}
    >
      {s?.amountChanged && q && !err ? <p className="v2-notice" role="alert">{REASON_COPY["amount_changed"]}</p> : null}
      {err ? (
        <div role="alert" className="v2-stack">
          <h3 className="v2-subtitle">We can&apos;t take this payment</h3>
          <p className="v2-lead">{REASON_COPY[err] ?? "Something went wrong working out your total. Please try again."}</p>
          <button type="button" className="v2-btn v2-btn-secondary" onClick={close}>Back to the bill</button>
        </div>
      ) : !q ? (
        <div className="v2-stack" role="status" aria-live="polite">
          <p className="v2-lead v2-row-center"><Spinner /> Checking your total…</p>
          {slow ? (
            <>
              <p className="v2-small">This is taking longer than usual. Check your signal.</p>
              <button type="button" className="v2-btn v2-btn-secondary" onClick={() => dispatch({ type: "retry" })}>Try again</button>
            </>
          ) : null}
        </div>
      ) : (
        <>
          <fieldset className="v2-field">
            <legend className="v2-legend">
              <span className="v2-row"><Emoji name="smiling_face_with_hearts" size={24} /> Tip for {server || "the team"}</span>
              <span className="v2-small">All of it goes to the team</span>
            </legend>
            <div className="v2-chips" role="radiogroup" aria-label="Tip">
              {chips.map((c) => (
                <button key={c.key} type="button" role="radio" aria-checked={choice === c.key} className={`v2-chip${choice === c.key ? " is-on" : ""}`} onClick={() => pick(c.key)}>
                  <b>{c.label}</b>
                  <small>{c.amt}</small>
                </button>
              ))}
            </div>
            {choice === "other" ? (
              <label className="v2-label">
                Tip amount in GH₵
                <input className="v2-input" inputMode="decimal" placeholder="0.00" value={customText} onChange={(e) => onCustom(e.target.value)} autoFocus />
              </label>
            ) : null}
            {touched && !chosen ? <p className="v2-error-text">Choose a tip, or None, to continue.</p> : null}
          </fieldset>

          <fieldset className="v2-field">
            <legend className="v2-legend"><span>Pay with</span></legend>
            <div className={`v2-chips v2-chips-${methods.length}`} role="radiogroup" aria-label="Payment method">
              {methods.map((m) => (
                <button key={m.key} type="button" role="radio" aria-checked={method === m.key} className={`v2-chip v2-chip-left${method === m.key ? " is-on" : ""}`} onClick={() => setMethod(m.key)}>
                  <b>{m.label}</b>
                  <small>{m.sub}</small>
                </button>
              ))}
            </div>
            {method === "momo" ? (
              <>
                <label className="v2-label">
                  MoMo number
                  <input
                    className="v2-input"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="024 000 0000"
                    value={number}
                    onChange={(e) => setNumber(e.target.value)}
                    onBlur={() => setTouched(true)}
                    aria-invalid={(touched && number.trim().length > 0 && !normalized) || undefined}
                  />
                </label>
                <p className={`v2-small v2-row${normalized ? " is-good" : touched && number.trim() ? " is-bad" : ""}`}>
                  {normalized ? <><Check /> {network ? `${network} number` : "Mobile number"}</> : "10 digits, starting with 0"}
                </p>
                <button type="button" className="v2-checkbox" aria-pressed={remember} onClick={() => setRemember(!remember)}>
                  <span className={`v2-box${remember ? " is-on" : ""}`}><Check size={12} /></span>
                  Remember this number on this phone
                </button>
              </>
            ) : null}
          </fieldset>

          <div className="v2-summary">
            <div><span>{isShare ? "Your share" : "Bill"}</span><span>{pes(share)}</span></div>
            <div><span>Tip</span><span>{chosen ? pes(tip) : "Not chosen"}</span></div>
            <div className="is-total"><span>You pay</span><span>{chosen ? pes(grand) : pes(share)}</span></div>
          </div>
        </>
      )}
    </Sheet>
  );
}

function SplitSheet({ s, dispatch }: any) {
  const due = s?.bill?.remainingPesewas ?? s?.bill?.totalPesewas ?? 0;
  const [mode, setMode] = useState<"even" | "amount" | null>(null);
  const [people, setPeople] = useState(Math.max(2, s?.people ?? 2));
  const [custom, setCustom] = useState("");
  const customP = parseCediInput(custom) ?? 0;
  const validCustom = customP > 0 && customP < due;
  const each = Math.ceil(due / people);
  return (
    <Sheet s={s} dispatch={dispatch} title="Split the bill" onClose={() => dispatch(go("bill"))}>
      {s?.splitError ? <p className="v2-notice" role="alert">{s.splitError}</p> : null}
      <div className="v2-options">
        <button type="button" className="v2-option" onClick={() => dispatch({ type: "split-create", mode: "items" })}>
          <b>Pay for what you had</b>
          <small>Pick your items from the bill</small>
        </button>
        <button type="button" className={`v2-option${mode === "even" ? " is-on" : ""}`} aria-expanded={mode === "even"} onClick={() => setMode(mode === "even" ? null : "even")}>
          <b>Split equally</b>
          <small>Everyone pays the same</small>
        </button>
        {mode === "even" ? (
          <div className="v2-option-body">
            <div className="v2-row v2-between">
              <span>People paying</span>
              <div className="v2-row">
                <button type="button" className="v2-round" aria-label="One fewer person" disabled={people <= 2} onClick={() => setPeople(Math.max(2, people - 1))}>−</button>
                <b className="v2-count">{people}</b>
                <button type="button" className="v2-round" aria-label="One more person" onClick={() => setPeople(Math.min(20, people + 1))}>+</button>
              </div>
            </div>
            <p className="v2-muted">Each person pays about</p>
            <p className="v2-amount-l">{pes(each)}</p>
            <p className="v2-small">Everyone at the table scans the same code and pays their part. Excludes tip.</p>
            <button type="button" className="v2-btn v2-btn-primary" disabled={due <= 0} onClick={() => due > 0 && dispatch({ type: "split-create", mode: "even", people })}>
              Split {people} ways
            </button>
          </div>
        ) : null}
        <button type="button" className={`v2-option${mode === "amount" ? " is-on" : ""}`} aria-expanded={mode === "amount"} onClick={() => setMode(mode === "amount" ? null : "amount")}>
          <b>Pay a set amount</b>
          <small>You choose how much, the rest stays open</small>
        </button>
        {mode === "amount" ? (
          <div className="v2-option-body">
            <label className="v2-label">
              Your amount in GH₵
              <input className="v2-input" inputMode="decimal" placeholder="0.00" value={custom} onChange={(e) => setCustom(e.target.value)} autoFocus />
            </label>
            <p className="v2-small">Left for the table: {pes(Math.max(0, due - customP))}</p>
            <button
              type="button"
              className="v2-btn v2-btn-primary"
              disabled={!validCustom}
              onClick={() => validCustom && dispatch({ type: "split-create", mode: "amounts", amounts: [{ label: "Your share", amount: customP }, { label: "Remaining", amount: due - customP }] })}
            >
              Continue
            </button>
          </div>
        ) : null}
      </div>
    </Sheet>
  );
}

// ───────────────────────────── Paying ─────────────────────────────
function Approve({ s, dispatch }: any) {
  const amount = s?.reviewedTotalPesewas ?? s?.quote?.grandTotalPesewas;
  const hint = s?.momoHint;
  return (
    <div className="v2-screen">
      <Header s={s} />
      <div className="v2-scroll">
      <main className="v2-body v2-center">
        <div className="v2-buzz" aria-hidden="true">
          <span className="v2-buzz-ring" />
          <span className="v2-buzz-ring v2-buzz-ring-2" />
          <Emoji name="vibration_mode" size={84} className="v2-buzz-icon" />
        </div>
        <h2 className="v2-title">Check your phone</h2>
        <p className="v2-lead">
          Approve {pes(amount)} to {s?.restaurantName || "the restaurant"} with your MoMo PIN.
          {hint?.last4 ? ` We sent the prompt to the number ending ${hint.last4}.` : ""}
        </p>
        <p className="v2-small v2-row-center" role="status" aria-live="polite"><Spinner size={16} /> Waiting for your approval</p>
        {hint?.network === "MTN" ? (
          <p className="v2-note-card">No prompt yet? Dial *170# and look under My Approvals.</p>
        ) : null}
      </main>
      </div>
      <footer className="v2-actions">
        <button type="button" className="v2-btn v2-btn-primary" onClick={() => dispatch(go("processing"))}>I&apos;ve approved it</button>
        <button type="button" className="v2-btn v2-btn-text" onClick={() => dispatch(go("review"))}>Use another number or card</button>
        <PoweredBy />
      </footer>
    </div>
  );
}

function Processing({ s, dispatch }: any) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 20000);
    return () => clearTimeout(t);
  }, []);
  const card = s?.method === "card" || s?.method === "applepay";
  return (
    <div className="v2-screen">
      <Header s={s} />
      <div className="v2-scroll">
      <main className="v2-body v2-center" role="status" aria-live="polite">
        <Spinner size={40} />
        <h2 className="v2-title">Confirming your payment</h2>
        <p className="v2-lead">{card ? "Checking with your bank. This takes a few seconds." : "Checking with mobile money. This takes a few seconds."}</p>
        {slow ? (
          <>
            <p className="v2-small">Still waiting. If you didn&apos;t approve a prompt, or changed your mind:</p>
            <button type="button" className="v2-btn v2-btn-secondary" onClick={() => dispatch({ type: "give-up", reason: "The payment was not approved in time." })}>
              It didn&apos;t go through
            </button>
          </>
        ) : null}
      </main>
      </div>
      <footer className="v2-actions"><PoweredBy /></footer>
    </div>
  );
}

function PaymentError({ s, dispatch }: any) {
  const card = s?.method === "card" || s?.method === "applepay";
  const kind = s?.failureKind;
  const reason = (s?.failureReason || "").toString().trim();
  const body =
    kind === "blocked" ? null
      : kind === "timeout" ? "We didn’t get a confirmation from your bank or mobile money provider in time."
        : card ? "Your card wasn’t charged. It may have been declined, or the payment page closed before it finished."
          : "No money left your account. Check your mobile money balance and that you approved the prompt, then try again.";
  const again = () => dispatch({ type: "patch-go", value: { paymentRef: undefined, failureReason: undefined }, to: card ? "processing" : "review" });
  const other = () => dispatch({ type: "patch-go", value: { paymentRef: undefined, failureReason: undefined }, to: "review" });
  return (
    <div className="v2-screen">
      <Header s={s} />
      <div className="v2-scroll">
      <main className="v2-body v2-center">
        <h2 className="v2-title">{kind === "blocked" ? "Payment not started" : "Payment didn’t go through"}</h2>
        {body ? <p className="v2-lead">{body}</p> : null}
        {reason ? <p className="v2-note-card" role="alert">{reason}</p> : null}
        {s?.lateRef ? (
          <p className="v2-notice" role="status">
            If a payment prompt is still on your phone, don&apos;t approve it. We&apos;re checking for a few more minutes in case it already went through, and this screen will move on by itself if it did.
          </p>
        ) : null}
      </main>
      </div>
      <footer className="v2-actions">
        <button type="button" className="v2-btn v2-btn-primary" onClick={again}>Try again</button>
        <button type="button" className="v2-btn v2-btn-secondary" onClick={other}>Use another number or card</button>
        <PoweredBy />
      </footer>
    </div>
  );
}

function Paid({ s, dispatch }: any) {
  const share = s?.lastPaid?.amountPesewas ?? s?.quote?.sharePesewas ?? 0;
  const tip = s?.lastPaid?.tipPesewas ?? tipPesewasFor(s, share);
  const paid = s?.lastPaid?.totalPesewas ?? share + tip;
  const isShare = !!s?.claimedShareId;
  const name = s?.restaurantName || "the restaurant";
  const rating: number = s?.rating ?? 0;
  const [note, setNote] = useState("");
  const [noteState, setNoteState] = useState<"idle" | "busy" | "sent" | "failed">("idle");
  const [waOpen, setWaOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const reviewUrl = s?.reviewUrl || `https://www.google.com/search?q=${encodeURIComponent(`${s?.restaurantName || ""} reviews`)}`;
  const labels = ["Tap a star", "Not great", "Could be better", "Good", "Really good", "Loved it"];
  const method = s?.method === "card" ? "Card" : s?.method === "applepay" ? "Apple Pay" : s?.momoHint?.last4 ? `${s?.momoHint?.network ?? "MoMo"} ••${s.momoHint.last4}` : "Mobile money";
  const tipLabelText = isCustomTip(s) ? "Tip" : `Tip${s?.tipPercent ? ` · ${s.tipPercent}%` : ""}`;
  return (
    <div className="v2-screen">
      <Header s={s} />
      <div className="v2-scroll">
      <main className="v2-body">
        <section className="v2-paid-top" aria-live="polite">
          <Emoji name="party_popper" size={76} />
          <p className="v2-good v2-row"><Check /> Paid</p>
          <p className="v2-amount-xl" data-testid="v2-paid">{pes(paid)}</p>
          {s?.receiptNumber ? <p className="v2-small">Receipt {s.receiptNumber}</p> : null}
          <p className={`v2-row v2-status${isShare ? "" : " is-good"}`}>
            {isShare ? "Your share is paid" : <><Emoji name="check_mark_button" size={22} /> {s?.tableLabel ? `Table ${s.tableLabel} is fully paid` : "The bill is fully paid"}</>}
          </p>
        </section>
        <div className="v2-card v2-summary v2-summary-card">
          <div><span>{isShare ? "Your share" : "Bill"}</span><span>{pes(share)}</span></div>
          <div><span>{tipLabelText}</span><span>{pes(tip)}</span></div>
          <div><span>Paid with</span><span>{method}</span></div>
        </div>
        <section className="v2-card v2-rate">
          <h3 className="v2-subtitle">How was your meal?</h3>
          <div className="v2-stars" role="radiogroup" aria-label={`Rate ${name}`}>
            {[1, 2, 3, 4, 5].map((i) => (
              <button key={i} type="button" role="radio" aria-checked={rating === i} aria-label={`${i} star${i > 1 ? "s" : ""}`} className={i <= rating ? "is-on" : undefined} onClick={() => dispatch({ type: "feedback", value: { rating: i } })}>
                <svg width="30" height="30" viewBox="0 0 24 24" fill={i <= rating ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 3.2l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 17l-5.4 2.9 1.1-6.1L3.2 9.6l6.1-.8z" />
                </svg>
              </button>
            ))}
          </div>
          <p className="v2-small">{labels[rating]}</p>
          {rating >= 4 ? (
            <a className="v2-btn v2-btn-secondary" href={reviewUrl} target="_blank" rel="noopener noreferrer">Say it on Google too</a>
          ) : null}
          {rating > 0 && rating < 4 ? (
            noteState === "sent" ? (
              <p className="v2-small">Thank you. We&apos;ve passed this privately to the {name} team.</p>
            ) : (
              <div className="v2-stack">
                <textarea className="v2-input v2-textarea" rows={3} maxLength={1000} placeholder="What could have been better? (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
                <button
                  type="button"
                  className="v2-btn v2-btn-secondary"
                  disabled={noteState === "busy"}
                  onClick={() => {
                    setNoteState("busy");
                    dispatch({ type: "feedback", value: { rating, comment: note }, onDone: (ok: boolean) => setNoteState(ok ? "sent" : "failed") });
                  }}
                >
                  {noteState === "busy" ? "Sending…" : "Send to the team"}
                </button>
                {noteState === "failed" ? <p className="v2-error-text" role="alert">That didn&apos;t send. Check your signal and try again.</p> : null}
              </div>
            )
          ) : null}
        </section>
        {waOpen ? (
          <section className="v2-card v2-stack">
            <label className="v2-label">
              WhatsApp number
              <input className="v2-input" type="tel" inputMode="tel" placeholder="024 000 0000" value={phone} onChange={(e) => setPhone(e.target.value)} autoFocus />
            </label>
            <button
              type="button"
              className="v2-btn v2-btn-primary"
              disabled={s?.waStatus === "sending"}
              onClick={() => dispatch({ type: "whatsapp-receipt", value: { phone: normalizeGhanaMobile(phone) ?? phone } })}
            >
              {s?.waStatus === "sending" ? "Sending…" : s?.waStatus === "sent" ? "Sent. Send again?" : "Send receipt"}
            </button>
            {s?.waStatus === "error" && s?.waError ? <p className="v2-error-text" role="alert">{s.waError}</p> : null}
            {s?.waStatus === "sent" ? <p className="v2-small v2-good">Your receipt is on its way to WhatsApp.</p> : null}
          </section>
        ) : null}
        <button type="button" className="v2-link v2-centered" onClick={() => dispatch(go("receipt-choice"))}>View or download the receipt</button>
      </main>
      </div>
      <footer className="v2-actions">
        {!waOpen ? (
          <button type="button" className="v2-btn v2-btn-secondary" onClick={() => setWaOpen(true)}>Send receipt to WhatsApp</button>
        ) : null}
        <button type="button" className="v2-btn v2-btn-primary" onClick={() => dispatch({ type: "reset" })}>Done</button>
        <PoweredBy />
      </footer>
    </div>
  );
}

// ───────────────────────────── Full-screen frame ─────────────────────────────
// Pinned header (+ optional title row and pinned extras such as menu tabs), one scrolling middle,
// pinned footer that always ends with "Powered by". Same shell as the bill.
function BackIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function Frame({ s, title, onBack, sub, pinned, footer, children, center = false, underlay = false }: any) {
  return (
    <div className="v2-screen" aria-hidden={underlay || undefined} inert={underlay || undefined}>
      <Header s={s} sub={sub} />
      {title ? (
        <div className="v2-subhead">
          {onBack ? (
            <button type="button" className="v2-back" aria-label="Back" onClick={onBack}><BackIcon /></button>
          ) : null}
          <h2 className="v2-subhead-title">{title}</h2>
        </div>
      ) : null}
      {pinned ? <div className="v2-pinned">{pinned}</div> : null}
      <div className="v2-scroll">
        <main className={`v2-body${center ? " v2-center" : ""}`}>{children}</main>
      </div>
      <footer className="v2-actions">
        {footer}
        <PoweredBy />
      </footer>
    </div>
  );
}

// Invite someone at the table: the phone's share sheet when there is one, WhatsApp otherwise.
function shareLink(text: string, url: string) {
  try {
    const nav: any = typeof navigator !== "undefined" ? navigator : null;
    if (nav?.share) { nav.share({ text, url }).catch(() => {}); return; }
    window.open(`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`, "_blank", "noopener");
  } catch {}
}
const tableLink = () => (typeof window !== "undefined" ? window.location.origin + window.location.pathname : "");

function SplitWait({ s, dispatch, title }: any) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 8000);
    return () => clearTimeout(t);
  }, []);
  const stuck = slow || !!s?.splitError;
  return (
    <Frame
      s={s}
      title={title}
      onBack={() => dispatch(go("bill"))}
      center
      footer={stuck ? <button type="button" className="v2-btn v2-btn-secondary" onClick={() => dispatch({ type: "screen", value: "split" })}>Back to split options</button> : null}
    >
      {s?.splitError ? (
        <>
          <h2 className="v2-title">Can&apos;t split this bill yet</h2>
          <p className="v2-lead" role="alert">{s.splitError}</p>
        </>
      ) : (
        <p className="v2-lead v2-row-center" role="status" aria-live="polite"><Spinner /> Setting up the split…</p>
      )}
    </Frame>
  );
}

function Progress({ paid, total, extra }: { paid: number; total: number; extra?: string | null }) {
  const pct = total ? Math.min(100, Math.round((paid / total) * 100)) : 0;
  return (
    <div className="v2-progress-wrap">
      <div className="v2-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Share of the bill paid">
        <div style={{ width: `${pct}%` }} />
      </div>
      <p className="v2-small">{pes(paid)} of {pes(total)} paid{extra ? ` · ${extra}` : ""}</p>
    </div>
  );
}

// ───────────────────────────── Split by item ─────────────────────────────
function SplitItemsV2({ s, dispatch }: any) {
  const split = s?.split;
  if (!split || split.mode !== "items") return <SplitWait s={s} dispatch={dispatch} title="Pay for what you had" />;
  const items: any[] = split.items ?? [];
  const myId = split.myShareId ?? null;
  const myAmount = split.myShareAmountPesewas ?? 0;
  const total = split.totalPesewas ?? 0;
  const paid = split.paidPesewas ?? 0;
  const unassigned = split.unassignedPesewas ?? 0;
  const iPaid = (split.shares ?? []).some((sh: any) => sh.mine && sh.status === "paid");
  const done = total > 0 && paid >= total;
  const myUnitsOn = (it: any) => it.takers.find((t: any) => t.shareId === myId)?.units ?? 0;
  const picked = items.reduce((n: number, it: any) => n + myUnitsOn(it), 0);
  const footer = done ? (
    <p className="v2-notice is-good" role="status">Every item is paid for. Thank you!</p>
  ) : iPaid ? (
    <p className="v2-notice is-good" role="status">Your items are paid. Waiting on the rest of the table.</p>
  ) : (
    <>
      <div className="v2-foot-line">
        <span>{picked ? `Your items (${picked})` : "Nothing picked yet"}</span>
        <b data-testid="v2-my-items">{pes(myAmount)}</b>
      </div>
      <button
        type="button"
        className="v2-btn v2-btn-primary"
        disabled={myAmount <= 0 || !!s?.splitError || !!s?.pendingConfirm}
        onClick={() => { if (myAmount > 0) dispatch({ type: "patch-go", value: { claimedShareId: myId ?? "__local_pending__" }, to: "tip" }); }}
      >
        {s?.pendingConfirm ? "Getting your share ready…" : myAmount > 0 ? `Pay ${pes(myAmount)}` : "Pick what you had"}
      </button>
    </>
  );
  return (
    <Frame s={s} title="Pay for what you had" onBack={() => dispatch(go("bill"))} footer={footer}>
      {s?.splitNotice ? <p className="v2-notice" role="status">{s.splitNotice}</p> : null}
      <p className="v2-lead">Tap + on what you had. Friends at the table can scan the same code and pick theirs.</p>
      <ul className="v2-card v2-picks">
        {items.map((it: any) => {
          const mine = myUnitsOn(it);
          const others = it.takers.filter((t: any) => t.shareId !== myId);
          const canAdd = it.unitsFree > 0 && !iPaid;
          const taken = it.unitsFree <= 0 && mine === 0;
          const unit = it.qty > 0 ? Math.round(it.lineTotalPesewas / it.qty) : it.lineTotalPesewas;
          return (
            <li key={it.billItemId} className={taken ? "is-off" : undefined}>
              <div className="v2-pick-main">
                <span className="v2-pick-name">{it.name}</span>
                <span className="v2-small">
                  {pes(unit)}{it.qty > 1 ? ` each · ${it.qty} on the bill` : ""}{taken ? " · taken" : ""}
                </span>
                {others.length ? (
                  <span className="v2-small">
                    {others.map((t: any) => `${t.name}${t.units > 1 ? ` ×${t.units}` : ""}${t.paid ? " (paid)" : ""}`).join(", ")}
                  </span>
                ) : null}
              </div>
              <div className="v2-stepper">
                {mine > 0 ? (
                  <button type="button" className="v2-round v2-round-s" aria-label={`Remove one ${it.name}`} disabled={iPaid}
                    onClick={() => dispatch({ type: "split-assign", billItemId: it.billItemId, units: mine - 1 })}>−</button>
                ) : null}
                {mine > 0 ? <b className="v2-step-count">{mine}</b> : null}
                <button type="button" className={`v2-round v2-round-s${mine > 0 && canAdd ? " is-on" : ""}`} aria-label={`Add one ${it.name}`} disabled={!canAdd}
                  onClick={() => dispatch({ type: "split-assign", billItemId: it.billItemId, units: mine + 1 })}>+</button>
              </div>
            </li>
          );
        })}
      </ul>
      <Progress paid={paid} total={total} extra={unassigned > 0 ? `${pes(unassigned)} not picked yet` : null} />
      {unassigned > 0 && !iPaid ? (
        <button type="button" className="v2-link v2-centered" onClick={() => dispatch({ type: "assign-remaining" })}>
          I&apos;ll pay for everything not picked yet
        </button>
      ) : null}
      <div className="v2-links">
        <button type="button" className="v2-link" onClick={() => shareLink("Join our bill and pick what you had:", tableLink())}>Invite someone at the table</button>
      </div>
      {s?.splitError ? <p className="v2-error-text" role="alert">{s.splitError}</p> : null}
    </Frame>
  );
}

// ───────────────────────────── Split equally / set amount: the shares ─────────────────────────────
function SplitLobbyV2({ s, dispatch }: any) {
  const split = s?.split;
  if (!split) return <SplitWait s={s} dispatch={dispatch} title="Split the bill" />;
  const shares: any[] = split.shares ?? [];
  const paid = split.paidPesewas ?? 0;
  const total = split.totalPesewas ?? 0;
  const done = total > 0 && paid >= total;
  const mine = shares.find((sh) => sh.mine && sh.status === "claimed");
  const invite = (sh: any) => shareLink(`Your share of the bill is ${pes(sh.amountPesewas)}. Tap to pay:`, `${tableLink()}?claim=${sh.shareToken}`);
  const footer = done ? (
    <p className="v2-notice is-good" role="status">Every share is paid. Thank you!</p>
  ) : mine ? (
    <button type="button" className="v2-btn v2-btn-primary" onClick={() => dispatch({ type: "patch-go", value: { claimedShareId: mine.id }, to: "tip" })}>
      Pay my share {pes(mine.amountPesewas)}
    </button>
  ) : (
    <p className="v2-small v2-centered">Take a share to pay it, or send one to someone at the table.</p>
  );
  return (
    <Frame s={s} title="Split the bill" onBack={() => dispatch(go("bill"))} footer={footer}>
      {s?.splitNotice ? <p className="v2-notice" role="status">{s.splitNotice}</p> : null}
      <p className="v2-lead">{split.mode === "even" ? `Split ${shares.length} ways. Each person pays one share.` : "Each share is paid separately. Take yours and pay it."}</p>
      <ul className="v2-card v2-shares">
        {shares.map((sh: any) => {
          const who = sh.claimedByName && sh.claimedByName !== "You" ? sh.claimedByName : null;
          const status = sh.status === "paid" ? "Paid" : sh.status === "claimed" ? (sh.mine ? "You're paying this one" : who ? `Taken by ${who}` : "Taken") : "Open";
          return (
            <li key={sh.id} className={`is-${sh.status}${sh.mine ? " is-mine" : ""}`}>
              <div className="v2-share-main">
                <span className="v2-pick-name">{sh.mine ? "Your share" : sh.label}</span>
                <span className={`v2-small${sh.status === "paid" ? " is-good" : ""}`}>{status}</span>
              </div>
              <b className="v2-share-amt">{pes(sh.amountPesewas)}</b>
              <div className="v2-share-acts">
                {sh.status === "unclaimed" ? (
                  <>
                    <button type="button" className="v2-mini" onClick={() => dispatch({ type: "split-claim", shareId: sh.id })}>Take it</button>
                    <button type="button" className="v2-mini v2-mini-ghost" onClick={() => invite(sh)}>Send</button>
                  </>
                ) : sh.status === "claimed" && sh.mine ? (
                  <button type="button" className="v2-mini v2-mini-ghost" onClick={() => dispatch({ type: "split-release", shareId: sh.id })}>Give back</button>
                ) : sh.status === "claimed" ? (
                  <button type="button" className="v2-mini v2-mini-ghost" onClick={() => invite(sh)}>Remind</button>
                ) : (
                  <span className="v2-paid-tick" aria-label="Paid"><Check size={16} /></span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <Progress paid={paid} total={total} />
    </Frame>
  );
}

// ───────────────────────────── Menu ─────────────────────────────
const menuPhoto = (it: any): string | null => {
  const k = it?.image_url || it?.image_key;
  if (!k) return null;
  return /^https?:\/\//.test(k) || k.startsWith("data:") ? k : `/assets/menu/${k}`;
};
// POS items and Menu Studio items in one shape.
function menuEntry(it: any, studio: boolean) {
  const priceText = studio && it?.price_display && String(it.price_display).trim() ? String(it.price_display).trim() : it?.price_pesewas != null ? pes(it.price_pesewas) : "";
  return {
    id: String(it?.id ?? it?.name),
    name: it?.name ?? "",
    desc: (studio ? it?.description : it?.tags?.desc ?? it?.tags?.sub) || "",
    price: priceText,
    photo: menuPhoto(it),
    soldOut: !!it?.sold_out || it?.available === false,
    tags: [it?.tags?.veg ? "Vegan" : null, it?.tags?.signature ? "Chef’s signature" : null, it?.tags?.origin || null].filter(Boolean) as string[],
  };
}

function useMenuSections(s: any, mi: number) {
  const m = s?.menu;
  if (!m) return { sections: [] as any[], digital: {} as any, menus: [] as any[] };
  if (m.source === "studio") {
    const menus: any[] = m.menus ?? [];
    const active = menus[mi] ?? { sections: m.sections ?? [], digital: m.digital };
    const sections = (active.sections ?? []).map((sec: any) => ({ id: String(sec.id), name: sec.name || "", items: (sec.items ?? []).map((it: any) => menuEntry(it, true)) })).filter((x: any) => x.items.length);
    return { sections, digital: active.digital || {}, menus };
  }
  const cats: any[] = [...(m.categories ?? [])].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
  const items: any[] = m.items ?? [];
  const sections = cats
    .map((c) => ({ id: String(c.id), name: c.name || "", items: items.filter((i) => i.category_id === c.id).map((i) => menuEntry(i, false)) }))
    .filter((x) => x.items.length);
  return { sections, digital: {}, menus: [] };
}

function MenuV2({ s, dispatch, underlay = false }: any) {
  const [mi, setMi] = useState(0);
  const [tab, setTab] = useState<string>("all");
  const [q, setQ] = useState("");
  const { sections, digital, menus } = useMenuSections(s, mi);
  const back = () => dispatch(go("welcome"));
  const remaining = s?.bill ? s.bill.remainingPesewas ?? s.bill.totalPesewas ?? 0 : 0;
  const footer = s?.bill && remaining > 0 ? (
    <button type="button" className="v2-btn v2-btn-secondary" onClick={() => dispatch(go("bill"))}>See my bill · {pes(remaining)}</button>
  ) : null;
  if (!s?.menu) {
    return (
      <Frame s={s} title="Menu" onBack={back} center footer={footer} underlay={underlay}>
        <p className="v2-lead v2-row-center" role="status" aria-live="polite"><Spinner /> Loading the menu…</p>
      </Frame>
    );
  }
  const needle = q.trim().toLowerCase();
  const shown = sections
    .filter((sec: any) => tab === "all" || sec.id === tab)
    .map((sec: any) => ({ ...sec, items: needle ? sec.items.filter((it: any) => `${it.name} ${it.desc}`.toLowerCase().includes(needle)) : sec.items }))
    .filter((sec: any) => sec.items.length);
  const open = s?.menu?.source === "studio" ? openState(digital?.hours) : null;
  const pinned = sections.length ? (
    <>
      <label className="v2-search">
        <SearchIcon />
        <input type="search" placeholder="Search the menu" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search the menu" enterKeyHint="search" />
      </label>
      {menus.length > 1 ? (
        <div className="v2-tabs" role="tablist" aria-label="Menus">
          {menus.map((m: any, i: number) => (
            <button key={m.id ?? i} type="button" role="tab" aria-selected={i === mi} className={i === mi ? "is-on" : undefined} onClick={() => { setMi(i); setTab("all"); }}>{m.name}</button>
          ))}
        </div>
      ) : null}
      <div className="v2-tabs v2-tabs-line" role="tablist" aria-label="Sections">
        {[{ id: "all", name: "All" }, ...sections].map((sec: any) => (
          <button key={sec.id} type="button" role="tab" aria-selected={tab === sec.id} className={tab === sec.id ? "is-on" : undefined} onClick={() => setTab(sec.id)}>{sec.name}</button>
        ))}
      </div>
    </>
  ) : null;
  return (
    <Frame s={s} title="Menu" onBack={back} pinned={pinned} footer={footer} underlay={underlay}>
      {digital?.welcome_alert ? <p className="v2-notice">{digital.welcome_alert}</p> : null}
      {open ? <p className={`v2-small${open.open ? " is-good" : ""}`}>{open.open ? "Open now" : "Closed now"}</p> : null}
      {!sections.length ? (
        <div className="v2-center v2-stack">
          <Emoji name="fork_and_knife_with_plate" size={56} />
          <p className="v2-lead">The menu isn&apos;t online yet. Ask your waiter for a menu.</p>
        </div>
      ) : !shown.length ? (
        <p className="v2-lead">Nothing matches “{q.trim()}”.</p>
      ) : (
        shown.map((sec: any) => (
          <section key={sec.id} className="v2-menu-sec" aria-label={sec.name}>
            <h3 className="v2-sec-title">{sec.name}</h3>
            <ul className="v2-card v2-dishes">
              {sec.items.map((it: any) => (
                <li key={it.id}>
                  <button type="button" className={it.soldOut ? "is-off" : undefined} onClick={() => dispatch({ type: "patch-go", value: { selectedItem: it, dish: it.name }, to: "dish" })}>
                    {it.photo ? <img src={it.photo} alt="" loading="lazy" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} /> : null}
                    <span className="v2-dish-main">
                      <span className="v2-pick-name">{it.name}</span>
                      {it.soldOut ? <span className="v2-small">Sold out</span> : it.desc ? <span className="v2-small v2-clamp">{it.desc}</span> : null}
                    </span>
                    <b className="v2-dish-price">{it.price}</b>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </Frame>
  );
}

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}

function DishV2({ s, dispatch }: any) {
  const raw = s?.selectedItem;
  // Saved by the new menu (already one shape) or by the classic one (a raw POS item).
  const it = raw && "price" in raw && "photo" in raw ? raw : menuEntry(raw ?? { name: s?.dish }, false);
  return (
    <Sheet
      s={s}
      dispatch={dispatch}
      title={it.name}
      onClose={() => dispatch(go("menu"))}
      under={<MenuV2 s={s} dispatch={dispatch} underlay />}
      footer={<button type="button" className="v2-btn v2-btn-secondary" onClick={() => dispatch(go("waiter"))}>Ask your waiter about it</button>}
    >
      {it.photo ? <img className="v2-dish-photo" src={it.photo} alt="" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} /> : null}
      <div className="v2-stack">
        <p className="v2-amount-l">{it.price}</p>
        {it.soldOut ? <p className="v2-small is-bad">Sold out today</p> : null}
        {it.desc ? <p className="v2-lead">{it.desc}</p> : null}
        {it.tags?.length ? <p className="v2-small">{it.tags.join(" · ")}</p> : null}
      </div>
    </Sheet>
  );
}

// ───────────────────────────── Waiter ─────────────────────────────
function WaiterV2({ s, dispatch }: any) {
  const server = serverOf(s);
  return (
    <Frame s={s} title="Call your waiter" onBack={() => dispatch(go("menu"))}>
      <p className="v2-lead">{server ? `${server} will` : `Someone from ${s?.restaurantName || "the team"} will`} come to your table.</p>
      <div className="v2-options">
        <button type="button" className="v2-option" onClick={() => dispatch({ type: "waiter", kind: "assistance" })}>
          <b>Come to my table</b>
          <small>For anything you need</small>
        </button>
        <button type="button" className="v2-option" onClick={() => dispatch({ type: "waiter", kind: "recommendation" })}>
          <b>Help me choose</b>
          <small>Ask about a dish or what&apos;s good today</small>
        </button>
      </div>
    </Frame>
  );
}

function WaiterSentV2({ s, dispatch }: any) {
  const server = serverOf(s);
  return (
    <Frame
      s={s}
      center
      footer={
        <>
          <button type="button" className="v2-btn v2-btn-primary" onClick={() => dispatch(go(s?.bill ? "bill" : "welcome"))}>{s?.bill ? "Back to my bill" : "Back to my table"}</button>
          <button type="button" className="v2-btn v2-btn-secondary" onClick={() => dispatch(go("menu"))}>Back to the menu</button>
        </>
      }
    >
      <Emoji name="check_mark_button" size={72} />
      <h2 className="v2-title">{server ? `${server} is on the way` : "Your waiter is on the way"}</h2>
      <p className="v2-lead">Usually within 2 or 3 minutes. No need to wave.</p>
    </Frame>
  );
}

// ───────────────────────────── Which bill is yours (separate groups at one table) ─────────────────────────────
function ChooseTabV2({ s, dispatch }: any) {
  const tabs: any[] = s?.tabs ?? [];
  const opened = (iso: string) => {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? "" : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };
  return (
    <Frame s={s} title="Which bill is yours?" onBack={() => dispatch(go("welcome"))} footer={<p className="v2-small v2-centered">Not sure which is yours? Ask your waiter.</p>}>
      <p className="v2-lead">{tabs.length > 1 ? `There are ${tabs.length} groups at Table ${s?.tableLabel ?? ""}, each with their own bill. Pick the one you're with.` : "Looking for your bill…"}</p>
      <ul className="v2-card v2-tabs-list">
        {tabs.map((t: any) => (
          <li key={t.billId}>
            <button type="button" disabled={!!s?.tabSelectBusy} onClick={() => dispatch({ type: "tab-select", billId: t.billId })}>
              <span className="v2-avatar" aria-hidden="true">{(t.label || String(s?.tableLabel ?? "T")).slice(0, 1).toUpperCase()}</span>
              <span className="v2-dish-main">
                <span className="v2-pick-name">{t.label ? `${t.label}'s bill` : `Table ${s?.tableLabel ?? ""}`}</span>
                <span className="v2-small">
                  {t.itemCount} {t.itemCount === 1 ? "item" : "items"}
                  {t.preview?.length ? ` · ${t.preview.join(", ")}${t.itemCount > t.preview.length ? "…" : ""}` : ""}
                </span>
                <span className="v2-small">{t.serverName ? `${t.serverName} · ` : ""}opened {opened(t.openedAt)}</span>
              </span>
              <b className="v2-dish-price">{pes(t.remainingPesewas)}</b>
            </button>
          </li>
        ))}
      </ul>
    </Frame>
  );
}

// ───────────────────────────── One-time code (some MoMo networks / cards) ─────────────────────────────
function OtpV2({ s, dispatch }: any) {
  const [otp, setOtp] = useState("");
  const ok = otp.replace(/\D/g, "").length >= 4;
  return (
    <Frame
      s={s}
      title="Enter the code"
      onBack={() => dispatch(go("review"))}
      footer={<button type="button" className="v2-btn v2-btn-primary" disabled={!ok} onClick={() => dispatch({ type: "pay-otp", value: { otp: otp.replace(/\D/g, "") } })}>Confirm payment</button>}
    >
      <p className="v2-lead">We sent a one-time code by SMS. Enter it to confirm this payment.</p>
      <label className="v2-label">
        Code
        <input className="v2-input v2-otp" value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="123456" inputMode="numeric" autoComplete="one-time-code" aria-label="Payment code" autoFocus />
      </label>
    </Frame>
  );
}

// ───────────────────────────── Receipt ─────────────────────────────
function ReceiptRewardsV2({ s, dispatch }: any) {
  const share = s?.lastPaid?.amountPesewas ?? s?.quote?.sharePesewas ?? 0;
  const paid = s?.totalPaidPesewas ?? s?.lastPaid?.totalPesewas ?? share + tipPesewasFor(s, share);
  const [name, setName] = useState(s?.firstName ?? "");
  const [phone, setPhone] = useState(s?.phone ?? s?.momoNumber ?? "");
  const [touched, setTouched] = useState(false);
  const normalized = normalizeGhanaMobile(phone);
  const showHint = touched && phone.trim().length > 0 && !normalized;
  const save = () => {
    if (!normalized) { setTouched(true); return; }
    dispatch({ type: "rewards-consent", value: { phone: normalized, firstName: name.trim() || undefined } });
  };
  return (
    <Frame
      s={s}
      title="Your receipt"
      onBack={() => dispatch(go("success"))}
      footer={
        <>
          <button type="button" className="v2-btn v2-btn-primary" disabled={!normalized || !!s?.rewardsBusy} onClick={save}>{s?.rewardsBusy ? "Saving…" : "Save and see my receipt"}</button>
          <button type="button" className="v2-btn v2-btn-text" onClick={() => dispatch(go("guest-receipt"))}>Skip, just show the receipt</button>
        </>
      }
    >
      <div className="v2-card v2-paidcard">
        <span className="v2-muted">{s?.receiptNumber ? `Receipt ${s.receiptNumber}` : "Paid"}</span>
        <p className="v2-amount-l">{pes(paid)}</p>
        <span className="v2-small is-good">Paid to {s?.restaurantName || "the restaurant"}</span>
      </div>
      <div className="v2-stack">
        <h3 className="v2-subtitle">Collect rewards on this visit</h3>
        <p className="v2-small">Add your number and we&apos;ll keep your receipts and rewards together. Your receipt is ready either way.</p>
      </div>
      <label className="v2-label">
        First name (optional)
        <input className="v2-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ama" autoComplete="given-name" />
      </label>
      <label className="v2-label">
        Phone number
        <input className="v2-input" value={phone} onChange={(e) => setPhone(e.target.value)} onBlur={() => setTouched(true)} placeholder="024 000 0000" inputMode="tel" autoComplete="tel" aria-invalid={showHint || undefined} />
      </label>
      {showHint ? <p className="v2-error-text">That doesn&apos;t look like a mobile number. Enter 10 digits, for example 024 123 4567.</p> : null}
      {s?.rewardsError ? <p className="v2-error-text" role="alert">{s.rewardsError}</p> : null}
    </Frame>
  );
}

function ReceiptV2({ s, dispatch }: any) {
  const { url, busy, err, download, ready } = useReceiptPng(s);
  return (
    <Frame
      s={s}
      title="Your receipt"
      onBack={() => dispatch(go("success"))}
      footer={
        <>
          <button type="button" className="v2-btn v2-btn-primary" disabled={!ready} onClick={download}>Download receipt</button>
          <button type="button" className="v2-btn v2-btn-secondary" onClick={() => dispatch(go("success"))}>Done</button>
        </>
      }
    >
      {busy ? <p className="v2-lead v2-row-center" role="status" aria-live="polite"><Spinner /> Preparing your receipt…</p> : null}
      {url ? <img className="v2-receipt-img" src={url} alt={`Receipt${s?.receiptNumber ? ` ${s.receiptNumber}` : ""}`} /> : null}
      {err ? <p className="v2-error-text" role="alert">{err}</p> : null}
    </Frame>
  );
}

// ───────────────────────────── Table session ended ─────────────────────────────
function ExpiredV2({ s, dispatch }: any) {
  return (
    <Frame s={s} center footer={<button type="button" className="v2-btn v2-btn-primary" onClick={() => dispatch({ type: "rescan" })}>Reconnect to my table</button>}>
      <h2 className="v2-title">This table link has timed out</h2>
      <p className="v2-lead">Reconnect to see the latest bill{s?.tableLabel ? ` for Table ${s.tableLabel}` : ""}. Anything you&apos;ve already paid is safe.</p>
    </Frame>
  );
}


// ───────────────────────────── Loading splash (before the table resolves) ─────────────────────────────
// Shown by ResolvedDiningApp while qr-resolve runs, so a returning diner never sees the old splash.
// `last` is the restaurant this phone resolved for this table before (its logo/name), if any.
export function V2Splash({ slow, onRetry, confirming, last }: { slow?: boolean; onRetry?: () => void; confirming?: boolean; last?: { name?: string; logoUrl?: string } | null }) {
  useFont();
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("v2-lock");
    return () => root.classList.remove("v2-lock");
  }, []);
  return (
    <div className="v2" data-ui="v2-splash">
      <div className="v2-screen">
        <div className="v2-scroll">
          <main className="v2-body v2-center">
            {last?.logoUrl ? (
              <img className="v2-splash-logo" src={last.logoUrl} alt={last.name || ""} />
            ) : last?.name ? (
              <p className="v2-brand-name">{last.name}</p>
            ) : (
              <img className="v2-splash-klown" src="/klown-logo.png" alt="Klown" />
            )}
            <p className="v2-lead v2-row-center" role="status" aria-live="polite">
              <Spinner /> {confirming ? "Confirming your payment…" : "Connecting to your table…"}
            </p>
            {slow ? (
              <>
                <p className="v2-small">This is taking longer than usual. Check your signal.</p>
                {onRetry ? <button type="button" className="v2-btn v2-btn-secondary" onClick={onRetry}>Try again</button> : null}
              </>
            ) : null}
          </main>
        </div>
        <footer className="v2-actions"><PoweredBy /></footer>
      </div>
    </div>
  );
}


// ───────────────────────────── Home (the first screen after scanning) ─────────────────────────────
// The restaurant's own photo, logo and welcome line, then two choices. The bill (or "no bill yet")
// comes after "View and pay the bill"; with several groups at the table, it asks which bill first.
function WelcomeV2({ s, dispatch }: any) {
  const dig = s?.menu?.digital || {};
  const open = openState(dig.hours);
  const hrs = hoursLine(dig.hours);
  const name = s?.restaurantName || "Welcome";
  const hero = s?.heroUrl || "/assets/restaurant-hero.png";
  const copy = s?.welcomeCopy || `View your bill, split it with friends and pay from your phone.`;
  const pickTab = !s?.bill && (s?.tabs?.length ?? 0) > 1;
  return (
    <div className="v2-screen v2-welcome">
      <div className="v2-hero" style={{ backgroundImage: `url(${hero})` }}>
        <div className="v2-hero-shade" aria-hidden="true" />
        {s?.tableLabel ? <span className="v2-table v2-hero-table"><span className="v2-dot is-ink" aria-hidden="true" />Table {s.tableLabel}</span> : null}
        <div className="v2-hero-brand">
          <p className="v2-hero-eyebrow">Welcome to</p>
          {s?.logoUrl ? (
            <h1 className="v2-hero-logo"><img src={s.logoUrl} alt={name} /></h1>
          ) : (
            <h1 className="v2-hero-name">{name}</h1>
          )}
          {s?.taglineBottom && !s?.logoUrl ? <p className="v2-hero-tag">{s.taglineBottom}</p> : null}
          {open || hrs ? (
            <p className="v2-hero-open">
              {open ? <><span className={`v2-dot${open.open ? " is-open" : ""}`} aria-hidden="true" />{open.open ? "Open now" : "Closed now"}</> : null}
              {open && hrs ? <span aria-hidden="true"> · </span> : null}
              {hrs ? <span>{hrs}</span> : null}
            </p>
          ) : null}
        </div>
      </div>
      <div className="v2-welcome-panel">
        <p className="v2-lead v2-welcome-copy">{copy}</p>
        <button type="button" className="v2-btn v2-btn-primary v2-btn-go" onClick={() => dispatch(go(pickTab ? "choose-tab" : "bill"))}>
          <span>View &amp; pay your bill</span>
          <span className="v2-go-circle" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          </span>
        </button>
        <button type="button" className="v2-btn v2-btn-secondary v2-btn-row" onClick={() => dispatch(go("menu"))}>
          <Emoji name="fork_and_knife_with_plate" size={26} />
          <span>Browse the menu</span>
          <svg className="v2-chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
        </button>
        <PoweredBy />
      </div>
    </div>
  );
}

// ───────────────────────────── Router ─────────────────────────────
export function DinerV2({ s, dispatch }: any) {
  useFont();
  const top = useRef<HTMLDivElement>(null);
  // Each new screen starts at the top (sheets keep the bill where it was).
  useEffect(() => {
    if (!PAY_SHEET.has(s?.screen) && s?.screen !== "split" && typeof window !== "undefined") window.scrollTo(0, 0);
  }, [s?.screen]);
  // App-shell layout: the page itself never scrolls, only the content area does, so Safari's
  // toolbar stays put and the pinned footer never moves (same feel as the waiter app).
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("v2-lock");
    return () => root.classList.remove("v2-lock");
  }, []);
  const banner = !!s?.testMode || onPreviewHost();
  const screen = s?.screen;
  let body: any;
  if (s?.sessionExpired) body = <ExpiredV2 s={s} dispatch={dispatch} />;
  else if (PAY_SHEET.has(screen)) body = <PaySheet s={s} dispatch={dispatch} />;
  else if (screen === "welcome") body = <WelcomeV2 s={s} dispatch={dispatch} />;
  else if (screen === "choose-tab") body = <ChooseTabV2 s={s} dispatch={dispatch} />;
  else if (screen === "split-items") body = <SplitItemsV2 s={s} dispatch={dispatch} />;
  else if (screen === "split-lobby") body = <SplitLobbyV2 s={s} dispatch={dispatch} />;
  else if (screen === "otp") body = <OtpV2 s={s} dispatch={dispatch} />;
  else if (screen === "menu" || screen === "category") body = <MenuV2 s={s} dispatch={dispatch} />;
  else if (screen === "dish") body = <DishV2 s={s} dispatch={dispatch} />;
  else if (screen === "waiter") body = <WaiterV2 s={s} dispatch={dispatch} />;
  else if (screen === "waiter-notified") body = <WaiterSentV2 s={s} dispatch={dispatch} />;
  else if (screen === "receipt-choice") body = <ReceiptRewardsV2 s={s} dispatch={dispatch} />;
  else if (screen === "guest-receipt") body = <ReceiptV2 s={s} dispatch={dispatch} />;
  else if (screen === "feedback" || screen === "review-handoff" || screen === "complete") body = <Paid s={s} dispatch={dispatch} />;
  else if (screen === "split") body = <SplitSheet s={s} dispatch={dispatch} />;
  else if (screen === "authorise") body = <Approve s={s} dispatch={dispatch} />;
  else if (screen === "processing") body = <Processing s={s} dispatch={dispatch} />;
  else if (screen === "payment-error") body = <PaymentError s={s} dispatch={dispatch} />;
  else if (screen === "success") body = <Paid s={s} dispatch={dispatch} />;
  else body = <BillOrState s={s} dispatch={dispatch} />;
  return (
    <div ref={top} className={`v2${banner ? " v2-has-banner" : ""}`} data-ui="v2">
      {body}
    </div>
  );
}
