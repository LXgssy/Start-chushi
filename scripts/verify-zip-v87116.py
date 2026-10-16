#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v8.7.121 zip 内容门（verify-zip-v87115 骨架 + 本轮改写）
本轮一项：抽屉羽化遮罩锚层根修 + 上下缘外扩（用户指令「抽屉页面上方遮罩
再往上移一点，现在的挡住了一部分图标，下方遮罩也下移一点」）。
① 锚定层重构：滚动层外套 relative 锚定层（my-auto/max-h-full 随迁）；
② 滚动层对冲外扩：marginTop:-32/paddingTop:32 + marginBottom:-24/
   paddingBottom:24（静止磁贴分毫不动，裁切线顶+32/底+24）；
③ FadeVeil 新增 drop 参数（bottom:-24 贴真实底缘）；
④ changelog 8.7.121 条目入包。
回归锚：常驻形态（VEIL_LIFT 对冲 + BOTTOM_RESERVE=40）原样、遮罩 CSS、
免责声明门（v8.7.112）、抽屉旧 my-auto 退役。
锚串纪律：不跨引号/换行边界；扩展脚本未 minify（源样注入），页面 chunk
锚只取字符串字面量与 minify 后的字面形态。"""
import zipfile, json, hashlib, sys

BASE = "/home/z/beta-wt/download/v8.7.121/"
ZIP = BASE + "ChuShi-NewTab-v8.7.121.zip"
SNAP = BASE + "ChuShi-CloudSnapshot-v8.7.121.zip"
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

def exact(payload, needle, n, tag):
    global ok
    c = payload.count(needle)
    if c == n:
        ok += 1
        print(f"  [OK-EXACT] {tag} (x{c}=={n})")
    else:
        bad.append(f"{tag}: expect=={n} got {c}")
        print(f"  [FAIL-EXACT] {tag}: expect=={n} got {c}")

# ---- 门1) manifest 版本 ----
man = json.loads(z.read("manifest.json"))
print("manifest version:", man.get("version"))
if man.get("version") == "8.7.121":
    ok += 1
else:
    bad.append("manifest version != 8.7.121")

# ---- 门2) auth SHA 钉定 ----
auth = z.read("ext-chushi-auth.js")
sha = hashlib.sha256(auth).hexdigest()
print("auth sha256:", sha[:16], "…")
if sha == "b1776839307a6685752b62cb4875de366dfc6f8ade1ece4fc7a14b2e9e8fb794":
    ok += 1
    print("  [OK] ext-chushi-auth.js SHA256 钉定一致")
else:
    bad.append("auth sha mismatch: " + sha[:16])

# ---- 门3) 零 /_next 残留 ----
residue = [n for n in names if "/_next/" in n or n.startswith("_next/")]
htmls = b"".join(z.read(n) for n in names if n.endswith(".html"))
if not residue and b"/_next/" not in htmls:
    ok += 1
    print("  [OK] 包体零 /_next/ 路径残留")
else:
    bad.append("_next residue: files=" + str(residue))

# ---- 门4) 抽屉锚定层重构 + 滚动层对冲外扩 ----
pagejs = ""
for n in names:
    if n.startswith("next/static/chunks/") and n.endswith(".js"):
        d = z.read(n).decode("utf-8", "ignore")
        if "cl-drawer-veil" in d:
            pagejs += d
has(pagejs, 'relative my-auto flex max-h-full w-full flex-col', "锚定层 class（my-auto/max-h-full 随迁 + relative）")
has(pagejs, 'cl-links-scroll pointer-events-auto flex min-h-0 w-full flex-1 flex-col items-center overflow-y-auto overscroll-contain', "抽屉滚动层新 class（min-h-0 + flex-1）")
has(pagejs, 'marginTop:-32,paddingTop:32,marginBottom:-24,paddingBottom:24', "滚动层对冲外扩 style（顶 32 / 底 24）", 1)
has(pagejs, 'drop:24', "FadeVeil bottom 调用带 drop:24")
exact(pagejs, 'lift:32', 2, "lift:32 恰两处（常驻 docked + 抽屉 top）")
has(pagejs, '"top"===e&&n>0?{top:-n}:"bottom"===e&&i>0?{bottom:-i}', "FadeVeil 内部 drop 分支（minify 形态）")
gone(pagejs, 'pointer-events-auto my-auto flex max-h-full w-full flex-col items-center overflow-y-auto', "旧抽屉滚动层 class（my-auto 直挂）退役")

# ---- 门5) changelog 8.7.121 ----
has(pagejs, '"8.7.121"', "changelog 8.7.121 版本串")
has(pagejs, "抽屉羽化遮罩锚层根修", "changelog 8.7.121 标题")
has(pagejs, "顶缘裁切线上移 32px", "changelog 8.7.121 要点一")

# ---- 门6) 回归：常驻形态原样 ----
has(pagejs, 'maxHeight:F+32,marginTop:-32,paddingTop:32,paddingBottom:40', "常驻形态 maxHeight 对冲（VEIL_LIFT+BOTTOM_RESERVE=40）原样")
has(pagejs, 'cl-links-scroll w-full overflow-y-auto overscroll-contain', "常驻滚动容器 class 原样")

# ---- 门7) 遮罩 CSS 回归 ----
css = ""
for n in names:
    if n.endswith(".css"):
        css += z.read(n).decode("utf-8", "ignore")
has(css, ".cl-fade-veil", "遮罩 CSS 在位")
has(css, ".cl-fade-veil-top", "顶遮罩 mask 渐变")
has(css, ".cl-fade-veil-bottom", "底遮罩 mask 渐变")
has(css, "backdrop-filter:blur(9px)", "遮罩 blur(9px) 羽化")

# ---- 门8) 云端快照对账（v87115 同款数法） ----
try:
    snap = zipfile.ZipFile(SNAP)
    snames = snap.namelist()
    vj = json.loads(snap.read("version.json"))
    vlist = [f["p"] if isinstance(f, dict) else f for f in (vj.get("files") or [])]
    print("snapshot version:", vj.get("v"), "| files:", len(vlist), "| zip entries:", len(snames))
    if vj.get("v") == "8.7.121":
        ok += 1
        print("  [OK] 快照 version.json v=8.7.121")
    else:
        bad.append("snapshot v != 8.7.121")
    vset = set(vlist)
    sset = {n for n in snames if not n.endswith("/") and n != "version.json"}
    if vset == sset:
        ok += 1
        print(f"  [OK] 快照 zip 实体与 version.json 清单全等（{len(vset)} 文件）")
    else:
        bad.append(f"snapshot manifest diff: only-manifest={len(vset-sset)} only-zip={len(sset-vset)}")
except Exception as e:
    bad.append("snapshot check error: " + str(e))

# ---- 门9) sniffer 免责门回归（v8.7.112 锚原样，v87115 同款锚位） ----
phtml = z.read("popup.html").decode("utf-8")
pjs = z.read("popup.js").decode("utf-8")
has(phtml, 'id="sniff-gate"', "popup·声明弹层挂载点")
has(phtml, 'id="sniff-gate-yes"', "popup·同意按钮")
has(pjs, "snifferDisclaimerAgreed", "popup·同意态持久键", count_ge=3)

print()
print(f"PASS {ok}  FAIL {len(bad)}")
if bad:
    print("FAILED:")
    for b in bad:
        print("  -", b)
    sys.exit(1)
print("verify-zip-v87116 全绿")
