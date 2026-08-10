import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { reconcileDonorJourney, reconcileGivebutterTransactions } from "../src/givebutter_reconcile.js";

function db() {
  const gifts = new Map();
  return {
    gifts,
    prepare(sql) {
      let args = [];
      return {
        bind(...values) { args = values; return this; },
        async run() {
          if (!/INSERT OR IGNORE INTO donor_gifts/.test(sql)) throw new Error(`unexpected SQL: ${sql}`);
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

  assert.deepEqual(result, { ok: true, pages: 2, scanned: 4, eligible: 2, written: 2, error: null });
  assert.deepEqual([...database.gifts.keys()].sort(), ["new-1", "new-2"]);
  assert.equal(database.gifts.get("new-1").email_status, "pending");
  assert.equal(database.gifts.get("new-1").communication_opt_in, 0);
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

test("the scheduled owner reconciles before email and ClickUp closure", async () => {
  const calls = [];
  const result = await reconcileDonorJourney({}, {
    reconcile: async () => { calls.push("reconcile"); return { ok: true, written: 1 }; },
    recoverEmails: async () => { calls.push("email"); return { scanned: 1, sent: 1 }; },
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
    recoverEmails: async () => { calls.push("email"); return { scanned: 1, sent: 1 }; },
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
