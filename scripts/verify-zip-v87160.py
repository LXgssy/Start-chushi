#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v8.7.160 zip 验证（verify-zip-v87159 全量回归 + 文件夹动画修补专项门）
本轮：用户反馈三问题修复。
  A. 三形态收起动画补全：morph exit 缩回磁贴（latch 渲染期补位——openFolder
     消失同一轮渲染同步 exitFolder，portal 不闪断，AnimatePresence exit 才
     接得住）+ safeToRemove 卸载报告（usePresence 消费者义务，缺失则卡片
     停在 gone 终态永不卸载）；inline 卡内 closing 状态机（180ms easeIn
     收缩淡出播完才真身 onClose）+ 外点守卫迁入卡内；
  B. morph 覆盖式定位：白卡中心与磁贴中心对齐（覆盖磁贴上层展开，
     v8.7.159 的磁贴正下方开卡废弃）；
  C. 夹内磁贴零入场动画：Tile intro prop（夹内面板禁用，墙面默认播）+
     morph 内容层与卡片 rect 动画分离（容器 inline 固定量尺终态尺寸，
     卡片纯覆盖层，shown 终点 100%）；
  D. 回归：v8.7.159 全量 + v8.7.158 三形态 + v8.7.157/156/155 全链 +
     auth SHA 钉定。
锚串纪律：不跨引号/换行边界；swc minify 改名免疫——行为锚只取字符串
字面量/模板串片段/URL 片段（safeToRemove/变量名会被改名，一律行为断言）。"""
import zipfile, json, re, sys, hashlib, pathlib

ZIP = "/home/z/beta-wt/download/v8.7.160/ChuShi-NewTab-v8.7.160.zip"
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
gate(man.get("version") == "8.7.160", "manifest 8.7.160")

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

# ---- 门5) 页面 chunk 锚（v8.7.155/156/157 回归 + v8.7.160 三形态专项） ----
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
has(alljs, "data-cl-folder-popover", "chunk: popover 守卫标记", count_ge=2)
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
# v8.7.157 九宫格迷你预览 + 白卡（回归）
has(alljs, "data-cl-folder-grid", "chunk: 九宫格内容层稳定标记")
has(alljs, "solid-card", "chunk: 白卡类名（FolderPopover/InlineCard）", count_ge=2)
has(alljs, "文件夹磁贴换新装", "chunk: changelog 8.7.157 标题")
# v8.7.159 三形态专项（回归）
has(alljs, "folderOpenStyle", "chunk: folderOpenStyle 设置键")
has(alljs, "folder-open-style", "chunk: 设置选择器 segKey")
has(alljs, "文件夹展开方式", "chunk: 设置面板标签", count_ge=2)
has(alljs, "文件夹展开方式三选一", "chunk: changelog 8.7.158 标题（回归）")
has(alljs, "data-cl-folder-morph-preview", "chunk: morph 迷你格覆盖层标记")
has(alljs, "data-cl-folder-modal", "chunk: modal 压暗遮罩标记")
has(alljs, "data-cl-folder-inline", "chunk: inline 膨胀卡标记")
has(alljs, "max-h-[min(420px,58vh)]", "chunk: modal 内容区上限")
# v8.7.159 morph 真形变重做专项（回归）
has(alljs, "磁贴本体长大成白卡", "chunk: changelog 8.7.159 真形变口径标题")
has(alljs, ".tile-shell", "chunk: morph 起点 .tile-shell 本体实测查询", count_ge=2)
has(alljs, "gap-[3px] p-[9px]", "chunk: skin 层与九宫格磁贴同源规格", count_ge=2)
has(alljs, "bg-white/30 dark:bg-zinc-900/70", "chunk: skin 磁贴观感玻璃底")
# v8.7.160 文件夹动画修补专项（字符串字面量锚）
has(alljs, "文件夹动画修补", "chunk: changelog 8.7.160 标题")
has(alljs, "三种展开方式的收起动画补全", "chunk: changelog 8.7.160 收起补全条目")
has(alljs, "形变展开改为覆盖式", "chunk: changelog 8.7.160 覆盖式条目")
has(alljs, "磁贴不再播放入场动画", "chunk: changelog 8.7.160 零入场条目")
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
snap_dir = pathlib.Path("/home/z/beta-wt/download/v8.7.160/cloud-snapshot")
vj = json.loads((snap_dir / "version.json").read_text())
files = vj.get("files", [])
paths = {f["p"] for f in files}
gate(vj.get("v") == "8.7.160", "快照 version.json v8.7.160")
gate("selfdraw-icons.json" not in paths, "快照载荷全册退役")
gate(sum(1 for p in paths if p.startswith("selfdraw/i/")) == 188, "快照载荷拆分 188")
gate("index.html" in paths and "shell.html" not in paths, "快照载荷页面文件集形态")

print(f"\n===== verify-zip-v87159: {ok} 绿 / {len(bad)} 红 =====")
for b in bad:
    print("  RED:", b)
sys.exit(1 if bad else 0)
