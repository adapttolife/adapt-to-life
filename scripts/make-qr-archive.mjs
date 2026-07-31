#!/usr/bin/env node
// Spec 116 — the artwork archive. Alec, 2026-07-31: "put the QR codes in a
// folder so if your software breaks we still have it."
//
//   node scripts/make-qr-archive.mjs                    # build the bundle
//   node scripts/make-qr-archive.mjs --slugs=chair,sign # a subset
//
// The point is independence. Everything in the bundle is a plain file that
// opens in Canva, Illustrator, Preview, Word or a browser with nothing of ours
// running. If this repo, this box and every script in it disappeared tomorrow,
// the artwork survives and stays printable.
//
// What it does NOT do is let the archive become the source of truth. The
// destinations still live in D1 and are still editable at /admin/qr — that is
// the whole platform. These files encode adapttolife.org/q/<slug>, and that URL
// never changes, which is exactly why a stale copy of the artwork is harmless.
//
// Every file is decode-verified before it is written. An archive of artwork
// that does not scan is worse than no archive, because it looks like insurance.

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import jsQR from 'jsqr';
import { renderCode, BASE } from './lib/qr-art.mjs';

const args = process.argv.slice(2);
const flag = (n, d) => { const h = args.find(a => a.startsWith(`--${n}=`)); return h ? h.split('=').slice(1).join('=') : d; };
const SLUGS = flag('slugs', 'chair,sign,card,popcorn').split(',').map(s => s.trim()).filter(Boolean);
const STAMP = flag('stamp', new Date().toISOString().slice(0, 10));
const OUT = flag('out', path.join(process.env.ATL_QR_OUT || path.join(process.cwd(), 'public/qr'), `archive-${STAMP}`));

// One PNG size, chosen so it is big enough for anything: 2048px across a code
// that is at most a couple of inches on paper is far past what any printer
// resolves. Vector is the real deliverable; the PNG exists because not every
// tool takes SVG.
const PNG_TARGET = 2048;

const VARIANTS = [
  { style: 'frame', ink: 'mono',  label: 'frame-bw',    note: 'The default. Cream-free, one ink, SCAN TO GIVE caption.' },
  { style: 'plain', ink: 'mono',  label: 'plain-bw',    note: 'Code only, no caption or tile. For tight spaces.' },
  { style: 'frame', ink: 'brand', label: 'frame-brand', note: 'Cream tile and orange hub. Full-colour printing only.' },
];

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 2400, height: 2800 } });
const made = [];
let failed = 0;

for (const slug of SLUGS) {
  const url = BASE + slug;
  for (const v of VARIANTS) {
    const art = renderCode(url, { style: v.style, ink: v.ink });
    const stem = `${slug}-${v.label}`;

    fs.writeFileSync(path.join(OUT, `${stem}.svg`), art.svg);

    // Integer pixels per module, the rule that cost an hour to learn.
    const grid = art.modules + 8;
    const W = Math.round(PNG_TARGET / grid) * grid;
    await page.setContent(
      `<html><head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@700&display=swap"></head>`
      + `<body style="margin:0;background:#fff"><div id="w" style="width:${W}px">`
      + art.svg.replace(/ width="[\d.]+" height="[\d.]+"/, ` width="${W}"`) + `</div></body></html>`);
    await page.waitForTimeout(700);
    const pngPath = path.join(OUT, `${stem}.png`);
    await (await page.$('#w')).screenshot({ path: pngPath });

    const img = PNG.sync.read(fs.readFileSync(pngPath));
    const got = jsQR(new Uint8ClampedArray(img.data), img.width, img.height);
    const ok = got && got.data === url;
    if (!ok) { failed++; console.error(`  DECODE FAILED  ${stem}`); }
    made.push({ slug, ...v, stem, ok });
  }
}
await browser.close();

if (failed) {
  console.error(`\n  ${failed} file(s) failed to decode. Archive NOT written — insurance that does not scan is worse than none.\n`);
  fs.rmSync(OUT, { recursive: true, force: true });
  process.exit(1);
}

// A README that assumes the reader has none of our tooling and possibly none
// of our context.
fs.writeFileSync(path.join(OUT, 'README.txt'), `ADAPT TO LIFE — QR CODE ARTWORK
Generated ${STAMP}

WHAT THESE ARE
Each file is a QR code that sends whoever scans it to adapttolife.org, which
then forwards them wherever we currently want them to go.

THE IMPORTANT PART: the destination is NOT baked into these images. A code
printed today can be pointed somewhere else at any time, without reprinting
anything, at adapttolife.org/admin/qr. That is the entire reason we built our
own instead of renting one.

So these files never expire and never need regenerating because a link changed.

WHICH FILE TO USE
  *.svg   Use this whenever the tool accepts it (Canva, Illustrator, most
          printers). It is vector: sharp at any size, from a sticker to a
          banner. This is the real artwork.
  *.png   Use only when SVG is refused. Fixed resolution — fine up to roughly
          a hand's width, not for a banner.

  *-frame-bw     The default. Black and white, with the SCAN TO GIVE caption.
  *-plain-bw     Code only, no caption. For tight spaces.
  *-frame-brand  Cream and orange version. Full-colour printing only.

THE CODES
${made.filter(m => m.style === 'frame' && m.ink === 'mono').map(m => `  ${m.slug.padEnd(9)} ${BASE}${m.slug}`).join('\n')}

RULES THAT MATTER WHEN PRINTING
1. Never print smaller than 30mm (1.2in) wide for the framed version. Below
   that it stops scanning reliably, and a sticker that does not scan fails
   silently forever — nobody reports it, they just walk away.
2. Never recolour it. Dark code on a light background, always. Inverted codes
   read on newer phones and fail on older ones, and you cannot choose which
   phone a donor is holding.
3. Never stretch it. Keep it square; scale both directions together.
4. Leave clear space around it — at least the width of one of the big corner
   squares. Do not crop in tight, and do not lay text over it.
5. Before ordering a large run, print one at 100% scale (NOT "fit to page")
   and scan it with a few different phones, including an old one.

IF YOU NEED A SIZE OR A CODE THAT IS NOT HERE
In the adapt-to-life repo:  node scripts/make-qr-sheet.mjs <slug> --size=45mm
Full guidance:              docs/qr-print.md
`);

const manifest = made.map(m => `${m.stem}.svg / .png   ${m.slug}   ${m.note}`).join('\n');
fs.writeFileSync(path.join(OUT, 'MANIFEST.txt'), `${manifest}\n`);

console.log(`\n  ${made.length} files, all decode-verified`);
console.log(`  → ${OUT}\n`);
console.log(`  Codes: ${SLUGS.join(', ')}`);
console.log(`  Variants: ${VARIANTS.map(v => v.label).join(', ')} (svg + png each)\n`);
