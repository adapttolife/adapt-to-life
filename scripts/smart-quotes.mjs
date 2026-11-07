#!/usr/bin/env node
// scripts/smart-quotes.mjs — typographer's quotes in the copy people read.
//
//   node scripts/smart-quotes.mjs           fix every page in place
//   node scripts/smart-quotes.mjs --check   fail if any page still has one
//   node scripts/smart-quotes.mjs --list    print each change, write nothing
//
// Found in the Nov 6 2026 design review: the site's copy used straight
// typewriter marks ("We're", "Juan's", "The chair didn't fix me") beside
// pages that already used &rsquo; and &ldquo;. A straight quote at display
// size is one of the small tells that a page was not set by a designer, and
// Alec asked for everything in that review to be fixed.
//
// What it changes, and only in text a visitor reads:
//   '  ->  &rsquo; (apostrophe or closing) or &lsquo; (opening)
//   "  ->  &ldquo; (opening) or &rdquo; (closing)
//   ... -> &hellip;
// Entities, not the characters, because that is what the pages already use.
//
// What it never touches: tags and their attributes, comments (the generator
// markers carry JSON), and the raw-text elements (script, style, pre, code,
// textarea, svg and friends). Generators run their output through smarten()
// so what they stamp is already right and --check stays green.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUB = join(ROOT, "public");

// Elements whose content is not prose.
const RAW = new Set([
  "script",
  "style",
  "pre",
  "code",
  "kbd",
  "samp",
  "var",
  "textarea",
  "svg",
  "math",
]);
// Tags that sit inside a run of text. Any other tag starts a new run, so a
// quote right after it opens.
const INLINE = new Set([
  "a",
  "abbr",
  "b",
  "bdi",
  "bdo",
  "cite",
  "data",
  "dfn",
  "em",
  "i",
  "label",
  "mark",
  "q",
  "s",
  "small",
  "span",
  "strong",
  "sub",
  "sup",
  "time",
  "u",
  "wbr",
]);

const SPACE = /[\s    ]/;
// After these a quote opens: start of a run, a space, an opening bracket or
// quote, a dash.
const OPENER = /[\s    ([{“‘—–/-]/;
const WORD = /[\p{L}\p{N}]/u;
// An apostrophe that starts a word: '26, '90s, 'til, 'em, 'cause, rock 'n'.
const ELISION = /^(?:\d\d|em\b|til\b|cause\b|n\b|round\b|bout\b)/i;

const NAMED = {
  nbsp: " ",
  ensp: " ",
  emsp: " ",
  thinsp: " ",
  mdash: "—",
  ndash: "–",
  ldquo: "“",
  rdquo: "”",
  lsquo: "‘",
  rsquo: "’",
  quot: '"',
  apos: "'",
  amp: "&",
  lt: "<",
  gt: ">",
};
function entityChar(ent) {
  const body = ent.slice(1, -1);
  if (body[0] === "#")
    return String.fromCodePoint(
      body[1] === "x" || body[1] === "X"
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10),
    );
  return NAMED[body.toLowerCase()] ?? "x";
}

// One run of text. `prev` is the last character a reader saw before it (a
// space at the start of a block). Returns the new text and the new prev.
function smartenRun(text, prev, changes) {
  let out = "";
  let i = 0;
  // the character after position j, entities read as the character they are
  const nextChar = (j) => {
    if (j >= text.length) return "x"; // a tag follows: the quote leads into it
    if (text[j] === "&") {
      const m = /^&(#\d+|#x[0-9a-f]+|[a-z]+);/i.exec(text.slice(j));
      if (m) return entityChar(m[0]);
    }
    return text[j];
  };
  while (i < text.length) {
    const c = text[i];
    if (c === "&") {
      const m = /^&(#\d+|#x[0-9a-f]+|[a-z]+);/i.exec(text.slice(i));
      if (m) {
        const ch = entityChar(m[0]);
        // &quot; and &#39; in prose are quotes like any other
        if (ch === '"' || ch === "'") {
          const r = mark(ch, prev, nextChar(i + m[0].length));
          changes.push([m[0], r, ctx(text, i, m[0].length, r)]);
          out += r;
          prev = r === "&ldquo;" ? "“" : r === "&lsquo;" ? "‘" : "x";
        } else {
          out += m[0];
          prev = ch;
        }
        i += m[0].length;
        continue;
      }
    }
    if (c === "'" || c === '"') {
      const r = mark(c, prev, nextChar(i + 1), text.slice(i + 1));
      changes.push([c, r, ctx(text, i, 1, r)]);
      out += r;
      prev = r === "&ldquo;" ? "“" : r === "&lsquo;" ? "‘" : "x";
      i++;
      continue;
    }
    if (c === "." && text.startsWith("...", i) && text[i + 3] !== ".") {
      changes.push(["...", "&hellip;", ctx(text, i, 3, "&hellip;")]);
      out += "&hellip;";
      prev = "x";
      i += 3;
      continue;
    }
    out += c;
    prev = c;
    i++;
  }
  return [out, prev];
}

const ctx = (text, i, n, r) =>
  (text.slice(Math.max(0, i - 50), i) + "[" + r + "]" + text.slice(i + n, i + n + 40))
    .replace(/\s+/g, " ")
    .trim();

function mark(q, prev, next, rest = "") {
  const opens = OPENER.test(prev) && !SPACE.test(next);
  if (q === '"') return opens ? "&ldquo;" : "&rdquo;";
  if (WORD.test(prev) && WORD.test(next)) return "&rsquo;"; // we're, Juan's
  if (opens) return ELISION.test(rest) ? "&rsquo;" : "&lsquo;";
  return "&rsquo;"; // closing, or athletes'
}

// The whole document. Tags, comments and raw-text elements pass through
// byte for byte; only the runs of text between them can change.
export function smarten(html, changes = []) {
  let out = "";
  let i = 0;
  let prev = " ";
  while (i < html.length) {
    if (html.startsWith("<!--", i)) {
      const end = html.indexOf("-->", i + 4);
      const e = end < 0 ? html.length : end + 3;
      out += html.slice(i, e);
      i = e;
      continue;
    }
    if (html[i] === "<" && /[a-zA-Z/!?]/.test(html[i + 1] || "")) {
      let j = i + 1;
      let q = null;
      for (; j < html.length; j++) {
        const c = html[j];
        if (q) {
          if (c === q) q = null;
        } else if (c === '"' || c === "'") q = c;
        else if (c === ">") break;
      }
      const tag = html.slice(i, j + 1);
      out += tag;
      i = j + 1;
      const m = /^<(\/?)([a-zA-Z][a-zA-Z0-9-]*)/.exec(tag);
      if (!m) continue;
      const name = m[2].toLowerCase();
      if (!INLINE.has(name)) prev = " ";
      if (!m[1] && RAW.has(name) && !tag.endsWith("/>")) {
        // copy through to the matching close tag untouched
        const close = new RegExp(`</${name}\\s*>`, "ig");
        close.lastIndex = i;
        const c = close.exec(html);
        const end = c ? c.index : html.length;
        out += html.slice(i, end);
        i = end;
      }
      continue;
    }
    let j = i + 1;
    while (j < html.length) {
      if (html.startsWith("<!--", j)) break;
      if (html[j] === "<" && /[a-zA-Z/!?]/.test(html[j + 1] || "")) break;
      j++;
    }
    const [t, p] = smartenRun(html.slice(i, j), prev, changes);
    out += t;
    prev = p;
    i = j;
  }
  return out;
}

// A plain string that is set as text (textContent, a JSON field rendered as
// text): the same rules, written as characters because there is no HTML
// parser on the other end to read an entity.
export function smartenText(s) {
  const html = smartenRun(s, " ", [])[0];
  return html
    .replace(/&rsquo;/g, "’")
    .replace(/&lsquo;/g, "‘")
    .replace(/&ldquo;/g, "“")
    .replace(/&rdquo;/g, "”")
    .replace(/&hellip;/g, "…");
}

// The pages a visitor can reach. The hero labs, the photo picker and the
// review index are internal tools and keep their working notes as they are.
export function pages() {
  const top = readdirSync(PUB)
    .filter(
      (f) =>
        f.endsWith(".html") && !/^(hero-|campaign-concepts|review|photo-picks)/.test(f),
    )
    .map((f) => join(PUB, f));
  const vol = readdirSync(join(PUB, "volunteer"))
    .filter((f) => f.endsWith(".html"))
    .map((f) => join(PUB, "volunteer", f));
  return [...top, ...vol];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes("--check");
  const list = process.argv.includes("--list");
  const stale = [];
  let total = 0;
  for (const file of pages()) {
    const before = readFileSync(file, "utf8");
    const changes = [];
    const after = smarten(before, changes);
    if (after === before) continue;
    const rel = file.slice(ROOT.length + 1);
    total += changes.length;
    if (list) {
      // each change with a little context, for a person to read
      for (const [, , where] of changes) console.log(`${rel}: ${where}`);
    } else if (check) stale.push(`${rel} (${changes.length})`);
    else writeFileSync(file, after);
  }
  if (check && stale.length) {
    console.error(
      "smart-quotes --check FAILED: straight quotes in visible copy. Run\n" +
        "`node scripts/smart-quotes.mjs` and commit the result.\n  " +
        stale.join("\n  "),
    );
    process.exit(1);
  }
  console.log(
    `smart-quotes${check ? " --check" : list ? " --list" : ""} ok (${total} marks${check || list ? " to fix" : " fixed"})`,
  );
}
