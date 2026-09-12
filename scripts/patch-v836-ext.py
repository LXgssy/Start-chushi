#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""patch-v836-ext.py —— v8.3.6 浮窗 ext-card.js 修（与面板同律）：
歌词左右截断：当前行 scale(1.06) 把行盒横向扩出 ≈9px 被 .flyr overflow:hidden
左右硬切 + 翻译行（.fsubw/.fsub）隐式 grid 列 auto=max-content 被 nowrap 长句
撑到卡外再硬切（左右都被切、ellipsis 失效）。修：.flyr-in 左右各留 9px 呼吸位；
.fsubw 显式 grid-template-columns:minmax(0,1fr) 锁宽；.fsub 补 overflow:hidden
让 text-overflow:ellipsis 生效；.fln 补 overflow-wrap:anywhere 兜底长词。

注：▶ 字形不改——原路径 M8 的视觉质心（centroid = 8 + 12/3 = 12）正落在按钮
中心，是有意的视觉居中；此前 v8.3.6 初版把它左移到 M6 反而读作偏左，已回退。
注意：CSS 全部住在 JS 单引号字符串里，插入的注释必须是单行（不得含裸换行）。
"""
import io, sys

ROOT = sys.argv[1] if len(sys.argv) > 1 else "."
P = ROOT + "/extension-src/ext-card.js"
src = io.open(P, encoding="utf-8").read()
orig = src
n = 0

def rep(old, new, tag):
    global src, n
    if old not in src:
        print("MISS [%s]: %r..." % (tag, old[:70])); sys.exit(1)
    if src.count(old) != 1:
        print("AMBIG[%s]: %d hits" % (tag, src.count(old))); sys.exit(1)
    src = src.replace(old, new); n += 1
    print("ok  [%s]" % tag)

# ---- ①歌词左右防裁切：.flyr-in 内缩 9px ----
rep(
"    '.flyr-in{position:absolute;left:0;right:0;top:0;transition:transform .45s cubic-bezier(.22,1,.36,1),opacity .3s ease;will-change:transform}' +",
"    '/* v8.3.6 歌词左右防裁切律（面板 .cs-lyr-in 同律）：当前行 scale(1.06) 把行盒横向扩出 ≈9px，被 .flyr{overflow:hidden} 左右各切一刀（翻译行首字被吃）；内层左右各留 9px 呼吸位，放大后的行盒仍在视口内。 */' +\n"
"    '.flyr-in{position:absolute;left:9px;right:9px;top:0;transition:transform .45s cubic-bezier(.22,1,.36,1),opacity .3s ease;will-change:transform}' +",
"flyr-in")

# ---- ①b 长词兜底 ----
rep(
"    '.fln{padding:5px 4px;text-align:center;font-size:13.5px;font-weight:560;line-height:1.45;' +",
"    '/* v8.3.6 断行兜底：超长不可断词（URL/长英文单词）禁止横向溢出被裁。 */' +\n"
"    '.fln{padding:5px 4px;text-align:center;font-size:13.5px;font-weight:560;line-height:1.45;overflow-wrap:anywhere;' +",
"fln")

# ---- ①c 翻译行 grid 列锁宽 ----
rep(
"    '.fsubw{display:grid;grid-template-rows:1fr;height:0;opacity:0;overflow:hidden;' +",
"    '/* v8.3.6 翻译行左右截断根治（面板 .cs-subw 同律）：只声明 grid-template-rows 时隐式列 auto=max-content——nowrap 翻译长句把列撑到卡外再由 overflow:hidden 硬切（左右都被切）。显式 minmax(0,1fr) 锁在卡内 + .fsub overflow:hidden 让 text-overflow:ellipsis 真正生效（截断变省略号）。 */' +\n"
"    '.fsubw{display:grid;grid-template-columns:minmax(0,1fr);grid-template-rows:1fr;height:0;opacity:0;overflow:hidden;' +",
"fsubw")

# ---- ①d 翻译行 ellipsis 生效 ----
rep(
"    'white-space:nowrap;text-overflow:ellipsis}' +",
"    'white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +",
"fsub")

io.open(P, "w", encoding="utf-8", newline="\n").write(src)
print("ext-card.js: %d patches applied, %d -> %d bytes" % (n, len(orig.encode("utf-8")), len(src.encode("utf-8"))))
