#!/usr/bin/env node
// Adapt To Life QR generator (Spec 116 P1/P3) — one code, screen and web use.
//
//   node scripts/make-qr.mjs chair sign card popcorn
//   node scripts/make-qr.mjs --style=plain chair        # no frame, tight spaces
//
// For anything going to a PRINTER, use scripts/make-qr-sheet.mjs instead: it
// works in physical units, guards the quiet zone against the cut line, and
// decodes the rasterised PDF rather than a screen-resolution PNG.
//
// Two rules are load-bearing and both were paid for:
//  1. Render SVG with a BROWSER, never ImageMagick. IM's SVG renderer mangles
//     QR modules badly enough that even an unbranded code stops decoding, which
//     sends you hunting a design bug that does not exist.
//  2. Decode every output before it ships. A code that does not scan fails
//     silently and permanently on a sticker nobody can reprint.
//
// The artwork itself lives in scripts/lib/qr-art.mjs — shared with the print
// pipeline so the two can never drift.

import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import jsQR from 'jsqr';
import { renderCode, BASE } from './lib/qr-art.mjs';

// Output dir: repo default, overridable so the generator can run from a
// tooling sandbox that already carries playwright/jsqr/pngjs.
const OUT = process.env.ATL_QR_OUT || path.join(process.cwd(), 'public/qr');

const args  = process.argv.slice(2);
const style = (args.find(a => a.startsWith('--style=')) || '--style=frame').split('=')[1];
const slugs = args.filter(a => !a.startsWith('--'));
if (!slugs.length) { console.error('usage: make-qr.mjs [--style=frame|plain] <slug>...'); process.exit(1); }

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 2200, height: 2600 } });
let failed = 0;

for (const slug of slugs) {
  const url = BASE + slug;
  const art = renderCode(url, { style });
  fs.writeFileSync(path.join(OUT, `brand-${slug}.svg`), art.svg);

  // Render at an INTEGER number of pixels per module. 2048px across a 41-module
  // grid is 49.95px each, and the fractional edge antialiasing was enough to
  // stop one code decoding while three identical ones passed. Snap to the grid.
  const grid = art.modules + 8;                 // modules + quiet zone
  const W = Math.round(2048 / grid) * grid;
  await page.setContent(
    `<html><head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@700&display=swap"></head>`
    + `<body style="margin:0;background:#fff"><div id="w" style="width:${W}px">`
    + art.svg.replace(/ width="[\d.]+" height="[\d.]+"/, ` width="${W}"`) + `</div></body></html>`);
  await page.waitForTimeout(700);                       // let the webfont land
  const pngPath = path.join(OUT, `brand-${slug}.png`);
  await (await page.$('#w')).screenshot({ path: pngPath });

  const img = PNG.sync.read(fs.readFileSync(pngPath));
  const got = jsQR(new Uint8ClampedArray(img.data), img.width, img.height);
  const ok = got && got.data === url;
  if (!ok) failed++;
  console.log(`${slug.padEnd(10)} ${ok ? 'ok  ' : 'DECODE FAILED  '}${url}`);
}

await browser.close();
if (failed) console.error(`\n${failed} code(s) failed to decode — nothing here is printable.`);
process.exit(failed ? 1 : 0);
