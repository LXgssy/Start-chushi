#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""patch-v835-panel.py —— v8.3.5 面板 music-widget.html 双修（与浮窗同律）：
①中文逐字重影：.cs-w inline-block 化（inline 相对定位包含块顶=em box 顶，
  与底字 line box 基线差半 leading ≈3px → 中文方块字重影）
②高光照亮文字：.cs-meta/.cs-seek/.cs-tm/.cs-ctl/.cs-foot/.cs-x 提层
  relative+z-index:1 压住 .cs-glow（positioned z-index 无 = auto，
  同 context 画在非定位内容之上）
头部补 v8.3.5 注释。"""
import io, sys

P = "/tmp/my-project/preset-src/smtc/music-widget.html"
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

# ---- ①文字层级（.cs-glow 压字根治）----
rep(".cs-meta{flex:1;min-width:0;padding-right:24px}",
    "/* v8.3.5 文字层级律（浮窗同律）：.cs-glow 是 positioned（inset -8px +\n"
    "   blur 13px 晕出 ~21px），同 context 内画在非定位内容之上 = 辉光盖字；\n"
    "   内容件 relative+z-index:1 提到辉光之上，封面 img 静态流内被 .cs-pic\n"
    "   overflow 裁住不受影响。 */\n"
    ".cs-meta{flex:1;min-width:0;padding-right:24px;position:relative;z-index:1}", "meta")
rep(".cs-x{position:absolute;right:10px;top:10px;appearance:none;border:0;cursor:pointer;",
    ".cs-x{position:absolute;right:10px;top:10px;z-index:1;appearance:none;border:0;cursor:pointer;", "x")
rep(".cs-seek{margin-top:13px;height:14px;display:flex;align-items:center;cursor:pointer;\n  touch-action:none}",
    ".cs-seek{margin-top:13px;height:14px;display:flex;align-items:center;cursor:pointer;\n"
    "  touch-action:none;position:relative;z-index:1}", "seek")
rep(".cs-tm{display:flex;justify-content:space-between;margin-top:2px;font-size:10.5px;\n  color:var(--ink3);font-variant-numeric:tabular-nums}",
    ".cs-tm{display:flex;justify-content:space-between;margin-top:2px;font-size:10.5px;\n"
    "  color:var(--ink3);font-variant-numeric:tabular-nums;position:relative;z-index:1}", "tm")
rep(".cs-ctl{flex:1;display:flex;align-items:center;justify-content:center;gap:20px}",
    ".cs-ctl{flex:1;display:flex;align-items:center;justify-content:center;gap:20px;position:relative;z-index:1}", "ctl")
rep(".cs-foot{display:flex;align-items:center;gap:6px;font-size:10.5px;color:var(--ink3);margin-top:auto}",
    ".cs-foot{display:flex;align-items:center;gap:6px;font-size:10.5px;color:var(--ink3);margin-top:auto;\n"
    "  position:relative;z-index:1}", "foot")

# ---- ②逐字重影：.cs-w inline-block + .ov nowrap ----
rep(""".cs-w{position:relative;color:var(--ink3)}
.cs-w .ov{position:absolute;left:0;top:0;color:var(--ink);pointer-events:none;
  clip-path:inset(-8% calc(100% - var(--p,0%)) -8% 0)}""",
    """/* v8.3.5 逐字重影根治（浮窗 .fw 同律）：.cs-w inline-block 化——inline
   相对定位的 absolute 子元素包含块顶 = em box 顶，与底字 line box 基线差
   半 leading（line-height 1.45 ≈3px），中文方块字笔画极敏感 = 重影（拉丁
   圆润笔画不敏感，故用户只见中文歌出影）。inline-block 后包含块 = 真块盒，
   内部 line box 与外部行盒基线对齐律一致（inline-block 基线 = 末行盒基线）
   → 两层文本像素级重合；text-align:center / 断行 / 基线对齐行为不变
   （DOM 构建 createElement 无空白节点，无额外间隙）。.ov 补 nowrap。 */
.cs-w{position:relative;display:inline-block;color:var(--ink3)}
.cs-w .ov{position:absolute;left:0;top:0;color:var(--ink);pointer-events:none;white-space:nowrap;
  clip-path:inset(-8% calc(100% - var(--p,0%)) -8% 0)}""", "csw")

io.open(P, "w", encoding="utf-8").write(src)
print("music-widget.html: %d patches, %d -> %d bytes" % (n, len(orig), len(src)))
