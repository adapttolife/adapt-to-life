#!/usr/bin/env node
// scripts/check-grid-occlusion.mjs — which mosaic cells can actually be SEEN?
//
//   npm run serve &            # or any static server on 8788
//   node scripts/check-grid-occlusion.mjs
//
// WHY THIS EXISTS
// ---------------
// Alec, 2026-09-08: "What if we just accept that some pictures will get
// cropped — that way we're not forced to try to make it all work. We can just
// be intentional with the pictures that are going to get cut off behind the
// text... it makes it way easier for us to have a little bit of a buffer when
// it comes to the flexbox constraints."
//
// That is a real design principle and it needs a real instrument, because the
// thing it depends on — how much of each cell the headline slab covers — is
// not something you can eyeball from a screenshot. I tried. I put a
// photograph of somebody's face in a cell that turned out to be 81% black
// slab, and the only reason anyone noticed was that Alec did.
//
// So: render the page at three real widths, and for every visible panel report
// how much of its box is (a) under the headline slab and (b) below the fold.
// Anything at or over 45% is a BUFFER SLOT — a position where no face should
// ever be placed, and where a photograph is doing structural work instead.
// MOSAIC_GRID in scripts/lib/heroes.mjs is ordered against this output.
//
// ONE MEASUREMENT TRAP, PAID FOR ONCE: the first version of this selected
// `.mw-scrim` as the type's box. The scrim is `inset:0` — it covers the whole
// hero — so every cell came back 100% occluded and the numbers looked
// authoritative and meant nothing. It measures `.mw-copy .display`, the
// headline itself. If a probe reports the same value for everything, the probe
// is measuring the wrong element.
import { chromium } from "/home/agentos/pw/node_modules/playwright/index.mjs";

const URL = process.env.SITE_URL || "http://127.0.0.1:8788/index.html";
// NO FACE MAY BE COVERED. This was 45% when the grid had twelve cells and two
// of them were deliberate "buffers" sitting behind the headline. Alec retired
// that idea on 2026-09-09 — "I want to use the best of the best of our images,
// not a picture of someone's back" — and the grid is four cells with the type
// in a band of its own, so nothing is occluded at all. The threshold follows
// the design: 10% is rounding and reflow, anything more is a regression.
const OCCLUDED_AT = 10;

const VIEWPORTS = [
  [390, 844, "phone"],
  [820, 1180, "ipad"],
  [1440, 900, "desktop"],
];

const browser = await chromium.launch();
const report = {};

for (const [width, height, tag] of VIEWPORTS) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.goto(URL, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1200); // the wall fades in; measure it settled

  const cells = await page.evaluate((vh) => {
    const slab = document.querySelector(".mw-copy .display").getBoundingClientRect();
    return [...document.querySelectorAll(".mw-p")]
      .filter((el) => getComputedStyle(el).display !== "none")
      .map((el, i) => {
        const r = el.getBoundingClientRect();
        const ox = Math.max(0, Math.min(r.right, slab.right) - Math.max(r.left, slab.left));
        const oy = Math.max(0, Math.min(r.bottom, slab.bottom) - Math.max(r.top, slab.top));
        return {
          name: el.className.match(/p-([a-z0-9-]+)/)[1],
          order: Number(getComputedStyle(el).order) || i,
          slab: Math.round(((ox * oy) / (r.width * r.height)) * 100),
          fold: Math.round((Math.max(0, r.bottom - vh) / r.height) * 100),
          y: Math.round(r.top),
        };
      })
      .sort((a, b) => a.y - b.y);
  }, height);

  console.log(`\n@${tag}  ${width}x${height}`);
  for (const c of cells) {
    const hidden = Math.min(100, c.slab + c.fold);
    const bar = "█".repeat(Math.round(hidden / 8)).padEnd(13);
    console.log(
      `  ${c.name.padEnd(12)} slab ${String(c.slab).padStart(3)}%  ` +
        `fold ${String(c.fold).padStart(3)}%  ${bar} ` +
        (hidden >= OCCLUDED_AT ? "COVERED" : "clear"),
    );
  }
  report[tag] = cells;
  await page.close();
}
await browser.close();

// The one assertion worth failing on: the cells Alec named have to be clear.
// smile-close is Aubrey, top-right on the phone — "I don't want to cut off her
// smile in the top-right picture."
// Every cell in the grid, not a hand-kept subset. The old list named four
// panels and had gone stale — it still listed `laugh`, which has not been in
// the mobile grid for two revisions, so the check was silently guarding a cell
// that did not exist while ignoring ones that did.
import { MOSAIC_GRID } from "./lib/heroes.mjs";

// THE GRID ONLY EXISTS BELOW 900px, so the rule only means something there.
// hero-mosaic.css switches to the four-cell grid at max-width:900px; above it
// the page renders the scattered wall, where MOSAIC_GRID membership carries no
// meaning at all and panels sitting partly behind the headline is the design —
// shout is 15% covered at 1440 and bench 24%, both deliberate, neither flagged.
//
// This asserted at every width, which was harmless only for as long as every
// grid cell happened to also be clear of the headline on desktop. whitecap
// broke that on 2026-09-09 by joining the grid: he is 39% behind the headline
// at 1440 by DESIGN — that is the frame Alec chose to fix with a text-shadow
// rather than by moving it. Asserting a phone rule against him at 1440 failed a
// build over a placement Alec had explicitly approved.
//
// Reporting is unchanged at all three widths — desktop numbers are still
// printed, and still worth reading. Only the ASSERTION is scoped.
const GRID_MAX = 900;
const GRID_WIDTHS = new Set(VIEWPORTS.filter(([w]) => w <= GRID_MAX).map(([, , tag]) => tag));
let bad = 0;
for (const [tag, cells] of Object.entries(report)) {
  if (!GRID_WIDTHS.has(tag)) continue;
  for (const c of cells) {
    if (!MOSAIC_GRID.includes(c.name)) continue;
    const hidden = Math.min(100, c.slab + c.fold);
    if (hidden >= OCCLUDED_AT) {
      console.log(`\nFAIL  ${c.name} is ${hidden}% covered @${tag} — every grid cell must be whole.`);
      bad++;
    }
  }
}
console.log(bad ? `\n${bad} cell(s) covered.`
                : `\nEvery cell in the grid is whole (asserted at ${[...GRID_WIDTHS].join(", ")}).`);
process.exit(bad ? 1 : 0);
