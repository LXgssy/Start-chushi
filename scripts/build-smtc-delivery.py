# build-smtc-delivery.py — v1.8.2 SMTC 交付包（dock 音乐按钮弹出面板版 + bat 终极编码修复）
# 产线：
#   1. download/v1.8.2/初始SMTC桥/ —— ps1(UTF-8 BOM, ASCII 文件名) + 3 个 bat(纯 ASCII + CRLF) + 桥内说明
#   2. download/v1.8.2/ChuShi-SMTC音乐-交付包.zip —— 桥目录 + 预设 .cshz + 使用说明
# 编码纪律（三轮实战定案）：
#   ⚠ bat = 纯 ASCII + CRLF + 无 BOM（v1.8.2 终极方案）：
#     v1.8.0 UTF-8 中文被 cmd(936) 当 GBK 读 → 假命令；
#     v1.8.1 GBK 中文 + LF 换行 → cmd 解析器行偏移错位，行中片段当命令执行；
#     纯 ASCII 下任何代码页解读一致，CRLF 杜绝行偏移——双保险根治。
#     源文件（bridge/smtc/*.bat）即 ASCII+CRLF，本脚本只做字节原样拷贝 + 断言。
#   ⚠ ps1 必须 UTF-8 with BOM：PowerShell 5.1 对无 BOM 文件按 ANSI 解析，中文全乱码。
#   ⚠ 说明.txt = UTF-8 with BOM：老记事本也能识别（面向人读的文件才允非 ASCII）。
import shutil, pathlib, zipfile

ROOT = pathlib.Path("/home/z/my-project")
OUT = ROOT / "download" / "v1.8.2"
BRIDGE_SRC = ROOT / "bridge" / "smtc"
BRIDGE_DST = OUT / "初始SMTC桥"
ZIP = OUT / "ChuShi-SMTC音乐-交付包.zip"
PRESET = ROOT / "examples" / "初始SMTC音乐预设.cshz"
GUIDE = ROOT / "download" / "v1.8.2" / "使用说明-SMTC音乐.md"

OUT.mkdir(parents=True, exist_ok=True)
if BRIDGE_DST.exists():
    shutil.rmtree(BRIDGE_DST)
BRIDGE_DST.mkdir(parents=True)

# 1) ps1：源文件已带 BOM，字节原样拷贝 + BOM 断言
ps1_src = BRIDGE_SRC / "ChuShi-SMTC-Bridge.ps1"
assert ps1_src.read_bytes()[:3] == b"\xef\xbb\xbf", "源 ps1 缺 UTF-8 BOM"
shutil.copy2(ps1_src, BRIDGE_DST / "ChuShi-SMTC-Bridge.ps1")

# 2) bat：纯 ASCII + CRLF，字节原样拷贝 + 三重断言（ASCII / 全 CRLF / 无 BOM）
for bat in ("启动SMTC桥.bat", "添加开机自启.bat", "移除开机自启.bat"):
    data = (BRIDGE_SRC / bat).read_bytes()
    assert all(b < 128 for b in data), f"{bat}: 非 ASCII 字节"
    assert b"\n" not in data.replace(b"\r\n", b""), f"{bat}: 存在 bare LF"
    assert not data.startswith(b"\xef\xbb\xbf"), f"{bat}: 有 BOM"
    (BRIDGE_DST / bat).write_bytes(data)

# 3) 桥内说明（UTF-8 with BOM：面向人读，老记事本可识别）
note = (
    "「初始」SMTC 桥 v1.2.0\n"
    "====================\n"
    "双击「启动SMTC桥.bat」启动，保持窗口开着；\n"
    "建议双击「添加开机自启.bat」，开机自动运行。\n"
    "v1.2.0：.bat 改为纯 ASCII 内容 + CRLF 换行——v1.8.1 的 GBK 版在部分\n"
    "  机器上因 LF 换行被 cmd 错位解析（'ANSI'/'桥' 等假命令），本轮双保险根治；\n"
    "  窗口提示文字改为英文属正常现象，中文说明见交付包《使用说明-SMTC音乐.md》。\n"
    "v1.1.0：主脚本更名 ChuShi-SMTC-Bridge.ps1（须保持 UTF-8 BOM 编码）。\n"
    "配合「初始」新标签页底栏的音乐按钮使用（点击弹出音乐面板，详见使用说明）。\n"
)
(BRIDGE_DST / "说明.txt").write_bytes(b"\xef\xbb\xbf" + note.encode("utf-8"))

# 4) zip：.cshz 预设包 + 使用说明 + 桥目录
if ZIP.exists():
    ZIP.unlink()
with zipfile.ZipFile(ZIP, "w", zipfile.ZIP_DEFLATED) as z:
    z.write(PRESET, "初始SMTC音乐预设.cshz")
    z.write(GUIDE, "使用说明-SMTC音乐.md")
    for f in sorted(BRIDGE_DST.rglob("*")):
        z.write(f, str(f.relative_to(OUT)))

# 5) 验包
raw = (BRIDGE_DST / "启动SMTC桥.bat").read_bytes()
assert raw.startswith(b"@echo off\r\n") and all(b < 128 for b in raw), "bat 断言失败"
assert b"chcp" not in raw, "bat 不应含 chcp"
head = (BRIDGE_DST / "ChuShi-SMTC-Bridge.ps1").read_bytes()[:3]
assert head == b"\xef\xbb\xbf", f"ps1 BOM missing: {head}"
with zipfile.ZipFile(ZIP) as z:
    names = z.namelist()
assert any(n.endswith(".cshz") for n in names), f"zip 缺 .cshz: {names}"

print("OK ->", ZIP, f"({ZIP.stat().st_size / 1024:.0f} KB)")
for f in sorted(BRIDGE_DST.iterdir()):
    print("  -", f.name)
print("bat ASCII+CRLF ✓ / ps1 UTF-8 BOM ✓ / 说明.txt BOM ✓ / zip 含 .cshz ✓")
