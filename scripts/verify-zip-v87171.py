#!/usr/bin/env python3
# verify-zip-v87171.py — v8.7.171 发版包串锚验证
# 170 新门：PDF 工具箱转换链路根修（CJK 文字层管线 + 飞鼠表格口径移植）
#           + changelog 170 + 字体随包/云快照同步 + 光栅管线退役 + 与
#           gh-pages 169 成对 diff（fonts/ 新增白名单）
# 继承门：169 拖拽军备 / 168 七连修 / 167 直链 / 166 OCR / 结构防呆
import zipfile, json, re, sys

ROOT = "/home/z/beta-wt"
ZIP = f"{ROOT}/download/v8.7.171/ChuShi-NewTab-v8.7.171.zip"
SNAP = f"{ROOT}/download/v8.7.171/ChuShi-CloudSnapshot-v8.7.171.zip"
VER = "8.7.171"

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
src_ql = open(f"{ROOT}/src/components/startpage/PdfTools.tsx").read()
src_cjk = open(f"{ROOT}/src/lib/startpage/pdf-cjk.ts").read()

# ---------- v8.7.171 新门：底层性能根修 ----------
src_us = open(f"{ROOT}/src/hooks/use-start.ts").read()
T("10 changelog 8.7.171 标题（底层性能根修）", "底层性能根修" in alljs)
T("10b changelog 171 高亮-不再暂停背景动画", "不再靠暂停背景动画" in alljs)
T("10c changelog 171 高亮-降分辨率栅格化", "降分辨率栅格化" in alljs)
T("10d 极光 ::before 降栅格在位（CSS）",
  ".aurora-blob::before" in alljs or ".aurora-blob::before" in open(f"{ROOT}/src/app/globals.css").read())
gcss = open(f"{ROOT}/src/app/globals.css").read()
T("10e cs-bg-frozen/cs-drawer 极光暂停退役（CSS 仅余 cs-hidden）",
  "html.cs-bg-frozen .aurora-blob" not in gcss
  and "html.cs-drawer .aurora-blob" not in gcss
  and "html.cs-hidden .aurora-blob" in gcss)
T("10f useBgFreeze 源码退役", "export function useBgFreeze" not in src_us
  and "useBgFreeze(" not in open(f"{ROOT}/src/components/startpage/QuickLinks.tsx").read())
T("10g 液态玻璃死代码删除", not __import__("pathlib").Path(f"{ROOT}/src/lib/startpage/liquid-glass").exists()
  and not __import__("pathlib").Path(f"{ROOT}/src/lib/startpage/liquid-glass.ts").exists())
T("10h 拖拽期面板元素缓存（src：exitPanelElRef）",
  "exitPanelElRef" in open(f"{ROOT}/src/components/startpage/QuickLinks.tsx").read())
T("10i 液态玻璃零 bundle 残留", "liquid-glass" not in alljs.lower())
T("10j changelog 170 保留", "PDF 工具箱转换链路根修" in alljs)

# ---------- v8.7.170 新门：转换链路根修 ----------
T("20 changelog 8.7.170 标题保留（转换链路根修）", "PDF 工具箱转换链路根修" in alljs)
T("11 changelog 170 高亮-真实文字层", "真实文字层" in alljs)
T("12 changelog 170 高亮-PPT 中文乱码修复", "修复 PPT 转 PDF 中文全部乱码" in alljs)
T("13 changelog 170 高亮-PDF 转 Word 表格还原", "表格还原为可编辑表格" in alljs)
T("14 changelog 170 高亮-PDF 转 Excel 网格", "还原表格网格与列宽" in alljs)
T("15 changelog 170 高亮-飞鼠署名", "牢蜂 LaoFeng" in alljs)
T("16 CJK 字体随包", "fonts/NotoSansSC-Regular.ttf" in names)
T("17 字体路径在 bundle", "fonts/NotoSansSC-Regular.ttf" in alljs)
T("18 字体加载模块在位（src：loadCjkFontBytes+缓存）",
  "loadCjkFontBytes" in src_cjk and "fontBytesCache" in src_cjk)
T("19 子集化嵌入在位（src：embedFont subset）",
  "embedFont(await loadCjkFontBytes(), { subset: true })" in src_cjk
  and "registerFontkit" in src_cjk)
T("20 飞鼠行分组移植在位（src：groupPdfItemsIntoLines+CJK 零空格律）",
  "export function groupPdfItemsIntoLines" in src_cjk
  and "p{Script=Han}" in src_cjk)
T("21 飞鼠表格对齐律在位（src：aligned ±10px 判定）",
  "Math.abs(fragment.x - b.fragments[index].x) <= 10" in src_cjk)
T("22 飞鼠 CJK 双宽计宽律在位（src：cjkDisplayWidth）",
  "export function cjkDisplayWidth" in src_cjk and "u3000-\\u303f" in src_cjk)
T("23 pdf2word 表格还原在位（src：buildDocxTable+连续对齐行合并）",
  "function buildDocxTable" in src_ql and "lines[k].cells.length === cols" in src_ql)
T("24 pdf2word 标题判级在位（src：正文中位数×1.5/×1.25）",
  "bodyH * 1.5" in src_ql and "bodyH * 1.25" in src_ql)
T("25 pdf2excel 网格在位（src：rows=lines.map(cells)+列宽）",
  "lines.map((l) => l.cells)" in src_ql and "computeXlsxColWidths" in src_ql)
T("26 光栅管线退役（bundle 零 html2canvas/jspdf 引用）",
  "html2canvas" not in alljs.lower() and "jspdf" not in alljs.lower())
T("27 word2pdf 文字层完成语（bundle）", "可选取文字层" in alljs)
T("28 ppt2pdf 乱码根修完成语（src：改子集化嵌入）",
  "v8.7.170 根修：旧 jsPDF 默认 Helvetica 不含 CJK 字形" in src_ql)
T("29 mammoth 内嵌图保留（src：img data URI 块）",
  "kind: \"img\", dataUri" in src_ql and "embedDataImage" in src_cjk)
T("30 THIRD_PARTY_NOTICES：Noto OFL 条目",
  "Noto Sans SC（TTF 随包）" in open(f"{ROOT}/THIRD_PARTY_NOTICES.md").read()
  and "Open Font License" in open(f"{ROOT}/THIRD_PARTY_NOTICES.md").read())
T("31 THIRD_PARTY_NOTICES：飞鼠移植范围扩大",
  "v8.7.170 的转换链路根修在此基础上扩大移植范围" in open(f"{ROOT}/THIRD_PARTY_NOTICES.md").read())
T("32 pdf-cjk.ts 飞鼠署名头（牢蜂 LaoFeng + 非商用）",
  "牢蜂 LaoFeng" in src_cjk and "非商用许可" in src_cjk)
T("33 fontkit 依赖在位", "fontkit" in open(f"{ROOT}/package.json").read())

# ---------- 继承门：169/168/167/166 ----------
T("34 changelog 8.7.169 标题保留", "文件夹拖拽节奏重做" in alljs)
T("35 169 军备 3000+armedFolderId（src）",
  "armedFolderId" in open(f"{ROOT}/src/components/startpage/QuickLinks.tsx").read())
T("36 changelog 8.7.168 标题保留", "文件夹交互精修" in alljs)
T("37 168⑤夹体白雾渐变（bundle）",
  "rgba(255,255,255,var(--tile-grad-a1, 0.30))" in alljs)
T("38 Releases 直链在位（pdf-bridge-v1.0.0 zip）",
  "releases/download/pdf-bridge-v1.0.0/chushi-pdf-bridge-win64-v1.0.0.zip" in alljs)
T("39 manifest extension_pages CSP 含 wasm-unsafe-eval",
  "wasm-unsafe-eval" in man.get("content_security_policy", {}).get("extension_pages", ""))
T("40 ocr/tesseract-worker.min.js 随包", "ocr/tesseract-worker.min.js" in names)
T("41 ocr core SIMD-LSTM wasm 随包", "ocr/tesseract-core-simd-lstm.wasm" in names)
T("42 changelog 8.7.167/166 标题保留",
  "OCR 本地增强引擎可以直接下载了" in alljs and "扫描件也能提取文字了" in alljs)
T("43 OCR 源码署名头", "牢蜂" in open(f"{ROOT}/src/lib/startpage/ocr-engine.ts").read())

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
T("48 云快照 changelog 170 同步", "PDF 工具箱转换链路根修" in sall)
T("49 云快照 字体路径同步", "fonts/NotoSansSC-Regular.ttf" in sall)
T("50 云快照 169 changelog 保留", "文件夹拖拽节奏重做" in sall)
T("51 云快照 Releases 直链同步", "releases/download/pdf-bridge-v1.0.0" in sall)

# ---------- 云快照文件清单守恒（与 gh-pages v8.7.169 成对 diff：哈希更名 + fonts 新增） ----------
g170 = set(x["p"] for x in json.load(open("/tmp/ghp170-v.json"))["files"])
s171f = set(sfiles)
only170r = g170 - s171f
only171 = s171f - g170
only170r.discard("version.json")
only171.discard("version.json")
renamed = {p for p in only170r if re.match(r"next/static/(chunks/[0-9a-f]{16}\.js|[^/]+/)", p)}
extra_ok = all("next/static/" in p or p.startswith("fonts/") for p in only171)
T(f"60 快照 vs 170：退役侧全为哈希更名（{len(only170r)} 件）",
  len(renamed) == len(only170r) and len(only170r) <= 14)
T(f"61 快照 vs 170：新增侧全为 next/static 哈希件 + fonts/（{len(only171)} 件）",
  extra_ok)

print(f"\nVERIFY-ZIP-v87170: {passed} PASS / {len(failed)} FAIL")
if failed:
    print("FAILED:", *failed, sep="\n  - ")
    sys.exit(1)
