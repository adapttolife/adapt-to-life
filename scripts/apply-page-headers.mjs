#!/usr/bin/env node
// scripts/apply-page-headers.mjs — put the banner language on the interior pages.
//
//   node scripts/apply-page-headers.mjs
//
// Alec, 2026-09-08: the mosaic is the front page, "the other one for the other
// pages in the website". This applies that: every plain `hero dark` gets the
// column strip from variant 2, held well back, with the page's own words
// untouched on top of it.
//
// It is a SCRIPT rather than thirteen hand edits for the obvious reason — the
// strip is identical on every page, so it should exist in one place and be
// stamped out. It is also IDEMPOTENT: it strips any block it previously wrote
// before writing again, so re-running after a design change updates every page
// rather than nesting a second copy inside the first.
//
// Two deliberate exclusions:
//   · hero-2col pages (tim, hustle-and-heart) already carry a photograph of
//     their own subject. A texture band behind a portrait of Tim would be
//     two pictures arguing.
//   · the homepage, which has the mosaic.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";

const ROOT = new URL("../public/", import.meta.url);

// Eight columns, bottom-aligned, heights varying so the top edge is a skyline
// rather than a ruler. `far` is the back pair — dimmer and slightly blurred, so
// the band has depth rather than being one flat row.
const COLUMNS = [
  ["c1", "bn-reach",  true],
  ["c2", "bn-swing",  false],
  ["c3", "bn-white",  true],
  ["c4", "bn-brian",  false],
  ["c5", "bn-seated", true],
  ["c6", "bn-dink",   false],
  ["c7", "bn-grin",   true],
  ["c8", "bn-smile",  false],
];

const PANELS = JSON.parse(
  readFileSync(new URL("images/hero/panels/panels.json", ROOT), "utf8"));

const strip = [
  '    <!-- page-header:strip -->',
  '    <div class="pg-strip" aria-hidden="true">',
  ...COLUMNS.map(([cls, name, far]) => {
    const m = PANELS[name];
    if (!m) throw new Error(`"${name}" is not in panels.json`);
    return `      <figure class="${cls}${far ? " far" : ""}">` +
      `<img src="/images/hero/panels/${name}.webp" width="${m.w}" height="${m.h}" ` +
      `alt="" loading="lazy" decoding="async"></figure>`;
  }),
  '    </div>',
  '    <div class="pg-veil"></div>',
  '    <div class="pg-grain"></div>',
  '    <!-- /page-header:strip -->',
].join("\n");

const SKIP = new Set(["index.html", "review.html", "photo-picks.html"]);
const STRIP_RE = /\n    <!-- page-header:strip -->[\s\S]*?<!-- \/page-header:strip -->/g;
const SHEET = '<link rel="stylesheet" href="/css/page-header.css">';

let changed = 0;
for (const file of readdirSync(ROOT).filter((f) => f.endsWith(".html"))) {
  if (SKIP.has(file) || file.startsWith("hero-")) continue;
  const url = new URL(file, ROOT);
  let html = readFileSync(url, "utf8");

  // idempotence first: remove anything a previous run left behind
  html = html.replace(STRIP_RE, "");

  // Only plain `hero dark` heroes. A hero that already carries a photograph of
  // its own subject keeps it.
  //
  // The class list is matched loosely and then REWRITTEN, because after a first
  // run the tag already says `hero dark pg-band` — a strict match on the
  // original spelling made the second run treat every page as ineligible,
  // remove the strip, and leave the site bare. Idempotence has to survive the
  // change the script itself makes.
  const open = html.match(/<section class="hero dark([^"]*)">/);
  const modifiers = open ? open[1].split(/\s+/).filter(Boolean) : [];
  const eligible = open && !modifiers.some((c) => c === "hero-2col" || c === "hero-cine" || c === "hero-split");
  if (!eligible) {
    if (html.includes(SHEET)) {
      writeFileSync(url, html.replace(`\n${SHEET}`, ""));
      console.log(`${file.padEnd(30)} not a plain hero — stripped`);
    }
    continue;
  }

  const classes = ["hero", "dark", ...modifiers.filter((c) => c !== "pg-band"), "pg-band"];
  html = html.replace(open[0], `<section class="${classes.join(" ")}">\n${strip}`);
  if (!html.includes(SHEET)) {
    html = html.replace('<link rel="stylesheet" href="/css/site.css">',
                        `<link rel="stylesheet" href="/css/site.css">\n${SHEET}`);
  }
  writeFileSync(url, html);
  changed += 1;
  console.log(`${file.padEnd(30)} banded`);
}
console.log(`\n${changed} page header(s) written. Next: npm run stamp`);
