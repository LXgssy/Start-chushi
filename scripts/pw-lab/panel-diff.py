#!/usr/bin/env python3
"""面板帧差定位位移元素：相邻帧 diff 的 bbox 演化"""
from PIL import Image, ImageChops
import os, glob

frames = sorted(glob.glob("/home/z/my-project/upload/vid82/pf/t*.jpg"))
prev = None
for i, f in enumerate(frames):
    im = Image.open(f).convert("L")
    if prev is not None:
        diff = ImageChops.difference(im, prev)
        px = diff.load()
        w, h = diff.size
        # 找显著变化像素 (>28) 的 bbox
        xs, ys = [], []
        for y in range(0, h, 2):
            for x in range(0, w, 2):
                if px[x, y] > 28:
                    xs.append(x); ys.append(y)
        if xs:
            t = 27.5 + i / 30
            print(f"t={t:.3f} diff_bbox=({min(xs)},{min(ys)})-({max(xs)},{max(ys)}) n={len(xs)}")
        else:
            print(f"t={27.5+i/30:.3f} no-diff")
    prev = im
