#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v8.7.157 zip 验证（verify-zip-v87156 全量回归 + 九宫格/白卡专项门）
本轮：文件夹磁贴换新装（用户选型）。
  A. 九宫格迷你预览磁贴：FolderTileVisual 内容层 2×2 缩微站点格——
     1~4 站逐格 TileIcon bare 形态（解析链同构：上传图标 > 自绘册 >
     favicon 竞速 > 首字母）、>4 站前 3 格 + 「+N」计数格、空夹夹形
     占位；data-cl-folder-grid 稳定标记。
  B. 展开面板白卡：FolderPopover glass-card → solid-card（globals.css
     实底不透明，浅色纯白 / 暗色墨夜实底；体积感交 shadow-2xl）。
回归：v8.7.156 全量（文件夹系统锚 / 写合并 / 拆分 188 / 三闸门冻结 /
chaoxing / 精度档 / 壳 bootAccent / MOUNT_VER）/ auth SHA 钉定。
锚串纪律：不跨引号/换行边界；swc minify 改名免疫——行为锚只取字符串
字面量/模板串片段/URL 片段。"""
import zipfile, json, re, sys, hashlib, pathlib

ZIP = "/home/z/beta-wt/download/v8.7.157/ChuShi-NewTab-v8.7.157.zip"
SRC_TS = pathlib.Path("/home/z/beta-wt/src/lib/startpage/selfdraw-icons.ts")
z = zipfile.ZipFile(ZIP)
names = z.namelist()
ok, bad = 0, []

def gate(cond, tag, detail=""):
    global ok
    if cond:
        ok += 1
        print(f"  [OK] {tag}")
    else:
        bad.append(f"{tag}: {detail}")
        print(f"  [FAIL] {tag} {detail}")

def has(payload, needle, tag, count_ge=1):
    gate(payload.count(needle) >= count_ge, tag, f"expect>={count_ge} got {payload.count(needle)}")

def gone(payload, needle, tag):
    gate(needle not in payload, "[GONE] " + tag, "still present")

# ---- 门1) manifest 版本 ----
man = json.loads(z.read("manifest.json"))
print("manifest version:", man.get("version"))
gate(man.get("version") == "8.7.157", "manifest 8.7.157")

# ---- 门2) auth SHA 钉定 ----
sha = hashlib.sha256(z.read("ext-chushi-auth.js")).hexdigest()
print("auth sha256:", sha[:16], "…")
gate(sha == "b1776839307a6685752b62cb4875de366dfc6f8ade1ece4fc7a14b2e9e8fb794",
     "auth SHA 钉定", sha)

# ---- 门3) 自绘注册表拆分（v8.7.155 全量回归） ----
gate("selfdraw-icons.json" not in names, "全册 selfdraw-icons.json 退役")
split = sorted(n for n in names if re.match(r"^selfdraw/i/[\w-]+\.json$", n))
print("split files:", len(split))
gate(len(split) == 188, "拆分条目 188 文件", str(len(split)))
src = SRC_TS.read_text()
keys_src = set(re.findall(r'"[\w.-]+":\s*"([\w-]+)"', src.split("const HOST_MAP")[1].split("};")[0]))
keys_zip = {n[len("selfdraw/i/"):-len(".json")] for n in split}
gate(keys_src <= keys_zip, "HOST_MAP 值集 ⊆ 文件集",
     f"missing={sorted(keys_src-keys_zip)[:5]}")

# ---- 门4) chaoxing 描摹锚（回归） ----
t = json.loads(z.read("selfdraw/i/chaoxing.json"))
vb, body, dom = t
gate(dom == "#E60012", "chaoxing dom 纯红底")
gate("M44.45 946.25" in body, "chaoxing 白流星贝塞尔锚")

# ---- 门5) 页面 chunk 锚（v8.7.155/156 回归 + v8.7.157 九宫格/白卡专项） ----
chunks = [n for n in names if re.match(r"next/static/chunks/.*\.js$", n)]
print(f"chunks: {len(chunks)}")
alljs = "".join(z.read(n).decode("utf-8", "ignore") for n in chunks)
# v8.7.155 回归
has(alljs, "selfdraw/i/", "chunk: 拆分 URL 模板前缀")
has(alljs, ".json?v=", "chunk: 版本钉 ?v= 模板")
has(alljs, "force-cache", "chunk: force-cache 长缓存")
has(alljs, "chaoxing.com", "chunk: HOST_MAP chaoxing 回归")
has(alljs, "geometricPrecision", "chunk: v8.7.154 精度档回归")
has(alljs, "cs-bg-frozen", "chunk: 冻结律挂类（useBgFreeze/cs-hidden）", count_ge=2)
has(alljs, "cs-hidden", "chunk: 隐藏页闸门", count_ge=2)
has(alljs, "多开新标签页掉帧根修", "chunk: changelog 8.7.155 标题回归")
has(alljs, "data-wallpaper", "chunk: v8.7.152 data-wallpaper 回归")
# v8.7.156 文件夹系统（字符串字面量锚，minify 免疫）
has(alljs, "cl-wall-zone", "chunk: 墙面空白 droppable id")
has(alljs, "cl-folder-zone", "chunk: 夹区空白 droppable id")
has(alljs, "data-cl-folder-popover", "chunk: popover 守卫标记")
has(alljs, "data-entry-id", "chunk: 磁贴定位标记")
has(alljs, "新建文件夹", "chunk: 新建文件夹（createFolder 默认名/右键菜单/⌘K）", count_ge=2)
has(alljs, "把磁贴拖进来收纳", "chunk: 空夹提示")
has(alljs, "拆散文件夹", "chunk: 拆夹散落")
has(alljs, "个站点", "chunk: 头部计数")
has(alljs, "打开文件夹 ", "chunk: 文件夹磁贴 aria")
has(alljs, "拖磁贴到夹上悬停半秒", "chunk: 建夹引导 toast")
has(alljs, "磁贴文件夹 + 多开拖拽掉帧根修", "chunk: changelog 8.7.156 标题")
has(alljs, "pagehide", "chunk: 写合并 pagehide 兜底", count_ge=2)
has(alljs, "visibilitychange", "chunk: 写合并 隐藏页兜底", count_ge=2)
# v8.7.157 九宫格迷你预览 + 白卡专项
has(alljs, "data-cl-folder-grid", "chunk: 九宫格内容层稳定标记")
has(alljs, "solid-card", "chunk: 白卡类名（FolderPopover）")
has(alljs, "文件夹磁贴换新装", "chunk: changelog 8.7.157 标题")
# css 冻结三闸门 + 白卡定义（回归）
css = "".join(z.read(n).decode("utf-8", "ignore")
              for n in names if re.match(r"next/static/chunks/.*\.css$", n))
has(css, "animation-play-state:paused", "css: 冻结 play-state（minify 形态）")
for cls in ("cs-bg-frozen", "cs-drawer", "cs-hidden"):
    has(css, f"html.{cls} .aurora-blob", f"css: {cls} 极光闸门")
has(css, "html.cs-drawer .kenburns", "css: 抽屉 kenburns 闸门")
has(css, ".solid-card", "css: 白卡 .solid-card 定义")
has(css, ".dark .solid-card", "css: 白卡暗色实底")

# ---- 门6) 壳层回归 ----
sb = z.read("shell-bridge.js").decode("utf-8")
has(sb, "bootAccent", "shell-bridge: bootAccent 两级取色")
has(sb, "start:settings", "shell-bridge: localStorage 同源取色")
extbg = z.read("ext-bg.js").decode("utf-8")
has(extbg, "SNAP_MIRRORS", "ext-bg: 快照更新器镜像列表")
has(extbg, "version.json", "ext-bg: 云端 manifest 比对")

# ---- 门7) MOUNT_VER 未动 + manifest 权限 ----
snf = z.read("sniffer-float.js").decode("utf-8")
has(snf, 'var MOUNT_VER = "v8.7.151"', "浮窗 MOUNT_VER 未动")
gate("alarms" in man.get("permissions", []), "manifest alarms")
gate(any("cs-snap/sandbox.html" in p for p in man.get("sandbox", {}).get("pages", [])),
     "manifest 快照沙箱特权")

# ---- 门8) 云端快照载荷 ----
snap_dir = pathlib.Path("/home/z/beta-wt/download/v8.7.157/cloud-snapshot")
vj = json.loads((snap_dir / "version.json").read_text())
files = vj.get("files", [])
paths = {f["p"] for f in files}
gate(vj.get("v") == "8.7.157", "快照 version.json v8.7.157")
gate("selfdraw-icons.json" not in paths, "快照载荷全册退役")
gate(sum(1 for p in paths if p.startswith("selfdraw/i/")) == 188, "快照载荷拆分 188")
gate("index.html" in paths and "shell.html" not in paths, "快照载荷页面文件集形态")

print(f"\n===== verify-zip-v87157: {ok} 绿 / {len(bad)} 红 =====")
for b in bad:
    print("  RED:", b)
sys.exit(1 if bad else 0)
