#!/usr/bin/env node
// scripts/check-palette.mjs — is the site still on Laura's palette?
//
//   node scripts/check-palette.mjs
//
// Alec, 2026-09-09: "Help me update the whole website based on our latest color
// scheme. I don't like the white we have. I prefer off white that Laura
// recommended. Let's be thorough and make sure our website leverages the color
// theory that Laura's has dialed in."
//
// The palette had drifted, and it drifted the way palettes always do: nobody
// changed it on purpose. The brand says off-white #F9F7F2 and beige #EFE8DC;
// the site had invented #FBFAF6 and #F4EEE1 — both close enough that no one
// notices in isolation and wrong enough that Alec could feel it — plus 46
// declarations of PURE WHITE, which the brand does not contain at all.
//
// So the values are asserted rather than trusted. If somebody nudges --canvas
// to something that "looks about right", this fails and names the brand value.
import { readFileSync, readdirSync } from "node:fs";

// Laura, via the Aug 13 hex drop (ManyRequests email + brand standards doc).
const BRAND = {
  "--orange": "#FF5C39",
  // The page is the BEIGE and the off-white lifts off it, not the other way
  // round. Off-white is only 6.9% darker than pure white, so at full-page
  // scale it reads as white — Alec called that twice. The beige is 18.8%
  // darker, three and a half times the separation.
  "--canvas": "#EFE8DC", // beige — the page
  "--paper": "#F9F7F2", // off-white — cards and lifted bands
  "--cream": "#F9F7F2", // off-white, for text on dark
  "--sand": "#EFE8DC", // beige
  "--ink": "#3B3B46", // Laura's black, confirmed 2026-09-09; on the site since the Nov 2026 refresh
  "--yellow": "#F6BE00",
  "--teal": "#00B7BD",
  "--purple": "#483698",
};

// Laura typed the brand black as #3B3V46, which is not a hex colour — V is not
// a hex digit. Until she sends the corrected value, #1A1A1A stands in (taken
// from the flat logo rebuild). This is recorded here rather than in a note so
// that whoever gets her correction knows exactly what to change and where.
const BLACK_IS_A_STAND_IN = false; // resolved: Laura confirmed #3B3B46 (Brand Standards doc, 2026-09-09)

// src/, not public/. From 2026-09-09 public/css is a BUILD ARTEFACT written by
// scripts/build-css.mjs, so a failure reported against it would name a file
// nobody should edit — the same reasoning this file already applies to the
// Vite admin bundle below.
const css = readFileSync(new URL("../src/css/site.css", import.meta.url), "utf8");
let bad = 0;
const fail = (m) => {
  console.log(`  FAIL ${m}`);
  bad++;
};

for (const [token, want] of Object.entries(BRAND)) {
  const m = css.match(new RegExp(`${token}\\s*:\\s*(#[0-9A-Fa-f]{6})`));
  if (!m) fail(`${token} is not defined in site.css`);
  else if (m[1].toUpperCase() !== want) fail(`${token} is ${m[1]}, brand says ${want}`);
}

// Pure white is not in this brand. Pure BLACK is allowed and deliberate: the
// dark photographic bands are pitch black on purpose ("the black and white
// pictures with pitch black looks way better" — Alec, 2026-09-08).
const ROOT = new URL("../public/", import.meta.url);
const WHITE =
  /\b(color|background|background-color|border-color|fill|stroke)\s*:\s*#(fff|ffffff)\b/gi;

// THE OFF-WHITE, DIALED IN (Alec, Nov 6 2026: "On the live site now we have an
// off white which I like but let's dial that in. I prefer off white than
// white."). The brand has exactly two light neutrals: off-white #F9F7F2 and
// beige #EFE8DC. Any other near-white is drift, and drift is how the site
// once ended up with #FBFAF6 and #F4EEE1 that nobody chose: a scrolled nav at
// #FBFAF6, photo frames at #ECE9E4, a loading skeleton at #F2F2F2. So every
// solid colour this light must be one of the two, and translucent white text
// (rgba(255,255,255,0.72) reads as a cool grey) must be the off-white instead.
const LIGHT_OK = new Set([
  "f9f7f2", // off-white
  "efe8dc", // beige
  "fcffe6", // artwork, not a surface: the shine on the pickleball in the partner x mark
]);
const lumOf = (r, g, b) => {
  const f = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
function nearWhites(text) {
  const out = [];
  const decl =
    /\b(color|background|background-color|border-color|fill|stroke)\s*:\s*([^;}"]+)/gi;
  for (const [, prop, value] of text.matchAll(decl)) {
    for (const [hex] of value.matchAll(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/gi)) {
      let h = hex.slice(1).toLowerCase();
      if (h.length === 3) h = [...h].map((c) => c + c).join("");
      const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
      if (h !== "ffffff" && lumOf(r, g, b) >= 0.8 && !LIGHT_OK.has(h))
        out.push(`${prop}: ${hex} is a near-white off the palette`);
    }
    for (const [m, r, g, b, a] of value.matchAll(
      /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)/gi,
    )) {
      const alpha = a === undefined ? 1 : Number(a);
      const [R, G, B] = [r, g, b].map(Number);
      if (alpha < 0.5 || lumOf(R, G, B) < 0.8) continue;
      if (LIGHT_OK.has([R, G, B].map((x) => x.toString(16).padStart(2, "0")).join("")))
        continue;
      out.push(`${prop}: ${m} is a near-white off the palette`);
    }
  }
  return out;
}
const walk = (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    // The hero lab pages (hero-1..9, hero-review) and the lab-only spectrum
    // sheet are frozen experiments. hero-mosaic.css is NOT: it is the live
    // homepage hero, and its pure-white headline slipped through this skip
    // until Nov 2026.
    if (/^hero-(\d|review|spectrum)/.test(e.name)) continue;
    // The admin app's stylesheet is a Vite build artefact — the palette has to
    // be fixed in src/ and rebuilt, not edited here, so checking the output
    // would only ever report a file nobody should touch. The hand-written admin
    // pages ARE checked; they are on the palette.
    if (e.name === "assets") continue;
    // public/css is generated from src/css; the source is walked separately
    // below so a pure-white hex is reported at the file you would fix.
    if (e.name === "css") continue;
    const url = new URL(e.name + (e.isDirectory() ? "/" : ""), dir);
    if (e.isDirectory()) {
      walk(url);
      continue;
    }
    if (!/\.(html|css)$/.test(e.name)) continue;
    const text = readFileSync(url, "utf8");
    const hits = text.match(WHITE);
    if (hits)
      fail(
        `${e.name}: ${hits.length} pure-white declaration(s) — the brand has no pure white`,
      );
    for (const h of nearWhites(text))
      fail(`${e.name}: ${h} — use Laura's off-white #F9F7F2 or beige #EFE8DC`);
  }
};
walk(ROOT);
walk(new URL("../src/css/", import.meta.url));

if (BLACK_IS_A_STAND_IN)
  console.log(
    "  note  --ink #1A1A1A is a STAND-IN; Laura's brand black (#3B3V46) is not valid hex and is still owed.",
  );
console.log(bad ? `\n${bad} palette problem(s).` : "\non Laura's palette.");
process.exit(bad ? 1 : 0);
