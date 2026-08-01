#!/usr/bin/env node
// Spec 116 — front-of-shirt artwork. Alec, 2026-08-01: just the code, no words,
// logo in the middle, minimal. The captioned "SCAN TO GIVE" version stays as
// the STICKER treatment; this is deliberately not that.
//
//   node scripts/make-shirt-artwork.mjs <out-dir> <logo.svg> [--size=254mm]
//
// Produces SVG (the real artwork), a PNG proof, and a press-ready PDF at exact
// physical size — and refuses to write any of it unless the code decodes.

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import jsQR from 'jsqr';
import { renderCode, BASE } from './lib/qr-art.mjs';

const [OUT, LOGO] = process.argv.slice(2);
const SIZE_MM = parseFloat((process.argv.find((a) => a.startsWith('--size=')) || '--size=254').replace(/[^\d.]/g, '')) || 254;
if (!OUT || !LOGO) { console.error('usage: make-shirt-artwork.mjs <out-dir> <logo.svg> [--size=254mm]'); process.exit(1); }

// 11 modules across, ~11% of the symbol's area.
//
// Measured 2026-08-01 against the shirt code: 11 and 13 decode cleanly and
// survive a 0-20% ink-spread sweep; 15 loses too much data. 7 and 9 ALSO
// failed, reproducibly — the opposite of what a smaller obstruction should do,
// and unexplained. jsQR has produced other false negatives on this project. It
// does not change the answer: 11 is more visible than 7 and sits comfortably
// inside the conventional safe budget for error correction H, so chasing it
// would have bought nothing.
//
// The physical scan test remains the authority. A centre logo spends error
// correction that a shirt is ALSO spending on ink spread, creasing and washing,
// none of which this simulates.
const LOGO_MODULES = 11;

const url = BASE + 'shirt';
const logoSvg = fs.readFileSync(LOGO, 'utf8');
const art = renderCode(url, { style: 'plain', ink: 'mono', apparel: true, logoSvg, logoModules: LOGO_MODULES });

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'shirt-front.svg'), art.svg);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 2600, height: 2600 } });

// Proof PNG at an integer number of pixels per module.
const grid = art.modules + 8;
const W = Math.round(2400 / grid) * grid;
await page.setContent(`<body style="margin:0;background:#fff"><div id="w" style="width:${W}px">`
  + art.svg.replace(/ width="[\d.]+" height="[\d.]+"/, ` width="${W}"`) + `</div></body>`);
await page.waitForTimeout(600);
const pngPath = path.join(OUT, 'shirt-front.png');
await (await page.$('#w')).screenshot({ path: pngPath });

// Press PDF at exact physical size.
const pdfPath = path.join(OUT, `shirt-front-${Math.round(SIZE_MM)}mm-PRINT.pdf`);
await page.setContent(`<html><head><style>
  @page { size: ${SIZE_MM}mm ${SIZE_MM}mm; margin: 0; }
  html,body { margin:0; width:${SIZE_MM}mm; height:${SIZE_MM}mm; }
</style></head><body><div style="width:${SIZE_MM}mm;height:${SIZE_MM}mm">`
  + art.svg.replace(/ width="[\d.]+" height="[\d.]+"/, ' width="100%" height="100%"') + `</div></body></html>`);
await page.waitForTimeout(500);
await page.pdf({ path: pdfPath, width: `${SIZE_MM}mm`, height: `${SIZE_MM}mm`, printBackground: true, pageRanges: '1' });
await browser.close();

// Gate BOTH artifacts. The PDF is what goes to the press, so the PDF is what
// gets tested — rasterised at whole pixels per module.
const moduleMm = SIZE_MM / (art.modules + 8);
const perModule = Math.max(8, Math.round(moduleMm * 400 / 25.4));
const dpi = Math.round(perModule * 25.4 / moduleMm);
const raster = path.join(OUT, '.gate');
execFileSync('pdftoppm', ['-r', String(dpi), '-png', '-singlefile', pdfPath, raster]);

let bad = 0;
for (const [label, file] of [['proof PNG', pngPath], ['press PDF', `${raster}.png`]]) {
  const img = PNG.sync.read(fs.readFileSync(file));
  const got = jsQR(new Uint8ClampedArray(img.data), img.width, img.height);
  const ok = got && got.data === url;
  if (!ok) bad++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}`);
}
fs.unlinkSync(`${raster}.png`);
if (bad) { fs.rmSync(OUT, { recursive: true, force: true }); console.error('\n  artwork deleted — it does not scan.\n'); process.exit(1); }

fs.writeFileSync(path.join(OUT, 'PRINT-SPEC.txt'), `ADAPT TO LIFE — FRONT OF SHIRT
Just the code. No caption. Logo in the middle.
(The "SCAN TO GIVE" captioned version is the STICKER treatment — different folder.)

THE ONE THING THAT MATTERS
Print WHITE ink only. The dark squares are NOT printed — they are the black
shirt showing through, and so is the logo in the centre. Do not print them and
do not "fix" the artwork by inverting it.

A QR code must be DARK on a LIGHT background. A white code on black is
inverted: it reads on many newer phones and fails on older Android cameras, and
we cannot choose which phone someone is holding. Printing the white as the
field keeps the polarity right AND costs one screen instead of two.

FILES
  shirt-front.svg               the artwork. Vector, scale freely.
  shirt-front-${Math.round(SIZE_MM)}mm-PRINT.pdf   press-ready at target size.
  shirt-front.png               proof for review only, never for output.

SIZE
  Target ${Math.round(SIZE_MM)} mm (${(SIZE_MM / 25.4).toFixed(1)} in) wide — about ${moduleMm.toFixed(2)} mm per module,
  scans from roughly ${((moduleMm * art.modules) * 10 / 304.8).toFixed(1)} ft.
  Minimum 150 mm (6 in). Scale both directions together, never stretch.

THE LOGO IN THE MIDDLE
  It sits on a white pad and covers about 11% of the code. That is paid for out
  of the code's error correction — the same budget being spent on ink spread,
  creasing and washing. It is within safe limits and it is tested, but it is why
  the size above is not negotiable and why the test shirt matters.

CLEAR SPACE
  The quiet zone is inside the artwork already. Do not crop into the white, do
  not put type or a seam inside it, keep other graphics well clear.

BEFORE THE FULL RUN
  Print ONE shirt. Scan it with three phones, one at least three years old,
  indoors and in daylight, from about six feet. Fabric is not paper and this is
  the only test that counts.

WHERE IT GOES
  Encodes ${url}, which forwards to adapttolife.org today.
  That destination is data we control and can change at any time WITHOUT
  REPRINTING ANY SHIRTS. Do not encode a different URL and do not "simplify" it
  to a direct link — that would weld every shirt to one destination forever.
`);

console.log(`\n  ${SIZE_MM}mm · module ${moduleMm.toFixed(2)}mm · logo ${LOGO_MODULES} modules (~11% of area)`);
console.log(`  → ${OUT}\n`);
