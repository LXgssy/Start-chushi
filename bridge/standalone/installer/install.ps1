# install.ps1 — 初始音乐桥·独立版 一键安装
# 由「安装初始音乐桥.bat」调用；幂等可重复运行。
param(
    [string]$Root = "",      # 安装包解压目录（含 ChuShiBridge 子目录）
    [switch]$Elevated = $false
)
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

if (-not $Root) { $Root = Split-Path -Parent $PSScriptRoot }
$SrcDll  = Join-Path $Root "ChuShiBridge\msimg32.dll"
$SrcExe  = Join-Path $Root "ChuShiBridge\ChuShiBridge.exe"
$Home_   = Join-Path $env:LOCALAPPDATA "ChuShiBridge"
$ExeDst  = Join-Path $Home_ "ChuShiBridge.exe"

function Write-Step($msg)  { Write-Host ("==> " + $msg) -ForegroundColor Cyan }
function Write-OK($msg)    { Write-Host ("    [OK] " + $msg) -ForegroundColor Green }
function Write-Warn2($msg) { Write-Host ("    [!] "  + $msg) -ForegroundColor Yellow }

Write-Host "==============================================" -ForegroundColor Cyan
Write-Host "  初始音乐桥 · 独立版 — 一键安装" -ForegroundColor Cyan
Write-Host "  不依赖 BetterNCM / chromatic 任何框架" -ForegroundColor Gray
Write-Host "==============================================" -ForegroundColor Cyan

# ---------- 1. 定位网易云音乐 ----------
Write-Step "定位网易云音乐安装目录"
$ncmDir = $null
$regPaths = @(
    "HKCU:\Software\NetEase\CloudMusic",
    "HKLM:\SOFTWARE\NetEase\CloudMusic",
    "HKLM:\SOFTWARE\WOW6432Node\NetEase\CloudMusic"
)
foreach ($rp in $regPaths) {
    try {
        $v = (Get-ItemProperty -Path $rp -ErrorAction SilentlyContinue).InstallDir
        if ($v -and (Test-Path (Join-Path $v "cloudmusic.exe"))) { $ncmDir = $v; break }
    } catch {}
}
if (-not $ncmDir) {
    $cands = @(
        (Join-Path $env:LOCALAPPDATA "Netease\CloudMusic"),
        (Join-Path $env:ProgramFiles "Netease\CloudMusic"),
        (Join-Path ${env:ProgramFiles(x86)} "Netease\CloudMusic")
    )
    foreach ($c in $cands) {
        if (Test-Path (Join-Path $c "cloudmusic.exe")) { $ncmDir = $c; break }
    }
}
if (-not $ncmDir) {
    $proc = Get-Process cloudmusic -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($proc) { $ncmDir = Split-Path -Parent $proc.Path }
}
if (-not $ncmDir) {
    Write-Warn2 "未找到网易云音乐安装目录。"
    $inp = Read-Host "请手动输入 cloudmusic.exe 所在目录（直接回车则跳过装载器安装，仅安装桥接器）"
    if ($inp -and (Test-Path (Join-Path $inp "cloudmusic.exe"))) { $ncmDir = $inp }
}
if ($ncmDir) { Write-OK "网易云目录：$ncmDir" } else { Write-Warn2 "未提供网易云目录，将只安装桥接器本体" }

# ---------- 2. 自提升（网易云目录不可写时） ----------
function Test-Writable($dir) {
    try { $t = Join-Path $dir "__cb_test__"; New-Item -ItemType File -Path $t -Force | Out-Null; Remove-Item $t -Force; return $true }
    catch { return $false }
}
if ($ncmDir -and -not (Test-Writable $ncmDir) -and -not $Elevated) {
    Write-Warn2 "网易云目录需要管理员权限写入，正在请求提升…"
    $args = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`"$PSCommandPath`"", "-Root", "`"$Root`"", "-Elevated")
    Start-Process powershell -Verb RunAs -ArgumentList $args
    exit 0
}

# ---------- 3. 架构检查 + 装载器（msimg32.dll 代理） ----------
$loaderDone = $false
if ($ncmDir) {
    Write-Step "安装 msimg32 装载器（保证任意方式启动网易云都开启调试端口）"
    $exePath = Join-Path $ncmDir "cloudmusic.exe"
    $fs = [System.IO.File]::OpenRead($exePath)
    $br = New-Object System.IO.BinaryReader($fs)
    $fs.Seek(0x3C, 'Begin') | Out-Null
    $peOff = $br.ReadInt32()
    $fs.Seek($peOff + 4, 'Begin') | Out-Null
    $machine = $br.ReadUInt16()
    $br.Close(); $fs.Close()
    if ($machine -ne 0x8664) {
        Write-Warn2 "网易云不是 x64 版（machine=0x{0:X4}），跳过装载器（桥接器仍可通过本程序代启生效）" -f $machine
    } else {
        $dstDll = Join-Path $ncmDir "msimg32.dll"
        if (Test-Path $dstDll) {
            $sz = (Get-Item $dstDll).Length
            $ourSz = (Get-Item $SrcDll).Length
            if ($sz -ne $ourSz) {
                $bak = Join-Path $ncmDir "msimg32.dll.chushi-backup"
                Copy-Item $dstDll $bak -Force
                Write-Warn2 "已存在 msimg32.dll（可能是 BetterNCM），已备份为 msimg32.dll.chushi-backup 后替换"
            } else {
                Write-OK "装载器已是当前版本，跳过"
            }
        }
        Copy-Item $SrcDll $dstDll -Force
        $loaderDone = $true
        Write-OK "装载器就位：$dstDll"
    }
}

# ---------- 4. 桥接器本体 + 配置 ----------
Write-Step "安装桥接器本体"
New-Item -ItemType Directory -Path $Home_ -Force | Out-Null
Copy-Item $SrcExe $ExeDst -Force
Write-OK "本体：$ExeDst"

$cfg = @{ cdp = 18754 }
if ($ncmDir) { $cfg.ncmPath = $ncmDir }
$cfg | ConvertTo-Json | Set-Content -Path (Join-Path $Home_ "config.json") -Encoding UTF8
Write-OK "配置写入 config.json"

# ---------- 5. 桌面快捷方式 ----------
Write-Step "创建桌面快捷方式"
try {
    $desktop = [Environment]::GetFolderPath("Desktop")
    $ws = New-Object -ComObject WScript.Shell
    $sc = $ws.CreateShortcut((Join-Path $desktop "初始音乐桥.lnk"))
    $sc.TargetPath = $ExeDst
    $sc.WorkingDirectory = $Home_
    $sc.Description = "为「初始」起始页提供网易云正在播放能力"
    $sc.Save()
    Write-OK "桌面快捷方式：初始音乐桥.lnk"
} catch { Write-Warn2 "快捷方式创建失败（不影响使用）" }

# ---------- 6. 开机自启（可选） ----------
$ans = Read-Host "是否随 Windows 开机自启桥接？(y/N)"
if ($ans -match "^[Yy]") {
    try {
        $startup = [Environment]::GetFolderPath("Startup")
        $ws2 = New-Object -ComObject WScript.Shell
        $sc2 = $ws2.CreateShortcut((Join-Path $startup "初始音乐桥.lnk"))
        $sc2.TargetPath = $ExeDst
        $sc2.Arguments = "--no-launch"
        $sc2.WorkingDirectory = $Home_
        $sc2.Save()
        Write-OK "已加入开机自启（启动文件夹）"
    } catch { Write-Warn2 "自启设置失败" }
}

# ---------- 7. 生成卸载脚本 ----------
$un = Join-Path $Home_ "uninstall.bat"
$ncmEsc = if ($ncmDir) { $ncmDir } else { "" }
@"
@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%LOCALAPPDATA%\ChuShiBridge\uninstall.ps1" -NcmDir "$ncmEsc"
pause
"@ | Set-Content -Path $un -Encoding ASCII

# ---------- 8. 启动桥接 ----------
Write-Step "启动桥接（将自动重启网易云音乐以启用桥接）"
Stop-Process -Name cloudmusic -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
Start-Process $ExeDst -ArgumentList "--kill-ncm" -WorkingDirectory $Home_

# ---------- 9. 健康检查 ----------
Write-Step "等待桥接服务就绪（最多 60 秒）"
$ok = $false
for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Seconds 1
    try {
        $r = Invoke-WebRequest -Uri "http://127.0.0.1:10754/api/ping" -UseBasicParsing -TimeoutSec 2
        if ($r.StatusCode -eq 200 -and $r.Content -match "chushi-music-bridge") { $ok = $true; break }
    } catch {}
}
Write-Host ""
if ($ok) {
    Write-Host "==============================================" -ForegroundColor Green
    Write-Host "  安装完成，桥接服务已就绪（127.0.0.1:10754）" -ForegroundColor Green
    Write-Host "==============================================" -ForegroundColor Green
} else {
    Write-Host "==============================================" -ForegroundColor Yellow
    Write-Host "  桥接器已安装，但服务尚未就绪" -ForegroundColor Yellow
    Write-Host "  请查看日志：%LOCALAPPDATA%\ChuShiBridge\bridge.log" -ForegroundColor Yellow
    Write-Host "  常见原因：网易云首次启动较慢 / 安全软件拦截" -ForegroundColor Yellow
    Write-Host "==============================================" -ForegroundColor Yellow
}
Write-Host ""
Write-Host "下一步：打开「初始」（Dock 栏音乐按钮或网页版音乐面板）→ 点击连接。"
Write-Host "卸载：运行 $un"
if ($Elevated) { Write-Host ""; Read-Host "安装完成，按回车关闭窗口" }
