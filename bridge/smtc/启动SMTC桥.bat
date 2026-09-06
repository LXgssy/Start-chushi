@echo off
title ChuShi SMTC Bridge
rem "ChuShi" start page - SMTC bridge manual launcher (plan B, zero dependency).
rem This file is plain ASCII with CRLF endings: encoding-proof on any codepage.
rem Normal installs do NOT need this: the NetEase plugin deploys + starts +
rem supervises the bridge automatically. Use only if policy software blocks
rem the plugin from spawning PowerShell (panel stays disconnected).
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0chushi-bridge.ps1"
echo.
echo  SMTC bridge stopped. Press any key to close this window...
pause >nul
