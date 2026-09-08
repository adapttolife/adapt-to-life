#!/usr/bin/env node
// scripts/apply-fonts.mjs — set the site's typeface, everywhere, in one pass.
//
//   node scripts/apply-fonts.mjs
//
// Alec, 2026-09-08: "Use Sofia Sans and Sofia Sans ExtraBold and lean into that
// as the new font style for adapttolife.org."
//
// The families themselves live in three CSS variables in site.css, so the rules
// never name a font. What this script owns is the other half: the <link> that
// actually fetches the font, which is embedded in the <head> of every page,
// in the volunteer page generator, and in the OG card template.
//
// It is a script rather than sixty edits because the link has to be IDENTICAL
// everywhere. A page that loads a different weight range renders the same
// headline at a different thickness, and that is the kind of drift nobody spots
// until it is in a screenshot on someone's phone.
//
// Idempotent: it replaces any existing Google Fonts link rather than adding
// one, so re-running after a change to WEIGHTS updates the whole site.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";

const ROOT = new URL("../public/", import.meta.url);

// One variable family. 400-900 covers body (400/500), UI (600/700) and the
// ExtraBold display voice (800); the italic axis is requested because the
// accent word in the headline uses it.
const HREF =
  "https://fonts.googleapis.com/css2?family=Sofia+Sans:ital,wght@0,400..900;1,400..900&display=swap";
const LINK = `<link href="${HREF}" rel="stylesheet">`;

// display=block for the OG cards: they are rendered once, headless, into a
// PNG, so a swap-in flash is not a flash — it is a card shipped in the
// fallback face. Correctness beats speed when nobody is waiting.
const OG_LINK = `<link href="${HREF.replace("display=swap", "display=block")}" rel="stylesheet">`;

const GF_LINK = /<link href="https:\/\/fonts\.googleapis\.com\/css2\?[^"]*" rel="stylesheet">/g;

function retype(file, url, link) {
  const before = readFileSync(url, "utf8");
  if (!GF_LINK.test(before)) return false;
  GF_LINK.lastIndex = 0;
  // collapse any number of existing font links down to exactly one
  let seen = false;
  const after = before.replace(GF_LINK, () => (seen ? "" : ((seen = true), link)));
  if (after === before) return false;
  writeFileSync(url, after);
  return true;
}

let n = 0;
const walk = (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const url = new URL(e.name + (e.isDirectory() ? "/" : ""), dir);
    if (e.isDirectory()) walk(url);
    else if (e.name.endsWith(".html") && retype(e.name, url, LINK)) n++;
  }
};
walk(ROOT);

// the two templates that generate HTML rather than being it
for (const [rel, link] of [["../src/og/card.html", OG_LINK],
                           ["../scripts/build-volunteer.mjs", LINK]]) {
  const url = new URL(rel, import.meta.url);
  if (retype(rel, url, link)) {
    n++;
    console.log(`${rel} (template)`);
  }
}

console.log(`${n} file(s) now load Sofia Sans.`);
console.log("Next: npm run volunteer && npm run cards && npm run stamp");
