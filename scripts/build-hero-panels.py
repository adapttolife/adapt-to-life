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
import hashlib
import json
import os
import sys

import numpy as np
from PIL import Image, ImageEnhance, ImageFilter

SRC = os.path.join(os.path.dirname(__file__), "..", ".work", "fav")
DST = os.path.join(os.path.dirname(__file__), "..", "public", "images", "hero", "panels")

# Long edge in device pixels, by depth role. See rule 3.
# Sized so nothing UPSCALES. Measured on the live page: every back-plane panel
# was rendering 1.7-2.5x its own pixels AND carrying a 2.4px blur — soft twice
# over, and the inconsistency Alec could see. These are the sizes the wall
# actually paints at 1920 on a 2x display.
SIZE = {"front": 820, "mid": 520, "back": 560}
# Depth is BAKED into the file rather than applied in CSS, and that is what pays
# for the resolution: a pre-darkened frame compresses far better. Back plane at
# 560px pre-darkened costs 7.8 KB against 6.9 KB at 250px undarkened — 2.2x the
# pixels for under a kilobyte.
QUALITY = {"front": 68, "mid": 52, "back": 44, "big": 68, "band": 56}
DEPTH_DIM = {"front": 1.00, "mid": 0.62, "back": 0.40}

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


# Full-bleed single frames. The collage variants never need more than 860px
# because no panel is ever painted wider than that; a header that is ONE
# photograph does, and it is the only place in this build where a big file is
# the right answer. Quality is pushed down to compensate — at this size the
# grain in the source hides the difference and the budget does not.
BIG = [
    # name, source, aspect, vert anchor, horiz anchor, zoom, width
    ("big-forehand", "JLA_5945.jpg", 16/9,  0.44, 0.58, 0.80, 1900),
    ("big-reach",    "JLA_6084.jpg", 16/9,  0.42, 0.50, 0.86, 1900),
    ("big-ryan",     "JLA_5922.jpg", 3/4,   0.44, 0.50, 0.94, 1200),
    ("big-brian",    "JLA_6045.jpg", 16/9,  0.44, 0.46, 0.82, 1900),
    ("big-fill",     "JLA_6122.jpg", 5/2,   0.40, 0.50, 0.92, 1700),
]


# The interior page band. These render about 200px wide, are held at a third of
# their brightness behind a veil that is 60-96% black, and half of them are
# blurred. They do not need the banner columns' pixels, and shipping those cost
# /donate 450 KB and broke its own-bytes budget on the first rollout — the check
# caught it, which is exactly what it is for.
#
# Pre-darkened in the asset rather than only in CSS: a file that is already dark
# quantises to far fewer bytes at the same visible quality.
PGBAND = [
    ("pg-reach",  "JLA_5920.jpg"), ("pg-swing",  "JLA_6066.jpg"),
    ("pg-white",  "JLA_6077.jpg"), ("pg-brian",  "JLA_6045.jpg"),
    ("pg-seated", "JLA_5973.jpg"), ("pg-dink",   "JLA_5922.jpg"),
    ("pg-grin",   "JLA_6073.jpg"), ("pg-smile",  "JLA_6106.jpg"),
]
PGBAND_SRC = {n: s_ for n, s_ in PGBAND}


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


def compose_band():
    """The interior page band: one pre-composed strip of vertical columns.

    Alec, 2026-09-08, comparing the interior pages against variant 2: "I like
    the second version ... the vertical design I think looks great on the other
    pages." The first cut of this held the columns at a third of their
    brightness so the page's words could lead, and it went too far — the faces
    were barely there. The columns are close to full brightness now and the job
    of protecting the type moves entirely to the veil in page-header.css, which
    darkens the corner the words sit in rather than the whole picture. Same
    logic the homepage wall uses.

    It stays ONE image rather than eight <img> columns: the band never reflows,
    only crops, and shipping the columns individually cost /donate 450 KB and
    broke its own-bytes budget. Because the frame is still mostly black it
    compresses to a fraction of its parts.
    """
    import numpy as np
    # Alec, three times: "the pictures still look squeezed and squished."
    #
    # He was right and the reason was not distortion. Every column has been
    # cropped at exactly the aspect of its box since the stretch bug, and the
    # rendered strip matches the asset to 0.001 — checked end to end. What was
    # wrong is WHERE the crop was taken: ax=0.50 for every photograph, on the
    # assumption the athlete is centred. Run a human matte over these five and
    # they are not:
    #
    #     JLA_5884  subject centre 0.392      JLA_6071  0.381
    #     JLA_5904  0.544                     JLA_6105  0.486
    #     JLA_6123  0.615
    #
    # So a narrow frame cut into four of the five, which is exactly what
    # "squeezed" looks like. The anchors below are measured from those mattes,
    # not guessed, and ay is set from where each subject's head actually starts.
    #
    # Also: FEWER and TALLER. Four frames on desktop and two on a phone, each
    # around 0.5-0.7 aspect — real portrait proportions — and the band is tall
    # enough to fill most of the hero, because the black around it was the other
    # half of the complaint.
    COLS = [  # source, height share, back row, ax, ay  (ax/ay from the matte)
        ("JLA_5884.jpg", 0.74, True,  0.39, 0.20),  # reaching low for a dig
        ("JLA_6071.jpg", 1.00, False, 0.38, 0.33),  # grinning, whole chair
        ("JLA_6105.jpg", 0.88, False, 0.49, 0.23),  # laughing between points
        ("JLA_6123.jpg", 0.70, True,  0.62, 0.42),  # two at the net
    ]
    for name, W, H, n, pitch, cwf in (("pg-band-wide", 1500, 650, 4, 0.235, 0.205),
                                      ("pg-band-tall", 900, 805, 2, 0.460, 0.440)):
        canvas = Image.new("RGB", (W, H), (0, 0, 0))
        use = COLS if n == 4 else [COLS[1], COLS[2]]
        for i, (src, h, dim, ax, ay) in enumerate(use):
            im = Image.open(os.path.join(SRC, src))
            im.draft("RGB", (im.width // 3, im.height // 3))
            cw, ch = int(W * cwf), int(H * h)
            im = crop_to(im.convert("RGB"), cw / ch, ay, ax, 0.88)
            assert abs((im.width / im.height) - (cw / ch)) < 0.02, \
                f"{src}: cropped {im.width}x{im.height} for a {cw}x{ch} box"
            im = mono(im.resize((cw, ch), Image.LANCZOS))
            # No blur. It was there to push the back row into depth and it
            # reads as a bad photograph instead — Alec: "the picture all the way
            # to the right is way too blurry, I want these crisp and clear." A
            # small brightness step is enough to seat a frame behind another.
            im = ImageEnhance.Brightness(im).enhance(0.82 if dim else 1.0)
            x = int(W * (0.5 * (1 - n * pitch) + i * pitch + (pitch - cwf) / 2))
            canvas.paste(im, (x, H - ch))
        a = np.asarray(canvas, np.float32) / 255.0
        y = np.linspace(0, 1, H)[:, None, None]
        a *= np.clip(1.0 - np.maximum(0, (y - 0.92) / 0.08) * 0.85, 0, 1)
        canvas = Image.fromarray((a * 255).astype(np.uint8))
        out = os.path.join(DST, f"{name}.webp")
        # the band sits under a veil that is 30-96% black, so encoder artifacts
        # are invisible here in a way they are not on the homepage wall
        canvas.save(out, "WEBP", quality=54, method=6)
        print(f"{name:20s} {W}x{H} {n} frames  {os.path.getsize(out)/1024:6.1f} KB")


def compose_roll():
    """A TILEABLE strip for the rolling closing band.

    Alec wants variant 5's marquee as the last section before the footer on
    /donate. Two constraints shape this into one image rather than eight:

      · /donate's own-bytes budget is 125 KB and the page already sits at 123.
        Eight columns would break it instantly. One <img loading="lazy"> at the
        bottom of a long page is not fetched on load at all, so it costs the
        page nothing — which is the honest fix, not a budget raise.
      · A marquee has to LOOP. That means the image must tile: every column is
        the same width on the same pitch, and the gap at each end is HALF a gap,
        so column 8 meeting column 1 across the seam leaves exactly the same
        space as every other join. Get that wrong and the loop stutters once per
        cycle, which is the one thing people always notice.
    """
    COLS = ["JLA_6045.jpg", "JLA_5922.jpg", "JLA_6106.jpg", "JLA_6066.jpg",
            "JLA_6073.jpg", "JLA_6077.jpg", "JLA_5973.jpg", "JLA_5920.jpg"]
    H, CW, GAP = 430, 168, 28
    PITCH = CW + GAP
    W = PITCH * len(COLS)
    canvas = Image.new("RGB", (W, H), (0, 0, 0))
    for i, src in enumerate(COLS):
        im = Image.open(os.path.join(SRC, src))
        im.draft("RGB", (im.width // 3, im.height // 3))
        im = crop_to(im.convert("RGB"), CW / H, 0.40, 0.50, 0.86)
        im = mono(im.resize((CW, H), Image.LANCZOS))
        im = ImageEnhance.Brightness(im).enhance(0.82)
        canvas.paste(im, (i * PITCH + GAP // 2, 0))   # half a gap at each end
    out = os.path.join(DST, "roll-strip.webp")
    canvas.save(out, "WEBP", quality=60, method=6)
    print(f"{'roll-strip':20s} {W}x{H} {os.path.getsize(out)/1024:6.1f} KB  (tileable, pitch {PITCH}px)")


def fingerprint():
    """Rename every generated image to include a hash of its own bytes.

    public/_headers gives media a 30-day max-age and says, in as many words:
    "If you DO replace an image, rename it." I did not. I overwrote
    pg-band-wide.webp and pg-band-tall.webp at the same path on every iteration
    of this band, so Alec's browser held the FIRST version for a month and every
    fix I shipped was invisible to him. He told me four times that the frames
    still looked squished; he was looking at the same old bytes each time, and
    the file that documents the rule was in this repo the whole time.

    Content-hashed names make that impossible: change a pixel and the URL
    changes, so nothing can be stale and nothing has to be remembered.
    """
    manifest = {}
    for f in sorted(os.listdir(DST)):
        if not f.endswith(".webp") or "." in f[:-5]:
            continue                      # already fingerprinted
        raw = open(os.path.join(DST, f), "rb").read()
        h = hashlib.sha256(raw).hexdigest()[:8]
        stem = f[:-5]
        manifest[f] = f"{stem}.{h}.webp"
        os.replace(os.path.join(DST, f), os.path.join(DST, manifest[f]))
    # drop fingerprinted files that are no longer current
    keep = set(manifest.values())
    for f in os.listdir(DST):
        if f.endswith(".webp") and "." in f[:-5] and f not in keep:
            os.remove(os.path.join(DST, f))
    with open(os.path.join(DST, "hashes.json"), "w") as fh:
        json.dump(manifest, fh, indent=1, sort_keys=True)
    print(f"{'fingerprinted':20s} {len(manifest)} files -> hashes.json")


def main():
    os.makedirs(DST, exist_ok=True)
    manifest, total = {}, 0
    jobs = [(n, s_, a, y, x, z, r) for n, s_, a, y, x, z, r in PANELS + BANNER]
    # same frames and anchors as the banner columns, at band size
    bn = {n.replace("bn-", "pg-"): (s_, a, y, x, z) for n, s_, a, y, x, z, _r in BANNER}
    jobs += [(n, *bn[n][0:1], *bn[n][1:], "band") for n in PGBAND_SRC if n in bn]
    jobs += [(n, s_, a, y, x, z, "big") for n, s_, a, y, x, z, _w in BIG]
    BIGW = {n: w for n, _s, _a, _y, _x, _z, w in BIG}
    for name, src, aspect, ay, ax, zoom, role in jobs:
        path = os.path.join(SRC, src)
        if not os.path.exists(path):
            sys.exit(f"missing favourite: {path}\n"
                     "Drive folder 1XZvrgQSsPS_DEGpxOuldHgkJSU_m5w72. .work/ is out of git.")
        im = Image.open(path)
        im.draft("RGB", (im.width // 2, im.height // 2))   # 8k JPEGs, decode at half
        im = im.convert("RGB")
        im = crop_to(im, aspect, ay, ax, zoom)
        long_edge = BIGW[name] if role == 'big' else (500 if role == 'band' else SIZE[role])
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
        if role == 'band':
            im = ImageEnhance.Brightness(im).enhance(0.62)
        elif role in DEPTH_DIM and DEPTH_DIM[role] < 1:
            im = ImageEnhance.Brightness(im).enhance(DEPTH_DIM[role])
        out = os.path.join(DST, f"{name}.webp")
        im.save(out, "WEBP", quality=QUALITY[role], method=6)
        n = os.path.getsize(out)
        total += n
        manifest[name] = {"w": im.size[0], "h": im.size[1], "role": role, "src": src}
        print(f"{name:14s} {role:5s} {im.size[0]:4d}x{im.size[1]:<4d} {n/1024:6.1f} KB   {src}")
    compose_band()
    compose_roll()
    fingerprint()
    with open(os.path.join(DST, "panels.json"), "w") as f:
        json.dump(manifest, f, indent=1, sort_keys=True)
    print(f"{'TOTAL':14s} {len(PANELS)} panels {'':10s} {total/1024:6.1f} KB")


if __name__ == "__main__":
    main()
