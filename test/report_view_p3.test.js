// Spec 70 P3 rung 2/3 — report library (Feature 1), ask-the-agent (Feature 2),
// and chart drill-down (Feature 3). Standalone `node --test` with stub D1 /
// SEND_EMAIL / fetch, same no-new-deps convention as report_view.test.js and
// spec80_halts.test.js. Existing /r/ token compat is pinned in
// report_view.test.js; this file adds the three new surfaces without
// touching that one.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  makeReportToken,
  verifyReportToken,
  makeLibraryToken,
  verifyLibraryToken,
  handleReportView,
  handleLibraryView,
  reportFooterHtml,
} from "../src/report_view.js";
import { handleAgentMailApi } from "../src/agent_mail.js";

const SECRET = "report-secret-for-tests";
const MSG_ID = "5b2f2a10-9d1c-4f4e-8a30-1c2d3e4f5a6b";
const CHART_MD = [
  "```chart",
  "type: bar",
  "title: AUM by strategy",
  "source: FMP, 2026-07-18",
  "Alpha | 42",
  "Beta | 17",
  "```",
].join("\n");

// ---- Feature 1: library token ----------------------------------------------

test("library token round-trips: mint then verify returns the lowercased recipient", async () => {
  const token = await makeLibraryToken(SECRET, "Nick@Example.com");
  assert.match(token, /^[A-Za-z0-9_-]+$/);
  assert.equal(await verifyLibraryToken(SECRET, token), "nick@example.com");
});

test("library token: tampered token rejected", async () => {
  const token = await makeLibraryToken(SECRET, "nick@example.com");
  const flipped = token.slice(0, 8) + (token[8] === "A" ? "B" : "A") + token.slice(9);
  assert.equal(await verifyLibraryToken(SECRET, flipped), null);
});

test("library token: wrong recipient never verifies under another address's token", async () => {
  const token = await makeLibraryToken(SECRET, "nick@example.com");
  // A token minted for a DIFFERENT recipient must not verify to "nick@example.com".
  const otherToken = await makeLibraryToken(SECRET, "someoneelse@example.com");
  assert.notEqual(await verifyLibraryToken(SECRET, otherToken), "nick@example.com");
  assert.equal(await verifyLibraryToken(SECRET, otherToken), "someoneelse@example.com");
  // And a report token can never be replayed as a library token.
  const reportToken = await makeReportToken(SECRET, MSG_ID);
  assert.equal(await verifyLibraryToken(SECRET, reportToken), null);
  // Nor the reverse.
  assert.equal(await verifyReportToken(SECRET, token), null);
});

test("library token: missing secret/garbage/empty → null, never throws", async () => {
  const token = await makeLibraryToken(SECRET, "nick@example.com");
  assert.equal(await verifyLibraryToken(undefined, token), null);
  assert.equal(await verifyLibraryToken(SECRET, ""), null);
  assert.equal(await verifyLibraryToken(SECRET, "!!!not-base64url!!!"), null);
});

// ---- Feature 1: GET /lib/<token> -------------------------------------------

function libraryDb(rows) {
  return {
    prepare(sql) {
      return {
        bind() {
          return {
            async all() {
              return /lower\(to_addr\) = \?/.test(sql) ? { results: rows } : { results: [] };
            },
            async first() {
              return null;
            },
          };
        },
      };
    },
  };
}

async function viewLib(env, token) {
  const request = new Request(`https://adapttolife.org/lib/${token}`, { method: "GET" });
  return handleLibraryView(request, env, new URL(request.url));
}

test("library view: no secret → 404 even for a well-formed token", async () => {
  const token = await makeLibraryToken(SECRET, "nick@example.com");
  const env = { AGENT_MAIL_DB: libraryDb([]) };
  assert.equal((await viewLib(env, token)).status, 404);
});

test("library view: tampered/garbage token → 404", async () => {
  const env = { REPORT_LINK_SECRET: SECRET, AGENT_MAIL_DB: libraryDb([]) };
  assert.equal((await viewLib(env, "garbage")).status, 404);
  const token = await makeLibraryToken(SECRET, "nick@example.com");
  const flipped = token.slice(0, 5) + (token[5] === "A" ? "B" : "A") + token.slice(6);
  assert.equal((await viewLib(env, flipped)).status, 404);
});

test("library view: lists only that recipient's reports — date, from-agent, subject linking to /r/", async () => {
  const rows = [
    { id: "m-newer", subject: "Weekly <brief>", from_addr: "julia@agents.adapttolife.org", created_at: "2026-07-18 09:00:00" },
    { id: "m-older", subject: "Monthly digest", from_addr: "charlie@agents.adapttolife.org", created_at: "2026-07-01 09:00:00" },
  ];
  const token = await makeLibraryToken(SECRET, "nick@example.com");
  const env = { REPORT_LINK_SECRET: SECRET, AGENT_MAIL_DB: libraryDb(rows) };
  const res = await viewLib(env, token);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("X-Robots-Tag"), "noindex, nofollow");
  assert.equal(res.headers.get("Referrer-Policy"), "no-referrer");
  assert.equal(res.headers.get("Cache-Control"), "private, no-store");
  assert.match(res.headers.get("Content-Security-Policy"), /default-src 'none'/);

  const html = await res.text();
  assert.match(html, /Weekly &lt;brief&gt;/);
  assert.match(html, /julia@agents\.adapttolife\.org/);
  assert.match(html, /2026-07-18 09:00:00/);
  assert.match(html, /Monthly digest/);
  // Each subject links to its own minted /r/ permalink, verifying to the row's message id.
  const m = html.match(/href="(https:\/\/adapttolife\.org\/r\/[A-Za-z0-9_-]+)"[^>]*>Weekly/);
  assert.ok(m, "subject links to a minted /r/ url");
  const linkToken = m[1].split("/r/")[1];
  assert.equal(await verifyReportToken(SECRET, linkToken), "m-newer");

  // Zero external requests: only the inline filter script, no src=/href=off-page.
  assert.ok(!/<script[^>]*src=/.test(html));
  assert.match(html, /id="libFilter"/);
  assert.match(html, /addEventListener\("input"/);
});

test("library view: empty result set renders the empty state, not a crash", async () => {
  const token = await makeLibraryToken(SECRET, "nobody@example.com");
  const env = { REPORT_LINK_SECRET: SECRET, AGENT_MAIL_DB: libraryDb([]) };
  const res = await viewLib(env, token);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /No reports yet\./);
});

// ---- Feature 1: footer dual link -------------------------------------------

test("footer: reportFooterHtml with a recipient adds the Report library link on the same line", async () => {
  const env = { REPORT_LINK_SECRET: SECRET };
  const html = await reportFooterHtml(env, { body_markdown: CHART_MD }, MSG_ID, "Nick@Example.com");
  assert.match(html, /View interactive/);
  assert.match(html, /Report library/);
  // Same line: one <div>, both links, joined by the house " &middot; " separator.
  assert.equal((html.match(/<div/g) || []).length, 1);
  assert.match(html, /View interactive[\s\S]*&middot;[\s\S]*Report library[\s\S]*<\/div>/);
  const libToken = html.match(/\/lib\/([A-Za-z0-9_-]+)/)[1];
  assert.equal(await verifyLibraryToken(SECRET, libToken), "nick@example.com");
});

test("footer: no recipient → single link only, no library href, no throw", async () => {
  const env = { REPORT_LINK_SECRET: SECRET };
  const html = await reportFooterHtml(env, { body_markdown: CHART_MD }, MSG_ID, "");
  assert.match(html, /View interactive/);
  assert.ok(!html.includes("Report library"));
  assert.ok(!html.includes("/lib/"));
});

test("footer: still empty without charts/secret regardless of recipient (existing conditions unchanged)", async () => {
  const noSecret = await reportFooterHtml({}, { body_markdown: CHART_MD }, MSG_ID, "nick@example.com");
  assert.equal(noSecret, "");
  const noChart = await reportFooterHtml(
    { REPORT_LINK_SECRET: SECRET },
    { body_markdown: "# Daily\n\nAll quiet." },
    MSG_ID,
    "nick@example.com"
  );
  assert.equal(noChart, "");
});

// ---- Feature 1: dual link end-to-end through /send ------------------------

const OPERATOR_TOKEN = "op-secret-for-tests";

function sendDb() {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      return {
        bind(...args) {
          calls.push({ sql, args });
          return {
            async first() {
              if (/SELECT 1 AS ok FROM inboxes/.test(sql)) return { ok: 1 };
              if (/SELECT default_agent FROM inboxes/.test(sql)) return { default_agent: "charlie" };
              if (/datetime\('now', '-1 hour'\)/.test(sql)) return { thread_n: 0, inbox_n: 0 };
              if (/start of day/.test(sql)) return { n: 0 };
              return null;
            },
            async all() {
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
}

test("footer end-to-end: /send with a recipient carries both links; library token resolves to that recipient", async () => {
  const db = sendDb();
  const sentMsgs = [];
  const env = {
    AGENT_MAIL_TOKEN: OPERATOR_TOKEN,
    AGENT_MAIL_DB: db,
    REPORT_LINK_SECRET: SECRET,
    SEND_EMAIL: { async send(msg) { sentMsgs.push(msg); return { id: "cf-1" }; } },
  };
  const request = new Request("https://adapttolife.org/api/agent-mail/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPERATOR_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "charlie@agents.adapttolife.org", to: "nick@example.com", subject: "Daily", body_markdown: CHART_MD }),
  });
  const res = await handleAgentMailApi(request, env, new URL(request.url));
  assert.equal(res.status, 200);
  const html = sentMsgs[0].html;
  assert.match(html, /View interactive/);
  assert.match(html, /Report library/);
  const libToken = html.match(/\/lib\/([A-Za-z0-9_-]+)/)[1];
  assert.equal(await verifyLibraryToken(SECRET, libToken), "nick@example.com");
});

// ---- Feature 2: ask-the-agent ----------------------------------------------

const ASK_ROW = {
  id: MSG_ID,
  thread_id: "t-ask",
  subject: "Daily brief",
  from_addr: "charlie@agents.adapttolife.org",
  created_at: "2026-07-18 12:00:00",
  body_markdown: CHART_MD,
};
const ASK_THREAD = {
  id: "t-ask",
  inbox: "charlie@agents.adapttolife.org",
  assigned_agent: "charlie",
  from_addr: "nick@example.com",
  subject: "Daily brief",
};

function askDb({ askCount = 0 } = {}) {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      return {
        bind(...args) {
          calls.push({ sql, args });
          return {
            async first() {
              if (/FROM messages WHERE id = \?/.test(sql)) return ASK_ROW;
              if (/FROM threads WHERE id = \?/.test(sql)) return ASK_THREAD;
              if (/COUNT\(\*\) AS n/.test(sql)) return { n: askCount };
              return null;
            },
            async all() {
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
}

async function postAsk(env, token, question, ctx) {
  const request = new Request(`https://adapttolife.org/r/${token}/ask`, {
    method: "POST",
    body: new URLSearchParams({ question }),
  });
  return handleReportView(request, env, new URL(request.url), ctx);
}

function withMockedFetch(fn) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    calls.push({ url, opts });
    return new Response("{}", { status: 200 });
  };
  return fn(calls).finally(() => {
    globalThis.fetch = original;
  });
}

test("ask: happy path inserts an inbound message with the marker on the report's own thread, and rings the bell", async () => {
  await withMockedFetch(async (bellCalls) => {
    const token = await makeReportToken(SECRET, MSG_ID);
    const db = askDb();
    const env = {
      REPORT_LINK_SECRET: SECRET,
      AGENT_MAIL_DB: db,
      MAIL_BELL_SECRETS: JSON.stringify({ charlie: "bell-secret" }),
    };
    const res = await postAsk(env, token, "What drove the Q2 delta?");
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /Sent/);
    assert.match(html, /charlie will reply/);

    const ins = db.calls.find((c) => /INSERT INTO messages/.test(c.sql));
    assert.ok(ins, "inbound message inserted");
    // (id, thread_id, direction[lit], from_addr, to_addr, subject, body_text, is_machine[lit])
    assert.equal(ins.args[1], "t-ask", "same thread as the report");
    assert.equal(ins.args[2], "nick@example.com", "from the thread's counterparty");
    assert.equal(ins.args[3], "charlie@agents.adapttolife.org", "to the thread's inbox");
    assert.equal(ins.args[4], "Re: Daily brief");
    assert.match(ins.args[5], /^\[asked from the report page\]\n\nWhat drove the Q2 delta\?$/);

    assert.equal(bellCalls.length, 1, "ringBell posted to the assigned agent's bell");
    assert.match(bellCalls[0].url, /bell-charlie\.alectranel\.com/);
    const posted = JSON.parse(bellCalls[0].opts.body);
    assert.equal(posted.thread_id, "t-ask");
    assert.equal(posted.agent, "charlie");
  });
});

test("ask: waitUntil is used when a ctx is supplied (real Workers runtime path)", async () => {
  await withMockedFetch(async (bellCalls) => {
    const token = await makeReportToken(SECRET, MSG_ID);
    const env = {
      REPORT_LINK_SECRET: SECRET,
      AGENT_MAIL_DB: askDb(),
      MAIL_BELL_SECRETS: JSON.stringify({ charlie: "bell-secret" }),
    };
    const waited = [];
    const ctx = { waitUntil(p) { waited.push(p); } };
    const res = await postAsk(env, token, "waitUntil path", ctx);
    assert.equal(res.status, 200);
    assert.equal(waited.length, 1, "the bell POST is handed to ctx.waitUntil, not blocking the response");
    await waited[0]; // let the background promise settle before the test exits
    assert.equal(bellCalls.length, 1);
  });
});

test("ask: bad/tampered/unknown token → the same 404 (not a distinguishable ask error)", async () => {
  const env = { REPORT_LINK_SECRET: SECRET, AGENT_MAIL_DB: askDb() };
  assert.equal((await postAsk(env, "garbage-token", "hi")).status, 404);
  const token = await makeReportToken(SECRET, "unknown-message-id");
  const dbUnknown = {
    prepare() {
      return { bind() { return { async first() { return null; }, async all() { return { results: [] }; }, async run() { return {}; } }; } };
    },
  };
  const env2 = { REPORT_LINK_SECRET: SECRET, AGENT_MAIL_DB: dbUnknown };
  assert.equal((await postAsk(env2, token, "hi")).status, 404);
});

test("ask: sanitization strips tags, collapses whitespace, and enforces the 2000-char cap", async () => {
  const token = await makeReportToken(SECRET, MSG_ID);
  const db = askDb();
  const env = { REPORT_LINK_SECRET: SECRET, AGENT_MAIL_DB: db };
  // Tags are STRIPPED (removed as markup, replaced with a space so words
  // either side don't fuse); tag CONTENT is untrusted text, not executed —
  // it survives as plain words, same as any other word in the question.
  const dirty = "  <b>What</b>   about\n\nQ2  <i>growth</i>?  ";
  await postAsk(env, token, dirty);
  const ins = db.calls.find((c) => /INSERT INTO messages/.test(c.sql));
  assert.equal(ins.args[5], "[asked from the report page]\n\nWhat about Q2 growth ?");
  assert.ok(!ins.args[5].includes("<") && !ins.args[5].includes(">"), "no tag delimiters survive sanitization");

  const db2 = askDb();
  const env2 = { REPORT_LINK_SECRET: SECRET, AGENT_MAIL_DB: db2 };
  const long = "x".repeat(3000);
  await postAsk(env2, token, long);
  const ins2 = db2.calls.find((c) => /INSERT INTO messages/.test(c.sql));
  const stored = ins2.args[5].replace("[asked from the report page]\n\n", "");
  assert.equal(stored.length, 2000);
});

test("ask: an all-tags/whitespace question sanitizes to empty and is refused with 404 (no empty insert)", async () => {
  const token = await makeReportToken(SECRET, MSG_ID);
  const db = askDb();
  const env = { REPORT_LINK_SECRET: SECRET, AGENT_MAIL_DB: db };
  const res = await postAsk(env, token, "   <div></div>   ");
  assert.equal(res.status, 404);
  assert.ok(!db.calls.some((c) => /INSERT INTO messages/.test(c.sql)));
});

test("ask: rate limit — 10 asks already recorded today on this thread → 429, no insert", async () => {
  const token = await makeReportToken(SECRET, MSG_ID);
  const db = askDb({ askCount: 10 });
  const env = { REPORT_LINK_SECRET: SECRET, AGENT_MAIL_DB: db };
  const res = await postAsk(env, token, "one more question");
  assert.equal(res.status, 429);
  assert.ok(!db.calls.some((c) => /INSERT INTO messages/.test(c.sql)), "429 refuses before any insert");
});

test("ask: under the cap (9 today) still succeeds", async () => {
  await withMockedFetch(async () => {
    const token = await makeReportToken(SECRET, MSG_ID);
    const db = askDb({ askCount: 9 });
    const env = { REPORT_LINK_SECRET: SECRET, AGENT_MAIL_DB: db };
    const res = await postAsk(env, token, "under the cap");
    assert.equal(res.status, 200);
  });
});

test("ask: GET on the /ask sub-route is refused (POST is the one deliberate exception, not GET)", async () => {
  const token = await makeReportToken(SECRET, MSG_ID);
  const env = { REPORT_LINK_SECRET: SECRET, AGENT_MAIL_DB: askDb() };
  const request = new Request(`https://adapttolife.org/r/${token}/ask`, { method: "GET" });
  const res = await handleReportView(request, env, new URL(request.url));
  assert.equal(res.status, 404);
});

// ---- CSP still forbids external + form-action addition ---------------------

test("CSP: /r/ page keeps default-src 'none' and adds form-action 'self' for the ask-box only", async () => {
  const token = await makeReportToken(SECRET, MSG_ID);
  const db = askDb();
  const env = { REPORT_LINK_SECRET: SECRET, AGENT_MAIL_DB: db };
  const request = new Request(`https://adapttolife.org/r/${token}`, { method: "GET" });
  const res = await handleReportView(request, env, new URL(request.url));
  const csp = res.headers.get("Content-Security-Policy");
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /form-action 'self'/);
  assert.ok(!/connect-src|img-src|frame-src/.test(csp), "no new permissive directives snuck in");

  const html = await res.text();
  assert.match(html, /<form method="post" action="\/r\/[A-Za-z0-9_-]+\/ask">/);
  assert.ok(!/<form[^>]*action="https?:\/\//.test(html), "form posts same-origin only, never absolute/external");
});

// ---- Feature 3: chart drill-down (data table + CSV) ------------------------

test("drill-down: the runtime script embeds the data-table + client-side CSV machinery (Blob, no new endpoint)", async () => {
  const token = await makeReportToken(SECRET, MSG_ID);
  const env = { REPORT_LINK_SECRET: SECRET, AGENT_MAIL_DB: askDb() };
  const request = new Request(`https://adapttolife.org/r/${token}`, { method: "GET" });
  const res = await handleReportView(request, env, new URL(request.url));
  const html = await res.text();

  assert.match(html, /function addDrillDown\(/);
  assert.match(html, /function tableData\(/);
  assert.match(html, /new Blob\(\[csvLines\.join/);
  assert.match(html, /type: "text\/csv"/);
  assert.match(html, /URL\.createObjectURL\(blob\)/);
  assert.match(html, /dl\.download = "chart-data\.csv"/);
  assert.match(html, /addDrillDown\(host, data\)/, "wired into the per-chart render loop");
  assert.match(html, /className = "data-toggle"/);

  // No new endpoint, no external request: everything rides the same inline
  // <script> that already draws the SVG — no added <script src> or fetch().
  assert.ok(!/<script[^>]*src=/.test(html));
  assert.ok(!/\bfetch\(/.test(html));
});

test("drill-down: bar/stacked/line/scatter table headers derive from the chart's own series/label names", async () => {
  const stackedMd = [
    "```chart",
    "type: bar",
    "source: CRM",
    "series: New | Renewal",
    "Q1 | 2.4 | 1.2",
    "```",
  ].join("\n");
  const db = {
    prepare(sql) {
      return {
        bind() {
          return {
            async first() {
              return /FROM messages WHERE id = \?/.test(sql) ? { ...ASK_ROW, body_markdown: stackedMd } : null;
            },
            async all() {
              return { results: [] };
            },
          };
        },
      };
    },
  };
  const token = await makeReportToken(SECRET, MSG_ID);
  const env = { REPORT_LINK_SECRET: SECRET, AGENT_MAIL_DB: db };
  const request = new Request(`https://adapttolife.org/r/${token}`, { method: "GET" });
  const res = await handleReportView(request, env, new URL(request.url));
  const html = await res.text();
  // The stacked-bar table branch: ["Label"].concat(names, ["Total"]).
  assert.match(html, /headers: \["Label"\]\.concat\(names, \["Total"\]\)/);
});
