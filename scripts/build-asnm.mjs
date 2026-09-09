// scripts/build-asnm.mjs — put the real directory on the page.
//
// /adaptive-sports-near-me used to describe a directory that had not launched.
// It has: adaptivesportsnearme.com serves 1,544 programs across 51 states from
// 22 sources, all free to look up. A page that only DESCRIBES that is selling it
// short, so this pulls the live counts and renders them as something a visitor
// can click straight into.
//
// WHY GENERATED AND NOT TYPED. A hand-written "1,544 programs" is correct for a
// week and wrong forever after, and this codebase has already been bitten by
// facts that quietly expire. These regenerate on every build from
// /api/stats, so the number on the page is the number in the database.
//
// WHY BUILD TIME AND NOT THE BROWSER. The directory's API sends no CORS headers,
// so a page on adapttolife.org cannot read it directly. Proxying it through our
// own Worker would work and would cost every visitor a request and a spinner for
// a number that changes a few times a week. Baking it costs nothing at runtime,
// puts the figures in the HTML where crawlers see them, and cannot fail in front
// of a donor.
//
// NETWORK FAILURE IS NOT A BUILD FAILURE. The last good response is committed to
// data/asnm-stats.json, so an outage at deploy time reuses those numbers and
// says so loudly rather than shipping a page with holes in it.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = join(ROOT, "data", "asnm-stats.json");
// Written by scripts/shoot-asnm.mjs. Falls back only if someone deletes it.
let shot = { wide: { w: 1440, h: 925 }, tall: { w: 828, h: 1520 } };
try { shot = JSON.parse(readFileSync(join(ROOT, "data", "asnm-shot.json"), "utf8")); } catch {}
const SITE = "https://adaptivesportsnearme.com";
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
const n = (x) => Number(x).toLocaleString("en-US");

let stats, live = false;
try {
  const r = await fetch(`${SITE}/api/stats`, { signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = await r.json();
  if (!d.ok || !d.programs) throw new Error("payload missing programs");
  stats = d; live = true;
  // PERSIST ONLY WHAT THE PAGE USES. The payload also carries lastPipelineRun,
  // a clock from the directory's own pipeline that moves every few minutes and
  // that nothing here reads. Caching it meant every build rewrote this file,
  // the tree went dirty, and public/build.txt was stamped "-dirty" on every
  // deploy — permanently retiring a flag whose entire job is to warn that a
  // build came from uncommitted work. A signal that always fires is not a
  // signal. Now the cache changes only when a number a visitor sees changes,
  // which is a diff worth committing.
  const keep = { ok: d.ok, programs: d.programs, sources: d.sources, bySport: d.bySport, byState: d.byState };
  writeFileSync(CACHE, JSON.stringify(keep, null, 1) + "\n");
} catch (e) {
  console.log(`  WARN  live stats unavailable (${e.message}); using the last committed copy`);
  stats = JSON.parse(readFileSync(CACHE, "utf8"));
}

// Sports first by size. The ones carrying a `key` deep-link into the directory
// already filtered; the rest are still worth naming because the breadth IS the
// product, and a name with no link still tells you it is in there.
const sports = [...stats.bySport].sort((a, b) => b.n - a.n).slice(0, 14);
const states = [...stats.byState].sort((a, b) => b.n - a.n).slice(0, 12);
const chip = (label, count, href) => href
  ? `<li><a class="dir-chip" href="${esc(href)}" target="_blank" rel="noopener">${esc(label)}<b>${n(count)}</b></a></li>`
  : `<li><span class="dir-chip is-plain">${esc(label)}<b>${n(count)}</b></span></li>`;

const block = `<!-- asnm:stats -->
  <section class="band dark dir-stats">
    <div class="wrap">
      <span class="eyebrow orange reveal">In the directory right now</span>
      <p class="dir-count reveal"><b>${n(stats.programs)}</b> programs, <b>${n(stats.byState.length)}</b> states, <b>${n(stats.sources)}</b> sources. Free to search, no account.</p>

      <a class="dir-shot reveal" href="${SITE}" target="_blank" rel="noopener">
        <picture>
          <source media="(max-width: 900px)" srcset="/images/asnm-directory-tall.webp" width="${shot.tall.w}" height="${shot.tall.h}">
          <img src="/images/asnm-directory.webp" width="${shot.wide.w}" height="${shot.wide.h}" loading="lazy" decoding="async"
               alt="The Adaptive Sports Near Me directory: a search box for a sport, zip or program, a row of sports to filter by, and cards for real programs across the country with their state and type.">
        </picture>
        <span class="dir-shot-cap">adaptivesportsnearme.com <span class="arrow">&rarr;</span></span>
      </a>

      <h2 class="dir-h reveal">By sport</h2>
      <ul class="dir-chips reveal">
${sports.map((s) => "        " + chip(s.label, s.n, s.key ? `${SITE}/?sport=${encodeURIComponent(s.key)}` : null)).join("\n")}
      </ul>

      <h2 class="dir-h reveal">By state</h2>
      <ul class="dir-chips reveal">
${states.map((s) => "        " + chip(s.name, s.n, `${SITE}/?state=${encodeURIComponent(s.state)}`)).join("\n")}
      </ul>
      <!-- No button pair here on purpose. The hero already carries one and the
           closing section carries another; a third set on the same page is
           noise. The screenshot and every chip above are links into the
           directory already. -->
    </div>
  </section>
  <!-- /asnm:stats -->`;

const page = join(ROOT, "public", "adaptive-sports-near-me.html");
let html = readFileSync(page, "utf8");

// ---- environment plate vars -------------------------------------------------
// Same idea as band:vars: the content hash lives here, never in hand-written
// CSS, so re-cropping a plate cannot leave a stale URL behind.
//
// This marker goes AFTER the page's own </style>, not next to band:vars. The
// band:vars regex in apply-page-headers.mjs swallows every CONSECUTIVE <style>
// after its marker, and today the only thing stopping it from eating this
// page's 140-line stylesheet is an unrelated <script> tag sitting between the
// two. Parking a second <style> up there would be building on that accident.
// Custom properties on :root resolve wherever they are declared, so the later
// position costs nothing.
let plates = null;
try { plates = JSON.parse(readFileSync(join(ROOT, "data", "env-plates.json"), "utf8")); } catch {}
if (plates && plates["court-dusk-wide"] && plates["court-dusk-tall"]) {
  const vars = `:root{--env-dusk-wide:url('${plates["court-dusk-wide"].file}');` +
               `--env-dusk-tall:url('${plates["court-dusk-tall"].file}');}`;
  const block = `<!-- env:vars --><style>${vars}</style><!-- /env:vars -->`;
  const ERE = /<!-- env:vars -->[\s\S]*?<!-- \/env:vars -->/;
  html = ERE.test(html) ? html.replace(ERE, block)
                        : html.replace(/(\n<\/head>)/, `\n${block}$1`);
}
const RE = /<!-- asnm:stats -->[\s\S]*?<!-- \/asnm:stats -->/;
if (RE.test(html)) html = html.replace(RE, block);
else html = html.replace(/(\n  <!-- WHY \(light reading\) -->)/, `\n  ${block}\n${"$1"}`);
writeFileSync(page, html);

// the homepage claims the directory exists; give it the number
const home = join(ROOT, "public", "index.html");
let h = readFileSync(home, "utf8");
const HRE = /(<strong>Adaptive Sports Near Me<\/strong> is a free, open directory of )[\s\S]*?( programs nationwide)/;
if (HRE.test(h)) {
  h = h.replace(HRE, `$1<!-- asnm:count -->${n(stats.programs)}<!-- /asnm:count -->$2`);
  writeFileSync(home, h);
}

console.log(`  asnm stats ${live ? "LIVE" : "from cache"}: ${n(stats.programs)} programs, ${stats.byState.length} states, ${stats.sources} sources, ${stats.bySport.length} sports`);
