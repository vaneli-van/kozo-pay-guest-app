import { test, expect } from "@playwright/test";
import { pickStaffRecipients, staffPaymentMessage, tableNo, firstName } from "../../src/integrations/notify/staffAlert";

// Floor-staff payment SMS (2026-10-07): who is texted and what the text says.
const STAFF = [
  { name: "Princess Osei Opoku", role: "cashier", phone: "233203431775", active: true },
  { name: "Joel Ansah", role: "waiter", phone: "233530401838", active: true },
  { name: "Nana Yaw", role: "waiter", phone: "233599695444", active: true },
  { name: "Gabriella Owusuwaa", role: "waiter", phone: "233240769609", active: true },
  { name: "Old Waiter", role: "waiter", phone: "233200000000", active: false },
  { name: "No Phone", role: "cashier", phone: null, active: true },
];

test.describe("pickStaffRecipients", () => {
  test("waiter on the bill (first-name match, any case) + every active cashier with a phone", () => {
    const r = pickStaffRecipients(STAFF, "joel");
    expect(r.phones.sort()).toEqual(["233203431775", "233530401838"].sort());
    expect(r.waiter?.name).toBe("Joel Ansah");
  });
  test("full name from Odoo also matches on its first name", () => {
    expect(pickStaffRecipients(STAFF, "Nana Yaw").waiter?.name).toBe("Nana Yaw");
  });
  test("unknown waiter (Administrator) or none: cashiers only", () => {
    expect(pickStaffRecipients(STAFF, "Administrator").phones).toEqual(["233203431775"]);
    expect(pickStaffRecipients(STAFF, null).phones).toEqual(["233203431775"]);
  });
  test("inactive staff and staff without a phone are never texted", () => {
    expect(pickStaffRecipients(STAFF, "Old").phones).toEqual(["233203431775"]);
  });
  test("a waiter who is also the cashier gets one text", () => {
    const both = [{ name: "Ama K", role: "waiter", phone: "233500000001" }, { name: "Ama K", role: "cashier", phone: "233500000001" }];
    expect(pickStaffRecipients(both, "Ama").phones).toEqual(["233500000001"]);
  });
  test("no staff configured: nobody", () => {
    expect(pickStaffRecipients([], "Joel").phones).toEqual([]);
  });
});

test.describe("staffPaymentMessage", () => {
  test("full payment, MoMo, with tip and waiter", () => {
    const m = staffPaymentMessage({ tableLabel: "08", tabLabel: "Ama", serverName: "Joel", full: true, amountPesewas: 12000, tipPesewas: 1000, paidPesewas: 12000, totalPesewas: 12000, channel: "momo" });
    expect(m).toBe("Klown: Table 8 (Ama) PAID IN FULL GHS 120.00 by MoMo via Paystack. Waiter: Joel. Tip GHS 10.00.");
    expect(m.length).toBeLessThanOrEqual(160);
  });
  test("part payment says how much is left", () => {
    const m = staffPaymentMessage({ tableLabel: "08", serverName: "Joel", full: false, amountPesewas: 5000, paidPesewas: 5000, totalPesewas: 12000, channel: "card" });
    expect(m).toBe("Klown: Table 8 PART PAYMENT GHS 50.00 of GHS 120.00 by card via Paystack. GHS 70.00 still to pay. Waiter: Joel.");
  });
  test("second part payment counts what was paid before", () => {
    const m = staffPaymentMessage({ tableLabel: "3", full: false, amountPesewas: 3000, paidPesewas: 8000, totalPesewas: 12000 });
    expect(m).toBe("Klown: Table 3 PART PAYMENT GHS 30.00 of GHS 120.00 via Paystack. GHS 40.00 still to pay.");
  });
  test("last split share closes the bill: bill total first, final part in brackets", () => {
    const m = staffPaymentMessage({ tableLabel: "12", serverName: "Joel", full: true, amountPesewas: 4000, paidPesewas: 12000, totalPesewas: 12000, channel: "momo" });
    expect(m).toBe("Klown: Table 12 PAID IN FULL GHS 120.00 by MoMo via Paystack (final part GHS 40.00). Waiter: Joel.");
  });
  test("no waiter and unknown channel: still a clean sentence", () => {
    const m = staffPaymentMessage({ tableLabel: "A3", full: true, amountPesewas: 100, paidPesewas: 100, totalPesewas: 100, channel: "mock" });
    expect(m).toBe("Klown: Table A3 PAID IN FULL GHS 1.00 via Paystack.");
  });
  test("helpers", () => {
    expect(tableNo("08")).toBe("8"); expect(tableNo("19")).toBe("19"); expect(tableNo("B2")).toBe("B2");
    expect(firstName("  Joel   Ansah ")).toBe("joel"); expect(firstName(null)).toBe("");
  });
});
