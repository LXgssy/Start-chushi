@echo off
rem 「初始」SMTC 桥 · 添加开机自启（写 HKCU Run 注册表，登录即后台启动桥）
chcp 65001 >nul
set "BRIDGE_DIR=%~dp0"
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v ChuShiSmtcBridge /t REG_SZ /d "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \"%BRIDGE_DIR%ChuShi-SMTC桥.ps1\"" /f >nul
if %errorlevel%==0 (
  echo.
  echo  已添加开机自启：下次登录 Windows 时 SMTC 桥将隐藏窗口自动运行。
  echo  （取消自启请运行「移除开机自启.bat」）
) else (
  echo.
  echo  添加失败，请尝试右键「以管理员身份运行」本文件。
)
echo.
pause
