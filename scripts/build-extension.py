#!/usr/bin/env python3
"""扩展打包：EXTENSION_MODE 导出产物 → MV3 扩展 zip（v1.7.1，v8.1.2 复用）。
步骤：index.html 内联 <script> 外置为 ext-script-N.js（MV3 CSP 兼容）→
写入 manifest.json（版本号此处维护）→ 复制 _locales/icons → zip。
⚠ v8.0.8~v8.1.1 发版回归：build-v8xx-assets.py 直接 zip out/，漏掉本脚本
全部注入步骤（manifest/_locales/icons/内联外置）→ 发布包无法全新安装。
v8.1.2 起恢复本流程作为扩展包唯一产出门。
用法: python3 scripts/build-extension.py
输出: download/v8.1.4/ChuShi-NewTab-v8.1.4.zip
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
VERSION = "8.1.4"
DEST = ROOT / "download/v8.1.4/ChuShi-NewTab-v8.1.4.zip"

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
    ],
    "sandbox": {"pages": ["sandbox.html"]},
    "content_security_policy": {
        "sandbox": "sandbox allow-scripts; script-src 'self' 'unsafe-inline' 'unsafe-eval'; object-src 'self'"
    },
}
(STAGE / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

# 4) _locales 与 icons（素材沿用 v1.1.2）
shutil.copytree(REF / "_locales", STAGE / "_locales", dirs_exist_ok=True)
shutil.copytree(REF / "icons", STAGE / "icons", dirs_exist_ok=True)

# 5) 防呆门：保留名 0 违规（UI 加载路径的硬校验）+ 扩展结构完整性
bad = sorted(
    "/".join(p.relative_to(STAGE).parts)
    for p in STAGE.rglob("*")
    if any(c.startswith("_") and c not in RESERVED_OK for c in p.relative_to(STAGE).parts)
)
if bad:
    sys.exit(f"保留名违规（Chromium UI 加载必拒）: {bad[:5]}")
for must in ("manifest.json", "_locales/zh_CN/messages.json", "icons/icon128.png",
             "index.html", "sandbox.html", "sandbox.js"):
    if not (STAGE / must).exists():
        sys.exit(f"缺 {must}——产物不完整")
_html = (STAGE / "index.html").read_text(encoding="utf-8")
if [s for s in re.findall(r"<script>(.*?)</script>", _html, re.S) if s.strip()]:
    sys.exit("index.html 残留内联脚本（MV3 CSP 必拦）")
if '"/_next' in _html or "/_next/" in _html:
    sys.exit("index.html 残留 /_next 引用——替换漏网")
print("防呆门通过: 保留名 0 违规 + 结构完整 + 零内联 + 零 /_next 残留")

# 6) zip（ext-script 引用为绝对路径 /ext-script-N.js，zip 根 = 扩展根）
DEST.parent.mkdir(parents=True, exist_ok=True)
if DEST.exists():
    DEST.unlink()
subprocess.run(["zip", "-rq", str(DEST), "."], cwd=STAGE, check=True)
size = DEST.stat().st_size / 1024 / 1024
print(f"OK -> {DEST} ({size:.1f} MB)")
