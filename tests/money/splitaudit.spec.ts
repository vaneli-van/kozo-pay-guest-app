import { test, expect } from "@playwright/test";
import { computeQuote, QuoteError } from "../../src/integrations/billing/calc";
import { computeGrossUp, PAYSTACK_FEE_BPS } from "../../src/integrations/payments/split.server";
import { planItemMerge } from "../../src/integrations/pos/mergeItems";

// Split / payment audit (2026-10-06): share capping, Paystack gross-up invariants, and the
// non-destructive item merge used by the POS sync while a split is open.

test.describe("split share is capped at what is left", () => {
  test("share bigger than the balance (bill shrank) pays only the balance", () => {
    const q = computeQuote({ totalPesewas: 20000, amountPaidPesewas: 12000, mode: "custom", customAmountPesewas: 10000, capToRemaining: true });
    expect(q.sharePesewas).toBe(8000);
    expect(q.grandTotalPesewas).toBe(8000);
  });
  test("without the cap a custom amount over the balance is still refused", () => {
    expect(() => computeQuote({ totalPesewas: 20000, amountPaidPesewas: 12000, mode: "custom", customAmountPesewas: 10000 })).toThrow(QuoteError);
  });
  test("tip is worked out on the capped share", () => {
    const q = computeQuote({ totalPesewas: 20000, amountPaidPesewas: 12000, mode: "custom", customAmountPesewas: 10000, capToRemaining: true, tipPercent: 10 });
    expect(q.tipPesewas).toBe(800);
  });
});

test.describe("Paystack gross-up keeps everyone whole", () => {
  test("for every amount up to GH₵2,000: restaurant gets B, fee covered, Klown keeps >= its bps", () => {
    const bad: string[] = [];
    for (let B = 1; B <= 200000; B += 7) {
      for (const bps of [0, 50, 100]) {
        const g = computeGrossUp(B, bps);
        if (g.totalPesewas - g.transactionChargePesewas !== B) bad.push(`B=${B} bps=${bps}: subaccount != B`);  // subaccount gets exactly B
        const paystackFee = Math.ceil((g.totalPesewas * PAYSTACK_FEE_BPS) / 10000);                          // assume Paystack rounds up
        if (g.transactionChargePesewas - paystackFee < Math.floor((B * bps) / 10000) - 1) bad.push(`B=${B} bps=${bps}: Klown short`);
        if (g.totalPesewas - B > Math.ceil(B * (PAYSTACK_FEE_BPS + bps) / (10000 - PAYSTACK_FEE_BPS)) + 1) bad.push(`B=${B} bps=${bps}: overcharged`);
      }
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });
});

test.describe("POS item merge while a split is open", () => {
  const cur = [
    { id: "a", name: "Jollof", qty: 2, line_total_pesewas: 8000, sort: 10 },
    { id: "b", name: "Club Beer", qty: 2, line_total_pesewas: 4000, sort: 20 },
    { id: "c", name: "Kelewele", qty: 1, line_total_pesewas: 2500, sort: 30 },
  ];
  test("unchanged bill: nothing to do", () => {
    const p = planItemMerge(cur, cur.map(({ id, ...r }) => r));
    expect(p).toEqual({ update: [], insert: [], remove: [] });
  });
  test("a new round is added, existing rows (and their picks) are kept", () => {
    const next = [...cur.map(({ id, ...r }) => r), { name: "Club Beer", qty: 2, line_total_pesewas: 4000, sort: 40 }];
    const p = planItemMerge(cur, next);
    expect(p.remove).toEqual([]);
    expect(p.update).toEqual([]);
    expect(p.insert).toEqual([{ name: "Club Beer", qty: 2, line_total_pesewas: 4000, sort: 40 }]);
  });
  test("qty changed on the POS: the same row is updated in place", () => {
    const next = [cur[0], { ...cur[1], qty: 3, line_total_pesewas: 6000 }, cur[2]].map(({ id, ...r }) => r);
    const p = planItemMerge(cur, next);
    expect(p.update).toEqual([{ id: "b", qty: 3, line_total_pesewas: 6000, sort: 20 }]);
    expect(p.insert).toEqual([]); expect(p.remove).toEqual([]);
  });
  test("a voided line is removed", () => {
    const p = planItemMerge(cur, [cur[0], cur[1]].map(({ id, ...r }) => r));
    expect(p.remove).toEqual(["c"]); expect(p.insert).toEqual([]);
  });
  test("two identical lines match one-to-one", () => {
    const two = [{ id: "x", name: "Water", qty: 1, line_total_pesewas: 1000, sort: 10 }, { id: "y", name: "Water", qty: 1, line_total_pesewas: 1000, sort: 20 }];
    const p = planItemMerge(two, [{ name: "Water", qty: 1, line_total_pesewas: 1000, sort: 10 }]);
    expect(p.remove).toEqual(["y"]); expect(p.update).toEqual([]);
  });
});
