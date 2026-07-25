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
  const m = await browser.newPage({ viewport: { width: 390, height: 800 } });
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
  const d = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
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

await browser.close();
console.log(`\n${PAGES.length} pages · ${targets.size} internal targets · nav ${reference.desk}`);
console.log(failed ? "\nFAILED" : "\nSITE CHECK PASSED");
process.exit(failed ? 1 : 0);
