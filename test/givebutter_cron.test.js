// On the Nov 12 2026 cron tick the QR gift sync and donor journey
// reconciliation paged Givebutter at the same moment and rate limited each
// other. They now run one after the other, and one failing never skips the
// other.
import { test, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { runGivebutterJobs } from "../src/givebutter_cron.js";
import worker from "../src/index.js";

let realFetch;
beforeEach(() => {
  realFetch = globalThis.fetch;
  mock.method(console, "error", () => {});
  mock.method(console, "log", () => {});
});
afterEach(() => {
  globalThis.fetch = realFetch;
  mock.restoreAll();
});

test("QR gift sync finishes before reconciliation starts", async () => {
  const order = [];
  await runGivebutterJobs(
    {},
    {
      syncGifts: async () => {
        order.push("qr start");
        await new Promise((r) => setTimeout(r, 5));
        order.push("qr end");
        return { ok: true, written: 0 };
      },
      reconcileDonorJourney: async () => {
        order.push("reconcile");
        return { ok: true, reconciliation: {}, email: {} };
      },
    },
  );
  assert.deepEqual(order, ["qr start", "qr end", "reconcile"]);
});

test("reconciliation still runs when the QR gift sync throws", async () => {
  let reconciled = false;
  await runGivebutterJobs(
    {},
    {
      syncGifts: async () => {
        throw new Error("boom");
      },
      reconcileDonorJourney: async () => {
        reconciled = true;
        return { ok: false, error: "x" };
      },
    },
  );
  assert.equal(reconciled, true);
  const logged = console.error.mock.calls.map((c) => c.arguments[0]);
  assert.ok(logged.includes("qr gift sync crashed:"));
  assert.ok(
    logged.includes("donor journey reconciliation failed:"),
    "a real reconciliation failure is still logged",
  );
});

test("a reconciliation throw is caught and logged", async () => {
  await runGivebutterJobs(
    {},
    {
      syncGifts: async () => ({ ok: true }),
      reconcileDonorJourney: async () => {
        throw new Error("boom");
      },
    },
  );
  const logged = console.error.mock.calls.map((c) => c.arguments[0]);
  assert.ok(logged.includes("donor journey reconciliation crashed:"));
});

// Drives the real scheduled() handler: no two Givebutter requests are ever in
// flight at once, and both jobs reach Givebutter.
test("the cron tick never has two Givebutter requests in flight", async () => {
  let inFlight = 0;
  let peak = 0;
  const seen = [];
  globalThis.fetch = async (url) => {
    const u = new URL(String(url));
    if (u.hostname !== "api.givebutter.com") throw new Error("offline test");
    seen.push(u.searchParams.has("transactedAfter") ? "reconcile" : "qr");
    inFlight++;
    peak = Math.max(peak, inFlight);
    await new Promise((r) => setTimeout(r, 5));
    inFlight--;
    return new Response(
      JSON.stringify({ data: [], meta: { current_page: 1, last_page: 1 } }),
    );
  };
  const stmt = {
    bind() {
      return this;
    },
    first: async () => null,
    all: async () => ({ results: [] }),
    run: async () => ({ meta: { changes: 0 } }),
  };
  const env = {
    WAIVERS_DB: { prepare: () => stmt },
    GIVEBUTTER_API_KEY: "test-key",
    GIVEBUTTER_DONOR_CUTOFF: "2026-10-01T00:00:00Z",
  };
  const work = [];
  await worker.scheduled({ cron: "*/10 * * * *", scheduledTime: Date.now() }, env, {
    waitUntil: (p) => work.push(p),
  });
  await Promise.allSettled(work);
  assert.equal(peak, 1);
  assert.equal(seen[0], "qr", "QR gift sync goes first");
  assert.ok(seen.includes("reconcile"), "reconciliation runs after it");
  assert.ok(seen.lastIndexOf("qr") < seen.indexOf("reconcile"));
});
