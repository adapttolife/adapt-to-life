// Spec 70 dark rung — dark mode for the report viewer pages (/r/, /lib/, the
// ask-box confirmation page). Design is SELECTED via `@media
// (prefers-color-scheme: dark)` swapping CSS custom properties defined once
// at :root, never an auto-flip in script. These tests pin: the dark media
// block carries the exact six validated dark series hexes, the light
// defaults are unchanged (still chart_render.js's shared chrome + the email
// SERIES_COLORS set), the inline SVG runtime resolves color from the live
// custom properties (matchMedia-driven redraw) rather than baked JS, the
// tooltip's dark-elevated token is present, and — the untouched-email pin —
// neither chart_render.js/chart_png.js (the email renderer) nor an actual
// composed email body carries any prefers-color-scheme block or the new
// custom properties. Same standalone `node --test` + stub D1 convention as
// report_view.test.js / report_view_p3.test.js.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  makeReportToken,
  handleReportView,
  handleLibraryView,
  makeLibraryToken,
} from "../src/report_view.js";
import { renderChart, SERIES_COLORS } from "../src/chart_render.js";
import { handleAgentMailApi } from "../src/agent_mail.js";

const SECRET = "report-secret-for-tests";
const MSG_ID = "5b2f2a10-9d1c-4f4e-8a30-1c2d3e4f5a6b";

const DARK_SERIES = ["#3987e5", "#008300", "#d55181", "#c98500", "#199e70", "#d95926"];

const REPORT_MD = [
  "```chart",
  "type: bar",
  "title: AUM by strategy",
  "source: FMP, 2026-07-18",
  "Alpha | 42",
  "Beta | 17",
  "```",
].join("\n");

const ROW = {
  id: MSG_ID,
  thread_id: "t-dark",
  subject: "Daily brief",
  from_addr: "charlie@agents.adapttolife.org",
  created_at: "2026-07-18 12:00:00",
  body_markdown: REPORT_MD,
};

function viewerDb(row) {
  return {
    prepare(sql) {
      return {
        bind() {
          return {
            async first() {
              if (/FROM messages WHERE id = \?/.test(sql)) return row;
              if (/FROM threads WHERE id = \?/.test(sql)) return { assigned_agent: "charlie" };
              return null;
            },
          };
        },
      };
    },
  };
}

async function viewReport() {
  const token = await makeReportToken(SECRET, MSG_ID);
  const env = { REPORT_LINK_SECRET: SECRET, AGENT_MAIL_DB: viewerDb(ROW) };
  const request = new Request(`https://adapttolife.org/r/${token}`, { method: "GET" });
  const res = await handleReportView(request, env, new URL(request.url));
  return res.text();
}

// Pull the @media (prefers-color-scheme: dark) { ... } block's contents out
// of a page so assertions can be scoped to it (never accidentally matching
// the light :root defaults that share the same var names).
function darkBlock(html) {
  const m = html.match(/@media \(prefers-color-scheme: dark\)\s*\{([\s\S]*?)\n  \}\n/);
  assert.ok(m, "dark media block present");
  return m[1];
}

// ---- dark media block: exact validated palette -----------------------------

test("dark: /r/ page carries a prefers-color-scheme:dark block with the exact six dark series hexes, in slot order", async () => {
  const html = await viewReport();
  const dark = darkBlock(html);
  DARK_SERIES.forEach((hex, i) => {
    assert.match(dark, new RegExp(`--series-${i}: ${hex}\\b`), `slot ${i} = ${hex}`);
  });
});

test("dark: surface/text/hairline tokens match the validated palette exactly", async () => {
  const html = await viewReport();
  const dark = darkBlock(html);
  assert.match(dark, /--surface: #1a1a19/);
  assert.match(dark, /--ink: #ffffff/, "text-primary");
  assert.match(dark, /--secondary: #c3c2b7/, "text-secondary");
  assert.match(dark, /--hairline: #3a3936/, "hairline/grid");
});

test("dark: tooltip dark-elevated background token present, text stays white", async () => {
  const html = await viewReport();
  const dark = darkBlock(html);
  assert.match(dark, /--tooltip-bg: #2a2a28/);
  // #ctip's text color is set once, from --tooltip-text, and is white in
  // both modes (the page never needs a second override for it).
  assert.match(html, /--tooltip-text: #ffffff/);
  assert.match(html, /#ctip[^}]*color: var\(--tooltip-text\)/);
});

// ---- light defaults: unchanged -----------------------------------------

test("dark: light :root defaults are exactly today's chrome + email SERIES_COLORS (unchanged)", async () => {
  const html = await viewReport();
  const root = html.split("@media (prefers-color-scheme: dark)")[0];
  assert.match(root, /--ink: #0b0b0b/);
  assert.match(root, /--secondary: #52514e/);
  assert.match(root, /--muted: #898781/);
  assert.match(root, /--hairline: #e1e0d9/);
  assert.match(root, /--surface: #ffffff/);
  SERIES_COLORS.forEach((hex, i) => {
    assert.match(root, new RegExp(`--series-${i}: ${hex}\\b`));
  });
});

// ---- runtime: resolves color from the live custom properties ---------------

test("dark: the inline runtime reads mode via matchMedia and redraws on change (never auto-flips itself)", async () => {
  const html = await viewReport();
  assert.match(html, /matchMedia\("\(prefers-color-scheme: dark\)"\)/);
  assert.match(html, /addEventListener\("change", onSchemeChange\)/);
  // Draw functions still read the SAME INK/SEC/MUTED/HAIR/COLORS bindings
  // (existing pinned call sites in report_view.test.js) — refreshTheme(host)
  // overwrites them from getComputedStyle(host) before every draw instead of
  // a second parallel color path. Post paper-card fix: theme is resolved AT
  // THE CHART HOST (so a host inside .report-body inherits the card's pinned
  // light values) rather than from document.documentElement.
  assert.match(html, /function refreshTheme\(host\)/);
  assert.match(html, /getComputedStyle\(el\)/);
  assert.ok(!html.includes("getComputedStyle(document.documentElement)"), "no longer reads theme from the page root");
  assert.match(html, /refreshTheme\(host\)/, "drawAll refreshes theme per chart host");
  assert.match(html, /function drawAll\(/);
});

// ---- paper card (dark-fix rung): the report body is a pinned-light card ----
// The email-register body (baked light inline styles + the .ichart runtime
// drawing inside it) renders as a white "paper card" in BOTH modes so nothing
// inside it ever goes white-on-white. The card rule lives OUTSIDE the dark
// media query — it isn't toggled by scheme, it's just always light — so in
// light mode it's a no-op (today's exact look) and in dark mode it shows up
// as a deliberate document card against the dark page.

// The page has TWO @media (prefers-color-scheme: dark) blocks (:root's from
// ROOT_VARS_CSS, then .report-body's own from REPORT_BODY_CSS) — so these
// tests pull EVERY `.report-body { ... }` rule out by direct regex rather
// than splitting on the first dark media query, which would land inside the
// wrong (earlier, :root) block.
function reportBodyRules(html) {
  return [...html.matchAll(/\.report-body\s*\{([^}]*)\}/gs)].map((m) => m[1]);
}

// True when the `.report-body` selector at `idx` is the FIRST rule directly
// inside a `@media (prefers-color-scheme: dark) { ... }` block — i.e. it is
// scheme-conditional. False for the always-on rule, which sits at the CSS's
// top level (its immediately preceding token is a `}` closing some earlier
// rule/media block, never a bare dark-media `{`).
function isNestedInDarkMedia(html, idx) {
  const before = html.slice(Math.max(0, idx - 100), idx);
  return /@media \(prefers-color-scheme: dark\)\s*\{\s*$/.test(before);
}

test("dark: .report-body pins background/ink light OUTSIDE the dark media query, and re-declares every var the runtime/chart chrome reads", async () => {
  const html = await viewReport();
  const rules = reportBodyRules(html);
  assert.ok(rules.length >= 1, "at least one .report-body rule present");
  const light = rules[0];
  // The always-on rule must NOT be nested inside `@media (prefers-color-scheme: dark)`.
  const lightRuleIndex = html.indexOf(".report-body");
  assert.ok(!isNestedInDarkMedia(html, lightRuleIndex), "the always-light .report-body rule is declared outside any dark media block");
  assert.match(light, /background:\s*#ffffff/, "paper card background pinned light");
  assert.match(light, /color:\s*#0b0b0b/);
  assert.match(light, /--ink:\s*#0b0b0b/);
  assert.match(light, /--secondary:\s*#52514e/);
  assert.match(light, /--muted:\s*#898781/);
  assert.match(light, /--hairline:\s*#e1e0d9/);
  assert.match(light, /--surface:\s*#ffffff/);
  assert.match(light, /--tooltip-bg:\s*#0b0b0b/);
  assert.match(light, /--tooltip-text:\s*#ffffff/);
  SERIES_COLORS.forEach((hex, i) => assert.match(light, new RegExp(`--series-${i}:\\s*${hex}\\b`)));
});

test("dark: .report-body only gains padding/border-radius INSIDE the dark media query (light layout never shifts)", async () => {
  const html = await viewReport();
  const rules = reportBodyRules(html);
  const light = rules[0];
  assert.ok(!/padding/.test(light), "no padding baked into the always-on light rule");
  assert.ok(!/border-radius/.test(light), "no border-radius baked into the always-on light rule");
  // A second .report-body rule, carrying padding + radius, must exist and
  // must be nested inside a dark media block.
  const dark = rules.find((r) => /padding/.test(r) && /border-radius/.test(r));
  assert.ok(dark, "a dark-only .report-body rule with padding + border-radius exists");
  const secondReportBodyIndex = html.indexOf(".report-body", html.indexOf(".report-body") + 1);
  assert.ok(isNestedInDarkMedia(html, secondReportBodyIndex), "the padding/radius rule sits directly inside a dark media block");
});

test("dark: the rendered email body on /r/ is wrapped in the .report-body paper card", async () => {
  const html = await viewReport();
  assert.match(html, /<div class="report-body">[\s\S]*class="ichart"[\s\S]*<\/div>/, "the ichart payload lives inside the report-body wrapper");
});

// ---- /lib/ and the ask-box confirmation page get the same treatment --------

test("dark: /lib/ library page carries the same dark media block", async () => {
  const token = await makeLibraryToken(SECRET, "nick@example.com");
  const env = {
    REPORT_LINK_SECRET: SECRET,
    AGENT_MAIL_DB: { prepare: () => ({ bind: () => ({ async all() { return { results: [] }; } }) }) },
  };
  const request = new Request(`https://adapttolife.org/lib/${token}`, { method: "GET" });
  const res = await handleLibraryView(request, env, new URL(request.url));
  const html = await res.text();
  const dark = darkBlock(html);
  assert.match(dark, /--surface: #1a1a19/);
  DARK_SERIES.forEach((hex, i) => assert.match(dark, new RegExp(`--series-${i}: ${hex}\\b`)));
});

test("dark: ask-box confirmation page carries the same dark media block", async () => {
  const token = await makeReportToken(SECRET, MSG_ID);
  const askEnv = {
    REPORT_LINK_SECRET: SECRET,
    AGENT_MAIL_DB: {
      prepare(sql) {
        return {
          bind() {
            return {
              async first() {
                if (/FROM messages WHERE id = \?/.test(sql)) return ROW;
                if (/FROM threads WHERE id = \?/.test(sql)) {
                  return { id: "t-dark", inbox: "charlie@agents.adapttolife.org", assigned_agent: "charlie", from_addr: "nick@example.com" };
                }
                if (/COUNT\(\*\) AS n/.test(sql)) return { n: 0 };
                return null;
              },
              async run() {
                return {};
              },
            };
          },
        };
      },
    },
    MAIL_BELL_SECRETS: JSON.stringify({ charlie: "bell-secret" }),
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("{}", { status: 200 });
  try {
    const request = new Request(`https://adapttolife.org/r/${token}/ask`, {
      method: "POST",
      body: new URLSearchParams({ question: "dark mode check" }),
    });
    const res = await handleReportView(request, askEnv, new URL(request.url));
    assert.equal(res.status, 200);
    const html = await res.text();
    const dark = darkBlock(html);
    assert.match(dark, /--surface: #1a1a19/);
    assert.match(dark, /--ink: #ffffff/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// ---- email untouched pin ----------------------------------------------------

test("dark: chart_render.js and chart_png.js source carry NO prefers-color-scheme or dark custom properties (email renderer untouched)", () => {
  const chartRenderSrc = readFileSync(fileURLToPath(new URL("../src/chart_render.js", import.meta.url)), "utf8");
  const chartPngSrc = readFileSync(fileURLToPath(new URL("../src/chart_png.js", import.meta.url)), "utf8");
  for (const src of [chartRenderSrc, chartPngSrc]) {
    assert.ok(!src.includes("prefers-color-scheme"), "no dark media query in the email renderer");
    assert.ok(!src.includes("--ink"), "no CSS custom properties introduced into the email renderer");
    assert.ok(!src.includes("--series-"), "no dark series tokens introduced into the email renderer");
  }
});

test("dark: renderChart() (the email HTML path) output never contains a dark media block, custom properties, or matchMedia", () => {
  const escaped = ["type: bar", "source: FMP", "Alpha | 42", "Beta | 17"];
  const html = renderChart(escaped);
  assert.ok(!html.includes("prefers-color-scheme"));
  assert.ok(!html.includes("var(--"));
  assert.ok(!html.includes("matchMedia"));
});

test("dark: a real composed /send email body carries no prefers-color-scheme block, even with charts + the link secret set", async () => {
  const OPERATOR_TOKEN = "op-secret-for-tests";
  const calls = [];
  const db = {
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
  const sentMsgs = [];
  const env = {
    AGENT_MAIL_TOKEN: OPERATOR_TOKEN,
    AGENT_MAIL_DB: db,
    REPORT_LINK_SECRET: SECRET,
    SEND_EMAIL: { async send(msg) { sentMsgs.push(msg); return { id: "cf-msg-dark" }; } },
  };
  const request = new Request("https://adapttolife.org/api/agent-mail/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPERATOR_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "charlie@agents.adapttolife.org",
      to: "nick@example.com",
      subject: "Daily",
      body_markdown: REPORT_MD,
    }),
  });
  const res = await handleAgentMailApi(request, env, new URL(request.url));
  assert.equal(res.status, 200);
  const html = sentMsgs[0].html;
  assert.match(html, /View interactive/, "sanity: footer did run");
  assert.ok(!html.includes("prefers-color-scheme"));
  assert.ok(!html.includes("var(--"));
});
