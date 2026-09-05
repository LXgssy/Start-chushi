@echo off
rem 「初始」SMTC 桥启动器 —— 本文件按 ANSI(GBK) 编码发布，请勿另存为 UTF-8
title 初始 SMTC 桥
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0ChuShi-SMTC-Bridge.ps1"
echo.
echo  SMTC 桥已停止，按任意键关闭窗口...
pause >nul
