#!/usr/bin/env python3
"""How does the shirt code hold up when someone actually photographs a shirt?

Every number so far came from jsQR reading a flat, clean, perfectly lit render.
A shirt is none of those things: it is curved over a chest, seen at an angle,
in indoor light, from across a room, by a camera that may not be in focus, and
the white ink sits on a weave rather than paper.

So this rebuilds the capture instead of the artwork:
  - perspective skew        nobody stands square to your chest
  - cylindrical warp        a chest is not flat
  - scale to distance       computed from a real phone's FOV and sensor
  - defocus blur            phones hunt focus at conversation distance
  - fabric weave + noise    white ink on knit is not a clean edge
  - contrast crush          indoor light, and black fabric is really dark grey

Decoded with OpenCV, which is an INDEPENDENT decoder from the jsQR used
everywhere else in this project — jsQR has produced false negatives here twice.
"""
import cv2
import numpy as np
import sys

URL = "https://adapttolife.org/q/shirt"
DET = cv2.QRCodeDetector()

# A 12MP phone: ~4000px across, ~65 deg horizontal field of view.
# frame_width(m) = 2 * d * tan(fov/2);  code occupies code_m/frame_width of it.
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
    """Put the printed tile on black fabric, which is what a camera actually sees.

    This is the real test of the quiet zone. The 4 modules of white are INSIDE
    the tile; everything past them is black shirt, so there is no forgiving
    white surround the way there is on paper. An earlier version of this file
    padded with white and flattered the result."""
    n = int(img.shape[0] * margin)
    return cv2.copyMakeBorder(img, n, n, n, n, cv2.BORDER_CONSTANT, value=28)


def capture(src, distance_ft, *, warp=True, blur=True, noise=True, crush=True):
    img = on_shirt(src)
    if warp:
        img = cylinder(img)
        img = skew(img)
    n = max(40, px_across(distance_ft))
    img = cv2.resize(img, (n, n), interpolation=cv2.INTER_AREA)
    if blur:
        k = max(1, int(n * 0.006) * 2 + 1)
        img = cv2.GaussianBlur(img, (k, k), 0)
    if crush:
        # black knit reads ~18% grey, white plastisol ~88% — not 0 and 255.
        img = (img.astype(np.float32) / 255 * (0.88 - 0.18) + 0.18) * 255
        img = img.astype(np.uint8)
    if noise:
        rng = np.random.default_rng(7)
        img = np.clip(img.astype(np.int16) + rng.normal(0, 7, img.shape).astype(np.int16), 0, 255).astype(np.uint8)
        # weave: faint horizontal/vertical texture
        h, w = img.shape[:2]
        tex = (np.sin(np.arange(w) * 1.9)[None, :] + np.sin(np.arange(h) * 1.9)[:, None]) * 3
        img = np.clip(img.astype(np.float32) + tex, 0, 255).astype(np.uint8)
    return img

def decodes(img):
    try:
        data, pts, _ = DET.detectAndDecode(img)
        if data == URL:
            return True
        data2, _ = DET.detectAndDecodeCurved(img)[:2] if hasattr(DET, "detectAndDecodeCurved") else ("", None)
        return data2 == URL
    except cv2.error:
        return False

DISTANCES = [3, 6, 10, 15, 20]
LOGOS = [0, 7, 9, 11, 13, 15]

print(f"  code printed at 10in wide, decoded with OpenCV {cv2.__version__}")
print(f"  pixels across the code at each distance: "
      + ", ".join(f"{d}ft={px_across(d)}px" for d in DISTANCES))
print()
print("  logo        " + "".join(f"{d}ft".rjust(9) for d in DISTANCES))
for lm in LOGOS:
    src = cv2.imread(f"variants/logo{lm:02d}.png", cv2.IMREAD_GRAYSCALE)
    row = []
    for d in DISTANCES:
        ok = decodes(capture(src, d))
        row.append(("ok" if ok else "FAIL").rjust(9))
    label = "none" if lm == 0 else f"{lm} mod ({lm*lm/(33*33)*100:.0f}%)"
    print(f"  {label:<12}" + "".join(row))
