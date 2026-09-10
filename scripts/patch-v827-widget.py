#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v8.2.7 补丁③：music-widget.html 面板律动同款升级（变亮律 + 三频段细节环）。

与 ext-card.js 同参数族：低音→封面提亮+辉光增强（上限 .24→.87）；中频→
.cs-ring 细节环；高频→饱和脉冲。宿主 SpectrumClient 已对 bands 做同款包络，
部件零计算取用；旧宿主无 bass/bands 字段守卫降级静态高光（v8.2.0 律延续）。
"""
import pathlib, sys

P = pathlib.Path("/tmp/my-project/preset-src/smtc/music-widget.html")
src = P.read_text(encoding="utf-8")
n0 = len(src)

def rep(old, new, tag):
    global src
    if new in src and old not in src:
        print(f"  skip(已应用) {tag}")
        return
    if old not in src:
        sys.exit(f"anchor NOT FOUND: {tag}")
    src = src.replace(old, new, 1)
    print(f"  ok {tag}")

# ---------- W1 细节环 CSS ----------
rep(
    ".cs-glow{position:absolute;inset:-7px;border-radius:22px;background:var(--acc);opacity:0;\n"
    "  filter:blur(12px);transition:opacity .55s ease}\n"
    ".cs-playing .cs-glow{opacity:.24}",
    ".cs-glow{position:absolute;inset:-7px;border-radius:22px;background:var(--acc);opacity:0;\n"
    "  filter:blur(12px);transition:opacity .55s ease}\n"
    ".cs-playing .cs-glow{opacity:.24}\n"
    "/* v8.2.7 细节环：中/高频 rim light（不模糊，与低频辉光晕开互补） */\n"
    ".cs-ring{position:absolute;inset:-6px;border-radius:21px;\n"
    "  border:2px solid color-mix(in oklab,var(--acc) 42%,#fff);opacity:0;\n"
    "  pointer-events:none;z-index:2;transition:opacity .4s ease}",
    "W1 cs-ring CSS",
)

# ---------- W2 标记：pic 后挂环 ----------
rep(
    '        <span class="cs-glow"></span>\n'
    '        <span class="cs-pic cs-pz" id="csPic"><img id="csCoverImg" alt="" draggable="false"></span>\n'
    '        <span class="cs-dot"></span>',
    '        <span class="cs-glow"></span>\n'
    '        <span class="cs-pic cs-pz" id="csPic"><img id="csCoverImg" alt="" draggable="false"></span>\n'
    '        <span class="cs-ring"></span>\n'
    '        <span class="cs-dot"></span>',
    "W2 标记挂环",
)

# ---------- W3 beatFrame 三轴化 ----------
rep(
    "  var glowEl = document.querySelector(\".cs-glow\");\n"
    "  var glowOn = 0;\n"
    "  var calmMotion = !!(window.matchMedia && matchMedia(\"(prefers-reduced-motion: reduce)\").matches);\n"
    "  function beatFrame(n) {\n"
    "    if (!glowEl) return;\n"
    "    var b = !calmMotion && n && typeof n.bass === \"number\" ? n.bass : 0;\n"
    "    if (b > 0.012 && effPlaying()) {\n"
    "      glowEl.style.transition = \"none\";\n"
    "      glowEl.style.opacity = (0.24 + b * 0.3).toFixed(3);\n"
    "      glowEl.style.transform = \"scale(\" + (1 + b * 0.055).toFixed(4) + \")\";\n"
    "      glowOn = 1;\n"
    "    } else if (glowOn) {\n"
    "      glowOn = 0;\n"
    "      glowEl.style.transition = \"\";\n"
    "      glowEl.style.opacity = \"\";\n"
    "      glowEl.style.transform = \"\";\n"
    "    }\n"
    "  }",
    "  var glowEl = document.querySelector(\".cs-glow\");\n"
    "  var ringEl = document.querySelector(\".cs-ring\");\n"
    "  var picImgEl = document.getElementById(\"csCoverImg\");\n"
    "  var glowOn = 0, gLo = \"\", gLt = \"\", gLf = \"\", gLr = \"\";\n"
    "  var calmMotion = !!(window.matchMedia && matchMedia(\"(prefers-reduced-motion: reduce)\").matches);\n"
    "  function bandAvg(b, a, z) { var s = 0, i; for (i = a; i < z; i++) s += Number(b[i]) || 0; return s / (z - a); }\n"
    "  /* v8.2.7 变亮律（浮窗同参数族）：低音→封面提亮+辉光增强；中频→细节环；\n"
    "     高频→饱和脉冲。bands 已由宿主包络，部件零计算。写值防抖（不变不写），\n"
    "     静默交还样式表（暂停 .cs-pz img 滤镜/类基态过渡不受内联残留干扰）。 */\n"
    "  function beatFrame(n) {\n"
    "    if (!glowEl) return;\n"
    "    var b = !calmMotion && n && typeof n.bass === \"number\" ? n.bass : 0;\n"
    "    var m = 0, h = 0;\n"
    "    if (!calmMotion && n && n.bands) { m = bandAvg(n.bands, 3, 10); h = bandAvg(n.bands, 10, 16); }\n"
    "    var act = effPlaying() && (b > 0.012 || m > 0.02 || h > 0.02);\n"
    "    if (act) {\n"
    "      var f = \"brightness(\" + (1 + b * 0.3 + m * 0.09).toFixed(3) + \") saturate(\" + (1 + h * 0.3).toFixed(3) + \")\";\n"
    "      var go = Math.min(1, 0.24 + b * 0.5 + m * 0.13).toFixed(3);\n"
    "      var gs = \"scale(\" + (1 + b * 0.05 + m * 0.018).toFixed(4) + \")\";\n"
    "      var ro = Math.min(1, m * 0.8 + h * 0.3).toFixed(3);\n"
    "      if (f !== gLf) { if (!glowOn && picImgEl) picImgEl.style.transition = \"none\"; gLf = f; if (picImgEl) picImgEl.style.filter = f; }\n"
    "      if (go !== gLo) { if (!glowOn) glowEl.style.transition = \"none\"; gLo = go; glowEl.style.opacity = go; }\n"
    "      if (gs !== gLt) { gLt = gs; glowEl.style.transform = gs; }\n"
    "      if (ringEl && ro !== gLr) { if (!glowOn) ringEl.style.transition = \"none\"; gLr = ro; ringEl.style.opacity = ro; }\n"
    "      glowOn = 1;\n"
    "    } else if (glowOn) {\n"
    "      glowOn = 0; gLo = gLt = gLf = gLr = \"\";\n"
    "      glowEl.style.transition = \"\";\n"
    "      glowEl.style.opacity = \"\";\n"
    "      glowEl.style.transform = \"\";\n"
    "      if (picImgEl) { picImgEl.style.transition = \"\"; picImgEl.style.filter = \"\"; }\n"
    "      if (ringEl) { ringEl.style.transition = \"\"; ringEl.style.opacity = \"\"; }\n"
    "    }\n"
    "  }",
    "W3 beatFrame 三轴化",
)

P.write_text(src, encoding="utf-8")
print(f"OK music-widget.html: {n0} -> {len(src)} chars")
