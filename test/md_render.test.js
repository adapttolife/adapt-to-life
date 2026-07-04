// Spec 53 — unit tests for src/md_render.js. Standalone `node --test`, no new
// dependencies (node's built-in test runner + assert).
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderMarkdown, deriveText } from "../src/md_render.js";

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
