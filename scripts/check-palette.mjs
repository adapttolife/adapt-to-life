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
  "--canvas": "#EFE8DC", // Laura's beige — the page (Alec chose it over a lighter bone, Nov 2026)
  "--paper": "#F9F7F2", // off-white — cards and lifted bands
  "--cream": "#F9F7F2", // off-white, for text on dark
  "--sand": "#EFE8DC", // the page colour
  "--ink": "#3B3B46", // Laura's black, confirmed 2026-09-09; on the site since the Nov 2026 refresh
  "--yellow": "#F6BE00",
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
// white."). The site has exactly two light neutrals, both Laura's: the page,
// beige #EFE8DC, and the card, off-white #F9F7F2. Any other near-white is drift, and drift is how the site
// once ended up with #FBFAF6 and #F4EEE1 that nobody chose: a scrolled nav at
// #FBFAF6, photo frames at #ECE9E4, a loading skeleton at #F2F2F2. So every
// solid colour this light must be one of the two, and translucent white text
// (rgba(255,255,255,0.72) reads as a cool grey) must be the off-white instead.
const LIGHT_OK = new Set([
  "f9f7f2", // off-white
  "efe8dc", // Laura's beige, the page
  "fcffe6", // artwork, not a surface: the shine on the pickleball in the partner x mark
  "ffd6e8", // artwork: the shine on ACE's pink x mark on /ace
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
      fail(`${e.name}: ${h} — use the off-white #F9F7F2 or the beige #EFE8DC`);
  }
};
walk(ROOT);
walk(new URL("../src/css/", import.meta.url));

// THE WHOLE SYSTEM (Nov 6 2026, Alec: "Audit the whole website across the
// whole board and make sure our colors are consistent based on our latest
// progression"). Night & Orange is a closed set: every colour in a
// stylesheet or a page's styles must be one of these (translucent ones are
// judged by their base colour), or one of the few pieces of artwork below.
// Teal and purple are retired; the old orange ink, slate, the pre-refresh
// near-black, cool greys and translucent pure white are drift.
const SYSTEM = {
  "photo-black": "#0F0E0D",
  night: "#171513",
  "night-raised": "#23201D",
  beige: "#EFE8DC",
  "off-white": "#F9F7F2",
  ink: "#3B3B46",
  "ink-soft": "#3C382F",
  muted: "#6A675E",
  "cream-mute": "#CFC9BD",
  "cream-faint": "#BCB7AD",
  hairline: "#E7E1D5",
  orange: "#FF5C39",
  "orange-display": "#E64C2A",
  "orange-ink": "#B9391E",
  "orange-press": "#9E2F17",
  "orange-hot": "#FF765B",
  yellow: "#F6BE00",
  gold: "#D4A843",
  "gold-ink": "#80620F",
  "gold-press": "#BE9233",
  ok: "#2E7D32",
  // DATA COLOURS (Alec, Nov 7 2026: "Why can we not use green or some other
  // colors? T3 code design has their main color scheme then throw other
  // colors in there."). Night & Orange stays the brand; these two only ever
  // fill campaign bars and their legend swatches. Picked from the dataviz
  // reference palette and validated on both cards: CVD separation 26.5
  // (light card) and 27.3 (dark card) against a target of 8, and 3:1 or
  // better on each. Court time also carries a stripe, so colour never works
  // alone.
  "data-gift": "#008300", // gifts, on both cards
  "data-kind": "#2A78D6", // court time a partner club gives, light card
  "data-kind-dark": "#3987E5", // the same, stepped for the dark card
  // Their text shades for labels (T3 Code's recipe: a tint behind a deeper
  // shade). 5:1 or better on off-white, beige, Night and the raised Night.
  "good-ink": "#006300", // green label text on light
  "good-ink-dark": "#4CC38A", // green label text and dots on dark
  "info-ink": "#1C5CAB", // blue label text on light
  "info-ink-dark": "#86B6EF", // blue label text and dots on dark
  "win-ink": "#6B4F00", // win label text on light (yellow is the dot and tint)
  err: "#C0392B",
  black: "#000000", // shadows only
};
const ART = new Set([
  // ACE Pickleball Club's own brand colours, on /ace only (Alec, Nov 10 2026:
  // "use ACE's colour scheme and not just our colours... This is ACE and ATL").
  "3ec3f1", // ACE sky blue
  "ed0973", // ACE pink
  "c4075f", // ACE pink, darkened for text on light
  "ffd6e8", // the shine on ACE's pink x mark
  // Brick House's own brand colours, on /brickhouse only (Alec, Nov 11 2026)
  "3965b1", // Brick House blue
  "d2a62a", // Brick House gold
  "dff23d", // the pickleball in the partner x mark
  "fcffe6", // its shine
  "d9904f", // the bronze medal
  "cd7f32", // its ring
  "ff966e", // orange as light: the warm sky glow behind the home hero
  "ff6e46",
  "ff7850",
  "ff965a",
]);
const SYS = Object.values(SYSTEM).map((h) =>
  [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)),
);
function offSystem(text) {
  const out = [];
  const src = text.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const m of src.matchAll(
    /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*[\d.]+)?\s*\)/g,
  )) {
    let rgb;
    if (m[0][0] === "#") {
      let h = m[0].slice(1);
      if (h.length === 3) h = [...h].map((c) => c + c).join("");
      rgb = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
    } else rgb = [+m[1], +m[2], +m[3]];
    const hex = rgb.map((x) => x.toString(16).padStart(2, "0")).join("");
    if (ART.has(hex)) continue;
    const d = Math.min(
      ...SYS.map((v) => Math.hypot(rgb[0] - v[0], rgb[1] - v[1], rgb[2] - v[2])),
    );
    if (d > 6) out.push(m[0]);
  }
  return [...new Set(out)];
}
const STRICT = [
  ...readdirSync(new URL("../src/css/", import.meta.url))
    .filter((f) => f.endsWith(".css") && !/^hero-spectrum/.test(f))
    .map((f) => new URL(`../src/css/${f}`, import.meta.url)),
  ...readdirSync(ROOT)
    .filter(
      (f) =>
        f.endsWith(".html") &&
        !/^(hero-\d|hero-review|campaign-concepts|review|photo-picks)/.test(f),
    )
    .map((f) => new URL(f, ROOT)),
  ...readdirSync(new URL("volunteer/", ROOT))
    .filter((f) => f.endsWith(".html"))
    .map((f) => new URL(`volunteer/${f}`, ROOT)),
];
for (const url of STRICT) {
  let text = readFileSync(url, "utf8");
  if (url.pathname.endsWith(".html"))
    text = [...text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>|style="([^"]*)"/g)]
      .map((m) => m[1] || m[2] || "")
      .join("\n");
  const bad2 = offSystem(text);
  if (bad2.length)
    fail(
      `${url.pathname.split("/").pop()}: off the Night & Orange system: ${bad2.slice(0, 6).join(", ")}`,
    );
}

if (BLACK_IS_A_STAND_IN)
  console.log(
    "  note  --ink #1A1A1A is a STAND-IN; Laura's brand black (#3B3V46) is not valid hex and is still owed.",
  );
console.log(bad ? `\n${bad} palette problem(s).` : "\non Laura's palette.");
process.exit(bad ? 1 : 0);
