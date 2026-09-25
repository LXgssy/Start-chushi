#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v8.7.22 zip 逐串新鲜度验证（Task 154 律：转义环境锚串选不跨引号/换行边界形态）"""
import zipfile, sys, json, re

ZIP = "/tmp/beta-wt/download/v8.7.22/ChuShi-NewTab-v8.7.22.zip"
z = zipfile.ZipFile(ZIP)
names = z.namelist()
ok, bad = 0, []

def has(payload, needle, tag, count_ge=1):
    global ok
    c = payload.count(needle)
    if c >= count_ge:
        ok += 1
        print(f"  [OK] {tag} (x{c})")
    else:
        bad.append(f"{tag}: expect>={count_ge} got {c}")
        print(f"  [FAIL] {tag} expect>={count_ge} got {c}")

def gone(payload, needle, tag):
    global ok
    if needle not in payload:
        ok += 1
        print(f"  [OK-GONE] {tag}")
    else:
        bad.append(f"{tag}: still present")
        print(f"  [FAIL-GONE] {tag}: still present")

# ---- 1) manifest 版本 ----
man = json.loads(z.read("manifest.json"))
print("manifest version:", man.get("version"))
if man.get("version") == "8.7.22":
    ok += 1
else:
    bad.append("manifest version != 8.7.22")

# ---- 2) 内容脚本逐字锚（ext-card.js 原样入包，v8.7.21 律零回归） ----
card = z.read("ext-card.js").decode("utf-8")
has(card, "transition:opacity .3s ease,width .45s cubic-bezier(.22,1,.36,1),", "card: dl width/left 双过渡")
has(card, "left .45s cubic-bezier(.22,1,.36,1)}", "card: left 过渡收尾")
has(card, ".dl.drag{transition:opacity .3s ease}", "card: drag 豁免")
has(card, "@keyframes dlswap{0%{opacity:0;filter:blur(7px)}100%{opacity:1;filter:blur(0)}}", "card: dlswap 关键帧")
has(card, ".dl1.lin,.dl2.lin{animation:dlswap .42s ease}", "card: lin 动画挂载")
has(card, "function dlMeasure()", "card: dlMeasure")
has(card, "r.selectNodeContents(el);", "card: Range 自然宽")
has(card, 'dlPill.style.width = nw + "px";', "card: 显式宽度")
has(card, "function dlSwapFx()", "card: dlSwapFx")
has(card, 'dlPos = { x: Math.round((w - 42) / 2), y: Math.max(8, h - 176) };', "card: 首用默认位 42")
has(card, ".dl1 .dw .ov{position:absolute;left:0;top:0;pointer-events:none;white-space:nowrap;color:#fff;", "card: v8.7.20 白描边根修零回归(前半)")
has(card, "clip-path:inset(-8% -8% -8% var(--p,0%))}", "card: v8.7.20 白描边根修零回归(裁剪)")
gone(card, "var nw = dlPill.offsetWidth || 0;", "card: 旧 dlRecenter 退役")
gone(card, "(w - 460) / 2", "card: 460 假设宽退役")

# ---- 3) 页面 chunk 锚（use-start-zen → minified chunk；JSON 转义环境取无引号安全锚） ----
chunks = [n for n in names if re.match(r"next/static/chunks/.*\.js$", n)]
print(f"chunks: {len(chunks)}")
alljs = ""
for n in chunks:
    alljs += z.read(n).decode("utf-8", "ignore")
has(alljs, 'classList.contains("cs-drawer")', "chunk: 抽屉双击守卫")

# ---- 4) CSS chunk 锚（tailwind overscroll-contain） ----
css_all = ""
for n in names:
    if n.endswith(".css"):
        css_all += z.read(n).decode("utf-8", "ignore")
has(css_all, "overscroll-behavior:contain", "css: overscroll-contain 生成")

# ---- 5) 官方预设内嵌 widget（v8.7.22 角标入框 + 存量律零回归） ----
presets = z.read("official-presets.json") if "official-presets.json" in names else None
if presets is None:
    for n in names:
        if n.endswith(".js") and ("official" in n or "presets" in n):
            presets = z.read(n)
            break
if presets is None:
    # official-presets 编进页面 chunk
    presets = alljs.encode("utf-8")
ptxt = presets.decode("utf-8", "ignore")
has(ptxt, "scale(.88)", "preset: 按压 .88（v8.7.20 零回归）")
has(ptxt, "on-badge", "preset: on 角标（v8.7.20 零回归）")
has(ptxt, "cs-wpulse-kf", "preset: 脉冲关键帧（v8.7.20 零回归）")
has(ptxt, "right:4.5px", "preset: 角标入框 right（v8.7.22）")
has(ptxt, "bottom:4.5px", "preset: 角标入框 bottom（v8.7.22）")
has(ptxt, ".on-badge circle", "preset: 白描边环规则（v8.7.22）")
has(ptxt, 'r=' + chr(92) * 2 + '"5.25', "preset: 徽标圆 r5.25（v8.7.22，chunk 内 json-in-js 双重转义形态）")
gone(ptxt, "right:-1px;bottom:-1px", "preset: 旧外悬位退役（v8.7.22）")

# ---- 6) 版本串 ----
has(alljs, '"8.7.22"', "chunk: 版本串 8.7.22（changelog 条目）")
has(alljs, "角标入框", "chunk: v8.7.22 changelog 标题")

print(f"\n===== verify-zip-v8722: {ok} OK / {len(bad)} FAIL =====")
for b in bad:
    print("  FAIL:", b)
sys.exit(1 if bad else 0)
