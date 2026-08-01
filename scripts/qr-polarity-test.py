#!/usr/bin/env python3
"""Does the BLACK-BACKGROUND shirt code actually scan? Measured, not argued.

Alec asked for a black-background version of the shirt code on 2026-08-01. That
is an INVERTED symbol — light modules on a dark field — and the whole question
is which decoders will still read it. Folklore says "modern phones are fine";
this file replaces folklore with a table.

Reuses the shirt-capture simulation from qr-decoder-crosscheck.py, because a
flat clean render is not the thing we are shipping:
  perspective skew, cylindrical warp over a chest, scale computed from a real
  phone's field of view, defocus, fabric weave, and the contrast crush you get
  from black knit indoors.

Three decoders, chosen so the disagreement between them IS the finding:
  OpenCV                    independent implementation, attempts inversion
  ZXing (try_invert=True)   what a current phone camera stack does
  ZXing (try_invert=False)  what an older Android / ZXing-based scanner does

Run:
  ~/.venvs/qrtest/bin/python scripts/qr-polarity-test.py <light.png> <dark.png>
"""
import sys

import cv2
import numpy as np
import zxingcpp

URL = "https://adapttolife.org/q/shirt"
DET = cv2.QRCodeDetector()


# A 12MP phone: ~4000px across, ~65 deg horizontal field of view.
def px_across(distance_ft, code_in=10.0):
    d = distance_ft * 0.3048
    frame = 2 * d * np.tan(np.radians(65) / 2)
    return int(4000 * (code_in * 0.0254) / frame)


def cylinder(img, amount=0.16):
    """Bow the image as if wrapped over a chest."""
    h, w = img.shape[:2]
    xs, ys = np.meshgrid(np.arange(w, dtype=np.float32), np.arange(h, dtype=np.float32))
    nx = (xs - w / 2) / (w / 2)
    src_x = xs + (nx ** 2) * amount * (w / 2) * np.sign(nx) * -1
    return cv2.remap(img, src_x.astype(np.float32), ys, cv2.INTER_LINEAR,
                     borderMode=cv2.BORDER_REPLICATE)


def skew(img, deg=18):
    h, w = img.shape[:2]
    k = np.tan(np.radians(deg)) * 0.5
    src = np.float32([[0, 0], [w, 0], [w, h], [0, h]])
    dst = np.float32([[w * k, h * k * 0.35], [w, 0], [w * (1 - k * 0.15), h], [0, h * (1 - k * 0.2)]])
    return cv2.warpPerspective(img, cv2.getPerspectiveTransform(src, dst), (w, h),
                               borderMode=cv2.BORDER_REPLICATE)


def on_shirt(img, margin=0.35):
    """Put the print on black fabric, which is what a camera actually sees.

    Both variants get the SAME surround, and that is the point: for the white
    version the surround is contrast, for the black version it is continuous
    with the artwork, so the code has no outer edge at all. That difference is
    real and it belongs in the measurement rather than in an argument."""
    n = int(img.shape[0] * margin)
    return cv2.copyMakeBorder(img, n, n, n, n, cv2.BORDER_CONSTANT, value=28)


def capture(src, distance_ft, seed=7):
    """One photograph. `seed` varies the sensor noise ONLY.

    Near the range limit a single sample flips between ok and FAIL, so one
    seed is an anecdote and reporting it as a distance ceiling would be wrong.
    Everything above the limit passes on every seed; that is what makes the
    reliable range a real number rather than the best of one try."""
    img = on_shirt(src)
    img = cylinder(img)
    img = skew(img)
    n = max(40, px_across(distance_ft))
    img = cv2.resize(img, (n, n), interpolation=cv2.INTER_AREA)
    k = max(1, int(n * 0.006) * 2 + 1)
    img = cv2.GaussianBlur(img, (k, k), 0)
    # black knit reads ~18% grey, white plastisol ~88% — not 0 and 255.
    img = ((img.astype(np.float32) / 255 * (0.88 - 0.18) + 0.18) * 255).astype(np.uint8)
    rng = np.random.default_rng(seed)
    img = np.clip(img.astype(np.int16) + rng.normal(0, 7, img.shape).astype(np.int16), 0, 255).astype(np.uint8)
    h, w = img.shape[:2]
    tex = (np.sin(np.arange(w) * 1.9)[None, :] + np.sin(np.arange(h) * 1.9)[:, None]) * 3
    return np.clip(img.astype(np.float32) + tex, 0, 255).astype(np.uint8)


def by_opencv(img):
    try:
        data, _, _ = DET.detectAndDecode(img)
        if data == URL:
            return True
        if hasattr(DET, "detectAndDecodeCurved"):
            return DET.detectAndDecodeCurved(img)[0] == URL
        return False
    except cv2.error:
        return False


def by_zxing(img, invert):
    r = zxingcpp.read_barcode(img, try_invert=invert)
    return bool(r and r.text == URL)


DISTANCES = [3, 6, 8, 10, 12, 15, 20]
RESOLUTIONS = [1600, 872, 600, 436, 300]
SEEDS = [7, 13, 29, 41, 97]


def flat(src, px):
    """The artwork itself at a given pixel width — no camera, no fabric, no
    noise. Nothing here can fail for any reason except polarity and scale, so
    this is the panel that isolates the question actually being asked."""
    return cv2.resize(src, (px, px), interpolation=cv2.INTER_AREA)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)

    sources = []
    for label, path in (("white", sys.argv[1]), ("black", sys.argv[2])):
        img = cv2.imread(path, cv2.IMREAD_GRAYSCALE)
        if img is None:
            sys.exit(f"cannot read {path}")
        sources.append((label, img))

    print(f"\n  ADAPT TO LIFE shirt code — polarity measurement (OpenCV {cv2.__version__}, zxing-cpp)")

    print("\n  A. PERFECT RENDER. Only polarity and scale can matter here.\n")
    print("     background   decoder             " + "".join(f"{p}px".rjust(9) for p in RESOLUTIONS))
    print("     " + "-" * 75)
    for label, src in sources:
        for name, fn in (("OpenCV", by_opencv),
                         ("ZXing invert=on", lambda i: by_zxing(i, True)),
                         ("ZXing invert=OFF", lambda i: by_zxing(i, False))):
            row = "".join(("ok" if fn(flat(src, p)) else "FAIL").rjust(9) for p in RESOLUTIONS)
            print(f"     {label:<12} {name:<20}{row}")
        print()

    print("  B. PHOTOGRAPHED OFF A SHIRT — warped over a chest, at an angle, defocused,")
    print(f"     on black knit, indoor contrast. {len(SEEDS)} sensor-noise samples per cell.")
    print("     Code printed 10in wide; pixels across it: "
          + ", ".join(f"{d}ft={px_across(d)}px" for d in DISTANCES[:4]) + " ...\n")
    print("     background   decoder             " + "".join(f"{d}ft".rjust(9) for d in DISTANCES))
    print("     " + "-" * 82)
    for label, src in sources:
        for name, invert in (("ZXing invert=on", True), ("ZXing invert=OFF", False)):
            cells = []
            for d in DISTANCES:
                hits = sum(by_zxing(capture(src, d, seed=s), invert) for s in SEEDS)
                cells.append(("ok" if hits == len(SEEDS) else f"{hits}/{len(SEEDS)}").rjust(9))
            print(f"     {label:<12} {name:<20}" + "".join(cells))
        print()

    print("  OpenCV is left out of panel B on purpose: its binarizer gives up on the")
    print("  crushed-contrast fabric capture for BOTH backgrounds, so it cannot tell them")
    print("  apart there. Panel A is where it has something to say, and it says it clearly.\n")
