// scripts/build-hero-lab.mjs — the header stage.
//
// Builds /hero-a, /hero-b, /hero-c: three complete homepages that differ in
// exactly one section, so Alec compares headers and not pages. Each is the
// real index.html with its hero swapped and one extra stylesheet linked, which
// means the nav, the campaign band, the whole scroll and every downstream
// section behave exactly as they will after a merge. A mockup that is not the
// live page is a mockup you have to re-verify later.
//
// Regenerate after ANY edit to index.html or to a variant here:
//   node scripts/build-hero-lab.mjs && npm run stamp
import { readFileSync, writeFileSync } from "node:fs";

// Intrinsic sizes come from the cut-out build (scripts/build-hero-cutouts.py),
// so width/height attributes can never drift from the files on disk and the
// hero cannot shift layout while the images decode.
const DIM = JSON.parse(readFileSync(new URL("../public/images/hero/dims.json", import.meta.url), "utf8"));
const dim = (f) => `width="${DIM[f][0]}" height="${DIM[f][1]}"`;

const ROOT = new URL("../public/", import.meta.url);
const src = readFileSync(new URL("index.html", ROOT), "utf8");

// The hero section in index.html, from its comment marker to the campaign band.
const HERO_START = "  <!-- 1 · HERO";
const HERO_END = "  <!-- 2 · CAMPAIGN BAND";
const a = src.indexOf(HERO_START);
const b = src.indexOf(HERO_END);
if (a < 0 || b < 0) throw new Error("hero markers not found in index.html");

/* --------------------------------------------------------------------------
   Shared pieces
   -------------------------------------------------------------------------- */

// ---------------------------------------------------------------------------
// THE WALL.  Panel layouts, as data.
//
// Same lesson the retired cut-out variants taught: a note like "move that photo behind the
// headline" should be an edit to a row here, never to a stylesheet. Positions
// are percentages of the hero box, and heights are DERIVED from each file's
// real pixel dimensions in panels.json — so a re-crop that changes an aspect
// cannot silently squash a panel.
//
//   x,y  top-left corner, % of the hero
//   w    width, % of the hero
//   d    depth: 1 back (dim, blurred), 2 mid, 3 front (sharp)
//   r    rotation in degrees. Kept under ~1.2: enough to read as a pinned-up
//        wall, past that it reads as a template.
//   m    "m" drops the panel below 900px (see .m-drop in hero-mosaic.css)
const PANELS = JSON.parse(readFileSync(new URL("../public/images/hero/panels/panels.json", import.meta.url), "utf8"));

// D — THE MOSAIC. The wall is authored around a quiet left third for the type;
// everything loud lives right of 44%.
const MOSAIC = [
  // The wall now fills the whole frame except the top-left corner the wordmark
  // sits in. It used to hug the right half because the copy block was four
  // elements tall; with five words there, the bottom-left was simply empty.
  // back plane — the room, not the subjects
  { n: "serve",      x: 2,  y: 58, w: 15, d: 1, r: -0.7, m: "m" },
  { n: "rally",      x: 19, y: 76, w: 16, d: 1, r:  0.6, m: "m" },
  { n: "court",      x: 76, y: 26, w: 15, d: 1, r: -0.5, m: "m" },
  { n: "shout",      x: 51, y: 22, w: 10, d: 1, r:  0.9, m: "m" },
  { n: "close-dink", x: 66, y: 36, w: 11, d: 1, r: -0.8, m: "m" },
  { n: "two-up",     x: 62, y: 80, w: 11, d: 1, r:  0.7, m: "m" },
  { n: "lobby",      x: 34, y: 64, w: 11, d: 1, r: -0.6, m: "m" },
  // mid plane
  { n: "net",        x: 69, y: 0,  w: 17, d: 2, r:  0.5, m: "m" },
  { n: "laugh",      x: 44, y: 4,  w: 12, d: 2, r: -0.9, m: "m" },
  { n: "whitecap",   x: 5,  y: 74, w: 13, d: 2, r:  0.8, m: "m" },
  { n: "reach",      x: 90, y: 40, w: 14, d: 2, r: -0.6, m: "s" },
  { n: "swing",      x: 54, y: 56, w: 11, d: 2, r:  0.9, m: "m" },
  { n: "pair",       x: 17, y: 48, w: 13, d: 2, r: -0.7, m: "m" },
  { n: "seated",     x: 87, y: 70, w: 13, d: 2, r:  0.6, m: "m" },
  { n: "grin",       x: 76, y: 50, w: 12, d: 2, r: -0.5, m: "s" },
  // front plane — four photographs carry the whole header
  { n: "smile-close",x: 82, y: 4,  w: 16, d: 3, r:  0.7, m: "s" },
  { n: "dink",       x: 57, y: 10, w: 19, d: 3, r: -0.6, m: "" },
  { n: "brian",      x: 41, y: 55, w: 16, d: 3, r:  0.5, m: "s" },
  { n: "forehand",   x: 62, y: 64, w: 27, d: 3, r: -0.4, m: "" },
];

// E — THE BANNER. One row, bottom-aligned to a single baseline, heights
// varying so the top edge is a skyline rather than a ruler. y is ignored;
// h is the panel's height as a % of the hero and the crop fills it.
const BANNER = [
  { n: "bn-reach",  x: -4, w: 16, h: 64, d: 1, m: "m" },
  { n: "bn-swing",  x:  9, w: 16, h: 78, d: 2, m: "m" },
  { n: "bn-brian",  x: 22, w: 16, h: 94, d: 3, m: "s" },
  { n: "bn-seated", x: 35, w: 16, h: 70, d: 2, m: "m" },
  { n: "bn-dink",   x: 48, w: 16, h: 100, d: 3, m: "" },
  { n: "bn-grin",   x: 61, w: 16, h: 74, d: 2, m: "m" },
  { n: "bn-smile",  x: 74, w: 16, h: 90, d: 3, m: "" },
  { n: "bn-white",  x: 87, w: 16, h: 68, d: 2, m: "s" },
];

// PHONE LAYOUTS. A wall authored for a 1440x790 landscape box does not thin
// down to a 390x780 portrait one by hiding panels — that was the first cut and
// it left two photographs stranded in a field of black. A phone gets its own
// composition: fewer, much larger panels filling the bottom half under the
// type. Panels absent from these maps are hidden below 640px.
const MOSAIC_PHONE = {
  // Raised and enlarged once the buttons left the header: the wall used to
  // start 130px below the last line of type because there were two buttons and
  // a meter in between. Now the words end and the photographs begin.
  "brian":       { x: -8, y: 36, w: 54 },
  "dink":        { x: 44, y: 31, w: 54 },
  "grin":        { x: 74, y: 52, w: 36 },
  "smile-close": { x: 14, y: 66, w: 48 },
  "forehand":    { x: 50, y: 68, w: 62 },
  "laugh":       { x: -10, y: 68, w: 38 },
};
const BANNER_PHONE = {
  "bn-dink":  { x: -6, w: 58, h: 100 },
  "bn-smile": { x: 48, w: 58, h: 86 },
};

// A hero box is wider than it is tall, so one percentage point of width is not
// one percentage point of height. Panels are placed by width and their height
// is computed from the file's real aspect against the hero's own — which is why
// panels.json carries pixel dimensions and not just names.
// Geometry lives in a GENERATED STYLESHEET, not in style attributes on the
// figures. The first cut put left/top/width inline and then tried to override
// them in a phone media query — which can never win, because an inline style
// outranks any selector. Every panel box, at both widths, is now one rule set
// emitted from the same data.
//
// Panel HEIGHT is `aspect-ratio`, never a computed percentage. The first cut
// worked out height as `width% x (1440/792) x (imgH/imgW)` — a percentage of
// the hero's height derived from the hero's width — which is only correct at
// the one viewport aspect that constant describes. At 1920x900 the real ratio
// is 2.13 rather than 1.82, so every panel came out about 15% too short and the
// wall opened up gaps it does not have on a laptop. aspect-ratio lets the
// browser do that arithmetic against the width it actually resolved.
const boxRule = (p, meta, q, mode) => {
  const g = q || p;
  return mode === "banner"
    ? `left:${g.x}%; width:${g.w}%; height:${g.h}%;`
    : `left:${g.x}%; top:${g.y}%; width:${g.w}%; aspect-ratio:${meta.w}/${meta.h};`;
};

const panelHtml = (p, i) => {
  const meta = PANELS[p.n];
  if (!meta) throw new Error(`panel "${p.n}" is not in panels.json`);
  return `      <figure class="mw-p p-${p.n} d${p.d}" style="--r:${p.r || 0}deg; --d:${60 + i * 45}ms;">` +
    `<img src="/images/hero/panels/${p.n}.webp" width="${meta.w}" height="${meta.h}" alt="" ` +
    `${p.d === 3 ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async"></figure>`;
};

// Wide, then narrow. The cut-over is 900px, not 640: a 768x1024 tablet is a
// portrait box and it is much closer to a phone than to a laptop. Left on the
// wide layout it rendered all nineteen panels at about 145px each — technically
// a collage, visually grey noise.
//
// A panel with no narrow entry is simply not there at that width. That is the
// honest way to thin a collage; shrinking all nineteen turns nineteen
// photographs into nineteen smudges.
const layoutCss = (rows, phone, mode) => {
  const wide = rows.map((p) =>
    `  .mw-p.p-${p.n}{ ${boxRule(p, PANELS[p.n], null, mode)} }`);
  const small = rows.filter((p) => phone[p.n]).map((p) =>
    `    .mw-p.p-${p.n}{ display:block; ${boxRule(p, PANELS[p.n], phone[p.n], mode)} }`);
  return ["<style>", ...wide,
    "  @media (max-width:900px){",
    "    .mw-p{ display:none; }", ...small,
    "  }", "</style>"].join("\n");
};

const wall = (rows) => {
  const at = (d) => rows.map((p, i) => [p, i]).filter(([p]) => p.d === d)
    .map(([p, i]) => panelHtml(p, i)).join("\n");
  return [
    '    <div class="mw-wall" aria-hidden="true">',
    at(1),
    '      <div class="mw-haze h1"></div>',
    at(2),
    '      <div class="mw-haze h2"></div>',
    at(3),
    "    </div>",
  ].join("\n");
};


const ATMOS = `    <div class="hs-grain"></div>
    <div class="hs-vig"></div>`;

/* --------------------------------------------------------------------------
   D — THE MOSAIC.  Nineteen photographs on a wall, three planes deep, with the
   air between them doing the separating. The type takes the quiet left third
   and says one thing.
   -------------------------------------------------------------------------- */
const HERO_D = `  <!-- 1 · HERO — the mosaic (variant D) -->
  <section class="hero-wall-photo dark hero-var" id="heroStage" data-variant="D">
    <div class="mw-sky"></div>
${wall(MOSAIC)}
    <div class="mw-scrim"></div>
    <div class="wrap mw-copy">
      <h1 class="serif display mw-rise" style="--d:180ms;">Your place in <em class="italic" style="color:var(--orange)">adaptive sports.</em></h1>
    </div>
    <div class="mw-grain"></div>
    <div class="mw-vig"></div>
  </section>
${layoutCss(MOSAIC, MOSAIC_PHONE, "mosaic")}

`;

/* --------------------------------------------------------------------------
   E — THE BANNER.  The arena version: one bottom-aligned row, heights varying
   so the top edge is a skyline. Set in the grotesk rather than the serif.
   -------------------------------------------------------------------------- */
const HERO_E = `  <!-- 1 · HERO — the banner (variant E) -->
  <section class="hero-wall-photo hero-banner dark hero-var" id="heroStage" data-variant="E">
    <div class="mw-sky"></div>
${wall(BANNER)}
    <div class="mw-scrim"></div>
    <div class="wrap mw-copy">
      <h1 class="serif display mw-rise" style="--d:180ms;">Your Place in <em style="color:var(--orange)">Adaptive Sports.</em></h1>
    </div>
    <div class="mw-grain"></div>
    <div class="mw-vig"></div>
  </section>
${layoutCss(BANNER, BANNER_PHONE, "banner")}

`;

/* --------------------------------------------------------------------------
   3 — THE STADIUM BANNER.  The concourse banner: the team cut out and
   overlapped on one baseline, raking light behind them, the wordmark holding
   a clear corner. Built on Alec's hand-traced mattes, which are clean through
   the wheel spokes — the detail that decides whether a cut-out athlete in a
   chair looks pasted on.

   TEAM is the cast, in back-to-front order. Same rule as everywhere else here:
   who stands where is data.
   -------------------------------------------------------------------------- */
const TEAM = [
  { slot: "t-brian",  file: "trace-brian",  depth: 2, alt: "Brian, mid-rally with his paddle up" },
  { slot: "t-ben",    file: "trace-ben",    depth: 2, alt: "Ben reaching wide for a shot" },
  { slot: "t-aubrey", file: "trace-aubrey", depth: 2, alt: "Aubrey, laughing between points" },
  { slot: "t-ryan",   file: "trace-ryan",   depth: 3, alt: "Ryan setting up a serve" },
  { slot: "t-juan",   file: "trace-juan",   depth: 3, alt: "Juan turning into a forehand" },
];

const teamHtml = TEAM.map((m) => {
  const f = `${m.file}.webp`;
  const [w, h] = DIM[f];
  const front = m.depth === 3;
  return `      <figure class="st-fig ${m.slot} k${m.depth}">` +
    `<img src="/images/hero/${f}" width="${w}" height="${h}" alt="" ` +
    `${front ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async"></figure>`;
}).join("\n");

const HERO_3 = `  <!-- 1 · HERO — the stadium banner (variant 3) -->
  <section class="hero-stadium dark hero-var" id="heroStage" data-variant="3">
    <div class="st-sky"></div>
    <div class="st-room"></div>
    <div class="st-team" aria-hidden="true">
${teamHtml}
    </div>
    <div class="st-rays" aria-hidden="true">
      <span class="st-ray r1"></span><span class="st-ray r2"></span><span class="st-ray r3"></span>
    </div>
    <div class="st-floor"></div>
    <div class="st-scrim"></div>
    <div class="wrap st-copy">
      <h1 class="st-h1 st-rise" style="--d:180ms;">Your Place<br>in <em>Adaptive<br>Sports.</em></h1>
    </div>
    <div class="st-grain"></div>
    <div class="st-vig"></div>
  </section>

`;

/* --------------------------------------------------------------------------
   THE SPECTRUM — 3 to 7.  Alec: "go rogue and crazy ... create more of a
   spectrum of choices." Five different ANSWERS, not five arrangements of one.
   -------------------------------------------------------------------------- */
// Intrinsic sizes come from panels.json, the manifest the crop build writes,
// so a width/height attribute can never drift from the file on disk.
// The hand-traced cut-outs live one directory up from the panels and carry
// their sizes in dims.json rather than panels.json.
const cut = (name, extra = "") => {
  const d = DIM[`${name}.webp`];
  if (!d) throw new Error(`"${name}" is not in dims.json — run build-hero-cutouts.py`);
  return `<img src="/images/hero/${name}.webp" width="${d[0]}" height="${d[1]}" alt="" ${extra}>`;
};

const img = (name, cls, extra = "") => {
  const m = PANELS[name];
  if (!m) throw new Error(`"${name}" is not in panels.json — run build-hero-panels.py`);
  return `<img src="/images/hero/panels/${name}.webp" width="${m.w}" height="${m.h}" alt=""${cls ? ` class="${cls}"` : ""} ${extra}>`;
};

const HERO_FRAME = `  <!-- 1 · HERO — one photograph (variant 3) -->
  <section class="hero-spec hero-frame-one dark hero-var" id="heroStage" data-variant="3">
    <div class="sp-media" role="img" aria-label="Juan turning into a forehand against the wall at ACE"></div>
    <div class="sp-fade"></div>
    <div class="sp-glow"></div>
    <div class="wrap sp-copy">
      <h1 class="sp-h1 sp-rise" style="--d:160ms;">Your Place in Adaptive Sports.</h1>
    </div>
    <div class="sp-grain"></div>
  </section>

`;

const HERO_KNOCKOUT = `  <!-- 1 · HERO — the knockout (variant 4) -->
  <section class="hero-spec hero-knockout dark hero-var" id="heroStage" data-variant="4">
    <div class="sp-glow"></div>
    <figure class="sp-fig">${cut("trace-ryan", 'fetchpriority="high" decoding="async"')}</figure>
    <div class="wrap sp-copy">
      <h1 class="sp-h1 sp-rise" style="--d:160ms;">Your place in<br><span class="kn-fill">Adaptive</span> sports.</h1>
    </div>
    <div class="sp-grain"></div>
  </section>

`;

// The strip is duplicated so the marquee can translate by exactly one copy and
// loop with no seam. aria-hidden on the whole track: it is texture, and a
// screen reader does not need eight empty images read to it twice.
const STRIP_COLUMNS = ["bn-brian", "bn-dink", "bn-smile", "bn-swing", "bn-grin",
                       "bn-white", "bn-seated", "bn-reach"];
const stripRun = [...STRIP_COLUMNS, ...STRIP_COLUMNS]
  .map((n, i) => "        " + img(n, "", i < 4 ? 'fetchpriority="high" decoding="async"' : 'loading="lazy" decoding="async"'))
  .join("\n");

const HERO_STRIP = `  <!-- 1 · HERO — the moving strip (variant 5) -->
  <section class="hero-spec hero-strip dark hero-var" id="heroStage" data-variant="5">
    <div class="sp-track" aria-hidden="true">
      <div class="sp-run">
${stripRun}
      </div>
    </div>
    <div class="sp-bands"></div>
    <div class="sp-glow"></div>
    <div class="wrap sp-copy">
      <h1 class="sp-h1 sp-rise" style="--d:160ms;"><span class="l1">Your Place in</span><span class="l2">Adaptive Sports.</span></h1>
    </div>
    <div class="sp-grain"></div>
  </section>

`;

// Eighteen cells, four of them alive. Which four is data — moving a face into
// the light should not be a stylesheet edit.
const GRID_CELLS = [
  "close-dink", "laugh", "net", "smile-close", "reach", "court",
  "pair", "dink", "grin", "brian", "two-up", "swing",
  "serve", "whitecap", "rally", "forehand", "seated", "lobby",
];
const GRID_LIT = new Set(["smile-close", "dink", "brian", "grin"]);
const gridCells = GRID_CELLS.map((n, i) =>
  `      <figure${GRID_LIT.has(n) ? ' class="on"' : ""}>` +
  img(n, "", i < 6 ? 'fetchpriority="high" decoding="async"' : 'loading="lazy" decoding="async"') +
  "</figure>").join("\n");

const HERO_GRID = `  <!-- 1 · HERO — the contact sheet (variant 6) -->
  <section class="hero-spec hero-grid dark hero-var" id="heroStage" data-variant="6">
    <div class="sp-cells" aria-hidden="true">
${gridCells}
    </div>
    <div class="sp-glow"></div>
    <div class="wrap sp-copy">
      <div class="sp-slab sp-rise" style="--d:160ms;">
        <h1 class="sp-h1">Your Place in Adaptive Sports.</h1>
      </div>
    </div>
    <div class="sp-grain"></div>
  </section>

`;

const HERO_SPLIT_ONE = `  <!-- 1 · HERO — the split (variant 7) -->
  <section class="hero-spec hero-split-one dark hero-var" id="heroStage" data-variant="7">
    <div class="sp-media" role="img" aria-label="Ryan at the net, mid-point"></div>
    <div class="sp-fade"></div>
    <div class="sp-seam"></div>
    <div class="sp-glow"></div>
    <div class="wrap sp-copy">
      <h1 class="sp-h1 sp-rise" style="--d:160ms;">Your Place in Adaptive Sports.</h1>
    </div>
    <div class="sp-grain"></div>
  </section>

`;

const VARIANTS = { 1: HERO_D, 2: HERO_E, 3: HERO_FRAME, 4: HERO_KNOCKOUT,
                   5: HERO_STRIP, 6: HERO_GRID, 7: HERO_SPLIT_ONE };
const LABEL = {
  1: "1 · Mosaic", 2: "2 · Banner", 3: "3 · One frame", 4: "4 · Knockout",
  5: "5 · Strip", 6: "6 · Grid", 7: "7 · Split",
};

// The stage script: entrance, depth parallax, and the live drive strip. Kept
// in the page rather than in a shared bundle because only the hero uses it and
// it must run before the fold paints.
const STAGE_JS = `
<script>
(function(){
  var stage = document.getElementById('heroStage');
  if(!stage) return;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // entrance — one frame after paint so the transition actually runs
  requestAnimationFrame(function(){ requestAnimationFrame(function(){ stage.classList.add('lit'); }); });

  // depth parallax. Two inputs, one output: the pointer moves the group a few
  // pixels against itself, and the scroll sinks it. Both are scaled per figure
  // by how far back it is, which is what makes the group feel like a room and
  // not a picture. Skipped entirely for reduced motion and coarse pointers.
  var figs = [].slice.call(stage.querySelectorAll('.hs-fig, .mw-p'));
  var fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  if(!reduce && fine && figs.length){
    var depth = function(f){
      if(f.classList.contains('d-front') || f.classList.contains('d3')) return 1;
      if(f.classList.contains('d-mid')   || f.classList.contains('d2')) return 0.55;
      return 0.3;
    };
    var tx = 0, ty = 0, cx = 0, cy = 0, scroll = 0, raf = 0;
    window.addEventListener('pointermove', function(e){
      var r = stage.getBoundingClientRect();
      tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
      ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
      if(!raf) raf = requestAnimationFrame(tick);
    }, {passive:true});
    window.addEventListener('scroll', function(){
      scroll = Math.min(1, window.scrollY / 700);
      if(!raf) raf = requestAnimationFrame(tick);
    }, {passive:true});
    function tick(){
      raf = 0;
      cx += (tx - cx) * 0.08;
      cy += (ty - cy) * 0.08;
      for(var i=0;i<figs.length;i++){
        var d = depth(figs[i]);
        figs[i].style.setProperty('--px', (-cx * 16 * d).toFixed(2) + 'px');
        figs[i].style.setProperty('--py', ((-cy * 8 * d) + (scroll * 40 * d)).toFixed(2) + 'px');
      }
      if(Math.abs(tx-cx) > 0.001 || Math.abs(ty-cy) > 0.001) raf = requestAnimationFrame(tick);
    }
  }

  // There is no drive strip in the header any more. Alec, 2026-09-08: feel
  // first, then the ask. The campaign band directly below the hero still
  // renders the live drive, and no longer has to stand down for a duplicate.
})();
</script>
`;

// The variant switcher, so one link lets Alec flip between all three at the
// same scroll position instead of opening three tabs and guessing.
function switcher(active) {
  const items = ["1", "2", "3", "4", "5", "6", "7"]
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
        ("34567".includes(key) ? '\n<link rel="stylesheet" href="/css/hero-spectrum.css">' : ""),
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
