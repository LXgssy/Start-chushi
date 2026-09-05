@echo off
rem "ChuShi" SMTC bridge - enable auto start on login (HKCU Run key).
set "BRIDGE_DIR=%~dp0"
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v ChuShiSmtcBridge /t REG_SZ /d "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \"%BRIDGE_DIR%ChuShi-SMTC-Bridge.ps1\"" /f >nul
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
