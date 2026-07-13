// Spec 80 — unit tests for the two mail halts born from the 2026-07-13
// Boris-review: GET /api/agent-mail/stale-threads (the watchdog's OUTCOME rung
// — threads no agent answered) and the /reply ping-pong halt (Nth same-day
// agent reply flips needs_review and refuses). Standalone `node --test` with a
// stub D1 — same no-new-deps convention as send_failures.test.js.
import { test } from "node:test";
import assert from "node:assert/strict";
import { handleAgentMailApi } from "../src/agent_mail.js";

const OPERATOR_TOKEN = "op-secret-for-tests";

// SQL-regex-dispatched D1 stub; records every bind for assertions.
function stubDb({ staleRows = [], agentForToken = null, thread = null, lastInbound = null, sentToday = 0 } = {}) {
  const calls = [];
  const db = {
    calls,
    prepare(sql) {
      return {
        bind(...args) {
          calls.push({ sql, args });
          return {
            async first() {
              if (/FROM agent_tokens/.test(sql)) return agentForToken ? { agent: agentForToken } : null;
              if (/SELECT \* FROM threads WHERE id = \?/.test(sql)) return thread;
              if (/FROM messages WHERE thread_id = \? AND direction = 'in'/.test(sql)) return lastInbound;
              if (/datetime\('now', '-1 hour'\)/.test(sql)) return { thread_n: 0, inbox_n: 0 };
              if (/start of day/.test(sql)) return { n: sentToday };
              return null;
            },
            async all() {
              if (/FROM threads WHERE status IN/.test(sql)) return { results: staleRows };
              return { results: [] };
            },
            async run() {
              return {};
            },
          };
        },
      };
    },
  };
  return db;
}

async function call(env, token, path) {
  const u = `https://adapttolife.org/api/agent-mail/${path}`;
  const request = new Request(u, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  return handleAgentMailApi(request, env, new URL(request.url));
}

// ---- stale-threads: the outcome rung ---------------------------------------

test("stale-threads: unauthenticated is 401", async () => {
  const env = { AGENT_MAIL_TOKEN: OPERATOR_TOKEN, AGENT_MAIL_DB: stubDb() };
  const res = await call(env, null, "stale-threads");
  assert.equal(res.status, 401);
});

test("stale-threads: an AGENT token is 403 — operator only", async () => {
  const env = { AGENT_MAIL_TOKEN: OPERATOR_TOKEN, AGENT_MAIL_DB: stubDb({ agentForToken: "julia" }) };
  const res = await call(env, "julias-agent-token", "stale-threads");
  assert.equal(res.status, 403);
});

test("stale-threads: operator gets rows; default window binds -4 hours", async () => {
  const staleRows = [
    { thread_id: "t1", inbox: "charlie@alectranel.com", assigned_agent: "charlie", status: "new", subject: "hello?", from_addr: "nick@libertyoneim.com", last_at: "2026-07-13 01:00:00" },
  ];
  const db = stubDb({ staleRows });
  const env = { AGENT_MAIL_TOKEN: OPERATOR_TOKEN, AGENT_MAIL_DB: db };
  const res = await call(env, OPERATOR_TOKEN, "stale-threads");
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.outcome, "ok");
  assert.deepEqual(body.data, staleRows);
  const sel = db.calls.find((c) => /FROM threads WHERE status IN/.test(c.sql));
  assert.ok(sel, "stale select ran");
  assert.match(sel.sql, /status IN \('new', 'agent_working'\)/);
  assert.deepEqual(sel.args, ["-4 hours"]);
});

test("stale-threads: ?hours is honored and clamped to [1,168]; garbage falls back to 4", async () => {
  // hours=0 is falsy → default 4 (degenerate input gets the default, not a 1h hair-trigger)
  for (const [q, want] of [["hours=12", "-12 hours"], ["hours=9999", "-168 hours"], ["hours=0", "-4 hours"], ["hours=nope", "-4 hours"]]) {
    const db = stubDb();
    const env = { AGENT_MAIL_TOKEN: OPERATOR_TOKEN, AGENT_MAIL_DB: db };
    const res = await call(env, OPERATOR_TOKEN, `stale-threads?${q}`);
    assert.equal(res.status, 200);
    const sel = db.calls.find((c) => /FROM threads WHERE status IN/.test(c.sql));
    assert.deepEqual(sel.args, [want], q);
  }
});

// ---- /reply ping-pong halt --------------------------------------------------

const THREAD = { id: "t9", inbox: "charlie@alectranel.com", assigned_agent: "charlie", status: "replied", subject: "Re: memo", from_addr: "julia@alectranel.com" };
const LAST_IN = { from_addr: "julia@alectranel.com", is_machine: 0, message_id: "<m1@x>" };

async function reply(db, token) {
  const request = new Request("https://adapttolife.org/api/agent-mail/reply", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ thread_id: "t9", body_markdown: "pong" }),
  });
  const env = { AGENT_MAIL_TOKEN: OPERATOR_TOKEN, AGENT_MAIL_DB: db };
  return handleAgentMailApi(request, env, new URL(request.url));
}

test("reply: 6th same-day agent reply already sent → 429, thread flipped needs_review", async () => {
  const db = stubDb({ agentForToken: "charlie", thread: THREAD, lastInbound: LAST_IN, sentToday: 6 });
  const res = await reply(db, "charlies-agent-token");
  assert.equal(res.status, 429);
  const body = await res.json();
  assert.match(body.error, /ping-pong halt/);
  const flip = db.calls.find((c) => /UPDATE threads SET status = 'needs_review'/.test(c.sql));
  assert.ok(flip, "needs_review flip ran");
  assert.deepEqual(flip.args, ["t9"]);
});

test("reply: under the cap the halt does not fire and nothing flips", async () => {
  const db = stubDb({ agentForToken: "charlie", thread: THREAD, lastInbound: LAST_IN, sentToday: 5 });
  const res = await reply(db, "charlies-agent-token");
  // Past the halt the stub cannot send mail, so the request fails later —
  // the pin here is the boundary: no 429-ping-pong, no needs_review flip.
  const body = await res.json();
  assert.ok(!/ping-pong halt/.test(body.error || ""), "halt must not fire at 5");
  const flip = db.calls.find((c) => /UPDATE threads SET status = 'needs_review'/.test(c.sql));
  assert.equal(flip, undefined);
});
