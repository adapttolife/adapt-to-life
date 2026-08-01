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
// sticker.
//
// THE FINDER EYES WERE WHEELS AND THAT WAS A REAL BUG (fixed 2026-08-01).
// D1 asserted the wheel "costs no decode margin, because finder patterns are
// structural and never carry data." Structural is exactly why it mattered: a
// decoder LOOKS for the finder pattern's 1:1:3:1:1 dark/light run, and a
// heavily rounded rim with a CIRCULAR hub does not present it. Measured with
// OpenCV 5, padded, at 872px — the size a phone sees a 10in code from ~3ft:
//
//     standard square eyes  DECODES
//     gently rounded eyes   DECODES
//     WHEEL eyes            FAILS
//
// Same payload, same modules, same everything else. jsQR read the wheel fine,
// which is why it survived from July to August unnoticed — one tolerant
// decoder is not evidence, and every earlier claim in this file that the eyes
// were the robust part of the design came from that single source.
//
// The eyes are now a rounded SQUARE topology: 7x7 ink, 5x5 field, 3x3 ink,
// corners softened enough to still read as ours. Brand where it is free,
// never where a scanner has to forgive it.

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
  `<rect x="${x}" y="${y}" width="${7*m}" height="${7*m}" rx="${m*0.8}" fill="${p.ink}"/>`
  + `<rect x="${x+m}" y="${y+m}" width="${5*m}" height="${5*m}" rx="${m*0.6}" fill="${p.field}"/>`
  + `<rect x="${x+2*m}" y="${y+2*m}" width="${3*m}" height="${3*m}" rx="${m*0.5}" fill="${p.hub}"/>`;

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
// `apparel` is not a style, it is a manufacturing mode.
//
// On a BLACK shirt the correct print is white ink laid down as the FIELD, with
// the dark modules left unprinted so the fabric itself shows through. That
// keeps the code dark-on-light (principle 4 — never invert, older Android
// cameras fail on inverted codes) and it costs ONE screen instead of two.
//
// The consequence is that ink spread EATS the modules rather than fattening
// them, so the design has to survive shrinkage. Measured 2026-08-01 on the
// shirt code, simulating gain by thinning the dark modules:
//
//     effective fill   0.70  0.75  0.80  0.85  0.90  0.94  1.00
//     rounded dots      NO    NO    NO    NO    NO   yes   yes
//     square modules    NO    NO   yes   yes   yes   yes   yes
//
// The rounded dot dies at ~6% shrink; fabric routinely gives more than that.
// Square modules hold to 20%. So apparel drops the dot treatment — principle 5
// again, a treatment is welcome until it costs decode margin. At arm's length
// on a shirt nobody can see the difference; a code that will not scan is fatal.
// It also drops the hairline tile border, which is a 28%-opacity line no screen
// printer can hold.
// Drop a logo into the middle of the code.
//
// Spec 116's D1 deliberately did NOT do this — "the logo ships as its own
// separate sticker, so the code carries no knockout and every bit of error
// correction stays as insurance." Alec reversed that for apparel on 2026-08-01,
// which is his call to make.
//
// What it costs is real and worth stating: a centre logo destroys the modules
// underneath it. Error correction H recovers roughly 30% of a symbol, so a
// small knockout is free-ish — but on a shirt that budget is ALREADY being
// spent on ink spread eroding every module. The two stack, so the logo is
// sized against a measured result rather than by eye (see make-shirt-artwork).
//
// The pad is the light field and the logo is drawn in ink, so on a black shirt
// it stays one white screen: pad printed, logo left as bare fabric.
function centreLogo(logoSvg, dim, m, modules, p) {
  const box = (logoSvg.match(/viewBox="([^"]+)"/) || [])[1] || '0 0 1024 1024';
  const inner = logoSvg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')
                       .replace(/#FFFFFF/gi, p.ink)
                       .replace(/currentColor/g, p.ink)
                       .replace(/fill="#000000"/gi, `fill="${p.ink}"`);
  const pad = modules * m;                   // white pad, in module units
  const x = (dim - pad) / 2, y = (dim - pad) / 2;
  const inset = pad * 0.05;   // fill the pad. Pad SIZE is what costs error
                             // correction; the mark inside it is free.
  return `<rect x="${x}" y="${y}" width="${pad}" height="${pad}" rx="${m*0.3}" fill="${p.field}"/>`
    + `<svg x="${x+inset}" y="${y+inset}" width="${pad-2*inset}" height="${pad-2*inset}"`
    + ` viewBox="${box}" preserveAspectRatio="xMidYMid meet">${inner}</svg>`;
}

export function renderCode(text, { style = 'frame', ink = 'mono', apparel = false, logoSvg = null, logoModules = 9 } = {}) {
  const p = PALETTES[ink] || PALETTES.mono;
  const fill = apparel ? 1 : MODULE_FILL;
  const radius = apparel ? 0 : MODULE_RADIUS;
  const qr = QR.create(text, { errorCorrectionLevel: EC });
  const n = qr.modules.size, d = qr.modules.data;
  const m = 10, quiet = QUIET_MODULES * m;
  const dim = n * m + quiet * 2;

  let body = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (!d[r*n+c] || isEye(r, c, n)) continue;
    const x = quiet + c*m, y = quiet + r*m;
    const inset = m * (1 - fill) / 2;
    body += `<rect x="${x+inset}" y="${y+inset}" width="${m*fill}" height="${m*fill}" rx="${m*radius}" fill="${p.ink}"/>`;
  }
  const eyes = eye(quiet, quiet, m, p) + eye(quiet+(n-7)*m, quiet, m, p) + eye(quiet, quiet+(n-7)*m, m, p);
  const badge = logoSvg ? centreLogo(logoSvg, dim, m, logoModules, p) : '';

  const geom = { modules: n, moduleUnits: m, quietUnits: quiet, codeUnits: dim };

  if (style === 'plain') {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" width="${dim}" height="${dim}">`
      + `<rect width="${dim}" height="${dim}" fill="${p.field}"/>${body}${eyes}${badge}</svg>`;
    return { svg, ...geom, widthUnits: dim, heightUnits: dim };
  }

  // Frame (D2): cream tile + "SCAN TO GIVE". The tile is also what lets a code
  // sit inside a dark layout without ever inverting (principle 4).
  const band = dim * 0.20, H = dim + band, inset = dim * 0.035;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${H}" width="${dim}" height="${H}">`
    + `<rect width="${dim}" height="${H}" rx="${dim*0.045}" fill="${p.tile}"/>`
    + (ink === 'mono' && !apparel ? `<rect x="0.6" y="0.6" width="${dim-1.2}" height="${H-1.2}" rx="${dim*0.045}" fill="none" stroke="${p.ink}" stroke-width="1.2" stroke-opacity="0.28"/>` : '')
    + `<rect x="${inset}" y="${inset}" width="${dim-inset*2}" height="${dim-inset*2}" rx="${dim*0.02}" fill="${p.field}"/>`
    + body + eyes + badge
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
