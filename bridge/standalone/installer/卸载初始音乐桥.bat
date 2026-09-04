@echo off
rem ChuShi Bridge uninstaller
chcp 65001 >nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0ChuShiBridge\uninstall.ps1"
pause
