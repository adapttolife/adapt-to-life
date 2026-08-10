import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { reconcileDonorJourney, reconcileGivebutterTransactions } from "../src/givebutter_reconcile.js";

function db() {
  const gifts = new Map();
  const state = new Map();
  return {
    gifts,
    state,
    prepare(sql) {
      let args = [];
      return {
        bind(...values) { args = values; return this; },
        async first() {
          if (/SELECT value FROM qr_sync_state/.test(sql)) {
            return state.has(String(args[0])) ? { value: state.get(String(args[0])) } : null;
          }
          return null;
        },
        async run() {
          if (/INSERT INTO qr_sync_state/.test(sql)) {
            state.set(String(args[0]), String(args[1]));
            return { meta: { changes: 1 } };
          }
          if (!/INSERT(?: OR IGNORE)? INTO donor_gifts/.test(sql)) throw new Error(`unexpected SQL: ${sql}`);
          const id = String(args[0]);
          if (gifts.has(id)) return { meta: { changes: 0 } };
          gifts.set(id, {
            transaction_id: id,
            email: args[4],
            amount: args[5],
            communication_opt_in: args[9],
            recurring: args[10],
            transacted_at: args[11],
            email_status: args[12],
          });
          return { meta: { changes: 1 } };
        },
      };
    },
  };
}

function tx(id, overrides = {}) {
  return {
    id,
    status: "succeeded",
    contact_id: `contact-${id}`,
    first_name: "Jordan",
    last_name: "Rivers",
    email: `${id}@example.org`,
    amount: 50,
    donated: 50,
    campaign_id: "683765",
    campaign_title: "Hustle & Heart Fund",
    communication_opt_in: false,
    transacted_at: "2026-08-10T12:00:00Z",
    ...overrides,
  };
}

function api(pages) {
  const calls = [];
  return {
    calls,
    fetch: async (url) => {
      calls.push(String(url));
      const page = Number(new URL(url).searchParams.get("page"));
      const data = pages[page - 1] || [];
      return new Response(JSON.stringify({ data, meta: { current_page: page, last_page: pages.length } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  };
}

const baseEnv = (database) => ({
  WAIVERS_DB: database,
  GIVEBUTTER_API_KEY: "synthetic-api-key",
  GIVEBUTTER_DONOR_CUTOFF: "2026-08-08T22:40:55Z",
});

test("Cloudflare reconciliation records every post-cutoff successful transaction across pages", async () => {
  const database = db();
  const provider = api([
    [tx("new-2"), tx("failed", { status: "failed" })],
    [tx("new-1"), tx("historical", { transacted_at: "2026-08-08T22:40:54Z" })],
  ]);

  const result = await reconcileGivebutterTransactions(baseEnv(database), { fetch: provider.fetch });

  assert.deepEqual(result, { ok: true, passes: 2, pages: 4, scanned: 8, eligible: 2, written: 2, error: null });
  assert.deepEqual([...database.gifts.keys()].sort(), ["new-1", "new-2"]);
  assert.equal(database.gifts.get("new-1").email_status, "pending");
  assert.equal(database.gifts.get("new-1").communication_opt_in, 0);
});

test("pagination cannot strand page 21 behind a permanent restart", async () => {
  const database = db();
  const pages = Array.from({ length: 21 }, (_, index) => [tx(`page-${index + 1}`)]);
  const result = await reconcileGivebutterTransactions(baseEnv(database), { fetch: api(pages).fetch });

  assert.equal(result.ok, true);
  assert.equal(result.passes, 2);
  assert.equal(result.pages, 42);
  assert.equal(result.written, 21);
  assert.equal(database.gifts.size, 21);
});

test("the provider query overlaps the exact activation boundary by one millisecond", async () => {
  const database = db();
  const provider = api([[tx("cutoff", { transacted_at: "2026-08-08T22:40:55Z" })]]);
  const result = await reconcileGivebutterTransactions(baseEnv(database), { fetch: provider.fetch });

  assert.equal(result.ok, true);
  const queriedAfter = new URL(provider.calls[0]).searchParams.get("transactedAfter");
  assert.equal(queriedAfter, "2026-08-08T22:40:54.999Z");
  assert.equal(database.gifts.has("cutoff"), true);
});

test("every run rescans the full activation range, including a success delayed by more than seven days", async () => {
  const database = db();
  const provider = api([[tx("delayed", { transacted_at: "2026-08-09T12:00:00Z" })]]);
  const result = await reconcileGivebutterTransactions(baseEnv(database), {
    fetch: provider.fetch,
    before: "2026-09-10T12:00:00Z",
  });

  assert.equal(result.ok, true);
  assert.equal(result.passes, 2);
  assert.equal(database.gifts.has("delayed"), true);
  for (const call of provider.calls) {
    const url = new URL(call);
    assert.equal(url.searchParams.get("transactedAfter"), "2026-08-08T22:40:54.999Z");
    assert.equal(url.searchParams.get("transactedBefore"), "2026-09-10T12:00:00.000Z");
  }
  assert.equal(database.state.has("givebutter_donor_reconciled_through"), false);
});

test("a mutating first snapshot must stabilize before reconciliation can report green", async () => {
  const database = db();
  let pass = 0;
  const fetcher = async (input) => {
    const url = new URL(input);
    const page = Number(url.searchParams.get("page"));
    if (page === 1) pass++;
    const snapshots = [
      [[tx("a"), tx("b")], [tx("d")]],
      [[tx("a"), tx("b")], [tx("c"), tx("d")]],
      [[tx("a"), tx("b")], [tx("c"), tx("d")]],
    ];
    const pages = snapshots[Math.min(pass - 1, snapshots.length - 1)];
    return new Response(JSON.stringify({
      data: pages[page - 1] || [],
      meta: { current_page: page, last_page: pages.length },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  const result = await reconcileGivebutterTransactions(baseEnv(database), { fetch: fetcher });
  assert.equal(result.ok, true);
  assert.equal(result.passes, 3);
  assert.deepEqual([...database.gifts.keys()].sort(), ["a", "b", "c", "d"]);
});

test("a collection that never stabilizes stays red", async () => {
  const database = db();
  let pass = 0;
  const fetcher = async () => {
    pass++;
    const data = [tx(pass % 2 ? "a" : "b")];
    return new Response(JSON.stringify({ data, meta: { current_page: 1, last_page: 1 } }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  };
  const result = await reconcileGivebutterTransactions(baseEnv(database), { fetch: fetcher });
  assert.equal(result.ok, false);
  assert.equal(result.passes, 3);
  assert.equal(result.error, "givebutter collection did not stabilize");
});

test("a successful transaction without an id makes reconciliation red", async () => {
  const database = db();
  const result = await reconcileGivebutterTransactions(baseEnv(database), {
    fetch: api([[tx("")]]).fetch,
  });

  assert.equal(result.ok, false);
  assert.equal(result.error, "missing transaction id");
  assert.equal(database.gifts.size, 0);
});

test("D1 ignores only duplicate transaction ids, never arbitrary constraint failures", () => {
  const source = readFileSync(fileURLToPath(new URL("../src/givebutter_webhook.js", import.meta.url)), "utf8");
  assert.match(source, /ON CONFLICT\(transaction_id\) DO NOTHING/);
  assert.doesNotMatch(source, /INSERT OR IGNORE INTO donor_gifts/);
});

test("reconciliation is idempotent when webhook already recorded the transaction", async () => {
  const database = db();
  const provider = api([[tx("same")]]);
  await reconcileGivebutterTransactions(baseEnv(database), { fetch: provider.fetch });
  const again = await reconcileGivebutterTransactions(baseEnv(database), { fetch: provider.fetch });

  assert.equal(database.gifts.size, 1);
  assert.equal(again.eligible, 1);
  assert.equal(again.written, 0);
});

test("reconciliation fails closed when its activation cutoff is absent", async () => {
  const database = db();
  const provider = api([[tx("must-not-write")]]);
  const env = baseEnv(database);
  delete env.GIVEBUTTER_DONOR_CUTOFF;

  const result = await reconcileGivebutterTransactions(env, { fetch: provider.fetch });

  assert.equal(result.ok, false);
  assert.equal(result.error, "no GIVEBUTTER_DONOR_CUTOFF");
  assert.equal(provider.calls.length, 0);
  assert.equal(database.gifts.size, 0);
});

test("a provider failure is a failed reconciliation receipt, not a false green", async () => {
  const database = db();
  const result = await reconcileGivebutterTransactions(baseEnv(database), {
    fetch: async () => new Response("unavailable", { status: 503 }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.error, "givebutter 503");
  assert.equal(result.written, 0);
});

test("missing pagination metadata is red instead of silently truncating reconciliation", async () => {
  const database = db();
  const result = await reconcileGivebutterTransactions(baseEnv(database), {
    fetch: async () => new Response(JSON.stringify({ data: [tx("visible")] }), {
      status: 200, headers: { "Content-Type": "application/json" },
    }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.error, "invalid givebutter pagination");
});

test("provider pagination beyond the Cloudflare request budget is durably red", async () => {
  const database = db();
  let calls = 0;
  const result = await reconcileGivebutterTransactions(baseEnv(database), {
    fetch: async () => {
      calls++;
      return new Response(JSON.stringify({
        data: [tx("visible")], meta: { current_page: 1, last_page: 101 },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, "givebutter pagination exceeds Cloudflare budget");
  assert.equal(calls, 1);
});

test("the scheduled owner reconciles before email and ClickUp closure", async () => {
  const calls = [];
  const result = await reconcileDonorJourney({}, {
    reconcile: async () => { calls.push("reconcile"); return { ok: true, written: 1 }; },
    recoverEmails: async () => { calls.push("email"); return { ok: true, scanned: 1, sent: 1, queued: 0, failed: 0 }; },
    syncDonors: async () => { calls.push("donors"); return { ok: true, created: 1, updated: 0 }; },
    syncGifts: async () => { calls.push("gifts"); return { ok: true, created: 1, updated: 0 }; },
    writeReceipt: async (_env, receipt) => { calls.push("receipt"); assert.equal(receipt.ok, true); return { ok: true }; },
  });

  assert.deepEqual(calls, ["reconcile", "email", "donors", "gifts", "receipt"]);
  assert.equal(result.ok, true);
  assert.equal(result.reconciliation.written, 1);
  assert.equal(result.email.sent, 1);
  assert.equal(result.receipt.ok, true);
});

test("provider outage stays red but cannot block already-durable donor closure", async () => {
  const calls = [];
  let stored;
  const result = await reconcileDonorJourney({}, {
    reconcile: async () => { calls.push("reconcile"); return { ok: false, error: "givebutter 503" }; },
    recoverEmails: async () => { calls.push("email"); return { ok: true, scanned: 1, sent: 1, queued: 0, failed: 0 }; },
    syncDonors: async () => { calls.push("donors"); return { ok: true, created: 0, updated: 1 }; },
    syncGifts: async () => { calls.push("gifts"); return { ok: true, created: 0, updated: 1 }; },
    writeReceipt: async (_env, receipt) => { calls.push("receipt"); stored = receipt; return { ok: true }; },
  });

  assert.deepEqual(calls, ["reconcile", "email", "donors", "gifts", "receipt"]);
  assert.equal(result.ok, false);
  assert.equal(result.reconciliation.error, "givebutter 503");
  assert.equal(result.email.sent, 1);
  assert.equal(stored.ok, false, "the durable receipt must preserve the provider failure");
});

test("queued or terminal thank-you work makes the journey receipt red", async () => {
  let stored;
  const result = await reconcileDonorJourney({}, {
    reconcile: async () => ({ ok: true, written: 0 }),
    recoverEmails: async () => ({ ok: false, scanned: 50, sent: 50, queued: 1, failed: 0 }),
    syncDonors: async () => ({ ok: true, created: 0, updated: 0 }),
    syncGifts: async () => ({ ok: true, created: 0, updated: 0 }),
    writeReceipt: async (_env, receipt) => { stored = receipt; return { ok: true }; },
  });

  assert.equal(result.ok, false);
  assert.equal(result.email.queued, 1);
  assert.equal(stored.ok, false);
  assert.equal(stored.email.queued, 1);
});

test("older overlapping executions cannot overwrite a newer donor receipt", () => {
  const source = readFileSync(fileURLToPath(new URL("../src/givebutter_reconcile.js", import.meta.url)), "utf8");
  assert.match(source, /WHERE[^`]{0,120}excluded\.updated_at >= qr_sync_state\.updated_at/);
});

test("the production schedule delegates donor work to the single reconciliation owner", () => {
  const source = readFileSync(fileURLToPath(new URL("../src/index.js", import.meta.url)), "utf8");
  assert.match(source, /import \{ reconcileDonorJourney \} from "\.\/givebutter_reconcile\.js"/);
  assert.match(source, /ctx\.waitUntil\(\s*reconcileDonorJourney\(env\)/);
  assert.doesNotMatch(source, /ctx\.waitUntil\(\s*recoverDonorEmails\(env\)/);
});

test("production config pins the donor reconciliation activation boundary", () => {
  const config = readFileSync(fileURLToPath(new URL("../wrangler.jsonc", import.meta.url)), "utf8");
  assert.match(config, /"GIVEBUTTER_DONOR_CUTOFF"\s*:\s*"2026-08-08T22:40:55Z"/);
});
