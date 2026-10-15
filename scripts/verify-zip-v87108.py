#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v8.7.108 zip 内容门（verify-zip-v87106 骨架 + 本轮改写）
本轮：常驻磁贴区下边界=Dock 顶缘（近底 12px 下探退役）/ favicon 双路竞速
（串行 onError 链退役，源顺序与记忆保留）/ popup「添加至快捷服务」cap 残留
引用修复 / 常驻按钮换 Lucide Pin 图钉
锚串纪律：不跨引号/换行边界；swc minify 改名免疫（只取字符串字面量/类名/URL/属性名）。"""
import zipfile, json, re, hashlib, sys

BASE = "/home/z/beta-wt/download/v8.7.108/"
ZIP = BASE + "ChuShi-NewTab-v8.7.108.zip"
SNAP = BASE + "ChuShi-CloudSnapshot-v8.7.108.zip"
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

# ---- 门1) manifest 版本 ----
man = json.loads(z.read("manifest.json"))
print("manifest version:", man.get("version"))
if man.get("version") == "8.7.108":
    ok += 1
else:
    bad.append("manifest version != 8.7.108")

# ---- 门2) auth SHA 钉定 ----
auth = z.read("ext-chushi-auth.js")
sha = hashlib.sha256(auth).hexdigest()
print("auth sha256:", sha[:16], "…")
if sha == "b1776839307a6685752b62cb4875de366dfc6f8ade1ece4fc7a14b2e9e8fb794":
    ok += 1
    print("  [OK] ext-chushi-auth.js SHA256 钉定一致")
else:
    bad.append(f"auth sha mismatch: {sha}")

# ---- 门3) 零 _next 残留 + 历史退役延续 ----
next_leak = [n for n in names if "/_next/" in n]
if not next_leak:
    ok += 1
    print("  [OK] 包体零 /_next/ 路径残留")
else:
    bad.append(f"_next leak: {next_leak[:3]}")
alljs = ""
for n in [n for n in names if re.match(r"next/static/chunks/.*\.js$", n)]:
    alljs += z.read(n).decode("utf-8", "ignore")
print(f"chunks aggregated: {len(alljs)//1024}KB")
gone(alljs, "incognito", "JS: 无痕模式零残留（8.7.104 律延续）")
gone(alljs, "快捷服务已到达限制数量", "JS: 4 行上限 toast 退役（数量不限律）")
gone(alljs, "favicon.zhusl.com", "JS: zhusl 16px 糊源退役（清晰源律）")

# ---- 门4) CSS 锚（羽化遮罩体系延续；turbopack v16 产物 CSS 在 chunks/ 下） ----
css = ""
CSS_RE = r"next/static/chunks/.*\.css$"
for n in [n for n in names if re.match(CSS_RE, n)]:
    css += z.read(n).decode("utf-8", "ignore")
print(f"css aggregated: {len(css)//1024}KB")
has(css, ".cl-links-scroll", "CSS: 磁贴区滚动容器（滚动条隐藏）")
has(css, ".cl-fade-veil", "CSS: 羽化遮罩基类")
has(css, ".cl-fade-veil-top", "CSS: 顶部羽化（渐变 mask）")
has(css, ".cl-fade-veil-bottom", "CSS: 底部羽化（渐变 mask）")
has(css, ".cl-fade-veil-on", "CSS: 羽化显影态")
has(css, ".tile-frost", "CSS: 磁贴磨砂基线（存量）")
has(css, ".cl-drawer-veil", "CSS: 抽屉纱罩（存量）")
has(css, ".link-intro", "CSS: 磁贴入场通道（存量）")

# ---- 门5) JS chunk 锚 ----
# 5a) 清晰源链延续（源顺序不动，竞速在消费端）
has(alljs, "favicon.im/", "JS: favicon.im 高清源在位")
has(alljs, "https://www.google.com/s2/favicons?domain=", "JS: Google s2 压轴高清")
has(alljs, "favicon-src2:", "JS: 源记忆键换代（竞速记忆沿用）")
has(alljs, "no-referrer", "JS: 图标请求 referrer 策略（竞速 Image 同参）")
# 5b) v8.7.108 竞速专属锚：.cl-dock 实测选择器（下边界跟随 Dock）
has(alljs, '.querySelector(".cl-dock")', "JS: Dock 栏顶缘实测选择器（下边界跟随律）")
# 5c) 8.7.44 居中样式（存量延续）
has(alljs, "rounded-md object-contain", "JS: favicon 居中小图类名（8.7.44 形态）")
has(alljs, "linear-gradient(135deg, hsl(", "JS: 域名色相渐变底（8.7.44 底色）")
# 5d) hover CSS 通道（v8.7.106 律延续）
has(alljs, "hover:scale-[1.07]", "JS: hover 纯放大类名（CSS transition 通道）")
has(alljs, "duration-[350ms]", "JS: hover 350ms 时长类名")
# 5e) PinnedTiles / 壁纸历史（存量延续）
has(alljs, "start:pintile-todo", "JS: 待办磁贴钉位键（存量）")
has(alljs, "start:pintile-note", "JS: 便签磁贴钉位键（存量）")
has(alljs, "onloadeddata", "JS: 视频首帧解码回调（存量）")
has(alljs, "最近使用（跨设备同步）", "JS: 壁纸历史行（存量）")
has(alljs, "今日无事，从容一些", "JS: 待办空态（存量）", 2)
has(alljs, "todoTile", "JS: settings.todoTile 字段")
has(alljs, "noteTile", "JS: settings.noteTile 字段")
# 5f) v8.7.108 Lucide Pin 图钉（常驻按钮重画）
has(alljs, "M12 17v5", "JS: Lucide Pin 图钉针杆路径")
has(alljs, 'createIcon\")?|"pin",[["path"', "JS: Lucide pin 注册名") if False else has(alljs, '("pin",[["path"', "JS: Lucide Pin 注册名（pin 图标项）")
# 5g) changelog 8.7.108
has(alljs, "8.7.108", "JS: changelog 8.7.108 版本号")
has(alljs, "两路并发竞速", "JS: changelog 竞速高亮词")
has(alljs, "图钉图案", "JS: changelog 图钉高亮词")
has(alljs, "8.7.107", "JS: changelog 8.7.107 条目并存")

# ---- 门6) popup.js 直检（cap 残留引用根修） ----
pop = z.read("popup.js").decode("utf-8", "ignore")
gone(pop, "list.length > cap", "popup: cap 残留引用拆除（ReferenceError 根因）")
has(pop, "添加至快捷服务", "popup: 添加按钮文案在位")
has(pop, "LINKS_KEY", "popup: start:links 写入面在位")
gone(pop, "cap", "popup: cap 标识符零残留") if " cap" not in pop and "cap " not in pop and "(cap" not in pop and "cap)" not in pop else bad.append("popup: cap 标识符仍有引用形态")

# ---- 门7) 云快照：文件数对账 version.json + CSS 名集/MD5 全等 ----
try:
    zs = zipfile.ZipFile(SNAP)
    snames = zs.namelist()
    vj = json.loads(zs.read("version.json"))
    vlist = vj.get("files", [])
    print("snapshot version:", vj.get("v"), "| files:", len(vlist), "| zip entries:", len(snames))
    if vj.get("v") == "8.7.108":
        ok += 1
    else:
        bad.append("快照 version.json v != 8.7.108")
    zset = set(n for n in snames if not n.endswith("/") and n != "version.json")
    vset = set(f["p"] for f in vlist)
    if zset == vset:
        ok += 1
        print(f"  [OK] 快照 zip 实体与 version.json 清单全等（{len(vset)} 文件）")
    else:
        bad.append(f"快照清单对账差: zip-only={sorted(zset - vset)[:3]} list-only={sorted(vset - zset)[:3]}")
    css_main = {n: hashlib.md5(z.read(n)).hexdigest() for n in names if re.match(CSS_RE, n)}
    css_snap = {n: hashlib.md5(zs.read(n)).hexdigest() for n in snames if re.match(CSS_RE, n)}
    if set(css_main) == set(css_snap) and all(css_main[k] == css_snap[k] for k in css_main):
        ok += 1
        print(f"  [OK] CSS 名集+MD5 全等（{len(css_main)} 文件）")
    else:
        bad.append("CSS 名集/MD5 不一致")
    snapjs = "".join(zs.read(n).decode("utf-8", "ignore") for n in snames if re.match(r"next/static/chunks/.*\.js$", n))
    gone(snapjs, "incognito", "快照 JS: 无痕零残留")
    has(snapcss_all := "".join(zs.read(n).decode("utf-8", "ignore") for n in snames if re.match(CSS_RE, n)), ".cl-fade-veil", "快照 CSS: 羽化遮罩在位")
    has(snapjs, '.querySelector(".cl-dock")', "快照 JS: Dock 顶缘实测在位")
    has(snapjs, "favicon-src2:", "快照 JS: 源记忆键在位")
    has(snapjs, "M12 17v5", "快照 JS: Lucide Pin 在位")
except Exception as e:
    bad.append(f"快照门异常: {e}")

print(f"\n===== verify-zip v8.7.108: {ok} OK / {len(bad)} BAD =====")
for b in bad:
    print("  [BAD]", b)
sys.exit(1 if bad else 0)
