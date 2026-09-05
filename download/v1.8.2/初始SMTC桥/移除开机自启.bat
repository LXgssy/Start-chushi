@echo off
rem "ChuShi" SMTC bridge - disable auto start (HKCU Run key).
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v ChuShiSmtcBridge /f >nul 2>&1
echo.
echo  Auto-start removed. (No side effect if it was never added.)
echo.
pause
