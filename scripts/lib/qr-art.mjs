// Adapt To Life QR artwork — the ONE definition of what a code looks like.
//
// Extracted from scripts/make-qr.mjs when the print pipeline (Spec 116 P4)
// became a second caller. Two generators drawing the same artwork from two
// copies of the geometry is the shape that drifts silently: the sticker sheet
// and the single code would diverge by a rounding constant nobody notices
// until a print run comes back looking subtly wrong. One definition, two
// callers.
//
// Design (D1, Alec 2026-07-24): functionality first, premium second, and the
// brand carried by geometry rather than a logo — the logo ships as its own
// sticker. The finder eyes are drawn as WHEELS: near-black rounded rim, orange
// hub. It reads as adaptive sport at a glance and costs no decode margin,
// because the eyes are structural and never carry data.

import QR from 'qrcode';

export const INK    = '#0C0C0E';
export const ORANGE = '#E8572A';
export const CREAM  = '#F7F4EE';
export const BASE   = 'https://adapttolife.org/q/';

// Error correction H. Not spent on a logo any more, so it is pure insurance —
// a scuffed, curved or partly peeled sticker still reads.
export const EC = 'H';

// Quiet zone in modules. ISO minimum is 4 and we never go below it: on a
// sticker sheet the neighbouring artwork is the thing most likely to eat it.
export const QUIET_MODULES = 4;

// How much of its cell a data module fills, and how round its corners are.
//
// This was 0.88 and it was sitting on a cliff, which the original sweep missed
// because it only ever looked at the framed style. Measured 2026-07-31 with
// scripts/../qr-fill-sweep across four slugs, both styles:
//
//        PLAIN   0.88  0.90  0.92  0.94  0.96  0.98  1.00
//        chair   FAIL  FAIL   ok    ok    ok    ok   FAIL
//        sign    FAIL  FAIL   ok    ok    ok    ok    ok
//        card    FAIL  FAIL   ok    ok    ok    ok    ok
//        popcorn FAIL  FAIL   ok    ok    ok    ok    ok
//
//        FRAME   0.88  0.90  0.92  0.94  0.96  0.98  1.00
//        chair   FAIL   ok    ok    ok    ok    ok    ok
//        (sign / card / popcorn passed at every fill)
//
// At 0.88 the result flips with the style, the slug AND the render resolution —
// the definition of a treatment that has stopped serving scanning, which
// principle 5 says loses. 0.94 sits in the middle of the passing band for every
// combination measured and is visually indistinguishable at print size: the dot
// grows by three hundredths of a module and the corner radius is unchanged.
//
// This does NOT invalidate anything already printed. The encoded URL is
// untouched; a reprint simply carries slightly fuller dots.
const MODULE_FILL = 0.94;
const MODULE_RADIUS = 0.30;   // of a module, so the dot keeps its shape

const isEye = (r, c, n) =>
  (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);

// One ink, near-black, by default (Alec 2026-07-31: "go all black and white").
//
// This is the cheaper AND the safer version. Single-colour printing costs less
// on every process that matters here — screen print, laser, thermal, vinyl cut
// — and it removes the one element measurement had flagged as a press risk: the
// orange hub's luminance sits near the middle of the range a scanner
// thresholds on, so a colour shift on cheap CMYK or uncoated stock moved it in
// the wrong direction. Nothing about the geometry changes, so the wheel still
// reads as a wheel.
//
// The brand palette is one flag away (`--ink=brand`) and still generates.
const eye = (x, y, m, p) =>
  `<rect x="${x}" y="${y}" width="${7*m}" height="${7*m}" rx="${m*2.1}" fill="${p.ink}"/>`
  + `<rect x="${x+m}" y="${y+m}" width="${5*m}" height="${5*m}" rx="${m*1.5}" fill="${p.field}"/>`
  + `<circle cx="${x+3.5*m}" cy="${y+3.5*m}" r="${m*1.55}" fill="${p.hub}"/>`;

// A palette is the ONLY thing that varies between the two looks. Geometry is
// shared, so a decode result measured on one carries to the other.
export const PALETTES = {
  mono:  { ink: INK, field: '#FFFFFF', hub: INK,    tile: '#FFFFFF', rule: INK },
  brand: { ink: INK, field: '#FFFFFF', hub: ORANGE, tile: CREAM,     rule: ORANGE },
};

/**
 * Build the artwork for one code.
 *
 * Returns the SVG plus the geometry a print pipeline needs to convert between
 * "how wide is the finished sticker" and "how wide is one module", which is
 * the number that decides whether a printer can hold the code at all.
 *
 *   modules      the symbol's module count per side (excludes quiet zone)
 *   codeUnits    symbol + quiet zone, in SVG units — the square that must stay clear
 *   widthUnits   full artwork width  (frame style: the cream tile)
 *   heightUnits  full artwork height (frame style: tile + caption band)
 */
export function renderCode(text, { style = 'frame', ink = 'mono' } = {}) {
  const p = PALETTES[ink] || PALETTES.mono;
  const qr = QR.create(text, { errorCorrectionLevel: EC });
  const n = qr.modules.size, d = qr.modules.data;
  const m = 10, quiet = QUIET_MODULES * m;
  const dim = n * m + quiet * 2;

  let body = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (!d[r*n+c] || isEye(r, c, n)) continue;
    const x = quiet + c*m, y = quiet + r*m;
    const inset = m * (1 - MODULE_FILL) / 2;
    body += `<rect x="${x+inset}" y="${y+inset}" width="${m*MODULE_FILL}" height="${m*MODULE_FILL}" rx="${m*MODULE_RADIUS}" fill="${p.ink}"/>`;
  }
  const eyes = eye(quiet, quiet, m, p) + eye(quiet+(n-7)*m, quiet, m, p) + eye(quiet, quiet+(n-7)*m, m, p);

  const geom = { modules: n, moduleUnits: m, quietUnits: quiet, codeUnits: dim };

  if (style === 'plain') {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" width="${dim}" height="${dim}">`
      + `<rect width="${dim}" height="${dim}" fill="${p.field}"/>${body}${eyes}</svg>`;
    return { svg, ...geom, widthUnits: dim, heightUnits: dim };
  }

  // Frame (D2): cream tile + "SCAN TO GIVE". The tile is also what lets a code
  // sit inside a dark layout without ever inverting (principle 4).
  const band = dim * 0.20, H = dim + band, inset = dim * 0.035;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${H}" width="${dim}" height="${H}">`
    + `<rect width="${dim}" height="${H}" rx="${dim*0.045}" fill="${p.tile}"/>`
    + (ink === 'mono' ? `<rect x="0.6" y="0.6" width="${dim-1.2}" height="${H-1.2}" rx="${dim*0.045}" fill="none" stroke="${p.ink}" stroke-width="1.2" stroke-opacity="0.28"/>` : '')
    + `<rect x="${inset}" y="${inset}" width="${dim-inset*2}" height="${dim-inset*2}" rx="${dim*0.02}" fill="${p.field}"/>`
    + body + eyes
    + `<rect x="${dim*0.34}" y="${dim+band*0.10}" width="${dim*0.32}" height="${dim*0.007}" rx="${dim*0.004}" fill="${p.rule}"/>`
    + `<text x="${dim/2}" y="${dim+band*0.68}" text-anchor="middle" font-family="'Space Mono',ui-monospace,monospace"`
    + ` font-weight="700" font-size="${band*0.34}" letter-spacing="${band*0.08}" fill="${p.ink}">SCAN TO GIVE</text>`
    + `</svg>`;
  return { svg, ...geom, widthUnits: dim, heightUnits: H };
}

// The working rule from the spec: distance ÷ 10 = minimum code width. Stated
// against the SYMBOL (modules plus its quiet zone), because that is what
// governs how many pixels of a camera sensor land on one module.
export const readDistanceRatio = 10;

// X-dimension floors, in millimetres.
//
// The warn line is 0.75 rather than the 0.50 a spec sheet would suggest,
// because 0.50 was never observed to be safe. Measured 2026-07-31, chair in
// frame style, sheets gated at 400 DPI:
//
//     25mm  module 0.610mm   1 of 42 positions failed
//     28mm  module 0.683mm   2 of 30 positions failed
//     30mm  module 0.732mm   all 30 passed
//     32mm  module 0.780mm   all 25 passed
//
// So the real floor sits just under 0.75mm, and a warn line below the point
// where the gate starts rejecting is worse than none: it stays quiet and then
// the build fails anyway, which reads as a broken tool rather than a code that
// is too small.
//
// Below the FAIL line nothing is reliable at any resolution, and an unreliable
// sticker is worse than no sticker — it fails silently, in someone's hand.
export const MODULE_MM_WARN = 0.75;
export const MODULE_MM_FAIL = 0.33;
