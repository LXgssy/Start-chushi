# build-smtc-delivery.py — v1.8.0 SMTC 交付包
# 产线：
#   1. download/v1.8.0/初始SMTC桥/ —— ps1(BOM) + 3 个 bat + 桥内说明
#   2. download/v1.8.0/ChuShi-SMTC音乐-交付包.zip —— 桥目录 + 预设 JSON + 使用说明
# ⚠ ps1 必须带 UTF-8 BOM：PowerShell 5.1 对无 BOM 文件按 ANSI 解析，中文全乱码。
import shutil, subprocess, pathlib, zipfile

ROOT = pathlib.Path("/home/z/my-project")
OUT = ROOT / "download" / "v1.8.0"
BRIDGE_SRC = ROOT / "bridge" / "smtc"
BRIDGE_DST = OUT / "初始SMTC桥"
ZIP = OUT / "ChuShi-SMTC音乐-交付包.zip"

OUT.mkdir(parents=True, exist_ok=True)
if BRIDGE_DST.exists():
    shutil.rmtree(BRIDGE_DST)
BRIDGE_DST.mkdir(parents=True)

# 1) ps1 → UTF-8 BOM
src = (BRIDGE_SRC / "ChuShi-SMTC桥.ps1").read_text(encoding="utf-8")
(BRIDGE_DST / "ChuShi-SMTC桥.ps1").write_bytes(b"\xef\xbb\xbf" + src.encode("utf-8"))

# 2) bat 原样（GBK/ANSI 兼容？.bat 中文注释在 chcp 65001 下按 UTF-8 读 ✓ 源文件即 UTF-8）
for bat in ("启动SMTC桥.bat", "添加开机自启.bat", "移除开机自启.bat"):
    shutil.copy2(BRIDGE_SRC / bat, BRIDGE_DST / bat)

# 3) 桥内说明（精简版）
(BRIDGE_DST / "说明.txt").write_text(
    "「初始」SMTC 桥 v1.0.0\n"
    "====================\n"
    "双击「启动SMTC桥.bat」启动，保持窗口开着；\n"
    "建议双击「添加开机自启.bat」，开机自动运行。\n"
    "配合「初始」新标签页的 SMTC 音乐磁贴使用（详见交付包 使用说明-SMTC音乐.md）。\n",
    encoding="utf-8",
)

# 4) zip
if ZIP.exists():
    ZIP.unlink()
with zipfile.ZipFile(ZIP, "w", zipfile.ZIP_DEFLATED) as z:
    z.write(ROOT / "examples" / "初始SMTC音乐预设.json", "初始SMTC音乐预设.json")
    z.write(OUT / "使用说明-SMTC音乐.md", "使用说明-SMTC音乐.md")
    for f in sorted(BRIDGE_DST.rglob("*")):
        z.write(f, str(f.relative_to(OUT)))

print("OK ->", ZIP, f"({ZIP.stat().st_size / 1024:.0f} KB)")
for f in sorted(BRIDGE_DST.iterdir()):
    print("  -", f.name)
# BOM 断言
head = (BRIDGE_DST / "ChuShi-SMTC桥.ps1").read_bytes()[:3]
assert head == b"\xef\xbb\xbf", f"BOM missing: {head}"
print("PS1 UTF-8 BOM ✓")
