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
// THE CAST.  Slot -> athlete. This is the only place the two are joined.
//
// Alec's first note on the header was "I do not want to be the center image, I
// want Juan to be in the middle" — a casting note, not a layout note, and the
// first build made it a stylesheet edit because the athletes were written into
// the CSS by name. They are not any more: hero-lineup.css owns five slots with
// fixed geometry and this map owns who stands in each.
//
//   s-anchor  front, centre, largest, sharpest — the athlete the page is about
//   s-flank   front, right edge, bled off the frame
//   s-left    mid depth, left of the anchor
//   s-right   mid depth, right of the anchor
//   s-deep    furthest back, dimmest
//
// Two constraints on recasting, both real:
//   1. ONLY a complete figure — whole athlete, whole chair — can hold s-anchor
//      or s-flank. Three of the five sources are cropped at the waist and can
//      only sit behind the floor haze, which is what hides the cut.
//   2. Slot heights are tuned against the ASPECT of whoever stands in them.
//      Swapping a near-portrait figure for a landscape crop needs the slot's
//      --h re-checked; check-hero-lab.mjs is what tells you.
const CAST = {
  "s-anchor": "cut-forehand", // Juan  (JLA_5950) — complete figure
  "s-flank":  "cut-dink",     //       (JLA_5922) — complete figure
  "s-left":   "cut-paddle",   // Brian (JLA_6045) — waist crop
  "s-right":  "cut-smile",    //       (JLA_6106) — waist crop
  "s-deep":   "cut-net",      //       (JLA_6084) — waist crop
};

// Depth is carried by contrast, and it follows the slot rather than the person.
const DEPTH = {
  "s-anchor": "d-front", "s-flank": "d-front",
  "s-left": "d-mid", "s-right": "d-mid", "s-deep": "d-back",
};

// The two front figures paint before the fold and are the LCP candidates; the
// back row is decorative and can wait its turn.
const EAGER = new Set(["s-anchor", "s-flank"]);

const fig = (slot) => {
  const f = `cut-${CAST[slot].replace(/^cut-/, "")}.webp`;
  const [w, h] = DIM[f];
  const front = EAGER.has(slot);
  return `      <figure class="hs-fig ${slot} ${DEPTH[slot]}${front ? " above-haze" : ""}">` +
    `<img src="/images/hero/${f}" width="${w}" height="${h}" alt="" ` +
    `${front ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async"></figure>`;
};

// Back row, then the haze that hides their cropped waists, then the front row.
const STAGE = [
  fig("s-deep"), fig("s-left"), fig("s-right"),
  '      <div class="hs-haze"></div>',
  fig("s-flank"), fig("s-anchor"),
].join("\n");

// The live drive strip. Populated by ATLCampaigns like the band below it, and
// removes itself when there is no live drive rather than sitting empty.
const DRIVE = `      <div class="hs-drive hs-rise" style="--d:760ms;">
        <div class="hs-drive-in" id="heroDrive" hidden>
          <span class="hs-drive-lab"><span class="dot"></span>Raising now</span>
          <div class="hs-drive-body">
            <div class="hs-drive-name" id="heroDriveName"></div>
            <div class="hs-drive-track"><div class="hs-drive-fill" id="heroDriveFill"></div></div>
            <div class="hs-drive-fig" id="heroDriveFig"></div>
          </div>
          <a class="hs-drive-go" href="/donate">Give <span class="arrow">&rarr;</span></a>
        </div>
      </div>`;


// ---------------------------------------------------------------------------
// THE WALL.  Panel layouts, as data.
//
// Same lesson as the CAST map above: a note like "move that photo behind the
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
  // back plane — the room, not the subjects
  { n: "serve",      x: 38, y: 2,  w: 13, d: 1, r: -0.7, m: "m" },
  { n: "rally",      x: 32, y: 62, w: 14, d: 1, r:  0.6, m: "m" },
  { n: "court",      x: 76, y: 28, w: 15, d: 1, r: -0.5, m: "m" },
  { n: "shout",      x: 51, y: 26, w: 10, d: 1, r:  0.9, m: "m" },
  { n: "close-dink", x: 66, y: 38, w: 11, d: 1, r: -0.8, m: "m" },
  { n: "two-up",     x: 61, y: 82, w: 11, d: 1, r:  0.7, m: "m" },
  { n: "lobby",      x: 45, y: 78, w: 10, d: 1, r: -0.6, m: "m" },
  // mid plane
  { n: "net",        x: 69, y: 1,  w: 17, d: 2, r:  0.5, m: "m" },
  { n: "laugh",      x: 44, y: 6,  w: 12, d: 2, r: -0.9, m: "m" },
  { n: "whitecap",   x: 33, y: 18, w: 11, d: 2, r:  0.8, m: "m" },
  { n: "reach",      x: 90, y: 42, w: 14, d: 2, r: -0.6, m: "s" },
  { n: "swing",      x: 54, y: 58, w: 11, d: 2, r:  0.9, m: "m" },
  { n: "pair",       x: 38, y: 32, w: 12, d: 2, r: -0.7, m: "m" },
  { n: "seated",     x: 87, y: 72, w: 13, d: 2, r:  0.6, m: "m" },
  { n: "grin",       x: 76, y: 52, w: 12, d: 2, r: -0.5, m: "s" },
  // front plane — four photographs carry the whole header
  { n: "smile-close",x: 82, y: 6,  w: 16, d: 3, r:  0.7, m: "s" },
  { n: "dink",       x: 57, y: 12, w: 19, d: 3, r: -0.6, m: "" },
  { n: "brian",      x: 43, y: 55, w: 15, d: 3, r:  0.5, m: "s" },
  { n: "forehand",   x: 62, y: 66, w: 27, d: 3, r: -0.4, m: "" },
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
  "brian":       { x: -6, y: 45, w: 48 },
  "dink":        { x: 46, y: 40, w: 48 },
  "smile-close": { x: 18, y: 70, w: 44 },
  "forehand":    { x: 54, y: 72, w: 56 },
  "laugh":       { x: -8, y: 72, w: 34 },
  "grin":        { x: 74, y: 58, w: 32 },
};
const BANNER_PHONE = {
  "bn-dink":  { x: -6, w: 58, h: 100 },
  "bn-smile": { x: 48, w: 58, h: 86 },
};

// A hero box is wider than it is tall, so one percentage point of width is not
// one percentage point of height. Panels are placed by width and their height
// is computed from the file's real aspect against the hero's own — which is why
// panels.json carries pixel dimensions and not just names.
const HERO_RATIO = 1440 / 792;
const PHONE_RATIO = 390 / 780;

// Geometry lives in a GENERATED STYLESHEET, not in style attributes on the
// figures. The first cut put left/top/width inline and then tried to override
// them in a phone media query — which can never win, because an inline style
// outranks any selector. Every panel box, at both widths, is now one rule set
// emitted from the same data.
const boxRule = (p, meta, ratio, q, mode) => {
  const g = q || p;
  return mode === "banner"
    ? `left:${g.x}%; width:${g.w}%; height:${g.h}%;`
    : `left:${g.x}%; top:${g.y}%; width:${g.w}%; ` +
      `height:${(g.w * ratio * meta.h / meta.w).toFixed(2)}%;`;
};

const panelHtml = (p, i) => {
  const meta = PANELS[p.n];
  if (!meta) throw new Error(`panel "${p.n}" is not in panels.json`);
  return `      <figure class="mw-p p-${p.n} d${p.d}" style="--r:${p.r || 0}deg; --d:${60 + i * 45}ms;">` +
    `<img src="/images/hero/panels/${p.n}.webp" width="${meta.w}" height="${meta.h}" alt="" ` +
    `${p.d === 3 ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async"></figure>`;
};

// Wide, then phone. A panel with no phone entry is simply not on the phone —
// which is the honest way to thin a collage. Shrinking all nineteen turns
// nineteen photographs into nineteen smudges.
const layoutCss = (rows, phone, mode) => {
  const wide = rows.map((p) =>
    `  .mw-p.p-${p.n}{ ${boxRule(p, PANELS[p.n], HERO_RATIO, null, mode)} }`);
  const small = rows.filter((p) => phone[p.n]).map((p) =>
    `    .mw-p.p-${p.n}{ display:block; ${boxRule(p, PANELS[p.n], PHONE_RATIO, phone[p.n], mode)} }`);
  return ["<style>", ...wide,
    "  @media (max-width:640px){",
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

// The compact live drive: one sentence, not a card. D and E are the "less is
// more" variants and a dashboard in the header would contradict them, but the
// header still has to say money is moving.
const DRIVE_LINE = `      <div class="mw-drive mw-rise" style="--d:460ms;">
        <div class="mw-drive-in" id="heroDrive" hidden>
          <span class="mw-drive-dot"></span>
          <span id="heroDriveName"></span>
          <span class="mw-bar"><i id="heroDriveFill"></i></span>
          <span id="heroDriveFig"></span>
          <a href="/donate">Give <span class="arrow">&rarr;</span></a>
        </div>
      </div>`;

const ATMOS = `    <div class="hs-grain"></div>
    <div class="hs-vig"></div>`;

/* --------------------------------------------------------------------------
   A — THE LINEUP.  Type holds the left, the athletes come forward from the
   back-left to the front-right. The eye lands on the headline, walks the line
   and finishes on the nearest face, which is the one holding a paddle.
   -------------------------------------------------------------------------- */
const HERO_A = `  <!-- 1 · HERO — the lineup (variant A) -->
  <section class="hero-stage dark hero-var" id="heroStage" data-variant="A">
    <div class="hs-sky"></div>
    <div class="hs-floor"></div>
    <div class="hs-stage" aria-hidden="true">
${STAGE}
    </div>
    <div class="hs-scrim"></div>
    <div class="wrap hs-copy">
      <span class="eyebrow orange hs-rise" style="--d:80ms;">Made by athletes, for athletes</span>
      <h1 class="serif display hs-rise" style="--d:180ms;">Your place in <em class="italic" style="color:var(--orange)">adaptive sports.</em></h1>
      <p class="lead sub hs-rise" style="--d:300ms;">Access to sport is a right, not a privilege. Sports in abundance.</p>
      <div class="actions hs-rise" style="--d:420ms;">
        <a href="/donate" class="btn">Donate</a>
        <a href="/send-6" class="btn ghost">See what we're raising for <span class="arrow">&rarr;</span></a>
      </div>
${DRIVE}
    </div>
${ATMOS}
  </section>

`;

/* --------------------------------------------------------------------------
   B — THE WALL.  Centred poster. The athletes form a symmetrical wall behind
   the type and the headline sits inside the group rather than beside it.
   Loudest of the three; the one that photographs well as a share card.
   -------------------------------------------------------------------------- */
const HERO_B = `  <!-- 1 · HERO — the wall (variant B) -->
  <section class="hero-stage hero-wall dark hero-var" id="heroStage" data-variant="B">
    <div class="hs-sky"></div>
    <div class="hs-floor"></div>
    <div class="hs-stage" aria-hidden="true">
${STAGE}
    </div>
    <div class="hs-scrim"></div>
    <div class="wrap hs-copy center">
      <span class="eyebrow orange hs-rise" style="--d:80ms;">Made by athletes, for athletes</span>
      <h1 class="serif display hs-rise" style="--d:180ms;">Your place in <em class="italic" style="color:var(--orange)">adaptive sports.</em></h1>
      <p class="lead sub hs-rise" style="--d:300ms;">Access to sport is a right, not a privilege. Sports in abundance.</p>
      <div class="actions hs-rise" style="--d:420ms;">
        <a href="/donate" class="btn">Donate</a>
        <a href="/send-6" class="btn ghost">See what we're raising for <span class="arrow">&rarr;</span></a>
      </div>
${DRIVE}
    </div>
${ATMOS}
  </section>

`;

/* --------------------------------------------------------------------------
   C — THE SPLIT.  A hard editorial column on the left carrying the ask, the
   group filling a bleed panel on the right. The quietest and the most
   conversion-shaped: nothing overlaps the type, ever.
   -------------------------------------------------------------------------- */
const HERO_C = `  <!-- 1 · HERO — the split (variant C) -->
  <section class="hero-stage hero-split2 dark hero-var" id="heroStage" data-variant="C">
    <div class="hs-sky"></div>
    <div class="hs-floor"></div>
    <div class="hs-stage" aria-hidden="true">
${STAGE}
    </div>
    <div class="hs-scrim"></div>
    <div class="wrap hs-copy">
      <span class="eyebrow orange hs-rise" style="--d:80ms;">Made by athletes, for athletes</span>
      <h1 class="serif display hs-rise" style="--d:180ms;">Your place in <em class="italic" style="color:var(--orange)">adaptive sports.</em></h1>
      <p class="lead sub hs-rise" style="--d:300ms;">Access to sport is a right, not a privilege. Sports in abundance.</p>
      <div class="actions hs-rise" style="--d:420ms;">
        <a href="/donate" class="btn">Donate</a>
        <a href="/send-6" class="btn ghost">See what we're raising for <span class="arrow">&rarr;</span></a>
      </div>
${DRIVE}
    </div>
${ATMOS}
  </section>

`;

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
      <div class="actions mw-rise" style="--d:320ms;">
        <a href="/donate" class="btn">Donate</a>
        <a href="/hustle-and-heart" class="mw-quiet">How the fund works <span class="arrow">&rarr;</span></a>
      </div>
${DRIVE_LINE}
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
      <div class="actions mw-rise" style="--d:320ms;">
        <a href="/donate" class="btn">Donate</a>
        <a href="/hustle-and-heart" class="mw-quiet">How the fund works <span class="arrow">&rarr;</span></a>
      </div>
${DRIVE_LINE}
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
      <div class="actions st-rise" style="--d:320ms;">
        <a href="/donate" class="btn">Donate</a>
        <a href="/hustle-and-heart" class="st-quiet">How the fund works <span class="arrow">&rarr;</span></a>
      </div>
      <div class="st-drive mw-rise" style="--d:460ms;">
        <div class="mw-drive-in" id="heroDrive" hidden>
          <span class="mw-drive-dot"></span>
          <span id="heroDriveName"></span>
          <span class="mw-bar"><i id="heroDriveFill"></i></span>
          <span id="heroDriveFig"></span>
          <a href="/donate">Give <span class="arrow">&rarr;</span></a>
        </div>
      </div>
    </div>
    <div class="st-grain"></div>
    <div class="st-vig"></div>
  </section>

`;

const VARIANTS = { 1: HERO_D, 2: HERO_E, 3: HERO_3 };
const LABEL = { 1: "1 · The mosaic", 2: "2 · The banner", 3: "3 · The stadium" };

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

  // Live drive strip — the one thing in the header that says money is moving
  // right now. Same two sources the campaign band below uses: campaigns.json
  // for the name and goal, /api/raised for the live figure. When it renders it
  // HIDES the band below, because the same drive stated twice in one screen
  // reads as a template, not as urgency. No live drive means no strip and the
  // band keeps its job.
  function drive(){
    var api = window.ATLCampaigns;
    var box = document.getElementById('heroDrive');
    if(!api || !box) return;
    api.load(function(store){
      var c = store && store.campaigns && store.campaigns[0];
      if(!c || !c.goal) return;
      document.getElementById('heroDriveName').textContent = c.name || '';
      document.getElementById('heroDriveFig').textContent = api.money(c.goal) + ' goal';
      var go = box.querySelector('.hs-drive-go, a[href="/donate"]');
      if(go && c.page) go.setAttribute('href', c.page);
      box.hidden = false;
      // Only stand down the band below if the strip is actually on screen. The
      // strip is display:none on phones, and hiding the band there would have
      // deleted the live drive from the narrow layout entirely.
      var shown = getComputedStyle(box.parentNode).display !== 'none';
      var dup = document.getElementById('homeBand');
      if(shown && dup && dup.parentNode && dup.parentNode.parentNode) dup.parentNode.parentNode.style.display = 'none';

      // The live figure lands last and only if it is real. A $0 we could not
      // fetch is worse than a goal on its own.
      api.raised(function(r){
        if(!r || !r.raised) return;
        var goal = r.goal || c.goal;
        var pct = Math.max(2, Math.min(100, Math.round((r.raised / goal) * 100)));
        document.getElementById('heroDriveFig').innerHTML =
          '<b>' + api.money(r.raised) + '</b> of ' + api.money(goal) + ' raised';
        requestAnimationFrame(function(){
          document.getElementById('heroDriveFill').style.width = pct + '%';
        });
      });
    });
  }
  if(document.readyState !== 'loading') setTimeout(drive, 60);
  else document.addEventListener('DOMContentLoaded', function(){ setTimeout(drive, 60); });
})();
</script>
`;

// The variant switcher, so one link lets Alec flip between all three at the
// same scroll position instead of opening three tabs and guessing.
function switcher(active) {
  const items = ["1", "2", "3"]
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
        (key === "3" ? '\n<link rel="stylesheet" href="/css/hero-stadium.css">' : ""),
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
