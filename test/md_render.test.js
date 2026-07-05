// Spec 53 — unit tests for src/md_render.js. Standalone `node --test`, no new
// dependencies (node's built-in test runner + assert).
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderMarkdown, deriveText, resolveMarkdownBody } from "../src/md_render.js";

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
