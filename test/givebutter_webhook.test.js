import { test } from "node:test";
import assert from "node:assert/strict";
import { claimAndThank, handleGivebutterWebhook, recoverDonorEmails } from "../src/givebutter_webhook.js";
import worker from "../src/index.js";

const SECRET = "synthetic-webhook-secret";

function db() {
  const gifts = new Map();
  return {
    gifts,
    prepare(sql) {
      let args = [];
      return {
        bind(...v) { args = v; return this; },
        async first() {
          if (/AS queued/.test(sql) && /AS failed/.test(sql)) {
            let queued = 0;
            let failed = 0;
            for (const row of gifts.values()) {
              if (["pending", "sending", "retry"].includes(row.email_status)) queued++;
              if (row.email_status === "failed") failed++;
            }
            return { queued, failed };
          }
          if (/SELECT email_status FROM donor_gifts/.test(sql)) {
            const row = gifts.get(String(args[0]));
            return row ? { email_status: row.email_status } : null;
          }
          if (/SELECT attempt_count FROM donor_gifts/.test(sql)) {
            const row = gifts.get(String(args[0]));
            return row && row.lease_token === args[1] ? { attempt_count: row.attempt_count } : null;
          }
          return null;
        },
        async all() {
          if (/FROM donor_gifts/.test(sql)) {
            const [maxAttempts, staleBefore, now] = args;
            return { results: [...gifts.values()].filter((row) =>
              row.attempt_count < maxAttempts && (
                row.email_status === "pending" ||
                (row.email_status === "sending" && row.email_attempted_at < staleBefore) ||
                (row.email_status === "retry" && row.next_attempt_at <= now)
              )
            ).slice(0, 50) };
          }
          return { results: [] };
        },
        async run() {
          if (/INSERT(?: OR IGNORE)? INTO donor_gifts/.test(sql)) {
            const id = String(args[0]);
            if (gifts.has(id)) return { meta: { changes: 0 } };
            gifts.set(id, {
              transaction_id: id, contact_id: args[1], first_name: args[2], last_name: args[3],
              email: args[4], amount: args[5], donated: args[6], campaign_id: args[7],
              campaign_title: args[8], communication_opt_in: args[9], recurring: args[10],
              transacted_at: args[11], email_status: args[12], created_at: args[13], updated_at: args[14],
              attempt_count: 0, next_attempt_at: null, last_error: null,
              lease_token: null,
            });
            return { meta: { changes: 1 } };
          }
          if (/delivery lease exhausted/.test(sql)) {
            let changes = 0;
            for (const row of gifts.values()) {
              if (row.email_status === "sending" && row.email_attempted_at < args[1] && row.attempt_count >= args[2]) {
                Object.assign(row, {
                  email_status: "failed", lease_token: null,
                  last_error: "delivery lease exhausted", updated_at: args[0],
                });
                changes++;
              }
            }
            return { meta: { changes } };
          }
          if (/SET email_status = 'sending'/.test(sql)) {
            const row = gifts.get(String(args[3]));
            const reclaimable = row?.email_status === "pending" ||
              (row?.email_status === "sending" && row.email_attempted_at < args[5]) ||
              (row?.email_status === "retry" && row.next_attempt_at <= args[6]);
            if (!reclaimable || row.attempt_count >= args[4]) return { meta: { changes: 0 } };
            Object.assign(row, {
              email_status: "sending", email_attempted_at: args[0], updated_at: args[1],
              lease_token: args[2], attempt_count: row.attempt_count + 1,
            });
            return { meta: { changes: 1 } };
          }
          if (/UPDATE donor_gifts/.test(sql) && /email_sent_at/.test(sql)) {
            const row = gifts.get(String(args[3]));
            if (!row || row.lease_token !== args[4] || row.email_status !== "sending") return { meta: { changes: 0 } };
            Object.assign(row, {
              email_status: args[0], email_sent_at: args[1], updated_at: args[2],
              next_attempt_at: null, last_error: null, lease_token: null,
            });
            return { meta: { changes: 1 } };
          }
          if (/next_attempt_at/.test(sql)) {
            const row = gifts.get(String(args[4]));
            if (!row || row.lease_token !== args[5] || row.email_status !== "sending") return { meta: { changes: 0 } };
            Object.assign(row, {
              email_status: args[0], next_attempt_at: args[1], last_error: args[2],
              updated_at: args[3], lease_token: null,
            });
            return { meta: { changes: 1 } };
          }
          if (/UPDATE donor_gifts/.test(sql)) {
            const row = gifts.get(String(args[2]));
            Object.assign(row, { email_status: args[0], updated_at: args[1] });
            return { meta: { changes: 1 } };
          }
          throw new Error(`unexpected SQL: ${sql}`);
        },
      };
    },
  };
}

function payload(overrides = {}) {
  return JSON.stringify({
    event: "transaction.succeeded",
    data: {
      id: "tx_123", contact_id: "contact_1", first_name: "Jordan", last_name: "Rivers",
      email: "jordan@example.com", amount: 55, donated: 55, campaign_id: "683765",
      campaign_title: "Hustle & Heart Fund", communication_opt_in: true,
      plan_id: null, transacted_at: "2026-08-08T23:00:00Z", ...overrides,
    },
  });
}

function signedRequest(raw, secret = SECRET) {
  return new Request("https://adapttolife.org/api/givebutter-webhook", {
    method: "POST", body: raw, headers: { "Content-Type": "application/json", Signature: secret },
  });
}

function setup({ failuresRemaining = 0 } = {}) {
  const donorDb = db();
  const sent = [];
  const scheduled = [];
  const env = {
    GIVEBUTTER_WEBHOOK_SECRET: SECRET,
    GIVEBUTTER_DONOR_CUTOFF: "2026-08-08T22:40:55Z",
    WAIVERS_DB: donorDb,
    SEND_EMAIL: { async send(msg) {
      if (failuresRemaining > 0) { failuresRemaining--; throw new Error("email unavailable"); }
      sent.push(msg); return { id: "mail_1" };
    } },
  };
  return { donorDb, sent, scheduled, env, ctx: { waitUntil(p) { scheduled.push(p); } } };
}

async function finish(s) { await Promise.all(s.scheduled); }

test("the production Worker routes Givebutter deliveries to the handler", async () => {
  const s = setup();
  const res = await worker.fetch(signedRequest(payload()), s.env, s.ctx);
  assert.equal(res.status, 200);
  await finish(s);
  assert.equal(s.sent.length, 1);
});

test("the webhook fast path ignores pre-activation transactions", async () => {
  const s = setup();
  const res = await worker.fetch(signedRequest(payload({ transacted_at: "2026-08-08T22:40:54Z" })), s.env, s.ctx);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).ignored, true);
  await finish(s);
  assert.equal(s.donorDb.gifts.size, 0);
  assert.equal(s.sent.length, 0);
});

test("the webhook fast path fails closed on an invalid transaction timestamp", async () => {
  const s = setup();
  const res = await worker.fetch(signedRequest(payload({ transacted_at: "not-a-date" })), s.env, s.ctx);
  assert.equal(res.status, 400);
  assert.equal(s.donorDb.gifts.size, 0);
  assert.equal(s.sent.length, 0);
});

test("ClickUp availability cannot reject a Givebutter webhook or suppress its email", async () => {
  const s = setup();
  s.env.CLICKUP_TOKEN = "configured-but-unavailable";
  s.env.CLICKUP_RELATIONSHIPS_LIST_ID = "relationships";
  s.env.CLICKUP_FETCH = async () => { throw new Error("ClickUp unavailable"); };

  const res = await worker.fetch(signedRequest(payload()), s.env, s.ctx);
  assert.equal(res.status, 200);
  await finish(s);
  assert.equal(s.sent.length, 1);
  assert.equal(s.donorDb.gifts.size, 1);
});

test("a D1 failure is returned to Givebutter so the delivery will retry", async () => {
  const s = setup();
  s.env.WAIVERS_DB = { prepare() { throw new Error("D1 unavailable"); } };
  const res = await handleGivebutterWebhook(signedRequest(payload()), s.env, s.ctx);
  assert.equal(res.status, 503);
  assert.equal(s.scheduled.length, 0);
  assert.equal(s.sent.length, 0);
});

test("authentication happens before the bounded body read", async () => {
  const s = setup();
  const oversized = "x".repeat(70 * 1024);
  const invalid = await handleGivebutterWebhook(signedRequest(oversized, "wrong-secret"), s.env, s.ctx);
  assert.equal(invalid.status, 401);
  const valid = await handleGivebutterWebhook(signedRequest(oversized), s.env, s.ctx);
  assert.equal(valid.status, 413);
});

test("an invalid signature is rejected before data or email side effects", async () => {
  const s = setup();
  const res = await handleGivebutterWebhook(signedRequest(payload(), "wrong-secret"), s.env, s.ctx);
  assert.equal(res.status, 401);
  assert.equal(s.donorDb.gifts.size, 0);
  assert.equal(s.sent.length, 0);
});

test("a successful gift is recorded and receives the ATL follow-up", async () => {
  const s = setup();
  const res = await handleGivebutterWebhook(signedRequest(payload()), s.env, s.ctx);
  assert.equal(res.status, 200);
  assert.equal(s.scheduled.length, 1, "email work is handed to ctx.waitUntil");
  await finish(s);
  assert.equal(s.sent.length, 1);
  const gift = s.donorDb.gifts.get("tx_123");
  assert.equal(gift.email_status, "sent");
  assert.equal(gift.communication_opt_in, 1);
  const msg = s.sent[0];
  assert.equal(msg.to, "jordan@example.com");
  assert.equal(msg.replyTo, "hello@adapttolife.org");
  assert.match(msg.subject, /thank you/i);
  assert.match(msg.text, /equipment, training, and travel/i);
  assert.match(msg.text, /official receipt separately/i);
  assert.match(msg.text, /chose to hear from us/i);
  assert.match(msg.text, /show you what gifts like yours helped make possible/i);
});

test("a retried transaction never sends a second email", async () => {
  const s = setup();
  await handleGivebutterWebhook(signedRequest(payload()), s.env, s.ctx); await finish(s);
  s.scheduled.length = 0;
  await handleGivebutterWebhook(signedRequest(payload()), s.env, s.ctx); await finish(s);
  assert.equal(s.sent.length, 1);
  assert.equal(s.donorDb.gifts.size, 1);
});

test("plan_id marks a recurring gift from Givebutter's documented payload", async () => {
  const s = setup();
  await handleGivebutterWebhook(signedRequest(payload({ plan_id: "plan_123" })), s.env, s.ctx);
  await finish(s);
  assert.equal(s.donorDb.gifts.get("tx_123").recurring, 1);
});

test("the ten-minute recovery path reclaims a stale sending lease", async () => {
  const s = setup();
  s.donorDb.gifts.set("tx_stale", {
    transaction_id: "tx_stale", contact_id: "contact_1", first_name: "Jordan", last_name: "Rivers",
    email: "jordan@example.com", amount: 55, donated: 55, campaign_id: "683765",
    campaign_title: "Hustle & Heart Fund", communication_opt_in: 1, recurring: 0,
    transacted_at: "2026-08-08T22:00:00Z", email_status: "sending",
    email_attempted_at: "2020-01-01T00:00:00Z", attempt_count: 1,
    next_attempt_at: null, last_error: null, created_at: "2020-01-01T00:00:00Z",
    updated_at: "2020-01-01T00:00:00Z",
  });
  const result = await recoverDonorEmails(s.env);
  assert.equal(result.sent, 1);
  assert.equal(s.sent.length, 1);
  assert.equal(s.donorDb.gifts.get("tx_stale").email_status, "sent");
});

test("a stale lease at the attempt ceiling is dead-lettered instead of reclaimed", async () => {
  const s = setup();
  s.donorDb.gifts.set("tx_exhausted", {
    transaction_id: "tx_exhausted", email: "jordan@example.com", first_name: "Jordan",
    email_status: "sending", email_attempted_at: "2020-01-01T00:00:00Z",
    attempt_count: 4, lease_token: "dead-worker", transacted_at: "2020-01-01T00:00:00Z",
  });
  const result = await recoverDonorEmails(s.env);
  const row = s.donorDb.gifts.get("tx_exhausted");
  assert.equal(result.scanned, 0);
  assert.equal(result.ok, false);
  assert.equal(result.failed, 1);
  assert.equal(row.email_status, "failed");
  assert.equal(row.lease_token, null);
  assert.equal(s.sent.length, 0);
});

test("an expired worker cannot overwrite the newer lease holder", async () => {
  const s = setup();
  const row = {
    transaction_id: "tx_fence", contact_id: "", first_name: "Jordan", last_name: "Rivers",
    email: "jordan@example.com", amount: 55, donated: 55, campaign_id: "683765",
    campaign_title: "Hustle & Heart Fund", communication_opt_in: 1, recurring: 0,
    transacted_at: "2026-08-08T22:00:00Z", email_status: "pending", attempt_count: 0,
    email_attempted_at: null, email_sent_at: null, next_attempt_at: null, last_error: null,
    lease_token: null, created_at: "2020-01-01T00:00:00Z", updated_at: "2020-01-01T00:00:00Z",
  };
  s.donorDb.gifts.set("tx_fence", row);
  const gift = {
    transactionId: "tx_fence", contactId: "", firstName: "Jordan", lastName: "Rivers",
    email: "jordan@example.com", amount: 55, donated: 55, campaignId: "683765",
    campaignTitle: "Hustle & Heart Fund", communicationOptIn: true, recurring: false,
    transactedAt: row.transacted_at,
  };
  let rejectOld;
  let oldStartedResolve;
  const oldStarted = new Promise((resolve) => { oldStartedResolve = resolve; });
  let calls = 0;
  s.env.SEND_EMAIL.send = async () => {
    calls++;
    if (calls === 1) {
      oldStartedResolve();
      return new Promise((_, reject) => { rejectOld = reject; });
    }
    return { id: "new-mail" };
  };
  const oldWorker = claimAndThank(s.env, gift);
  await oldStarted;
  row.email_attempted_at = "2020-01-01T00:00:00Z";
  const newWorker = await claimAndThank(s.env, gift);
  assert.equal(newWorker.emailed, true);
  rejectOld(new Error("expired worker failed late"));
  const oldOutcome = await oldWorker;
  assert.equal(oldOutcome.obsolete, true);
  assert.equal(row.email_status, "sent");
  assert.equal(row.attempt_count, 2);
});

test("communication opt-out is preserved and no future updates are promised", async () => {
  const s = setup();
  await handleGivebutterWebhook(signedRequest(payload({ communication_opt_in: false })), s.env, s.ctx); await finish(s);
  assert.equal(s.donorDb.gifts.get("tx_123").communication_opt_in, 0);
  assert.doesNotMatch(s.sent[0].text, /we'll email you updates/i);
});

test("a gift without an email is recorded without attempting a send", async () => {
  const s = setup();
  await handleGivebutterWebhook(signedRequest(payload({ email: "" })), s.env, s.ctx); await finish(s);
  assert.equal(s.sent.length, 0);
  assert.equal(s.donorDb.gifts.get("tx_123").email_status, "no_email");
});

test("a transient email failure is retried by cron and eventually sent", async () => {
  const s = setup({ failuresRemaining: 1 });
  const res = await handleGivebutterWebhook(signedRequest(payload()), s.env, s.ctx); await finish(s);
  assert.equal(res.status, 200);
  const gift = s.donorDb.gifts.get("tx_123");
  assert.equal(gift.email_status, "retry");
  assert.equal(gift.attempt_count, 1);
  gift.next_attempt_at = "2020-01-01T00:00:00Z";
  const recovered = await recoverDonorEmails(s.env);
  assert.equal(recovered.sent, 1);
  assert.equal(gift.email_status, "sent");
  assert.equal(gift.attempt_count, 2);
  assert.equal(s.sent.length, 1);
});

test("email retries stop at the bounded terminal failure", async () => {
  const s = setup({ failuresRemaining: 10 });
  await handleGivebutterWebhook(signedRequest(payload()), s.env, s.ctx); await finish(s);
  const gift = s.donorDb.gifts.get("tx_123");
  for (let attempt = 2; attempt <= 4; attempt++) {
    gift.next_attempt_at = "2020-01-01T00:00:00Z";
    await recoverDonorEmails(s.env);
  }
  assert.equal(gift.attempt_count, 4);
  assert.equal(gift.email_status, "failed");
  const terminal = await recoverDonorEmails(s.env);
  assert.equal(terminal.scanned, 0);
  assert.equal(terminal.ok, false);
  assert.equal(terminal.failed, 1);
});

test("a recovery batch larger than 50 stays red until every queued email closes", async () => {
  const s = setup();
  for (let index = 0; index < 51; index++) {
    s.donorDb.gifts.set(`tx_batch_${index}`, {
      transaction_id: `tx_batch_${index}`, contact_id: `contact_${index}`,
      first_name: "Jordan", last_name: "Rivers", email: `donor${index}@example.com`,
      amount: 10, donated: 10, campaign_id: "683765", campaign_title: "Hustle & Heart Fund",
      communication_opt_in: 0, recurring: 0, transacted_at: "2026-08-10T12:00:00Z",
      email_status: "pending", attempt_count: 0, email_attempted_at: null,
      email_sent_at: null, next_attempt_at: null, last_error: null, lease_token: null,
      created_at: "2026-08-10T12:00:00Z", updated_at: "2026-08-10T12:00:00Z",
    });
  }

  const first = await recoverDonorEmails(s.env);
  assert.equal(first.sent, 50);
  assert.equal(first.queued, 1);
  assert.equal(first.failed, 0);
  assert.equal(first.ok, false);

  const second = await recoverDonorEmails(s.env);
  assert.equal(second.sent, 1);
  assert.equal(second.queued, 0);
  assert.equal(second.failed, 0);
  assert.equal(second.ok, true);
});

test("missing email infrastructure is red, never an empty green", async () => {
  const s = setup();
  delete s.env.SEND_EMAIL;
  const result = await recoverDonorEmails(s.env);
  assert.equal(result.ok, false);
  assert.match(result.error, /SEND_EMAIL/);
});
