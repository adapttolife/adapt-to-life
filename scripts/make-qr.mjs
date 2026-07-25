#!/usr/bin/env node
// Regenerate branded QR print assets. Run after adding a code to src/qr.js.
//
//   node scripts/make-qr.mjs chair sign card popcorn
//
// Two hard-won rules live here:
//  1. Render SVG with a BROWSER, never ImageMagick. IM's SVG renderer mangles
//     QR modules badly enough that even an unbranded code stops decoding.
//  2. Decode every output before shipping it. A pretty code that does not scan
//     is worse than no code, because it fails silently on a printed sticker.
import QR from 'qrcode';
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import jsQR from 'jsqr';

const INK = '#0C0C0E';
const OUT = path.join(process.cwd(), 'public/qr');
const slugs = process.argv.slice(2);
if (!slugs.length) { console.error('usage: make-qr.mjs <slug>...'); process.exit(1); }

// Pull the house logo out of a shipped page so the mark can never drift.
const page = fs.readFileSync(path.join(process.cwd(), 'public/index.html'), 'utf8');
const m = page.match(/<svg[^>]*class="brand-logo"[^>]*>([\s\S]*?)<\/svg>/);
const logoInner = m[1];
const logoVB = m[0].match(/viewBox="([^"]+)"/)[1];

const browser = await chromium.launch();
const p = await browser.newPage({ viewport: { width: 2100, height: 2100 } });
let failed = 0;

for (const slug of slugs) {
  const url = `https://adapttolife.org/q/${slug}`;
  // Level H tolerates ~30% loss, which is what buys us the centre knockout.
  let svg = await QR.toString(url, { type:'svg', errorCorrectionLevel:'H', margin:2,
                                     color:{ dark:INK, light:'#FFFFFF' } });
  const size = Number(svg.match(/viewBox="([^"]+)"/)[1].split(' ')[2]);
  const box = size * 0.26, pad = box * 0.14, x = (size - box) / 2;
  svg = svg.replace('</svg>',
    `<rect x="${x}" y="${x}" width="${box}" height="${box}" rx="${box*0.16}" fill="#FFFFFF"/>` +
    `<svg x="${x+pad}" y="${x+pad}" width="${box-pad*2}" height="${box-pad*2}" viewBox="${logoVB}">${logoInner}</svg></svg>`);

  fs.writeFileSync(path.join(OUT, `brand-${slug}.svg`), svg);

  await p.setContent(`<body style="margin:0;background:#fff"><div style="width:2048px;height:2048px">${
    svg.replace('<svg','<svg width="2048" height="2048"')}</div></body>`);
  await p.waitForTimeout(220);
  const pngPath = path.join(OUT, `brand-${slug}.png`);
  await p.screenshot({ path: pngPath, clip:{ x:0, y:0, width:2048, height:2048 } });

  const img = PNG.sync.read(fs.readFileSync(pngPath));
  const decoded = jsQR(new Uint8ClampedArray(img.data), img.width, img.height);
  const ok = decoded && decoded.data === url;
  if (!ok) failed++;
  console.log(`${slug.padEnd(10)} ${ok ? 'ok' : 'DECODE FAILED'}  ${url}`);
}

await browser.close();
process.exit(failed ? 1 : 0);
