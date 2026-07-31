# Printing Adapt To Life QR codes

Spec 116 P4. Everything here exists to prevent one failure: **a code that does not scan fails silently and permanently.** A sticker on an athlete's chair cannot be recalled, re-deployed, or apologised to. Nobody reports it — they just walk away.

## Make a sheet

```bash
node scripts/make-qr-sheet.mjs chair --size=45mm
node scripts/make-qr-sheet.mjs sign  --size=180mm --sheet=a4 --copies=1
node scripts/make-qr-sheet.mjs chair --size=45mm --bleed=3mm     # die-cut vendor
```

Output lands in `public/qr/print/`. The script refuses to write a PDF it does not believe will print, and **deletes the PDF if any position on the sheet fails to decode** — there is deliberately no flag to override that.

| Flag | Default | Notes |
|---|---|---|
| `--size` | `45mm` | Width of the **finished piece**. Accepts `mm`, `cm`, `in`. |
| `--sheet` | `letter` | `letter` or `a4` |
| `--style` | `frame` | `frame` = cream tile + SCAN TO GIVE · `plain` = code only, for tight spaces |
| `--copies` | `auto` | `auto` fills the sheet |
| `--bleed` | `0` | Use your vendor's number for die-cut. Squares off the tile's rounded corner by design. |
| `--gutter` | `6mm` | Space between pieces; crop marks live here |
| `--gate-dpi` | `400` | Diagnostic only — see below |

## Size by viewing distance

The working rule is **viewing distance ÷ 10 = minimum symbol width**. Size by how far away someone reads it, never by what looks nice on screen.

Every figure below was read off the tool, not calculated by hand, and every row passes the decode gate.

| Surface | Finished piece (frame) | Symbol | One module | Reads to |
|---|---|---|---|---|
| Smallest we will print | **30mm** (1.18in) | 24.15mm | 0.732mm | 0.8 ft |
| Chair sticker, hand card | **45mm** (1.77in) | 36.22mm | 1.098mm | 1.2 ft |
| Generous chair sticker | **60mm** (2.36in) | 48.29mm | 1.463mm | 1.6 ft |
| Table sign / tent card | **115mm** (4.53in) | 92.56mm | 2.805mm | 3.0 ft |
| Event signage, A-frame | **180mm** (7.09in) | 144.88mm | 4.390mm | 4.8 ft |

**Do not go below 30mm.** Measured 2026-07-31 on `chair` in frame style: 25mm failed 1 of 42 positions and 28mm failed 2 of 30, while 30mm and up passed cleanly. That boundary is why the warn line sits at 0.75mm per module rather than the 0.50mm a spec sheet would suggest.

Figures are for the **frame** style with the current 33×33 symbol. `plain` fits the same symbol in a shorter piece, so it reads from the same distance at a smaller finished height. Re-run the script for exact numbers — it prints them every time, and they shift if a longer slug pushes the symbol to a bigger QR version.

## The three guards

**1. X-dimension (one module's width).** Warns under **0.75mm**, refuses under **0.33mm**. The warn line is set where the gate was measured to start rejecting, not at a textbook figure — a warning that stays quiet right up until the build fails anyway reads as a broken tool rather than a code that is too small.

**2. Quiet zone.** Four modules of clear space on all sides, ISO minimum, never less. Crop marks are drawn in the gutter, outside the trim box, so a cut line never intrudes on it. On a sheet, the neighbouring artwork is the thing most likely to eat a quiet zone — which is why pieces are never butted against each other.

**3. Decode, on the rasterised PDF.** The PDF that goes to the printer is rendered at 400 DPI and **every position is cropped out and decoded on its own**. A sheet where one of sixty-three positions is broken looks identical to a perfect one.

### When some positions fail and others don't

That is the signature of a **marginal size, not broken artwork**. Measured 2026-07-31: a 19mm card sheet failed 1 of 63 positions at 400 DPI and passed all 63 at 1200 DPI. One module was 7.29 pixels at 400 DPI — not a whole number, so sub-pixel placement differs per position and one landed badly.

400 DPI is a deliberate stand-in for a mid-range printer. If `--gate-dpi=1200` passes and 400 fails, **the fix is to go wider**, not to raise the gate. Note the warn line and the decode gate agreed independently in that case: 0.463mm was already under the 0.50mm comfort line.

## The last gate is physical, and it is not optional

**Software decoding is necessary and not sufficient.** `jsQR` has accepted an inverted code and a low-contrast one, both of which our own design rules forbid. Before ordering any volume:

1. Print one sheet **at 100% scale** — no "fit to page", which silently shrinks the module below the floor.
2. Scan it with **three phones, including one at least three years old**. Older camera stacks and older Android decoders are the ones that fail.
3. At the **intended distance**, indoors and in daylight.
4. On the **actual stock**. Gloss laminate throws glare that matte does not; a curved chair rail is not a flat sheet.

One thing to watch on press: the finder eyes carry an **orange hub** (`#E8572A`), whose luminance sits near the middle of the range a scanner thresholds on. It has passed every test so far — and measurement says the eyes are the *strong* part of this design, not the weak part — but the hub is the element most likely to drift on cheap CMYK or uncoated stock. If a print run scans worse than the proof, look there first. `--style=plain` is not the fallback; the hub is in both.

## What the module fill is, and why it is not 0.88

The data modules are rounded dots that fill **0.94** of their cell. That number is load-bearing and was 0.88 until 2026-07-31.

At 0.88 the artwork sat on a cliff. `--style=plain` failed to decode on **all four** live slugs, and `chair` failed even in frame style — the result flipped with the style, the slug, and the render resolution. The original sweep recorded in the spec concluded 0.88 was safe, but it had only ever looked at the framed style, where the cream tile's extra light surround was quietly carrying it.

Swept again across four slugs and both styles: everything from 0.92 to 0.98 passes, so 0.94 sits mid-band. The dot grows by three hundredths of a module and the corner radius is unchanged, which is invisible at print size.

**Nothing already printed was invalidated.** The encoded URL never changed; a reprint simply carries slightly fuller dots. This is principle 5 doing its job — a treatment is welcome right up to the point it costs decode margin, and then it loses.

## Rules that do not bend

- **Dark modules on a light field. Always.** Inverted codes read on many modern phones and fail on older Android cameras, and we cannot choose which phone a donor is holding. Where a dark layout needs a code, the code sits on a light tile inside it — that is what the cream tile is for.
- **Never render the SVG with ImageMagick.** Its renderer mangles modules badly enough to stop even an unbranded code decoding, and you will spend an hour blaming a design that is fine. The pipeline renders through a browser for exactly this reason.
- **A slug is printed matter.** Never reused, never deleted. Retire it in `/admin/qr` and mint a new one; the retired code keeps redirecting forever.
- **Print the URL nowhere.** The code encodes `adapttolife.org/q/<slug>`, and the destination behind it is data. That is the whole point: nothing on paper ever has to change.
