// scripts/lib/page-header.mjs — the interior page header band, shared.
//
// One definition, two consumers: apply-page-headers.mjs stamps it into the
// hand-written pages, and build-volunteer.mjs emits it into the page it
// generates. It lives here because volunteer.html is GENERATED — the first cut
// of the rollout edited it directly, which put it out of sync with its own
// generator and failed `build-volunteer --check` immediately. That test was
// right: a generated file edited by hand is a change that the next build
// silently deletes.
import { readFileSync } from "node:fs";

const PANELS = JSON.parse(readFileSync(
  new URL("../../public/images/hero/panels/panels.json", import.meta.url), "utf8"));

// Eight columns, bottom-aligned, heights varying so the top edge is a skyline
// rather than a ruler. `far` is the back set — dimmer and slightly blurred, so
// the band has depth instead of being one flat row.
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

export const PAGE_HEADER_SHEET = '<link rel="stylesheet" href="/css/page-header.css">';

export const PAGE_HEADER_STRIP = [
  '    <!-- page-header:strip -->',
  '    <div class="pg-strip" aria-hidden="true">',
  ...COLUMNS.map(([cls, name, far]) => {
    const m = PANELS[name];
    if (!m) throw new Error(`"${name}" is not in panels.json — run build-hero-panels.py`);
    return `      <figure class="${cls}${far ? " far" : ""}">` +
      `<img src="/images/hero/panels/${name}.webp" width="${m.w}" height="${m.h}" ` +
      `alt="" loading="lazy" decoding="async"></figure>`;
  }),
  '    </div>',
  '    <div class="pg-veil"></div>',
  '    <div class="pg-grain"></div>',
  '    <!-- /page-header:strip -->',
].join("\n");
