#!/usr/bin/env node
// scripts/check-page-tier.mjs — is every header the height it was assigned?
//
//   node scripts/check-page-tier.mjs
//
// Alec, 2026-09-08: "there should be a clear number, a clear rule on the height
// that we want each of those sections to be. We should not have to guess."
//
// The rule is PAGE_TIERS in scripts/lib/page-header.mjs plus --pg-h-* in
// page-header.css. This is the thing that keeps the rule true, and it checks
// two properties that fail in opposite directions:
//
//   1. IS IT FULL? The band fills its header, so black above it should be 0.
//      Black is what Alec was actually reacting to every time he said a
//      section was too tall — /about was the SHORTEST page on the site and
//      also the only one at 0% black, and he liked it.
//   2. DID THE COPY BURST THE TIER? Height is min-height, so a long headline
//      still grows its header rather than being clipped. That is the right
//      failure mode for a reader and the wrong one for a design system, so it
//      is reported here. A page over its tier ceiling means the words need to
//      come down, not the number to go up — which is exactly what happened to
//      /sponsorship's headline: seven words at 96px was five lines and 470px
//      of headline, and it WAS that page's 1072px header.
import { chromium } from "/home/agentos/pw/node_modules/playwright/index.mjs";
import { PAGE_TIERS } from "./lib/page-header.mjs";

const BASE = process.env.SITE_URL || "https://adapt-to-life-staging.adapt-to-life.workers.dev";
// The ceilings from --pg-h-*, as resolved at each viewport. Kept here in px so
// this file fails loudly if somebody changes the CSS and not the rule.
const CEIL = { lg: 720, md: 600, sm: 480, give: 900 };
const MAX_BLACK = 4; // percent; the band fills, so anything above this is a bug

const browser = await chromium.launch();
let bad = 0;

for (const [w, h, label] of [[1440, 900, "desktop"], [390, 844, "phone"]]) {
  console.log(`\n@${label}  ${w}x${h}`);
  for (const [file, tier] of Object.entries(PAGE_TIERS)) {
    const path = "/" + file.replace(/\.html$/, "");
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    const res = await page.goto(`${BASE}${path}?cb=${Date.now()}`, { waitUntil: "load" });
    if (!res || res.status() >= 400) { await page.close(); continue; }
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(900);
    const g = await page.evaluate(() => {
      const hero = document.querySelector(".hero.pg-band");
      if (!hero) return null;
      return { hero: hero.getBoundingClientRect().height,
               band: parseFloat(getComputedStyle(hero, "::before").height) || 0 };
    });
    await page.close();
    if (!g) { console.log(`  ${path.padEnd(26)} ${tier.padEnd(4)} — not banded`); continue; }
    const black = Math.max(0, Math.round(((g.hero - g.band) / g.hero) * 100));
    // The ceiling is a desktop number; on a phone the clamp resolves lower, so
    // only the black check is meaningful there.
    const over = label === "desktop" && g.hero > CEIL[tier] + 1;
    const dark = black > MAX_BLACK;
    if (over || dark) bad++;
    console.log(`  ${path.padEnd(26)} ${tier.padEnd(4)} ` +
      `${String(Math.round(g.hero)).padStart(4)}px  ${String(Math.round(g.hero / h * 100)).padStart(3)}vh  ` +
      `black ${String(black).padStart(2)}%` +
      (over ? `  OVER TIER (ceiling ${CEIL[tier]}px — shorten the copy)` : "") +
      (dark ? "  NOT FILLED" : ""));
  }
}
await browser.close();
console.log(bad ? `\n${bad} header(s) off-spec.` : "\nevery header matches its tier and is filled.");
process.exit(bad ? 1 : 0);
