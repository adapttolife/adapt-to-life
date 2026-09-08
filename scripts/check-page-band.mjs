#!/usr/bin/env node
// scripts/check-page-band.mjs — how much of each interior header is black?
//
//   node scripts/check-page-band.mjs
//   SITE_URL=https://... node scripts/check-page-band.mjs
//
// Alec, 2026-09-08, on /sponsorship: "This has way too much black space...
// maybe we can make the vertical frames go higher up, or we can take this
// section height and make it a little bit tighter and shorter... I don't know
// what specifically I don't like about it. I just know I don't like as much
// black space. I like what we have for the volunteer page."
//
// He could not name it, and he did not need to: the pages are measurably
// different. Every banded hero draws the SAME strip, but the strip's height
// came from its aspect ratio (a fixed 624px at 1440) while the hero's height
// came from its copy. So the longer the headline, the more black — 6% on
// /about, 27% on /volunteer, 47% on /sponsorship. The page he objected to has
// the longest headline on the site, and the page he liked sits in the middle.
//
// That is a ratio, so it gets a meter rather than an opinion. This prints the
// black-above-band share for every banded page at phone and desktop and fails
// if any page drifts past CEILING. A design intent nobody can measure comes
// back the next time someone writes a long headline.
import { chromium } from "/home/agentos/pw/node_modules/playwright/index.mjs";

const BASE = process.env.SITE_URL || "https://adapt-to-life-staging.alec-af3.workers.dev";
const CEILING = 30;   // percent of the hero that may be black above the band
const PAGES = ["/about", "/promise", "/volunteer", "/sponsorship", "/apply",
               "/contact", "/waiver", "/subscribe", "/roadmap",
               "/adaptive-sports-near-me"];

const browser = await chromium.launch();
let worst = 0, bad = 0;

for (const [w, h, label] of [[390, 844, "phone"], [1440, 900, "desktop"]]) {
  console.log(`\n@${label}  ${w}x${h}`);
  for (const path of PAGES) {
    const p = await browser.newPage({ viewport: { width: w, height: h } });
    await p.goto(`${BASE}${path}?cb=${Date.now()}`, { waitUntil: "load" });
    await p.evaluate(() => document.fonts.ready);
    await p.waitForTimeout(900);
    const g = await p.evaluate(() => {
      const hero = document.querySelector(".hero.pg-band");
      if (!hero) return null;
      // The band is a ::before, so its height has to come from the computed
      // style rather than a box measurement — there is no element to grab.
      const band = parseFloat(getComputedStyle(hero, "::before").height) || 0;
      return { hero: hero.getBoundingClientRect().height, band };
    });
    await p.close();
    if (!g) { console.log(`  ${path.padEnd(26)} — not a banded page`); continue; }
    // A band taller than its hero is fine and reads as full bleed: the hero
    // clips it. Black is only what the band does NOT reach.
    const black = Math.max(0, Math.round(((g.hero - g.band) / g.hero) * 100));
    worst = Math.max(worst, black);
    const over = black > CEILING;
    if (over) bad++;
    console.log(`  ${path.padEnd(26)} hero ${String(Math.round(g.hero)).padStart(4)}  ` +
      `band ${String(Math.round(g.band)).padStart(4)}  black ${String(black).padStart(3)}%  ` +
      "█".repeat(Math.round(black / 4)).padEnd(9) + (over ? " OVER" : ""));
  }
}
await browser.close();
console.log(bad
  ? `\n${bad} header(s) over the ${CEILING}% black ceiling — worst ${worst}%.`
  : `\nevery banded header is under the ${CEILING}% black ceiling (worst ${worst}%).`);
process.exit(bad ? 1 : 0);
