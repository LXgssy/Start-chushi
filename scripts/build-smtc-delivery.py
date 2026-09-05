# build-smtc-delivery.py — v1.8.1 SMTC 交付包（.cshz 预设包 + 编码修复版桥）
# 产线：
#   1. download/v1.8.1/初始SMTC桥/ —— ps1(UTF-8 BOM, ASCII 文件名) + 3 个 bat(GBK/ANSI) + 桥内说明
#   2. download/v1.8.1/ChuShi-SMTC音乐-交付包.zip —— 桥目录 + 预设 .cshz + 使用说明
# 编码纪律（v1.8.1 根因修复）：
#   ⚠ bat 必须 ANSI/GBK：cmd 按 console 代码页(936)逐行解码批处理；
#     UTF-8 bat + chcp 65001 会在切换代码页后触发 cmd 重读错位，把注释乱码当命令执行
#     （用户实测：'敤' 不是内部或外部命令）。故源文件(UTF-8)在此统一转 GBK 写出。
#   ⚠ ps1 必须 UTF-8 with BOM：PowerShell 5.1 对无 BOM 文件按 ANSI 解析，中文全乱码。
import shutil, pathlib, zipfile

ROOT = pathlib.Path("/home/z/my-project")
OUT = ROOT / "download" / "v1.8.1"
BRIDGE_SRC = ROOT / "bridge" / "smtc"
BRIDGE_DST = OUT / "初始SMTC桥"
ZIP = OUT / "ChuShi-SMTC音乐-交付包.zip"
PRESET = ROOT / "examples" / "初始SMTC音乐预设.cshz"

OUT.mkdir(parents=True, exist_ok=True)
if BRIDGE_DST.exists():
    shutil.rmtree(BRIDGE_DST)
BRIDGE_DST.mkdir(parents=True)

# 1) ps1：源文件已带 BOM，字节原样拷贝 + BOM 断言
ps1_src = BRIDGE_SRC / "ChuShi-SMTC-Bridge.ps1"
assert ps1_src.read_bytes()[:3] == b"\xef\xbb\xbf", "源 ps1 缺 UTF-8 BOM"
shutil.copy2(ps1_src, BRIDGE_DST / "ChuShi-SMTC-Bridge.ps1")

# 2) bat：UTF-8 源 → GBK 写出（并断言 GBK 可无损往返）
for bat in ("启动SMTC桥.bat", "添加开机自启.bat", "移除开机自启.bat"):
    text = (BRIDGE_SRC / bat).read_text(encoding="utf-8")
    data = text.encode("gbk")  # 含 GBK 外字符会在此抛错（防患）
    assert data.decode("gbk") == text
    (BRIDGE_DST / bat).write_bytes(data)

# 3) 桥内说明
(BRIDGE_DST / "说明.txt").write_text(
    "「初始」SMTC 桥 v1.1.0\n"
    "====================\n"
    "双击「启动SMTC桥.bat」启动，保持窗口开着；\n"
    "建议双击「添加开机自启.bat」，开机自动运行。\n"
    "v1.1.0：.bat 改为 ANSI(GBK) 编码，修复中文 Windows 下乱码假命令；\n"
    "主脚本更名 ChuShi-SMTC-Bridge.ps1（须保持 UTF-8 BOM 编码）。\n"
    "配合「初始」新标签页的 SMTC 音乐磁贴使用（详见交付包 使用说明-SMTC音乐.md）。\n",
    encoding="utf-8",
)

# 4) zip：.cshz 预设包 + 使用说明 + 桥目录
if ZIP.exists():
    ZIP.unlink()
with zipfile.ZipFile(ZIP, "w", zipfile.ZIP_DEFLATED) as z:
    z.write(PRESET, "初始SMTC音乐预设.cshz")
    z.write(OUT / "使用说明-SMTC音乐.md", "使用说明-SMTC音乐.md")
    for f in sorted(BRIDGE_DST.rglob("*")):
        z.write(f, str(f.relative_to(OUT)))

# 5) 验包：bat 是 GBK、ps1 带 BOM、zip 含 .cshz
assert (BRIDGE_DST / "启动SMTC桥.bat").read_bytes().startswith(b"@echo off")
raw = (BRIDGE_DST / "启动SMTC桥.bat").read_bytes()
assert raw.decode("gbk").startswith("@echo off"), "bat 不是合法 GBK"
assert b"chcp" not in raw, "bat 不应再含 chcp 65001"
head = (BRIDGE_DST / "ChuShi-SMTC-Bridge.ps1").read_bytes()[:3]
assert head == b"\xef\xbb\xbf", f"ps1 BOM missing: {head}"
with zipfile.ZipFile(ZIP) as z:
    names = z.namelist()
assert any(n.endswith(".cshz") for n in names), f"zip 缺 .cshz: {names}"

print("OK ->", ZIP, f"({ZIP.stat().st_size / 1024:.0f} KB)")
for f in sorted(BRIDGE_DST.iterdir()):
    print("  -", f.name)
print("bat GBK ✓ / ps1 UTF-8 BOM ✓ / zip 含 .cshz ✓")
