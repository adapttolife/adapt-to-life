#!/usr/bin/env python3
"""Build the hero stage cut-outs from the Drive masters.

Run:  /home/agentos/.venvs/vectorize/bin/python scripts/build-hero-cutouts.py
Input:  .work/hero-src/*_Transparent.png   (the photographer's banner cut-outs)
Output: public/images/hero/cut-*.webp

Why this script exists rather than a one-off ImageMagick line:

1. The supplied cut-outs are BANNER OUTLINE mattes. The silhouette is correct,
   but the holes are not cut — the grey court between the wheel spokes and
   under the chair frame is still opaque. On a dark hero that renders as a pale
   rectangle behind the athlete's legs, and it is the single artefact that tells
   a viewer the picture is a collage.

2. The obvious fix is wrong. `hyperframes remove-background` (u2net_human_seg)
   produces a clean matte and deletes the wheelchair, because it is a human
   segmentation model. For these athletes the chair IS the athlete. Tried,
   rejected, recorded here so nobody tries it again.

3. So the court is keyed out of the supplied silhouette, and the key has to be
   per-photograph because the two front athletes sit in different chairs:

     - JLA_5922 (dink) rides a matte-black chair with white shoes. The court is
       the only large SMOOTH bright region, so components are judged on mean
       local standard deviation. The brightness ceiling exists to save his
       shoes, which are smoother and brighter than the floor.
     - JLA_5950 (forehand) rides a SILVER chair. Its rim and frame are as smooth
       and as bright as the court, so smoothness cannot discriminate. Extent
       does: keep only large components that reach the floor line.

4. Every figure gets a bottom alpha ramp. On the three waist crops it hides the
   cut so they can sit in the back row. On the two complete figures it removes
   the straight horizontal edge left by the source photograph's own bottom crop,
   so the chairs sink into the hero's floor instead of standing on a ruled line.

5. Output heights are set by what the composition actually paints — the back row
   never exceeds ~300 CSS px and the front row never exceeds ~520 — so 700-1150
   device pixels covers a 2x display. The first cut shipped 1600px files for a
   260px figure: 1.1 MB of hero for no visible gain, on the page whose LCP this
   image is.
"""
import os
import sys

import numpy as np
from PIL import Image, ImageChops, ImageOps
from scipy.ndimage import (binary_closing, binary_dilation, binary_opening,
                           gaussian_filter, label, uniform_filter)

SRC = os.path.join(os.path.dirname(__file__), "..", ".work", "hero-src")
DST = os.path.join(os.path.dirname(__file__), "..", "public", "images", "hero")


def load(path):
    im = Image.open(path).convert("RGBA")
    im = im.crop(im.getbbox())
    alpha = im.getchannel("A")
    rgb = im.convert("L").convert("RGB")  # the whole stage is monochrome
    rgb.putalpha(alpha)
    return rgb


def local_sd(lum, win=9):
    m = uniform_filter(lum, win)
    m2 = uniform_filter(lum * lum, win)
    return np.sqrt(np.maximum(m2 - m * m, 0))


def key_court(im, mode, seat=0.50, lo=132, sd_win=44,
              min_frac=0.0035, comp_sd=20.0, lo_L=132, hi_L=200):
    """Knock the retained court out of a banner-outline matte."""
    a = np.asarray(im.getchannel("A"), np.float32) / 255.0
    lum = np.asarray(im.convert("L"), np.float32)
    h, w = lum.shape
    sd = local_sd(lum)

    cand = (lum > lo) & (sd < sd_win) & (a > 0.5)
    cand[: int(h * seat), :] = False
    cand = binary_closing(binary_opening(cand, np.ones((7, 7))), np.ones((9, 9)))

    lab, n = label(cand)
    court = np.zeros_like(cand)
    hits = []
    for i in range(1, n + 1):
        comp = lab == i
        frac = comp.sum() / (h * w)
        if frac < min_frac:
            continue
        if mode == "smooth":
            # Black chair: the court is the only large smooth bright thing.
            # Mean brightness alone does NOT save his white shoes — a shoe in
            # shadow averages inside the court's range. Its specular highlights
            # do not: the court tops out around 195 and a white shoe carries
            # pixels past 215, so the high percentile is the discriminator.
            if (sd[comp].mean() < comp_sd
                    and lo_L < lum[comp].mean() < hi_L
                    and np.percentile(lum[comp], 97) < 215):
                court |= comp
                hits.append(f"{frac*100:.2f}%/sd{sd[comp].mean():.0f}")
        else:  # "extent" — silver chair: smoothness is useless, reach is not
            rows = np.where(comp.any(1))[0]
            if frac > 0.010 and rows.max() > h * 0.93:
                court |= comp
                hits.append(f"{frac*100:.2f}%/floor")

    court = binary_dilation(court, np.ones((5, 5)))
    a = np.clip(a * gaussian_filter((~court).astype(np.float32), 1.6), 0, 1)
    im.putalpha(Image.fromarray((a * 255).astype(np.uint8)))
    return im, hits


def bottom_fade(im, frac):
    if not frac:
        return im
    w, h = im.size
    band = int(h * frac)
    ramp = ImageOps.invert(Image.linear_gradient("L").resize((w, band)))
    mask = Image.new("L", (w, h), 255)
    mask.paste(ramp, (0, h - band))
    im.putalpha(ImageChops.multiply(im.getchannel("A"), mask))
    return im


# TRACED — the second set, hand-traced by Alec on 2026-09-08 and dropped into
# the same Drive folder. These need none of the machinery above: the mattes are
# clean, the wheel spokes are actually cut, and the court is gone. Trim, grade,
# size, fade. They supersede the keyed versions for the stadium banner.
#
# Output heights are capped at each file's trimmed height — upscaling a cut-out
# shows on the edge before it shows anywhere else.
# Sizes and quality follow the depth the panel is composed at, same rule as
# everywhere else in this header: the two front figures carry the frame, the
# rest are seen through haze at half brightness and do not need the pixels.
TRACED = [
    ("Juan_Cutout_2.png",  "trace-juan.webp",   1100, 0.10, 80),
    ("traced-ryan.png",    "trace-ryan.webp",    950, 0.10, 80),
    ("traced-aubrey.png",  "trace-aubrey.webp",  700, 0.22, 74),
    ("traced-ben.png",     "trace-ben.webp",     620, 0.26, 74),
    ("traced-brian.png",   "trace-brian.webp",   560, 0.24, 72),
]

# src, dst, output height, bottom fade, court key mode
JOBS = [
    ("JLA_6084_Transparent.png",       "cut-net.webp",       700, 0.32, None),
    ("Brian_JLA_6045_Transparent.png", "cut-paddle.webp",    760, 0.28, None),
    ("JLA_6106_Transparent.png",       "cut-smile.webp",     780, 0.26, None),
    ("Juan_JLA_5950_Transparent.png",  "cut-forehand.webp", 1150, 0.11, "extent"),
    ("JLA_5922_Transparent.png",       "cut-dink.webp",     1150, 0.11, "smooth"),
]


def main():
    os.makedirs(DST, exist_ok=True)
    total = 0
    dims = {}
    for src, dst, height, fade, mode, q in (
            [(a, b, c, d, e, 84) for a, b, c, d, e in JOBS]
            + [(a, b, c, d, None, q) for a, b, c, d, q in TRACED]):
        path = os.path.join(SRC, src)
        if not os.path.exists(path):
            sys.exit(f"missing master: {path}\n"
                     "Masters live in Drive folder 1Si7S0r6Q8THasLVVDoomSsm1t_K8oZHo "
                     "→ 'JPG PNG and Transparent Cutouts'. .work/ is out of git.")
        im = load(path)
        hits = []
        if mode:
            im, hits = key_court(im, mode)
        w0, h0 = im.size
        im = im.resize((round(w0 * height / h0), height), Image.LANCZOS)
        im = bottom_fade(im, fade)
        out = os.path.join(DST, dst)
        im.save(out, "WEBP", quality=q, method=6)
        n = os.path.getsize(out)
        total += n
        dims[dst] = im.size
        print(f"{dst:20s} {im.size[0]:4d}x{im.size[1]:<5d} {n/1024:6.1f} KB"
              + (f"  court: {', '.join(hits)}" if hits else ""))
    print(f"{'TOTAL':20s} {'':11s} {total/1024:6.1f} KB")
    # build-hero-lab.mjs needs the intrinsic sizes for width/height attributes
    with open(os.path.join(DST, "dims.json"), "w") as f:
        import json
        json.dump({k: list(v) for k, v in dims.items()}, f, indent=1)


if __name__ == "__main__":
    main()
