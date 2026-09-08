// scripts/build-hero-lab.mjs — the comparison lab.
//
// Builds /hero-1 … /hero-9: complete homepages that differ in exactly one
// section, so Alec compares headers and not pages. Each is the real index.html
// with its hero swapped, which means the nav, the campaign band, the whole
// scroll and every downstream section behave exactly as they will after a
// merge. A mockup that is not the live page is a mockup you re-verify later.
//
// The definitions live in scripts/lib/heroes.mjs because apply-hero.mjs — the
// script that writes the CHOSEN header into the real homepage — needs the same
// markup. Duplicating it would guarantee the two drift.
//
// Regenerate after ANY edit to index.html or to a variant:
//   node scripts/build-hero-lab.mjs && npm run stamp
import { readFileSync, writeFileSync } from "node:fs";
import { VARIANTS, LABEL, STAGE_JS, ROOT, HERO_START, HERO_END, sheetFor } from "./lib/heroes.mjs";

const src = readFileSync(new URL("index.html", ROOT), "utf8");
const a = src.indexOf(HERO_START);
const b = src.indexOf(HERO_END);
if (a < 0 || b < 0) throw new Error("hero markers not found in index.html");

function switcher(active) {
  const items = ["1", "2", "3", "4", "5", "6", "7", "8", "9"]
    .map(
      (k) =>
        `<a href="/hero-${k}" class="hv-chip${k === active ? " on" : ""}">${LABEL[k]}</a>`,
    )
    .join("");
  return `
<style>
  .hv-bar{ position:fixed; left:50%; bottom:18px; transform:translateX(-50%); z-index:9999;
    display:flex; gap:4px; padding:5px; border-radius:999px;
    background:rgba(14,14,16,0.82); backdrop-filter:blur(12px); -webkit-backdrop-filter:blur(12px);
    border:1px solid rgba(255,255,255,0.16); box-shadow:0 18px 44px -18px rgba(0,0,0,0.8); }
  .hv-chip{ font-family:"Space Mono",monospace; font-size:0.68rem; letter-spacing:0.06em;
    color:#CFC9BD; padding:0.5rem 0.85rem; border-radius:999px; white-space:nowrap; text-decoration:none; }
  .hv-chip:hover{ color:#fff; background:rgba(255,255,255,0.08); }
  .hv-chip.on{ color:#fff; background:var(--orange-ink); }
  @media print{ .hv-bar{ display:none; } }
</style>
<div class="hv-bar">${items}</div>
`;
}

for (const [key, hero] of Object.entries(VARIANTS)) {
  let out = src.slice(0, a) + hero + src.slice(b);
  out = out
    .replace(
      '<link rel="stylesheet" href="/css/site.css">',
      '<link rel="stylesheet" href="/css/site.css">\n<link rel="stylesheet" href="/css/hero-mosaic.css">' +
        ("3456789".includes(key) ? '\n<link rel="stylesheet" href="/css/hero-spectrum.css">' : ""),
    )
    .replace(
      "</head>",
      '<meta name="robots" content="noindex,nofollow">\n</head>',
    )
    .replace(
      /<title>[^<]*<\/title>/,
      `<title>Header ${LABEL[key]} | Adapt To Life</title>`,
    )
    .replace("</body>", `${STAGE_JS}${switcher(key)}</body>`);
  writeFileSync(new URL(`hero-${key}.html`, ROOT), out);
  console.log(`wrote public/hero-${key}.html (${(out.length / 1024).toFixed(1)} KB)`);
}
