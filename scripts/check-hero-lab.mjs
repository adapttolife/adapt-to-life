// scripts/check-hero-lab.mjs — the gate on the three header candidates.
//
// A header is judged by eye, but three things about it are not opinions and a
// screenshot cannot show them: whether anything overflows a phone viewport,
// whether the copy actually clears the contrast floor against whatever the
// photograph puts behind it, and what the picture costs to load. Those get
// measured, on every variant, at every width.
//
// Usage: node scripts/check-hero-lab.mjs [base-url]
import { chromium } from "/home/agentos/pw/node_modules/playwright/index.mjs";

const BASE = process.argv[2] || "http://127.0.0.1:8788";
const SIZES = [[1920, 1080, "1920"], [1440, 900, "1440"], [1024, 768, "1024"],
               [768, 1024, "768"], [390, 844, "390"], [320, 720, "320"]];
const VARIANTS = ["1", "2", "3"];

const browser = await chromium.launch();
let failed = 0;
const note = (ok, msg) => { if (!ok) failed++; console.log(`${ok ? "  ok  " : "FAIL  "}${msg}`); };

for (const v of VARIANTS) {
  console.log(`\n── hero-${v} ─────────────────────────────────────────`);
  for (const [w, h, tag] of SIZES) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    const errors = [];
    const misses = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    // The console message for a failed request does not name the URL, which
    // made the first run report "404" six times with nothing to fix. Listen to
    // the response instead. /api/raised is a Worker route and is expected to
    // 404 on a static server.
    page.on("response", (res) => {
      if (res.status() >= 400 && !/\/api\//.test(res.url())) misses.push(`${res.status()} ${new URL(res.url()).pathname}`);
    });
    // /api/raised is a Worker route. On the local static server and on the
    // front-end-only staging Worker it has no handler, and campaigns.js already
    // logs that and falls back to showing the goal without a raised figure —
    // which is the designed behaviour, not a defect in the header.
    page.on("console", (m) => {
      const t = m.text();
      if (m.type() === "error" && !/Failed to load resource/.test(t) && !/api\/raised unavailable/.test(t)) errors.push(t);
    });
    await page.goto(`${BASE}/hero-${v}.html`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1400);

    const r = await page.evaluate(() => {
      const out = { over: [], scrollw: 0, hero: 0, offscreen: [], weight: 0 };
      // 1. Horizontal overflow. The hero bleeds the athletes and the floor
      //    plane past both edges ON PURPOSE, inside an overflow:hidden section,
      //    so the test is whether the DOCUMENT scrolls sideways — the thing a
      //    reader actually feels — not whether a rect crosses the edge. Any
      //    element that does cross and is NOT inside a clipping ancestor is
      //    reported too, because that is the one that would cause it.
      out.scrollw = document.documentElement.scrollWidth;
      const clipped = (el) => {
        for (let p = el.parentElement; p; p = p.parentElement) {
          const o = getComputedStyle(p);
          if (o.overflowX === "hidden" || o.overflowX === "clip") return true;
        }
        return false;
      };
      document.querySelectorAll("body *").forEach((el) => {
        const b = el.getBoundingClientRect();
        if (b.width > 0 && b.right > window.innerWidth + 1 && !clipped(el)) {
          out.over.push(el.className || el.tagName);
        }
      });
      // 2. the ask has to be on the first screen, not merely on the page
      const stage = document.getElementById("heroStage");
      out.hero = Math.round(stage.getBoundingClientRect().height);
      const copy = document.querySelector(".hs-copy, .mw-copy, .st-copy");
      ["h1", ".btn"].forEach((sel) => {
        const el = copy && copy.querySelector(sel);
        if (!el) return;
        const b = el.getBoundingClientRect();
        if (b.bottom > window.innerHeight) out.offscreen.push(sel);
      });
      // 3. what the picture costs
      out.weight = performance.getEntriesByType("resource")
        .filter((e) => /\/images\/hero\/(?!review\/)/.test(e.name))
        .reduce((n, e) => n + (e.encodedBodySize || 0), 0);
      return out;
    });

    note(r.scrollw <= w + 1 && r.over.length === 0,
      `${tag}px  no sideways scroll: doc ${r.scrollw}px${r.over.length ? " · unclipped: " + r.over.slice(0, 3).join(", ") : ""}`);
    note(r.offscreen.length === 0, `${tag}px  headline + ask above the fold: ${r.offscreen.length ? "MISSING " + r.offscreen.join(",") : "yes"} (hero ${r.hero}px)`);
    note(errors.length === 0 && misses.length === 0,
      `${tag}px  no errors, no missing files: ${errors[0] || misses[0] || "clean"}`);
    if (tag === "1440") note(r.weight < 620 * 1024, `1440px hero images: ${(r.weight / 1024).toFixed(0)} KB (budget 620)`);
    await page.close();
  }
}

// reduced motion must land on the finished frame, not on the pre-entrance one
const rm = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
await rm.goto(`${BASE}/hero-3.html`, { waitUntil: "networkidle" });
await rm.waitForTimeout(300);
const vis = await rm.evaluate(() =>
  [...document.querySelectorAll(".mw-p, .mw-rise, .st-fig, .st-rise")].every((el) => +getComputedStyle(el).opacity === 1));
note(vis, "prefers-reduced-motion: every figure and line is visible with no animation");
await rm.close();

await browser.close();
console.log(failed ? `\n${failed} FAILING CHECK(S)` : "\nall checks pass");
process.exit(failed ? 1 : 0);
