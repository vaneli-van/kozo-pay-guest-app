// New diner screens (redesign "B", prototype: claude/diner-redesign.md in the Klown project).
// Switched on per restaurant (restaurants.diner_ui = 'v2'); everyone else keeps screens.tsx.
//
// These are a new presentation over the SAME state machine and server calls as the classic
// screens: every money step dispatches the actions App.tsx already handles (pay-full, patch-go to
// 'authorise' / 'processing', split-create, feedback, whatsapp-receipt, give-up, reset...).
// Amounts come from the server quote; payment-init still refuses any total other than the one the
// diner saw (reviewedTotalPesewas). Screens without a new design yet (split lobby, item picking,
// menu, receipts...) render the classic ones.
import { useEffect, useRef, useState } from "react";
import { go } from "../session/machine";
import { money } from "../lib/format";
import { tipPesewasFor, isCustomTip, parseCediInput } from "../lib/tip";
import { normalizeGhanaMobile } from "../lib/phone";
import { REASON_COPY } from "../lib/reasons";
import { billTax } from "../integrations/billing/tax";
import "../styles/kozo-v2.css";

const pes = (v?: number | null) => money((v ?? 0) / 100);

// The screens this file draws. Anything else falls back to the classic screen.
export const V2_SCREENS = new Set([
  "welcome", "bill", "bill-ready", "empty", "waiting-bill", "pay",
  "split", "tip", "review", "method", "momo",
  "authorise", "processing", "payment-error", "success",
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

function Header({ s, sub }: { s: any; sub?: string | null }) {
  const name = s?.restaurantName || "Your table";
  return (
    <header className="v2-header">
      <div className="v2-header-row">
        <h1 className="v2-brand">
          {s?.logoUrl ? <img className="v2-brand-logo" src={s.logoUrl} alt={name} /> : <span className="v2-brand-name">{name}</span>}
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
      <Header s={s} sub={server ? `${server} is looking after you` : null} />
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
      <Header s={s} />
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
  if (s?.noBill || s?.screen === "welcome" || s?.screen === "empty" || s?.screen === "waiting-bill") return <NoBill s={s} dispatch={dispatch} />;
  return (
    <div className="v2-screen">
      <Header s={s} />
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
function Sheet({ s, dispatch, title, onClose, children, footer }: any) {
  return (
    <div className="v2-overlay">
      <div className="v2-underlay"><BillView s={s} dispatch={dispatch} underlay /></div>
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
  const close = () => dispatch(shareGone ? { type: "pay-full", to: "bill" } : go("bill"));
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
      {s?.splitError ? <p className="v2-error-text" role="alert">{s.splitError}</p> : null}
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
  if (PAY_SHEET.has(screen)) body = <PaySheet s={s} dispatch={dispatch} />;
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
