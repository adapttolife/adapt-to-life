// Spec 53 — unit tests for src/md_render.js. Standalone `node --test`, no new
// dependencies (node's built-in test runner + assert).
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderMarkdown, deriveText, resolveMarkdownBody, VERDICT_COLORS } from "../src/md_render.js";

const FIXTURE = [
  "# Heading One",
  "",
  "## Heading Two",
  "",
  "This has **bold text** and *italic text* and \\`inline code\\`.".replace(/\\`/g, "`"),
  "",
  "- first item",
  "- second item with [a link](https://example.com/path)",
  "",
  "1. step one",
  "2. step two",
  "",
  "| Col A | Col B |",
  "|---|---|",
  "| a1 | b1 |",
  "| a2 | b2 |",
  "",
  "> a quoted line",
  "",
  "---",
  "",
  "```",
  "const x = 1;",
  "```",
].join("\n");

test("renderMarkdown: headings render as h1/h2 tags, not literal #", () => {
  const html = renderMarkdown(FIXTURE);
  assert.match(html, /<h1[^>]*>Heading One<\/h1>/);
  assert.match(html, /<h2[^>]*>Heading Two<\/h2>/);
});

test("renderMarkdown: bold/italic/inline-code render as tags", () => {
  const html = renderMarkdown(FIXTURE);
  assert.match(html, /<strong>bold text<\/strong>/);
  assert.match(html, /<em>italic text<\/em>/);
  assert.match(html, /<code[^>]*>inline code<\/code>/);
});

test("renderMarkdown: bullet and ordered lists render as ul/ol/li", () => {
  const html = renderMarkdown(FIXTURE);
  assert.match(html, /<ul[^>]*><li[^>]*>first item<\/li>/);
  assert.match(html, /<ol[^>]*><li[^>]*>step one<\/li>/);
});

test("renderMarkdown: table renders as a real table with header row", () => {
  const html = renderMarkdown(FIXTURE);
  assert.match(html, /<table[^>]*>/);
  assert.match(html, /<th[^>]*>Col A<\/th>/);
  assert.match(html, /<td[^>]*>a1<\/td>/);
});

test("renderMarkdown: fenced code block renders as pre, unmangled", () => {
  const html = renderMarkdown(FIXTURE);
  assert.match(html, /<pre[^>]*>const x = 1;<\/pre>/);
});

test("renderMarkdown: link renders as an anchor with the href left untouched (absolute only)", () => {
  const html = renderMarkdown(FIXTURE);
  assert.match(html, /<a href="https:\/\/example\.com\/path"[^>]*>a link<\/a>/);
});

test("renderMarkdown: blockquote and hr render as blockquote/hr tags", () => {
  const html = renderMarkdown(FIXTURE);
  assert.match(html, /<blockquote[^>]*>a quoted line<\/blockquote>/);
  assert.match(html, /<hr[^>]*>/);
});

test("renderMarkdown: output is wrapped in the outer div", () => {
  const html = renderMarkdown(FIXTURE);
  assert.match(html, /^<div style="font-family:-apple-system/);
  assert.ok(html.trim().endsWith("</div>"));
});

test("renderMarkdown: zero literal markdown syntax survives in the visible content", () => {
  const html = renderMarkdown(FIXTURE);
  // Style attributes legitimately contain '#' (hex colors, e.g. #f6f8fa) — those
  // aren't markdown leaking through. Strip tags/attributes and check the text
  // content only: no stray '**' (unconverted bold) and no leading '#' heading
  // markers should be visible to the reader.
  const visibleText = html.replace(/<[^>]+>/g, " ");
  assert.equal(visibleText.includes("**"), false, "no literal ** should remain in visible text");
  assert.equal(/(^|\s)#{1,3}\s/.test(visibleText), false, "no literal heading '#' marker should remain in visible text");
});

test("renderMarkdown: relative-looking hrefs are left untouched (no resolution)", () => {
  const html = renderMarkdown("[relative](./some/path.md) and [dotdot](../up/there.md)");
  assert.match(html, /<a href="\.\/some\/path\.md"/);
  assert.match(html, /<a href="\.\.\/up\/there\.md"/);
});

test("deriveText: returns the raw markdown (trimmed) as the plain-text fallback", () => {
  const md = "  # Title\n\nSome **body** text.  ";
  assert.equal(deriveText(md), "# Title\n\nSome **body** text.");
});

test("deriveText: empty/nullish input yields an empty string, never throws", () => {
  assert.equal(deriveText(""), "");
  assert.equal(deriveText(null), "");
  assert.equal(deriveText(undefined), "");
});

// ── APPROVED BASELINE (Alec, 2026-07-05, spec-55 thread c3de4a22) ────────────
// "this email is absolutely perfect… i love the rich text formatting."
// The exact style constants below ARE the fleet email standard — the baseline
// under every per-person preference, agent↔agent mail included (Spec 53
// as-built). Changing any of them fails this test ON PURPOSE: that is a
// regression against an explicit operator sign-off, not a refactor.
test("renderMarkdown: approved-baseline styles are pinned verbatim", () => {
  const html = renderMarkdown(FIXTURE);
  const BASELINE = [
    // wrapper: font stack, 15px, near-black text, white card, 720px measure
    "font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;color:#1a1a1a;background:#ffffff;max-width:720px;padding:4px 2px",
    'h1 style="font-size:22px;margin:24px 0 8px"',
    'h2 style="font-size:18px;border-bottom:1px solid #ddd;padding-bottom:4px;margin:24px 0 8px"',
    'p style="margin:10px 0;line-height:1.55"',
    'code style="background:#f6f8fa;padding:1px 4px;border-radius:3px;font-size:13px"',
    'th style="border:1px solid #ddd;padding:6px 8px;text-align:left;vertical-align:top;background:#f6f8fa"',
    'td style="border:1px solid #ddd;padding:6px 8px;text-align:left;vertical-align:top"',
    'style="color:#0b57d0"',
  ];
  for (const fragment of BASELINE) {
    assert.ok(html.includes(fragment), `approved baseline fragment missing: ${fragment}`);
  }
});

test("resolveMarkdownBody: body_text-only sends render by default (2026-07-05 hardening)", () => {
  const { body_html, body_text } = resolveMarkdownBody({ body_text: "plain reply\n\nwith **bold**" });
  assert.ok(body_html, "body_text-only must produce rendered html");
  assert.ok(body_html.includes("background:#ffffff"), "renders in the approved baseline wrapper");
  assert.match(body_html, /<strong>bold<\/strong>/);
  assert.equal(body_text, "plain reply\n\nwith **bold**");
});

test("resolveMarkdownBody: explicit body_html still wins (report register untouched)", () => {
  const custom = "<div>REPORT</div>";
  const { body_html } = resolveMarkdownBody({ body_text: "t", body_html: custom, body_markdown: "# nope" });
  assert.equal(body_html, custom);
});

test("resolveMarkdownBody: body_markdown renders and derives text", () => {
  const { body_html, body_text } = resolveMarkdownBody({ body_markdown: "# Hi\n\n- a" });
  assert.match(body_html, /<h1[^>]*>Hi<\/h1>/);
  assert.ok(body_text.includes("Hi"));
});

test("renderMarkdown: task-list bullets render check/box marks, never literal [x]", () => {
  const html = renderMarkdown("- [x] shipped the thing\n- [ ] still open\n- plain item");
  assert.match(html, /<span style="color:#1a7f37">\u2713<\/span> shipped the thing/);
  assert.match(html, /<span style="color:#888">\u2610<\/span> still open/);
  assert.match(html, /<li[^>]*>plain item<\/li>/);
  assert.doesNotMatch(html, /\[x\]/);
  assert.doesNotMatch(html, /\[ \]/);
});

// \u2500\u2500 verdict accents (Spec 70 P4) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
//
// The house report style pins verdict lines as bold text ending "\u2014 VERDICT"
// (e.g. "**NVDA \u2014 RISK**"). Each recognized verdict word gets a semantic
// left-border + tinted background chip on the SAME <strong> tag; text stays
// ink (untouched color) \u2014 only the frame carries the verdict color. This is
// md_render.js's inline() path, so it applies identically whether the
// markdown is rendered for email OR the /r/ viewer page (one render path,
// both surfaces \u2014 report_view.js's chartRenderer hook only intercepts
// ```chart fences, never prose).

test("verdict accent: RISK gets the red border + tinted chip, text stays ink (untouched)", () => {
  const html = renderMarkdown("**NVDA \u2014 RISK**");
  const { border, bg } = VERDICT_COLORS.RISK;
  const expectedTag =
    `<strong style="border-left:3px solid ${border};background-color:${bg};` +
    'padding:2px 8px;border-radius:3px;display:inline-block">NVDA \u2014 RISK</strong>';
  assert.ok(html.includes(expectedTag), `expected tag missing: ${expectedTag}`);
  // The text itself carries no color override \u2014 it's still the plain
  // <strong> content, only the chip's frame is colored.
  assert.ok(!html.includes("color:#a02d2d\">NVDA"), "verdict text is not repainted \u2014 only the chip frame is");
});

test("verdict accent: CONFIRMING gets the green border + tinted chip", () => {
  const html = renderMarkdown("**LLY \u2014 CONFIRMING**");
  assert.match(html, new RegExp(`border-left:3px solid ${VERDICT_COLORS.CONFIRMING.border};background-color:${VERDICT_COLORS.CONFIRMING.bg}`));
  assert.match(html, /<strong[^>]*>LLY \u2014 CONFIRMING<\/strong>/);
});

test("verdict accent: BUY shares CONFIRMING's green (both are affirming verdicts)", () => {
  const html = renderMarkdown("**AAPL \u2014 BUY**");
  assert.match(html, new RegExp(`border-left:3px solid ${VERDICT_COLORS.BUY.border};background-color:${VERDICT_COLORS.BUY.bg}`));
  assert.equal(VERDICT_COLORS.BUY.border, VERDICT_COLORS.CONFIRMING.border);
  assert.equal(VERDICT_COLORS.BUY.bg, VERDICT_COLORS.CONFIRMING.bg);
});

test("verdict accent: WATCHLIST gets the amber border + tinted chip", () => {
  const html = renderMarkdown("**TSM \u2014 WATCHLIST**");
  assert.match(html, new RegExp(`border-left:3px solid ${VERDICT_COLORS.WATCHLIST.border};background-color:${VERDICT_COLORS.WATCHLIST.bg}`));
});

test("verdict accent: PASS gets the neutral gray border + tinted chip", () => {
  const html = renderMarkdown("**AVGO \u2014 PASS**");
  assert.match(html, new RegExp(`border-left:3px solid ${VERDICT_COLORS.PASS.border};background-color:${VERDICT_COLORS.PASS.bg}`));
});

test("verdict accent: NOTHING MATERIAL shares PASS's neutral gray", () => {
  const html = renderMarkdown("**MSFT \u2014 NOTHING MATERIAL**");
  assert.match(html, new RegExp(`border-left:3px solid ${VERDICT_COLORS["NOTHING MATERIAL"].border};background-color:${VERDICT_COLORS["NOTHING MATERIAL"].bg}`));
  assert.equal(VERDICT_COLORS["NOTHING MATERIAL"].border, VERDICT_COLORS.PASS.border);
});

test("verdict accent: no-match degrades to plain <strong>, no chip, no border", () => {
  const plainBold = renderMarkdown("**bold text**");
  assert.match(plainBold, /<strong>bold text<\/strong>/);
  assert.ok(!plainBold.includes("border-left"));

  // A dash without a recognized verdict word also degrades plain.
  const notAVerdict = renderMarkdown("**NVDA \u2014 Interesting quarter**");
  assert.match(notAVerdict, /<strong>NVDA \u2014 Interesting quarter<\/strong>/);
  assert.ok(!notAVerdict.includes("border-left"));

  // A verdict word WITHOUT the leading em dash + word boundary also degrades
  // (the regex requires "\u2014" immediately before the verdict token).
  const noDash = renderMarkdown("**RISK ahead this quarter**");
  assert.match(noDash, /<strong>RISK ahead this quarter<\/strong>/);
  assert.ok(!noDash.includes("border-left"));
});

test("verdict accent: works inside the SAME render path the /r/ viewer uses (report_view.js's pageChartRenderer only hooks ```chart fences)", () => {
  const md = "## Summary\n\n**NVDA \u2014 RISK**\n\nSome prose after.";
  const html = renderMarkdown(md); // no chartRenderer opt \u2014 same code path report_view.js's non-chart prose takes
  assert.match(html, new RegExp(`border-left:3px solid ${VERDICT_COLORS.RISK.border}`));
});
