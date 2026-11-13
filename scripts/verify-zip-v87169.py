#!/usr/bin/env python3
# verify-zip-v87169.py — v8.7.169 发版包串锚验证
# 169 新门：文件夹拖拽节奏重做（①3 秒驻留军备+满 3s 才亮反馈+3s 内松手
#           不入夹 ②夹内拖出面板 3 秒驻留关闭回磁贴墙+出夹意图落账
#           ③一镜到底飞入幽灵 WAAPI）+ 500ms 自动开夹退役 + changelog 169 +
#           云快照同步 + 与 gh-pages 168 成对 diff
# 继承门：168 七连修 / 167 引擎下载入口 / 166 OCR 双轨 / 165 退役串 / 结构防呆
import zipfile, json, re, sys

ROOT = "/home/z/beta-wt"
ZIP = f"{ROOT}/download/v8.7.169/ChuShi-NewTab-v8.7.169.zip"
SNAP = f"{ROOT}/download/v8.7.169/ChuShi-CloudSnapshot-v8.7.169.zip"
VER = "8.7.169"

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

# ---------- v8.7.169 新门：拖拽节奏重做 ----------
T("10 changelog 8.7.169 标题（拖拽节奏重做）", "文件夹拖拽节奏重做" in alljs)
T("11 changelog 169 高亮-3s 才亮反馈+3s 内不入夹", "满 3 秒才出现放大反馈" in alljs)
T("12 changelog 169 高亮-满 3s 松手入夹不开夹", "文件夹页面不再自动打开" in alljs)
T("13 changelog 169 高亮-一镜到底飞入", "一镜到底直接飞入文件夹图标" in alljs)
T("14 changelog 169 高亮-出面板 3s 自动收夹", "停留 3 秒" in alljs and "回到磁贴墙" in alljs)
T("15 ①3s 军备计时在位（src：dwellTimer 3000 + armedFolderId）",
  "armedFolderId" in src_ql and "}, 3000);" in src_ql)
T("16 ①500ms 自动开夹退役（src 零 setOpenFolderId(to) 军备路径）",
  "setOpenFolderId(to);" not in src_ql and "}, 500);" not in src_ql)
T("17 ①军备读数先于清理（src：const armed = armedFolderId.current）",
  "const armed = armedFolderId.current;" in src_ql)
T("18 ①未军备松手不入夹（src：军备兜底替换为军备律注释）",
  "免开层入夹」兜底随军备律" in src_ql)
T("19 ③幽灵载荷类型在位（src：FolderFly 接口）",
  "interface FolderFly {" in src_ql and "folderFlyRef" in src_ql and "flyFlushedRef" in src_ql)
T("20 ③幽灵起点量测锚（src：data-cl-drag-icon）", 'data-cl-drag-icon="1"' in src_ql)
T("21 ③满格律推演目标格（src：FolderMiniCells 同源 pad/gap/full）",
  "const pad = grid3 ? 7 : 9;" in src_ql and "Math.min(n, full - 1)" in src_ql)
T("22 ③WAAPI 一镜飞行动画（src：el.animate + cubic-bezier(0.22,1,0.36,1)）",
  "el.animate(" in src_ql and "cubic-bezier(0.22, 1, 0.36, 1)", )
T("23 ③落格淡出+落账（src：flushFolderFly + putLinkIntoFolder 延迟落账）",
  "function flushFolderFly()" in src_ql and "putLinkIntoFolder(prev, f.entryId, f.folderId)" in src_ql)
T("24 ③幽灵 portal z-80 在位（src）", 'className="pointer-events-none fixed z-[80]"' in src_ql)
T("25 ③浮层回飞让位（src：dropAnimation folderFly null 条件）",
  "folderFly\n                  ? null" in src_ql or "dropAnimation={\n                folderFly" in src_ql)
T("26 ③浮层内容让位（src：activeEntry && !folderFly）", "activeEntry && !folderFly ? (" in src_ql)
T("27 ③幽灵 bundle 在位（z-[80] 编译产物）", "z-[80]" in alljs)
T("28 ②出夹驻留计时在位（src：exitTimer + dragOriginFolderId）",
  "exitTimer" in src_ql and "dragOriginFolderId" in src_ql and "exitFiredRef" in src_ql)
T("29 ②驻留监测挂 move（src：handleDragMove 内实测面板矩形）",
  src_ql.index("handleDragMove") < src_ql.index("insidePanelRef.current = inside;"))
T("30 ②驻留关闭目标（src：setOpenFolderId cur===fid 条件收夹）",
  "setOpenFolderId((cur) => (cur === fid ? null : cur));" in src_ql)
T("31 ②出夹意图落账（src：exitFiredRef + takeLinkOutOfFolder 松手兜底）",
  "if (exitFiredRef.current && !putDone)" in src_ql
  and "takeLinkOutOfFolder(prev, from)[0]" in src_ql)
T("32 ②地理闸顺延（src：gateShut = insidePanelRef || exitTimer）",
  "const gateShut =" in src_ql and "insidePanelRef.current || exitTimer.current != null" in src_ql)
T("33 ①军备门限 bundle（3000 编译产物）", alljs.count("3000") >= 2)

# ---------- 继承门：168 七连修 ----------
T("34 changelog 8.7.168 标题保留", "文件夹交互精修" in alljs)
T("35 168①dropHint scale-[1.12]（bundle）", "scale-[1.12]" in alljs)
T("36 168③will-change-transform（bundle）", "will-change-transform" in alljs)
T("37 168③字母格 tracking-normal（bundle）", "tracking-normal" in alljs)
T("38 168④右键菜单三项目录（bundle）",
  "文件夹菜单" in alljs and "打开文件夹" in alljs and "解散文件夹" in alljs)
T("39 168⑤夹体白雾渐变（bundle）",
  "rgba(255,255,255,var(--tile-grad-a1, 0.30))" in alljs
  and "rgba(255,255,255,var(--tile-ring-a, 0.42))" in alljs)
T("40 168⑥⑦抽屉空白关闭统一判定（src：veil+滚层双挂）",
  "drawerBlankClose" in src_ql and src_ql.count("onPointerDown={drawerBlankClose}") == 2)
T("41 168④重命名引导（src：renameBoot）", "renameBoot" in src_ql)

# ---------- 继承门：167/166/165 ----------
T("42 Releases 直链在位（pdf-bridge-v1.0.0 zip）",
  "releases/download/pdf-bridge-v1.0.0/chushi-pdf-bridge-win64-v1.0.0.zip" in alljs)
T("43 manifest extension_pages CSP 含 wasm-unsafe-eval",
  "wasm-unsafe-eval" in man.get("content_security_policy", {}).get("extension_pages", ""))
T("44 ocr/tesseract-worker.min.js 随包", "ocr/tesseract-worker.min.js" in names)
T("45 ocr core SIMD-LSTM wasm 随包", "ocr/tesseract-core-simd-lstm.wasm" in names)
T("46 changelog 8.7.167 标题保留", "OCR 本地增强引擎可以直接下载了" in alljs)
T("47 changelog 8.7.166 标题保留", "扫描件也能提取文字了" in alljs)
T("48 changelog 8.7.165 条目保留", "文件夹磁贴图标恢复正方形" in alljs)
T("49 changelog 8.7.163 条目保留", "文件夹拖拽体验五连修" in alljs)
T("50 mergeLinksWith 退役（bundle 零引用）", "mergeLinksWith" not in alljs)
T("51 putLinkIntoFolder/reorderWall 源码在位",
  "putLinkIntoFolder" in open(f"{ROOT}/src/lib/startpage/link-folders.ts").read()
  and "reorderWall" in src_ql)
T("52 迷你格 aspect-square 在位", "aspect-square" in alljs)
T("53 cs-bg-frozen CSS 闸保留", "cs-bg-frozen" in alljs)
T("54 OCR 源码署名头（ocr-engine.ts 飞鼠致谢）",
  "牢蜂" in open(f"{ROOT}/src/lib/startpage/ocr-engine.ts").read())
T("55 桥接源码署名头（chushi-pdf-bridge.js 飞鼠致谢）",
  "LaoFeng" in open(f"{ROOT}/bridge/chushi-pdf-bridge.js").read())

# ---------- 云快照 ----------
sz = zipfile.ZipFile(SNAP)
snames = sz.namelist()
sfiles = [n for n in snames if not n.endswith("/")]
T("56 云快照 ocr/ 资产随发（5 件）",
  all(f"ocr/{f}" in snames for f in (
      "tesseract-worker.min.js", "tesseract-core-simd-lstm.wasm.js",
      "tesseract-core-simd-lstm.wasm", "LICENSE-tesseractjs.txt", "LICENSE-tesseractjs-core.txt")))
T("57 云快照零 _next 残留", not [n for n in snames if "_next" in n])
snapver = sz.read("version.json").decode("utf-8") if "version.json" in snames else ""
T(f"58 云快照 version={VER}", json.loads(snapver).get("v") == VER)
sall = "\n".join(sz.read(n).decode("utf-8", "ignore") for n in sfiles if n.endswith((".js", ".html", ".css", ".json")))
T("59 云快照 changelog 169 同步", "文件夹拖拽节奏重做" in sall)
T("60 云快照 ③幽灵同步（z-[80]）", "z-[80]" in sall)
T("61 云快照 168 changelog 保留", "文件夹交互精修" in sall)
T("62 云快照 Releases 直链同步", "releases/download/pdf-bridge-v1.0.0" in sall)

# ---------- 云快照文件清单守恒（与 gh-pages v8.7.168 成对 diff：仅哈希更名） ----------
g168 = set(x["p"] for x in json.load(open("/tmp/ghp168-v.json"))["files"])
s169f = set(sfiles)
only168 = g168 - s169f
only169 = s169f - g168
only168.discard("version.json")
only169.discard("version.json")
renamed = {p for p in only168 if re.match(r"next/static/(chunks/[0-9a-f]{16}\.js|[^/]+/)", p)}
extra_ok = all("next/static/" in p for p in only169)
T(f"63 快照 vs 168：退役侧全为哈希更名（{len(only168)} 件）",
  len(renamed) == len(only168) and len(only168) <= 8)
T(f"64 快照 vs 168：新增侧全为 next/static 哈希件（{len(only169)} 件）",
  extra_ok and len(only169) == len(only168))

print(f"\nVERIFY-ZIP-v87169: {passed} PASS / {len(failed)} FAIL")
if failed:
    print("FAILED:", *failed, sep="\n  - ")
    sys.exit(1)
