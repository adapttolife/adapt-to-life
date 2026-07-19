// Spec 70 P4 — unit tests for GET /api/agent-mail/reports, the reports-
// concierge substrate: an agent-scoped list/search surface over the report
// archive (every outbound report already lives in messages.body_markdown,
// the same column the /r/ viewer renders from). Standalone `node --test`
// with a SQL-regex-dispatched D1 stub — same convention as send_failures.test.js
// and spec80_halts.test.js, extended here to actually replay the join +
// filter logic against a small in-memory dataset so ownership scoping is
// exercised for real, not just asserted on bind args.
import { test } from "node:test";
import assert from "node:assert/strict";
import { handleAgentMailApi } from "../src/agent_mail.js";
import { verifyReportToken } from "../src/report_view.js";

const OPERATOR_TOKEN = "op-secret-for-tests";
const SECRET = "report-secret-for-tests";

// ── fixture data: two agents, each owning one inbox/thread, one out-report
// each, plus one inbound message (excluded: direction != 'out') and one
// legacy out message with no body_markdown (excluded: body_markdown IS NULL).
const INBOXES = [
  { address: "charlie@agents.adapttolife.org", default_agent: "charlie" },
  { address: "julia@agents.adapttolife.org", default_agent: "julia" },
];
const THREADS = [
  { id: "t-charlie-1", inbox: "charlie@agents.adapttolife.org", assigned_agent: "charlie" },
  { id: "t-julia-1", inbox: "julia@agents.adapttolife.org", assigned_agent: "julia" },
];
const MESSAGES = [
  {
    id: "m-week1",
    thread_id: "t-charlie-1",
    direction: "out",
    to_addr: "nick@example.com",
    subject: "Week 1 desk scan",
    body_markdown: "# Week 1",
    created_at: "2026-07-05 09:00:00",
  },
  {
    id: "m-week2",
    thread_id: "t-charlie-1",
    direction: "out",
    to_addr: "nick@example.com",
    subject: "Week 2 desk scan",
    body_markdown: "# Week 2",
    created_at: "2026-07-12 09:00:00",
  },
  {
    id: "m-julia",
    thread_id: "t-julia-1",
    direction: "out",
    to_addr: "alec@example.com",
    subject: "Julia weekly digest",
    body_markdown: "# Julia weekly",
    created_at: "2026-07-10 09:00:00",
  },
  {
    id: "m-inbound",
    thread_id: "t-charlie-1",
    direction: "in",
    to_addr: "charlie@agents.adapttolife.org",
    subject: "re: Week 1 desk scan",
    body_markdown: null,
    created_at: "2026-07-06 09:00:00",
  },
  {
    id: "m-legacy",
    thread_id: "t-charlie-1",
    direction: "out",
    to_addr: "nick@example.com",
    subject: "Legacy send, no markdown",
    body_markdown: null,
    created_at: "2026-07-01 09:00:00",
  },
];

// Replays exactly the WHERE clauses apiReports builds (detected by regex on
// the SQL text) against the fixtures above, consuming `args` in the same
// order the handler binds them: ownership (if agent), then to/since/until/q,
// then limit last.
function runReportsQuery(sql, args) {
  let i = 0;
  let rows = MESSAGES.filter((m) => m.direction === "out" && m.body_markdown != null).map((m) => ({
    ...m,
    thread: THREADS.find((t) => t.id === m.thread_id),
  }));

  if (/threads\.inbox IN \(SELECT address FROM inboxes/.test(sql)) {
    const agentA = args[i]; i += 1;
    const agentB = args[i]; i += 1;
    const owned = INBOXES.filter((ib) => ib.default_agent === agentA).map((ib) => ib.address);
    rows = rows.filter((m) => owned.includes(m.thread.inbox) || m.thread.assigned_agent === agentB);
  }
  if (/lower\(messages\.to_addr\) = \?/.test(sql)) {
    const to = args[i]; i += 1;
    rows = rows.filter((m) => m.to_addr.toLowerCase() === to);
  }
  if (/messages\.created_at >= \?/.test(sql)) {
    const since = args[i]; i += 1;
    rows = rows.filter((m) => m.created_at >= since);
  }
  if (/messages\.created_at <= \?/.test(sql)) {
    const until = args[i]; i += 1;
    rows = rows.filter((m) => m.created_at <= until);
  }
  if (/messages\.subject LIKE \?/.test(sql)) {
    const likePattern = args[i]; i += 1;
    const needle = likePattern.slice(1, -1).replace(/\\(.)/g, "$1").toLowerCase();
    rows = rows.filter((m) => (m.subject || "").toLowerCase().includes(needle));
  }
  const limit = args[args.length - 1];

  rows.sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
  rows = rows.slice(0, limit);

  const includeBody = /body_markdown AS body_markdown/.test(sql);
  return rows.map((m) => {
    const row = { id: m.id, thread_id: m.thread_id, to: m.to_addr, subject: m.subject, created_at: m.created_at };
    if (includeBody) row.body_markdown = m.body_markdown;
    return row;
  });
}

function reportsDb({ agentForToken = null } = {}) {
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
              return null;
            },
            async all() {
              if (/FROM messages JOIN threads/.test(sql)) return { results: runReportsQuery(sql, args) };
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

function baseEnv(dbOpts) {
  return { AGENT_MAIL_TOKEN: OPERATOR_TOKEN, REPORT_LINK_SECRET: SECRET, AGENT_MAIL_DB: reportsDb(dbOpts) };
}

async function call(env, token, qs = "") {
  const u = `https://adapttolife.org/api/agent-mail/reports${qs ? `?${qs}` : ""}`;
  const request = new Request(u, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  return handleAgentMailApi(request, env, new URL(request.url));
}

// ── (5) auth ------------------------------------------------------------

test("reports: unauthenticated is 401", async () => {
  const env = baseEnv();
  const res = await call(env, null);
  assert.equal(res.status, 401);
  const body = await res.json();
  assert.equal(body.outcome, "error");
});

test("reports: unknown bearer token is 401", async () => {
  const env = baseEnv();
  const res = await call(env, "not-a-real-token");
  assert.equal(res.status, 401);
});

// ── (1) ownership scoping -------------------------------------------------

test("reports: an agent sees only its own thread's reports — the other agent's report is excluded", async () => {
  const env = baseEnv({ agentForToken: "charlie" });
  const res = await call(env, "charlies-agent-token");
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.outcome, "ok");
  const ids = body.reports.map((r) => r.id);
  assert.deepEqual(ids.sort(), ["m-week1", "m-week2"]);
  assert.ok(!ids.includes("m-julia"), "julia's report must not leak to charlie");
  assert.ok(!ids.includes("m-inbound"), "inbound message is never a report");
  assert.ok(!ids.includes("m-legacy"), "out message without body_markdown is never a report");
});

test("reports: the operator token sees reports across every agent", async () => {
  const env = baseEnv();
  const res = await call(env, OPERATOR_TOKEN);
  const body = await res.json();
  const ids = body.reports.map((r) => r.id).sort();
  assert.deepEqual(ids, ["m-julia", "m-week1", "m-week2"]);
});

test("reports: a different agent token only sees its own — cross-check the other direction", async () => {
  const env = baseEnv({ agentForToken: "julia" });
  const res = await call(env, "julias-agent-token");
  const body = await res.json();
  assert.deepEqual(body.reports.map((r) => r.id), ["m-julia"]);
});

// ── (2) filters -------------------------------------------------------------

test("reports: to= narrows to an exact (case-insensitive) recipient match", async () => {
  const env = baseEnv();
  const res = await call(env, OPERATOR_TOKEN, "to=ALEC@example.com");
  const body = await res.json();
  assert.deepEqual(body.reports.map((r) => r.id), ["m-julia"]);
});

test("reports: since= excludes older reports", async () => {
  const env = baseEnv({ agentForToken: "charlie" });
  const res = await call(env, "charlies-agent-token", "since=2026-07-10");
  const body = await res.json();
  assert.deepEqual(body.reports.map((r) => r.id), ["m-week2"]);
});

test("reports: until= excludes newer reports", async () => {
  const env = baseEnv({ agentForToken: "charlie" });
  const res = await call(env, "charlies-agent-token", "until=2026-07-06");
  const body = await res.json();
  assert.deepEqual(body.reports.map((r) => r.id), ["m-week1"]);
});

test("reports: q= substring-matches the subject", async () => {
  const env = baseEnv({ agentForToken: "charlie" });
  const res = await call(env, "charlies-agent-token", `q=${encodeURIComponent("Week 2")}`);
  const body = await res.json();
  assert.deepEqual(body.reports.map((r) => r.id), ["m-week2"]);
});

test("reports: filters combine (to + since)", async () => {
  const env = baseEnv({ agentForToken: "charlie" });
  const res = await call(env, "charlies-agent-token", "to=nick@example.com&since=2026-07-10");
  const body = await res.json();
  assert.deepEqual(body.reports.map((r) => r.id), ["m-week2"]);
});

// ── (3) body=1 ----------------------------------------------------------

test("reports: body_markdown omitted by default", async () => {
  const env = baseEnv({ agentForToken: "charlie" });
  const res = await call(env, "charlies-agent-token");
  const body = await res.json();
  for (const r of body.reports) assert.equal("body_markdown" in r, false);
});

test("reports: body=1 includes body_markdown on every row", async () => {
  const env = baseEnv({ agentForToken: "charlie" });
  const res = await call(env, "charlies-agent-token", "body=1");
  const body = await res.json();
  assert.ok(body.reports.length > 0);
  for (const r of body.reports) assert.equal(typeof r.body_markdown, "string");
  const week1 = body.reports.find((r) => r.id === "m-week1");
  assert.equal(week1.body_markdown, "# Week 1");
});

// ── (4) report_url ------------------------------------------------------

test("reports: report_url is a working /r/ token that verifies back to the message id", async () => {
  const env = baseEnv({ agentForToken: "charlie" });
  const res = await call(env, "charlies-agent-token");
  const body = await res.json();
  const week1 = body.reports.find((r) => r.id === "m-week1");
  assert.match(week1.report_url, /^https:\/\/adapttolife\.org\/r\//);
  const token = week1.report_url.split("/r/")[1];
  assert.equal(await verifyReportToken(SECRET, token), "m-week1");
});

// ── (6) limit -------------------------------------------------------------

test("reports: limit defaults to 20", async () => {
  const env = baseEnv();
  const res = await call(env, OPERATOR_TOKEN);
  const db = env.AGENT_MAIL_DB;
  const sel = db.calls.find((c) => /FROM messages JOIN threads/.test(c.sql));
  assert.equal(sel.args[sel.args.length - 1], 20);
});

test("reports: limit clamps at 100 even when a larger value is requested", async () => {
  const env = baseEnv();
  const res = await call(env, OPERATOR_TOKEN, "limit=5000");
  assert.equal(res.status, 200);
  const db = env.AGENT_MAIL_DB;
  const sel = db.calls.find((c) => /FROM messages JOIN threads/.test(c.sql));
  assert.equal(sel.args[sel.args.length - 1], 100);
});

test("reports: a smaller explicit limit is respected", async () => {
  const env = baseEnv();
  const res = await call(env, OPERATOR_TOKEN, "limit=1");
  const body = await res.json();
  assert.equal(body.reports.length, 1);
});

// ── response shape ---------------------------------------------------------

test("reports: rows carry id/thread_id/to/subject/created_at/report_url", async () => {
  const env = baseEnv({ agentForToken: "charlie" });
  const res = await call(env, "charlies-agent-token", "limit=1&q=Week+1");
  const body = await res.json();
  assert.equal(body.outcome, "ok");
  assert.deepEqual(Object.keys(body.reports[0]).sort(), [
    "created_at",
    "id",
    "report_url",
    "subject",
    "thread_id",
    "to",
  ]);
  assert.equal(body.reports[0].to, "nick@example.com");
});
