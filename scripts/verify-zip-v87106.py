#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v8.7.106 zip 内容门（verify-zip-v87105 骨架 + 本轮改写）
本轮：hover 沉降描边位移根修（TileIcon ring+body 并入 frost 子树 + hover 换轨
CSS transition）/ PinTileFab 去拖拽固定化（start:fab-* 钉位键退役）/
PinnedTiles 磁贴本体拖拽（start:pintile-* 钉位键 + 禁区移交）/ 滚动判定近底
（VEIL_LIFT 上探）/ 壁纸历史 7 条上限 + 视频第一帧缩略（onloadeddata/onseeked）
锚串纪律：不跨引号/换行边界；swc minify 改名免疫（只取字符串字面量/类名/URL/属性名）。"""
import zipfile, json, re, hashlib, sys

BASE = "/home/z/beta-wt/download/v8.7.106/"
ZIP = BASE + "ChuShi-NewTab-v8.7.106.zip"
SNAP = BASE + "ChuShi-CloudSnapshot-v8.7.106.zip"
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
if man.get("version") == "8.7.106":
    ok += 1
else:
    bad.append("manifest version != 8.7.106")

# ---- 门2) auth SHA 钉定 ----
auth = z.read("ext-chushi-auth.js")
sha = hashlib.sha256(auth).hexdigest()
print("auth sha256:", sha[:16], "…")
if sha == "b1776839307a6685752b62cb4875de366dfc6f8ade1ece4fc7a14b2e9e8fb794":
    ok += 1
    print("  [OK] ext-chushi-auth.js SHA256 钉定一致")
else:
    bad.append(f"auth sha mismatch: {sha}")

# ---- 门3) 零 _next 残留 + 零无痕/零上限回归 ----
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

# ---- 门4) CSS 锚（新增 + 存量；turbopack v16 产物 CSS 在 chunks/ 下） ----
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
has(css, ".cl-fab-dragging", "CSS: 拖拽全局防选中（磁贴拖拽沿用）")
has(css, ".tile-frost", "CSS: 磁贴磨砂基线（存量）")
has(css, ".cl-drawer-veil", "CSS: 抽屉纱罩（存量）")
has(css, ".link-intro", "CSS: 磁贴入场通道（存量）")

# ---- 门5) JS chunk 锚 ----
# 5a) 清晰源链（v8.7.105 律延续）
has(alljs, "favicon.im/", "JS: favicon.im 高清源在位")
has(alljs, "https://www.google.com/s2/favicons?domain=", "JS: Google s2 压轴高清")
has(alljs, "favicon-src2:", "JS: 源记忆键换代")
# 5b) 8.7.44 居中样式（v8.7.105 律延续）
has(alljs, "rounded-md object-contain", "JS: favicon 居中小图类名（8.7.44 形态）")
has(alljs, "linear-gradient(135deg, hsl(", "JS: 域名色相渐变底（8.7.44 底色）")
# 5c) hover 换轨 CSS transition（v8.7.106 本轮：framer whileHover 退役）
has(alljs, "hover:scale-[1.07]", "JS: hover 纯放大类名（CSS transition 通道）")
has(alljs, "duration-[350ms]", "JS: hover 350ms 时长类名")
has(alljs, "ease-[cubic-bezier(0.22,1,0.36,1)]", "JS: hover 减速曲线类名")
# 5d) PinTileFab 固定化（本轮：钉位/拖拽退役）
gone(alljs, "start:fab-todo", "JS: 浮窗钉位键退役（固定化律）")
gone(alljs, "start:fab-note", "JS: 浮窗钉位键退役（固定化律）")
gone(alljs, "（可拖拽）", "JS: 浮窗 aria 拖拽字样退役")
has(alljs, "常驻磁贴开关", "JS: 浮窗 aria-label 新形态")
# 5e) PinnedTiles 磁贴本体拖拽（本轮）
has(alljs, "start:pintile-todo", "JS: 待办磁贴钉位键")
has(alljs, "start:pintile-note", "JS: 便签磁贴钉位键")
has(alljs, "onloadeddata", "JS: 视频首帧解码回调（videoThumb）")
has(alljs, "onseeked", "JS: 视频首帧 seek 兜底（videoThumb）")
has(alljs, "playsInline", "JS: 视频首帧采集 playsInline")
has(alljs, "pintile-label", "JS: 便签磁贴标签类（存量）")
has(alljs, "cl-fab-dragging", "JS: 拖拽防选中类沿用")
has(alljs, "今日无事，从容一些", "JS: 待办空态（磁贴+面板共用）", 2)
has(alljs, "todoTile", "JS: settings.todoTile 字段")
has(alljs, "noteTile", "JS: settings.noteTile 字段")
has(alljs, '[aria-label="快捷链接"]', "JS: 磁贴墙禁区选择器（常驻模式限定）")
has(alljs, ".search-pill", "JS: 搜索框禁区选择器")
# 5f) 壁纸历史（v8.7.105 律延续 + 7 条上限）
has(alljs, "whIndex", "JS: sync 历史索引键")
has(alljs, "start:wh:", "JS: localStorage 兜底通道前缀")
has(alljs, "最近使用（跨设备同步）", "JS: 历史行 UI")
has(alljs, "image/jpeg", "JS: 缩略图 JPEG 压缩")
# 5g) 存量零回归（磁贴墙/纱罩/入场/禅模式）
has(alljs, "cl-links-docked", "JS: 常驻磁贴类（存量）")
has(alljs, "cl-links-drawer", "JS: 抽屉磁贴类（存量）")
has(alljs, "start:links-manage", "JS: 批量管理入口（存量）")
has(alljs, "start:edit-link", "JS: 磁贴编辑事件（存量）")
has(alljs, "cl-drawer-veil", "JS: 抽屉纱罩（存量）")

# ---- 门6) changelog 条目 ----
has(alljs, "8.7.106", "JS: changelog 8.7.106 版本号")
has(alljs, "8.7.105", "JS: changelog 8.7.105 条目并存")
has(alljs, "浮窗开关回归固定", "JS: changelog 8.7.106 高亮词")
has(alljs, "待办与便签可常驻为页面磁贴", "JS: changelog 8.7.105 高亮词（存量）")

# ---- 门7) 云快照：文件数对账 version.json + CSS 名集/MD5 全等 ----
try:
    zs = zipfile.ZipFile(SNAP)
    snames = zs.namelist()
    vj = json.loads(zs.read("version.json"))
    vlist = vj.get("files", [])
    print("snapshot version:", vj.get("v"), "| files:", len(vlist), "| zip entries:", len(snames))
    if vj.get("v") == "8.7.106":
        ok += 1
    else:
        bad.append("快照 version.json v != 8.7.106")
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
    snapcss = "".join(zs.read(n).decode("utf-8", "ignore") for n in snames if re.match(CSS_RE, n))
    snapjs = "".join(zs.read(n).decode("utf-8", "ignore") for n in snames if re.match(r"next/static/chunks/.*\.js$", n))
    gone(snapjs, "incognito", "快照 JS: 无痕零残留")
    has(snapcss, ".cl-fade-veil", "快照 CSS: 羽化遮罩在位")
    has(snapjs, "favicon.im/", "快照 JS: 清晰源在位")
    has(snapjs, "start:pintile-todo", "快照 JS: 磁贴钉位键在位")
    gone(snapjs, "start:fab-todo", "快照 JS: 浮窗钉位键退役")
except Exception as e:
    bad.append(f"快照门异常: {e}")

print(f"\n===== verify-zip v8.7.106: {ok} OK / {len(bad)} BAD =====")
for b in bad:
    print("  [BAD]", b)
sys.exit(1 if bad else 0)
