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

const BASE = process.argv[2] || "https://adapt-to-life-staging.alec-af3.workers.dev";
const IS_STAGING = BASE.includes("staging");
const PAGES = [
  "/", "/about", "/adaptive-sports-near-me", "/apply", "/contact", "/donate",
  "/hustle-and-heart", "/karen", "/popcorn", "/roadmap", "/send-6", "/sponsorship",
  "/subscribe", "/tim", "/waiver", "/ways-to-give",
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

  // Every stop must be a real page, and the tour stays off production.
  for (const href of [...tour.matchAll(/class="rv-steps"[\s\S]*?<\/ol>/g)][0]?.[0]
    .matchAll(/href="(\/[^"]*)"/g) ?? []) {
    const r = await fetch(`${BASE}${href[1]}?cb=${Date.now()}`);
    if (!r.ok) fail(`review.html links to ${href[1]}, which returned ${r.status}`);
  }
  const rv = await fetch(`${BASE}/review?cb=${Date.now()}`, { redirect: "manual" });
  if (IS_STAGING && rv.status !== 200) fail(`/review returned ${rv.status} on staging, expected 200`);
  if (!IS_STAGING && rv.status !== 302) fail(`/review returned ${rv.status} on production, expected a 302 home`);
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
for (const path of ["/donate", "/hustle-and-heart"]) {
  const g = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
  try {
    await g.goto(`${BASE}${path}?cb=${Date.now()}`, { waitUntil: "domcontentloaded" });
    const form = g.locator("givebutter-giving-form");
    await form.waitFor({ state: "attached", timeout: 20000 });

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
  } catch (e) {
    fail(`${path} giving form did not become usable: ${String(e).split("\n")[0].slice(0, 120)}`);
  }
  await g.close();
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
// Measured, not guessed — four clean prod runs each: / at exactly 5 third-party
// hosts / 31 requests, /donate at 20 / 114, with zero variance in host count.
// / gets no host headroom: every host there is a choice we made (fonts,
// Turnstile, CF analytics), so a new one is a decision worth a red build.
// /donate gets one slot, because Givebutter's own dependency set shifts
// (q.stripe.com appears conditionally) and we do not control it. One slot still
// catches an added embed: embeds arrive with a fleet of hosts, not one.
const BUDGET = {
  "/": { own: 180, total: 1500, reqs: 33, hosts: 5, cls: 0.10 },
  // cls:null = deliberately NOT asserted yet, which is a finding, not an
  // oversight. /donate measured 0.12, 0.15, 0.34 and 0.76 across runs because
  // the Givebutter panel reserves no height and shoves the page when it mounts
  // ~1.9s in. Any ceiling wide enough not to flap is wide enough to be
  // meaningless, and a check that cries wolf gets ignored — which is how the
  // 9 MB got here. Reserve the panel's height, then set this to 0.10 like every
  // other page. The null is the debt marker; delete it with the fix.
  "/donate": { own: 110, total: 9800, reqs: 118, hosts: 21, cls: null },
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
