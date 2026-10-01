import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  CreditCard,
  Heart,
  Info,
  ListChecks,
  Minus,
  Plus,
  QrCode,
  ReceiptText,
  RotateCcw,
  Search,
  Send,
  ShieldCheck,
  Smartphone,
  Star,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { FaApple } from "react-icons/fa6";
import { go, screens, type Screen } from "../session/machine";
import { money } from "../lib/format";
import { taxBreakdown } from "../integrations/billing/tax";
import { Back, Action, Center, BillRow } from "../ui/primitives";
import { KzHeader, Money, Sheet } from "../ui/kz";
import { openState, hoursLine } from "../lib/hours";
import { injectStudioFonts } from "../lib/studioFonts";

const pes = (v?: number | null) => money((v ?? 0) / 100);
// Real photo when the item has one; a neutral plate otherwise — never the wrong dish's image.
// image_key may be a full URL (hosted) or a bundled /assets/menu filename.
const menuImg = (item?: { image_key?: string | null }) => {
  const k = item?.image_key;
  if (!k) return "/assets/menu/_plate.png";
  return /^https?:\/\//.test(k) ? k : `/assets/menu/${k}`;
};
// If a hosted photo ever fails to load, fall back to the neutral plate — never a broken image.
const imgFallback = (e: any) => {
  if (e?.currentTarget && !e.currentTarget.src.endsWith("_plate.png"))
    e.currentTarget.src = "/assets/menu/_plate.png";
};

function useSplitScrollLock() {
  useEffect(() => {
    const scrollY = window.scrollY;
    const body = document.body;
    const original = {
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
      overflow: body.style.overflow,
    };
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";
    body.style.overflow = "hidden";
    return () => {
      body.style.position = original.position;
      body.style.top = original.top;
      body.style.width = original.width;
      body.style.overflow = original.overflow;
      window.scrollTo(0, scrollY);
    };
  }, []);
}

export function Connect({ s, dispatch }: any) {
  return (
    <Center
      logoUrl={s?.logoUrl}
      alt={s?.restaurantName}
      eyebrow="A BETTER WAY TO DINE"
      title={"Making the<br /><em>table</em> feel closer."}
      copy="Connecting to your table…"
    >
      <div className="loader" />
      <button className="text-link" onClick={() => dispatch(go("welcome"))}>
        Skip connection
      </button>
    </Center>
  );
}

export function Welcome({ s, dispatch }: any) {
  const dig = s?.menu?.digital || {};
  const oc = openState(dig.hours);
  const hrs = hoursLine(dig.hours);
  const name = s?.taglineTop || s?.restaurantName || "Welcome";
  const copy = s?.welcomeCopy || `Welcome to ${s?.restaurantName || "us"}. Scan, view your bill, split and pay right from your table.`;
  const hero = s?.heroUrl || "/assets/restaurant-hero.png";
  const meta = dig.info || s?.city || "";
  return (
    <section className="welcome-v2">
      <div
        className="welcome-hero"
        style={{
          backgroundImage: `linear-gradient(to bottom, rgba(0,0,0,.30) 0%, rgba(0,0,0,0) 22%, rgba(0,0,0,0) 40%, rgba(12,10,8,.55) 66%, rgba(12,10,8,.95) 100%), url(${hero})`,
        }}
      >
        {s?.tableLabel ? (
          <div className="welcome-chip">
            <span className="welcome-chip-dot" aria-hidden="true" />
            Table {s.tableLabel}
          </div>
        ) : null}
        <div className="welcome-hero-text">
          <p className="welcome-eyebrow">Welcome to</p>
          {s?.logoUrl ? (
            <img className="welcome-logo" src={s.logoUrl} alt={s?.restaurantName || ""} />
          ) : (
            <h1 className="welcome-name">
              {name}
              {s?.taglineBottom ? (
                <>
                  <br />
                  <em>{s.taglineBottom}</em>
                </>
              ) : null}
            </h1>
          )}
          {(oc || hrs || meta) && (
            <div className="welcome-open">
              {oc && (
                <>
                  <span
                    className="welcome-open-dot"
                    style={{ background: oc.open ? "var(--green)" : "#9a948a" }}
                  />
                  <span>{oc.open ? "Open now" : "Closed now"}</span>
                </>
              )}
              {hrs && (
                <>
                  <span className="welcome-sep">&middot;</span>
                  <span>{hrs}</span>
                </>
              )}
              {meta && (
                <>
                  <span className="welcome-sep">&middot;</span>
                  <span>{meta}</span>
                </>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="welcome-sheet">
        <p className="welcome-copy">{copy}</p>
        <button
          className="welcome-btn welcome-btn-primary"
          onClick={() =>
            dispatch(go(s?.hasOrder || (s?.bill?.items?.length ?? 0) > 0 ? "bill" : "empty"))
          }
        >
          <span>View &amp; pay your bill</span>
          <span className="welcome-btn-arrow" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </span>
        </button>
        <button className="welcome-row" onClick={() => dispatch(go("menu"))}>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M3 3v7a3 3 0 0 0 6 0V3M6 10v11M18 3c-1.7 0-3 2.2-3 5s1 4 3 4v9" />
          </svg>
          <span>Browse the menu</span>
          <svg className="welcome-row-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m9 6 6 6-6 6" />
          </svg>
        </button>
        <div className="welcome-secured">
          <img src="/klown-logo.png" alt="Klown" /> &middot;{" "}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="4" y="11" width="16" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>{" "}
          Secured payments
        </div>
      </div>
    </section>
  );
}

export function Empty({ s, dispatch }: any) {
  return (
    <section>
      <Back dispatch={dispatch} to="welcome" />
      <p className="eyebrow">
        {s?.tableLabel ? `TABLE ${s.tableLabel} · READY WHEN YOU ARE` : "READY WHEN YOU ARE"}
      </p>
      <h1>
        Your table,
        <br />
        <em>your pace.</em>
      </h1>
      <p className="muted">
        Nothing has been added yet. Browse the menu, or call someone over if you need a
        recommendation.
      </p>
      <div className="empty-card">
        <QrCode />
        <strong>No order yet</strong>
        <span>Your bill will appear here once the first order is placed.</span>
      </div>
      <Action onClick={() => dispatch(go("menu"))}>Explore the menu</Action>
    </section>
  );
}

export function Menu({ s, dispatch }: any) {
  if (!s?.menu)
    return (
      <section className="center-screen">
        <div className="menu-loading" role="status" aria-label="Loading menu">
          <span className="menu-loading-dot" />
          <span className="menu-loading-dot" />
          <span className="menu-loading-dot" />
        </div>
        <p className="menu-loading-text">Loading menu…</p>
      </section>
    );
  if (s?.menu?.source === "studio") return <StudioMenu s={s} dispatch={dispatch} />;
  const [group, setGroup] = useState("Food");
  const cats = s?.menu?.categories ?? [];
  const allItems = s?.menu?.items ?? [];
  const rec = (s?.menu?.recommendations ?? [])[0];
  const GROUPS: [string, (n: number) => boolean][] = [
    ["Food", (n) => n < 100],
    ["Drinks", (n) => n >= 200 && n < 300],
    ["Spirits", (n) => n >= 300 && n < 400],
    ["Wine", (n) => n >= 400],
  ];
  const test = (GROUPS.find((g) => g[0] === group) ?? GROUPS[0]!)[1];
  const groupCats = cats.filter((c: any) => test(c.sort));
  return (
    <section>
      <header className="page-header">
        <div>
          <p className="eyebrow">
            {(s?.restaurantName || "").toUpperCase()} · TABLE {s?.tableLabel ?? ""}
          </p>
          <h1>
            What are you
            <br />
            <em>in the mood for?</em>
          </h1>
        </div>
        <button className="icon-button">
          <Search />
        </button>
      </header>
      <div className="tabs">
        {GROUPS.map(([key]) => (
          <button key={key} className={key === group ? "active" : ""} onClick={() => setGroup(key)}>
            {key}
          </button>
        ))}
      </div>
      {rec && (
        <div className="recommend">
          <div>
            <p className="eyebrow">CHEF'S NOTE</p>
            <h2>{rec.title}</h2>
            <p>{rec.subtitle}</p>
          </div>
          <Star />
        </div>
      )}
      {groupCats.map((c: any) => {
        const items = allItems.filter((i: any) => i.category_id === c.id);
        return (
          <div className="menu-group" key={c.id}>
            <div className="section-label">
              {c.name.toUpperCase()}{" "}
              <span>
                {items.length} {items.length === 1 ? "item" : "items"}
              </span>
            </div>
            {items.map((i: any) => (
              <button
                className="dish-row"
                key={i.id}
                onClick={() =>
                  dispatch({
                    type: "patch-go",
                    value: { selectedItem: i, dish: i.name },
                    to: "dish",
                  })
                }
              >
                <img src={menuImg(i)} alt={i.name} onError={imgFallback} />
                <span>
                  <strong>{i.name}</strong>
                  <small>
                    {i.tags?.sub ??
                      (i.tags?.signature
                        ? "Chef’s signature"
                        : `${s?.restaurantName || "the"} kitchen`)}
                  </small>
                </span>
                <b>{pes(i.price_pesewas)}</b>
                <ChevronRight />
              </button>
            ))}
          </div>
        );
      })}
      <Action secondary onClick={() => dispatch(go("bill"))}>
        View live bill
      </Action>
    </section>
  );
}

export function Category({ s, dispatch }: any) {
  const cats = s?.menu?.categories ?? [];
  const activeId = s?.activeCategoryId ?? cats[0]?.id;
  const cat = cats.find((c: any) => c.id === activeId);
  const shown = (s?.menu?.items ?? []).filter((i: any) => i.category_id === activeId);
  return (
    <section>
      <Back dispatch={dispatch} to="menu" />
      <p className="eyebrow">{(s?.restaurantName || "").toUpperCase()} MENU</p>
      <h1>{cat?.name ?? "Menu"}</h1>
      <p className="muted">A little something for everyone at the table.</p>
      <div className="section-label">ALL {(cat?.name ?? "ITEMS").toUpperCase()}</div>
      <div className="simple-list">
        {shown.map((i: any) => (
          <p
            key={i.id}
            onClick={() =>
              dispatch({ type: "patch-go", value: { selectedItem: i, dish: i.name }, to: "dish" })
            }
          >
            {i.name} <b>{pes(i.price_pesewas)}</b>
          </p>
        ))}
      </div>
    </section>
  );
}

export function Dish({ s, dispatch }: any) {
  const it = s?.selectedItem ?? (s?.menu?.items ?? []).find((i: any) => i.name === s?.dish);
  const t = it?.tags ?? {};
  return (
    <section>
      <Back dispatch={dispatch} to="menu" />
      <img
        className="dish-hero"
        src={menuImg(it)}
        alt={it?.name ?? s?.dish}
        onError={imgFallback}
      />
      <p className="eyebrow">{(s?.restaurantName || "").toUpperCase()} KITCHEN</p>
      <h1>{it?.name ?? s?.dish}</h1>
      <p className="price">{pes(it?.price_pesewas)}</p>
      {t.sub && <p className="muted">{t.sub}</p>}
      <p className="muted">
        {t.desc ??
          `A beautiful plate, thoughtfully prepared by the ${s?.restaurantName || "house"} kitchen.`}
      </p>
      <div className="tags">
        {t.veg && <span>Vegan</span>}
        {t.signature && <span>Chef’s signature</span>}
        {t.origin && <span>{t.origin}</span>}
      </div>
      <Action onClick={() => dispatch(go("waiter"))}>Ask your waiter about this dish</Action>
    </section>
  );
}

export function Waiter({ s, dispatch }: any) {
  return (
    <section>
      <Back dispatch={dispatch} to="empty" />
      <p className="eyebrow">WAITER ASSISTANCE</p>
      <h1>
        What can we
        <br />
        <em>help with?</em>
      </h1>
      <p className="muted">
        A member of the {s?.restaurantName || "restaurant"} team will be with you shortly.
      </p>
      <div className="sheet-options">
        <button onClick={() => dispatch({ type: "waiter" })}>
          <Send />
          <span>
            <b>Call my waiter</b>
            <small>Someone will come to your table</small>
          </span>
          <ChevronRight />
        </button>
        <button onClick={() => dispatch({ type: "waiter" })}>
          <Info />
          <span>
            <b>Recommend a dish</b>
            <small>Get a little local expertise</small>
          </span>
          <ChevronRight />
        </button>
      </div>
    </section>
  );
}

export function WaiterNotified({ s, dispatch }: any) {
  return (
    <Center
      logoUrl={s?.logoUrl}
      alt={s?.restaurantName}
      eyebrow="REQUEST SENT"
      title={"On the<br /><em>way.</em>"}
      copy="Your waiter has been notified. No need to wave — we will come to you."
    >
      <div className="notice-card">
        <Clock3 />
        <span>Usually within 2–3 minutes</span>
      </div>
      <Action onClick={() => dispatch(go("waiting-bill"))}>Wait for my bill</Action>
      <button className="text-link" onClick={() => dispatch(go("menu"))}>
        Back to menu
      </button>
    </Center>
  );
}

export function WaitingBill({ s, dispatch }: any) {
  const isOrder = s?.mode === "order";
  return (
    <Center
      logoUrl={s?.logoUrl}
      alt={s?.restaurantName}
      eyebrow={isOrder ? "ALMOST THERE" : "BILL REQUESTED"}
      title={isOrder ? "Waiting for<br /><em>your order.</em>" : "We are<br /><em>on it.</em>"}
      copy={
        isOrder
          ? "Ask the cashier to send your order to Klown. It appears here the moment they do."
          : "Your bill will appear here once your waiter closes the table."
      }
    >
      <div className="loader" />
      {isOrder ? null : (
        <button className="text-link" onClick={() => dispatch(go("welcome"))}>
          Back to your table
        </button>
      )}
    </Center>
  );
}

function CheckoutHeader({ s, dispatch, title, step, back }: any) {
  return <KzHeader s={s} dispatch={dispatch} title={title} step={step} back={back} />;
}

function TaxBreakdown({ inclusive }: { inclusive: number }) {
  const tb = taxBreakdown(inclusive);
  const rows: [string, number][] = [
    ["Net (excl. tax)", tb.net],
    ["NHIL 2.5%", tb.nhil],
    ["GETFund 2.5%", tb.getfund],
    ["VAT 15%", tb.vat],
    ["Tourism Levy 1%", tb.tourism],
  ];
  return (
    <div className="kz-tax" aria-label="Tax breakdown">
      <div className="kz-tax-title">
        <span>Taxes &amp; levies</span>
        <span>Included</span>
      </div>
      {rows.map(([label, v]) => (
        <div className="kz-row" key={label}>
          <span>{label}</span>
          <span>{pes(v)}</span>
        </div>
      ))}
    </div>
  );
}

export function Bill({ s, dispatch, ready = false, underlay = false }: any) {
  const b = s?.bill;
  const items = b?.items ?? [];
  const count = items.reduce((a: number, i: any) => a + (Number(i.qty) || 0), 0);
  const isOrder = s?.mode === "order";
  return (
    <>
      <section className="bill-screen">
        <CheckoutHeader
          s={s}
          dispatch={dispatch}
          title={isOrder ? "Your order" : "Your bill"}
          step="bill"
          back={isOrder ? (ready ? "bill-ready" : "waiting-bill") : ready ? "bill-ready" : "welcome"}
        />
        <div className="kz-page">
          <div className="kz-bill-hero">
            <span className="kz-status">
              <span className="kz-live-dot" aria-hidden="true" />
              {ready ? "Bill ready" : "Live from POS"}
            </span>
            <span className="kz-bill-hero-label">Total to pay</span>
            <Money value={b?.totalPesewas} className="kz-bill-hero-amount kz-cur-gold" />
            <span className="kz-total-sub">Incl. taxes, levies &amp; service</span>
          </div>

          <h2 className="kz-group-title">
            <span>Your items</span>
            <span className="kz-card-aside">
              {count} {count === 1 ? "item" : "items"}
            </span>
          </h2>
          <div className="kz-card kz-card-list">
            {items.length === 0 ? (
              <p className="kz-empty">No items on this bill yet.</p>
            ) : (
              <ul className="kz-lines">
                {items.map((i: any, n: number) => (
                  <li className="kz-line" key={`${i.name}-${n}`}>
                    <span className="kz-qty">{i.qty}×</span>
                    <span className="kz-line-name">{i.name}</span>
                    <span className="kz-line-price">{pes(i.lineTotalPesewas)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <h2 className="kz-group-title">
            <span>Summary</span>
          </h2>
          <div className="kz-card">
            {!isOrder && (
              <>
                <div className="kz-row">
                  <span>Subtotal</span>
                  <span>{pes(b?.subtotalPesewas)}</span>
                </div>
                <div className="kz-row">
                  <span>Service charge</span>
                  <span>{pes(b?.serviceChargePesewas)}</span>
                </div>
                <TaxBreakdown inclusive={b?.subtotalPesewas ?? b?.totalPesewas ?? 0} />
                <hr className="kz-divider" />
              </>
            )}
            <div className="kz-row is-total">
              <span>Total</span>
              <span>{pes(b?.totalPesewas)}</span>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "center", marginTop: 12 }}>
            <button className="kz-link" onClick={() => dispatch(go("bill-issue"))}>
              <Info aria-hidden="true" />
              Something wrong with the bill?
            </button>
          </div>
        </div>
      </section>
      {!underlay &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="kz-dock">
            {!isOrder && (
              <button className="kz-btn kz-btn-secondary" onClick={() => dispatch(go("split"))}>
                <Users aria-hidden="true" />
                Split
              </button>
            )}
            <button
              className="kz-btn kz-btn-primary kz-btn-split"
              onClick={() =>
                dispatch(
                  isOrder
                    ? go("pay")
                    : { type: "patch-go", value: { shareMode: "full" }, to: "tip" },
                )
              }
            >
              <span>Pay in full</span>
              <span className="kz-btn-amount">{pes(b?.totalPesewas)}</span>
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}

export function FullCheck({ s, dispatch }: any) {
  const b = s?.bill;
  const tb = taxBreakdown(b?.subtotalPesewas ?? b?.totalPesewas ?? 0);
  return (
    <section>
      <Back dispatch={dispatch} to="bill" />
      <p className="eyebrow">FULL CHECK · TABLE 07</p>
      <h1>
        Everything
        <br />
        <em>looks good.</em>
      </h1>
      <div className="receipt-card">
        <BillRow
          name={`Dinner for ${s?.people ?? 2}`}
          qty=""
          price={(b?.subtotalPesewas ?? 0) / 100}
        />
        <BillRow name="Service charge" qty="" price={(b?.serviceChargePesewas ?? 0) / 100} />
        <div className="tax-lines">
          <div className="tax-row">
            <span>Net (excl. tax)</span>
            <span>{pes(tb.net)}</span>
          </div>
          <div className="tax-row">
            <span>NHIL 2.5%</span>
            <span>{pes(tb.nhil)}</span>
          </div>
          <div className="tax-row">
            <span>GETFund 2.5%</span>
            <span>{pes(tb.getfund)}</span>
          </div>
          <div className="tax-row">
            <span>VAT 15%</span>
            <span>{pes(tb.vat)}</span>
          </div>
          <div className="tax-row">
            <span>Tourism Levy 1%</span>
            <span>{pes(tb.tourism)}</span>
          </div>
        </div>
        <div className="grand-total">
          <span>Total</span>
          <b>{pes(b?.totalPesewas)}</b>
        </div>
      </div>
      <Action onClick={() => dispatch(go("recommendation"))}>Continue</Action>
    </section>
  );
}

export function Recommendation({ s, dispatch }: any) {
  const dig = s?.menu?.digital || {};
  const th = s?.menu?.theme || {};
  const plain = th?.layout?.price_style === "plain";
  const fmtP = (p: number | null | undefined) =>
    p == null
      ? ""
      : plain
        ? (p / 100).toLocaleString("en-GH", { maximumFractionDigits: 2 })
        : pes(p);
  const hasRec = !!(dig.rec_name && String(dig.rec_name).trim());
  if (hasRec) {
    return (
      <section>
        <Back dispatch={dispatch} to="full-check" />
        <p className="eyebrow">BEFORE YOU GO</p>
        <h1>
          One last
          <br />
          <em>little thing?</em>
        </h1>
        <div className="recommend-card">
          {dig.rec_image_url ? (
            <img src={dig.rec_image_url} alt={dig.rec_name} onError={imgFallback} />
          ) : null}
          <div>
            <p className="eyebrow">CHEF’S PICK</p>
            <h2>{dig.rec_name}</h2>
            {dig.rec_note ? <p>{dig.rec_note}</p> : null}
            {dig.rec_price_pesewas != null ? <b>{fmtP(dig.rec_price_pesewas)}</b> : null}
          </div>
        </div>
        <Action onClick={() => dispatch(go("pay"))}>Settle the bill</Action>
      </section>
    );
  }
  if (s?.menu?.source === "studio") {
    return (
      <section>
        <Back dispatch={dispatch} to="full-check" />
        <p className="eyebrow">BEFORE YOU GO</p>
        <h1>
          Ready to
          <br />
          <em>settle up?</em>
        </h1>
        <p className="muted">Review your check and pay whenever you’re ready.</p>
        <Action onClick={() => dispatch(go("pay"))}>Settle the bill</Action>
      </section>
    );
  }
  const recs = s?.menu?.recommendations ?? [];
  const rec = recs.find((r: any) => r.kind === "dessert") ?? recs[0];
  const it = rec ? (s?.menu?.items ?? []).find((i: any) => i.id === rec.item_id) : undefined;
  return (
    <section>
      <Back dispatch={dispatch} to="full-check" />
      <p className="eyebrow">BEFORE YOU GO</p>
      <h1>
        One last
        <br />
        <em>little thing?</em>
      </h1>
      <div className="recommend-card">
        <img src={menuImg(it)} alt={it?.name ?? "Chef recommendation"} onError={imgFallback} />
        <div>
          <p className="eyebrow">{(rec?.kind ?? "CHEF").toUpperCase()}</p>
          <h2>{it?.name ?? rec?.title ?? "Chef’s pick"}</h2>
          <p>{rec?.subtitle ?? ""}</p>
          <b>{pes(it?.price_pesewas)}</b>
        </div>
      </div>
      <Action onClick={() => dispatch(go("pay"))}>Settle the bill</Action>
      {it && (
        <button
          className="outline-button"
          onClick={() =>
            dispatch({ type: "patch-go", value: { selectedItem: it, dish: it.name }, to: "dish" })
          }
        >
          View details
        </button>
      )}
    </section>
  );
}

export function Pay({ s, dispatch }: any) {
  const due = s?.quote?.remainingPesewas ?? s?.bill?.totalPesewas ?? 0;
  return (
    <section>
      <Back dispatch={dispatch} to="bill" />
      <p className="eyebrow">SETTLE UP</p>
      <h1>
        How would you
        <br />
        <em>like to pay?</em>
      </h1>
      <div className="pay-total">
        <span>Your share</span>
        <strong>{pes(due)}</strong>
      </div>
      <button
        className="choice"
        onClick={() => dispatch({ type: "patch-go", value: { shareMode: "full" }, to: "tip" })}
      >
        <span className="choice-icon">
          <CreditCard />
        </span>
        <span>
          <b>Pay the full bill</b>
          <small>One simple payment</small>
        </span>
        <ChevronRight />
      </button>
      <button className="choice" onClick={() => dispatch(go("split"))}>
        <span className="choice-icon">
          <Users />
        </span>
        <span>
          <b>Split the bill</b>
          <small>Everyone pays their share</small>
        </span>
        <ChevronRight />
      </button>
    </section>
  );
}

export function Split({ s, dispatch }: any) {
  useSplitScrollLock();
  const due = s?.bill?.totalPesewas ?? s?.quote?.remainingPesewas ?? 0;
  const [mode, setMode] = useState<"even" | "amounts" | "named" | null>(null);
  const [people, setPeople] = useState(Math.max(2, s?.people ?? 2));
  const [custom, setCustom] = useState("");
  const [rows, setRows] = useState<{ label: string; amount: string }[]>([
    { label: "", amount: "" },
    { label: "", amount: "" },
  ]);
  const assigned = rows.reduce((n, r) => n + Math.round((parseFloat(r.amount) || 0) * 100), 0);
  const reconciled = assigned === due && rows.every((r) => (parseFloat(r.amount) || 0) > 0);
  const setRow = (i: number, k: "label" | "amount", v: string) =>
    setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const customPesewas = Math.round((parseFloat(custom) || 0) * 100);
  const validCustom = Number.isFinite(customPesewas) && customPesewas > 0 && customPesewas < due;
  return (
    <div className="split-overlay">
      <div className="split-bill-underlay" aria-hidden="true" inert>
        <Bill s={s} dispatch={dispatch} underlay />
      </div>
      <div className="split-scrim" onClick={() => dispatch(go("bill"))} />
      <section
        className={`split-sheet${mode === "even" ? " split-even-sheet" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={
          mode === "even"
            ? "Divide equally"
            : mode === "amounts"
              ? "Pay a custom amount"
              : "Split the bill"
        }
      >
        <div className="split-sheet-handle" />
        <header className="split-sheet-header">
          <h2>
            {mode === "even"
              ? "Divide equally"
              : mode === "amounts"
                ? "Pay a custom amount"
                : "Split the bill"}
          </h2>
          <button
            className="split-close"
            aria-label="Close split"
            onClick={() => dispatch(go("bill"))}
          >
            <X />
          </button>
        </header>
        <div className="split-sheet-body">
          {!mode && (
            <>
              <p className="split-intro">Choose how you’d like to pay your share.</p>
              <div className="split-options">
                <button onClick={() => dispatch({ type: "split-create", mode: "items" })}>
                  <span className="split-option-icon">
                    <ListChecks aria-hidden="true" />
                  </span>
                  <span>
                    <b>Pay for your items</b>
                    <small>Pick exactly what you had</small>
                  </span>
                  <ChevronRight />
                </button>
                <button onClick={() => setMode("even")}>
                  <span className="split-option-icon">
                    <Users aria-hidden="true" />
                  </span>
                  <span>
                    <b>Divide equally</b>
                    <small>Split evenly across the table</small>
                  </span>
                  <ChevronRight />
                </button>
                <button onClick={() => setMode("amounts")}>
                  <span className="split-option-icon">
                    <Wallet aria-hidden="true" />
                  </span>
                  <span>
                    <b>Pay a custom amount</b>
                    <small>Enter the amount you’d like to pay</small>
                  </span>
                  <ChevronRight />
                </button>
              </div>
              <p className="split-footnote">
                <Info />
                Others at your table can scan the QR to pay their share. Klown keeps track of what’s
                paid.
              </p>
            </>
          )}
          {mode === "even" && (
            <div className="split-even-content">
              <div
                className="split-even-ring"
                aria-label={`Your share is about ${pes(Math.ceil(due / people))} of ${pes(due)}`}
              >
                <svg viewBox="0 0 220 220" aria-hidden="true">
                  <circle className="split-even-track" cx="110" cy="110" r="96" />
                  <circle
                    className="split-even-progress"
                    cx="110"
                    cy="110"
                    r="96"
                    strokeDasharray={`${(2 * Math.PI * 96) / people} ${2 * Math.PI * 96}`}
                  />
                </svg>
                <div>
                  <span>Your share</span>
                  <strong>{pes(Math.ceil(due / people))}</strong>
                </div>
              </div>
              <div className="split-counter">
                <span>People at the table</span>
                <div>
                  <button
                    aria-label="Fewer people"
                    disabled={people <= 2}
                    onClick={() => setPeople(Math.max(2, people - 1))}
                  >
                    <Minus />
                  </button>
                  <strong>{people}</strong>
                  <button aria-label="More people" onClick={() => setPeople(people + 1)}>
                    <Plus />
                  </button>
                </div>
              </div>
              <div className="split-even-breakdown">
                <div>
                  <span>Bill total</span>
                  <b>{pes(due)}</b>
                </div>
                <div>
                  <span>Split between</span>
                  <b>{people} people</b>
                </div>
              </div>
              <div className="split-even-total">
                <span>
                  You pay<small>Excluding any tip</small>
                </span>
                <strong>{pes(Math.ceil(due / people))}</strong>
              </div>
              <div className="split-even-actions">
                <button className="action secondary" onClick={() => setMode(null)}>
                  Remove split
                </button>
                <Action
                  disabled={due <= 0}
                  onClick={() =>
                    due > 0 && dispatch({ type: "split-create", mode: "even", people })
                  }
                >
                  Confirm
                </Action>
              </div>
            </div>
          )}
          {mode === "amounts" && (
            <>
              <p className="split-intro">
                Enter your share. The remainder stays open for the table.
              </p>
              <label className="split-amount-field">
                GH₵{" "}
                <input
                  aria-label="Your amount in cedis"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                />
              </label>
              <div className="split-share">
                <span>Remaining for the table</span>
                <b>{pes(Math.max(0, due - customPesewas))}</b>
              </div>
              <Action
                disabled={!validCustom}
                onClick={() =>
                  validCustom &&
                  dispatch({
                    type: "split-create",
                    mode: "amounts",
                    amounts: [
                      { label: "Your share", amount: customPesewas },
                      { label: "Remaining", amount: due - customPesewas },
                    ],
                  })
                }
              >
                Confirm split
              </Action>
              <button className="split-advanced" onClick={() => setMode("named")}>
                Assign named shares instead
              </button>
            </>
          )}
          {mode === "named" && (
            <>
              <p className="split-intro">
                Assign amounts for everyone at the table. Shares must add up to {pes(due)}.
              </p>
              <div className="amount-rows">
                {rows.map((r, i) => (
                  <div className="amount-row" key={i}>
                    <input
                      aria-label={`Share ${i + 1} name`}
                      placeholder={`Name ${i + 1}`}
                      value={r.label}
                      onChange={(e) => setRow(i, "label", e.target.value)}
                    />
                    <input
                      aria-label={`Share ${i + 1} amount`}
                      placeholder="0.00"
                      inputMode="decimal"
                      value={r.amount}
                      onChange={(e) => setRow(i, "amount", e.target.value)}
                    />
                    {rows.length > 2 && (
                      <button
                        className="row-x"
                        aria-label="Remove share"
                        onClick={() => setRows(rows.filter((_, j) => j !== i))}
                      >
                        <X />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button
                className="text-link"
                onClick={() => setRows([...rows, { label: "", amount: "" }])}
              >
                + Add a share
              </button>
              <div className="split-share">
                <span>Assigned</span>
                <b>
                  {pes(assigned)} / {pes(due)}
                </b>
              </div>
              <Action
                disabled={!reconciled}
                onClick={() =>
                  reconciled &&
                  dispatch({
                    type: "split-create",
                    mode: "amounts",
                    amounts: rows.map((r) => ({
                      label: r.label,
                      amount: Math.round((parseFloat(r.amount) || 0) * 100),
                    })),
                  })
                }
              >
                Confirm split
              </Action>
            </>
          )}
          {s?.splitError && (
            <div className="error">
              <X />
              {s.splitError}
            </div>
          )}
          {mode && mode !== "even" && (
            <button className="split-advanced" onClick={() => setMode(null)}>
              Back to split options
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

// Loader for the split screens — never a dead end: after a few seconds offer a way back.
function SplitLoading({ s, dispatch, eyebrow }: any) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 8000);
    return () => clearTimeout(t);
  }, []);
  const stuck = slow || !!s?.splitError;
  return (
    <Center
      logoUrl={s?.logoUrl}
      alt={s?.restaurantName}
      eyebrow={eyebrow}
      title={s?.splitError ? "Can&rsquo;t split<br /><em>just yet.</em>" : "Setting up<br /><em>the split…</em>"}
      copy={s?.splitError || "One moment."}
    >
      {!s?.splitError && <div className="loader" />}
      {stuck && (
        <Action secondary onClick={() => dispatch({ type: "screen", value: "split" })}>
          Back to split options
        </Action>
      )}
    </Center>
  );
}

export function SplitItems({ s, dispatch }: any) {
  useSplitScrollLock();
  const split = s?.split;
  const base =
    typeof window !== "undefined" ? window.location.origin + window.location.pathname : "";
  const copyInvite = () => {
    try {
      navigator.clipboard?.writeText(base);
    } catch {}
  };
  const waInvite = () => {
    try {
      window.open(
        `https://wa.me/?text=${encodeURIComponent(`Join our bill and pick your items: ${base}`)}`,
        "_blank",
        "noopener",
      );
    } catch {}
  };
  if (!split || split.mode !== "items")
    return <SplitLoading s={s} dispatch={dispatch} eyebrow="SPLIT BY ITEM" />;
  const items = split.items ?? [];
  const myId = split.myShareId ?? null;
  const myAmount = split.myShareAmountPesewas ?? 0;
  const total = split.totalPesewas ?? 0;
  const paid = split.paidPesewas ?? 0;
  const unassigned = split.unassignedPesewas ?? 0;
  const iPaid = (split.shares ?? []).some((sh: any) => sh.mine && sh.status === "paid");
  const done = total > 0 && paid >= total;
  const myUnitsOn = (it: any) => it.takers.find((t: any) => t.shareId === myId)?.units ?? 0;
  const pickedCount = items.reduce((count: number, it: any) => count + myUnitsOn(it), 0);
  return (
    <div className="split-overlay">
      <div className="split-bill-underlay" aria-hidden="true" inert>
        <Bill s={s} dispatch={dispatch} underlay />
      </div>
      <div className="split-scrim" onClick={() => dispatch(go("bill"))} />
      <section
        className="split-sheet split-items-stage"
        role="dialog"
        aria-modal="true"
        aria-label="Pay for your items"
      >
        <div className="split-sheet-handle" />
        <header className="split-sheet-header">
          <h2>Pay for your items</h2>
          <button
            className="split-close"
            aria-label="Close item split"
            onClick={() => dispatch(go("bill"))}
          >
            <X />
          </button>
        </header>
        <div className="item-board">
          {items.map((it: any) => {
            const mine = myUnitsOn(it);
            const others = it.takers.filter((t: any) => t.shareId !== myId);
            const canAdd = it.unitsFree > 0 && !iPaid;
            const soldOut = it.unitsFree <= 0 && mine === 0;
            return (
              <div className={`item-row${soldOut ? " dim" : ""}`} key={it.billItemId}>
                <div className="item-main">
                  <strong>
                    {it.name}
                    {it.qty > 1 ? ` · ${it.qty} available` : ""}
                  </strong>
                  {others.length > 0 && (
                    <small>
                      {others
                        .map(
                          (t: any) =>
                            `${t.name}${t.units > 1 ? ` ×${t.units}` : ""}${t.paid ? " ✓" : ""}`,
                        )
                        .join(", ")}
                    </small>
                  )}
                </div>
                <b className="item-price">
                  {pes(it.qty > 0 ? Math.round(it.lineTotalPesewas / it.qty) : it.lineTotalPesewas)}
                </b>
                <div className="item-step">
                  {mine > 0 && (
                    <button
                      aria-label={`Remove one ${it.name}`}
                      disabled={iPaid}
                      onClick={() =>
                        dispatch({
                          type: "split-assign",
                          billItemId: it.billItemId,
                          units: mine - 1,
                        })
                      }
                    >
                      <Minus />
                    </button>
                  )}
                  {mine > 0 && <strong>{mine}</strong>}
                  <button
                    aria-label={`Add one ${it.name}`}
                    disabled={!canAdd}
                    onClick={() =>
                      dispatch({ type: "split-assign", billItemId: it.billItemId, units: mine + 1 })
                    }
                  >
                    <Plus />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <div className="item-summary">
          <div>
            <span>Your items ({pickedCount})</span>
            <b>{pes(myAmount)}</b>
          </div>
          <div className="item-summary-total">
            <strong>You pay</strong>
            <strong>{pes(myAmount)}</strong>
          </div>
        </div>
        <div className="split-progress">
          <span>
            {pes(paid)} of {pes(total)} settled
            {unassigned > 0 ? ` · ${pes(unassigned)} unassigned` : ""}
          </span>
          <div className="bar">
            <i
              style={{ width: `${total ? Math.min(100, Math.round((paid / total) * 100)) : 0}%` }}
            />
          </div>
        </div>
        {unassigned > 0 && !iPaid && (
          <button className="text-link" onClick={() => dispatch({ type: "assign-remaining" })}>
            I&apos;ll cover the rest
          </button>
        )}
        {s?.splitError && (
          <div className="error">
            <X />
            {s.splitError}
          </div>
        )}
        {done ? (
          <div className="notice-card">
            <Check />
            <span>Every item is in — thank you.</span>
          </div>
        ) : iPaid ? (
          <div className="notice-card">
            <Check />
            <span>Your part is paid. Waiting on the rest of the table.</span>
          </div>
        ) : (
          <Action
            disabled={myAmount <= 0 || !!s?.splitError || !!s?.pendingConfirm}
            onClick={() => {
              if (myAmount > 0)
                dispatch({ type: "patch-go", value: { claimedShareId: myId ?? "__local_pending__" }, to: "tip" });
            }}
          >
            {s?.pendingConfirm
              ? "Getting your share ready…"
              : myAmount > 0
                ? `Confirm · ${pes(myAmount)}`
                : "Pick an item to pay"}
          </Action>
        )}
        <div className="split-actions">
          <button className="text-link" onClick={copyInvite}>
            Copy table link
          </button>
          <button className="text-link" onClick={waInvite}>
            Invite on WhatsApp
          </button>
        </div>
      </section>
    </div>
  );
}

export function SplitLobby({ s, dispatch }: any) {
  const split = s?.split;
  const base =
    typeof window !== "undefined" ? window.location.origin + window.location.pathname : "";
  const invite = (tok: string) => `${base}?claim=${tok}`;
  const copyInvite = (tok: string) => {
    try {
      navigator.clipboard?.writeText(invite(tok));
    } catch {}
  };
  const waInvite = (tok: string, amt: number) => {
    try {
      window.open(
        `https://wa.me/?text=${encodeURIComponent(`Your share of the bill is ${pes(amt)}. Tap to pay: ${invite(tok)}`)}`,
        "_blank",
        "noopener",
      );
    } catch {}
  };
  if (!split) return <SplitLoading s={s} dispatch={dispatch} eyebrow="SPLIT" />;
  const paid = split.paidPesewas ?? 0,
    total = split.totalPesewas ?? 0;
  const done = total > 0 && paid >= total;
  return (
    <section>
      <Back dispatch={dispatch} to="pay" />
      <p className="eyebrow">SPLIT THE BILL · TABLE {s?.tableLabel ?? ""}</p>
      <h1>
        Everyone pays
        <br />
        <em>their share.</em>
      </h1>
      <div className="split-lobby">
        {(split.shares ?? []).map((sh: any) => (
          <div className={`share-row ${sh.status}`} key={sh.id}>
            <span className="share-name">
              {sh.claimedByName || sh.label}
              <small>
                {sh.status === "paid"
                  ? "Paid"
                  : sh.status === "claimed"
                    ? sh.mine
                      ? "You"
                      : "Claimed"
                    : "Open"}
              </small>
            </span>
            <b>{pes(sh.amountPesewas)}</b>
            <div className="share-actions">
              {sh.status === "unclaimed" && (
                <button onClick={() => dispatch({ type: "split-claim", shareId: sh.id })}>
                  Claim
                </button>
              )}
              {sh.status === "unclaimed" && (
                <button className="ghost" onClick={() => copyInvite(sh.shareToken)}>
                  Invite
                </button>
              )}
              {sh.status === "claimed" && sh.mine && (
                <button
                  onClick={() =>
                    dispatch({ type: "patch-go", value: { claimedShareId: sh.id }, to: "tip" })
                  }
                >
                  Pay
                </button>
              )}
              {sh.status === "claimed" && sh.mine && (
                <button
                  className="ghost"
                  onClick={() => dispatch({ type: "split-release", shareId: sh.id })}
                >
                  Release
                </button>
              )}
              {sh.status === "claimed" && !sh.mine && (
                <button className="ghost" onClick={() => waInvite(sh.shareToken, sh.amountPesewas)}>
                  Remind
                </button>
              )}
              {sh.status === "paid" && <Check />}
            </div>
          </div>
        ))}
      </div>
      <div className="split-progress">
        <span>
          {pes(paid)} of {pes(total)} settled
        </span>
        <div className="bar">
          <i style={{ width: `${total ? Math.min(100, Math.round((paid / total) * 100)) : 0}%` }} />
        </div>
      </div>
      {done && (
        <div className="notice-card">
          <Check />
          <span>Every share is in — thank you.</span>
        </div>
      )}
    </section>
  );
}

export function Tip({ s, dispatch }: any) {
  const share = s?.claimedShareId
    ? ((s?.split?.mode === "items"
        ? s?.split?.myShareAmountPesewas
        : s?.split?.shares?.find((sh: any) => sh.id === s.claimedShareId)?.amountPesewas) ??
      s?.quote?.sharePesewas ??
      0)
    : (s?.quote?.remainingPesewas ?? s?.bill?.totalPesewas ?? 0);
  const chosen = s?.tipPercent ?? 10;
  const tip = Math.round((share * chosen) / 100);
  const server = (s?.bill?.serverName || "").toString().trim();
  return (
    <section className="payment-stage tip-screen">
      <CheckoutHeader
        s={s}
        dispatch={dispatch}
        title="Leave a tip"
        step="tip"
        back={
          s?.claimedShareId ? (s?.split?.mode === "items" ? "split-items" : "split-lobby") : "bill"
        }
      />
      <div className="kz-page">
        <div className="kz-card kz-tip-hero">
          <div className="kz-tip-heart">
            <Heart aria-hidden="true" />
          </div>
          <h2 className="kz-tip-title text-balance">Say thanks to {server || "your team"}</h2>
          <p className="kz-tip-copy text-pretty">
            100% goes to{" "}
            <strong>{server || `the ${s?.restaurantName || "restaurant"} team`}</strong>
            {server ? " and the team" : ""}, who looked after you today.
          </p>
          <Money value={tip} className="kz-tip-amount" />
          <span className={`kz-tip-note ${chosen ? "" : "is-empty"}`}>
            {chosen === 0
              ? "No tip added"
              : chosen >= 15
                ? "A total legend, huge thanks!"
                : chosen >= 12.5
                  ? "Very generous, thank you!"
                  : "Thank you!"}
          </span>

          <div className="kz-tip-options" role="group" aria-label="Tip amount">
            {[10, 12.5, 15].map((n) => (
              <button
                type="button"
                key={n}
                className={`kz-tip-option ${n === chosen ? "is-selected" : ""}`}
                aria-pressed={n === chosen}
                onClick={() => dispatch({ type: "patch", value: { tipPercent: n } })}
              >
                <strong>{n}%</strong>
                <small>{pes(Math.round((share * n) / 100))}</small>
                {n === 12.5 && <span className="kz-tip-badge">Popular</span>}
              </button>
            ))}
          </div>
          <button
            type="button"
            className={`kz-tip-skip ${chosen === 0 ? "is-selected" : ""}`}
            aria-pressed={chosen === 0}
            onClick={() => dispatch({ type: "patch", value: { tipPercent: 0 } })}
          >
            {chosen === 0 ? "No tip selected" : "Continue without a tip"}
          </button>
        </div>

        <h2 className="kz-group-title">
          <span>Summary</span>
        </h2>
        <div className="kz-card">
          <div className="kz-row">
            <span>{s?.claimedShareId ? "Your share" : "Bill amount"}</span>
            <span>{pes(share)}</span>
          </div>
          <div className="kz-row">
            <span>Tip ({chosen}%)</span>
            <span>{pes(tip)}</span>
          </div>
          <hr className="kz-divider" />
          <div className="kz-row is-total">
            <span>Total</span>
            <span>{pes(share + tip)}</span>
          </div>
        </div>
      </div>
      {typeof document !== "undefined" &&
        createPortal(
          <div className="kz-dock">
            <button
              type="button"
              className="kz-btn kz-btn-primary kz-btn-split"
              onClick={() => dispatch(go("review"))}
            >
              <span>Review &amp; pay</span>
              <span>{pes(share + tip)}</span>
            </button>
          </div>,
          document.body,
        )}
    </section>
  );
}

export function Review({ s, dispatch }: any) {
  const q = s?.quote;
  const share = q?.sharePesewas ?? 0;
  const tipPct = s?.tipPercent ?? 10;
  const tip = Math.round((share * tipPct) / 100);
  const grand = share + tip;
  return (
    <section className="payment-stage">
      <CheckoutHeader s={s} dispatch={dispatch} title="Review & pay" step="pay" back="tip" />
      <div className="kz-page">
        <div className="kz-bill-hero">
          <span className="kz-bill-hero-label">You pay</span>
          <Money value={grand} className="kz-bill-hero-amount" />
          <span className="kz-total-sub">{s?.restaurantName || "Restaurant"}</span>
        </div>

        <h2 className="kz-group-title">
          <span>Payment summary</span>
        </h2>
        <div className="kz-card">
          <div className="kz-row">
            <span>Your share{s?.claimedShareId ? " · split" : ""}</span>
            <span>{pes(share)}</span>
          </div>
          <div className="kz-row">
            <span>
              Tip · {tipPct}%{" "}
              <button type="button" className="kz-inline-link" onClick={() => dispatch(go("tip"))}>
                Edit
              </button>
            </span>
            <span>{pes(tip)}</span>
          </div>
          <hr className="kz-divider" />
          <div className="kz-row is-total">
            <span>You pay</span>
            <span>{pes(grand)}</span>
          </div>
        </div>
        <p className="kz-secure-note">
          <ShieldCheck aria-hidden="true" />
          Payments are encrypted and processed securely
        </p>
      </div>
      <Action disabled={!q} onClick={() => dispatch(go("method"))}>
        Choose payment method · {pes(grand)}
      </Action>
    </section>
  );
}

export function Method({ s, dispatch }: any) {
  const [applePay, setApplePay] = useState(false);
  const [selected, setSelected] = useState<"momo" | "card" | "applepay">("momo");
  useEffect(() => {
    try {
      const A = (window as any).ApplePaySession;
      setApplePay(!!A && A.canMakePayments());
    } catch {
      setApplePay(false);
    }
  }, []);
  const momoOption = {
    id: "momo" as const,
    name: "Mobile Money",
    detail: "MTN MoMo · Telecel · AirtelTigo",
    icon: <Smartphone />,
  };
  const options = [
    ...(applePay
      ? [
          {
            id: "applepay" as const,
            name: "Apple Pay",
            detail: "Confirm with Face ID or Touch ID",
            icon: <FaApple />,
          },
        ]
      : []),
    momoOption,
    {
      id: "card" as const,
      name: "Credit / Debit Card",
      detail: "Visa · Mastercard",
      icon: <CreditCard />,
    },
  ];
  const active = options.find((option) => option.id === selected) ?? momoOption;
  const confirm = () =>
    dispatch({
      type: "patch-go",
      value: { method: active.id },
      to: active.id === "momo" ? "momo" : "processing",
    });
  const share = s?.quote?.sharePesewas ?? 0;
  const grand = share + Math.round((share * (s?.tipPercent ?? 10)) / 100);
  return (
    <section className="method-screen">
      <CheckoutHeader s={s} dispatch={dispatch} title="Payment" step="pay" back="review" />
      <div className="kz-bill-hero">
        <span className="kz-bill-hero-label">You pay</span>
        <Money value={grand} className="kz-bill-hero-amount" />
      </div>
      <h2 className="kz-group-title">
        <span>Payment method</span>
      </h2>
      <div className="method-options" role="radiogroup" aria-label="Payment method">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={active.id === option.id}
            className={`method-option${active.id === option.id ? " selected" : ""}`}
            onClick={() => setSelected(option.id)}
          >
            <span className={`method-icon method-icon-${option.id}`}>{option.icon}</span>
            <span className="method-option-copy">
              <b>{option.name}</b>
              <small>{option.detail}</small>
            </span>
            <span className="method-radio" aria-hidden="true">
              {active.id === option.id && <Check />}
            </span>
          </button>
        ))}
      </div>
      <Action onClick={confirm}>
        <span className="method-action-content">
          <span className="method-action-icon">{active.icon}</span>
          <span className="method-action-label">
            <b>{active.id === "momo" ? "Continue with Mobile Money" : "Confirm payment"}</b>
            <small>{active.name}</small>
          </span>
          <strong className="method-action-amount">{pes(grand)}</strong>
        </span>
      </Action>
    </section>
  );
}

export function Momo({ s, dispatch, error = false }: any) {
  const [number, setNumber] = useState("");
  return (
    <section className="momo-screen">
      <CheckoutHeader s={s} dispatch={dispatch} title="Mobile Money" step="pay" back="method" />
      <h1>
        Enter your
        <br />
        <em>number.</em>
      </h1>
      <p className="muted">
        This number is only used to send the payment prompt. We will not save it.
      </p>
      {error && (
        <div className="error">
          <X />
          Payment didn&apos;t go through. Check your balance and try again.
          <div className="error-actions">
            <button onClick={() => dispatch(go("authorise"))}>Retry payment</button>
            <button onClick={() => dispatch(go("method"))}>Change method</button>
          </div>
        </div>
      )}
      <label className="field-label">
        Mobile number
        <input
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          placeholder="024 000 0000"
          inputMode="tel"
        />
      </label>
      <Action
        onClick={() =>
          dispatch(
            number
              ? { type: "patch-go", value: { momoNumber: number, method: "momo" }, to: "authorise" }
              : { type: "error" },
          )
        }
      >
        Continue
      </Action>
    </section>
  );
}

export function PaymentOtp({ s, dispatch }: any) {
  const [otp, setOtp] = useState("");
  return (
    <section>
      <CheckoutHeader
        s={s}
        dispatch={dispatch}
        title="Card verification"
        step="pay"
        back="method"
      />
      <h1>
        Check your
        <br />
        <em>messages.</em>
      </h1>
      <p className="muted">
        Enter the one-time code from your bank to continue. This is only for this payment.
      </p>
      <input
        className="otp"
        value={otp}
        onChange={(e) => setOtp(e.target.value)}
        placeholder="123456"
        inputMode="numeric"
        aria-label="Payment verification code"
      />
      <Action onClick={() => dispatch({ type: "pay-otp", value: { otp } })}>Verify payment</Action>
    </section>
  );
}

export function Authorise({ s, dispatch }: any) {
  return (
    <Center
      logoUrl={s?.logoUrl}
      alt={s?.restaurantName}
      eyebrow="CHECK YOUR PHONE"
      title={"Approve the<br /><em>payment.</em>"}
      copy={`A prompt is waiting on your mobile money phone. Enter your PIN to approve ${pes(s?.quote?.grandTotalPesewas)}.`}
      icon="M"
    >
      <Action onClick={() => dispatch(go("processing"))}>I&apos;ve approved it</Action>
      <button className="text-link" onClick={() => dispatch(go("momo"))}>
        Use a different number
      </button>
    </Center>
  );
}

export function Processing({ s, dispatch }: any) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 20000);
    return () => clearTimeout(t);
  }, []);
  return (
    <Center
      logoUrl={s?.logoUrl}
      alt={s?.restaurantName}
      eyebrow="SECURE PAYMENT"
      title={"Making it<br /><em>official.</em>"}
      copy={
        s?.method === "card" || s?.method === "applepay"
          ? "Confirming your payment with your bank..."
          : "Confirming your payment with mobile money..."
      }
    >
      <div className="loader large" />
      {slow && (
        <div className="processing-help">
          <p className="muted">
            Approve the prompt on your phone to finish. Didn&apos;t get one, or changed your mind?
          </p>
          <button
            className="text-link"
            onClick={() =>
              dispatch({
                type: "patch-go",
                value: { failureReason: "The mobile money prompt was not approved in time." },
                to: "payment-error",
              })
            }
          >
            It didn&apos;t go through
          </button>
        </div>
      )}
    </Center>
  );
}

export function Success({ s, dispatch }: any) {
  const share = s?.quote?.sharePesewas ?? 0;
  const tip = Math.round((share * (s?.tipPercent ?? 10)) / 100);
  const paid = share + tip;
  const name = s?.restaurantName || "the restaurant";
  const rating: number = s?.rating ?? 0;
  const [showSummary, setShowSummary] = useState(false);
  const isShare = Boolean(s?.claimedShareId);
  const reviewUrl =
    s?.reviewUrl ||
    `https://www.google.com/search?q=${encodeURIComponent(`${s?.restaurantName || ""} reviews`)}`;
  const ratingCopy = ["Tap a star to rate your visit", "Sorry it wasn't great", "Thanks for the honesty", "Glad it was good", "Great — thank you!", "Amazing — thank you!"][rating];
  return (
    <section className="payment-stage kz-success">
      <div className="kz-page">
        <div className="kz-success-top">
          <span className="kz-success-pill">
            <CheckCircle2 aria-hidden="true" />
            Payment successful
          </span>
          {s?.tableLabel && <span className="kz-success-table">{`Table ${s.tableLabel}`}</span>}
        </div>
        <div className="kz-success-amount">
          <Money value={paid} className="kz-bill-hero-amount" />
        </div>

        <button
          type="button"
          className="kz-success-card"
          aria-expanded={showSummary}
          onClick={() => setShowSummary((v) => !v)}
        >
          <span className="kz-success-icon">
            <ReceiptText aria-hidden="true" />
          </span>
          <span className="kz-success-card-text">
            <strong>{isShare ? "Your share is paid" : "The table is fully paid"}</strong>
            <span>{`Thanks for dining at ${name}`}</span>
          </span>
          <ChevronDown aria-hidden="true" className={showSummary ? "kz-chev is-open" : "kz-chev"} />
        </button>

        {showSummary && (
          <div className="kz-card">
            <div className="kz-row">
              <span>{isShare ? "Your share" : "Bill amount"}</span>
              <span>{pes(share)}</span>
            </div>
            <div className="kz-row">
              <span>Tip · {s?.tipPercent ?? 10}%</span>
              <span>{pes(tip)}</span>
            </div>
            <hr className="kz-divider" />
            <div className="kz-row is-total">
              <span>Total paid</span>
              <span>{pes(paid)}</span>
            </div>
          </div>
        )}

        <div className="kz-card kz-rate">
          <div className="kz-rate-head">
            <div>
              <strong>{rating >= 4 ? `${rating}-star — thank you!` : "How was your visit?"}</strong>
              <span>{rating >= 4 ? "Would you say it on Google too?" : `Rate ${name}`}</span>
            </div>
            {rating > 0 && (
              <span className="kz-rate-badge">
                <Star aria-hidden="true" />
                {rating}
              </span>
            )}
          </div>
          <div className="kz-rate-stars" role="radiogroup" aria-label="Rate your visit">
            {[1, 2, 3, 4, 5].map((i) => (
              <button
                key={i}
                type="button"
                role="radio"
                aria-checked={rating === i}
                aria-label={`${i} star${i > 1 ? "s" : ""}`}
                className={i <= rating ? "is-on" : undefined}
                onClick={() => dispatch({ type: "feedback", value: { rating: i } })}
              >
                <Star aria-hidden="true" />
              </button>
            ))}
          </div>
          <p className="kz-rate-copy">{ratingCopy}</p>
          {rating >= 4 && (
            <a className="kz-google-btn" href={reviewUrl} target="_blank" rel="noopener noreferrer">
              <span className="kz-google-g" aria-hidden="true">G</span>
              Post it on Google
            </a>
          )}
          {rating > 0 && rating < 4 && (
            <p className="kz-rate-note">Thanks — we&apos;ve shared this privately with the team.</p>
          )}
        </div>

        <div className="kz-success-actions">
          <button type="button" className="kz-pill-btn" onClick={() => dispatch(go("receipt-choice"))}>
            <ReceiptText aria-hidden="true" />
            View receipt
          </button>
          <button type="button" className="kz-pill-btn" onClick={() => setShowSummary((v) => !v)}>
            <ListChecks aria-hidden="true" />
            Order summary
          </button>
        </div>
      </div>
      <Action onClick={() => dispatch(go("complete"))}>Done</Action>
    </section>
  );
}

export function DownloadReceiptButton({ s }: any) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | undefined>(undefined);
  const onClick = () => {
    if (busy) return;
    setErr(undefined);
    setBusy(true);
    fetch("/api/public/receipt-pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionToken: s?.sessionToken }),
    })
      .then((r) => r.json())
      .catch(() => null)
      .then((r) => {
        setBusy(false);
        if (r?.ok && r.url) {
          // A new tab is nicer on desktop, but mobile / in-app browsers routinely block a
          // deferred popup — so fall back to navigating this tab, which always opens the PDF.
          const w = typeof window !== "undefined" ? window.open(r.url, "_blank", "noopener") : null;
          if (!w && typeof window !== "undefined") window.location.href = r.url;
        } else setErr("Could not prepare the receipt. Please try again.");
      });
  };
  return (
    <>
      <button className="outline-button" onClick={onClick} disabled={busy}>
        {busy ? "Preparing receipt…" : "Download / print receipt"}
      </button>
      {err && <p className="muted receipt-error">{err}</p>}
    </>
  );
}

export function ReceiptChoice({ s, dispatch }: any) {
  const [name, setName] = useState(s?.firstName ?? "");
  const [phone, setPhone] = useState(s?.phone ?? s?.momoNumber ?? "");
  const submit = () => {
    dispatch({ type: "rewards-consent", value: { phone, firstName: name.trim() || undefined } });
  };
  const canContinue = phone.trim().length > 0;
  return (
    <section>
      <p className="eyebrow">
        {(s?.restaurantName || "").toUpperCase()} · RECEIPT {s?.receiptNumber ?? "#2841"}
      </p>
      <h1>
        Need a <em>receipt?</em>
      </h1>
      <p className="muted">Enter your number to download your receipt and earn rewards.</p>
      <div className="receipt-card">
        <div className="receipt-head">
          <span>{s?.restaurantName || ""}</span>
          <b>PAID</b>
        </div>
        <div className="grand-total">
          <span>Total paid</span>
          <b>{money((s?.totalPaidPesewas ?? 38115) / 100)}</b>
        </div>
      </div>
      <label className="field-label">
        First name (optional)
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ama" />
      </label>
      <label className="field-label">
        Phone number
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="024 000 0000"
          inputMode="tel"
        />
      </label>
      <Action
        onClick={submit}
        disabled={!canContinue}
        style={{ opacity: canContinue ? 1 : 0.55, cursor: canContinue ? "pointer" : "not-allowed" }}
      >
        Continue
      </Action>
      <button className="text-link" onClick={() => dispatch(go("guest-receipt"))}>
        Skip
      </button>
    </section>
  );
}

export function Phone({ s, dispatch }: any) {
  const [phone, setPhone] = useState(s?.phone ?? "");
  const [err, setErr] = useState(false);
  const submit = () => {
    if (phone.replace(/\D/g, "").length < 9) {
      setErr(true);
      return;
    }
    dispatch({ type: "patch-go", value: { phone }, to: "name" });
  };
  return (
    <section>
      <Back dispatch={dispatch} to="receipt-choice" />
      <p className="eyebrow">OPTIONAL · REWARDS</p>
      <h1>
        Save your
        <br />
        <em>rewards.</em>
      </h1>
      <p className="muted">
        Add your phone number to save this receipt and collect {s?.restaurantName || ""} rewards. No
        account or sign-in needed.
      </p>
      <label className="field-label">
        Phone number
        <input
          value={phone}
          onChange={(e) => {
            setPhone(e.target.value);
            setErr(false);
          }}
          placeholder="024 000 0000"
          inputMode="tel"
        />
      </label>
      {err && (
        <p className="muted" style={{ color: "#c0392b" }}>
          Enter a valid phone number.
        </p>
      )}
      <Action onClick={submit}>Save &amp; earn rewards</Action>
    </section>
  );
}

export function OtpRewards({ dispatch }: any) {
  const [code, setCode] = useState("");
  return (
    <section>
      <Back dispatch={dispatch} to="phone" />
      <p className="eyebrow">VERIFY YOUR NUMBER</p>
      <h1>
        Check your
        <br />
        <em>messages.</em>
      </h1>
      <p className="muted">Enter the six-digit demo code sent to your phone.</p>
      <input
        className="otp"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="123456"
        inputMode="numeric"
      />
      <Action onClick={() => dispatch({ type: "otp-verify", value: { code } })}>
        Verify number
      </Action>
    </section>
  );
}

export function Name({ s, dispatch }: any) {
  const [name, setName] = useState("");
  return (
    <section>
      <Back dispatch={dispatch} to="phone" />
      <p className="eyebrow">OPTIONAL</p>
      <h1>
        One name,
        <br />
        <em>if you like.</em>
      </h1>
      <p className="muted">
        Personalise your next {s?.restaurantName || ""} visit. You can skip this.
      </p>
      <label className="field-label">
        Your name
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ama" />
      </label>
      <Action onClick={() => dispatch({ type: "rewards-consent", value: { firstName: name } })}>
        Save rewards
      </Action>
      <button
        className="outline-button"
        onClick={() => dispatch({ type: "rewards-consent", value: {} })}
      >
        Skip for now
      </button>
    </section>
  );
}

export function Rewards({ s, dispatch }: any) {
  return (
    <Center
      logoUrl={s?.logoUrl}
      alt={s?.restaurantName}
      eyebrow="REWARDS SAVED"
      title={"See you<br /><em>again.</em>"}
      copy={`Your receipt is saved and 120 ${s?.restaurantName || ""} points have been added.`}
      icon="★"
    >
      <Action onClick={() => dispatch(go("feedback"))}>Share feedback</Action>
    </Center>
  );
}

export function GuestReceipt({ s, dispatch }: any) {
  return (
    <section>
      <p className="eyebrow">RECEIPT · {s?.receiptNumber ?? "#2841"}</p>
      <h1>
        All <em>done.</em>
      </h1>
      <div className="receipt-card">
        <div className="receipt-head">
          <span>{s?.restaurantName || ""}</span>
          <b>PAID</b>
        </div>
        <p>Your receipt is available for this session.</p>
        <div className="grand-total">
          <span>Total paid</span>
          <b>{money((s?.totalPaidPesewas ?? 38115) / 100)}</b>
        </div>
      </div>
      <DownloadReceiptButton s={s} />
      <Action onClick={() => dispatch(go("review-handoff"))}>Continue</Action>
    </section>
  );
}

export function Feedback({ s, dispatch }: any) {
  return <ReviewHandoff s={s} dispatch={dispatch} />;
}

export function ReviewHandoff({ s, dispatch }: any) {
  const rating = s?.rating ?? 0;
  return (
    <section className="center-screen">
      <Heart className="heart" />
      <p className="eyebrow">ONE LAST THING</p>
      <h1>
        How was your
        <br />
        <em>{s?.restaurantName || "your"} moment?</em>
      </h1>
      <div className="stars">
        {[1, 2, 3, 4, 5].map((i) => (
          <button
            key={i}
            aria-label={`${i} star`}
            style={{ opacity: rating && i > rating ? 0.3 : 1 }}
            onClick={() => dispatch({ type: "feedback", value: { rating: i } })}
          >
            <Star />
          </button>
        ))}
      </div>
      <p className="muted">
        {rating ? "Thanks — your rating is saved." : "Tap a star to share how it felt."}
      </p>
      {s?.reviewUrl && (
        <Action
          secondary
          onClick={() => {
            try {
              window.open(s.reviewUrl, "_blank", "noopener");
            } catch {}
          }}
        >
          Leave a Google review
        </Action>
      )}
      <Action onClick={() => dispatch(go("complete"))}>Done</Action>
    </section>
  );
}

export function Complete({ s, dispatch }: any) {
  return (
    <Center
      logoUrl={s?.logoUrl}
      alt={s?.restaurantName}
      eyebrow="THANK YOU"
      title={"Until the<br /><em>next one.</em>"}
      copy="Your feedback helps us make every table feel closer."
    >
      <button className="demo-control" onClick={() => dispatch({ type: "reset" })}>
        <RotateCcw />
        Start again
      </button>
    </Center>
  );
}

export function SplitShare({ s, dispatch }: any) {
  return (
    <section>
      <Back dispatch={dispatch} to="split" />
      <p className="eyebrow">YOUR SHARE</p>
      <h1>
        That&apos;s <em>fair.</em>
      </h1>
      <div className="pay-total">
        <span>{s?.people ?? 2} people splitting</span>
        <strong>{pes(s?.quote?.sharePesewas)}</strong>
      </div>
      <Action onClick={() => dispatch(go("tip"))}>Continue</Action>
    </section>
  );
}

export function Handoff({ dispatch }: any) {
  return (
    <div className="review-page">
      <header>
        <p className="eyebrow">KLOWN PAY · UX HANDOFF</p>
        <h1>
          Thirty-five screens.
          <br />
          <em>One closer table.</em>
        </h1>
        <p className="muted">
          A presentation-layer prototype for Claude implementation. Every state is simulated
          locally.
        </p>
      </header>
      <div className="handoff-grid">
        <section>
          <h2>Flow map</h2>
          <p>
            QR arrival → menu or bill → assistance → check → recommendation → split/full pay → MoMo
            → receipt → rewards → feedback.
          </p>
          <div className="flow-lines">
            {[
              "Journey A · No order yet",
              "Journey B · Bill available",
              "Post-payment · Rewards or guest",
            ].map((x, i) => (
              <button
                key={x}
                onClick={() => {
                  window.location.hash = "";
                  dispatch(go(i === 0 ? "empty" : i === 1 ? "bill" : "receipt-choice"));
                }}
              >
                {x}
                <ChevronRight />
              </button>
            ))}
          </div>
        </section>
        <section>
          <h2>Design system</h2>
          <div className="token-row">
            <span className="token swatch-brand" />
            Ink / #181816
          </div>
          <div className="token-row">
            <span className="token swatch-accent" />
            Kozo yellow / #cfb37b
          </div>
          <div className="token-row">
            <span className="token swatch-bg" />
            Light gray / #F2F3F5
          </div>
          <p className="handoff-copy">
            Typography uses a crisp sans for utility and an editorial serif italic for emotional
            moments. Actions are full-width, sticky in the mobile safe area, and limited to one
            primary CTA.
          </p>
        </section>
      </div>
      <h2>Screen inventory</h2>
      <div className="inventory">
        {screens.map(([id, name, section, entry, primary, next]) => (
          <button
            key={id}
            onClick={() => {
              window.location.hash = "";
              dispatch(go(id));
            }}
          >
            <span>{name}</span>
            <small>
              {section} · {entry}
            </small>
            <b>
              {primary} → {next}
            </b>
          </button>
        ))}
      </div>
    </div>
  );
}

export function BillIssue({ s, dispatch }: any) {
  const reasons = [
    "An item looks wrong",
    "I was charged twice",
    "This isn't our table's bill",
    "Something else",
  ];
  return (
    <section>
      <Back dispatch={dispatch} to="bill" />
      <p className="eyebrow">BILL SUPPORT</p>
      <h1>
        What looks
        <br />
        <em>off?</em>
      </h1>
      <p className="muted">
        Tell us what to check and a {s?.restaurantName || ""} team member will come over. Your bill
        is never changed from your phone.
      </p>
      <div className="sheet-options">
        {reasons.map((r) => (
          <button key={r} onClick={() => dispatch({ type: "dispute", note: r })}>
            <Info />
            <span>
              <b>{r}</b>
            </span>
            <ChevronRight />
          </button>
        ))}
      </div>
    </section>
  );
}

export function PaymentError({ s, dispatch }: any) {
  const isCard = s?.method === "card" || s?.method === "applepay";
  const reason = (s?.failureReason || "").toString().trim();
  const retryTo = isCard ? "processing" : "momo";
  return (
    <section>
      <Back dispatch={dispatch} to="method" />
      <p className="eyebrow">{isCard ? "BANK CARD" : "MOBILE MONEY"} · PAYMENT</p>
      <h1>
        Payment
        <br />
        <em>didn&apos;t go through.</em>
      </h1>
      <p className="muted">
        {isCard
          ? "Your card wasn\u2019t charged. This can happen if the card was declined, the details didn\u2019t match, or the payment page closed before it finished."
          : "No money left your account. Check your mobile-money balance and that you approved the prompt, then try again."}
      </p>
      {reason && (
        <div className="error">
          <X />
          {reason}
        </div>
      )}
      <Action
        onClick={() =>
          dispatch({
            type: "patch-go",
            value: { paymentRef: undefined, failureReason: undefined },
            to: retryTo,
          })
        }
      >
        Try again
      </Action>
      <button
        className="text-link"
        onClick={() =>
          dispatch({
            type: "patch-go",
            value: { paymentRef: undefined, failureReason: undefined },
            to: "method",
          })
        }
      >
        Choose another method
      </button>
    </section>
  );
}

export const map: Record<string, any> = {
  connect: Connect,
  welcome: Welcome,
  empty: Empty,
  menu: Menu,
  category: Category,
  dish: Dish,
  waiter: Waiter,
  "waiter-notified": WaiterNotified,
  "waiting-bill": WaitingBill,
  "bill-ready": (p: any) => <Bill {...p} ready />,
  bill: Bill,
  "bill-issue": BillIssue,
  "full-check": FullCheck,
  recommendation: Recommendation,
  pay: Pay,
  split: Split,
  "split-share": (p: any) => <SplitShare {...p} />,
  "split-lobby": (p: any) => <SplitLobby {...p} />,
  "split-items": (p: any) => <SplitItems {...p} />,
  tip: Tip,
  review: Review,
  method: Method,
  momo: Momo,
  otp: PaymentOtp,
  authorise: Authorise,
  processing: Processing,
  "payment-error": (p: any) => <PaymentError {...p} />,
  success: Success,
  "receipt-choice": ReceiptChoice,
  phone: Phone,
  "otp-rewards": OtpRewards,
  name: Name,
  rewards: Rewards,
  "guest-receipt": GuestReceipt,
  feedback: Feedback,
  "review-handoff": ReviewHandoff,
  complete: Complete,
};

// Diner render for a published Menu Studio menu (themed). Display-only; bill/pay unchanged.
function StudioMenu({ s, dispatch }: any) {
  const allMenus = s?.menu?.menus as any[] | undefined;
  const [mi, setMi] = useState(0);
  const activeMenu =
    allMenus && allMenus[mi]
      ? allMenus[mi]
      : { sections: s?.menu?.sections ?? [], theme: s?.menu?.theme, digital: s?.menu?.digital };
  const sections = activeMenu.sections ?? [];
  const dig = activeMenu.digital || {};
  const th = activeMenu.theme || {};
  const t = {
    fonts: {
      title: th.fonts?.title || "Georgia, serif",
      heading: th.fonts?.heading || "Georgia, serif",
      item: th.fonts?.item || '"Helvetica Neue", Arial, sans-serif',
      body: th.fonts?.body || "Arial, sans-serif",
    },
    colors: {
      ink: th.colors?.ink || "#171717",
      paper: th.colors?.paper || "#f2f3f5",
      accent: th.colors?.accent || "#cfb37b",
      heading: th.colors?.heading || "#171717",
      price: th.colors?.price || "#171717",
    },
    layout: {
      item_photos: th.layout?.item_photos || "small",
      align: th.layout?.align || "left",
      price_style: th.layout?.price_style || "symbol",
    },
  };
  const oc = openState(dig.hours);
  const priceOf = (it: any) => {
    if (it?.price_display && String(it.price_display).trim())
      return String(it.price_display).trim();
    if (it?.price_pesewas == null) return "";
    if (t.layout.price_style === "plain")
      return (it.price_pesewas / 100).toLocaleString("en-GH", { maximumFractionDigits: 2 });
    return pes(it.price_pesewas);
  };
  const [active, setActive] = useState<string | null>(sections[0]?.id ?? null);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    injectStudioFonts(t.fonts);
  }, [th]);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 150);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => {
    if (!sections.length) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const vis = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (vis)
          setActive(
            window.scrollY < 40
              ? sections[0]?.id ?? null
              : (vis.target as HTMLElement).dataset["sid"] || null,
          );
      },
      { rootMargin: "-45% 0px -50% 0px", threshold: 0 },
    );
    sections.forEach((x: any) => {
      const el = document.getElementById("sec-" + x.id);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, [mi, sections.length]);
  const jump = (id: string) => {
    const el = document.getElementById("sec-" + id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (!sections.length) {
    return (
      <section>
        <header className="page-header">
          <div>
            <p className="eyebrow">{(s?.restaurantName || "").toUpperCase()}</p>
            <h1>
              Menu
              <br />
              <em>coming soon.</em>
            </h1>
          </div>
        </header>
      </section>
    );
  }

  const tabsEl = (
    <div className="tabs" style={{ margin: 0, padding: "0 20px" }}>
      {sections.map((x: any) => (
        <button
          key={x.id}
          className={x.id === active ? "active" : ""}
          onClick={() => jump(x.id)}
          style={
            x.id === active
              ? {
                  color: t.colors.heading,
                  borderBottomColor: t.colors.accent,
                  fontFamily: t.fonts.item,
                }
              : { fontFamily: t.fonts.item }
          }
        >
          {x.name}
        </button>
      ))}
    </div>
  );

  return (
    <section
      className="studio-menu"
      style={{
        background: t.colors.paper,
        color: t.colors.ink,
        fontFamily: t.fonts.body,
        margin: "-22px -20px 0",
        padding: "22px 20px",
        minHeight: "calc(100dvh - 60px)",
      }}
    >
      <div
        style={{
          position: "fixed",
          top: 0,
          left: "50%",
          width: "min(100%, 480px)",
          zIndex: 30,
          background: t.colors.paper,
          borderBottom: "1px solid rgba(0,0,0,0.08)",
          transform: scrolled ? "translate(-50%, 0)" : "translate(-50%, -110%)",
          transition: "transform .22s ease",
          paddingTop: 8,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 20px 8px",
          }}
        >
          <strong style={{ fontFamily: t.fonts.title, color: t.colors.heading, fontSize: 15 }}>
            {dig.biz_name || s?.restaurantName || "Menu"}
          </strong>
          {s?.tableLabel && (
            <span
              style={{
                fontSize: 10,
                letterSpacing: ".1em",
                color: t.colors.accent,
                fontWeight: 700,
              }}
            >
              TABLE {s.tableLabel}
            </span>
          )}
        </div>
        {tabsEl}
      </div>

      {dig.welcome_alert && (
        <div
          style={{
            background: dig.banner_bg || t.colors.accent,
            color: "#fff",
            margin: "-22px -20px 0",
            padding: "9px 20px",
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: ".06em",
            textAlign: "center",
          }}
        >
          {dig.welcome_alert}
        </div>
      )}
      {dig.banner_url && (
        <div
          style={{
            height: 150,
            margin: (dig.welcome_alert ? "0" : "-22px") + " -20px 0",
            backgroundImage: `url(${dig.banner_url})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
      )}
      <button
        onClick={() => dispatch(go("welcome"))}
        className="back"
        style={{ marginTop: 12, marginBottom: 14 }}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M15 18l-6-6 6-6" />
        </svg>
        Back
      </button>
      {!dig.banner_url && dig.logo_url && (
        <div style={{ textAlign: "center", marginBottom: 12 }}>
          <img
            src={dig.logo_url}
            alt={dig.biz_name || ""}
            style={{
              height: 104,
              width: "auto",
              objectFit: "contain",
              display: "block",
              margin: "0 auto",
            }}
          />
        </div>
      )}
      {(dig.biz_name || dig.info || dig.phone || dig.link_url) && (
        <div style={{ textAlign: "center", marginBottom: 14 }}>
          {dig.biz_name && (
            <div style={{ fontFamily: t.fonts.title, fontSize: 22, color: t.colors.heading }}>
              {dig.biz_name}
            </div>
          )}
          {dig.info && <div style={{ opacity: 0.75, fontSize: 12, marginTop: 3 }}>{dig.info}</div>}
          {(dig.phone || dig.link_url) && (
            <div style={{ opacity: 0.75, fontSize: 12, marginTop: 2 }}>
              {dig.phone}
              {dig.phone && dig.link_url ? " · " : ""}
              {dig.link_url && (
                <a
                  href={dig.link_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: t.colors.accent }}
                >
                  {dig.link_text || "Website"}
                </a>
              )}
            </div>
          )}
        </div>
      )}
      {oc && (
        <div style={{ textAlign: "center", marginBottom: 10 }}>
          <span
            style={{
              display: "inline-block",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: ".06em",
              padding: "3px 10px",
              borderRadius: 999,
              background: oc.open ? "#1c7c3a" : "#8a857c",
              color: "#fff",
            }}
          >
            {oc.open ? "OPEN NOW" : "CLOSED NOW"}
          </span>
        </div>
      )}
      {s?.tableLabel && (
        <div
          style={{
            textAlign: "center",
            marginBottom: 14,
            fontSize: 11,
            letterSpacing: ".1em",
            color: t.colors.accent,
            fontWeight: 700,
          }}
        >
          TABLE {s.tableLabel}
        </div>
      )}
      {allMenus && allMenus.length > 1 && (
        <div
          style={{
            display: "flex",
            gap: 8,
            overflowX: "auto",
            margin: "0 -20px 14px",
            padding: "0 20px",
          }}
        >
          {allMenus.map((m: any, i: number) => (
            <button
              key={m.id}
              onClick={() => setMi(i)}
              style={{
                whiteSpace: "nowrap",
                padding: "7px 14px",
                borderRadius: 999,
                border: "1px solid " + (i === mi ? t.colors.accent : "#d8d2c6"),
                background: i === mi ? t.colors.accent : "transparent",
                color: i === mi ? "#fff" : t.colors.ink,
                fontFamily: t.fonts.item,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {m.name}
            </button>
          ))}
        </div>
      )}
      {tabsEl}
      {sections.map((section: any) => (
        <div
          className="menu-group"
          key={section.id}
          id={"sec-" + section.id}
          data-sid={section.id}
          style={{ scrollMarginTop: 96 }}
        >
          {t.layout.align === "center" ? (
            <div style={{ display: "flex", alignItems: "center", gap: 14, margin: "20px 0 16px" }}>
              <div style={{ flex: 1, height: 1, background: t.colors.ink, opacity: 0.85 }} />
              <h2
                style={{
                  margin: 0,
                  fontFamily: t.fonts.heading,
                  color: t.colors.heading,
                  fontSize: 18,
                  fontWeight: 700,
                  letterSpacing: ".18em",
                  textTransform: "uppercase",
                  whiteSpace: "nowrap",
                }}
              >
                {section.name || ""}
              </h2>
              <div style={{ flex: 1, height: 1, background: t.colors.ink, opacity: 0.85 }} />
            </div>
          ) : (
            <div
              className="section-label"
              style={{ fontFamily: t.fonts.heading, color: t.colors.heading }}
            >
              {(section.name || "").toUpperCase()}{" "}
              <span>
                {(section.items ?? []).length} {(section.items ?? []).length === 1 ? "item" : "items"}
              </span>
            </div>
          )}
          {(section.items ?? []).map((it: any) => (
            <div
              className="dish-row"
              key={it.id}
              style={{
                opacity: it.sold_out || it.available === false ? 0.5 : 1,
                cursor: "default",
              }}
            >
              {t.layout.item_photos !== "none" && it.image_url && (
                <img src={it.image_url} alt={it.name} onError={imgFallback} />
              )}
              <span>
                <strong style={{ fontFamily: t.fonts.item, color: t.colors.ink }}>
                  {it.name}
                  {it.sold_out ? " · Sold out" : ""}
                </strong>
                {it.description && (
                  <small style={{ fontFamily: t.fonts.body, color: "#8e8a8a" }}>
                    {it.description}
                  </small>
                )}
              </span>
              <b style={{ color: t.colors.price, fontFamily: t.fonts.item }}>{priceOf(it)}</b>
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}
