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
  "--canvas": "#F9F7F2",  // off-white
  "--paper":  "#F9F7F2",  // off-white
  "--cream":  "#F9F7F2",  // off-white, for text on dark
  "--sand":   "#EFE8DC",  // beige
  "--ink":    "#1A1A1A",  // STAND-IN, see below
  "--yellow": "#F6BE00",
  "--teal":   "#00B7BD",
  "--purple": "#483698",
};

// Laura typed the brand black as #3B3V46, which is not a hex colour — V is not
// a hex digit. Until she sends the corrected value, #1A1A1A stands in (taken
// from the flat logo rebuild). This is recorded here rather than in a note so
// that whoever gets her correction knows exactly what to change and where.
const BLACK_IS_A_STAND_IN = true;

const css = readFileSync(new URL("../public/css/site.css", import.meta.url), "utf8");
let bad = 0;
const fail = (m) => { console.log(`  FAIL ${m}`); bad++; };

for (const [token, want] of Object.entries(BRAND)) {
  const m = css.match(new RegExp(`${token}\\s*:\\s*(#[0-9A-Fa-f]{6})`));
  if (!m) fail(`${token} is not defined in site.css`);
  else if (m[1].toUpperCase() !== want) fail(`${token} is ${m[1]}, brand says ${want}`);
}

// Pure white is not in this brand. Pure BLACK is allowed and deliberate: the
// dark photographic bands are pitch black on purpose ("the black and white
// pictures with pitch black looks way better" — Alec, 2026-09-08).
const ROOT = new URL("../public/", import.meta.url);
const WHITE = /\b(color|background|background-color|border-color|fill|stroke)\s*:\s*#(fff|ffffff)\b/gi;
const walk = (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith("hero-")) continue;
    // The admin app's stylesheet is a Vite build artefact — the palette has to
    // be fixed in src/ and rebuilt, not edited here, so checking the output
    // would only ever report a file nobody should touch. The hand-written admin
    // pages ARE checked; they are on the palette.
    if (e.name === "assets") continue;
    const url = new URL(e.name + (e.isDirectory() ? "/" : ""), dir);
    if (e.isDirectory()) { walk(url); continue; }
    if (!/\.(html|css)$/.test(e.name)) continue;
    const hits = readFileSync(url, "utf8").match(WHITE);
    if (hits) fail(`${e.name}: ${hits.length} pure-white declaration(s) — the brand has no pure white`);
  }
};
walk(ROOT);

if (BLACK_IS_A_STAND_IN)
  console.log("  note  --ink #1A1A1A is a STAND-IN; Laura's brand black (#3B3V46) is not valid hex and is still owed.");
console.log(bad ? `\n${bad} palette problem(s).` : "\non Laura's palette.");
process.exit(bad ? 1 : 0);
