#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""patch-newtab-v836.py —— 在已构建的 ChuShi-NewTab-v*.zip 上原位套用 v8.3.6
浮窗 ext-card.js 双修（歌词左右截断 + 播放/暂停键偏心），产出可直接加载的修复版扩展。
用法: python patch-newtab-v836.py <in.zip> <out.zip>
"""
import io, sys, zipfile

IN, OUT = sys.argv[1], sys.argv[2]
pairs = [
  ("    '.flyr-in{position:absolute;left:0;right:0;top:0;transition:transform .45s cubic-bezier(.22,1,.36,1),opacity .3s ease;will-change:transform}' +",
   "    '.flyr-in{position:absolute;left:9px;right:9px;top:0;transition:transform .45s cubic-bezier(.22,1,.36,1),opacity .3s ease;will-change:transform}' +"),
  ("    '.fln{padding:5px 4px;text-align:center;font-size:13.5px;font-weight:560;line-height:1.45;' +",
   "    '.fln{padding:5px 4px;text-align:center;font-size:13.5px;font-weight:560;line-height:1.45;overflow-wrap:anywhere;' +"),
  ("    '.fsubw{display:grid;grid-template-rows:1fr;height:0;opacity:0;overflow:hidden;' +",
   "    '.fsubw{display:grid;grid-template-columns:minmax(0,1fr);grid-template-rows:1fr;height:0;opacity:0;overflow:hidden;' +"),
  ("    'white-space:nowrap;text-overflow:ellipsis}' +",
   "    'white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +"),
  # ▶ 字形不改（M8 视觉质心居中；左移反而偏左，已回退）
]
zin = zipfile.ZipFile(IN)
if "ext-card.js" not in zin.namelist():
    print("FAIL: ext-card.js not in archive"); sys.exit(1)
src = zin.read("ext-card.js").decode("utf-8")
for old, new in pairs:
    c = src.count(old)
    if c != 1:
        print("FAIL: %d hits for %r" % (c, old[:80])); sys.exit(1)
    src = src.replace(old, new)
zout = zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED)
for name in zin.namelist():
    if name.endswith("/"):
        zout.writestr(zipfile.ZipInfo(name), b"")
    elif name == "ext-card.js":
        zout.writestr(name, src.encode("utf-8"))
    else:
        zout.writestr(name, zin.read(name))
zout.close()
print("wrote %s (%d bytes); ext-card.js %d -> %d chars" % (OUT, __import__("os").path.getsize(OUT), len(zin.read("ext-card.js").decode("utf-8")), len(src)))
