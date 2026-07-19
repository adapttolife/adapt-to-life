// Spec 70 P3 — tests for the report viewer: token mint/verify (HMAC
// capability URL, constant-time compare), GET /r/<token> (indistinguishable
// 404s, page content, security headers), and the email footer integration
// (link appears exactly when charts + secret exist, never otherwise).
// Standalone `node --test` with stub D1/SEND_EMAIL — same no-new-deps
// convention as spec80_halts.test.js.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  makeReportToken,
  verifyReportToken,
  timingSafeEqualHex,
  hasChartBlock,
  handleReportView,
} from "../src/report_view.js";
import { handleAgentMailApi } from "../src/agent_mail.js";

const SECRET = "report-secret-for-tests";
const MSG_ID = "5b2f2a10-9d1c-4f4e-8a30-1c2d3e4f5a6b";

// ---- token: mint + verify ---------------------------------------------------

test("token round-trips: mint then verify returns the message id", async () => {
  const token = await makeReportToken(SECRET, MSG_ID);
  assert.match(token, /^[A-Za-z0-9_-]+$/, "token is base64url — URL-safe, no padding");
  assert.equal(await verifyReportToken(SECRET, token), MSG_ID);
});

test("tampered token is rejected", async () => {
  const token = await makeReportToken(SECRET, MSG_ID);
  // Flip one character anywhere in the token: signature no longer matches.
  const flipped = token.slice(0, 10) + (token[10] === "A" ? "B" : "A") + token.slice(11);
  assert.equal(await verifyReportToken(SECRET, flipped), null);
});

test("token minted under one secret fails under another (rotation revokes)", async () => {
  const token = await makeReportToken(SECRET, MSG_ID);
  assert.equal(await verifyReportToken("rotated-secret", token), null);
});

test("missing secret or garbage token verifies to null, never throws", async () => {
  const token = await makeReportToken(SECRET, MSG_ID);
  assert.equal(await verifyReportToken(undefined, token), null);
  assert.equal(await verifyReportToken("", token), null);
  assert.equal(await verifyReportToken(SECRET, ""), null);
  assert.equal(await verifyReportToken(SECRET, "!!!not-base64url!!!"), null);
  assert.equal(await verifyReportToken(SECRET, "aGVsbG8"), null); // decodes, no dot
});

test("timingSafeEqualHex: equality, mismatch, and length mismatch", () => {
  assert.equal(timingSafeEqualHex("deadbeef", "deadbeef"), true);
  assert.equal(timingSafeEqualHex("deadbeef", "deadbeee"), false);
  assert.equal(timingSafeEqualHex("deadbeef", "deadbee"), false);
  assert.equal(timingSafeEqualHex("", ""), true);
});

test("verify path uses the constant-time compare (source pin)", () => {
  const src = readFileSync(fileURLToPath(new URL("../src/report_view.js", import.meta.url)), "utf8");
  // The signature check must go through timingSafeEqualHex — a refactor to
  // === would reintroduce the timing side channel this test exists to block.
  assert.match(src, /if \(!timingSafeEqualHex\(expected, sig\)\) return null/);
});

// ---- hasChartBlock ----------------------------------------------------------

test("hasChartBlock: chart fence yes; other fences and plain text no", () => {
  assert.equal(hasChartBlock("# Hi\n```chart\ntype: bar\nsource: x\nA | 1\n```\n"), true);
  assert.equal(hasChartBlock("```js\nconst chart = 1;\n```"), false);
  assert.equal(hasChartBlock("no fences at all"), false);
  assert.equal(hasChartBlock(null), false);
});

// ---- viewer: GET /r/<token> -------------------------------------------------

const REPORT_MD = [
  "## Positions",
  "",
  "```chart",
  "type: bar",
  "title: AUM by strategy",
  "source: FMP, 2026-07-17",
  "Alpha & Co | 42",
  "Beta | 17 | $17M",
  "```",
  "",
  "```chart",
  "type: line",
  "title: NAV trend",
  "source: internal ledger",
  "Jan | 1.2",
  "Feb | 2.4",
  "Mar | 3.1",
  "```",
  "",
  "```chart",
  "type: stat",
  "source: internal ledger",
  "AUM | $59M | +4.2%",
  "Funds | 12",
  "```",
].join("\n");

function viewerDb(row) {
  return {
    prepare(sql) {
      return {
        bind() {
          return {
            async first() {
              return /FROM messages WHERE id = \?/.test(sql) ? row : null;
            },
          };
        },
      };
    },
  };
}

const ROW = {
  id: MSG_ID,
  subject: "Daily brief <Liberty One>",
  from_addr: "charlie@agents.adapttolife.org",
  created_at: "2026-07-18 12:00:00",
  body_markdown: REPORT_MD,
};

async function view(env, token, method = "GET") {
  const request = new Request(`https://adapttolife.org/r/${token}`, { method });
  return handleReportView(request, env, new URL(request.url));
}

test("viewer: no secret configured → 404 even for a well-formed token", async () => {
  const token = await makeReportToken(SECRET, MSG_ID);
  const env = { AGENT_MAIL_DB: viewerDb(ROW) }; // REPORT_LINK_SECRET unset
  const res = await view(env, token);
  assert.equal(res.status, 404);
});

test("viewer: garbage and tampered tokens → 404", async () => {
  const env = { REPORT_LINK_SECRET: SECRET, AGENT_MAIL_DB: viewerDb(ROW) };
  assert.equal((await view(env, "nope")).status, 404);
  const token = await makeReportToken(SECRET, MSG_ID);
  const flipped = token.slice(0, 5) + (token[5] === "A" ? "B" : "A") + token.slice(6);
  assert.equal((await view(env, flipped)).status, 404);
  assert.equal((await view(env, "")).status, 404); // no token at all
});

test("viewer: valid token, unknown message id → the same 404", async () => {
  const token = await makeReportToken(SECRET, MSG_ID);
  const env = { REPORT_LINK_SECRET: SECRET, AGENT_MAIL_DB: viewerDb(null) };
  const res = await view(env, token);
  assert.equal(res.status, 404);
});

test("viewer: message without body_markdown → 404 (inbound/plain messages have no twin)", async () => {
  const token = await makeReportToken(SECRET, MSG_ID);
  const env = { REPORT_LINK_SECRET: SECRET, AGENT_MAIL_DB: viewerDb({ ...ROW, body_markdown: null }) };
  const res = await view(env, token);
  assert.equal(res.status, 404);
});

test("viewer: non-GET → 404", async () => {
  const token = await makeReportToken(SECRET, MSG_ID);
  const env = { REPORT_LINK_SECRET: SECRET, AGENT_MAIL_DB: viewerDb(ROW) };
  assert.equal((await view(env, token, "POST")).status, 404);
  assert.equal((await view(env, token, "DELETE")).status, 404);
});

test("viewer: happy path — page, charts, tooltip runtime, security headers", async () => {
  const token = await makeReportToken(SECRET, MSG_ID);
  const env = { REPORT_LINK_SECRET: SECRET, AGENT_MAIL_DB: viewerDb(ROW) };
  const res = await view(env, token);
  assert.equal(res.status, 200);

  // Security headers: confidential leaf page, never indexed/referred/cached.
  assert.match(res.headers.get("Content-Type"), /text\/html/);
  assert.equal(res.headers.get("X-Robots-Tag"), "noindex, nofollow");
  assert.equal(res.headers.get("Referrer-Policy"), "no-referrer");
  assert.equal(res.headers.get("Cache-Control"), "private, no-store");
  assert.match(res.headers.get("Content-Security-Policy"), /default-src 'none'/);

  const html = await res.text();
  // Subject as escaped H1; sent/from meta line; leaf page (no nav links).
  assert.match(html, /<h1 class="report-subject">Daily brief &lt;Liberty One&gt;<\/h1>/);
  assert.match(html, /From charlie@agents\.adapttolife\.org/);
  assert.match(html, /2026-07-18 12:00:00/);

  // bar + line become interactive payloads with the exact data...
  assert.match(html, /"type":"bar"/);
  assert.match(html, /"Alpha & Co",42/, "bar labels embed unescaped for textContent tooltips");
  assert.match(html, /"type":"line"/);
  assert.match(html, /"labels":\["Jan","Feb","Mar"\]/);
  assert.match(html, /"series":\[\[1\.2,2\.4,3\.1\]\]/);
  assert.equal((html.match(/class="ichart"/g) || []).length, 2, "exactly the bar + line blocks are interactive");

  // ...the stat block keeps its P1 HTML (tile with the 22px value)...
  assert.match(html, /font-size:22px[^>]*>\$59M</);

  // ...and the hand-rolled runtime is inline: tooltip div + hover wiring,
  // zero external requests (no src/href pointing off-page).
  assert.match(html, /id = "ctip"/);
  assert.match(html, /mousemove/);
  assert.ok(!/<script[^>]*src=/.test(html), "no external scripts");
  assert.ok(!/<link/.test(html), "no external stylesheets/fonts");
});

test("viewer: stacked bar becomes an interactive payload with per-segment tooltips and a fixed-slot legend", async () => {
  const md = [
    "```chart",
    "type: bar",
    "title: Pipeline by stage",
    "source: CRM, 2026-07-18",
    "series: New | Renewal",
    "Q1 | 2.4 | 1.2",
    "Q2 | 3 | 2",
    "```",
  ].join("\n");
  const token = await makeReportToken(SECRET, MSG_ID);
  const env = { REPORT_LINK_SECRET: SECRET, AGENT_MAIL_DB: viewerDb({ ...ROW, body_markdown: md }) };
  const html = await (await view(env, token)).text();

  // The embedded payload: stacked flag, raw names for textContent tooltips,
  // rows as [label, [segments...], total].
  assert.match(html, /"type":"bar","stacked":true,"names":\["New","Renewal"\]/);
  assert.match(html, /\["Q1",\[2\.4,1\.2\],3\.6\]/);
  assert.match(html, /\["Q2",\[3,2\],5\]/);

  // The runtime draws per-segment hover tooltips ("NameA: 2.4"), a shared
  // fixed-slot legend, and ONE total per bar in INK.
  assert.match(html, /hover\(seg, d\.names\[s\] \+ ": " \+ fmt\(v\)\)/);
  assert.match(html, /function legendRow\(/);
  assert.match(html, /legendRow\(host, d\.names\)/);
  assert.match(html, /"font-weight": 600, fill: INK \}, svg\);\n\s*val\.textContent = fmt\(r\[2\]\)/);

  // The page palette is the fixed 6-slot categorical set, in slot order.
  // GOLDEN CHANGED DELIBERATELY (Spec 70 P4): deepened editorial palette.
  assert.match(html, /var COLORS = \["#2a78d6","#1e7a46","#b95784","#c98500","#0f8a6d","#c2542a"\]/);
});

// GOLDEN CHANGED DELIBERATELY (Spec 70 P4, contrast pass): BLUE_RAMP's max
// stop deepened from #0d366b to #061b3c (rich navy).
test("viewer: shade bar payload embeds the per-row ramp colors; invalid shade+multi-series degrades on the page", async () => {
  const shadeMd = "```chart\ntype: bar\nsource: s\nshade: value\nA | 1\nB | 12\n```";
  const token = await makeReportToken(SECRET, MSG_ID);
  let env = { REPORT_LINK_SECRET: SECRET, AGENT_MAIL_DB: viewerDb({ ...ROW, body_markdown: shadeMd }) };
  let html = await (await view(env, token)).text();
  assert.match(html, /"shades":\["#cde2fb","#061b3c"\]/, "min→lightest, max→darkest ramp stops embedded");
  assert.match(html, /d\.shades && d\.shades\[i\]/, "runtime paints bars from the embedded shades");

  const badMd = "```chart\ntype: bar\nsource: s\nshade: value\nseries: A | B\nQ1 | 1 | 2\nQ2 | 3 | 4\n```";
  env = { REPORT_LINK_SECRET: SECRET, AGENT_MAIL_DB: viewerDb({ ...ROW, body_markdown: badMd }) };
  html = await (await view(env, token)).text();
  assert.match(html, /Chart degraded \(shade requires a single-series bar\)/);
  assert.ok(!html.includes('class="ichart"'), "no interactive payload for the invalid block");
});

test("viewer: chart without source degrades on the page too (P1 contract)", async () => {
  const md = "```chart\ntype: bar\nA | 1\nB | 2\n```";
  const token = await makeReportToken(SECRET, MSG_ID);
  const env = { REPORT_LINK_SECRET: SECRET, AGENT_MAIL_DB: viewerDb({ ...ROW, body_markdown: md }) };
  const html = await (await view(env, token)).text();
  assert.match(html, /Chart degraded \(missing source\)/);
  assert.ok(!html.includes('class="ichart"'), "no interactive payload for an invalid block");
});

// ---- email footer integration (via the real /send and /reply routes) --------

const OPERATOR_TOKEN = "op-secret-for-tests";
const CHART_MD = "# Daily\n\n```chart\ntype: bar\nsource: FMP\nAlpha | 42\nBeta | 17\n```\n";

// D1 stub for the send/reply flows: registered inbox, no rate-limit hits,
// records every bind so tests can recover the inserted message id.
function sendDb({ thread = null, lastInbound = null } = {}) {
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
              if (/SELECT \* FROM threads WHERE id = \?/.test(sql)) return thread;
              if (/FROM messages WHERE thread_id = \? AND direction = 'in'/.test(sql)) return lastInbound;
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

function makeEnv(db, { secret } = {}) {
  const sentMsgs = [];
  const env = {
    AGENT_MAIL_TOKEN: OPERATOR_TOKEN,
    AGENT_MAIL_DB: db,
    SEND_EMAIL: { async send(msg) { sentMsgs.push(msg); return { id: "cf-msg-1" }; } },
  };
  if (secret) env.REPORT_LINK_SECRET = secret;
  return { env, sentMsgs };
}

async function postSend(env, body) {
  const request = new Request("https://adapttolife.org/api/agent-mail/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPERATOR_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "charlie@agents.adapttolife.org", to: "nick@example.com", subject: "Daily", ...body }),
  });
  return handleAgentMailApi(request, env, new URL(request.url));
}

function insertedMessageId(db) {
  const ins = db.calls.find((c) => /INSERT INTO messages/.test(c.sql));
  assert.ok(ins, "message insert ran");
  return ins.args[0];
}

test("footer: /send with chart + secret → link in the html, token verifies to the archived id", async () => {
  const db = sendDb();
  const { env, sentMsgs } = makeEnv(db, { secret: SECRET });
  const res = await postSend(env, { body_markdown: CHART_MD });
  assert.equal(res.status, 200);
  assert.equal(sentMsgs.length, 1);
  const html = sentMsgs[0].html;
  assert.match(html, /View interactive/);
  const m = html.match(/https:\/\/adapttolife\.org\/r\/([A-Za-z0-9_-]+)/);
  assert.ok(m, "absolute /r/ link present");
  const msgId = insertedMessageId(db);
  assert.equal(await verifyReportToken(SECRET, m[1]), msgId, "link token resolves to the D1 message id");
  // The archived body_html matches the wire (footer included). Bind order:
  // id, thread_id, from, to, subject, body_text, body_markdown, body_html
  // (direction is a SQL literal).
  const ins = db.calls.find((c) => /INSERT INTO messages/.test(c.sql));
  assert.match(ins.args[7], /View interactive/);
});

test("footer: /send with chart but NO secret → email sends, no link, no error", async () => {
  const { env, sentMsgs } = makeEnv(sendDb());
  const res = await postSend(env, { body_markdown: CHART_MD });
  assert.equal(res.status, 200);
  assert.ok(!sentMsgs[0].html.includes("View interactive"));
  assert.ok(!sentMsgs[0].html.includes("/r/"));
});

test("footer: /send markdown WITHOUT charts + secret → no link", async () => {
  const { env, sentMsgs } = makeEnv(sendDb(), { secret: SECRET });
  const res = await postSend(env, { body_markdown: "# Daily\n\nAll quiet." });
  assert.equal(res.status, 200);
  assert.ok(!sentMsgs[0].html.includes("View interactive"));
});

test("footer: explicit body_html register stays untouched even with charts + secret", async () => {
  const { env, sentMsgs } = makeEnv(sendDb(), { secret: SECRET });
  const res = await postSend(env, {
    body_html: "<div>reviewed report</div>",
    body_text: "reviewed report",
    body_markdown: CHART_MD, // present but the explicit register wins (Spec 53)
  });
  assert.equal(res.status, 200);
  assert.equal(sentMsgs[0].html, "<div>reviewed report</div>");
});

test("footer: /reply with chart + secret → link rides the reply, id matches the archive", async () => {
  const thread = { id: "t9", inbox: "charlie@agents.adapttolife.org", assigned_agent: "charlie", status: "replied", subject: "Re: memo", from_addr: "nick@example.com" };
  const lastInbound = { from_addr: "nick@example.com", is_machine: 0, message_id: "<m1@x>" };
  const db = sendDb({ thread, lastInbound });
  const { env, sentMsgs } = makeEnv(db, { secret: SECRET });
  const request = new Request("https://adapttolife.org/api/agent-mail/reply", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPERATOR_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ thread_id: "t9", body_markdown: CHART_MD }),
  });
  const res = await handleAgentMailApi(request, env, new URL(request.url));
  assert.equal(res.status, 200);
  const m = sentMsgs[0].html.match(/https:\/\/adapttolife\.org\/r\/([A-Za-z0-9_-]+)/);
  assert.ok(m, "reply carries the /r/ link");
  assert.equal(await verifyReportToken(SECRET, m[1]), insertedMessageId(db));
});

test("footer: /reply without charts → no link", async () => {
  const thread = { id: "t9", inbox: "charlie@agents.adapttolife.org", assigned_agent: "charlie", status: "replied", subject: "Re: memo", from_addr: "nick@example.com" };
  const lastInbound = { from_addr: "nick@example.com", is_machine: 0, message_id: "<m1@x>" };
  const { env, sentMsgs } = makeEnv(sendDb({ thread, lastInbound }), { secret: SECRET });
  const request = new Request("https://adapttolife.org/api/agent-mail/reply", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPERATOR_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ thread_id: "t9", body_markdown: "plain answer" }),
  });
  const res = await handleAgentMailApi(request, env, new URL(request.url));
  assert.equal(res.status, 200);
  assert.ok(!sentMsgs[0].html.includes("View interactive"));
});
