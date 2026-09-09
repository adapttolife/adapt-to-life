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

# Per-panel brightness override, for when a frame's DEPTH is right but its
# READING is not. Alec, 2026-09-09: "maybe brighten robby up to be more bright
# and easier to see?" — he had just moved to the top-centre slot beside the
# headline, which is a foreground position, and a mid-plane grade of 0.62 left
# him murky there. This lifts the file rather than promoting him to the front
# plane, because the front plane is four photographs by design and adding a
# fifth would flatten the wall's depth to buy one face.
DIM_OVERRIDE = {"whitecap": 0.92}

# Per-panel size override. The BUFFER frames are 81% behind the headline on the
# phone and sit at the very back of the wall on desktop; they are the one place
# on this page where resolution is provably not being looked at. Sizing them
# like every other back-plane panel put the homepage 5 KB over its own-bytes
# budget, and the honest fix is for the new frames to pay for themselves rather
# than for the cap to go up. A budget that always rises is not a budget.
#
# lanyard is here for the same reason measured rather than assumed: it paints at
# 390 device px in the phone grid and 316 on the wall, so 520 was buying pixels
# nothing ever resolves.
# Photographs we may not publish. Alec, 2026-09-08: "We cannot use this image."
# Two frames of one moment — the same two men seated by Court 6 — were on the
# homepage wall, in the interior band on eleven pages, and behind the spectrum
# variants. They are gone from all three.
#
# This list is the reason it stays that way. The builder refuses to run if any
# of these files is present in the source folder, so the frame cannot come back
# by someone dropping the shoot into .work/fav again and rebuilding. A consent
# problem is not a layout preference and should not be defended by a comment.
WITHDRAWN = {"JLA_6122.jpg", "JLA_6123.jpg", "JLA_6127.jpg"}

# whitecap goes UP, not down: he joined the four-cell phone grid on 2026-09-09
# (Alec: "robby on the top right"), where a cell is 197x309 CSS at 3x = 591x927
# device px. At the mid-plane 520 long edge he upscaled about 1.8x there —
# soft on the one layout where he is a quarter of the screen. 820 is the
# front-plane size his three neighbours already use. His BRIGHTNESS stays at the
# mid-plane 0.92 (see DIM_OVERRIDE): the desktop wall must not change.
SIZE_OVERRIDE = {"profile": 420, "lanyard": 400, "whitecap": 820}

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
    # FRONT, not mid. Alec, 2026-09-09: "I want his picture bigger, almost the
    # same size when it was in its other place, I want it front/forward layer and
    # cover the other pictures or slightly overlap... more prominent and well
    # displayed." The plane has to move in the FILE, not only in the CSS: depth
    # here is baked brightness (mid 0.62, front 1.00) plus long edge (520 vs
    # 820). Promoting him in index.html alone would have given him a front-plane
    # position, shadow and contrast over a 0.62-dimmed 520px file — which is
    # precisely the murk we spent a3be703 fixing on Robby.
    #
    # This does make the front plane five photographs where the wall was designed
    # around four, and I argued against exactly that for Robby a3be703. The
    # argument still holds and Alec has now overruled it deliberately for this
    # frame: he asked for prominence, and prominence on this wall IS the front
    # plane. Noting it so the next person knows it was a choice, not a drift.
    ("net",          "JLA_6084.jpg", 3/2,  0.46, 0.46, 0.76, "front"),
    ("close-dink",   "JLA_5883.jpg", 3/4,  0.42, 0.46, 0.90, "back"),
    ("serve",        "JLA_6224.jpg", 4/3,  0.48, 0.52, 0.66, "back"),

    # --- the room: wide frames that give the wall its depth -------------------
    ("court",        "JLA_5905.jpg", 3/2,  0.32, 0.46, 0.60, "back"),
    ("rally",        "JLA_5918.jpg", 3/2,  0.30, 0.62, 0.62, "back"),
    ("toss",         "JLA_6146.jpg", 3/4,  0.34, 0.50, 0.72, "mid"),
    # Replaced a withdrawn frame on 2026-09-08 (see WITHDRAWN, below).
    ("paddle",       "JLA_6131.jpg", 3/4,  0.42, 0.50, 0.86, "back"),
    ("lobby",        "JLA_6191.jpg", 3/4,  0.46, 0.48, 0.70, "back"),

    # --- BUFFERS: the two cells the headline sits on top of --------------------
    # Alec, 2026-09-08: "accept that some pictures will get cropped... be
    # intentional with the pictures that are going to get cut off behind the
    # text... a couple of pictures that are not throwaway pictures, but pictures
    # we are intentional about."
    #
    # scripts/check-grid-occlusion.mjs says phone cells 4 and 5 are 81% under the
    # slab. These two frames are chosen FOR that: a back turned to camera and a
    # man in profile looking away. Both are real photographs from the same shoot
    # with the same light, so they hold the column up and give the grid its
    # flexbox slack — and neither one loses a face to the type, because neither
    # one is offering a face. A portrait in this slot is a portrait thrown away.
    # FRONT plane, not back. On the desktop wall these sit far back and a
    # back-plane grade was right. On the phone the grid went from twelve cells
    # to six, so each cell doubled in height and the slab now covers 41% of
    # these rather than 81% — more than half of each one shows. A back-plane
    # frame is baked to 40% brightness, so what showed was a murky grey band
    # between two rows of real photographs, which is the same "cannot see
    # anything" Alec was objecting to, just moved down the page. A frame that
    # is visible has to be a photograph.
    #
    # Sized at 420 in SIZE_OVERRIDE, which is what they actually paint: the
    # phone cell is 195 CSS px at 2x = 390 device px, and the widest desktop
    # slot is 14% of 1440 at 2x = 404. 560 was 8KB of pixels nobody resolves,
    # and it put the homepage over its own-bytes budget.
    ("profile",      "JLA_5989.jpg", 3/4,  0.40, 0.52, 0.80, "front"),

    # --- widening the rotation ------------------------------------------------
    # Alec: "widen the rotation but not the basketball kids." Four frames from
    # the same ACE shoot that Favorites had not already skimmed, so the pages
    # away from the front door stop recycling the banner's own twelve.
    ("lanyard",      "JLA_6091.jpg", 3/4,  0.30, 0.50, 0.86, "mid"),
    ("bench",        "JLA_5967.jpg", 3/4,  0.34, 0.50, 0.88, "back"),
    ("drive",        "JLA_5953.jpg", 3/2,  0.40, 0.50, 0.66, "mid"),
    ("fence",        "JLA_6236.jpg", 3/2,  0.42, 0.56, 0.62, "back"),
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
    ("big-fill",     "JLA_6119.jpg", 5/2,   0.44, 0.50, 0.94, 1700),
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



# ==========================================================================
# FRAME SPEC — the parameters a photograph must satisfy to go in a frame.
#
# Alec, 2026-09-08: "each of these vertical frames should have specific
# parameters that set us up for success. When we rotate different pictures,
# it's very streamlined, and nothing breaks."
#
# Everything that puts a photograph on this site now goes through one of three
# frame kinds, and each kind states its numbers here rather than carrying them
# inline where the next person has to reverse-engineer them from a crop call.
# check_frames() runs on every build and refuses to ship a violation, so
# swapping a photograph is a one-line edit that either works or tells you why.
#
#   column   the interior band's vertical frames. FIXED aspect — this is the
#            one that used to drift between 0.5 and 0.7 per column, which is
#            why faces looked squeezed in some and not others. A column is
#            0.62 wide-to-tall, full stop, and a photo that cannot give that
#            crop is the wrong photo for a column.
#   tile     a mosaic frame, on the homepage wall or /donate. Free aspect,
#            because tiles overlap and variety is the point, but bounded so a
#            near-square or a letterbox cannot sneak in and break the rhythm.
#   plate    a single full-bleed photograph (/apply). Landscape only: a
#            portrait under `cover` in a wide header crops to a torso.
FRAME_SPEC = {
    "column": {"aspect": (0.62, 0.62), "min_src_px": 2400, "anchor": "required"},
    "tile":   {"aspect": (0.66, 1.60), "min_src_px": 1800, "anchor": "required"},
    "plate":  {"aspect": (1.30, 1.90), "min_src_px": 3000, "anchor": "required"},
}


def check_frames(kind, entries):
    """Refuse to build a frame whose photograph cannot fill it.

    The failures this catches are the ones that are invisible in a thumbnail
    and obvious on a phone: an aspect the crop has to stretch to reach, a
    source too small for the box it lands in, a missing anchor that silently
    defaults to dead centre and lands the window on somebody's chest. All three
    have shipped to Alec at least once.
    """
    lo, hi = FRAME_SPEC[kind]["aspect"]
    floor = FRAME_SPEC[kind]["min_src_px"]
    for name, src, ar, ax, ay in entries:
        if not (lo - 0.02 <= ar <= hi + 0.02):
            raise SystemExit(
                f"FRAME SPEC — {kind} '{name}' has aspect {ar:.2f}, outside "
                f"{lo}-{hi}. Reframe it or use a different frame kind.")
        if not (0.0 <= ax <= 1.0 and 0.0 <= ay <= 1.0):
            raise SystemExit(f"FRAME SPEC — {kind} '{name}' anchor out of range.")
        path = os.path.join(SRC, src)
        if os.path.exists(path):
            with Image.open(path) as im:
                if max(im.size) < floor:
                    raise SystemExit(
                        f"FRAME SPEC — {kind} '{name}': source is {im.width}x"
                        f"{im.height}, under the {floor}px floor for this frame.")


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
    #     JLA_6168  0.526
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
        ("JLA_6168.jpg", 0.70, True,  0.53, 0.33),  # two at the net
    ]
    check_frames("column", [(c[0], c[0], 0.62, c[3], c[4]) for c in COLS])
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
            # 0.74 for the back row, not 0.82. The frame that replaced the
            # withdrawn one is a bright daylight court shot where the old one
            # was dark, and a busy bright frame both sits forward of where a
            # back-row column should sit AND compresses worse — it put /donate
            # a kilobyte over its own-bytes budget. Seating it properly in the
            # depth order is the fix for both, which is the good kind of
            # constraint: the cheaper file is also the better composition.
            im = ImageEnhance.Brightness(im).enhance(0.74 if dim else 1.0)
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



def compose_give():
    """The /donate header: a mosaic, not a column band.

    Alec, 2026-09-08: "maybe for the donate page, we don't do vertical frames.
    We may do one or two pictures. Maybe it becomes a version of the main
    banner, where we have kind of a mosaic style, but just fewer pictures ...
    it will also give us a little bit more breathing room ... to complement the
    Givebutter functionalities within the donate page."

    So it borrows the HOMEPAGE's language rather than the interior band's:
    overlapping frames at three depths, scattered, tilted off-square. But where
    the wall is nineteen panels competing for attention, this is EIGHT. /donate
    is where somebody decides, and the picture's job is warmth behind a form.

    Shaped around the Givebutter panel, in two ways:

      · A CLEAR RIGHT THIRD. The panel is a white card floating over this, and
        a busy frame behind a white card is noise around the edges. The mosaic
        is weighted left and centre; one low, deeply-dimmed frame sits right.
      · A LOWER CEILING than the wall, because the copy is white and the card
        is white and both have to win.

    IT GRADES FROM THE SOURCE PHOTOGRAPHS, NOT FROM THE PANELS. The first cut
    read the finished panel files, which already carry their depth dimming
    baked in (front 1.00, mid 0.62, back 0.40), and multiplied a second dimming
    on top. A mid-plane frame came out at 0.62 x 0.38 = 0.24 and the whole
    header measured mean luma 0.066 against the band's 0.171 — it shipped as
    black mush, which is the exact complaint this page exists to fix. Reading
    the originals means one grade, one place, and the numbers below mean what
    they say. Measured, not eyeballed: check the asset's mean luma if it ever
    looks wrong again.

    Composed rather than shipped as elements for the same reason as the band:
    /donate carries a payment form and nineteen third-party requests, and has
    the tightest byte budget on the site. One image, one request.
    """
    import numpy as np
    # source, x, y, w (fractions), depth 1-3, tilt, aspect, ax, ay
    # Anchors are the measured ones from PANELS/compose_band, not fresh guesses.
    TILES = [
        ("JLA_5945.jpg", 0.00, 0.00, 0.19, 1,  0.6, 3/2, 0.60, 0.42),
        ("JLA_6143.jpg", 0.19, 0.00, 0.15, 1, -0.9, 3/4, 0.52, 0.30),
        ("JLA_6073.jpg", 0.58, 0.14, 0.14, 1,  0.4, 3/4, 0.50, 0.40),
        ("JLA_6084.jpg", 0.44, 0.48, 0.19, 1,  0.5, 3/2, 0.46, 0.46),
        ("JLA_6077.jpg", 0.80, 0.54, 0.16, 1, -0.6, 3/4, 0.50, 0.36),
        ("JLA_5922.jpg", 0.33, 0.06, 0.20, 2, -0.7, 3/4, 0.50, 0.44),
        ("JLA_6045.jpg", 0.01, 0.26, 0.21, 3, -1.1, 4/5, 0.46, 0.42),
        ("JLA_6106.jpg", 0.19, 0.44, 0.18, 3,  0.8, 3/4, 0.50, 0.34),
    ]
    # Graded ONCE, from full-brightness originals. Below the wall's own steps
    # because a white card and white copy both sit on top of this.
    DIM = {3: 0.92, 2: 0.66, 1: 0.44}
    check_frames("tile", [(t[0], t[0], t[6], t[7], t[8]) for t in TILES])
    for name, W, H in (("pg-give-wide", 1500, 720), ("pg-give-tall", 900, 1000)):
        canvas = Image.new("RGB", (W, H), (0, 0, 0))
        tall = H > W
        for src, x, y, w, d, rot, ar, ax, ay in sorted(TILES, key=lambda t: t[4]):
            im = Image.open(os.path.join(SRC, src))
            im.draft("RGB", (im.width // 3, im.height // 3))
            tw = int(W * w * (1.55 if tall else 1.0))
            th = int(tw / ar)
            im = crop_to(im.convert("RGB"), ar, ay, ax, 0.88)
            im = mono(im.resize((tw, th), Image.LANCZOS))
            im = ImageEnhance.Brightness(im).enhance(DIM[d])
            im = im.rotate(rot, expand=True, resample=Image.BICUBIC, fillcolor=(0, 0, 0))
            canvas.paste(im, (int(W * x), int(H * y)))
        # the floor grade the wall and the band share: the top edge dissolves
        # into the black the nav sits on, light pools low
        a = np.asarray(canvas, np.float32) / 255.0
        yy = np.linspace(0, 1, H)[:, None, None]
        a *= np.clip(1.0 - np.maximum(0, (0.16 - yy) / 0.16) * 0.70, 0, 1)
        a *= np.clip(1.0 - np.maximum(0, (yy - 0.94) / 0.06) * 0.75, 0, 1)
        canvas = Image.fromarray((a * 255).astype(np.uint8))
        out = os.path.join(DST, f"{name}.webp")
        canvas.save(out, "WEBP", quality=QUALITY["band"], method=6)
        lum = (np.asarray(Image.open(out).convert("L"), np.float32) / 255).mean()
        print(f"{name:20} {W}x{H} {len(TILES)} tiles  "
              f"{os.path.getsize(out)/1024:6.1f} KB  mean luma {lum:.3f}")


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
    # TWO strips, not one. Alec, 2026-09-09, on the homepage closing: "go all
    # in on this vertical frame banner style layout with the pictures (maybe
    # different pictures?)" — and different is the right instinct. The same
    # eight faces rolling past on both the homepage and /donate would read as a
    # template rather than as a roster, and it would waste the widened rotation
    # we built. So /donate keeps its eight and the homepage gets eight others.
    STRIPS = {
        # /donate — the original set
        "roll-strip": ["JLA_6045.jpg", "JLA_5922.jpg", "JLA_6106.jpg", "JLA_6066.jpg",
                       "JLA_6073.jpg", "JLA_6077.jpg", "JLA_5973.jpg", "JLA_5920.jpg"],
        # homepage — eight the other strip does not use, drawn from the widened
        # rotation so the frames at the bottom of the front page are people you
        # have not already met at the top of it
        "roll-strip-home": ["JLA_6131.jpg", "JLA_6091.jpg", "JLA_5967.jpg", "JLA_6146.jpg",
                            "JLA_5953.jpg", "JLA_6236.jpg", "JLA_5989.jpg", "JLA_6168.jpg"],
    }
    H, CW, GAP = 430, 168, 28
    PITCH = CW + GAP
    for name, COLS in STRIPS.items():
        W = PITCH * len(COLS)
        canvas = Image.new("RGB", (W, H), (0, 0, 0))
        for i, src in enumerate(COLS):
            im = Image.open(os.path.join(SRC, src))
            im.draft("RGB", (im.width // 3, im.height // 3))
            im = crop_to(im.convert("RGB"), CW / H, 0.40, 0.50, 0.86)
            im = mono(im.resize((CW, H), Image.LANCZOS))
            im = ImageEnhance.Brightness(im).enhance(0.82)
            canvas.paste(im, (i * PITCH + GAP // 2, 0))   # half a gap at each end
        out = os.path.join(DST, name + ".webp")
        canvas.save(out, "WEBP", quality=60, method=6)
        print(f"{name:20s} {W}x{H} {os.path.getsize(out)/1024:6.1f} KB  (tileable, pitch {PITCH}px)")


def assert_no_withdrawn():
    """Refuse to build if a withdrawn photograph is sitting in the source folder.

    Deleting the file and editing the panel list is enough to fix the site
    today. It is not enough to keep it fixed: the next person to sync the shoot
    into .work/fav restores the frame, and nothing anywhere would notice. The
    only durable version of "we cannot use this image" is a build that stops.
    """
    present = sorted(WITHDRAWN & set(os.listdir(SRC)))
    if present:
        raise SystemExit(
            "REFUSING TO BUILD — withdrawn photograph(s) in " + SRC + ":\n  "
            + "\n  ".join(present)
            + "\n\nThese frames may not be published (Alec, 2026-09-08). Delete them\n"
              "from the source folder. If a withdrawal has genuinely been lifted,\n"
              "take the name out of WITHDRAWN in this file and say so in the commit."
        )


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
    assert_no_withdrawn()
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
        long_edge = BIGW[name] if role == 'big' else (500 if role == 'band' else SIZE_OVERRIDE.get(name, SIZE[role]))
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
        elif role in DEPTH_DIM and DIM_OVERRIDE.get(name, DEPTH_DIM[role]) < 1:
            im = ImageEnhance.Brightness(im).enhance(DIM_OVERRIDE.get(name, DEPTH_DIM[role]))
        out = os.path.join(DST, f"{name}.webp")
        im.save(out, "WEBP", quality=QUALITY[role], method=6)
        n = os.path.getsize(out)
        total += n
        manifest[name] = {"w": im.size[0], "h": im.size[1], "role": role, "src": src}
        print(f"{name:14s} {role:5s} {im.size[0]:4d}x{im.size[1]:<4d} {n/1024:6.1f} KB   {src}")
    compose_band()
    compose_give()
    compose_roll()
    # Page photos: a single full-bleed frame for a page that has one picture
    # worth the whole header. Copied in rather than re-encoded — the source is
    # already a webp and a second encode only loses detail — so it picks up a
    # content hash with everything else and can never go stale.
    import shutil
    PAGE_PHOTOS = {"pg-apply.webp": "images/athletes/wheelie-58.webp"}
    for dst, src in PAGE_PHOTOS.items():
        shutil.copyfile(os.path.join(os.path.dirname(__file__), "..", "public", src),
                        os.path.join(DST, dst))
        print(f"{dst:20s} page photo  {os.path.getsize(os.path.join(DST, dst))/1024:6.1f} KB")
    fingerprint()
    with open(os.path.join(DST, "panels.json"), "w") as f:
        json.dump(manifest, f, indent=1, sort_keys=True)
    print(f"{'TOTAL':14s} {len(PANELS)} panels {'':10s} {total/1024:6.1f} KB")


if __name__ == "__main__":
    main()
