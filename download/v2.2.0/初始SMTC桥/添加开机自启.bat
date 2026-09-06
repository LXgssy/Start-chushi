@echo off
rem "ChuShi" SMTC bridge - enable auto start on login (HKCU Run key).
rem v1.6.0: launch via wscript hidden VBS - zero window, zero flash at login.
set "BRIDGE_DIR=%~dp0"
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v ChuShiSmtcBridge /t REG_SZ /d "wscript.exe \"%BRIDGE_DIR%bridge-hidden.vbs\"" /f >nul
if %errorlevel%==0 (
  echo.
  echo  Auto-start enabled (silent). The bridge starts hidden on login -
  echo  no window will ever appear. To undo, run remove-autostart .bat.
  echo  Note: after updating the bridge, start it once manually and the
  echo  autostart entry will self-heal to the new folder automatically.
) else (
  echo.
  echo  Failed. Try right-click this file and choose "Run as administrator".
)
echo.
pause
