#!/usr/bin/env python3
"""扩展打包：EXTENSION_MODE 导出产物 → MV3 扩展 zip（v1.7.1，v8.1.2 复用）。
步骤：index.html 内联 <script> 外置为 ext-script-N.js（MV3 CSP 兼容）→
写入 manifest.json（版本号此处维护）→ 复制 _locales/icons → zip。
⚠ v8.0.8~v8.1.1 发版回归：build-v8xx-assets.py 直接 zip out/，漏掉本脚本
全部注入步骤（manifest/_locales/icons/内联外置）→ 发布包无法全新安装。
v8.1.2 起恢复本流程作为扩展包唯一产出门。
v8.2.1 新增：ext-lyric.js（完全体歌词引擎，拼接在 ext-card.js 之前——内容脚本
不支持 importScripts）+ ext-card.js 三态重构（封面收起/标准/完全体歌词）。
历史：v8.2.0 ext-bg.js（SW 状态中继）+ ext-card.js（悬浮音乐卡）注入。
v8.2.3 新增：辉光层叠修复（高光跑封面根治）+ 两色调 + 顶带收敛/带左时间 + 主题色跟随 cardAcc；
v8.2.2 保留：数据面软重锚/回退熔断/seek 护航（乱跳根治）+ 高光保持律 +
封面态拖动 + openPanel 全拆（零跳转「初始」）+ img ghost 禁拖。
用法: python3 scripts/build-extension.py
输出: download/v8.2.3/ChuShi-NewTab-v8.2.3.zip
"""
import json
import pathlib
import re
import shutil
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "out"
STAGE = pathlib.Path("/tmp/ext-stage")
REF = pathlib.Path("/tmp/ext-ref")  # v1.1.2 参考包（_locales/icons 素材源）
EXT_SRC = ROOT / "extension-src"    # v8.2.0 SW/内容脚本源
VERSION = "8.2.6"
DEST = ROOT / f"download/v{VERSION}/ChuShi-NewTab-v{VERSION}.zip"

if not OUT.exists() or not (OUT / "index.html").exists():
    sys.exit("out/index.html 不存在——先跑 EXTENSION_MODE=1 bun run build:extension")
if not REF.exists():
    sys.exit("/tmp/ext-ref 不存在——先解压 download/v1.1.2/ChuShi-NewTab-v1.1.2.zip 到该目录")

# 0) 干净舞台
if STAGE.exists():
    shutil.rmtree(STAGE)
STAGE.mkdir(parents=True)

# 1) 复制导出产物
shutil.copytree(OUT, STAGE, dirs_exist_ok=True)

# 2) index.html 内联脚本外置（theme 引导 + Next Flight 数据），MV3 普通页禁内联脚本
html = (STAGE / "index.html").read_text(encoding="utf-8")
scripts = re.findall(r"<script>(.*?)</script>", html, re.S)
n = 0
for code in scripts:
    if not code.strip():
        continue
    n += 1
    (STAGE / f"ext-script-{n}.js").write_text(code, encoding="utf-8")
    html = html.replace(f"<script>{code}</script>", f'<script src="/ext-script-{n}.js"></script>', 1)
(STAGE / "index.html").write_text(html, encoding="utf-8")
print(f"index.html: 外置 {n} 个内联脚本")

# 2.5) Chromium 保留名改造：「加载已解压的扩展程序」拒绝任何 `_` 开头的路径组件
# （Chromium 规则：下划线开头组件仅允许 _locales/_platform_specific/_metadata；
#   ⚠ --load-extension 命令行路径不校验——冒烟必须另加保留名校验门，不能只信真浏览器）。
# Next.js 导出的 _next/、_not-found*、_buildManifest.js 等必须改名并同步全部文本引用；
# __next.*.txt Flight 预取回退在单页扩展中永不 fetch（无客户端导航），直接删除。
RESERVED_OK = {"_locales", "_platform_specific", "_metadata"}
TEXT_EXT = {".html", ".js", ".css", ".json", ".txt", ".svg", ".webmanifest", ".map"}
REPL = [
    (b"/_next", b"/next"),    # 绝对路径（覆盖 /_next/… 与串尾 "/_next"）
    (b"_next/", b"next/"),    # 拼接串形态；__next_f 等全局变量不含 "_next/" 不受影响
    (b"_buildManifest", b"buildManifest"),
    (b"_ssgManifest", b"ssgManifest"),
    (b"_clientMiddlewareManifest", b"clientMiddlewareManifest"),
    (b"_not-found", b"not-found"),
]
touched = 0
for p in STAGE.rglob("*"):
    if p.is_file() and p.suffix in TEXT_EXT:
        raw = p.read_bytes()
        new = raw
        for a, b in REPL:
            new = new.replace(a, b)
        if new != raw:
            p.write_bytes(new)
            touched += 1
print(f"保留名改造: 文本引用替换 {touched} 个文件")
for p in STAGE.glob("__next.*"):
    p.unlink()
renamed = 0
for p in sorted(STAGE.rglob("*"), key=lambda x: len(x.parts), reverse=True):
    if not p.exists() or p.name in RESERVED_OK or not p.name.startswith("_"):
        continue
    p.rename(p.parent / p.name.lstrip("_"))
    renamed += 1
print(f"保留名改造: 目录/文件改名 {renamed} 个")

# 3) manifest.json（相对路径引用，扩展根即站点根）
manifest = {
    "manifest_version": 3,
    "name": "__MSG_extName__",
    "short_name": "初始",
    "version": VERSION,
    "description": "__MSG_extDesc__",
    "default_locale": "zh_CN",
    "icons": {"16": "icons/icon16.png", "48": "icons/icon48.png", "128": "icons/icon128.png"},
    "chrome_url_overrides": {"newtab": "index.html"},
    # v7.0.0：原生 DLL 枢纽——ChuShi SMTC Manager 的原生模块在本机回环
    # 开 HTTP 中继（26901，被占用时自动退 26902/26903）。host_permissions
    # 同时放行三端口（缺了它扩展版所有 127.0.0.1 请求被浏览器拦截，音乐
    # 面板在扩展里完全离线；web 版靠枢纽的 CORS * 响应头，不受影响）。
    # v6 渲染进程内 require("http") 枢纽在 CEF 环境不可用（无 Node），已退役。
    # v8.2.0：+26911/26912/26913（独立频谱助手 chushi-spectrum.exe，律动高光）。
    "host_permissions": [
        "https://www.baidu.com/*",
        "https://weather.cma.cn/*",
        "https://api.open-meteo.com/*",
        "https://geocoding-api.open-meteo.com/*",
        "https://api.bigdatacloud.net/*",
        "https://images.unsplash.com/*",
        "http://127.0.0.1:26901/*",
        "http://127.0.0.1:26902/*",
        "http://127.0.0.1:26903/*",
        "http://127.0.0.1:26911/*",
        "http://127.0.0.1:26912/*",
        "http://127.0.0.1:26913/*",
    ],
    # v8.2.0 悬浮音乐卡（想法一三件套之二/之三）：SW 状态中继 + <all_urls>
    # 内容脚本。卡片在自家新标签页不出现（内容脚本不匹配 chrome-extension://），
    # chrome:// 等特权页浏览器规则性无法注入（诚实边界，发版说明已告知）。
    # permissions：storage（卡片位置/药丸/按站隐藏持久化）+ tabs（openPanel
    # 的 tabs.query(url) 聚焦已有面板页；create 不需要权限，query 需要）。
    "permissions": ["storage", "tabs"],
    "background": {"service_worker": "ext-bg.js"},
    "content_scripts": [
        {
            "matches": ["http://*/*", "https://*/*"],
            "js": ["ext-card.js"],
            "run_at": "document_idle",
            "all_frames": False,
        }
    ],
    "sandbox": {"pages": ["sandbox.html"]},
    "content_security_policy": {
        "sandbox": "sandbox allow-scripts; script-src 'self' 'unsafe-inline' 'unsafe-eval'; object-src 'self'"
    },
}
(STAGE / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

# 4) _locales 与 icons（素材沿用 v1.1.2）+ v8.2.1 SW/内容脚本注入
shutil.copytree(REF / "_locales", STAGE / "_locales", dirs_exist_ok=True)
shutil.copytree(REF / "icons", STAGE / "icons", dirs_exist_ok=True)
# v8.2.1 装配律：ext-card.js = ext-lyric.js（歌词引擎）+ ext-card.js（三态 UI）
# 拼接——内容脚本无 importScripts；node 单测直接 require ext-lyric.js 同源码。
_lyric = (EXT_SRC / "ext-lyric.js").read_text(encoding="utf-8")
_card = (EXT_SRC / "ext-card.js").read_text(encoding="utf-8")
(STAGE / "ext-card.js").write_text(
    "/* == ext-lyric.js (歌词引擎，build 时拼接) == */\n" + _lyric +
    "\n/* == ext-card.js (三态悬浮卡) == */\n" + _card,
    encoding="utf-8")
shutil.copy2(EXT_SRC / "ext-bg.js", STAGE / "ext-bg.js")
print("扩展部件注入: ext-bg.js (SW 中继+歌词代理) + ext-card.js (三态卡=歌词引擎+UI)")

# 5) 防呆门：保留名 0 违规（UI 加载路径的硬校验）+ 扩展结构完整性
bad = sorted(
    "/".join(p.relative_to(STAGE).parts)
    for p in STAGE.rglob("*")
    if any(c.startswith("_") and c not in RESERVED_OK for c in p.relative_to(STAGE).parts)
)
if bad:
    sys.exit(f"保留名违规（Chromium UI 加载必拒）: {bad[:5]}")
for must in ("manifest.json", "_locales/zh_CN/messages.json", "icons/icon128.png",
             "index.html", "sandbox.html", "sandbox.js", "ext-bg.js", "ext-card.js"):
    if not (STAGE / must).exists():
        sys.exit(f"缺 {must}——产物不完整")
# v8.2.1 门：SW/内容脚本语法自检（node --check；拼接后的 ext-card.js 才是真产物）
for ext_file in ("ext-bg.js", "ext-card.js"):
    r = subprocess.run(["node", "--check", str(STAGE / ext_file)], capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit(f"{ext_file} 语法门 FAIL: {r.stderr[:300]}")
_card_js = (STAGE / "ext-card.js").read_text(encoding="utf-8")
for feat in ("ChuShiLyric", "parseWordText", "unitizeLine",  # 歌词引擎特征
             "fcard", "flyr-in", "setMode", "cover",         # 三态/歌词 DOM 特征
             "chushi-card",                                    # Port 名
             "ingestTrack", "reconcileLines", "posNowOf",     # v8.2.2 乱跳根治/高光保持
             "coverClickBlock", "dragstart",                   # 封面态拖动 + ghost 禁拖
             "seekGuard", "backStreak",                       # seek 护航/回退熔断
             "needFrame", "sleepNow", "visibilitychange"):    # v8.2.6 渲染休眠律
    if feat not in _card_js:
        sys.exit(f"ext-card.js 缺特征 {feat} —— 拼接/源码不完整")
if 'postMessage({ type: "openPanel"' in _card_js or 'case "openPanel"' in _card_js:
    sys.exit("ext-card.js 残留 openPanel 发送方——用户明确浮窗零跳转「初始」，拒绝")
_bg_js = (STAGE / "ext-bg.js").read_text(encoding="utf-8")
for feat in ("chushi-spectrum", "spectrum-boot", "chushi-card", 'case "lyric":',
             "fetchedAt",  # v8.2.2：ne.ts 采样时刻透传（乱跳根治数据面）
             "broadcastSpec", "visCount", "case \"vis\":"):  # v8.2.6：SW 需求门律
    if feat not in _bg_js:
        sys.exit(f"ext-bg.js 缺特征 {feat} —— SW 歌词代理面缺失")
if 'case "openPanel"' in _bg_js:
    sys.exit("ext-bg.js 残留 openPanel 转发——浮窗零跳转律，拒绝")
_html = (STAGE / "index.html").read_text(encoding="utf-8")
if [s for s in re.findall(r"<script>(.*?)</script>", _html, re.S) if s.strip()]:
    sys.exit("index.html 残留内联脚本（MV3 CSP 必拦）")
if '"/_next' in _html or "/_next/" in _html:
    sys.exit("index.html 残留 /_next 引用——替换漏网")
# v8.2.0 门：manifest 必含 background + content_scripts + 频谱端口
_m = json.loads((STAGE / "manifest.json").read_text(encoding="utf-8"))
if "background" not in _m or "service_worker" not in _m["background"]:
    sys.exit("manifest 缺 background.service_worker——悬浮卡数据面缺失")
if not _m.get("content_scripts") or "ext-card.js" not in _m["content_scripts"][0].get("js", []):
    sys.exit("manifest 缺 content_scripts(ext-card.js)——悬浮卡缺失")
if "http://127.0.0.1:26911/*" not in _m.get("host_permissions", []):
    sys.exit("manifest 缺频谱助手端口 26911 host_permissions")
print("防呆门通过: 保留名 0 违规 + 结构完整 + 零内联 + 零 /_next 残留 + SW/三态悬浮卡/歌词引擎/频谱端口在位")

# 6) zip（ext-script 引用为绝对路径 /ext-script-N.js，zip 根 = 扩展根）
DEST.parent.mkdir(parents=True, exist_ok=True)
if DEST.exists():
    DEST.unlink()
subprocess.run(["zip", "-rq", str(DEST), "."], cwd=STAGE, check=True)
size = DEST.stat().st_size / 1024 / 1024
print(f"OK -> {DEST} ({size:.1f} MB)")
