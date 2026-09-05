# uninstall.ps1 — 初始音乐桥·独立版 卸载（r3）
# 无命令行依赖：网易云目录从自身写过的 %LOCALAPPDATA%\ChuShiBridge\config.json 读取。
$ErrorActionPreference = "Continue"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Write-Host "==> 卸载初始音乐桥"

# 1) 停桥接器
Stop-Process -Name ChuShiBridge -ErrorAction SilentlyContinue
Write-Host "    [OK] 桥接器已停止"

# 2) 读回网易云目录（config.json 是安装时自己写的，可信）
$NcmDir = ""
try {
    $cfgPath = Join-Path $env:LOCALAPPDATA "ChuShiBridge\config.json"
    if (Test-Path -LiteralPath $cfgPath -PathType Leaf) {
        $cfg = Get-Content -LiteralPath $cfgPath -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($cfg.ncmPath) { $NcmDir = [string]$cfg.ncmPath }
    }
} catch { Write-Host "    [i] config.json 读取失败，按未记录网易云目录处理" }

# 3) 还原/删除装载器
if ($NcmDir -and (Test-Path -LiteralPath $NcmDir -PathType Container)) {
    $dll = Join-Path $NcmDir "msimg32.dll"
    $bak = Join-Path $NcmDir "msimg32.dll.chushi-backup"
    if (Test-Path -LiteralPath $dll -PathType Leaf) {
        if (Test-Path -LiteralPath $bak -PathType Leaf) {
            try { Move-Item -LiteralPath $bak -Destination $dll -Force; Write-Host "    [OK] 已还原原 msimg32.dll（BetterNCM 备份）" }
            catch { Write-Host "    [!] 还原失败（需管理员）：请手动删除 $dll" -ForegroundColor Yellow }
        } else {
            try { Remove-Item -LiteralPath $dll -Force; Write-Host "    [OK] 装载器已移除" }
            catch { Write-Host "    [!] 移除失败（需管理员）：请手动删除 $dll" -ForegroundColor Yellow }
        }
    }
} else {
    Write-Host "    [i] 未记录网易云目录；若装过装载器请手动删除网易云目录下 msimg32.dll"
}

# 4) 快捷方式
foreach ($base in @([Environment]::GetFolderPath("Desktop"), [Environment]::GetFolderPath("Startup"))) {
    $lnk = Join-Path $base "初始音乐桥.lnk"
    if (Test-Path -LiteralPath $lnk -PathType Leaf) { Remove-Item -LiteralPath $lnk -Force; Write-Host "    [OK] 已删除 $lnk" }
}

# 5) 本体目录（延迟删自身——本脚本就住在里面）
Write-Host "    [OK] 数据目录将在关闭本窗口后删除"
$dir = $env:LOCALAPPDATA + "\ChuShiBridge"
Start-Process cmd -ArgumentList "/c", "timeout /t 2 >nul & rd /s /q `"$dir`"" -WindowStyle Hidden
Write-Host "==> 卸载完成。网易云音乐可正常使用（重启一次网易云即可完全脱离桥接）。"
