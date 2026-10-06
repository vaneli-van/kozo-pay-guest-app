import { test, expect } from "@playwright/test";

// Contract tests for the public money endpoints: a bad or missing session must be refused
// with a JSON {ok:false} body before anything touches the database.
const BAD = ["/api/public/bill", "/api/public/quote", "/api/public/split", "/api/public/split-assign", "/api/public/assign-remaining", "/api/public/payment-init", "/api/public/payment-cancel"];

for (const path of BAD) {
  test(`${path} refuses a missing session token`, async ({ request }) => {
    const res = await request.post(path, { data: {} });
    expect(res.status()).toBeLessThan(500);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(typeof body.reason).toBe("string");
  });
}

test("/api/public/split-assign validates its inputs before the session", async ({ request }) => {
  const res = await request.post("/api/public/split-assign", { data: { sessionToken: "nope" } });
  expect((await res.json()).reason).toBe("invalid_item");
});
