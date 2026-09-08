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

// Five athletes, three of them cropped at the waist in the source and
// therefore only ever placed in the back row, behind the floor haze.
const FIG = {
  net: `      <figure class="hs-fig f-net d-back"><img src="/images/hero/cut-net.webp" ${dim("cut-net.webp")} alt="" loading="eager" decoding="async"></figure>`,
  paddle: `      <figure class="hs-fig f-paddle d-mid"><img src="/images/hero/cut-paddle.webp" ${dim("cut-paddle.webp")} alt="" loading="eager" decoding="async"></figure>`,
  smile: `      <figure class="hs-fig f-smile d-mid"><img src="/images/hero/cut-smile.webp" ${dim("cut-smile.webp")} alt="" loading="eager" decoding="async"></figure>`,
  forehand: `      <figure class="hs-fig f-forehand d-front above-haze"><img src="/images/hero/cut-forehand.webp" ${dim("cut-forehand.webp")} alt="" fetchpriority="high" decoding="async"></figure>`,
  dink: `      <figure class="hs-fig f-dink d-front above-haze"><img src="/images/hero/cut-dink.webp" ${dim("cut-dink.webp")} alt="" fetchpriority="high" decoding="async"></figure>`,
};

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
${FIG.net}
${FIG.paddle}
${FIG.smile}
      <div class="hs-haze"></div>
${FIG.forehand}
${FIG.dink}
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
${FIG.net}
${FIG.smile}
${FIG.paddle}
      <div class="hs-haze"></div>
${FIG.dink}
${FIG.forehand}
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
${FIG.net}
${FIG.paddle}
${FIG.smile}
      <div class="hs-haze"></div>
${FIG.forehand}
${FIG.dink}
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

const VARIANTS = { a: HERO_A, b: HERO_B, c: HERO_C };
const LABEL = { a: "A · The lineup", b: "B · The wall", c: "C · The split" };

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
  var figs = [].slice.call(stage.querySelectorAll('.hs-fig'));
  var fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  if(!reduce && fine && figs.length){
    var depth = function(f){ return f.classList.contains('d-front') ? 1 : f.classList.contains('d-mid') ? 0.55 : 0.3; };
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
      var go = box.querySelector('.hs-drive-go');
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
  const items = ["a", "b", "c"]
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
      '<link rel="stylesheet" href="/css/site.css">\n<link rel="stylesheet" href="/css/hero-lineup.css">',
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
