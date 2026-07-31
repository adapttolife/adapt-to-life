#!/usr/bin/env node
// Adapt To Life print pipeline (Spec 116 P4) — artwork nobody has to fix.
//
//   node scripts/make-qr-sheet.mjs chair --size=45mm
//   node scripts/make-qr-sheet.mjs sign  --size=180mm --sheet=a4 --copies=1
//   node scripts/make-qr-sheet.mjs chair --size=45mm --bleed=3mm      # die-cut
//
// This exists because the single-code generator answers the wrong question for
// a printer. It renders at a pixel size, and a printer needs to know how wide
// the finished sticker is in millimetres, how wide one module ends up, whether
// the quiet zone survives the cut, and whether the thing still decodes AFTER
// being rasterised at print resolution. Those are different questions and the
// last one is the only one that matters on the day.
//
// Three guards, in the order they catch things:
//
//  1. X-DIMENSION. Below ~0.5mm per module a cheap printer starts closing up
//     the gaps; below ~0.33mm nothing is reliable. The script refuses to write
//     a PDF it believes cannot be printed, because an unreliable sticker is
//     worse than no sticker — it fails silently, in someone's hand, forever.
//  2. QUIET ZONE. Four modules of clear space, and the cut line must fall
//     outside it. Crop marks live in the gutter, never in the margin of the
//     code.
//  3. DECODE, ON THE RASTERISED PDF. Not on the SVG and not on a screen PNG:
//     the PDF is rendered at print resolution and EVERY code position on the
//     sheet is cropped out and decoded on its own. A sheet where one of
//     twenty-four positions is broken looks identical to a perfect one.
//
// Read the size table in docs/qr-print.md before choosing --size.

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import jsQR from 'jsqr';
import {
  renderCode, BASE, CREAM, readDistanceRatio, MODULE_MM_WARN, MODULE_MM_FAIL,
} from './lib/qr-art.mjs';

const SHEETS = {
  letter: { w: 215.9, h: 279.4, label: 'US Letter' },
  a4:     { w: 210.0, h: 297.0, label: 'A4' },
};
const OUT = process.env.ATL_QR_OUT || path.join(process.cwd(), 'public/qr');
// Resolution the gate rasterises at. Raise it with --gate-dpi to tell a genuine
// marginal code apart from a rasteriser artifact: a code that fails at 400 and
// passes at 1200 was sitting close enough to the edge that sub-pixel placement
// decided it, which on paper is the same as "sometimes".
const DEFAULT_GATE_DPI = 400;

const args = process.argv.slice(2);
const flag = (name, dflt) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : dflt;
};
const mm = (v) => {
  const s = String(v).trim();
  const n = parseFloat(s);
  if (!isFinite(n)) throw new Error(`not a length: ${s}`);
  if (/in$/.test(s)) return n * 25.4;
  if (/cm$/.test(s)) return n * 10;
  return n;                       // bare numbers and mm are millimetres
};

const slugs = args.filter((a) => !a.startsWith('--'));
if (slugs.length !== 1) {
  console.error('usage: make-qr-sheet.mjs <slug> --size=45mm [--sheet=letter|a4] [--style=frame|plain] [--bleed=0] [--gutter=6mm] [--copies=auto]');
  process.exit(1);
}
const slug   = slugs[0];
const style  = flag('style', 'frame');
const sheet  = SHEETS[flag('sheet', 'letter')];
const size   = mm(flag('size', '45mm'));
const bleed  = mm(flag('bleed', '0'));
const gutter = mm(flag('gutter', '6mm'));
const margin = mm(flag('margin', '12mm'));
const copiesWanted = flag('copies', 'auto');
const GATE_DPI = parseInt(flag('gate-dpi', String(DEFAULT_GATE_DPI)), 10);
const keepRaster = args.includes('--keep-raster');
if (!sheet) { console.error('unknown --sheet'); process.exit(1); }

const url = BASE + slug;
const art = renderCode(url, { style });

// ---- geometry, in millimetres -------------------------------------------
const pieceW = size;
const pieceH = size * (art.heightUnits / art.widthUnits);
// The symbol square (code + quiet zone) as a fraction of the full artwork.
const codeMm   = size * (art.codeUnits / art.widthUnits);
const moduleMm = codeMm / (art.modules + 2 * 4);
const symbolMm = moduleMm * art.modules;
const quietMm  = moduleMm * 4;
const readMm   = symbolMm * readDistanceRatio;

const cellW = pieceW + gutter, cellH = pieceH + gutter;
const cols = Math.max(1, Math.floor((sheet.w - 2 * margin + gutter) / cellW));
const rows = Math.max(1, Math.floor((sheet.h - 2 * margin + gutter) / cellH));
const perSheet = cols * rows;
const copies = copiesWanted === 'auto' ? perSheet : Math.min(parseInt(copiesWanted, 10) || 1, perSheet);

// Centre the block that is actually used. Anchoring to the top-left margin
// left ~45mm of dead stock down one side of a full sheet, which looks like a
// mistake to whoever opens the file and wastes the edge of the material on a
// short run.
const colsUsed = Math.min(copies, cols);
const rowsUsed = Math.ceil(copies / cols);
const originX = (sheet.w - (colsUsed * cellW - gutter)) / 2;
const originY = (sheet.h - (rowsUsed * cellH - gutter)) / 2;

const fmt = (n) => `${n.toFixed(2)}mm`;
const inches = (n) => `${(n / 25.4).toFixed(2)}in`;

console.log(`\n  /q/${slug}  →  ${url}`);
console.log(`  ${sheet.label} · ${style} · ${copies} of ${perSheet} positions (${cols}×${rows})\n`);
console.log(`  finished piece   ${fmt(pieceW)} × ${fmt(pieceH)}   (${inches(pieceW)} × ${inches(pieceH)})`);
console.log(`  symbol           ${fmt(symbolMm)}   ${art.modules}×${art.modules} modules`);
console.log(`  one module       ${moduleMm.toFixed(3)}mm`);
console.log(`  quiet zone       ${fmt(quietMm)}   (4 modules, ISO minimum)`);
console.log(`  reads from up to ${(readMm / 1000).toFixed(2)}m  (${(readMm / 25.4 / 12).toFixed(1)}ft)\n`);

// ---- guard 1: can this be printed at all? --------------------------------
if (moduleMm < MODULE_MM_FAIL) {
  console.error(`  REFUSED: one module is ${moduleMm.toFixed(3)}mm, under the ${MODULE_MM_FAIL}mm floor.`);
  console.error(`  Nothing prints reliably that small. Make it at least ${fmt(size * MODULE_MM_FAIL / moduleMm)} wide.`);
  process.exit(1);
}
if (moduleMm < MODULE_MM_WARN) {
  console.warn(`  WARNING: one module is ${moduleMm.toFixed(3)}mm, under the ${MODULE_MM_WARN}mm comfort line.`);
  console.warn(`  A good commercial printer will hold this; an office laser or a cheap sticker`);
  console.warn(`  vendor may close up the gaps. Prefer ${fmt(size * MODULE_MM_WARN / moduleMm)} or wider, and`);
  console.warn(`  do the physical scan test (AC1) on the actual stock before ordering volume.\n`);
}
if (gutter < 4 && copies > 1) {
  console.warn(`  WARNING: a ${fmt(gutter)} gutter leaves little room for crop marks and a cutting blade.\n`);
}

// ---- the sheet -----------------------------------------------------------
// Laid out in real millimetres so what the PDF says is what the printer gets.
// Crop marks sit in the GUTTER, outside the trim box — never inside the code's
// quiet zone, which is guard 2.
const MARK = 3, MARK_GAP = 1;
let pieces = '';
const rects = [];   // trim boxes in mm, reused by the decode gate
for (let i = 0; i < copies; i++) {
  const r = Math.floor(i / cols), c = i % cols;
  const x = originX + c * cellW, y = originY + r * cellH;
  rects.push({ x, y, w: pieceW, h: pieceH });

  if (bleed > 0) {
    // A square cream backdrop past the trim line, so trimming anywhere inside
    // the bleed still yields a clean cream edge. Note this squares off the
    // tile's rounded corner by design — a die-cut piece is cut to shape.
    pieces += `<div style="position:absolute;left:${x - bleed}mm;top:${y - bleed}mm;`
      + `width:${pieceW + 2 * bleed}mm;height:${pieceH + 2 * bleed}mm;background:${CREAM}"></div>`;
  }
  pieces += `<div style="position:absolute;left:${x}mm;top:${y}mm;width:${pieceW}mm;height:${pieceH}mm">`
    + art.svg.replace(/ width="[\d.]+" height="[\d.]+"/, ' width="100%" height="100%"')
    + `</div>`;

  // Corner crop marks, hairline, in the gutter.
  for (const [cx, cy, dx, dy] of [
    [x, y, -1, -1], [x + pieceW, y, 1, -1], [x, y + pieceH, -1, 1], [x + pieceW, y + pieceH, 1, 1],
  ]) {
    pieces += `<div style="position:absolute;left:${cx + dx * MARK_GAP - (dx < 0 ? MARK : 0)}mm;top:${cy}mm;`
      + `width:${MARK}mm;height:0;border-top:0.12mm solid #999"></div>`;
    pieces += `<div style="position:absolute;left:${cx}mm;top:${cy + dy * MARK_GAP - (dy < 0 ? MARK : 0)}mm;`
      + `width:0;height:${MARK}mm;border-left:0.12mm solid #999"></div>`;
  }
}

const slugLine = `/q/${slug} · ${fmt(pieceW)} wide · module ${moduleMm.toFixed(3)}mm · reads to ${(readMm / 25.4 / 12).toFixed(1)}ft · adapttolife.org`;
const html = `<html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&display=swap">
<style>
  @page { size: ${sheet.w}mm ${sheet.h}mm; margin: 0; }
  html,body { margin:0; padding:0; width:${sheet.w}mm; height:${sheet.h}mm; background:#fff; }
  .slugline { position:absolute; left:${Math.min(margin, originX)}mm; bottom:4mm; font-family:'Space Mono',monospace;
              font-size:2.6mm; color:#9a958c; letter-spacing:0.02em; }
</style></head><body>
${pieces}
<div class="slugline">${slugLine}</div>
</body></html>`;

const dir = path.join(OUT, 'print');
fs.mkdirSync(dir, { recursive: true });
const base = `sheet-${slug}-${Math.round(size)}mm-${flag('sheet', 'letter')}${style === 'plain' ? '-plain' : ''}${bleed ? '-bleed' : ''}`;
const pdfPath = path.join(dir, `${base}.pdf`);

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(html, { waitUntil: 'networkidle' });
await page.waitForTimeout(900);                       // let Space Mono land
await page.pdf({ path: pdfPath, width: `${sheet.w}mm`, height: `${sheet.h}mm`, printBackground: true, pageRanges: '1' });
await browser.close();

// ---- guard 3: decode every position on the RASTERISED pdf ----------------
// The PDF is the artifact that goes to the printer, so the PDF is what gets
// tested — rendered at print resolution and each position cropped out and
// decoded alone, because jsQR finds one code per image and a sheet where a
// single position is broken looks exactly like a perfect one.
const rasterBase = path.join(dir, `.gate-${base}`);
execFileSync('pdftoppm', ['-r', String(GATE_DPI), '-png', '-singlefile', pdfPath, rasterBase]);
const rasterPath = `${rasterBase}.png`;
const img = PNG.sync.read(fs.readFileSync(rasterPath));
const pxPerMm = GATE_DPI / 25.4;

function cropDecode({ x, y, w, h }) {
  const x0 = Math.max(0, Math.floor(x * pxPerMm)), y0 = Math.max(0, Math.floor(y * pxPerMm));
  const cw = Math.min(img.width - x0, Math.ceil(w * pxPerMm));
  const ch = Math.min(img.height - y0, Math.ceil(h * pxPerMm));
  const buf = new Uint8ClampedArray(cw * ch * 4);
  for (let row = 0; row < ch; row++) {
    const src = ((y0 + row) * img.width + x0) * 4;
    buf.set(img.data.subarray(src, src + cw * 4), row * cw * 4);
  }
  return jsQR(buf, cw, ch);
}

let bad = 0;
for (let i = 0; i < rects.length; i++) {
  const got = cropDecode(rects[i]);
  if (!got || got.data !== url) {
    bad++;
    console.error(`  position ${i + 1} of ${rects.length}: DECODE FAILED${got ? ` (read "${got.data}")` : ''}`);
  }
}
if (!keepRaster) fs.unlinkSync(rasterPath);
else console.log(`  raster kept: ${rasterPath}`);

if (bad) {
  if (!keepRaster) fs.unlinkSync(pdfPath);
  console.error(`\n  ${bad}/${rects.length} positions failed at ${GATE_DPI} DPI. PDF deleted — nothing here is printable.`);
  console.error(`\n  Identical artwork failing in SOME positions and not others is the signature of a`);
  console.error(`  marginal size, not broken art: one module is ${(moduleMm / 25.4 * GATE_DPI).toFixed(2)} pixels at this resolution, and when`);
  console.error(`  that is not a whole number the sub-pixel placement differs per position. Re-run`);
  console.error(`  with --gate-dpi=1200: if it passes there, the code is simply too small for a`);
  console.error(`  mid-range printer and the fix is to go wider, not to lower the gate.\n`);
  process.exit(1);
}

console.log(`  all ${rects.length} positions decoded at ${GATE_DPI} DPI`);
console.log(`  → ${pdfPath}\n`);
console.log(`  Before ordering volume, run the PHYSICAL scan test (AC1): print one sheet at`);
console.log(`  100% scale, and scan it with three phones including one 3+ years old, indoors`);
console.log(`  and in daylight. Software decoding is necessary and not sufficient.\n`);
