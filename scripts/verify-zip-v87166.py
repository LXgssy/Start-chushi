#!/usr/bin/env python3
# verify-zip-v87166.py — v8.7.166 发版包串锚验证
# 166 新门：OCR 双轨（/ocr/ 资产随包 + extension_pages CSP wasm-unsafe-eval +
#           changelog OCR 条目 + 飞鼠署名串）
# 继承门：165 退役串（拖叠建夹）/ 方形律 / 视频闸 / changelog 历史条目 /
#         云快照守恒（与 gh-pages 165 文件清单成对 diff）/ 结构防呆
import zipfile, json, re, sys, os

ROOT = "/home/z/beta-wt"
ZIP = f"{ROOT}/download/v8.7.166/ChuShi-NewTab-v8.7.166.zip"
SNAP = f"{ROOT}/download/v8.7.166/ChuShi-CloudSnapshot-v8.7.166.zip"
VER = "8.7.166"

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

# ---------- v8.7.166 新门：OCR 双轨 ----------
T("10 manifest extension_pages CSP 含 wasm-unsafe-eval",
  "wasm-unsafe-eval" in man.get("content_security_policy", {}).get("extension_pages", ""))
T("11 ocr/tesseract-worker.min.js 随包", "ocr/tesseract-worker.min.js" in names)
T("12 ocr core SIMD-LSTM wasm.js 随包", "ocr/tesseract-core-simd-lstm.wasm.js" in names)
T("13 ocr core SIMD-LSTM wasm 二进制随包", "ocr/tesseract-core-simd-lstm.wasm" in names)
T("14 ocr 双许可文件随包（tesseract.js + core）",
  "ocr/LICENSE-tesseractjs.txt" in names and "ocr/LICENSE-tesseractjs-core.txt" in names)
wasm_js = data.get("ocr/tesseract-core-simd-lstm.wasm.js", b"").decode("utf-8", "ignore")
T("15 core wasm.js 是 SIMD 构建", "simd" in wasm_js.lower())
pages = [data[n].decode("utf-8", "ignore") for n in names if n.endswith((".html", ".js"))]
alljs = "\n".join(pages)
T("16 changelog 8.7.166 标题（OCR 文字识别）", "扫描件也能提取文字了" in alljs)
T("17 changelog 166 高亮-扫描件补齐", "提取文本」对扫描件无能为力的场景补齐" in alljs)
T("18 changelog 166 高亮-双引擎切换", "双引擎自动切换" in alljs)
T("19 changelog 166 高亮-语言可选", "中英文混合" in alljs)
T("20 changelog 166 高亮-飞鼠署名", "牢蜂 LaoFeng" in alljs and "非商用许可" in alljs)
T("21 OCR 源码署名头（ocr-engine.ts 飞鼠致谢）",
  "牢蜂" in open(f"{ROOT}/src/lib/startpage/ocr-engine.ts").read())
T("22 桥接源码署名头（chushi-pdf-bridge.js 飞鼠致谢）",
  "LaoFeng" in open(f"{ROOT}/bridge/chushi-pdf-bridge.js").read())
T("23 THIRD_PARTY_NOTICES.md 在库（含 tesseract/飞鼠双节）",
  os.path.exists(f"{ROOT}/THIRD_PARTY_NOTICES.md")
  and "牢蜂（LaoFeng）" in open(f"{ROOT}/THIRD_PARTY_NOTICES.md").read()
  and "Apache-2.0" in open(f"{ROOT}/THIRD_PARTY_NOTICES.md").read())
T("24 bridge/README.md 在库（SEA 打包说明）", os.path.exists(f"{ROOT}/bridge/README.md"))

# ---------- 继承门：165 退役/方形律/视频闸 ----------
T("25 changelog 8.7.165 条目保留", "文件夹磁贴图标恢复正方形" in alljs)
T("26 changelog 8.7.164 条目保留", "PDF 工具箱修复" in alljs)
T("27 changelog 8.7.163 条目保留", "文件夹拖拽体验五连修" in alljs)
T("28 mergeLinksWith 退役（零引用）", "mergeLinksWith" not in alljs)
T("29 dragStartedInsideRef 退役", "dragStartedInsideRef" not in alljs)
T("30 mergeTimer/mergeTargetId 退役", "mergeTimer" not in alljs and "mergeTargetId" not in alljs)
T("31 免开层入夹保留（putLinkIntoFolder 源码在位）",
  "putLinkIntoFolder" in open(f"{ROOT}/src/lib/startpage/link-folders.ts").read())
T("32 reorderWall 保留（源码在位）",
  "reorderWall" in open(f"{ROOT}/src/components/startpage/QuickLinks.tsx").read())
T("33 迷你格 aspect-square 在位", "aspect-square" in alljs)
T("34 容器 content-start items-start 在位", "content-start items-start" in alljs)
T("35 计数格 leading-none 在位", "leading-none" in alljs)
T("36 v8.7.162 img 统一律保留", "max-w-none" in alljs)
T("37 cs-bg-frozen CSS 闸保留", "cs-bg-frozen" in alljs)
T("38 document.hidden 闸保留", "document.hidden" in alljs)

# ---------- 云快照 ----------
sz = zipfile.ZipFile(SNAP)
snames = sz.namelist()
sfiles = [n for n in snames if not n.endswith("/")]
T(f"39 云快照 ocr/ 资产随发（worker+core+许可 5 件）",
  all(f"ocr/{f}" in snames for f in (
      "tesseract-worker.min.js", "tesseract-core-simd-lstm.wasm.js",
      "tesseract-core-simd-lstm.wasm", "LICENSE-tesseractjs.txt", "LICENSE-tesseractjs-core.txt")))
T(f"40 云快照零 _next 残留", not [n for n in snames if "_next" in n])
snapver = sz.read("version.json").decode("utf-8") if "version.json" in snames else ""
T(f"41 云快照 version={VER}", json.loads(snapver).get("v") == VER)
sall = "\n".join(sz.read(n).decode("utf-8", "ignore") for n in sfiles if n.endswith((".js", ".html", ".css", ".json")))
T("42 云快照 changelog 166 同步", "扫描件也能提取文字了" in sall)
T("43 云快照 OCR 随包同步", "ocr/tesseract-worker.min.js" in snames)
T("44 云快照 mergeLinksWith 退役", "mergeLinksWith" not in sall)
T("45 云快照 aspect-square 在位", "aspect-square" in sall)

# ---------- 云快照文件清单守恒（与 gh-pages v8.7.165 成对 diff：仅哈希更名 + OCR 新增） ----------
g165 = set(l.strip() for l in open("/tmp/ghp165.txt") if l.strip() and not l.strip().endswith("/"))
s166f = set(sfiles)
only165 = g165 - s166f
only166 = s166f - g165
expected_new = {
    "ocr/tesseract-worker.min.js", "ocr/tesseract-core-simd-lstm.wasm.js",
    "ocr/tesseract-core-simd-lstm.wasm", "ocr/LICENSE-tesseractjs.txt", "ocr/LICENSE-tesseractjs-core.txt",
}
extra166 = only166 - expected_new
renamed = {p for p in only165 if re.match(r"next/static/(chunks/[0-9a-f]{16}\.js|[^/]+/)", p)}
T(f"46 快照 vs 165：退役侧全为哈希更名（{len(only165)} 件）", len(only165) == 5 and len(renamed) == len(only165))
T(f"47 快照 vs 165：新增侧仅 OCR 资产 + 新哈希 chunk 与清单三件套（{len(extra166)} 件）",
  len(extra166) == 6 and all("next/static/" in p for p in extra166))
print(f"\nVERIFY-ZIP-v87166: {passed} PASS / {len(failed)} FAIL")
if failed:
    print("FAILED:", *failed, sep="\n  - ")
    sys.exit(1)
