@echo off
rem 「初始」SMTC 桥启动器：使用 Windows 自带 PowerShell 5.1 运行（WinRT 投影依赖）
chcp 65001 >nul
title 初始 SMTC 桥
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0ChuShi-SMTC桥.ps1"
pause
