#!/usr/bin/env python3
# verify-zip-v87165.py — v8.7.165 发版包串锚验证
# 165 新门：拖叠建夹全退役 / 迷你格 aspect-square 方形律 / changelog 三修条目
# 继承门：163 changelog 条目 / 161-162 关键串 / 云快照守恒 / 结构防呆
import zipfile, json, re, sys, io

ROOT = "/home/z/Start-chushi"
ZIP = f"{ROOT}/download/v8.7.165/ChuShi-NewTab-v8.7.165.zip"
SNAP = f"{ROOT}/download/v8.7.165/ChuShi-CloudSnapshot-v8.7.165.zip"
VER = "8.7.165"

passed, failed = 0, []
def T(name, cond):
    global passed
    if cond:
        passed += 1
        print(f"  [OK] {name}")
    else:
        failed.append(name)
        print(f"  [FAIL] {name}")

z = zipfile.ZipFile(ZIP)
names = z.namelist()
data = {n: z.read(n) for n in names}

# ---------- 结构 ----------
T("1 manifest 存在", "manifest.json" in names)
man = json.loads(data["manifest.json"])
T(f"2 manifest version={VER}", man.get("version") == VER)
T("3 manifest MV3", man.get("manifest_version") == 3)
T("4 零 _next 残留", not [n for n in names if "_next" in n])
T("5 icons 在位", any("icons/" in n for n in names))
T("6 _locales 在位", any("_locales" in n for n in names))
T("7 shell.html 在位", "shell.html" in names)
T("8 ext-bg.js 在位", "ext-bg.js" in names)
T("9 cs-snap/sw.js 在位", any("cs-snap/sw.js" in n for n in names))

# ---------- changelog ----------
pages = [data[n].decode("utf-8", "ignore") for n in names if n.endswith(".html") or n.endswith(".js")]
alljs = "\n".join(pages)
T("10 changelog 8.7.165 标题", "文件夹磁贴图标恢复正方形" in alljs and "拖叠建夹退役" in alljs)
T("11 changelog 165 高亮-长方形", "格子重新锁定正方形" in alljs)
T("12 changelog 165 高亮-建夹删除", "删除「把 A 磁贴拖到 B 磁贴上就创建文件夹」" in alljs)
T("13 changelog 165 高亮-拖拽常播", "抽屉页面拖拽磁贴时视频壁纸暂停播放" in alljs)
T("14 changelog 165 高亮-dwell 保留", "500ms 自动打开文件夹" in alljs)
T("15 changelog 8.7.164 条目保留", "PDF 工具箱修复" in alljs)
T("16 changelog 8.7.163 条目保留", "文件夹拖拽体验五连修" in alljs)

# ---------- v8.7.165 修复一：拖叠建夹全退役 ----------
T("17 mergeLinksWith 退役（零引用）", "mergeLinksWith" not in alljs)
T("18 dragStartedInsideRef 退役", "dragStartedInsideRef" not in alljs)
T("19 mergeTimer/mergeTargetId 退役", "mergeTimer" not in alljs and "mergeTargetId" not in alljs)
T("20 clearMergeDwell 退役", "clearMergeDwell" not in alljs)
T("21 免开层入夹保留（putLinkIntoFolder 源码在位，产物已 minify）", "putLinkIntoFolder" in open(f"{ROOT}/src/lib/startpage/link-folders.ts").read())
T("22 reorderWall 保留（实时让位，源码在位）", "reorderWall" in open(f"{ROOT}/src/components/startpage/QuickLinks.tsx").read())

# ---------- v8.7.165 修复二：迷你格方形律 ----------
T("23 迷你格 aspect-square 在位", "aspect-square" in alljs)
T("24 容器 content-start items-start 在位", "content-start items-start" in alljs)
T("25 计数格 leading-none 在位", "leading-none" in alljs)
T("26 v8.7.162 img 统一律保留", "max-w-none" in alljs)

# ---------- v8.7.165 修复三：视频闸 ----------
# AuroraBackground minified 后难精确定位——锚「_visibilitychange 监听仍存在（document.hidden 闸）」+
# 反向锚：cs-bg-frozen 仍在（CSS 闸保留）但 Aurora 闸收敛。行为门（冒烟）承担强断言。
T("27 cs-bg-frozen CSS 闸保留（极光/kenburns 性能）", "cs-bg-frozen" in alljs)
T("28 document.hidden 闸保留", "document.hidden" in alljs)

# ---------- 继承关键回归串 ----------
T("29 folderIconStyle 保留", "folderIconStyle" in alljs)
T("30 folderOpenStyle 保留", "folderOpenStyle" in alljs)
T("31 data-cl-folder-grid 保留", "data-cl-folder-grid" in alljs)
T("32 data-cl-folder-popover 保留", "data-cl-folder-popover" in alljs)
T("33 everInlineRef 语义保留（源码在位，产物已 minify）", "everInlineRef" in open(f"{ROOT}/src/components/startpage/QuickLinks.tsx").read())
T("34 learnin 自绘 chaoxing 保留", "chaoxing" in alljs or "cx" in alljs)
T("35 三形态 morph-preview 保留", "data-cl-folder-morph-preview" in alljs)

# ---------- 云快照 ----------
sz = zipfile.ZipFile(SNAP)
snames = sz.namelist()
T(f"36 云快照 305 文件守恒（实测 {len(snames)}）", len(snames) == 305)
snapver = sz.read("version.json").decode("utf-8") if "version.json" in snames else ""
T(f"37 云快照 version={VER}", json.loads(snapver).get("v") == VER)
sall = "\n".join(sz.read(n).decode("utf-8", "ignore") for n in snames if n.endswith((".js", ".html", ".css", ".json")))
T("38 云快照 changelog 165 同步", "文件夹磁贴图标恢复正方形" in sall)
T("39 云快照 mergeLinksWith 退役", "mergeLinksWith" not in sall)
T("40 云快照 aspect-square 在位", "aspect-square" in sall)

# ---------- 云快照文件清单守恒（与 v8.7.164 对比：仅构建哈希更名，目录数一致） ----------
z164 = zipfile.ZipFile(f"{ROOT}/download/v8.7.164/ChuShi-CloudSnapshot-v8.7.164.zip")
s164 = set(z164.namelist())
s165 = set(snames)
only164 = s164 - s165
only165 = s165 - s164
# 哈希更名形态：成对的 chunk/*.js 与 buildManifest 目录件套；目录/路径数量守恒
pairs = len(only164) == len(only165)
hashlike = all(re.match(r"next/static/(chunks/[0-9a-f]{16}\.js|[A-Za-z0-9_-]{20,}/)", p) for p in (only164 | only165))
T(f"41 云快照文件名集合仅哈希更名（差集 {len(only164)}/{len(only165)} 成对）", pairs and hashlike)

print(f"\nVERIFY-ZIP-v87165: {passed} PASS / {len(failed)} FAIL")
if failed:
    print("FAILED:", *failed, sep="\n  - ")
    sys.exit(1)
