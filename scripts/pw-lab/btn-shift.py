#!/usr/bin/env python3
"""按钮位移测量 v2：紫圆 bbox/质心 + 圆内白字形（排除光标）逐帧"""
from PIL import Image
import os, glob

def analyze(path):
    im = Image.open(path).convert("RGB")
    w, h = im.size
    px = im.load()
    # 紫 bbox
    xs, ys = [], []
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            if 110 <= r <= 200 and 80 <= g <= 160 and b >= 200 and b > r > g:
                xs.append(x); ys.append(y)
    if not xs:
        return None
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    ccx, ccy = (x0 + x1) / 2, (y0 + y1) / 2
    rad = (x1 - x0) / 2
    # 圆内白字形（限 cx-18..cx+16 排除右侧光标）
    gxs, gys = [], []
    for y in range(int(y0), int(y1) + 1):
        for x in range(int(x0), int(x1) + 1):
            if abs(x - ccx) > rad - 6 or abs(y - ccy) > rad - 6:
                continue
            if x > ccx + 13:  # 光标区
                continue
            r, g, b = px[x, y]
            if r > 225 and g > 225 and b > 230:
                gxs.append(x); gys.append(y)
    if not gxs:
        return dict(ccx=ccx, ccy=ccy, rad=rad, glyph=None)
    return dict(ccx=ccx, ccy=ccy, rad=rad,
                glyph=dict(xmin=min(gxs), xmax=max(gxs), ymin=min(gys), ymax=max(gys),
                           cx=sum(gxs) / len(gxs), cy=sum(gys) / len(gys), n=len(gxs)))

frames = sorted(glob.glob("/home/z/my-project/upload/vid82/bt/t*.jpg"))
print(f"frames={len(frames)}")
for i, f in enumerate(frames):
    if i % 6 != 0:
        continue
    r = analyze(f)
    if r is None:
        print(f"t={27.5+i/60:.2f} no circle"); continue
    g = r["glyph"]
    if g is None:
        print(f"t={27.5+i/60:.2f} circle=({r['ccx']:.1f},{r['ccy']:.1f}) r={r['rad']:.1f} NO-GLYPH"); continue
    gw = g["xmax"] - g["xmin"]; gh = g["ymax"] - g["ymin"]
    icon = "PLAY" if gw > gh else "PAUSE"
    print(f"t={27.5+i/60:.2f}s {icon:5s} circle=({r['ccx']:.1f},{r['ccy']:.1f}) "
          f"glyph_c=({g['cx']:.1f},{g['cy']:.1f}) offset=({g['cx']-r['ccx']:+.1f},{g['cy']-r['ccy']:+.1f}) "
          f"w={gw} h={gh} n={g['n']}")
