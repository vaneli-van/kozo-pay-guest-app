import { test, expect } from "@playwright/test";
import { paystackSecret, verifyPaystackSignature, isPaystackEnabled, paymentProvider } from "../../src/integrations/payments/provider";

// Payment-mode guards: which Paystack key is used, and which key a webhook proves.
// These run with fake keys only; nothing here talks to Paystack.
const LIVE = "sk_live_fake_live_key_for_tests";
const TEST = "sk_test_fake_test_key_for_tests";
const env = process.env as Record<string, string | undefined>;
function setEnv(v: { live?: string; test?: string; staging?: boolean }) {
  if (v.live) env["PAYSTACK_SECRET_KEY"] = v.live; else delete env["PAYSTACK_SECRET_KEY"];
  if (v.test) env["PAYSTACK_TEST_SECRET_KEY"] = v.test; else delete env["PAYSTACK_TEST_SECRET_KEY"];
  if (v.staging) env["KLOWN_ENV"] = "staging"; else delete env["KLOWN_ENV"];
}
async function sign(secret: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-512" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

test.describe.configure({ mode: "serial" });

test("each mode uses its own key", () => {
  setEnv({ live: LIVE, test: TEST });
  expect(paystackSecret("live")).toBe(LIVE);
  expect(paystackSecret("test")).toBe(TEST);
});

test("a live key put in the test slot is refused, so test mode can never move real money", () => {
  setEnv({ live: LIVE, test: LIVE });
  expect(() => paystackSecret("test")).toThrow(/sk_test_/);
});

test("staging refuses live payments even if a live key is present", async () => {
  setEnv({ live: LIVE, test: TEST, staging: true });
  expect(() => paystackSecret("live")).toThrow(/staging/);
  expect(isPaystackEnabled("live")).toBe(false);
  expect(isPaystackEnabled("test")).toBe(true);
  expect(() => paymentProvider.initiate({ paymentAttemptId: "x", provider: "momo", totalPesewas: 100 })).toThrow(/staging/);
});

test("test mode without a test key is refused instead of falling back to the demo provider", () => {
  setEnv({ live: LIVE });
  expect(() => paymentProvider.initiate({ paymentAttemptId: "x", mode: "test", provider: "momo", totalPesewas: 100 })).toThrow(/PAYSTACK_TEST_SECRET_KEY/);
});

test("webhook signature tells live and test events apart", async () => {
  setEnv({ live: LIVE, test: TEST });
  const body = JSON.stringify({ event: "charge.success", data: { reference: "abc" } });
  expect(await verifyPaystackSignature(body, await sign(LIVE, body))).toBe("live");
  expect(await verifyPaystackSignature(body, await sign(TEST, body))).toBe("test");
  expect(await verifyPaystackSignature(body, await sign("sk_test_someone_else", body))).toBeNull();
  expect(await verifyPaystackSignature(body, null)).toBeNull();
});

test("on staging a live-signed webhook is not accepted", async () => {
  setEnv({ live: LIVE, test: TEST, staging: true });
  const body = "{}";
  expect(await verifyPaystackSignature(body, await sign(LIVE, body))).toBeNull();
  expect(await verifyPaystackSignature(body, await sign(TEST, body))).toBe("test");
});
