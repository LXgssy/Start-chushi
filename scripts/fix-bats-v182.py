# fix-bats-v182.py — SMTC 桥三个 bat 编码终极修复（v1.8.2）
#
# 历史两轮教训：
#   v1.8.0：bat = UTF-8 无 BOM + 中文 → cmd(936) 把 UTF-8 双字节当 GBK 读 → '敤'/'垵濮?SMTC' 假命令
#   v1.8.1：bat = GBK + 中文，但换行符 LF（Unix）→ cmd 批处理解析器对「LF-only + 多字节」
#           行偏移错位，把行中片段当命令执行（用户实测：'ANSI' / '桥' / 'e' / 'MTC'）
# v1.8.2 终极方案（双保险，任何代码页/解析器怪癖下都不可能再坏）：
#   1) 内容纯 ASCII —— 零非 ASCII 字节，任何代码页（936/65001/1252）解读结果相同
#   2) 换行 CRLF —— Windows 批处理原生格式，杜绝解析器行偏移错位
#   3) 无 BOM —— BOM 会破坏首行 @echo off
# 中文名（启动SMTC桥.bat 等）保留：文件名由 NTFS/资源管理器按 UTF-16 处理，与本 bug 无关
import pathlib

SRC = pathlib.Path("/home/z/my-project/bridge/smtc")

BATS = {
    "启动SMTC桥.bat": """@echo off
title ChuShi SMTC Bridge
rem "ChuShi" start page - SMTC bridge launcher (PowerShell, zero dependency).
rem This file is plain ASCII with CRLF endings: encoding-proof on any codepage.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0ChuShi-SMTC-Bridge.ps1"
echo.
echo  SMTC bridge stopped. Press any key to close this window...
pause >nul
""",
    "添加开机自启.bat": """@echo off
rem "ChuShi" SMTC bridge - enable auto start on login (HKCU Run key).
set "BRIDGE_DIR=%~dp0"
reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v ChuShiSmtcBridge /t REG_SZ /d "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \\"%BRIDGE_DIR%ChuShi-SMTC-Bridge.ps1\\"" /f >nul
if %errorlevel%==0 (
  echo.
  echo  Auto-start enabled: the bridge will start hidden on next login.
  echo  To undo, run the remove-autostart .bat in this folder.
) else (
  echo.
  echo  Failed. Try right-click this file and choose "Run as administrator".
)
echo.
pause
""",
    "移除开机自启.bat": """@echo off
rem "ChuShi" SMTC bridge - disable auto start (HKCU Run key).
reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v ChuShiSmtcBridge /f >nul 2>&1
echo.
echo  Auto-start removed. (No side effect if it was never added.)
echo.
pause
""",
}

for name, text in BATS.items():
    # 断言源文本本身纯 ASCII（含转义后的引号/反斜杠）
    assert all(ord(c) < 128 for c in text), f"{name}: 源文本含非 ASCII 字符"
    data = text.replace("\r\n", "\n").replace("\n", "\r\n").encode("ascii")
    # 终检：纯 ASCII / 全 CRLF / 无 BOM / 首行 @echo off
    assert all(b < 128 for b in data), f"{name}: 非 ASCII 字节"
    assert b"\n" not in data.replace(b"\r\n", b""), f"{name}: 存在 bare LF"
    assert not data.startswith(b"\xef\xbb\xbf"), f"{name}: 有 BOM"
    assert data.startswith(b"@echo off\r\n"), f"{name}: 首行不是 @echo off"
    (SRC / name).write_bytes(data)
    print(f"OK {name}: {len(data)} bytes, ASCII+CRLF")

# ps1 编码纪律复核（本轮不动它，只断言源即合格）
ps1 = (SRC / "ChuShi-SMTC-Bridge.ps1").read_bytes()
assert ps1[:3] == b"\xef\xbb\xbf", "ps1 缺 UTF-8 BOM"
print("OK ChuShi-SMTC-Bridge.ps1: UTF-8 BOM in place, untouched")
