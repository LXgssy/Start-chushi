#!/usr/bin/env python3
# verify-zip-v8173.py — v8.7.173 发版包串锚验证
# 173 新门：飞鼠引擎移植（pdf-table-extractor/runtime 逐字节 + ExcelJS/docx
#           写入器 + 矢量线提取 + CTM 跟踪）/ 驻留 0.5s 双向 / 拖拽性能三优化
#           （yield 30Hz 节流 / measuring 60ms 去抖 / 浮层层提升 / ghost 降级）
# 继承门：172 五连修 / 171 性能根修 / 170 转换链 / 169 军备 / 168 / 167 / 166
#         + 云快照 + 与 gh-pages 172 成对 diff
import zipfile, json, re, sys, pathlib

ROOT = "/home/z/beta-wt"
ZIP = f"{ROOT}/download/v8.7.173/ChuShi-NewTab-v8.7.173.zip"
SNAP = f"{ROOT}/download/v8.7.173/ChuShi-CloudSnapshot-v8.7.173.zip"
VER = "8.7.173"

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
EXT = open(f"{ROOT}/src/lib/startpage/pdf-table-extractor.js").read()
RT = open(f"{ROOT}/src/lib/startpage/pdf-table-runtime.js").read()
OFF = open(f"{ROOT}/src/lib/startpage/pdf-office.ts").read()
PT = open(f"{ROOT}/src/components/startpage/PdfTools.tsx").read()

# ---------- v8.7.173 新门：飞鼠引擎移植 ----------
T("10 changelog 8.7.173 标题（PDF 转换全面重做）", "PDF 转换全面重做" in alljs)
T("10b changelog 173 高亮-飞鼠引擎", "飞鼠格式转换" in alljs and "牢蜂 LaoFeng" in alljs)
T("10c changelog 173 高亮-行序颠倒修复", "顺序整个颠倒" in alljs)
T("10d changelog 173 高亮-0.5 秒", "判定时间改为 0.5 秒" in alljs)
T("11 飞鼠 extractor 逐字节移植（detectTablesOnPage/buildWorkbookModel 在位）",
  "export { LOW_CONFIDENCE, detectTablesOnPage, buildWorkbookModel }" in EXT
  and "function makeGridTable" in EXT and "function makeBorderlessTable" in EXT)
T("12 飞鼠 runtime 移植（pdfTextContentToWords/detectTableLinesFromRaw）",
  "export { pdfTextContentToWords" in RT and "function detectTableLinesFromRaw" in RT)
T("13 飞鼠署名头（牢蜂 LaoFeng + 非商用许可 + 零逻辑改动）",
  "牢蜂 LaoFeng" in EXT and "非商用许可" in EXT and "零逻辑改动" in EXT
  and "牢蜂 LaoFeng" in RT)
T("14 桥接层：词元+栅格线+矢量线三源喂入",
  "extractVectorLines" in OFF and "detectTableLinesFromRaw" in OFF
  and "pdfTextContentToWords" in OFF)
T("15 桥接层：CTM 跟踪（cm/save/restore）",
  "OPS.transform" in OFF and "ctmStack" in OFF and "const ctmStack" in OFF)
T("16 ExcelJS 写入器口径（formatWorkbookSheet/applyColumnWidths/addTableNotes）",
  "function formatWorkbookSheet" in OFF and "function applyColumnWidths" in OFF
  and "function addTableNotes" in OFF)
T("17 docx 写入器口径（makeTable/tableRows/VerticalMergeType）",
  "VerticalMergeType.RESTART" in OFF and "VerticalMergeType.CONTINUE" in OFF
  and "TableLayoutType.FIXED" in OFF)
T("18 PdfTools 双链重接（extractOfficePage/buildModel/writeModelToXlsxBuffer）",
  "extractOfficePage" in PT and "buildModel(" in PT
  and "writeModelToXlsxBuffer" in PT and "writePagesToDocxBlob" in PT)
T("19 旧行序管线退役（PdfTools 零 groupPdfItemsIntoLines 引用）",
  "groupPdfItemsIntoLines(" not in PT)
T("20 扫描件宁可不给不给错（xlsx 显式拒绝文案）", "未检测到表格网格" in PT)
T("21 THIRD_PARTY_NOTICES：v8.7.173 引擎移植条目",
  "零逻辑改动" in open(f"{ROOT}/THIRD_PARTY_NOTICES.md").read()
  and "禁止商用" in open(f"{ROOT}/THIRD_PARTY_NOTICES.md").read())
T("22 exceljs/docx 依赖在位",
  '"exceljs"' in open(f"{ROOT}/package.json").read()
  and '"docx"' in open(f"{ROOT}/package.json").read())

# ---------- v8.7.173 新门：0.5s 驻留 + 性能 ----------
T("30 ①驻留 0.5s 双向（FOLDER_DWELL_MS/EXIT=500）",
  "const FOLDER_DWELL_MS = 500;" in QL and "const FOLDER_DWELL_EXIT_MS = 500;" in QL)
T("30b 1s/3s 常量退役", "const FOLDER_DWELL_MS = 1000;" not in QL and ", 3000)" not in QL and ", 1000)" not in QL)
T("31 ⑤yield 判定 30Hz 节流（yieldProbeAt）", "yieldProbeAt" in QL)
T("32 ⑤measuring Always+60ms 去抖 + ghost 降级 BeforeDragging",
  "frequency: 60" in QL and "MeasuringStrategy.BeforeDragging" in QL)
T("33 ⑤ghost 零传感器", "sensors={ghost ? [] : sensors}" in QL)
T("34 ⑤浮层光晕/厚影合成层提升",
  'rounded-[26px] blur-lg will-change-transform' in QL
  and QL.count('will-change-transform"') >= 2 or QL.count("will-change-transform") >= 4)
T("35 172 门保留-开飞即摘+对象寻址",
  "removeLinkEverywhere(prev, entryId)[0]" in QL
  and "commitFlyIntoFolder(prev, f.entry, f.folderId)" in QL)
T("36 172 门保留-rAF 吸入+easeInOutQuart",
  "requestAnimationFrame(step)" in QL and "function easeInOutQuart(" in QL)
T("37 172 门保留-软清宽限+rootRef×3",
  "function softClearDwell(" in QL and QL.count("rootRef.current?.querySelector") >= 3)
T("38 172 门保留-reorderWallAfter/yieldSideFor",
  "export function reorderWallAfter" in LF and "function yieldSideFor(" in QL)
T("39 171 门保留-极光 ::before 降栅格",
  ".aurora-blob::before" in open(f"{ROOT}/src/app/globals.css").read())

# ---------- 继承门：170/169/168/167/166 ----------
T("40 changelog 8.7.172/171/170 标题保留",
  "文件夹拖拽手感精修" in alljs and "底层性能根修" in alljs and "PDF 工具箱转换链路根修" in alljs)
T("41 changelog 8.7.169 标题保留", "文件夹拖拽节奏重做" in alljs)
T("42 169 军备 armedFolderId（src）", "armedFolderId" in QL)
T("43 168⑤夹体白雾渐变（bundle）",
  "rgba(255,255,255,var(--tile-grad-a1, 0.30))" in alljs)
T("44 Releases 直链在位（pdf-bridge-v1.0.0 zip）",
  "releases/download/pdf-bridge-v1.0.0/chushi-pdf-bridge-win64-v1.0.0.zip" in alljs)
T("45 manifest extension_pages CSP 含 wasm-unsafe-eval",
  "wasm-unsafe-eval" in man.get("content_security_policy", {}).get("extension_pages", ""))
T("46 ocr/tesseract-worker.min.js 随包", "ocr/tesseract-worker.min.js" in names)
T("47 ocr core SIMD-LSTM wasm 随包", "ocr/tesseract-core-simd-lstm.wasm" in names)
T("48 170 CJK 字体随包", "fonts/NotoSansSC-Regular.ttf" in names)
T("49 170 光栅管线退役（bundle 零 html2canvas/jspdf 引用）",
  "html2canvas" not in alljs.lower() and "jspdf" not in alljs.lower())
T("50 pdf2word 表格还原完成语（bundle）", "飞鼠引擎网格还原" in alljs)

# ---------- 云快照 ----------
sz = zipfile.ZipFile(SNAP)
snames = sz.namelist()
sfiles = [n for n in snames if not n.endswith("/")]
T("52 云快照 CJK 字体随发", "fonts/NotoSansSC-Regular.ttf" in snames)
T("53 云快照 ocr/ 资产随发（5 件）",
  all(f"ocr/{f}" in snames for f in (
      "tesseract-worker.min.js", "tesseract-core-simd-lstm.wasm.js",
      "tesseract-core-simd-lstm.wasm", "LICENSE-tesseractjs.txt", "LICENSE-tesseractjs-core.txt")))
T("54 云快照零 _next 残留", not [n for n in snames if "_next" in n])
snapver = sz.read("version.json").decode("utf-8") if "version.json" in snames else ""
T(f"55 云快照 version={VER}", json.loads(snapver).get("v") == VER)
sall = "\n".join(sz.read(n).decode("utf-8", "ignore") for n in sfiles if n.endswith((".js", ".html", ".css", ".json")))
T("56 云快照 changelog 173 同步", "PDF 转换全面重做" in sall)
T("57 云快照 changelog 172 保留", "文件夹拖拽手感精修" in sall)

# ---------- 云快照文件清单守恒（与 gh-pages v8.7.172 成对 diff） ----------
g172 = set(x["p"] for x in json.load(open("/tmp/ghp172-v.json"))["files"])
s173f = set(sfiles)
only172r = g172 - s173f
only173 = s173f - g172
only172r.discard("version.json")
only173.discard("version.json")
renamed = {p for p in only172r if re.match(r"next/static/(chunks/[0-9a-f]{16}\.js|[^/]+/)", p)}
extra_ok = all("next/static/" in p or p.startswith("fonts/") for p in only173)
T(f"60 快照 vs gh-pages-172：退役侧全为哈希更名（{len(only172r)} 件）",
  len(renamed) == len(only172r) and len(only172r) <= 16)
T(f"61 快照 vs gh-pages-172：新增侧全为 next/static 哈希件（{len(only173)} 件）",
  extra_ok)

print(f"\nVERIFY-ZIP-v87173: {passed} PASS / {len(failed)} FAIL")
if failed:
    print("FAILED:", *failed, sep="\n  - ")
    sys.exit(1)
