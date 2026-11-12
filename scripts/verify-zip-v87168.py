#!/usr/bin/env python3
# verify-zip-v87168.py — v8.7.168 发版包串锚验证
# 168 新门：文件夹交互精修七连修（①悬停放大反馈 ②出夹地理闸 ③放大动画
#           图标零位移 ④右键专属菜单+解散 ⑤纯白半透明夹色 ⑥抽屉夹层
#           点空白不误关抽屉 ⑦磁贴两侧空白可退抽屉）+ changelog 168 +
#           云快照同步 + 与 gh-pages 167 成对 diff
# 继承门：167 引擎下载入口 / 166 OCR 双轨 / 165 退役串 / 方形律 / 结构防呆
import zipfile, json, re, sys

ROOT = "/home/z/beta-wt"
ZIP = f"{ROOT}/download/v8.7.168/ChuShi-NewTab-v8.7.168.zip"
SNAP = f"{ROOT}/download/v8.7.168/ChuShi-CloudSnapshot-v8.7.168.zip"
VER = "8.7.168"

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

pages = [data[n].decode("utf-8", "ignore") for n in names if n.endswith((".html", ".js"))]
alljs = "\n".join(pages)
src_ql = open(f"{ROOT}/src/components/startpage/QuickLinks.tsx").read()

# ---------- v8.7.168 新门：七连修 ----------
T("10 changelog 8.7.168 标题（文件夹交互精修）", "文件夹交互精修" in alljs)
T("11 changelog 168 高亮-悬停放大反馈", "文件夹轻微放大" in alljs)
T("12 changelog 168 高亮-出夹判定收紧", "收紧文件夹页面内拖拽的出夹判定" in alljs)
T("13 changelog 168 高亮-放大动画图标零位移", "站点图标向右位移" in alljs)
T("14 changelog 168 高亮-右键专属菜单+解散", "解散文件夹（站点散落回墙不丢失）" in alljs)
T("15 changelog 168 高亮-纯白夹色", "文件夹颜色统一改为半透明白色" in alljs)
T("16 changelog 168 高亮-⑥抽屉误判修复", "被误判成退出抽屉" in alljs)
T("17 changelog 168 高亮-⑦两侧空白退出", "两侧空白处无反应" in alljs)
T("18 ①dropHint scale-[1.12] 在位（bundle）", "scale-[1.12]" in alljs)
T("19 ①dropHint 链路在位（src：state+分支+清零）",
  "dropHintId" in src_ql and "setDropHintId(to)" in src_ql
  and "setDropHintId(null)" in src_ql)
T("20 ②出夹地理闸在位（src：起点快照+浮层中心实测）",
  "dragStartedInsideRef" in src_ql and src_ql.count("insidePanel") >= 5
  and src_ql.count("insidePanel ? prev :") == 2
  and "e.active.rect.current.translated" in src_ql)
T("21 ③will-change-transform 在位（bundle）", "will-change-transform" in alljs)
T("22 ③字母格 tracking-normal 在位（bundle）", "tracking-normal" in alljs)
T("23 ④右键菜单触发在位（src：onFolderContext）",
  "onFolderContext" in src_ql and "setFolderCtx({ id, x, y })" in src_ql)
T("24 ④菜单三项目录在位（bundle）",
  "文件夹菜单" in alljs and "打开文件夹" in alljs and "解散文件夹" in alljs)
T("25 ④重命名引导在位（src：renameBoot+startInRename）",
  "renameBoot" in src_ql and "startInRename" in src_ql and "autoRename" in src_ql)
T("26 ⑤夹体白雾渐变（bundle：rgba 白 + 零 hsl 夹体）",
  "rgba(255,255,255,var(--tile-grad-a1, 0.30))" in alljs
  and "rgba(255,255,255,var(--tile-ring-a, 0.42))" in alljs)
T("27 ⑤夹名 hueOf 色相退役（src：FolderTileVisual 无 hue）",
  "const hue = hueOf(folder.name)" not in src_ql)
T("28 ⑥⑦抽屉空白关闭统一判定（src：veil+滚层双挂）",
  "drawerBlankClose" in src_ql
  and src_ql.count("onPointerDown={drawerBlankClose}") == 2
  and "if (openFolderId) return;" in src_ql)
T("29 ⑥lucide FolderOpen 图标导入", "FolderOpen" in src_ql)

# ---------- 继承门：167/166/165 ----------
T("30 Releases 直链在位（pdf-bridge-v1.0.0 zip）",
  "releases/download/pdf-bridge-v1.0.0/chushi-pdf-bridge-win64-v1.0.0.zip" in alljs)
T("31 manifest extension_pages CSP 含 wasm-unsafe-eval",
  "wasm-unsafe-eval" in man.get("content_security_policy", {}).get("extension_pages", ""))
T("32 ocr/tesseract-worker.min.js 随包", "ocr/tesseract-worker.min.js" in names)
T("33 ocr core SIMD-LSTM wasm.js 随包", "ocr/tesseract-core-simd-lstm.wasm.js" in names)
T("34 ocr core SIMD-LSTM wasm 二进制随包", "ocr/tesseract-core-simd-lstm.wasm" in names)
T("35 ocr 双许可文件随包", "ocr/LICENSE-tesseractjs.txt" in names and "ocr/LICENSE-tesseractjs-core.txt" in names)
T("36 changelog 8.7.167 标题保留", "OCR 本地增强引擎可以直接下载了" in alljs)
T("37 changelog 8.7.166 标题保留", "扫描件也能提取文字了" in alljs)
T("38 changelog 8.7.165 条目保留", "文件夹磁贴图标恢复正方形" in alljs)
T("39 changelog 8.7.164 条目保留", "PDF 工具箱修复" in alljs)
T("40 changelog 8.7.163 条目保留", "文件夹拖拽体验五连修" in alljs)
T("41 mergeLinksWith 退役（bundle 零引用）", "mergeLinksWith" not in alljs)
T("42 免开层入夹保留（putLinkIntoFolder 源码在位）",
  "putLinkIntoFolder" in open(f"{ROOT}/src/lib/startpage/link-folders.ts").read())
T("43 reorderWall 保留（源码在位）", "reorderWall" in src_ql)
T("44 迷你格 aspect-square 在位", "aspect-square" in alljs)
T("45 容器 content-start items-start 在位", "content-start items-start" in alljs)
T("46 计数格 leading-none 在位", "leading-none" in alljs)
T("47 v8.7.162 img 统一律保留", "max-w-none" in alljs)
T("48 cs-bg-frozen CSS 闸保留", "cs-bg-frozen" in alljs)
T("49 document.hidden 闸保留", "document.hidden" in alljs)
T("50 OCR 源码署名头（ocr-engine.ts 飞鼠致谢）",
  "牢蜂" in open(f"{ROOT}/src/lib/startpage/ocr-engine.ts").read())
T("51 桥接源码署名头（chushi-pdf-bridge.js 飞鼠致谢）",
  "LaoFeng" in open(f"{ROOT}/bridge/chushi-pdf-bridge.js").read())

# ---------- 云快照 ----------
sz = zipfile.ZipFile(SNAP)
snames = sz.namelist()
sfiles = [n for n in snames if not n.endswith("/")]
T("52 云快照 ocr/ 资产随发（5 件）",
  all(f"ocr/{f}" in snames for f in (
      "tesseract-worker.min.js", "tesseract-core-simd-lstm.wasm.js",
      "tesseract-core-simd-lstm.wasm", "LICENSE-tesseractjs.txt", "LICENSE-tesseractjs-core.txt")))
T("53 云快照零 _next 残留", not [n for n in snames if "_next" in n])
snapver = sz.read("version.json").decode("utf-8") if "version.json" in snames else ""
T(f"54 云快照 version={VER}", json.loads(snapver).get("v") == VER)
sall = "\n".join(sz.read(n).decode("utf-8", "ignore") for n in sfiles if n.endswith((".js", ".html", ".css", ".json")))
T("55 云快照 changelog 168 同步", "文件夹交互精修" in sall)
T("56 云快照 ①dropHint 同步", "scale-[1.12]" in sall)
T("57 云快照 ④右键菜单同步", "解散文件夹" in sall)
T("58 云快照 ⑤白夹色同步", "rgba(255,255,255,var(--tile-grad-a1, 0.30))" in sall)
T("59 云快照 OCR 随包同步", "ocr/tesseract-worker.min.js" in snames)
T("60 云快照 Releases 直链同步", "releases/download/pdf-bridge-v1.0.0" in sall)

# ---------- 云快照文件清单守恒（与 gh-pages v8.7.167 成对 diff：仅哈希更名） ----------
g167 = set(x["p"] for x in json.load(open("/tmp/ghp167-v.json"))["files"])
s168f = set(sfiles)
only167 = g167 - s168f
only168 = s168f - g167
only167.discard("version.json")
only168.discard("version.json")
renamed = {p for p in only167 if re.match(r"next/static/(chunks/[0-9a-f]{16}\.js|[^/]+/)", p)}
extra_ok = all("next/static/" in p for p in only168)
T(f"61 快照 vs 167：退役侧全为哈希更名（{len(only167)} 件）",
  len(renamed) == len(only167) and len(only167) <= 8)
T(f"62 快照 vs 167：新增侧全为 next/static 哈希件（{len(only168)} 件）",
  extra_ok and len(only168) == len(only167))

print(f"\nVERIFY-ZIP-v87168: {passed} PASS / {len(failed)} FAIL")
if failed:
    print("FAILED:", *failed, sep="\n  - ")
    sys.exit(1)
