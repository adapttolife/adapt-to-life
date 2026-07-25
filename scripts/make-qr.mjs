#!/usr/bin/env node
// Adapt To Life QR generator (Spec 116 P1/P3).
//
//   node scripts/make-qr.mjs chair sign card popcorn
//   node scripts/make-qr.mjs --style=plain chair        # no frame, tight spaces
//
// Two rules are load-bearing and both were paid for:
//  1. Render SVG with a BROWSER, never ImageMagick. IM's SVG renderer mangles
//     QR modules badly enough that even an unbranded code stops decoding, which
//     sends you hunting a design bug that does not exist.
//  2. Decode every output before it ships. A code that does not scan fails
//     silently and permanently on a sticker nobody can reprint.
//
// Design (D1, Alec 2026-07-24): functionality first, premium second, and the
// brand carried by geometry rather than a logo — the logo ships as its own
// sticker. The finder eyes are drawn as WHEELS: near-black rounded rim, orange
// hub. It reads as adaptive sport at a glance and costs no decode margin,
// because the eyes are structural and never carry data.

import QR from 'qrcode';
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import jsQR from 'jsqr';

const INK    = '#0C0C0E';
const ORANGE = '#E8572A';
const CREAM  = '#F7F4EE';
const BASE   = 'https://adapttolife.org/q/';
// Output dir: repo default, overridable so the generator can run from a
// tooling sandbox that already carries playwright/jsqr/pngjs.
const OUT    = process.env.ATL_QR_OUT || path.join(process.cwd(), 'public/qr');

const args  = process.argv.slice(2);
const style = (args.find(a => a.startsWith('--style=')) || '--style=frame').split('=')[1];
const slugs = args.filter(a => !a.startsWith('--'));
if (!slugs.length) { console.error('usage: make-qr.mjs [--style=frame|plain] <slug>...'); process.exit(1); }

const EC = 'H';   // not spent on a logo any more, so it is pure insurance

const isEye = (r, c, n) =>
  (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);

// A wheel: rounded rim in ink, white gap, orange hub.
const eye = (x, y, m) => `
  <rect x="${x}" y="${y}" width="${7*m}" height="${7*m}" rx="${m*2.1}" fill="${INK}"/>
  <rect x="${x+m}" y="${y+m}" width="${5*m}" height="${5*m}" rx="${m*1.5}" fill="#FFFFFF"/>
  <circle cx="${x+3.5*m}" cy="${y+3.5*m}" r="${m*1.55}" fill="${ORANGE}"/>`;

function render(text) {
  const qr = QR.create(text, { errorCorrectionLevel: EC });
  const n = qr.modules.size, d = qr.modules.data;
  const m = 10, quiet = 4 * m;              // ISO minimum quiet zone, never less
  const dim = n * m + quiet * 2;

  let body = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (!d[r*n+c] || isEye(r, c, n)) continue;
    const x = quiet + c*m, y = quiet + r*m;
    body += `<rect x="${x+m*0.06}" y="${y+m*0.06}" width="${m*0.88}" height="${m*0.88}" rx="${m*0.3}" fill="${INK}"/>`;
  }
  const eyes = eye(quiet, quiet, m) + eye(quiet+(n-7)*m, quiet, m) + eye(quiet, quiet+(n-7)*m, m);
  const white = `<rect width="${dim}" height="${dim}" fill="#FFFFFF"/>`;

  if (style === 'plain') {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" width="${dim}" height="${dim}">${white}${body}${eyes}</svg>`;
  }

  // Frame (D2): cream tile + "SCAN TO GIVE". The tile is also what lets a code
  // sit inside a dark layout without ever inverting (principle 4).
  const band = dim * 0.20, H = dim + band, inset = dim * 0.035;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${H}" width="${dim}" height="${H}">`
    + `<rect width="${dim}" height="${H}" rx="${dim*0.045}" fill="${CREAM}"/>`
    + `<rect x="${inset}" y="${inset}" width="${dim-inset*2}" height="${dim-inset*2}" rx="${dim*0.02}" fill="#FFFFFF"/>`
    + body + eyes
    + `<rect x="${dim*0.34}" y="${dim+band*0.10}" width="${dim*0.32}" height="${dim*0.007}" rx="${dim*0.004}" fill="${ORANGE}"/>`
    + `<text x="${dim/2}" y="${dim+band*0.68}" text-anchor="middle" font-family="'Space Mono',ui-monospace,monospace"`
    + ` font-weight="700" font-size="${band*0.34}" letter-spacing="${band*0.08}" fill="${INK}">SCAN TO GIVE</text>`
    + `</svg>`;
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 2200, height: 2600 } });
let failed = 0;

for (const slug of slugs) {
  const url = BASE + slug;
  const svg = render(url);
  fs.writeFileSync(path.join(OUT, `brand-${slug}.svg`), svg);

  // Render at an INTEGER number of pixels per module. 2048px across a 41-module
  // grid is 49.95px each, and the fractional edge antialiasing was enough to
  // stop one code decoding while three identical ones passed. Snap to the grid.
  const qr = QR.create(url, { errorCorrectionLevel: EC });
  const grid = qr.modules.size + 8;                 // modules + quiet zone
  const W = Math.round(2048 / grid) * grid;
  await page.setContent(
    `<html><head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@700&display=swap"></head>`
    + `<body style="margin:0;background:#fff"><div id="w" style="width:${W}px">`
    + svg.replace(/ width="[\d.]+" height="[\d.]+"/, ` width="${W}"`) + `</div></body></html>`);
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
