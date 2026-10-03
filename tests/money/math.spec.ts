import { test, expect } from "@playwright/test";
import { allocate } from "../../src/integrations/billing/itemsplit.server";
import { computeQuote, QuoteError } from "../../src/integrations/billing/calc";
import { billTax, taxBreakdown } from "../../src/integrations/billing/tax";
import { odooTaxLines, type OdooTax } from "../../src/integrations/pos/odoo.server";
import { computeGrossUp } from "../../src/integrations/payments/split.server";

// Money-path unit tests. Everything here is integer pesewas and must sum exactly:
// a one-pesewa drift on a split is a real complaint at the table.

test.describe("allocate (largest remainder)", () => {
  test("always sums to the total and breaks ties toward the lower index", () => {
    expect(allocate(10, [1, 1, 1])).toEqual([4, 3, 3]);
    expect(allocate(1, [1, 1, 1, 1])).toEqual([1, 0, 0, 0]);
    expect(allocate(3, [4, 1])).toEqual([2, 1]);
    expect(allocate(3, [1, 4])).toEqual([1, 2]);
    expect(allocate(1999, [3, 3, 3, 3, 3, 3, 1])).toEqual([316, 316, 316, 316, 315, 315, 105]);
  });
  test("zero or empty weights never invent money", () => {
    expect(allocate(500, [0, 0])).toEqual([0, 0]);
    expect(allocate(500, [])).toEqual([]);
    expect(allocate(0, [1, 2])).toEqual([0, 0]);
  });
  test("random inputs sum exactly", () => {
    let seed = 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let c = 0; c < 500; c++) {
      const w = Array.from({ length: 1 + Math.floor(rnd() * 8) }, () => Math.floor(rnd() * 9));
      const total = Math.floor(rnd() * 100000);
      const out = allocate(total, w);
      const sumW = w.reduce((s, x) => s + x, 0);
      expect(out.reduce((s, x) => s + x, 0)).toBe(sumW > 0 ? total : 0);
      out.forEach((x) => expect(x).toBeGreaterThanOrEqual(0));
    }
  });
});

test.describe("computeQuote", () => {
  test("pay in full after a partial payment charges only the remainder", () => {
    const q = computeQuote({ totalPesewas: 2000, amountPaidPesewas: 1000, mode: "full", tipPercent: 10 });
    expect(q).toEqual({ billTotalPesewas: 2000, remainingPesewas: 1000, sharePesewas: 1000, tipPesewas: 100, grandTotalPesewas: 1100 });
  });
  test("even split rounds per head and refuses nonsense", () => {
    expect(computeQuote({ totalPesewas: 10000, amountPaidPesewas: 0, mode: "even", people: 3 }).sharePesewas).toBe(3333);
    expect(() => computeQuote({ totalPesewas: 1000, amountPaidPesewas: 1000, mode: "full" })).toThrow(QuoteError);
    expect(() => computeQuote({ totalPesewas: 1000, amountPaidPesewas: 0, mode: "custom", customAmountPesewas: 1500 })).toThrow(/overpay/);
    expect(() => computeQuote({ totalPesewas: 1000, amountPaidPesewas: 0, mode: "custom", customAmountPesewas: 0 })).toThrow(/zero_value/);
  });
  test("an explicit tip amount wins over a percentage and is never negative", () => {
    const q = computeQuote({ totalPesewas: 5000, amountPaidPesewas: 0, mode: "full", tipPesewas: -50, tipPercent: 10 });
    expect(q.tipPesewas).toBe(0);
    expect(q.grandTotalPesewas).toBe(5000);
  });
});

test.describe("taxes", () => {
  test("statutory estimate decomposes the inclusive total exactly", () => {
    const tb = taxBreakdown(2000);
    expect(tb.net + tb.nhil + tb.getfund + tb.vat + tb.tourism).toBe(2000);
    const est = billTax(2000, null);
    expect(est.estimated).toBe(true);
    expect(est.net + est.total).toBe(2000);
    expect(est.lines.map((l) => l.name)).toEqual(["NHIL 2.5%", "GETFund 2.5%", "VAT 15%", "Tourism Levy 1%"]);
  });
  test("lines reported by the POS are shown as-is", () => {
    const stored = { tax_lines: [{ name: "VAT 15%", rate: 15, amountPesewas: 249 }, { name: "NHIL 2.5%", rate: 2.5, amountPesewas: 42 }, { name: "GETFund 2.5%", rate: 2.5, amountPesewas: 42 }], tax_pesewas: 333 };
    const t = billTax(2000, stored);
    expect(t.estimated).toBe(false);
    expect(t.total).toBe(333);
    expect(t.net).toBe(1667);
  });
  test("Odoo group taxes expand to their children and reconcile to amount_tax", () => {
    const taxes = new Map<number, OdooTax>([
      [1, { id: 1, name: "VAT 20% (Ghana 2026)", amount: 20, amount_type: "group", children_tax_ids: [5, 6, 7] }],
      [5, { id: 5, name: "VAT 15%", amount: 15, amount_type: "percent", children_tax_ids: [] }],
      [6, { id: 6, name: "NHIL 2.5%", amount: 2.5, amount_type: "percent", children_tax_ids: [] }],
      [7, { id: 7, name: "GETFund 2.5%", amount: 2.5, amount_type: "percent", children_tax_ids: [] }],
    ]);
    // Baobab, Belaqua x2: price_subtotal 16.67, Odoo amount_tax 3.34
    const lines = odooTaxLines([{ price_subtotal: 16.67, tax_ids: [1] }], taxes, 334)!;
    expect(lines.reduce((s, l) => s + l.amountPesewas, 0)).toBe(334);
    expect(lines.map((l) => l.name)).toEqual(["VAT 15%", "GETFund 2.5%", "NHIL 2.5%"]);
    // A POS that reports no tax yields null so the UI falls back to the estimate.
    expect(odooTaxLines([{ price_subtotal: 20, tax_ids: [9] }], new Map(), 0)).toBeNull();
  });
});

test.describe("Paystack gross-up (restaurant is made whole)", () => {
  test("matches the agreed worked examples", () => {
    for (const [base, charged] of [[2000, 2050], [5000, 5125], [10000, 10250], [20000, 20500], [50000, 51250]] as const) {
      const g = computeGrossUp(base, 50);
      expect(g.totalPesewas).toBe(charged);
      expect(g.totalPesewas - g.transactionChargePesewas).toBe(base);
    }
  });
  test("the diner's surcharge always covers Paystack's 1.95% plus Klown's fee", () => {
    for (let base = 1; base <= 200000; base += 997) {
      const g = computeGrossUp(base, 50);
      const paystack = Math.ceil((g.totalPesewas * 195) / 10000);
      expect(g.transactionChargePesewas).toBeGreaterThanOrEqual(paystack + Math.floor((base * 50) / 10000) - 1);
      expect(g.totalPesewas).toBeGreaterThanOrEqual(base);
    }
  });
});
