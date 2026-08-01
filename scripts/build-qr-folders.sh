#!/usr/bin/env bash
# Build the per-code folder tree for Drive: one folder per physical surface,
# each with its artwork, a print-ready PDF at the size we recommend, and a
# spec sheet written for whoever runs the press.
set -euo pipefail
cd /home/agentos/pw
rm -rf qr-tree && mkdir -p qr-tree

emit() {
  local slug="$1" size="$2" name="$3" surface="$4" distance="$5"
  local dir="qr-tree/$name"
  mkdir -p "$dir"
  ATL_QR_OUT=/home/agentos/pw/qrout node make-qr-sheet.mjs "$slug" \
      --size="${size}mm" --copies=1 --sheet=fit --margin=6mm >/dev/null
  cp "qrout/print/sheet-${slug}-${size}mm-fit.pdf" "$dir/${slug}-${size}mm-PRINT.pdf"
  for v in frame-bw plain-bw frame-brand; do
    cp "qr-archive/${slug}-${v}.svg" "$dir/" 2>/dev/null || true
    cp "qr-archive/${slug}-${v}.png" "$dir/" 2>/dev/null || true
  done
  local mod
  mod=$(python3 -c "print(f'{${size}/41:.3f}')")
  cat > "$dir/PRINT-SPEC.txt" <<SPEC
ADAPT TO LIFE — ${name^^}
Encodes: https://adapttolife.org/q/${slug}

WHERE IT GOES
${surface}

THE POINT
The destination behind this code is data we control. It can be changed at any
time at adapttolife.org/admin/qr WITHOUT REPRINTING ANYTHING. Do not encode a
different URL, and do not "simplify" it to a direct link — that would weld
every printed copy to one destination forever, which is the exact problem this
system exists to solve.

SIZE
  Recommended: ${size} mm wide  (about ${mod} mm per module)
  Reads from:  roughly ${distance}
  Never below 30 mm wide for the framed version.
  Scale both directions together. Never stretch it.

WHICH FILE
  ${slug}-frame-bw.svg     default. Black and white, SCAN TO GIVE caption.
  ${slug}-plain-bw.svg     code only, no caption. For tight spaces.
  ${slug}-frame-brand.svg  cream and orange. Full-colour printing only.
  ${slug}-${size}mm-PRINT.pdf   press-ready at the recommended size.
  Use SVG or the PDF for anything printed. PNGs are proofs only.

RULES
  Dark code on a light background, always. Never invert it, never recolour it,
  never put it on a busy photo.
  Keep clear space around it — at least the width of one big corner square.
  Before a large run, print one at 100% scale (not "fit to page") and scan it
  with a few phones including an old one.
SPEC
  echo "  built  $name"
}

emit chair   45  "Chair sticker"  "Stickers on athletes' chairs and equipment. Read from about a foot away." "1.2 ft"
emit sign    180 "Event signage"  "Banners, A-frames and table signs at tournaments. Read across a room."     "4.8 ft"
emit card    45  "Hand card"      "Printed cards handed out courtside."                                        "1.2 ft"
emit popcorn 60  "Popcorn drive"  "Anything promoting the current Double Good drive."                          "1.6 ft"
