#!/usr/bin/env python3
"""Build the hero mosaic panels from the Drive "Favorites" set.

Run:  /home/agentos/.venvs/vectorize/bin/python scripts/build-hero-panels.py
In:   .work/fav/JLA_*.jpg   (My Drive / Work / Adapt To Life / Marketing /
                             Content / Pictures of Athletes / Pickleball_1 / Favorites)
Out:  public/images/hero/panels/*.webp  +  panels.json

This is the other half of the header, and it is a different problem from the
cut-outs in build-hero-cutouts.py. A cut-out needs a matte; a panel needs a
CROP, and the crop is the whole job — a collage of badly framed rectangles
reads as a Pinterest board no matter how good the shadows are.

Three rules the crops follow:

 1. ONE SUBJECT PER PANEL, filling it. These are 5504x8256 frames with a lot of
    gym in them. Every panel is cropped to the athlete and nothing else, so at
    200px wide on a phone there is still something to see.
 2. FACES SIT HIGH. Portrait panels crop from the top third, not the centre,
    because a centred crop of a standing-height frame lands on somebody's
    chest.
 3. SIZE FOLLOWS DEPTH, NOT IMPORTANCE. A panel that renders blurred at 30%
    brightness behind two others does not need 800 device pixels. Front panels
    get 860, mid 560, back 340 — which is what keeps twelve photographs inside
    a hero budget that was set for five.

Everything is graded to a single monochrome curve. The orange in this header is
environment — glow behind the panels, warm rim on their edges — never a tint on
a photograph, so the athletes stay in the same black and white the rest of the
site uses.
"""
import json
import os
import sys

import numpy as np
from PIL import Image, ImageEnhance

SRC = os.path.join(os.path.dirname(__file__), "..", ".work", "fav")
DST = os.path.join(os.path.dirname(__file__), "..", "public", "images", "hero", "panels")

# Long edge in device pixels, by depth role. See rule 3.
SIZE = {"front": 860, "mid": 560, "back": 340}
QUALITY = {"front": 80, "mid": 76, "back": 70}

# name, source frame, aspect (w/h), vertical anchor (0 = top, 1 = bottom),
# horizontal anchor, ZOOM, depth role
#
# The anchors and zooms were set by eye against the contact sheet, one panel at
# a time. There is no gravity setting that frames twenty-five photographs.
#
# ZOOM is the fraction of the largest valid crop to take: 1.0 fills the frame,
# 0.5 is a tight punch-in. The first pass had no zoom and it showed — the wide
# frames kept their whole half of the gym, so at 340px in the back row the
# athlete was about eleven pixels tall and the panel read as grey texture.
PANELS = [
    # --- portraits: the faces that carry the wall ------------------------------
    ("smile-close",  "JLA_6106.jpg", 3/4,  0.34, 0.50, 0.92, "front"),
    ("seated",       "JLA_5973.jpg", 3/4,  0.46, 0.50, 0.90, "mid"),
    ("laugh",        "JLA_6143.jpg", 3/4,  0.30, 0.52, 0.88, "mid"),
    ("grin",         "JLA_6073.jpg", 3/4,  0.40, 0.50, 0.80, "mid"),
    ("shout",        "JLA_6074.jpg", 3/4,  0.38, 0.50, 0.78, "back"),
    ("brian",        "JLA_6045.jpg", 4/5,  0.42, 0.46, 0.86, "front"),
    ("whitecap",     "JLA_6077.jpg", 3/4,  0.36, 0.50, 0.82, "mid"),

    # --- action: the reason any of it matters ---------------------------------
    ("forehand",     "JLA_5945.jpg", 3/2,  0.42, 0.60, 0.58, "front"),
    ("dink",         "JLA_5922.jpg", 3/4,  0.44, 0.50, 0.94, "front"),
    ("reach",        "JLA_5920.jpg", 3/4,  0.48, 0.50, 0.86, "mid"),
    ("swing",        "JLA_6066.jpg", 3/4,  0.42, 0.50, 0.84, "mid"),
    ("net",          "JLA_6084.jpg", 3/2,  0.46, 0.46, 0.76, "mid"),
    ("close-dink",   "JLA_5883.jpg", 3/4,  0.42, 0.46, 0.90, "back"),
    ("serve",        "JLA_6224.jpg", 4/3,  0.48, 0.52, 0.66, "back"),

    # --- the room: wide frames that give the wall its depth -------------------
    ("court",        "JLA_5905.jpg", 3/2,  0.32, 0.46, 0.60, "back"),
    ("rally",        "JLA_5918.jpg", 3/2,  0.30, 0.62, 0.62, "back"),
    ("pair",         "JLA_6127.jpg", 3/4,  0.48, 0.50, 0.80, "mid"),
    ("two-up",       "JLA_6122.jpg", 3/4,  0.44, 0.50, 0.84, "back"),
    ("lobby",        "JLA_6191.jpg", 3/4,  0.46, 0.48, 0.70, "back"),
]

# The banner variant is a row of TALL COLUMNS, roughly 1:2. Reframing a 3:4
# panel into that with object-fit:cover crops the middle out of it and lands on
# a torso — the first cut of variant E was seven photographs of nobody's face.
# A column needs its own crop, so it gets one: same frames, same grade, an
# aspect that matches the hole it goes in.
BANNER = [
    ("bn-swing",  "JLA_6066.jpg", 0.42, 0.40, 0.50, 0.62, "mid"),
    ("bn-smile",  "JLA_6106.jpg", 0.42, 0.36, 0.50, 0.70, "front"),
    ("bn-dink",   "JLA_5922.jpg", 0.42, 0.46, 0.50, 0.78, "front"),
    ("bn-white",  "JLA_6077.jpg", 0.42, 0.40, 0.50, 0.66, "mid"),
    ("bn-grin",   "JLA_6073.jpg", 0.42, 0.44, 0.50, 0.66, "mid"),
    ("bn-brian",  "JLA_6045.jpg", 0.42, 0.44, 0.46, 0.90, "front"),
    ("bn-seated", "JLA_5973.jpg", 0.42, 0.48, 0.50, 0.72, "mid"),
    ("bn-reach",  "JLA_5920.jpg", 0.42, 0.48, 0.50, 0.70, "back"),
]


def mono(im):
    """One curve for every panel, so the wall reads as one photograph.

    Straight desaturation leaves gym light flat and grey. This lifts contrast a
    little, pulls the black point down so the panels can sit on a near-black
    field without a visible edge, and holds the highlights back off pure white
    so nothing punches a hole in the composition.
    """
    g = im.convert("L")
    a = np.asarray(g, np.float32) / 255.0
    a = np.clip((a - 0.045) / 0.925, 0, 1)      # black point
    a = np.power(a, 1.04)                        # very slight S
    a = a * 0.945 + 0.012                        # highlight ceiling, shadow floor
    g = Image.fromarray((a * 255).astype(np.uint8))
    out = ImageEnhance.Contrast(g.convert("RGB")).enhance(1.08)
    return out


def crop_to(im, aspect, ay, ax, zoom=1.0):
    """Crop to `aspect` at `zoom`, centred on (ax, ay) as far as the frame
    allows. Anchors are fractions of the ORIGINAL frame, so they survive a
    change of output size."""
    w, h = im.size
    if w / h > aspect:                 # too wide: take a vertical slice
        nw, nh = h * aspect, h
    else:                              # too tall: take a horizontal band
        nw, nh = w, w / aspect
    nw, nh = int(nw * zoom), int(nh * zoom)
    x = max(0, min(w - nw, int(ax * w - nw / 2)))
    y = max(0, min(h - nh, int(ay * h - nh / 2)))
    return im.crop((x, y, x + nw, y + nh))


def main():
    os.makedirs(DST, exist_ok=True)
    manifest, total = {}, 0
    for name, src, aspect, ay, ax, zoom, role in PANELS + BANNER:
        path = os.path.join(SRC, src)
        if not os.path.exists(path):
            sys.exit(f"missing favourite: {path}\n"
                     "Drive folder 1XZvrgQSsPS_DEGpxOuldHgkJSU_m5w72. .work/ is out of git.")
        im = Image.open(path)
        im.draft("RGB", (im.width // 2, im.height // 2))   # 8k JPEGs, decode at half
        im = im.convert("RGB")
        im = crop_to(im, aspect, ay, ax, zoom)
        long_edge = SIZE[role]
        if aspect >= 1:
            size = (long_edge, round(long_edge / aspect))
        elif aspect <= 0.55:
            # a 1:2 column sized by its long edge would be twice the pixels of
            # every other panel for the same on-screen width
            w = round(long_edge * 0.62)
            size = (w, round(w / aspect))
        else:
            size = (round(long_edge * aspect), long_edge)
        im = im.resize(size, Image.LANCZOS)
        im = mono(im)
        out = os.path.join(DST, f"{name}.webp")
        im.save(out, "WEBP", quality=QUALITY[role], method=6)
        n = os.path.getsize(out)
        total += n
        manifest[name] = {"w": im.size[0], "h": im.size[1], "role": role, "src": src}
        print(f"{name:14s} {role:5s} {im.size[0]:4d}x{im.size[1]:<4d} {n/1024:6.1f} KB   {src}")
    with open(os.path.join(DST, "panels.json"), "w") as f:
        json.dump(manifest, f, indent=1, sort_keys=True)
    print(f"{'TOTAL':14s} {len(PANELS)} panels {'':10s} {total/1024:6.1f} KB")


if __name__ == "__main__":
    main()
