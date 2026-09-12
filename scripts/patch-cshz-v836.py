#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""patch-cshz-v836.py —— 在已构建的 .cshz（manifest.json 内嵌压缩 widget html）
上原位套用 v8.3.6 面板三修，产出可直接导入的修复版预设。
用法: python patch-cshz-v836.py <in.cshz> <out.cshz>

注：预设里 CSS 被压缩过（去缩进），JS 保留换行但去缩进——下列 old 串按
「实际构建产物」逐字取，不按源码缩进。
"""
import io, json, sys, zipfile

IN, OUT = sys.argv[1], sys.argv[2]

SIG = """function lyricSig(l) {
if (!l || !l.lines || !l.lines.length) return "";
var h = 2166136261, i, j;
function mix(v) {
v = String(v == null ? "" : v);
for (var k = 0; k < v.length; k++) { h ^= v.charCodeAt(k); h = (h * 16777619) >>> 0; }
h = ((h ^ 31) * 16777619) >>> 0;
}
mix(l.mode); mix(l.src); mix(l.songId); mix(l.lines.length);
for (i = 0; i < l.lines.length; i++) {
var ln = l.lines[i], w = ln.w;
mix(ln.t); mix(ln.tr);
if (w) { mix(w.length); for (j = 0; j < w.length; j++) mix(w[j].t); }
}
return (h >>> 0).toString(36);
}
function buildLyric() {
var l = snap && snap.lyric;
var key = (snap && snap.lyricRev || "") + "#" + lyricSig(l);
if (key === lyKey) return;
lyKey = key;"""

GATE_OLD = """function buildLyric() {
var l = snap && snap.lyric;
var key = (snap && snap.lyricRev || "") + (l ? "#" + (l.mode || 0) + ":" + (l.lines ? l.lines.length : 0) : "#0");
if (key === lyKey && l === lyRef) return;
lyKey = key;
lyRef = l;"""

pairs = [
  # ①a 歌词左右防裁切：内层左右各留 9px
  (".cs-lyr-in{position:absolute;left:0;right:0;top:0;transition:transform .45s var(--ez);will-change:transform}",
   ".cs-lyr-in{position:absolute;left:9px;right:9px;top:0;transition:transform .45s var(--ez);will-change:transform}"),
  # ①b 长词兜底
  (".cs-ln{padding:6px 4px;text-align:center;font-size:14.5px;font-weight:560;line-height:1.45;",
   ".cs-ln{padding:6px 4px;text-align:center;font-size:14.5px;font-weight:560;line-height:1.45;overflow-wrap:anywhere;"),
  # ①c 翻译行 grid 列锁宽
  (".cs-subw{display:grid;grid-template-rows:1fr;height:0;opacity:0;overflow:hidden;",
   ".cs-subw{display:grid;grid-template-columns:minmax(0,1fr);grid-template-rows:1fr;height:0;opacity:0;overflow:hidden;"),
  # ①d 翻译行 ellipsis 生效
  (".cs-subw .cs-sub{min-height:0;font-size:11px;font-weight:400;color:var(--ink2);line-height:1.5;white-space:nowrap;text-overflow:ellipsis}",
   ".cs-subw .cs-sub{min-height:0;font-size:11px;font-weight:400;color:var(--ink2);line-height:1.5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}"),
  # ②a 播放键按下零位移
  (".cs-bmain:active{transform:scale(.94)}",
   ".cs-bmain:active{transform:none;filter:brightness(.94)}"),
  # ③a 去掉身份维变量
  ('var lyKey = "", lyRef = null, lyMode = 0;',
   'var lyKey = "", lyMode = 0;'),
  # ③b 内容指纹重建门
  (GATE_OLD, SIG),
]

zin = zipfile.ZipFile(IN)
man = json.loads(zin.read("manifest.json").decode("utf-8"))
html = man["widgets"][0]["html"]
for old, new in pairs:
    c = html.count(old)
    if c != 1:
        print("FAIL: %d hits for %r" % (c, old[:80])); sys.exit(1)
    html = html.replace(old, new)
man["widgets"][0]["html"] = html
zout = zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED)
for name in zin.namelist():
    if name == "manifest.json":
        zout.writestr(name, json.dumps(man, ensure_ascii=False).encode("utf-8"))
    else:
        zout.writestr(name, zin.read(name))
zout.close()
print("wrote %s (%d bytes), widget html %d -> %d chars" % (OUT, __import__("os").path.getsize(OUT), len(json.loads(zin.read("manifest.json").decode("utf-8"))["widgets"][0]["html"]), len(html)))
