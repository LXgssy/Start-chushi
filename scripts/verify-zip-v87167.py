#!/usr/bin/env python3
# verify-zip-v87167.py — v8.7.167 发版包串锚验证
# 167 新门：OCR 本地引擎下载入口（BRIDGE_DOWNLOAD_URL Releases 直链 +
#           探活状态行 + changelog 167 条目 + 云快照同步）
# 继承门：166 OCR 双轨全套 / 165 退役串 / 方形律 / 视频闸 / 结构防呆 /
#         云快照守恒（与 gh-pages 166 文件清单成对 diff）
import zipfile, json, re, sys, os

ROOT = "/home/z/beta-wt"
ZIP = f"{ROOT}/download/v8.7.167/ChuShi-NewTab-v8.7.167.zip"
SNAP = f"{ROOT}/download/v8.7.167/ChuShi-CloudSnapshot-v8.7.167.zip"
VER = "8.7.167"

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

# ---------- v8.7.167 新门：本地引擎下载入口 ----------
pages = [data[n].decode("utf-8", "ignore") for n in names if n.endswith((".html", ".js"))]
alljs = "\n".join(pages)
T("10 Releases 直链在位（pdf-bridge-v1.0.0 zip）",
  "releases/download/pdf-bridge-v1.0.0/chushi-pdf-bridge-win64-v1.0.0.zip" in alljs)
T("11 下载按钮文案在位", "下载 Windows 本地引擎" in alljs)
T("12 探活状态行三态文案在位",
  "正在探测本地 OCR 引擎" in alljs and "本地引擎已就绪" in alljs)
T("13 未检测态引导文案在位",
  "未检测到本地引擎" in alljs and "解压后双击 chushi-pdf-bridge.exe" in alljs)
T("14 changelog 8.7.167 标题（本地引擎下载）",
  "OCR 本地增强引擎可以直接下载了" in alljs)
T("15 changelog 167 高亮-入口同款交互", "与预设导入面板「开发工具」下载入口同款交互" in alljs)
T("16 changelog 167 高亮-离线更快", "不再需要联网下载语言包" in alljs)
T("17 changelog 167 高亮-飞鼠署名延续", "牢蜂 LaoFeng" in alljs and "非商用许可" in alljs)
T("18 THIRD_PARTY_NOTICES 补 conda-forge 打包条目",
  "conda-forge" in open(f"{ROOT}/THIRD_PARTY_NOTICES.md").read()
  and "Node.js SEA" in open(f"{ROOT}/THIRD_PARTY_NOTICES.md").read())
T("19 bridge/README 就绪包直链与 SHA256",
  "pdf-bridge-v1.0.0" in open(f"{ROOT}/bridge/README.md").read()
  and "a37244af52b86f5d67649f942778c95b4d66bed522d1284078abb48faa0b9361"
      in open(f"{ROOT}/bridge/README.md").read())

# ---------- 继承门：166 OCR 双轨 ----------
T("20 manifest extension_pages CSP 含 wasm-unsafe-eval",
  "wasm-unsafe-eval" in man.get("content_security_policy", {}).get("extension_pages", ""))
T("21 ocr/tesseract-worker.min.js 随包", "ocr/tesseract-worker.min.js" in names)
T("22 ocr core SIMD-LSTM wasm.js 随包", "ocr/tesseract-core-simd-lstm.wasm.js" in names)
T("23 ocr core SIMD-LSTM wasm 二进制随包", "ocr/tesseract-core-simd-lstm.wasm" in names)
T("24 ocr 双许可文件随包（tesseract.js + core）",
  "ocr/LICENSE-tesseractjs.txt" in names and "ocr/LICENSE-tesseractjs-core.txt" in names)
wasm_js = data.get("ocr/tesseract-core-simd-lstm.wasm.js", b"").decode("utf-8", "ignore")
T("25 core wasm.js 是 SIMD 构建", "simd" in wasm_js.lower())
T("26 changelog 8.7.166 标题保留", "扫描件也能提取文字了" in alljs)
T("27 changelog 166 高亮-双引擎切换保留", "双引擎自动切换" in alljs)
T("28 changelog 165 条目保留", "文件夹磁贴图标恢复正方形" in alljs)
T("29 changelog 8.7.164 条目保留", "PDF 工具箱修复" in alljs)
T("30 changelog 8.7.163 条目保留", "文件夹拖拽体验五连修" in alljs)
T("31 mergeLinksWith 退役（零引用）", "mergeLinksWith" not in alljs)
T("32 mergeTimer/mergeTargetId 退役", "mergeTimer" not in alljs and "mergeTargetId" not in alljs)
T("33 免开层入夹保留（putLinkIntoFolder 源码在位）",
  "putLinkIntoFolder" in open(f"{ROOT}/src/lib/startpage/link-folders.ts").read())
T("34 reorderWall 保留（源码在位）",
  "reorderWall" in open(f"{ROOT}/src/components/startpage/QuickLinks.tsx").read())
T("35 迷你格 aspect-square 在位", "aspect-square" in alljs)
T("36 容器 content-start items-start 在位", "content-start items-start" in alljs)
T("37 计数格 leading-none 在位", "leading-none" in alljs)
T("38 v8.7.162 img 统一律保留", "max-w-none" in alljs)
T("39 cs-bg-frozen CSS 闸保留", "cs-bg-frozen" in alljs)
T("40 document.hidden 闸保留", "document.hidden" in alljs)
T("41 OCR 源码署名头（ocr-engine.ts 飞鼠致谢）",
  "牢蜂" in open(f"{ROOT}/src/lib/startpage/ocr-engine.ts").read())
T("42 桥接源码署名头（chushi-pdf-bridge.js 飞鼠致谢）",
  "LaoFeng" in open(f"{ROOT}/bridge/chushi-pdf-bridge.js").read())

# ---------- 云快照 ----------
sz = zipfile.ZipFile(SNAP)
snames = sz.namelist()
sfiles = [n for n in snames if not n.endswith("/")]
T("43 云快照 ocr/ 资产随发（worker+core+许可 5 件）",
  all(f"ocr/{f}" in snames for f in (
      "tesseract-worker.min.js", "tesseract-core-simd-lstm.wasm.js",
      "tesseract-core-simd-lstm.wasm", "LICENSE-tesseractjs.txt", "LICENSE-tesseractjs-core.txt")))
T("44 云快照零 _next 残留", not [n for n in snames if "_next" in n])
snapver = sz.read("version.json").decode("utf-8") if "version.json" in snames else ""
T(f"45 云快照 version={VER}", json.loads(snapver).get("v") == VER)
sall = "\n".join(sz.read(n).decode("utf-8", "ignore") for n in sfiles if n.endswith((".js", ".html", ".css", ".json")))
T("46 云快照 changelog 167 同步", "OCR 本地增强引擎可以直接下载了" in sall)
T("47 云快照 引擎下载直链同步", "releases/download/pdf-bridge-v1.0.0" in sall)
T("48 云快照 OCR 随包同步", "ocr/tesseract-worker.min.js" in snames)
T("49 云快照 aspect-square 在位", "aspect-square" in sall)

# ---------- 云快照文件清单守恒（与 gh-pages v8.7.166 成对 diff：仅哈希更名） ----------
g166 = set(x["p"] for x in json.load(open("/tmp/ghp166-v.json"))["files"])
s167f = set(sfiles)
only166 = g166 - s167f
only167 = s167f - g166
# 清单自身不计入（gh-pages version.json 不自列，快照清单自列）
only166.discard("version.json")
only167.discard("version.json")
renamed = {p for p in only166 if re.match(r"next/static/(chunks/[0-9a-f]{16}\.js|[^/]+/)", p)}
extra_ok = all("next/static/" in p for p in only167)
T(f"50 快照 vs 166：退役侧全为哈希更名（{len(only166)} 件）",
  len(renamed) == len(only166) and len(only166) <= 6)
T(f"51 快照 vs 166：新增侧全为 next/static 哈希件（{len(only167)} 件）",
  extra_ok and len(only167) == len(only166))
print(f"\nVERIFY-ZIP-v87167: {passed} PASS / {len(failed)} FAIL")
if failed:
    print("FAILED:", *failed, sep="\n  - ")
    sys.exit(1)
