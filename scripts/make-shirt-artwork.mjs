#!/usr/bin/env node
// Spec 116 — front-of-shirt artwork. Alec, 2026-08-01: just the code, no words,
// logo in the middle, minimal. The captioned "SCAN TO GIVE" version stays as
// the STICKER treatment; this is deliberately not that.
//
//   node scripts/make-shirt-artwork.mjs <out-dir> <logo.svg> [--size=254mm] [--bg=both]
//
//   --bg=light   dark code in a white panel   (default treatment, reads everywhere)
//   --bg=dark    white code on black          (inverted — see the warning below)
//   --bg=both    both, side by side           (default)
//
// Produces SVG (the real artwork), a PNG proof, and a press-ready PDF at exact
// physical size — and refuses to write any of it unless the code decodes.
//
// THE TWO BACKGROUNDS ARE NOT INTERCHANGEABLE.
// They carry the same symbol, module for module — this script proves that by
// stripping colour out of both SVGs and requiring the remaining geometry to be
// byte-identical. What differs is POLARITY, and polarity is the one thing a
// scanner is allowed to be picky about. Dark-on-light is the ISO orientation and
// every decoder reads it. Light-on-dark relies on the decoder trying an
// inversion, which modern phones do and older ZXing-based scanners do not.
// scripts/qr-polarity-test.py measures exactly that, on simulated shirt capture.

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import jsQR from 'jsqr';
import { renderCode, geometryOf, BASE } from './lib/qr-art.mjs';

const argv = process.argv.slice(2);
const [OUT, LOGO] = argv.filter((a) => !a.startsWith('--'));
const SIZE_MM = parseFloat((argv.find((a) => a.startsWith('--size=')) || '--size=254').replace(/[^\d.]/g, '')) || 254;
const BG = (argv.find((a) => a.startsWith('--bg=')) || '--bg=both').split('=')[1];
if (!OUT || !LOGO || !['light', 'dark', 'both'].includes(BG)) {
  console.error('usage: make-shirt-artwork.mjs <out-dir> <logo.svg> [--size=254mm] [--bg=light|dark|both]');
  process.exit(1);
}

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

const VARIANTS = {
  // key      ink palette   file stem                proof backdrop
  light: { ink: 'mono', stem: 'shirt-front-white-bg', backdrop: '#8A8A8A' },
  dark:  { ink: 'dark', stem: 'shirt-front-black-bg', backdrop: '#8A8A8A' },
};
const wanted = BG === 'both' ? ['light', 'dark'] : [BG];

const art = {};
for (const key of wanted) {
  art[key] = renderCode(url, {
    style: 'plain', ink: VARIANTS[key].ink, apparel: true, logoSvg, logoModules: LOGO_MODULES,
  });
}

// "Make sure the QR code is the same" — proved, not asserted. Colour is stripped
// from both SVGs and what is left (every rect, every coordinate, every radius,
// the logo path data) must match to the byte. If a future edit ever makes the
// dark version a different symbol, this stops it here rather than at a print run.
if (wanted.length === 2) {
  const [a, b] = wanted.map((k) => geometryOf(art[k].svg));
  if (a !== b) { console.error('  FAIL — the two backgrounds are not the same code. Nothing written.'); process.exit(1); }
  console.log(`  ok   identical geometry: ${a.length} bytes of shape, colour is the only difference`);
}

fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 2600, height: 2600 } });
let bad = 0;

for (const key of wanted) {
  const v = VARIANTS[key], a = art[key];
  fs.writeFileSync(path.join(OUT, `${v.stem}.svg`), a.svg);

  // Proof PNG at an integer number of pixels per module.
  const grid = a.modules + 8;
  const W = Math.round(2400 / grid) * grid;
  await page.setContent(`<body style="margin:0;background:${v.backdrop}"><div id="w" style="width:${W}px">`
    + a.svg.replace(/ width="[\d.]+" height="[\d.]+"/, ` width="${W}"`) + `</div></body>`);
  await page.waitForTimeout(600);
  const pngPath = path.join(OUT, `${v.stem}.png`);
  await (await page.$('#w')).screenshot({ path: pngPath });

  // Press PDF at exact physical size.
  const pdfPath = path.join(OUT, `${v.stem}-${Math.round(SIZE_MM)}mm-PRINT.pdf`);
  await page.setContent(`<html><head><style>
    @page { size: ${SIZE_MM}mm ${SIZE_MM}mm; margin: 0; }
    html,body { margin:0; width:${SIZE_MM}mm; height:${SIZE_MM}mm; }
  </style></head><body><div style="width:${SIZE_MM}mm;height:${SIZE_MM}mm">`
    + a.svg.replace(/ width="[\d.]+" height="[\d.]+"/, ' width="100%" height="100%"') + `</div></body></html>`);
  await page.waitForTimeout(500);
  await page.pdf({ path: pdfPath, width: `${SIZE_MM}mm`, height: `${SIZE_MM}mm`, printBackground: true, pageRanges: '1' });

  // Gate BOTH artifacts. The PDF is what goes to the press, so the PDF is what
  // gets tested — rasterised at whole pixels per module.
  const moduleMm = SIZE_MM / (a.modules + 8);
  const perModule = Math.max(8, Math.round(moduleMm * 400 / 25.4));
  const dpi = Math.round(perModule * 25.4 / moduleMm);
  const raster = path.join(OUT, `.gate-${key}`);
  execFileSync('pdftoppm', ['-r', String(dpi), '-png', '-singlefile', pdfPath, raster]);

  for (const [label, file] of [['proof PNG', pngPath], ['press PDF', `${raster}.png`]]) {
    const img = PNG.sync.read(fs.readFileSync(file));
    const px = new Uint8ClampedArray(img.data);
    // Two reads, deliberately. `dontInvert` is the strict, ISO-orientation
    // decoder — the light version must pass it, and the dark version cannot by
    // definition. `attemptBoth` is what a modern phone camera does.
    const strict = jsQR(px, img.width, img.height, { inversionAttempts: 'dontInvert' });
    const phone  = jsQR(px, img.width, img.height, { inversionAttempts: 'attemptBoth' });
    const need = key === 'light' ? strict : phone;
    const ok = need && need.data === url;
    if (!ok) bad++;
    const note = key === 'dark'
      ? (strict?.data === url ? '  (also read WITHOUT inversion)' : '  (needs a decoder that inverts)')
      : '';
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${key.padEnd(5)} ${label}${note}`);
  }
  fs.unlinkSync(`${raster}.png`);
}

await browser.close();
if (bad) { fs.rmSync(OUT, { recursive: true, force: true }); console.error('\n  artwork deleted — it does not scan.\n'); process.exit(1); }

const SIZE = Math.round(SIZE_MM);
const moduleMm = SIZE_MM / (art[wanted[0]].modules + 8);
const feet = ((moduleMm * art[wanted[0]].modules) * 10 / 304.8).toFixed(1);

const COMMON = `SIZE
  Target ${SIZE} mm (${(SIZE_MM / 25.4).toFixed(1)} in) wide — about ${moduleMm.toFixed(2)} mm per module,
  scans from roughly ${feet} ft.
  Minimum 150 mm (6 in). Scale both directions together, never stretch.

THE LOGO IN THE MIDDLE
  It sits on a pad and covers about 11% of the code. That is paid for out of the
  code's error correction — the same budget being spent on ink spread, creasing
  and washing. It is within safe limits and it is tested, but it is why the size
  above is not negotiable and why the test shirt matters.

CLEAR SPACE
  The quiet zone is inside the artwork already. Do not crop into it, do not put
  type or a seam inside it, keep other graphics well clear.

BEFORE THE FULL RUN
  Print ONE shirt. Scan it with three phones, one at least three years old,
  indoors and in daylight, from about six feet. Fabric is not paper and this is
  the only test that counts.

WHERE IT GOES
  Encodes ${url}, which forwards to adapttolife.org today.
  That destination is data we control and can change at any time WITHOUT
  REPRINTING ANY SHIRTS. Do not encode a different URL and do not "simplify" it
  to a direct link — that would weld every shirt to one destination forever.
`;

const SPEC = {
  light: `ADAPT TO LIFE — FRONT OF SHIRT (white background)
Just the code. No caption. Logo in the middle.
This is the SAFE version: it reads on every scanner ever made.

THE ONE THING THAT MATTERS
Print WHITE ink only. The dark squares are NOT printed — they are the black
shirt showing through, and so is the logo in the centre. Do not print them and
do not "fix" the artwork by inverting it.

A QR code must be DARK on a LIGHT background. Printing the white as the field
keeps the polarity right AND costs one screen instead of two.

WHAT IT LOOKS LIKE ON THE SHIRT
A white square panel about ${SIZE} mm across with the code knocked out of it.

FILES
  ${VARIANTS.light.stem}.svg               the artwork. Vector, scale freely.
  ${VARIANTS.light.stem}-${SIZE}mm-PRINT.pdf   press-ready at target size.
  ${VARIANTS.light.stem}.png               proof for review only, never for output.

${COMMON}`,

  dark: `ADAPT TO LIFE — FRONT OF SHIRT (black background)
Just the code. No caption. Logo in the middle. Same code as the white-background
version — identical module for module, proved by the build, not by eye.

THE ONE THING THAT MATTERS
Print WHITE ink only. The BLACK IS THE SHIRT — do not print it, do not print a
black panel, do not put this on a white garment. Only the white squares, the
white corner markers and the white logo are ink.

READ THIS BEFORE CHOOSING THIS VERSION
This code is INVERTED: light squares on a dark field, the opposite of the
standard orientation. A scanner has to try flipping the image to see it at all.

Measured, not guessed. On a flawless render at every size tested, this code
reads on decoders that attempt an inversion and fails on every decoder that
does not — including OpenCV 5, which is current software, not a relic. Off a
photographed shirt it holds to about 10 ft against about 12 ft for the
white-background version.

Current iPhone and Android cameras do invert. A share of older phones and most
fixed/industrial scanners do not, and we do not get to choose what a donor is
holding. The white-background version has no such caveat.

Choose this one for how it looks, knowing that. Not by accident.

WHAT IT LOOKS LIKE ON THE SHIRT
The code floating directly on the fabric, no panel. Roughly a third of the white
ink of the other version, and a much softer hand.

FILES
  ${VARIANTS.dark.stem}.svg               the artwork. Vector, scale freely.
  ${VARIANTS.dark.stem}-${SIZE}mm-PRINT.pdf   press-ready at target size.
  ${VARIANTS.dark.stem}.png               proof for review only, never for output.

${COMMON}`,
};

for (const key of wanted) fs.writeFileSync(path.join(OUT, `PRINT-SPEC-${key === 'light' ? 'white' : 'black'}-bg.txt`), SPEC[key]);

console.log(`\n  ${SIZE_MM}mm · module ${moduleMm.toFixed(2)}mm · logo ${LOGO_MODULES} modules (~11% of area)`);
console.log(`  → ${OUT}\n`);
