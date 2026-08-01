// Build the shirt artwork folder: vector for the printer, a proof PNG, and a
// spec sheet written for whoever runs the press.
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import jsQR from 'jsqr';
import { renderCode, BASE } from './lib/qr-art.mjs';

const OUT = process.argv[2];
const SLUG = 'shirt';
const url = BASE + SLUG;
fs.mkdirSync(OUT, { recursive: true });

const variants = [
  ['shirt-front-with-caption', { style: 'frame', ink: 'mono', apparel: true }],
  ['shirt-front-code-only',    { style: 'plain', ink: 'mono', apparel: true }],
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 2400, height: 2800 } });
let failed = 0;

for (const [name, opts] of variants) {
  const art = renderCode(url, opts);
  fs.writeFileSync(path.join(OUT, `${name}.svg`), art.svg);
  const grid = art.modules + 8;
  const W = Math.round(3000 / grid) * grid;          // integer pixels per module
  await page.setContent(
    `<html><head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@700&display=swap"></head>`
    + `<body style="margin:0;background:#fff"><div id="w" style="width:${W}px">`
    + art.svg.replace(/ width="[\d.]+" height="[\d.]+"/, ` width="${W}"`) + `</div></body></html>`);
  await page.waitForTimeout(800);
  const p = path.join(OUT, `${name}.png`);
  await (await page.$('#w')).screenshot({ path: p });
  const img = PNG.sync.read(fs.readFileSync(p));
  const got = jsQR(new Uint8ClampedArray(img.data), img.width, img.height);
  const ok = got && got.data === url;
  if (!ok) failed++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}`);
}
await browser.close();
if (failed) { fs.rmSync(OUT, { recursive: true, force: true }); process.exit(1); }

fs.writeFileSync(path.join(OUT, 'PRINT-SPEC.txt'), `ADAPT TO LIFE — FRONT-OF-SHIRT QR CODE
Spec for the printer. Generated 2026-08-01.

THE ONE THING THAT MATTERS
Print WHITE ink only. The dark squares of the code are NOT printed — they are
the black shirt showing through. Do not print them, and do not "fix" the
artwork by inverting it.

Why: a QR code must be DARK on a LIGHT background. A white code on black is
inverted; it reads on many newer phones and fails on older Android cameras,
and we cannot choose which phone a donor is holding. Printing the white as the
field and letting the fabric be the code keeps the polarity correct AND costs
one screen instead of two.

ARTWORK
  shirt-front-with-caption.svg   white tile, code, and SCAN TO GIVE inside it.
                                 One graphic, everything protected by the tile.
  shirt-front-code-only.svg      the code tile alone. Use this if setting
                                 "SCAN TO GIVE" as separate white type below.

  Vector (SVG). Scale it as large as the print area allows. PNGs are proofs
  for review, not for output.

SIZE
  Target 10 in (254 mm) wide, which gives 6.2 mm per module and scans from
  about 6.7 ft — normal conversation distance.
  Absolute minimum 6 in (152 mm). Below that the modules get too fine for
  ink spread on fabric.
  Scale BOTH directions together. Never stretch it.

INK SPREAD
  This artwork uses square modules specifically to survive it. Measured
  tolerance: the code still decodes with the dark modules eroded by up to 20%.
  Rounded modules died at 6%, which is why they are not used here.
  Still: keep the white opaque and the edges crisp. A soft, spready print
  closes up the gaps and there is no warning before it stops scanning.

CLEAR SPACE
  The quiet zone is already inside the artwork (4 modules, ~25 mm at target
  size). Do not crop into the white tile, do not place type or seams inside
  it, and keep any other graphic at least 25 mm away.

PLACEMENT
  Centre front. Avoid seams, pockets and zips crossing the code. On a curved
  or textured area the code should sit flat.

BEFORE THE FULL RUN
  Print ONE shirt and scan it with three phones, including one at least three
  years old, indoors and in daylight, from about six feet. Fabric is not
  paper, and this is the only test that counts.

WHERE IT GOES
  The code encodes  ${url}
  which currently forwards to adapttolife.org. That destination is data we
  control: it can be changed at any time WITHOUT REPRINTING ANY SHIRTS.
  Do not encode a different URL, and do not "simplify" it to adapttolife.org —
  that would permanently weld every shirt to one destination and throw away
  the entire point of the system.
`);

console.log(`\n  → ${OUT}`);
