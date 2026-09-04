#!/usr/bin/env python3
"""扩展打包：EXTENSION_MODE 导出产物 → MV3 扩展 zip（v1.7.1）。
步骤：index.html 内联 <script> 外置为 ext-script-N.js（MV3 CSP 兼容）→
写入 manifest.json（版本号此处维护）→ 复制 _locales/icons → zip。
用法: python3 scripts/build-extension.py
输出: download/v1.7.2/ChuShi-NewTab-v1.7.2.zip
"""
import json
import pathlib
import re
import shutil
import subprocess
import sys

ROOT = pathlib.Path("/home/z/my-project")
OUT = ROOT / "out"
STAGE = pathlib.Path("/tmp/ext-stage")
REF = pathlib.Path("/tmp/ext-ref")  # v1.1.2 参考包（_locales/icons 素材源）
VERSION = "1.7.2"
DEST = ROOT / "download/v1.7.2/ChuShi-NewTab-v1.7.2.zip"

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
    "host_permissions": [
        "https://www.baidu.com/*",
        "https://weather.cma.cn/*",
        "https://api.open-meteo.com/*",
        "https://geocoding-api.open-meteo.com/*",
        "https://api.bigdatacloud.net/*",
        "https://images.unsplash.com/*",
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

# 5) zip（ext-script 引用为绝对路径 /ext-script-N.js，zip 根 = 扩展根）
DEST.parent.mkdir(parents=True, exist_ok=True)
if DEST.exists():
    DEST.unlink()
subprocess.run(["zip", "-rq", str(DEST), "."], cwd=STAGE, check=True)
size = DEST.stat().st_size / 1024 / 1024
print(f"OK -> {DEST} ({size:.1f} MB)")
