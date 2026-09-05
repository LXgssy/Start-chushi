@echo off
rem ChuShi Bridge one-click installer (UTF-8 PS1 inside)
rem NOTE: never pass -Root "%~dp0" — trailing backslash escapes the closing
rem quote (CommandLineToArgvW) and pollutes $Root. install.ps1 finds its
rem assets via $PSScriptRoot automatically.
chcp 65001 >nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0ChuShiBridge\install.ps1"
pause
