// scripts/lib/heroes.mjs — the header definitions, shared.
//
// Split out of build-hero-lab.mjs the moment Alec picked one, because two
// things now need the same markup: the lab that compares the candidates, and
// the script that writes the chosen one into the real homepage. A header that
// exists twice is a header that drifts.
//
// Everything here is DATA plus a template. Nothing writes a file.
import { readFileSync } from "node:fs";

// Intrinsic sizes come from the cut-out build (scripts/build-hero-cutouts.py),
// so width/height attributes can never drift from the files on disk and the
// hero cannot shift layout while the images decode.
const DIM = JSON.parse(readFileSync(new URL("../../public/images/hero/dims.json", import.meta.url), "utf8"));
const dim = (f) => `width="${DIM[f][0]}" height="${DIM[f][1]}"`;

const ROOT = new URL("../../public/", import.meta.url);

// The hero region in index.html, from its comment marker to the campaign band.
export const HERO_START = "  <!-- 1 · HERO";
export const HERO_END = "  <!-- 2 · CAMPAIGN BAND";

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
const PANELS = JSON.parse(readFileSync(new URL("../../public/images/hero/panels/panels.json", import.meta.url), "utf8"));

// Content-hashed filenames. public/_headers caches media for 30 days and says
// to rename an image if you replace it; overwriting one in place means every
// returning visitor keeps the old bytes for a month. Every generated image is
// fingerprinted by build-hero-panels.py and resolved through this manifest, so
// changing a pixel changes the URL and nothing can go stale.
const HASH = JSON.parse(readFileSync(new URL("../../public/images/hero/panels/hashes.json", import.meta.url), "utf8"));
export const hashed = (file) => HASH[file] || file;

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
  { n: "paddle",     x: 62, y: 80, w: 11, d: 1, r:  0.7, m: "m" },
  { n: "lobby",      x: 34, y: 64, w: 11, d: 1, r: -0.6, m: "m" },
  // These two fill the left-centre hole the copy block leaves. `turned` — a
  // back to camera — used to be the left one, chosen back when this slot was
  // purely structural. Alec ruled that out for the main banner at any size, so
  // it is a real portrait now. Same job, no throwaway.
  { n: "bench",      x: 27, y: 30, w: 14, d: 1, r:  0.5, m: "m" },
  { n: "profile",    x: 47, y: 38, w: 10, d: 1, r: -0.8, m: "m" },
  // mid plane
  { n: "net",        x: 69, y: 0,  w: 17, d: 2, r:  0.5, m: "m" },
  { n: "laugh",      x: 44, y: 4,  w: 12, d: 2, r: -0.9, m: "m" },
  { n: "whitecap",   x: 5,  y: 74, w: 13, d: 2, r:  0.8, m: "m" },
  { n: "reach",      x: 90, y: 40, w: 14, d: 2, r: -0.6, m: "s" },
  { n: "swing",      x: 54, y: 56, w: 11, d: 2, r:  0.9, m: "m" },
  { n: "toss",       x: 17, y: 48, w: 13, d: 2, r: -0.7, m: "m" },
  { n: "seated",     x: 87, y: 70, w: 13, d: 2, r:  0.6, m: "m" },
  { n: "grin",       x: 76, y: 50, w: 12, d: 2, r: -0.5, m: "s" },
  { n: "lanyard",    x: 88, y: 14, w: 11, d: 2, r:  0.6, m: "m" },
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

// NARROW LAYOUTS.
//
// A wall authored for a 1440x790 landscape box does not thin down to a 390x780
// portrait one. The first cut hid panels and left two photographs stranded in a
// field of black; the second gave the phone its own scattered composition.
//
// Alec, 2026-09-08, picking the grid off variant 6: "I want this to be the main
// banner style for mobile design." He is right and it is the better idea. A
// portrait box wants a GRID, not a scatter — the arrangement stops being
// authored per panel and becomes a rule, which is why every cell is the same
// size and the composition cannot fall apart at a width nobody tested.
//
// Same nineteen files as the desktop wall, so a phone downloads nothing extra
// and nothing new has to be built. Twelve of them show; MOSAIC_GRID is the
// order they appear in, and `lit` is the handful left at full brightness. The
// rest sit at a fifth, which is what makes four faces read instead of twelve
// competing.
// ORDER IS MEASURED, NOT AESTHETIC. Alec, 2026-09-08: "accept that some
// pictures will get cropped — be intentional with the pictures that are going
// to get cut off behind the text... it makes it way easier for us to have a
// little bit of a buffer when it comes to the flexbox constraints."
//
// scripts/check-grid-occlusion.mjs renders the phone and reports, per cell, how
// much of it the headline slab covers. Cells 4 and 5 come back at 81-82%: they
// are BEHIND the type and always will be. So they are filled deliberately —
// two real photographs that carry texture and give the column its slack, not
// faces asking to be seen through a black slab.
//
// Everything else is placed by what the same probe says is clear. Aubrey is the
// top-right cell because the probe says the top row is the only pair of cells
// nothing ever touches, and Alec asked for exactly that: "I don't want to cut
// off her smile in the top-right picture."
export const MOSAIC_GRID = [
  // FOUR cells, and the headline gets a band of its own between them.
  //
  // Alec, 2026-09-09: "Replace this image from the main header banner. I want
  // to use the best of the best of our images, not a picture of someone's
  // back."
  //
  // I went looking for the replacement and found the row was the problem, not
  // the photograph in it. The slab is 126px tall sitting over a 261px cell, so
  // it covers the top 41% — and measuring the head position in every panel we
  // have, the highest is 0.35 and most are near 0.22. There is no photograph in
  // this library whose face survives that cut, because good portraits put the
  // head in the upper third. Any "best of the best" frame dropped into that row
  // loses its eyes. whitecap did, and it is a lovely photograph.
  //
  // So the middle row stops being a row. The slab sits in a gap between two
  // rows of two, every photograph is whole, and the four that remain are the
  // four Alec has consistently responded to. Fewer pictures, none of them
  // damaged — which is what he has been asking for three rounds running.
  "dink",       "smile-close",
  "brian",      "forehand",
];
// All four must be FRONT-plane panels: depth is baked into the files now, so a
// "lit" cell drawn from a pre-darkened mid or back file would still be dim.
// All six, now that there are only six. With twelve cells a lit/dim split was
// what made four faces read instead of twelve competing; with six big cells
// there is nothing to compete and a dimmed cell just looks broken. The two
// buffers still recede on their own — a back turned to camera and a man in
// profile are quiet subjects without needing to be darkened into one.
const MOSAIC_GRID_LIT = new Set(["smile-close", "dink", "brian", "forehand"]);

// Where the crop window sits in each panel when the grid squashes a portrait
// into a 3:2 cell. Default is 50%, which centres the window on the middle of
// the photograph and cut the heads off the two Alec circled. These are measured
// from a matte of each finished panel — the top of the subject plus a little
// headroom — so the window lands on the face rather than the torso.
const MOSAIC_GRID_POS = {
  "dink": 5,
  "smile-close": 7,
  "brian": 19,
  "forehand": 0
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
    `<img src="/images/hero/panels/${hashed(`${p.n}.webp`)}" width="${meta.w}" height="${meta.h}" alt="" ` +
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

  // The banner keeps a placed narrow layout — it is two columns and a headline,
  // which is already a grid by another name.
  if (mode === "banner") {
    const small = rows.filter((p) => phone[p.n]).map((p) =>
      `    .mw-p.p-${p.n}{ display:block; ${boxRule(p, PANELS[p.n], phone[p.n], mode)} }`);
    return ["<style>", ...wide,
      "  @media (max-width:900px){",
      "    .mw-p{ display:none; }", ...small,
      "  }", "</style>"].join("\n");
  }

  // The mosaic goes to a grid. Every positioning property the wide layout set
  // has to be unwound, and it has to be unwound AT THE SAME SPECIFICITY: the
  // wide rules are `.mw-p.p-dink{ width:19% }`, so a reset written as `.mw-p{
  // width:auto }` loses and the "grid" renders as nineteen tiny scattered
  // rectangles. It did. The reset therefore ships inside each cell's own rule.
  const RESET = "position:static; left:auto; top:auto; right:auto; bottom:auto; " +
                "width:auto; height:100%; aspect-ratio:auto; transform:none; " +
                "border-radius:0; box-shadow:none;";
  const cells = MOSAIC_GRID.flatMap((n, i) => [
    `    .mw-p.p-${n}{ display:block; order:${i}; ${RESET} }`,
    `    .mw-p.p-${n} img{ object-position:50% ${MOSAIC_GRID_POS[n] ?? 50}%; }`,
  ]);
  // the handful left at full brightness, one rule each so they out-specify the
  // blanket dim in hero-mosaic.css
  const lit = [...MOSAIC_GRID_LIT].map((n) =>
    `    .mw-p.p-${n} img{ filter:grayscale(1) brightness(1) contrast(1.04); }`);
  return ["<style>", ...wide,
    "  @media (max-width:900px){",
    "    .mw-p{ display:none; }",
    ...cells, ...lit,
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
const HERO_D = `  <!-- 1 · HERO — the mosaic -->
  <section class="hero-wall-photo dark hero-var" id="heroStage" data-variant="1">
    <div class="mw-sky"></div>
${wall(MOSAIC)}
    <div class="mw-scrim"></div>
    <div class="wrap mw-copy">
      <h1 class="serif display mw-rise" style="--d:180ms;">Your place in <em class="italic" style="color:var(--orange)">adaptive sports.</em></h1>
    </div>
    <div class="mw-grain"></div>
    <div class="mw-vig"></div>
  </section>
${layoutCss(MOSAIC, null, "mosaic")}

`;

/* --------------------------------------------------------------------------
   E — THE BANNER.  The arena version: one bottom-aligned row, heights varying
   so the top edge is a skyline. Set in the grotesk rather than the serif.
   -------------------------------------------------------------------------- */
const HERO_E = `  <!-- 1 · HERO — the banner (variant 2) -->
  <section class="hero-wall-photo hero-banner dark hero-var" id="heroStage" data-variant="2">
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
  return `<img src="/images/hero/panels/${hashed(`${name}.webp`)}" width="${m.w}" height="${m.h}" alt=""${cls ? ` class="${cls}"` : ""} ${extra}>`;
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
  "toss", "dink", "grin", "brian", "paddle", "swing",
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

/* --------------------------------------------------------------------------
   THE COURT.  Alec's plate, the traced cut-outs standing on it. Rejected
   2026-09-08 ("Hate it, don't use this") and no longer in the set — the
   template stays only because 9 is built from it by replacement, and deleting
   it would mean re-typing the same markup one class apart.
   -------------------------------------------------------------------------- */
const COURT = [
  { slot: "f-brian",  file: "trace-brian",  depth: 1 },
  { slot: "f-ben",    file: "trace-ben",    depth: 2 },
  { slot: "f-aubrey", file: "trace-aubrey", depth: 2 },
  { slot: "f-ryan",   file: "trace-ryan",   depth: 3 },
  { slot: "f-juan",   file: "trace-juan",   depth: 3 },
];
// The front two carry a reflection: the same file again, flipped and masked in
// CSS. It is a second <img> rather than a background because the alpha has to
// be the athlete's own silhouette, and no CSS trick reflects an element's alpha.
// The browser fetches it once.
const courtTeam = COURT.map((m) => {
  const front = m.depth === 3;
  const tag = cut(m.file, front ? 'fetchpriority="high" decoding="async"' : 'loading="lazy" decoding="async"');
  const refl = front ? `<span class="ct-refl" aria-hidden="true">${cut(m.file, 'loading="lazy" decoding="async"')}</span>` : "";
  return `      <figure class="ct-fig ${m.slot} c${m.depth}">${tag}${refl}</figure>`;
}).join("\n");

const HERO_COURT = `  <!-- 1 · HERO — the court (variant 8) -->
  <section class="hero-spec hero-court dark hero-var" id="heroStage" data-variant="8">
    <div class="ct-plate" role="img" aria-label="An empty adaptive pickleball court, lit from high right"></div>
    <div class="ct-shade"></div>
    <div class="ct-team" aria-hidden="true">
${courtTeam}
    </div>
    <div class="wrap sp-copy">
      <h1 class="sp-h1 sp-rise" style="--d:160ms;">Your Place in Adaptive Sports.</h1>
    </div>
    <div class="sp-grain"></div>
  </section>

`;

/* --------------------------------------------------------------------------
   9 — THE STADIUM, ON THE PLATE.  Same plate, same lighting, same depth
   treatment, same five people as 8 — one tight overlapping mass instead of a
   team spread across a floor. Built from the same markup with one modifier
   class so the arrangement is genuinely the only variable between the links.
   -------------------------------------------------------------------------- */
const HERO_STADIUM_PLATE = HERO_COURT
  .replace('class="hero-spec hero-court dark hero-var" id="heroStage" data-variant="8"',
           'class="hero-spec hero-court is-tight dark hero-var" id="heroStage" data-variant="9"')
  .replace("<!-- 1 · HERO — the court (variant 8) -->",
           "<!-- 1 · HERO — the stadium, on the plate (variant 9) -->");

const VARIANTS = { 1: HERO_D, 2: HERO_E, 3: HERO_FRAME, 4: HERO_KNOCKOUT,
                   5: HERO_STRIP, 6: HERO_GRID, 7: HERO_SPLIT_ONE, 9: HERO_STADIUM_PLATE };
const LABEL = {
  1: "1 · Mosaic", 2: "2 · Banner", 3: "3 · One frame", 4: "4 · Knockout",
  5: "5 · Strip", 6: "6 · Grid", 7: "7 · Split", 9: "9 · Stadium",
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

  // No parallax. It moved nineteen panels a few pixels against the pointer, and
  // a brush of the trackpad reads as the whole wall twitching. Alec: the
  // desktop images shake every couple of seconds, and he does not like it.
  // Removing it also drops a requestAnimationFrame loop, two window listeners
  // and will-change:transform on nineteen composited layers, which is the
  // cheapest thing on this page to give back.

  // There is no drive strip in the header any more. Alec, 2026-09-08: feel
  // first, then the ask. The campaign band directly below the hero still
  // renders the live drive, and no longer has to stand down for a duplicate.
})();
</script>
`;

// The variant switcher, so one link lets Alec flip between all three at the
// same scroll position instead of opening three tabs and guessing.

// Which stylesheet a variant needs on top of site.css. 1 and 2 are the
// photograph-wall pair; everything else is the spectrum sheet.
export const sheetFor = (key) =>
  ["1", "2"].includes(String(key)) ? "hero-mosaic" : "hero-spectrum";

export { VARIANTS, LABEL, STAGE_JS, ROOT };
