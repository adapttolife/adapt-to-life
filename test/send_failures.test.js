// Spec 33 §6 — unit tests for GET /api/agent-mail/send-failures, the fleet
// watchdog's poll surface. Standalone `node --test` with a stub D1 + the
// global Request/URL — same no-new-deps convention as md_render.test.js.
//
// What this pins: the auth gate (401 unauthenticated, 403 for AGENT tokens,
// 200 for the operator token only) and the row feed (rows pass through as
// {outcome:"ok", data:[...]}, and ?since lands as the ts > ? bind). The
// catch-path INSERTs (recordSendFailure) ride live send/mirror/bell flows the
// node harness cannot exercise — the post-merge drill covers those.
import { test } from "node:test";
import assert from "node:assert/strict";
import { handleAgentMailApi } from "../src/agent_mail.js";

const OPERATOR_TOKEN = "op-secret-for-tests";

// Minimal D1 stub: answers the two statements this route can trigger
// (agent_tokens lookup in resolveCaller, send_failures select) and records
// every bind so assertions can check what SQL actually ran.
function stubDb({ rows = [], agentForToken = null } = {}) {
  const calls = [];
  const db = {
    calls,
    prepare(sql) {
      return {
        bind(...args) {
          calls.push({ sql, args });
          return {
            async first() {
              if (/FROM agent_tokens/.test(sql)) {
                return agentForToken ? { agent: agentForToken } : null;
              }
              return null;
            },
            async all() {
              if (/FROM send_failures/.test(sql)) return { results: rows };
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

function makeRequest(token, since = 1700000000) {
  const u = `https://adapttolife.org/api/agent-mail/send-failures?since=${since}`;
  return new Request(u, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
}

async function call(env, token, since) {
  const request = makeRequest(token, since);
  return handleAgentMailApi(request, env, new URL(request.url));
}

test("send-failures: unauthenticated is 401", async () => {
  const env = { AGENT_MAIL_TOKEN: OPERATOR_TOKEN, AGENT_MAIL_DB: stubDb() };
  const res = await call(env, null);
  assert.equal(res.status, 401);
});

test("send-failures: an AGENT token is 403 — operator only", async () => {
  const env = { AGENT_MAIL_TOKEN: OPERATOR_TOKEN, AGENT_MAIL_DB: stubDb({ agentForToken: "julia" }) };
  const res = await call(env, "julias-agent-token");
  assert.equal(res.status, 403);
  const body = await res.json();
  assert.equal(body.outcome, "error");
});

test("send-failures: operator token gets the rows, since binds as ts > ?", async () => {
  const rows = [
    { id: "a", ts: 1700000100, route: "cfSend", to_addr: "nick@example.com", error: "SEND_EMAIL boom" },
    { id: "b", ts: 1700000200, route: "mirror", to_addr: "julia@agents.adapttolife.org", error: "clickup create 503: upstream" },
  ];
  const db = stubDb({ rows });
  const env = { AGENT_MAIL_TOKEN: OPERATOR_TOKEN, AGENT_MAIL_DB: db };
  const res = await call(env, OPERATOR_TOKEN, 1699999999);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.outcome, "ok");
  assert.deepEqual(body.data, rows);

  const sel = db.calls.find((c) => /FROM send_failures/.test(c.sql));
  assert.ok(sel, "send_failures select ran");
  assert.match(sel.sql, /WHERE ts > \?/);
  assert.deepEqual(sel.args, [1699999999]);
});

test("send-failures: a bad ?since falls back to 0 (full feed), never NaN", async () => {
  const db = stubDb({ rows: [] });
  const env = { AGENT_MAIL_TOKEN: OPERATOR_TOKEN, AGENT_MAIL_DB: db };
  const res = await call(env, OPERATOR_TOKEN, "not-a-number");
  assert.equal(res.status, 200);
  const sel = db.calls.find((c) => /FROM send_failures/.test(c.sql));
  assert.deepEqual(sel.args, [0]);
});
