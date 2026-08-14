import { test } from "node:test";
import assert from "node:assert/strict";
import { handleEmailSendingBatch, processEmailSendingEvent } from "../src/email_delivery.js";
import { handleAgentMailApi } from "../src/agent_mail.js";

function event(status, id = `evt-${status}`) {
  return {
    type: `cf.email.sending.message.${status}`,
    payload: {
      eventId: id,
      messageId: "cf-message-1",
      recipient: "alec@example.com",
      terminal: status !== "deferred",
      delivery: { status, smtpStatusCode: status === "deferred" ? "451" : "250", smtpResponse: `${status} response` },
    },
    metadata: { eventTimestamp: "2026-08-14T20:00:00Z" },
  };
}

function database() {
  const state = {
    message: { id: "m1", thread_id: "t1", to_addr: "alec@example.com", delivery_status: "pending" },
    thread: { status: "agent_working" },
    events: new Set(),
    failures: [],
    latestDirection: "out",
    failThreadUpdateOnce: false,
  };
  const db = {
    state,
    prepare(sql) {
      const binds = [];
      return {
        bind(...args) { binds.push(...args); return this; },
        async first() {
          if (/FROM messages WHERE direction = 'out' AND message_id/.test(sql)) return state.message;
          if (/FROM email_delivery_events/.test(sql)) return state.events.has(binds[0]) ? { ok: 1 } : null;
          if (/SELECT direction FROM messages/.test(sql)) return { direction: state.latestDirection };
          if (/COUNT\(\*\) AS n FROM messages/.test(sql)) {
            return { n: ["pending", "deferred"].includes(state.message.delivery_status) ? 1 : 0 };
          }
          throw new Error(`unexpected first: ${sql}`);
        },
        async run() {
          if (/INSERT INTO email_delivery_events/.test(sql)) state.events.add(binds[0]);
          else if (/UPDATE messages SET delivery_status/.test(sql)) state.message.delivery_status = binds[0];
          else if (/INSERT INTO send_failures/.test(sql)) state.failures.push({ id: binds[0], route: binds[2], error: binds[4] });
          else if (/UPDATE threads\s+SET status = 'replied'/.test(sql)) {
            if (state.failThreadUpdateOnce) {
              state.failThreadUpdateOnce = false;
              throw new Error("injected thread update failure");
            }
            if (["new", "agent_working"].includes(state.thread.status)) state.thread.status = "replied";
          } else if (/UPDATE threads SET status = 'needs_review'/.test(sql)) {
            if (state.failThreadUpdateOnce) {
              state.failThreadUpdateOnce = false;
              throw new Error("injected thread update failure");
            }
            if (!["human", "resolved"].includes(state.thread.status)) state.thread.status = "needs_review";
          } else throw new Error(`unexpected run: ${sql}`);
          return { success: true };
        },
      };
    },
    async batch(statements) {
      const snapshot = {
        message: state.message && { ...state.message },
        thread: { ...state.thread },
        events: new Set(state.events),
        failures: state.failures.map((row) => ({ ...row })),
      };
      try {
        for (const statement of statements) await statement.run();
      } catch (error) {
        state.message = snapshot.message;
        state.thread = snapshot.thread;
        state.events = snapshot.events;
        state.failures = snapshot.failures;
        state.failThreadUpdateOnce = false;
        throw error;
      }
    },
  };
  return db;
}

test("queued and deferred mail does not close a thread; deferred delivery pages", async () => {
  const db = database();
  assert.equal(db.state.thread.status, "agent_working");
  await processEmailSendingEvent({ AGENT_MAIL_DB: db }, event("deferred"));
  assert.equal(db.state.message.delivery_status, "deferred");
  assert.equal(db.state.thread.status, "agent_working");
  assert.deepEqual(db.state.failures.map((x) => x.route), ["email.deferred"]);
});

test("only message.delivered closes the pending thread and duplicate events are inert", async () => {
  const db = database();
  await processEmailSendingEvent({ AGENT_MAIL_DB: db }, event("delivered"));
  assert.equal(db.state.message.delivery_status, "delivered");
  assert.equal(db.state.thread.status, "replied");
  const result = await processEmailSendingEvent({ AGENT_MAIL_DB: db }, event("delivered"));
  assert.equal(result.duplicate, true);
  assert.equal(db.state.events.size, 1);
});

test("terminal delivery failures page and move the thread to needs_review", async () => {
  const db = database();
  await processEmailSendingEvent({ AGENT_MAIL_DB: db }, event("bounced"));
  assert.equal(db.state.message.delivery_status, "bounced");
  assert.equal(db.state.thread.status, "needs_review");
  assert.deepEqual(db.state.failures.map((x) => x.route), ["email.bounced"]);
});

test("late deferred events cannot reverse a terminal delivery", async () => {
  const db = database();
  await processEmailSendingEvent({ AGENT_MAIL_DB: db }, event("delivered"));
  await processEmailSendingEvent({ AGENT_MAIL_DB: db }, event("deferred", "evt-late-deferred"));
  assert.equal(db.state.message.delivery_status, "delivered");
  assert.equal(db.state.thread.status, "replied");
});

test("a failure after ledger insertion rolls back all effects and Queue retry completes closure", async () => {
  const db = database();
  db.state.failThreadUpdateOnce = true;

  await assert.rejects(
    processEmailSendingEvent({ AGENT_MAIL_DB: db }, event("delivered")),
    /injected thread update failure/
  );
  assert.equal(db.state.events.size, 0, "ledger insertion rolled back");
  assert.equal(db.state.message.delivery_status, "pending", "message transition rolled back");
  assert.equal(db.state.thread.status, "agent_working", "thread remains retryable");

  const replay = await processEmailSendingEvent({ AGENT_MAIL_DB: db }, event("delivered"));
  assert.equal(replay.duplicate, false);
  assert.equal(db.state.events.size, 1);
  assert.equal(db.state.message.delivery_status, "delivered");
  assert.equal(db.state.thread.status, "replied");
});

test("uncorrelated events retry instead of disappearing", async () => {
  const db = database();
  db.state.message = null;
  let acked = 0, retried = 0;
  const item = { body: event("delivered"), ack() { acked += 1; }, retry() { retried += 1; } };
  await handleEmailSendingBatch({ messages: [item] }, { AGENT_MAIL_DB: db });
  assert.equal(acked, 0);
  assert.equal(retried, 1);
});

test("the status API cannot manufacture replied without terminal delivery", async () => {
  const env = {
    AGENT_MAIL_TOKEN: "operator-secret",
    AGENT_MAIL_DB: { prepare() { throw new Error("D1 must not be touched for a refused state"); } },
  };
  const request = new Request("https://api.amelioration.is/api/agent-mail/status", {
    method: "POST",
    headers: { Authorization: "Bearer operator-secret", "Content-Type": "application/json" },
    body: JSON.stringify({ thread_id: "t1", status: "replied" }),
  });
  const response = await handleAgentMailApi(request, env, new URL(request.url));
  assert.equal(response.status, 422);
  assert.match((await response.json()).error, /managed by terminal Email Sending/);
});
