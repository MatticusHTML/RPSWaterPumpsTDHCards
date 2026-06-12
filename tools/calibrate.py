#!/usr/bin/env python3
"""
calibrate.py - find axis calibration fractions for an RPS pump curve chart.

Usage:
    python3 tools/calibrate.py images/25RPS.png
    python3 tools/calibrate.py images/25RPS.png --test GPM TDH   (renders a test dot)

It detects the plot frame and prints xLf, xRf, yTf, yBf as fractions of the
image. You still read gpmMax and tdhMax off the printed axes by eye, then paste
all six into data/families.json under that family's "cal".

Requires: pip install pillow numpy
The --test option draws a horizontal line at TDH and a dot at (GPM, TDH) using
the detected calibration, saving _calib_test.png so you can confirm the dot
lands on the printed curve.
"""
import sys
import numpy as np
from PIL import Image, ImageDraw


def detect(path):
    a = np.array(Image.open(path).convert("RGB")).astype(int)
    H, W, _ = a.shape
    r, g, b = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    dark = (r < 70) & (g < 70) & (b < 70)
    mx = np.maximum(np.maximum(r, g), b)
    mn = np.minimum(np.minimum(r, g), b)
    gray = ((mx - mn) < 28) & (mx < 225) & (mx > 40)

    y0, y1 = int(H * 0.13), int(H * 0.62)
    x0, x1 = int(W * 0.05), int(W * 0.97)
    xL = int(np.argmax(dark[y0:y1, :].sum(0)))      # GPM 0 (left axis)
    # right edge from rightmost vertical gridline
    ytop = int(H * 0.15)
    cprof = gray[ytop:int(H * 0.6), :].sum(0)
    cols = np.where(cprof > cprof.max() * 0.55)[0]
    xR = int(cols.max()) if len(cols) else W

    # top and bottom of plot from full width horizontal gridlines
    gridish = ((mx - mn) < 40) & (mx < 235)
    width = xR - xL
    rows = np.where(gridish[:, xL:xR].sum(1) > 0.85 * width)[0]
    yT = int(rows.min()) if len(rows) else 0        # TDH max
    yB = int(rows.max()) if len(rows) else H        # TDH 0
    return W, H, xL, xR, yT, yB


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return
    path = sys.argv[1]
    W, H, xL, xR, yT, yB = detect(path)
    print(f"image: {W} x {H}")
    print(f"pixels: xL={xL} xR={xR} yT={yT} yB={yB}")
    print("paste into cal (still set gpmMax and tdhMax by eye):")
    print(f'  "xLf": {xL / W:.6f},')
    print(f'  "xRf": {xR / W:.6f},')
    print(f'  "yTf": {yT / H:.6f},')
    print(f'  "yBf": {yB / H:.6f}')

    if "--test" in sys.argv:
        i = sys.argv.index("--test")
        gpm = float(sys.argv[i + 1]); tdh = float(sys.argv[i + 2])
        gpmMax = float(input("gpmMax? "))
        tdhMax = float(input("tdhMax? "))
        im = Image.open(path).convert("RGB")
        d = ImageDraw.Draw(im)
        x = xL + (xR - xL) * gpm / gpmMax
        y = yB + (yT - yB) * tdh / tdhMax
        d.line([(xL, y), (xR, y)], fill=(0, 0, 0), width=2)
        d.ellipse([x - 10, y - 10, x + 10, y + 10], outline=(0, 0, 0), width=3, fill=(255, 0, 0))
        out = "_calib_test.png"
        im.save(out)
        print(f"wrote {out} - confirm the red dot sits on the printed curve")


if __name__ == "__main__":
    main()
