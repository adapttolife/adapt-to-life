#!/usr/bin/env python3
"""Build the environment background plates.

Run:  /home/agentos/.venvs/vectorize/bin/python scripts/build-env-plates.py
In:   assets/photos/environment/*.jpg   (masters; lossless PNG originals live in
                                         Drive / Website Photos / 03 Backgrounds)
Out:  public/images/env/*.webp  +  data/env-plates.json

WHY THIS EXISTS. The 32 photographs on this site are all PORTRAITS — every one
of them a person. There is not one room, one empty court, one piece of negative
space in the set, which is why every attempt at a photographic backdrop here
failed: faded far enough not to fight the type it turns to grey mush, left
legible enough to read it competes with the words. These ten frames are the
missing category. No people, nothing to compete with a headline.

TWO RULES, and they are the whole file:

 1. THE PLATE IS SIZED BY WIDTH, NEVER BY COVER. The consumer sets
    `background-size: 100% auto`, so the rendered height follows the aspect
    ratio at every viewport and distortion is impossible by construction. That
    is the actual fix for the squashed mobile background — not a better
    background-position, which cannot help once `cover` has already picked the
    wrong axis to scale on.
 2. SO EVERY BREAKPOINT NEEDS ITS OWN CROP. Sizing by width means a 3:2 frame
    is a thin strip on a phone. The tall plate is a real 3:4 crop of the same
    photograph, not the same file squeezed, so the phone gets a composition
    rather than a letterbox.

NO GRADING. The masters already measure mean L 44 / stdev 42 against a library
mean of 50.7 / 43.3 — they are in register as shot. Alec asked twice for more
colour and once not to overcorrect, and a plate that is about to sit under a
0.55-to-opaque scrim does not need a curve on top of that. The scrim is the
grade.
"""
import json, hashlib, os, sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC  = os.path.join(ROOT, "assets/photos/environment")
OUT  = os.path.join(ROOT, "public/images/env")

# The floodlight in the dusk frame sits top-LEFT; the warm bloom this site
# carries — .dir-stats::before, and the hero it was taken from — sits top-RIGHT
# at 82% 18%. Mirrored, the two become one light source instead of two. The
# frame has no text or badge in it, so the flip costs nothing.
PLATES = {
    "court-dusk": {
        "master": "env-court-dusk-wide.jpg",
        "flip":   True,
        # after the flip the floodlight is on the right, so the portrait crop is
        # taken from the right half: light, net and wet reflections all in frame.
        "wide":   {"size": (1920, 1280)},
        # 0.8, not 1.0. Flush right holds the floodlight but pushes the net
        # post off the frame, and a court with no net in it is just wet tarmac.
        # At 0.8 the glow sits in the top-right corner and the post lands about
        # a quarter in — both signals, one frame.
        "tall":   {"crop": 0.8, "ar": (3, 4), "size": (900, 1200)},
    },
}
Q = 72   # heavily scrimmed; 72 holds the wet-asphalt speculars without banding


def crop_ar(im, ar, anchor):
    """anchor is a fraction of the available slack: 0 = flush left, 1 = flush
    right. It is a float rather than a keyword because the useful crop here is
    neither centred nor flush — see the note on the tall plate."""
    w, h = im.size
    tw = int(round(h * ar[0] / ar[1]))
    if tw > w:                      # source too narrow: crop height instead
        th = int(round(w * ar[1] / ar[0]))
        top = (h - th) // 2
        return im.crop((0, top, w, top + th))
    x = int(round((w - tw) * anchor))
    return im.crop((x, 0, x + tw, h))


def main():
    os.makedirs(OUT, exist_ok=True)
    manifest, total = {}, 0
    for name, spec in PLATES.items():
        mp = os.path.join(SRC, spec["master"])
        if not os.path.exists(mp):
            sys.exit(f"missing master: {mp}")
        base = Image.open(mp).convert("RGB")
        if spec.get("flip"):
            base = base.transpose(Image.FLIP_LEFT_RIGHT)
        for variant in ("wide", "tall"):
            v = spec.get(variant)
            if not v:
                continue
            im = base
            if v.get("ar"):
                im = crop_ar(im, v["ar"], v.get("crop", 0.5))
            im = im.resize(v["size"], Image.LANCZOS)
            buf = os.path.join(OUT, f".{name}-{variant}.tmp.webp")
            im.save(buf, "WEBP", quality=Q, method=6)
            with open(buf, "rb") as fh:
                digest = hashlib.sha256(fh.read()).hexdigest()[:8]
            final = f"{name}-{variant}.{digest}.webp"
            # drop older hashes of this same plate so public/ does not accrete
            for old in os.listdir(OUT):
                if old.startswith(f"{name}-{variant}.") and old != final:
                    os.remove(os.path.join(OUT, old))
            os.replace(buf, os.path.join(OUT, final))
            sz = os.path.getsize(os.path.join(OUT, final))
            total += sz
            manifest[f"{name}-{variant}"] = {
                "file": f"/images/env/{final}",
                "w": v["size"][0], "h": v["size"][1], "bytes": sz,
            }
            print(f"{name}-{variant:5} {v['size'][0]}x{v['size'][1]:<5} {sz/1024:6.1f}KB  {final}")
    with open(os.path.join(ROOT, "data/env-plates.json"), "w") as fh:
        json.dump(manifest, fh, indent=2, sort_keys=True)
        fh.write("\n")
    print(f"total {total/1024:.1f}KB -> data/env-plates.json")


if __name__ == "__main__":
    main()
