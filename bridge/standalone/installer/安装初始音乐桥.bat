@echo off
rem ChuShi Bridge one-click installer (UTF-8 PS1 inside)
chcp 65001 >nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0ChuShiBridge\install.ps1" -Root "%~dp0"
pause
