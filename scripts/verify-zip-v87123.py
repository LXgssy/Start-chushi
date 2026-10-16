#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v8.7.123 zip 内容门（verify-zip-v87116 骨架 + 本轮改写）
本轮三项（用户指令）：
① 历史壁纸本地恢复根修：file 类入史归档 IndexedDB 独立槽 whfile:<id>，
   恢复按条目 id 精确取——单一槽被新壁纸覆盖「切不回旧壁纸」根除；
   无归档诚实提示重传（旧文案退役，绝不再拿当前槽冒充）。
② 云端同步补历史壁纸：历史迁入 settings.wallHistory（六键之一，闭源
   同步模块必然随行）——登录云同步/从云端恢复/备份导出导入全链随行；
   chrome.storage.sync 旧通道退役，挂载期一次性迁移（readLegacySyncHistory
   → settings → clearLegacySyncHistory，start:wh: 兜底同迁）。
③ 待办/便签常驻磁贴钉位上云：settings.pinTile（{todo,note}），拖拽落点
   /resize clamp 经 onPinPos 写回；旧 localStorage 键 start:pintile-todo/
   note 一次性迁移后清除；跨设备坐标 display-only clamp 回视口。
回归锚：抽屉羽化遮罩（v8.7.121 lift:32×2/drop:24/对冲 style）、常驻形态
（maxHeight 对冲 + BOTTOM_RESERVE=40）、遮罩 CSS、免责门（v8.7.112）、
custom-wallpaper 主槽、changelog 8.7.123。
锚串纪律：不跨引号/换行边界；页面 chunk 锚只取字符串字面量与 minify 后
的字面形态（属性名 wallHistory/pinTile 保留实测）。"""
import zipfile, json, hashlib, sys

BASE = "/home/z/beta-wt/download/v8.7.123/"
ZIP = BASE + "ChuShi-NewTab-v8.7.123.zip"
SNAP = BASE + "ChuShi-CloudSnapshot-v8.7.123.zip"
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
if man.get("version") == "8.7.123":
    ok += 1
else:
    bad.append("manifest version != 8.7.123")

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

# ---- 门4) 页面 chunk 收集 ----
pagejs = ""
for n in names:
    if n.startswith("next/static/") and n.endswith(".js"):
        pagejs += z.read(n).decode("utf-8", "ignore")

# ---- 门5) ①本机历史归档恢复根修 ----
has(pagejs, "whfile:", "file 类归档槽前缀 whfile:（IndexedDB 独立槽）")
has(pagejs, "该壁纸的原始文件不在本机（旧版本上传/重装/换设备后丢失），请重新上传一次", "无归档诚实提示（新文案）")
gone(pagejs, "该壁纸的原始文件不在本机（重装/换设备后丢失），请重新上传一次", "旧提示文案退役")
has(pagejs, "custom-wallpaper", "custom-wallpaper 主槽原样")

# ---- 门6) ②历史随 settings 上云 ----
exact(pagejs, "wallHistory", 3, "settings.wallHistory 属性（推导读取+patch 写入+changelog）恰三处")
has(pagejs, "whIndex", "旧通道索引键 whIndex（一次性迁移读取）")
exact(pagejs, "start:wh:", 3, "纯网页兜底旧键 start:wh:（读×2 清×1）")
has(pagejs, "最近使用（跨设备同步）", "历史区 UI 标题原样")

# ---- 门7) ③磁贴钉位上云 ----
exact(pagejs, "pinTile", 7, "settings.pinTile 属性恰七处（types 注释不入包/PinnedTiles+page 迁移+提交）")
has(pagejs, "start:pintile-todo", "旧钉位键 start:pintile-todo（一次性迁移读取）")
has(pagejs, "start:pintile-note", "旧钉位键 start:pintile-note（一次性迁移读取）")

# ---- 门8) changelog 8.7.123 ----
has(pagejs, '"8.7.123"', "changelog 8.7.123 版本串")
has(pagejs, "历史壁纸修复×3", "changelog 8.7.123 标题")
has(pagejs, "随账号云同步", "changelog 8.7.123 要点（云同步）")
has(pagejs, "磁贴钉位上云", "changelog 8.7.123 要点（钉位）")

# ---- 门9) 回归：抽屉羽化遮罩（v8.7.121）原样 ----
has(pagejs, "marginTop:-32,paddingTop:32,marginBottom:-24,paddingBottom:24", "抽屉滚动层对冲外扩 style 原样")
exact(pagejs, "lift:32", 2, "lift:32 恰两处（常驻 docked + 抽屉 top）")
has(pagejs, "drop:24", "FadeVeil drop:24 原样")
has(pagejs, "maxHeight:F+32,marginTop:-32,paddingTop:32,paddingBottom:40", "常驻形态 maxHeight 对冲原样")

# ---- 门10) 遮罩 CSS 回归 ----
css = ""
for n in names:
    if n.endswith(".css"):
        css += z.read(n).decode("utf-8", "ignore")
has(css, ".cl-fade-veil", "遮罩 CSS 在位")
has(css, ".cl-fade-veil-top", "顶遮罩 mask 渐变")
has(css, ".cl-fade-veil-bottom", "底遮罩 mask 渐变")

# ---- 门11) 云端快照对账 ----
try:
    snap = zipfile.ZipFile(SNAP)
    snames = snap.namelist()
    vj = json.loads(snap.read("version.json"))
    vlist = [f["p"] if isinstance(f, dict) else f for f in (vj.get("files") or [])]
    print("snapshot version:", vj.get("v"), "| files:", len(vlist), "| zip entries:", len(snames))
    if vj.get("v") == "8.7.123":
        ok += 1
        print("  [OK] 快照 version.json v=8.7.123")
    else:
        bad.append("snapshot v != 8.7.123")
    vset = set(vlist)
    sset = {n for n in snames if not n.endswith("/") and n != "version.json"}
    if vset == sset:
        ok += 1
        print(f"  [OK] 快照 zip 实体与 version.json 清单全等（{len(vset)} 文件）")
    else:
        bad.append(f"snapshot manifest diff: only-manifest={len(vset-sset)} only-zip={len(sset-vset)}")
    # 快照内页面层也须带新锚（热更通道内容同源核验）
    sj = ""
    for n in snames:
        if n.startswith("next/static/") and n.endswith(".js") and not n.endswith(".map"):
            sj += snap.read(n).decode("utf-8", "ignore")
    has(sj, "whfile:", "快照页面层 whfile: 锚")
    has(sj, "wallHistory", "快照页面层 wallHistory 锚")
    has(sj, "历史壁纸修复×3", "快照 changelog 8.7.123")
except Exception as e:
    bad.append("snapshot check error: " + str(e))

# ---- 门12) sniffer 免责门回归（v8.7.112 锚原样） ----
phtml = z.read("popup.html").decode("utf-8")
has(phtml, 'id="sniff-gate"', "popup·声明弹层挂载点")
has(phtml, 'id="sniff-gate-yes"', "popup·同意按钮")

# ---- 门13) 快照文件数基线（101 文件与 v8.7.115~121 同代） ----
snap2 = zipfile.ZipFile(SNAP)
body = [n for n in snap2.namelist() if not n.endswith("/") and n != "version.json"]
print("snapshot body files:", len(body))
if len(body) == 101:
    ok += 1
else:
    bad.append(f"snapshot body files {len(body)} != 101")

print()
print(f"PASS {ok}  FAIL {len(bad)}")
for b in bad:
    print("  [BAD]", b)
sys.exit(0 if not bad else 1)
