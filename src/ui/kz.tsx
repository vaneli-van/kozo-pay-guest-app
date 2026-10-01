import * as React from "react";
import { ChevronLeft, X } from "lucide-react";
import { go } from "../session/machine";

export const cedis = (pesewas?: number | null) =>
  ((pesewas ?? 0) / 100).toLocaleString("en-GH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export function Money({
  value,
  className = "",
}: {
  value?: number | null;
  className?: string;
}) {
  return (
    <span className={`kz-money ${className}`}>
      <span className="kz-cur">GH₵</span>
      {cedis(value)}
    </span>
  );
}

type Step = "bill" | "tip" | "pay";
const STEPS: [Step, string][] = [
  ["bill", "Bill"],
  ["tip", "Tip"],
  ["pay", "Pay"],
];

export function KzHeader({
  s,
  dispatch,
  title,
  step,
  back,
}: {
  s: any;
  dispatch: React.Dispatch<any>;
  title: string;
  step: Step;
  back: string;
}) {
  const current = STEPS.findIndex(([k]) => k === step);
  return (
    <header className="kz-head">
      <div className="kz-head-row">
        <button className="kz-icon-btn" aria-label="Back" onClick={() => dispatch(go(back as any))}>
          <ChevronLeft />
        </button>
        <div className="kz-head-id">
          {s?.logoUrl ? (
            <img className="kz-head-logo" src={s.logoUrl} alt={s?.restaurantName || "Restaurant"} />
          ) : (
            <p className="kz-head-eyebrow">{s?.restaurantName || "Your table"}</p>
          )}
          <h1 className="kz-head-title">{title}</h1>
        </div>
        {s?.tableLabel && (
          <span className="kz-head-pill">
            <span className="kz-live-dot" aria-hidden="true" />
            Table {s.tableLabel}
          </span>
        )}
      </div>
      <ol className="kz-steps" aria-label="Checkout progress">
        {STEPS.map(([key, label], i) => (
          <li
            key={key}
            className={`kz-step${i < current ? " is-done" : i === current ? " is-active" : ""}`}
            aria-current={i === current ? "step" : undefined}
          >
            {label}
          </li>
        ))}
      </ol>
    </header>
  );
}

export function Sheet({
  title,
  onClose,
  underlay,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  underlay?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="kz-overlay">
      {underlay && (
        <div className="kz-underlay" aria-hidden="true" inert>
          <div className="app-shell-like">{underlay}</div>
        </div>
      )}
      <button className="kz-scrim" aria-label="Close" tabIndex={-1} onClick={onClose} />
      <section className="kz-sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="kz-sheet-grip" aria-hidden="true" />
        <header className="kz-sheet-head">
          <h2>{title}</h2>
          <button className="kz-icon-btn light" aria-label={`Close ${title}`} onClick={onClose}>
            <X />
          </button>
        </header>
        <div className="kz-sheet-body">{children}</div>
        {footer && <div className="kz-sheet-foot">{footer}</div>}
      </section>
    </div>
  );
}
