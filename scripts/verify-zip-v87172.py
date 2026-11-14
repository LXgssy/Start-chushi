#!/usr/bin/env python3
# verify-zip-v87172.py — v8.7.172 发版包串锚验证
# 172 新门：拖拽手感五连修（1s 驻留双向 / 右半让位+12px 迟滞 / 开飞即摘+
#           对象寻址落账 / rAF 吸入+easeInOutQuart / rootRef 量测作用域 /
#           intro latch / softClearDwell 宽限 / measureFade 幂等 +
#           MeasuringStrategy.Always）+ changelog 172
# 继承门：171 性能根修 / 170 转换链路 / 169 军备 / 168 七连修 / 167 直链 /
#         166 OCR / 结构防呆 + 与 gh-pages 171 成对 diff
import zipfile, json, re, sys, pathlib

ROOT = "/home/z/beta-wt"
ZIP = f"{ROOT}/download/v8.7.172/ChuShi-NewTab-v8.7.172.zip"
SNAP = f"{ROOT}/download/v8.7.172/ChuShi-CloudSnapshot-v8.7.172.zip"
VER = "8.7.172"

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
T("7 shell.html 在位", "shell.html" in names)
T("8 ext-bg.js 在位", "ext-bg.js" in names)
T("9 cs-snap/sw.js 在位", any("cs-snap/sw.js" in n for n in names))

pages = [data[n].decode("utf-8", "ignore") for n in names if n.endswith((".html", ".js"))]
alljs = "\n".join(pages)
QL = open(f"{ROOT}/src/components/startpage/QuickLinks.tsx").read()
LF = open(f"{ROOT}/src/lib/startpage/link-folders.ts").read()

# ---------- v8.7.172 新门：拖拽手感五连修 ----------
T("10 changelog 8.7.172 标题（拖拽手感精修）", "文件夹拖拽手感精修" in alljs)
T("10b changelog 172 高亮-1 秒判定", "判定时长从 3 秒改为 1 秒" in alljs)
T("10c changelog 172 高亮-右侧让位", "平滑让位" in alljs)
T("10d changelog 172 高亮-吸进去", "吸」进去" in alljs or "被文件夹「吸」进去" in alljs)
T("10e changelog 172 高亮-补位", "不再残留在原来的位置" in alljs)
T("11 ①驻留 1s 双向常量（FOLDER_DWELL_MS/EXIT=1000）",
  "const FOLDER_DWELL_MS = 1000;" in QL and "const FOLDER_DWELL_EXIT_MS = 1000;" in QL)
T("11b 3s 计时退役（src 零 , 3000) 计时器）", ", 3000)" not in QL)
T("12 ②右半让位 reorderWallAfter（link-folders + QuickLinks 导入）",
  "export function reorderWallAfter" in LF and "reorderWallAfter" in QL)
T("13 ②双侧判定+12px 迟滞带（yieldSideFor + YIELD_HYSTERESIS_PX）",
  "function yieldSideFor(" in QL and "const YIELD_HYSTERESIS_PX = 12;" in QL)
T("14 ②让位应用分派（yieldReorder：夹右半/链接双侧）", "function yieldReorder(" in QL)
T("15 ③开飞即摘（removeLinkEverywhere 开飞调用）",
  "export function removeLinkEverywhere" in LF and "removeLinkEverywhere(prev, entryId)[0]" in QL)
T("16 ③对象寻址落账（commitFlyIntoFolder 对象入参）",
  "export function commitFlyIntoFolder" in LF
  and "commitFlyIntoFolder(prev, f.entry, f.folderId)" in QL)
T("17 ③rAF 逐帧追踪 + easeInOutQuart 吸入曲线",
  "requestAnimationFrame(step)" in QL and "function easeInOutQuart(" in QL
  and "const FLY_MS = 420;" in QL)
T("18 ③落格淡出落账接力（130ms fade→finish）",
  "duration: 130, fill: \"forwards\"" in QL)
T("19 ④量测作用域 rootRef（folderCellTarget/yieldSideFor）",
  "function folderCellTarget(" in QL
  and QL.count("rootRef.current?.querySelector") >= 3)
T("19b ④folderFly 快照计数（fn 字段）", "fn: folder.children.length" in QL)
T("20 ②′文件夹 intro latch（FolderTileVisual onIntroDone + body 通道摘类）",
  "onIntroDone?: () => void;" in QL
  and 'if (e.animationName === "intro-tile-body" && onIntroDone) onIntroDone();' in QL)
T("20b TileVisual 夹分支传 onIntroDone",
  QL.count("onIntroDone={() => setIntroDone(true)}") >= 2)
T("21 ⑥军备软清宽限（softClearDwell + DWELL_GRACE_MS=260）",
  "function softClearDwell(" in QL and "const DWELL_GRACE_MS = 260;" in QL
  and "function resumeDwell(" in QL)
T("22 ⑤measureFade 同值幂等",
  "prev.top === top && prev.bottom === bottom ? prev : { top, bottom }" in QL)
T("23 ⑤MeasuringStrategy.Always（droppable 策略）",
  "measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}" in QL)
T("24 ①出夹探测 30Hz 节流（EXIT_PROBE_MIN_MS=33）",
  "const EXIT_PROBE_MIN_MS = 33;" in QL and "exitProbeAt.current" in QL)
T("25 171 性能门保留-极光 ::before 降栅格",
  ".aurora-blob::before" in open(f"{ROOT}/src/app/globals.css").read())
gcss = open(f"{ROOT}/src/app/globals.css").read()
T("26 171 性能门保留-暂停闸退役仅余 cs-hidden",
  "html.cs-bg-frozen .aurora-blob" not in gcss
  and "html.cs-drawer .aurora-blob" not in gcss
  and "html.cs-hidden .aurora-blob" in gcss)
T("27 171 性能门保留-液态玻璃死代码已删",
  not pathlib.Path(f"{ROOT}/src/lib/startpage/liquid-glass").exists()
  and "liquid-glass" not in alljs.lower())

# ---------- 继承门：170/169/168/167/166 ----------
T("30 changelog 8.7.171 标题保留", "底层性能根修" in alljs)
T("31 changelog 8.7.170 标题保留", "PDF 工具箱转换链路根修" in alljs)
T("32 changelog 8.7.169 标题保留", "文件夹拖拽节奏重做" in alljs)
T("33 169 军备 armedFolderId（src）", "armedFolderId" in QL)
T("34 changelog 8.7.168 标题保留", "文件夹交互精修" in alljs)
T("35 168⑤夹体白雾渐变（bundle）",
  "rgba(255,255,255,var(--tile-grad-a1, 0.30))" in alljs)
T("36 Releases 直链在位（pdf-bridge-v1.0.0 zip）",
  "releases/download/pdf-bridge-v1.0.0/chushi-pdf-bridge-win64-v1.0.0.zip" in alljs)
T("37 manifest extension_pages CSP 含 wasm-unsafe-eval",
  "wasm-unsafe-eval" in man.get("content_security_policy", {}).get("extension_pages", ""))
T("38 ocr/tesseract-worker.min.js 随包", "ocr/tesseract-worker.min.js" in names)
T("39 ocr core SIMD-LSTM wasm 随包", "ocr/tesseract-core-simd-lstm.wasm" in names)
T("40 changelog 8.7.167/166 标题保留",
  "OCR 本地增强引擎可以直接下载了" in alljs and "扫描件也能提取文字了" in alljs)
T("41 170 CJK 字体随包", "fonts/NotoSansSC-Regular.ttf" in names)
T("42 170 光栅管线退役（bundle 零 html2canvas/jspdf 引用）",
  "html2canvas" not in alljs.lower() and "jspdf" not in alljs.lower())

# ---------- 云快照 ----------
sz = zipfile.ZipFile(SNAP)
snames = sz.namelist()
sfiles = [n for n in snames if not n.endswith("/")]
T("44 云快照 CJK 字体随发", "fonts/NotoSansSC-Regular.ttf" in snames)
T("45 云快照 ocr/ 资产随发（5 件）",
  all(f"ocr/{f}" in snames for f in (
      "tesseract-worker.min.js", "tesseract-core-simd-lstm.wasm.js",
      "tesseract-core-simd-lstm.wasm", "LICENSE-tesseractjs.txt", "LICENSE-tesseractjs-core.txt")))
T("46 云快照零 _next 残留", not [n for n in snames if "_next" in n])
snapver = sz.read("version.json").decode("utf-8") if "version.json" in snames else ""
T(f"47 云快照 version={VER}", json.loads(snapver).get("v") == VER)
sall = "\n".join(sz.read(n).decode("utf-8", "ignore") for n in sfiles if n.endswith((".js", ".html", ".css", ".json")))
T("48 云快照 changelog 172 同步", "文件夹拖拽手感精修" in sall)
T("49 云快照 changelog 171 保留", "底层性能根修" in sall)
T("50 云快照 Releases 直链同步", "releases/download/pdf-bridge-v1.0.0" in sall)
T("51 云快照 172 高亮同步", "吸」进去" in sall or "被文件夹「吸」进去" in sall)

# ---------- 云快照文件清单守恒（与 gh-pages v8.7.171 成对 diff：哈希更名） ----------
g171 = set(x["p"] for x in json.load(open("/tmp/ghp171-v.json"))["files"])
s172f = set(sfiles)
only171r = g171 - s172f
only172 = s172f - g171
only171r.discard("version.json")
only172.discard("version.json")
renamed = {p for p in only171r if re.match(r"next/static/(chunks/[0-9a-f]{16}\.js|[^/]+/)", p)}
extra_ok = all("next/static/" in p or p.startswith("fonts/") for p in only172)
T(f"60 快照 vs gh-pages-171：退役侧全为哈希更名（{len(only171r)} 件）",
  len(renamed) == len(only171r) and len(only171r) <= 14)
T(f"61 快照 vs gh-pages-171：新增侧全为 next/static 哈希件（{len(only172)} 件）",
  extra_ok)

print(f"\nVERIFY-ZIP-v87172: {passed} PASS / {len(failed)} FAIL")
if failed:
    print("FAILED:", *failed, sep="\n  - ")
    sys.exit(1)
