@echo off
title ChuShi SMTC Bridge
rem "ChuShi" start page - SMTC bridge launcher (PowerShell, zero dependency).
rem This file is plain ASCII with CRLF endings: encoding-proof on any codepage.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0ChuShi-SMTC-Bridge.ps1"
echo.
echo  SMTC bridge stopped. Press any key to close this window...
pause >nul
