// scripts/check-site.mjs — the site's standing check.
//
// Why this exists: /popcorn shipped with the whole nav script included twice,
// so every tap on the mobile menu button toggled it open and shut again and the
// menu never opened. Nav parity had been "verified" by grepping the markup,
// which was present and identical on every page. Markup being right is not the
// same as the thing working, so this clicks.
//
// Checks, on a deployed URL:
//   1. every page returns 200, and an unknown path returns 404
//   2. the mobile menu OPENS on one tap, on every page
//   3. the desktop dropdown OPENS on click, on every page
//   4. mobile menu items === desktop nav items (the Spec 23 parity rule)
//   5. zero horizontal overflow at 390px and 1440px
//   6. zero reachable dead links, and every internal target resolves
//   7. no page errors in the console
//   8. every page's og:image resolves, is absolute, carries alt text, matches
//      its declared 1200x630, and fits the preview budget
//   9. the DEPLOYED build is the one being checked, so a passing run cannot be
//      a passing run against someone else's build
//
// Pages run with reduced motion. The coaching photo band loops a 30s ken-burns
// scale, so without it the overflow probe caught the image mid-scale and the
// same build passed or failed depending on when it ran.
//
// Box-local dev tool (not Worker code): Playwright lives at ~/pw on the box.
// Usage: node scripts/check-site.mjs [base-url]
//   default base: the staging Worker. Pass https://adapttolife.org to check prod.
import { chromium } from "/home/agentos/pw/node_modules/playwright/index.mjs";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { ROLES } from "../data/volunteer-roles.mjs";

const BASE = process.argv[2] || "https://adapt-to-life-staging.alec-af3.workers.dev";
const IS_STAGING = BASE.includes("staging");
// The volunteer role pages are all generated from one template by
// scripts/build-volunteer.mjs, so this samples the first and last rather than
// loading all twenty-seven: what differs between them is prose and one apply
// href, and test/volunteer_pages.test.js checks every page's structure, share
// card and apply link statically. The sample is DERIVED from the data so it
// follows a slug rename instead of going stale.
//
// /volunteer itself was missing from this list for a day after it shipped, which
// is exactly the failure mode of a hand-maintained page list: the sweep silently
// stops covering the newest thing on the site.
const ROLE_SAMPLE = [ROLES[0], ROLES[ROLES.length - 1]].map((r) => `/volunteer/${r.slug}`);
const PAGES = [
  "/", "/about", "/adaptive-sports-near-me", "/apply", "/contact", "/donate",
  "/hustle-and-heart", "/karen", "/popcorn", "/promise", "/roadmap", "/send-6",
  "/sponsorship", "/subscribe", "/tim", "/volunteer", "/waiver",
  ...ROLE_SAMPLE,
];

// Site-wide and benign: the off-screen honeypot every form carries, and
// aria-hidden decorative atmosphere inside an overflow:hidden parent.
const IGNORE_OVERFLOW = `
  if (el.closest('[aria-hidden="true"]') || el.getAttribute('aria-hidden') === 'true') return;
  if (el.matches('input[aria-hidden="true"]')) return;
`;

const browser = await chromium.launch();
let failed = false;
const fail = (msg) => { failed = true; console.log("FAIL " + msg); };
const targets = new Set();
let reference = null;

for (const path of PAGES) {
  // ---- mobile: one tap must open the menu -------------------------------
  const m = await browser.newPage({ viewport: { width: 390, height: 800 }, reducedMotion: "reduce" });
  const mErrs = [];
  m.on("pageerror", (e) => mErrs.push(String(e).slice(0, 90)));
  // Turnstile logs a %c%d line as console.error on every page; not ours.
  m.on("console", (c) => { if (c.type() === "error" && !c.text().includes("font-size:0")) mErrs.push(c.text().slice(0, 90)); });
  const mRes = await m.goto(`${BASE}${path}?cb=${Date.now()}`, { waitUntil: "domcontentloaded" });
  await m.waitForTimeout(1500);
  if (mRes.status() !== 200) fail(`${path} returned ${mRes.status()}`);
  await m.click("#menuBtn");
  await m.waitForTimeout(450);
  const mob = await m.evaluate(`(() => ({
    open: document.getElementById('nav').classList.contains('open'),
    height: Math.round(document.querySelector('.mobile-menu').getBoundingClientRect().height),
    items: [...document.querySelectorAll('.mobile-menu a')].map(a => a.getAttribute('href')).join(','),
    overflow: (() => { const bad = []; document.querySelectorAll('*').forEach(el => { ${IGNORE_OVERFLOW}
      const r = el.getBoundingClientRect();
      if (r.width > 0 && (r.right > window.innerWidth + 1 || r.left < -1)) bad.push(el.tagName.toLowerCase() + '.' + (typeof el.className === 'string' ? el.className.trim().split(/\\s+/).join('.') : ''));
    }); return [...new Set(bad)]; })(),
  }))()`);
  await m.close();

  if (!mob.open || mob.height < 100) fail(`${path} mobile menu did not open (open=${mob.open}, height=${mob.height})`);
  if (mob.overflow.length) fail(`${path} @390 horizontal overflow: ${JSON.stringify(mob.overflow)}`);
  if (mErrs.length) fail(`${path} @390 console: ${JSON.stringify(mErrs)}`);

  // ---- desktop: the dropdown must open, and match mobile ----------------
  const d = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
  const dErrs = [];
  d.on("pageerror", (e) => dErrs.push(String(e).slice(0, 90)));
  d.on("console", (c) => { if (c.type() === "error" && !c.text().includes("font-size:0")) dErrs.push(c.text().slice(0, 90)); });
  await d.goto(`${BASE}${path}?cb=${Date.now()}`, { waitUntil: "domcontentloaded" });
  await d.waitForTimeout(1500);
  await d.click('.nav-toggle[aria-controls="navOurWork"]');
  await d.waitForTimeout(350);
  const desk = await d.evaluate(`(() => ({
    panelOpen: document.getElementById('navOurWork').classList.contains('open'),
    visibility: getComputedStyle(document.getElementById('navOurWork')).visibility,
    items: [...document.querySelectorAll('.nav-links a')].map(a => a.getAttribute('href')).join(','),
    overflow: (() => { const bad = []; document.querySelectorAll('*').forEach(el => { ${IGNORE_OVERFLOW}
      const r = el.getBoundingClientRect();
      if (r.width > 0 && (r.right > window.innerWidth + 1 || r.left < -1)) bad.push(el.tagName.toLowerCase() + '.' + (typeof el.className === 'string' ? el.className.trim().split(/\\s+/).join('.') : ''));
    }); return [...new Set(bad)]; })(),
    // Only links a user can reach count. The waiver's success panel holds
    // href="#" placeholders that JS fills in after signing; they sit in a
    // display:none subtree until then, so they are not dead clicks.
    links: [...document.querySelectorAll('a[href]')].filter(a => a.getClientRects().length > 0 || a.offsetParent !== null).map(a => a.getAttribute('href')),
  }))()`);
  await d.close();

  if (!desk.panelOpen || desk.visibility !== "visible") fail(`${path} desktop dropdown did not open (open=${desk.panelOpen}, ${desk.visibility})`);
  if (desk.overflow.length) fail(`${path} @1440 horizontal overflow: ${JSON.stringify(desk.overflow)}`);
  if (dErrs.length) fail(`${path} @1440 console: ${JSON.stringify(dErrs)}`);

  const dead = desk.links.filter((h) => !h || h === "#" || h === "javascript:void(0)");
  if (dead.length) fail(`${path} has ${dead.length} reachable dead link(s)`);
  desk.links.forEach((h) => { if (/^\//.test(h)) targets.add(h.split("#")[0]); });

  if (!reference) reference = { mob: mob.items, desk: desk.items };
  else {
    if (mob.items !== reference.mob) fail(`${path} mobile nav differs from the rest of the site`);
    if (desk.items !== reference.desk) fail(`${path} desktop nav differs from the rest of the site`);
  }

  process.stdout.write(".");
}

console.log("");
if (reference.mob !== reference.desk) fail(`mobile and desktop navs differ:\n  mobile:  ${reference.mob}\n  desktop: ${reference.desk}`);

for (const t of [...targets].sort()) {
  const r = await fetch(`${BASE}${t}${t.includes("?") ? "" : `?cb=${Date.now()}`}`);
  if (!r.ok) fail(`internal link ${t} returned ${r.status}`);
}

const missing = await fetch(`${BASE}/definitely-not-a-real-page?cb=${Date.now()}`);
if (missing.status !== 404) fail(`unknown path returned ${missing.status}, expected 404`);

// ---- is the deployed build MY build? --------------------------------------
// Everything below tests a URL. If someone else's branch has landed on that URL
// since you deployed, every check can pass against the wrong build and you will
// hand over a link that shows the old thing. That happened on 2026-07-25:
// eleven staging deploys in ninety minutes, three of them mine, and the review
// link served the June card. Compare first, so the rest means something.
{
  const local = execSync("node scripts/stamp-build.mjs >/dev/null && cat public/build.txt",
    { encoding: "utf8" }).trim();
  const r = await fetch(`${BASE}/build.txt?cb=${Date.now()}`);
  if (!r.ok) {
    fail(`${BASE} serves no /build.txt (${r.status}). Either it was deployed without ` +
         `scripts/stamp-build.mjs, or something else deployed over you.`);
  } else {
    const live = (await r.text()).trim();
    if (live !== local) {
      fail(`the deployed build is NOT the one being checked.\n` +
           `  deployed: ${live}\n  local:    ${local}\n` +
           `  Someone else deployed to this URL, or you have not deployed since your last edit. ` +
           `Every check below is testing a build you did not make.`);
    } else {
      console.log(`build: ${live} (deployed build matches local)`);
    }
  }
}

// ---- share cards: the one thing nobody sees while building ----------------
// An og:image is invisible on the site itself, so a wrong path, a stale file or
// a card over the preview budget shows up only in someone else's text thread,
// which is the worst place to find it. Checked on the wire, not in the repo.
{
  const OG_BUDGET = 300 * 1024; // WhatsApp-class ceiling; over it, no preview
  const seen = new Map();
  for (const path of PAGES) {
    const html = await (await fetch(`${BASE}${path}?cb=${Date.now()}`)).text();
    const src = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1];
    if (!src) { fail(`${path} has no og:image`); continue; }
    if (!/<meta property="og:image:alt" content="[^"]+"/.test(html))
      fail(`${path} og:image has no alt text`);

    // pages may legitimately share the default card; fetch each card once
    if (!seen.has(src)) {
      // og:image must be absolute: crawlers do not resolve relative paths
      if (!/^https:\/\//.test(src)) { fail(`${path} og:image is not absolute: ${src}`); continue; }
      const asset = new URL(src).pathname;
      const r = await fetch(`${BASE}${asset}?cb=${Date.now()}`);
      if (!r.ok) { fail(`og:image ${asset} returned ${r.status}`); seen.set(src, false); continue; }
      const bytes = (await r.arrayBuffer()).byteLength;
      if (bytes > OG_BUDGET)
        fail(`og:image ${asset} is ${Math.round(bytes / 1024)}KB, over the ${OG_BUDGET / 1024}KB preview budget`);
      if (!/^image\//.test(r.headers.get("content-type") || ""))
        fail(`og:image ${asset} served as ${r.headers.get("content-type")}`);
      seen.set(src, true);
    }

    // the declared size has to match the file, or the card lays out wrong
    const w = html.match(/<meta property="og:image:width" content="(\d+)"/)?.[1];
    const h = html.match(/<meta property="og:image:height" content="(\d+)"/)?.[1];
    if (w !== "1200" || h !== "630") fail(`${path} declares og:image ${w}x${h}, expected 1200x630`);

    const tw = html.match(/<meta name="twitter:image" content="([^"]+)"/)?.[1];
    if (tw && tw !== src) fail(`${path} twitter:image (${tw}) differs from og:image (${src})`);
  }
  console.log(`share cards: ${seen.size} distinct, all fetched`);
}

// ---- /review: the one link Alec gets ------------------------------------
// It is the tour of the current iteration, so it going stale is a bug in the
// iteration, not a chore for later. This session it described a build three
// weeks old, including a goal figure we had already retired.
{
  const tour = readFileSync(new URL("../public/review.html", import.meta.url), "utf8");
  const stamped = tour.match(/updated (\d{4}-\d{2}-\d{2})/)?.[1];
  const lastTouched = execSync(
    "git log -1 --format=%cs -- public ':(exclude)public/review.html'",
    { encoding: "utf8" }
  ).trim();
  if (!stamped) fail("review.html has no `updated YYYY-MM-DD` stamp");
  else if (lastTouched && stamped < lastTouched)
    fail(`review.html is stale: stamped ${stamped}, but public/ last changed ${lastTouched}. The tour is the deliverable, so refresh it in the same commit.`);

  // A 429 is this script's own fault, not the site's.
  //
  // 2026-09-04: /review came back 429 in a full production run and 302 three
  // times in a row a moment later. This file fetches every page, every internal
  // target and every tour stop as fast as the network allows, with cache
  // busting on all of it, from one IP. Cloudflare eventually treats that as
  // what it looks like. Reporting it as a broken route is a lie about the site,
  // and it is how a check earns a reputation for crying wolf.
  //
  // One pause and one retry. A route that is genuinely down stays down.
  const patientFetch = async (url, init) => {
    for (const backoff of [8000, 20000, null]) {
      const r = await fetch(url, init);
      if (r.status !== 429 || backoff === null) return r;
      console.log(`  rate limited on ${new URL(url).pathname}, waiting ${backoff / 1000}s`);
      await new Promise((resolve) => setTimeout(resolve, backoff));
    }
  };

  // /review is checked BEFORE the tour stops, not after.
  //
  // It used to run last, immediately behind a burst of cache-busted fetches for
  // every stop on the tour, and that is exactly where the 429 landed. Asking
  // first costs nothing and asks while the edge is still calm.
  const rv = await patientFetch(`${BASE}/review?cb=${Date.now()}`, { redirect: "manual" });

  // Every stop must be a real page, and the tour stays off production.
  for (const href of [...tour.matchAll(/class="rv-steps"[\s\S]*?<\/ol>/g)][0]?.[0]
    .matchAll(/href="(\/[^"]*)"/g) ?? []) {
    const r = await patientFetch(`${BASE}${href[1]}?cb=${Date.now()}`);
    if (!r.ok) fail(`review.html links to ${href[1]}, which returned ${r.status}`);
  }
  if (rv.status === 429)
    fail(`/review still rate limited after three tries. This is Cloudflare throttling this script, not a broken route: check it by hand with curl before believing it.`);
  else if (IS_STAGING && rv.status !== 200) fail(`/review returned ${rv.status} on staging, expected 200`);
  else if (!IS_STAGING && rv.status !== 302) fail(`/review returned ${rv.status} on production, expected a 302 home`);
}

// ---- the money path: the giving form must reach a real amount -----------
// Why this exists: /donate and /hustle-and-heart embed Givebutter, and nothing
// here asserted it worked. The page could return 200, pass every nav and link
// check above, and still show a donor an empty box. The embed also renders into
// a shadow root with a cross-origin iframe inside it, so "the markup is present"
// is especially meaningless — the <givebutter-giving-form> tag is in the HTML
// whether or not the widget ever mounts.
//
// So this reads the amount step the way a donor does. It is deliberately the
// strongest assertion in this file, because it guards the only path on the site
// where a failure costs the org money. It will also fail if Givebutter itself is
// down, which is correct: the giving form being unusable is worth a red build
// no matter whose fault it is.
// Two attempts, and this is not the assertion going soft. Every check below is
// unchanged and still has to pass: the amount step visible, a way to continue,
// an amount a donor can pick. What changed is that a transient failure no longer
// spends the whole run.
//
// 2026-09-04: /hustle-and-heart failed here on `attached` after 20s inside a
// full run. Rerun on its own, twice, the element attached in 312ms and the
// amount step was visible in 2.0s, on both pages. An element that normally
// appears in a third of a second does not take twenty seconds because the site
// is slow, so the red build was the harness, not the money path, and a check
// that goes red on a working form is a check people learn to skip.
//
// The retry is loud on purpose. If this starts printing every run, the embed
// really is degrading and the note above has expired.
for (const path of ["/donate", "/hustle-and-heart"]) {
  let lastError = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
  const g = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
  try {
    await g.goto(`${BASE}${path}?cb=${Date.now()}`, { waitUntil: "domcontentloaded" });
    const form = g.locator("givebutter-giving-form");
    await form.waitFor({ state: "attached", timeout: 20000 });

    // Scroll the panel into view before asserting. The embed is deferred until
    // it nears the viewport, so a check that never scrolls cannot tell a broken
    // form from a correctly-deferred one — on /hustle-and-heart the panel sits
    // far enough down that this is the difference between red and green. A
    // donor scrolls to the form before using it, so this models the real thing
    // rather than weakening the assertion.
    await form.scrollIntoViewIfNeeded();

    // The embed lives in an iframe inside the element's shadow root. Wait on the
    // amount step being VISIBLE, not on an element being attached: the iframe is
    // attached long before it renders, and most of its ~30 inputs are hidden, so
    // both "attached" and `input.first()` resolve on something a donor cannot
    // see. Waiting on the text a donor reads is the only honest signal.
    const inner = g.frameLocator("givebutter-giving-form iframe");
    await inner.getByText(/choose amount/i).first().waitFor({ state: "visible", timeout: 45000 });

    const text = (await inner.locator("body").innerText()).replace(/\s+/g, " ");
    if (!/continue|donate|give/i.test(text)) fail(`${path} giving form has no way to proceed (text: ${text.slice(0, 80)})`);

    const amounts = await inner.locator("input:visible").count();
    if (amounts < 1) fail(`${path} giving form rendered no amount a donor can pick`);

    // Deliberately no height assertion. The panel is 188px when the amount step
    // first paints and ~508px once it settles, so any pixel threshold is a race.
    // "The donor can see the amounts and a way to continue" is the real contract.
    lastError = null;
  } catch (e) {
    lastError = e;
  }
  await g.close();
  if (!lastError) break;
  if (attempt === 1) {
    console.log(`  retrying ${path} giving form: ${String(lastError).split("\n")[0].slice(0, 80)}`);
  } else {
    fail(`${path} giving form did not become usable twice: ${String(lastError).split("\n")[0].slice(0, 120)}`);
  }
  }
}

// ---- performance budget --------------------------------------------------
// Why this exists: an audit on 2026-07-25 found /donate arriving at 9.4 MB over
// 109 requests from 21 third-party hosts, with the main thread blocked ~2s on a
// throttled phone. Nothing in this file would have caught it, and nothing would
// catch the next embed someone drops in. Weight arrives one widget at a time and
// no single commit ever looks like the problem, so the ceiling has to be a test.
//
// These are RATCHETS, not targets — set just above what the site measures today
// so any regression is loud, then tightened whenever a fix lands. `own` is our
// own bytes and is the only number fully under our control; `hosts` is the
// sharpest regression signal because a new embed shows up there first.
//
// Measured over three runs each: own/total/requests/hosts were stable to <0.2%.
// CLS was not, which is itself the finding — see the /donate note below.
// These numbers come from PRODUCTION, not staging, and that distinction cost a
// red build to learn: the prod zone injects Cloudflare's bot-detection script
// (/cdn-cgi/challenge-platform/.../jsd/main.js, ~21KB same-origin) and the Web
// Analytics beacon, neither of which exists on the workers.dev staging Worker.
// Budget the surface a donor actually touches; staging simply runs under it.
//
// Tightened 2026-07-25 when Turnstile stopped loading eagerly: / went from
// 1314KB/26req/4hosts to 500KB/15req/2hosts on staging. A ratchet you do not
// re-tighten after a fix is a ratchet that quietly lets the fix be undone, so
// these come down every time weight comes off.
// / gets no host headroom: every host there is a choice we made (fonts,
// Turnstile, CF analytics), so a new one is a decision worth a red build.
// /donate gets one slot, because Givebutter's own dependency set shifts
// (q.stripe.com appears conditionally) and we do not control it. One slot still
// catches an added embed: embeds arrive with a fleet of hosts, not one.
//
// Re-baselined 2026-08-29 for the photography pass. This is a RAISE, and a
// ratchet that goes up needs its reason in writing or it is just a rubber
// stamp. The homepage used to carry one 60KB photoband image; it now carries a
// photographed hero (wheelie-4, 39KB) plus the mid-page band (wheelie-9-band,
// 50KB; the band ran wheelie-47 at 115KB, then wheelie-167 at 110KB, then the
// plain wheelie-9 frame at 56KB, before landing here — the cap has never had
// to move for any of them, and the retired files are deleted rather than left
// to ship on every deploy). Measured, not estimated: prod own was 168KB before, the image swap is
// -60KB +154KB = +94KB, so prod lands at ~262KB. 270 gives ~3% for encoder and
// CF-script variance and nothing more.
//
// What did NOT get spent: total went 549 -> ~643KB against a 700KB ceiling that
// stays put, request count is unchanged, and no new third-party host. If the
// next weight-saving fix lands (self-hosted subset fonts is the open one), this
// comes back down — see the ratchet rule above.
//
// Lowered 2026-09-05, / own 270 -> 193, and this is the ratchet doing the job
// it was raised for. The band photo changed twice by Alec's eye, not for
// weight, and landed on a 56KB frame where the raise had budgeted 115KB.
//
// Measured on PRODUCTION, twice: own 183KB and 184KB. 193 is that plus the
// same ~5% the homepage was always given for encoder and CF-script variance.
//
// Calibrate this number against production and nothing else. The first attempt
// at this line set it to 170 off two staging runs that both said 162KB, and it
// failed on prod immediately: production serves ~21KB of Cloudflare scripts
// that staging does not (22 requests and 3 third-party hosts there against 17
// and 2), and this file already knows to count those, because a reader really
// does download them. Staging is the cheaper host to measure and the wrong one.
//
// The point of taking it back at all: 270 would still pass if someone dropped a
// 100KB hero in tomorrow, and nobody would learn that they had spent the whole
// saving. A cap that only ever goes up is a record of what we once allowed,
// not a limit.
// Raised 2026-09-04, /donate own 120 -> 125, and this is a measurement fix
// wearing a raise's clothes, so here is the evidence.
//
// /donate had been failing intermittently: 122KB against a 120KB cap on one
// run, 119.8KB on the next, with nothing shipped in between. Four consecutive
// production runs, split by source:
//
//     run 1  own 120KB   cdn-cgi 20KB   ours 100KB
//     run 2  own 121KB   cdn-cgi 21KB   ours 100KB
//     run 3  own 121KB   cdn-cgi 20KB   ours 100KB
//     run 4  own 121KB   cdn-cgi 21KB   ours 100KB
//
// Our own content is 100KB and does not move. Every kilobyte of the wobble is
// Cloudflare's bot-detection script, which this file already knows is counted
// deliberately, on the reasoning that a donor really does download it. That
// reasoning still holds. What was wrong is that /donate was given no room for
// the variance the homepage was explicitly given ~3% for, so the cap sat
// exactly on the number and flipped on a script we do not ship and cannot pin.
//
// 125 is 100 ours + 21 observed maximum + 4 for encoder and CF drift. The
// ratchet is not loosened in any way that matters: our real content would have
// to grow by 4KB, 4% in one go, to trip it, and the intermittent red build that
// was training everyone to ignore this check is gone.
// ==========================================================================
// WHAT THESE NUMBERS ARE FOR — re-ruled by Alec, 2026-09-09.
//
//   "I think I'm okay with being over budget on kilobytes, I care more about
//    quality and functionality. Make sure we have the best website for what we
//    want and a stale rule didn't hurt us more than help us."
//
// So the caps are re-scoped. They are REGRESSION DETECTORS, not a quality
// constraint. They exist to catch the accident — a 5MB PNG dropped in, a
// third-party script that quietly doubles, an image shipped at 4x the size it
// paints. They do NOT exist to make anyone choose a worse version of the site.
//
// I audited whether the old framing had already cost us anything, because that
// was the question Alec actually asked. What I found:
//
//   · IMAGE QUALITY: never compromised. Every panel is sized to what it
//     actually paints (the front four resolve at ~390 device px and ship at
//     820), so nothing upscales. And at a 100% crop, q68 / q78 / q88 on a
//     front-plane face are indistinguishable — these are monochrome frames
//     with smooth tone and WebP handles them well. q88 would cost +52KB per
//     panel for nothing visible. Every byte decision on the images was driven
//     by measurement, and would have been the same with no cap at all.
//   · DOCUMENTATION: this is where it DID hurt. Twice in one day I cut
//     explanatory comments out of a stylesheet to claw back a kilobyte.
//     Comments are roughly half this site's gzipped CSS, and deleting the
//     reasoning to save 0.2% of a page is a bad trade — the reasoning is what
//     stops the next person reintroducing the bug. Those comments are restored
//     and the caps below have room for more.
//
// The rule going forward: a cap may never be the reason something ships worse.
// If a cap is in the way of a decision Alec made or a comment worth writing,
// the cap moves and the arithmetic gets written here. If it is in the way of
// carelessness, it holds. The ratchet history below stays because it is a
// useful record of what this page has cost over time.
const BUDGET = {
  // Re-baselined 2026-09-08, and this is a RAISE, so per the ratchet rule above
  // here is the reason and the evidence.
  //
  // The homepage header stopped being type on a black field and became the
  // site's primary argument: nineteen photographs of the athletes the fund
  // exists for (Alec's decision, after comparing nine candidates). A budget
  // that vetoes an owner's design decision is not protecting anything, it is
  // just a record of what the page used to be. But it should be re-set tight to
  // the new reality, not opened wide, so it still catches the accident it was
  // written to catch.
  //
  // What was done BEFORE touching the number, because a raise has to be the
  // last resort and not the first:
  //   · every panel re-tiered to what the composition actually paints — the
  //     front four never exceed ~390 CSS px, mid ~200, back ~215 and the back
  //     row is blurred 2.4px at 34% brightness on top of that. Front 860->700,
  //     mid 560->400, back 340->250, quality 80/76/70 -> 74/68/58.
  //   · verified at 100% crop that nothing visibly degraded.
  // That took the hero from 490KB to 250KB. Half the cost, no visible change.
  //
  // Measured on the deployed build after that work: own 430KB, total 784KB,
  // 37 requests. Of the 430, 250 is the header and ~180 is what the page
  // already carried. The caps below are those numbers plus ~4% for encoder and
  // CF-script drift — the same allowance /donate is given and for the same
  // reason. Our own content would have to grow ~18KB to trip it again.
  //
  // The request count is the honest sore point. Nineteen photographs is
  // nineteen requests, and they are all above the fold so none can be lazy.
  // The back plane — seven panels, blurred and dimmed, 36KB the lot — could be
  // pre-composed into ONE image the way the interior band and the court plate
  // already are, taking this to 31. That is the next move if this number needs
  // to come down; it is not done here because it would also flatten the
  // parallax those seven have, and that is a design call for Alec, not a
  // performance call for me.
  // 448 -> 460 on 2026-09-08, and this raise is 4KB of measurement plus the
  // usual drift allowance, not a concession.
  //
  // Alec asked for two things at once: crisper images and a lighter page. The
  // wall was soft because every back-plane panel rendered at 1.7-2.5x its own
  // pixels under a 2.4px blur. Fixing that meant more pixels, and the trade was
  // paid for rather than waved through: depth is baked into the files instead
  // of applied in CSS, and a pre-darkened frame compresses far better — the back
  // plane went to 2.2x the resolution for under a kilobyte a panel. Front
  // quality came down 76 -> 68. Net: 250KB -> 268KB of photographs for a wall
  // whose worst upscale went from 2.50x to 1.05x.
  //
  // Measured own 452KB. And the page got genuinely lighter where it counts:
  // removing the pointer parallax dropped a requestAnimationFrame loop, two
  // window listeners and will-change:transform on nineteen composited layers.
  // Bytes are not the only weight a page carries.
  // 2026-09-09: 460 -> 520 own, 815 -> 900 total. Measured own on the deployed
  // build is 460KB — 276 of it the twenty-two header photographs Alec chose,
  // the rest the page. 520 is that plus ~60KB of deliberate headroom: enough
  // for two more panels or a page of comments without anyone having to think
  // about it, and still far below the point where a real accident hides.
  "/": { own: 520, total: 900, reqs: 40, hosts: 4, cls: 0.10 },
  // cls:null, still — but for a smaller and better-understood reason than
  // before. The Givebutter cause IS fixed: reserving the panel's height took
  // MOBILE from 0.12-0.76 down to a flat 0 across five runs in every condition
  // tried, and mobile is where the donors and the original complaint are.
  //
  // What is left is desktop-only and bimodal: roughly half of 1440x900 runs
  // score ~0.108, the rest ~0.002, from something landing near 1.7s that moves
  // .give-intro / .gp-note / SECTION.band-sm. Ruled out by measurement, not
  // guesswork: it is not the form height (reserving the exact settled 508px
  // changed nothing), not the reveal animation (it reproduces under
  // reducedMotion), and not only the webfont swap (it reproduces with
  // fonts.googleapis and fonts.gstatic blocked).
  //
  // A ceiling that flaps between 0.002 and 0.108 would teach us to ignore red,
  // so this stays null until that race is named. Tracked, not forgotten.
  // Raised 115 -> 120 on 2026-09-04, and here is the reason in writing, per
  // the ratchet rule above. /ways-to-give was merged into /donate and its
  // page deleted: the advisor block (legal name, status, EIN, determination
  // letter, contact) now lives here because a donor giving through a broker
  // or a will needs those five facts on the page they are already on. That is
  // ~4KB of markup and CSS on this page against one fewer page on the site,
  // so total weight went DOWN and this one number went up. 120 is measured
  // prod own (119KB) plus ~1% for CF script variance, nothing more.
  // Raised 125 -> 131 on 2026-09-08, per the ratchet rule, and here is the
  // arithmetic. /donate gained a closing section: the rolling band Alec asked
  // for as the last thing before the footer, faces passing between the two
  // halves of the ask.
  //
  // The 49KB strip itself is NOT in this number and that is the point. It was
  // marked loading="lazy" and Chrome fetched it anyway on a no-scroll load —
  // its distance-from-viewport threshold is generous and this measurement waits
  // 9s for Givebutter's tail — which put 177KB on the page and failed here,
  // correctly. It is now swapped in by IntersectionObserver, so a visitor who
  // never scrolls to it never pays for it. A visitor who does still downloads
  // 49KB; nothing was made free, it was made conditional.
  //
  // What is left is the section's real weight on every load: 1.7KB of gzipped
  // stylesheet, one request for it, and ~2KB of markup. Measured own went
  // 123 -> 128. 131 is that plus the same ~2% for CF-script variance the rest
  // of this table carries — our own content would have to grow 3KB to trip it.
  //
  // The alternative was raising this cap by 52KB to let decoration ride on the
  // initial load of a page with a payment form. That would have been the wrong
  // answer, and the check is what made it obvious.
  // Raised 131 -> 146 on 2026-09-08. Second raise to this page in a day, so
  // the bar is higher, not lower.
  //
  // What changed: the interior header band went from a texture nobody could see
  // to the vertical column design Alec actually asked for — "the vertical
  // design I think looks great on the other pages". That is content, not
  // decoration: it is the athletes, at readable brightness, on every interior
  // page. The asset tripled because it became visible.
  //
  // Cut before raising, as last time. The band was 1600px at q66 and 58KB; a
  // background at `cover` behind a 60-96% veil, with its back row blurred, does
  // not need that. 1100 at q56 is 28KB and the difference does not survive the
  // veil, the blur or a 2x screen — checked at a 100% crop. Half the weight,
  // no visible change.
  //
  // Measured own after that work: 142KB. 146 is that plus the same ~2% CF
  // allowance the rest of this table carries. The 49KB rolling strip is still
  // outside this number, deferred behind an IntersectionObserver.
  //
  // Running total for the day on this page: 125 -> 146. 100KB of it is what was
  // always here; the other ~40 is one closing section and one visible header
  // band, both asked for by name. If it needs to come back down, the lever is
  // the band asset, not the design.
  // 146 -> 160 on 2026-09-08. The interior band carried a baked blur that read
  // as a bad photograph rather than as depth, and it was undersized on top.
  // Blur removed, resolution raised — then trimmed back hard once it worked:
  // 1900px at q72 (72KB) down to 1500px at q54 (41KB), because the band sits
  // under a veil that is 30-96% black and encoder artifacts are invisible
  // there in a way they are not on the homepage wall. Measured own 155KB.
  // 2026-09-09: 160 -> 200. Measured own is 158KB. This page keeps the tightest
  // real cap on the site and that is deliberate — it carries a payment form and
  // nineteen third-party hosts, and a donor on a bad connection is the one
  // visitor whose experience is worth protecting with a number. 200 leaves room
  // to write, not to be careless.
  "/donate": { own: 200, total: 9000, reqs: 108, hosts: 21, cls: null },
};

for (const [path, cap] of Object.entries(BUDGET)) {
  const b = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  let own = 0, total = 0, reqs = 0;
  const hosts = new Set();
  b.on("response", async (r) => {
    let n = 0;
    try { n = (await r.body()).length; } catch { /* opaque/aborted */ }
    const h = new URL(r.url()).host;
    if (h) hosts.add(h);
    total += n; reqs++;
    if (/adapt-to-life|adapttolife/.test(h)) own += n;
  });
  await b.addInitScript(`window.__cls = 0;
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; })
      .observe({ type: 'layout-shift', buffered: true });`);
  await b.goto(`${BASE}${path}?cb=${Date.now()}`, { waitUntil: "load", timeout: 90000 });
  // Third-party embeds keep loading well past `load` — Givebutter's tail runs to
  // ~14s on a throttled phone. Settle long enough to bill them for it.
  await b.waitForTimeout(9000);
  const cls = await b.evaluate("+window.__cls.toFixed(4)");
  await b.close();

  const ownKB = Math.round(own / 1024), totalKB = Math.round(total / 1024);
  const third = [...hosts].filter((h) => !/adapt-to-life|adapttolife/.test(h));
  if (ownKB > cap.own) fail(`${path} own bytes ${ownKB}KB over budget ${cap.own}KB`);
  if (totalKB > cap.total) fail(`${path} total bytes ${totalKB}KB over budget ${cap.total}KB`);
  if (reqs > cap.reqs) fail(`${path} ${reqs} requests over budget ${cap.reqs}`);
  if (third.length > cap.hosts) fail(`${path} ${third.length} third-party hosts over budget ${cap.hosts}: ${JSON.stringify(third.sort())}`);
  if (cap.cls !== null && cls > cap.cls) fail(`${path} CLS ${cls} over budget ${cap.cls}`);
  console.log(`  budget ${path.padEnd(9)} own ${String(ownKB).padStart(4)}KB · total ${String(totalKB).padStart(5)}KB · ${String(reqs).padStart(3)} req · ${String(third.length).padStart(2)} 3p hosts · CLS ${cls}${cap.cls === null ? " (not asserted — see BUDGET)" : ""}`);
}

await browser.close();
console.log(`\n${PAGES.length} pages · ${targets.size} internal targets · nav ${reference.desk}`);
console.log(failed ? "\nFAILED" : "\nSITE CHECK PASSED");
process.exit(failed ? 1 : 0);
