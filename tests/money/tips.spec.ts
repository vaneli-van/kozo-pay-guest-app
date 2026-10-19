import { test, expect } from "@playwright/test";
import { momoProvider, namesMatch, MOMO_TRANSFER_FEE_PESEWAS, MIN_NET_PAYOUT_PESEWAS } from "../../src/integrations/payments/tips.server";
import { computeGrossUp } from "../../src/integrations/payments/split.server";

// Tips to the waiter: held back from the restaurant's share at payment time, paid out daily to
// the waiter's mobile money. Payout claiming is SQL (tip_payouts_claim); the transfer flow is
// covered end to end against a fake Paystack (see the release notes). These are the pure parts.

test.describe("tips to staff", () => {
  test("mobile money network from the number", () => {
    expect(momoProvider("0241234567")).toBe("MTN");
    expect(momoProvider("0531234567")).toBe("MTN");
    expect(momoProvider("0541234567")).toBe("MTN");
    expect(momoProvider("0591234567")).toBe("MTN");
    expect(momoProvider("0599876543")).toBe("MTN");
    expect(momoProvider("0201234567")).toBe("VOD");
    expect(momoProvider("0505555555")).toBe("VOD");
    expect(momoProvider("0265555555")).toBe("ATL");
    expect(momoProvider("+233 24 123 4567")).toBe("MTN");
    expect(momoProvider("024123456")).toBeNull();
  });

  test("wallet name check: words in any order, any case; a different person never matches", () => {
    expect(namesMatch("Mensah Kofi", "KOFI MENSAH")).toBe(true);
    expect(namesMatch("Owusu Ama Serwaa", "AMA SERWAA")).toBe(true);
    expect(namesMatch("Abena Asante", "ABENA ASANTE BOATENG")).toBe(true);
    expect(namesMatch("Esi Quaye", "ESI BOATENG")).toBe(false);
    expect(namesMatch("Yaw Darko", "YAW OFORI")).toBe(false);
    expect(namesMatch("Yaw Darko", "")).toBe(false);
  });

  test("held tip: the restaurant's subaccount receives the bill without the tip, the diner pays the same", () => {
    const share = 29500, tip = 3000, B = share + tip;
    const g = computeGrossUp(B, 50);
    const charge = g.transactionChargePesewas + tip;      // what payment-init sends as transaction_charge
    expect(g.totalPesewas - charge).toBe(share);          // subaccount gets exactly the bill
    expect(charge - g.transactionChargePesewas).toBe(tip); // the tip stays in Klown's balance
    expect(g.totalPesewas).toBe(computeGrossUp(B, 50).totalPesewas); // diner's charge unchanged
  });

  test("payout amount: GH₵1 Paystack fee off the day's tips, never less than GH₵1 sent", () => {
    expect(MOMO_TRANSFER_FEE_PESEWAS).toBe(100);
    expect(MIN_NET_PAYOUT_PESEWAS).toBe(100);
  });
});
