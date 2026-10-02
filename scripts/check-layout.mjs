#!/usr/bin/env node
// scripts/check-layout.mjs: load pages the way visitors do and fail on what a
// visitor would see broken. Two engines: Chrome's, and Safari's (every iPhone
// browser, Brave and Chrome included, runs on Safari's engine). Two sizes: an
// iPhone profile and a 1280px desktop.
//
//   node scripts/check-layout.mjs https://staging-adapt-to-life.adapt-to-life.workers.dev
//   node scripts/check-layout.mjs https://adapttolife.org --all          # every page in the sitemap
//   node scripts/check-layout.mjs <base> --pages /,/events --shots /tmp/shots
//   node scripts/check-layout.mjs http://localhost:8791 --local          # a static server: /x -> /x.html
//
// A page fails on: sideways scroll; an image that failed to load; a script
// error or a failed request from our own site (third-party noise below is
// ignored); JSON-LD that does not parse; and, for event cards, a photo with no
// height, a date tile outside its card, a button under 44px, an icon drawn
// huge, or content spilling out of the card.
//
// Safari's engine here is Playwright's WebKit with an iPhone profile. It is
// close to an iPhone, not identical: on 2026-10-02 an iPhone showed a
// collapsed event photo that WebKit 17.4, 18.4 and 26.0 all drew correctly.
// For layout-critical changes a real phone is still the last word.
//
// Exit code 1 if any page fails. scripts/release.mjs runs this against
// staging before a release and against production after it.
import { chromium, webkit, devices } from "playwright";
import { existsSync, readdirSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CORE = ["/", "/events", "/sponsorship", "/brickhouse", "/juan", "/ambassadors", "/volunteer",
  "/send-6", "/donate", "/about", "/adaptive-sports-near-me", "/contact", "/hustle-and-heart", "/popcorn"];

// Third-party noise that is not ours to fix: Cloudflare Turnstile's own frame
// logs and 401s, and Givebutter's analytics ping.
const NOISE = [/challenges\.cloudflare\.com/, /%c%d/, /Turnstile/i, /givebutter/i];
const noise = (s) => NOISE.some((re) => re.test(s));

// The repo pins a Playwright whose default Chromium may not be downloaded on a
// given machine; fall back to the newest Chromium in the Playwright cache.
function chromiumPath() {
  try { if (existsSync(chromium.executablePath())) return undefined; } catch {}
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) return process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  const cache = join(homedir(), ".cache/ms-playwright");
  const dirs = existsSync(cache) ? readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)).sort((a, b) => +b.split("-")[1] - +a.split("-")[1]) : [];
  for (const d of dirs) for (const sub of ["chrome-linux64/chrome", "chrome-linux/chrome"]) {
    const p = join(cache, d, sub);
    if (existsSync(p)) return p;
  }
  return undefined;
}

const PROFILES = [
  { name: "Chrome phone", engine: "chromium", ctx: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } },
  { name: "Chrome desktop", engine: "chromium", ctx: { viewport: { width: 1280, height: 900 } } },
  { name: "Safari iPhone", engine: "webkit", ctx: { ...devices["iPhone 15"] } },
  { name: "Safari desktop", engine: "webkit", ctx: { viewport: { width: 1280, height: 900 } } },
];

function parseArgs(argv) {
  const a = { base: null, pages: null, all: false, local: false, shots: null, only: null };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (x === "--all") a.all = true;
    else if (x === "--local") a.local = true;
    else if (x === "--pages") a.pages = argv[++i].split(",").map((s) => s.trim()).filter(Boolean);
    else if (x === "--shots") a.shots = argv[++i];
    else if (x === "--engines") a.only = argv[++i].split(",");
    else if (!a.base) a.base = x.replace(/\/+$/, "");
  }
  return a;
}

async function sitemapPaths(base) {
  const res = await fetch(base + "/sitemap.xml");
  if (!res.ok) throw new Error(`sitemap ${res.status}`);
  return [...(await res.text()).matchAll(/<loc>https?:\/\/[^/<]+(\/[^<]*)<\/loc>/g)].map((m) => m[1] || "/");
}

const urlFor = (base, path, local) => base + (local ? (path === "/" ? "/index.html" : path + ".html") : path);

async function checkPage(context, base, path, opts) {
  const page = await context.newPage();
  const problems = [];
  const origin = new URL(base).origin;
  page.on("pageerror", (e) => { if (!noise(e.message)) problems.push(`script error: ${e.message.slice(0, 140)}`); });
  page.on("response", (r) => {
    const u = r.url();
    if (r.status() >= 400 && u.startsWith(origin) && !noise(u) && !(opts.local && u.includes("/api/"))) problems.push(`${r.status()} ${u.replace(origin, "")}`);
  });
  try {
    const res = await page.goto(urlFor(base, path, opts.local), { waitUntil: "load", timeout: 45000 });
    if (!res || res.status() >= 400) problems.push(`page status ${res ? res.status() : "none"}`);
    await page.waitForTimeout(1200);
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += Math.round(innerHeight * 0.8)) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 90)); }
      scrollTo(0, 0);
    });
    await page.waitForTimeout(900);
    const found = await page.evaluate(() => {
      const out = [];
      const de = document.documentElement;
      if (de.scrollWidth > de.clientWidth + 1) out.push(`sideways scroll: page is ${de.scrollWidth}px wide in a ${de.clientWidth}px window`);
      for (const img of document.images) {
        const src = img.getAttribute("src");
        if (src && img.complete && img.naturalWidth === 0) out.push(`broken image: ${src}`);
      }
      for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
        try { JSON.parse(s.textContent); } catch (e) { out.push("JSON-LD does not parse"); }
      }
      document.querySelectorAll(".evc").forEach((card, i) => {
        const c = card.getBoundingClientRect(), name = (card.querySelector(".evc-name") || {}).textContent || `card ${i + 1}`;
        const media = card.querySelector(".evc-media");
        if (media && media.getBoundingClientRect().height < 40) out.push(`${name}: photo has no height`);
        const d = card.querySelector(".evc-date");
        if (d) { const r = d.getBoundingClientRect(); if (r.top < c.top - 1 || r.left < c.left - 1 || r.right > c.right + 1) out.push(`${name}: date tile outside its card`); }
        card.querySelectorAll(".evc-btn").forEach((b) => { if (b.getBoundingClientRect().height < 43.5) out.push(`${name}: button under 44px ("${b.textContent.trim()}")`); });
        card.querySelectorAll("svg").forEach((s) => { if (s.getBoundingClientRect().width > 48) out.push(`${name}: icon drawn ${Math.round(s.getBoundingClientRect().width)}px wide`); });
        for (const el of card.querySelectorAll("*")) {
          const r = el.getBoundingClientRect();
          if (r.width && (r.right > c.right + 1 || r.left < c.left - 1)) { out.push(`${name}: content spills out of the card`); break; }
        }
      });
      return out;
    });
    problems.push(...found);
    if (opts.shots) {
      const slug = (path === "/" ? "home" : path.replace(/^\//, "").replace(/\//g, "-"));
      await page.screenshot({ path: join(opts.shots, `${opts.profile.replace(/\s+/g, "-").toLowerCase()}-${slug}.jpg`), fullPage: true, type: "jpeg", quality: 60 });
    }
  } catch (e) {
    problems.push(`could not load: ${e.message.split("\n")[0].slice(0, 140)}`);
  } finally {
    await page.close();
  }
  return problems;
}

async function pool(items, size, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i]); }
  }));
  return out;
}

export async function checkLayout(base, { pages = null, all = false, local = false, shots = null, engines = null, log = console.log } = {}) {
  const paths = pages || (all ? await sitemapPaths(base) : CORE);
  if (shots) mkdirSync(shots, { recursive: true });
  const failures = [];
  const t0 = Date.now();
  for (const p of PROFILES.filter((x) => !engines || engines.includes(x.engine))) {
    const browser = p.engine === "webkit" ? await webkit.launch() : await chromium.launch({ executablePath: chromiumPath() });
    const context = await browser.newContext(p.ctx);
    const results = await pool(paths, 3, (path) => checkPage(context, base, path, { local, shots, profile: p.name }));
    await browser.close();
    const bad = results.map((r, i) => [paths[i], r]).filter(([, r]) => r.length);
    log(`${p.name.padEnd(15)} ${paths.length - bad.length}/${paths.length} pages clean`);
    for (const [path, r] of bad) for (const x of [...new Set(r)]) { log(`  ${path}  ${x}`); failures.push({ profile: p.name, path, problem: x }); }
  }
  log(`${failures.length ? "FAIL" : "PASS"}: ${paths.length} pages x ${PROFILES.filter((x) => !engines || engines.includes(x.engine)).length} profiles in ${Math.round((Date.now() - t0) / 1000)}s`);
  return failures;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = parseArgs(process.argv.slice(2));
  if (!a.base) { console.error("usage: node scripts/check-layout.mjs <base-url> [--all] [--pages /,/events] [--local] [--shots dir] [--engines chromium,webkit]"); process.exit(2); }
  const failures = await checkLayout(a.base, { pages: a.pages, all: a.all, local: a.local, shots: a.shots, engines: a.only });
  process.exit(failures.length ? 1 : 0);
}
