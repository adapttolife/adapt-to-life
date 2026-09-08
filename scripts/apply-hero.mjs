#!/usr/bin/env node
// scripts/apply-hero.mjs — set the homepage header.
//
//   node scripts/apply-hero.mjs 1     # the mosaic (Alec's decision, 2026-09-08)
//   node scripts/apply-hero.mjs 8     # or any other variant in the lab
//
// Writes the chosen variant into public/index.html: the hero markup, the
// stylesheet it needs, its generated layout rules, and the stage script. It is
// IDEMPOTENT — run it twice, or run it with a different number, and you get the
// same clean result, because it replaces the whole region between the two hero
// markers rather than appending to it.
//
// This exists so that changing the front page of the site is one command and a
// one-line diff to review, rather than a hand-merge of four separate fragments
// that someone will get 3-out-of-4 right at 1am. The definitions come from
// lib/heroes.mjs, the same file the comparison lab reads, so what Alec approved
// at /hero-N and what ships are the same bytes.
import { readFileSync, writeFileSync } from "node:fs";
import { VARIANTS, LABEL, STAGE_JS, ROOT, HERO_START, HERO_END, sheetFor } from "./lib/heroes.mjs";

const key = String(process.argv[2] || "").trim();
if (!VARIANTS[key]) {
  console.error(`usage: node scripts/apply-hero.mjs <${Object.keys(VARIANTS).join("|")}>`);
  process.exit(1);
}

const FILE = new URL("index.html", ROOT);
let html = readFileSync(FILE, "utf8");

// 1 · the hero region itself
const a = html.indexOf(HERO_START);
const b = html.indexOf(HERO_END);
if (a < 0 || b < 0) throw new Error("hero markers not found in index.html");
html = html.slice(0, a) + VARIANTS[key] + html.slice(b);

// 2 · the stylesheet. Marked so re-running swaps it instead of stacking.
const SHEET_RE = /\n<!-- hero:sheet -->\n<link rel="stylesheet" href="\/css\/hero-[a-z]+\.css">/;
const sheet = `\n<!-- hero:sheet -->\n<link rel="stylesheet" href="/css/${sheetFor(key)}.css">`;
html = SHEET_RE.test(html)
  ? html.replace(SHEET_RE, sheet)
  : html.replace('<link rel="stylesheet" href="/css/site.css">',
                 `<link rel="stylesheet" href="/css/site.css">${sheet}`);

// 3 · the stage script, same marker discipline
const JS_RE = /\n<!-- hero:script -->[\s\S]*?<!-- \/hero:script -->/;
const js = `\n<!-- hero:script -->${STAGE_JS}<!-- /hero:script -->`;
html = JS_RE.test(html) ? html.replace(JS_RE, js) : html.replace("</body>", `${js}\n</body>`);

writeFileSync(FILE, html);
console.log(`public/index.html now carries ${LABEL[key]} (${sheetFor(key)}.css)`);
console.log("next: node scripts/build-hero-lab.mjs && npm run stamp");
