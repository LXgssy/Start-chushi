@echo off
rem 「初始」SMTC 桥 · 移除开机自启
chcp 65001 >nul
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v ChuShiSmtcBridge /f >nul 2>&1
echo.
echo  已移除开机自启（若之前未添加过也会显示完成，无副作用）。
echo.
pause
