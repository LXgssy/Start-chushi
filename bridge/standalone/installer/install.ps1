# install.ps1 — 初始音乐桥·独立版 一键安装（r3）
# 由「安装初始音乐桥.bat」调用；幂等可重复运行。
# r3 要点：
#   ① 第 0 步自动关闭运行中的网易云（装载器文件替换需要；装完自动带参重启）——
#      修复 r2「网易云运行时无法安装，只能关闭后安装」
#   ② Clean-Path 入口消毒 + Find-Asset 资产自探测（根治 bat 传 "%~dp0" 尾反斜杠
#      被解析成字面引号导致的 Get-Item : Illegal characters in path）
#   ③ 全量 -LiteralPath；文件拷贝锁定重试；同尺寸跳过
#   ④ 卸载脚本自复制进数据目录（卸载不依赖安装包存活）
#   ⑤ 自提升子进程不回传 -Root（靠 $PSScriptRoot 自探测）
param(
    [string]$Root = "",      # 可选：安装包解压目录（默认自动探测）
    [switch]$Elevated = $false
)
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Write-Step($msg)  { Write-Host ("==> " + $msg) -ForegroundColor Cyan }
function Write-OK($msg)    { Write-Host ("    [OK] " + $msg) -ForegroundColor Green }
function Write-Warn2($msg) { Write-Host ("    [!] "  + $msg) -ForegroundColor Yellow }

# ---------- Clean-Path：入口消毒（剥引号/空白/尾反斜杠，防命令行转义污染） ----------
function Clean-Path([string]$p) {
    if (-not $p) { return "" }
    $q = $p.Trim()
    $q = $q.Trim('"')
    $q = $q.Trim()
    while ($q.Length -gt 3 -and $q.EndsWith('\')) { $q = $q.Substring(0, $q.Length - 1) }
    while ($q.Length -gt 1 -and $q.EndsWith('"')) { $q = $q.Trim('"').Trim() }
    return $q
}

$Root = Clean-Path $Root

# ---------- Find-Asset：四路候选自探测资产（exe/dll 一定在脚本旁） ----------
function Find-Asset([string]$name) {
    $cands = @()
    if ($PSScriptRoot) {
        $cands += (Join-Path $PSScriptRoot $name)
        $cands += (Clean-Path (Join-Path $PSScriptRoot ("ChuShiBridge\" + $name)))
    }
    if ($Root) {
        $cands += (Clean-Path (Join-Path $Root ("ChuShiBridge\" + $name)))
        $cands += (Clean-Path (Join-Path $Root $name))
    }
    foreach ($c in $cands) {
        $c2 = Clean-Path $c
        if ($c2 -and (Test-Path -LiteralPath $c2 -PathType Leaf)) { return $c2 }
    }
    return ""
}

$SrcDll = Find-Asset "msimg32.dll"
$SrcExe = Find-Asset "ChuShiBridge.exe"
$SrcUn  = Find-Asset "uninstall.ps1"
if (-not $SrcExe -or -not $SrcDll) {
    Write-Host "==============================================" -ForegroundColor Red
    Write-Host "  未找到安装资产（ChuShiBridge.exe / msimg32.dll）" -ForegroundColor Red
    Write-Host "  请完整解压安装包后，运行包内「安装初始音乐桥.bat」" -ForegroundColor Red
    Write-Host "==============================================" -ForegroundColor Red
    if ($Elevated) { Read-Host "按回车关闭窗口" }
    exit 1
}
$Home_  = Join-Path $env:LOCALAPPDATA "ChuShiBridge"
$ExeDst = Join-Path $Home_ "ChuShiBridge.exe"

Write-Host "==============================================" -ForegroundColor Cyan
Write-Host "  初始音乐桥 · 独立版 — 一键安装（v2.0.2）" -ForegroundColor Cyan
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
        $v = (Get-ItemProperty -LiteralPath $rp -ErrorAction SilentlyContinue).InstallDir
        if ($v) { $v = Clean-Path $v }
        if ($v -and (Test-Path -LiteralPath (Join-Path $v "cloudmusic.exe") -PathType Leaf)) { $ncmDir = $v; break }
    } catch {}
}
if (-not $ncmDir) {
    $cands = @(
        (Join-Path $env:LOCALAPPDATA "Netease\CloudMusic"),
        (Join-Path $env:ProgramFiles "Netease\CloudMusic"),
        (Join-Path ${env:ProgramFiles(x86)} "Netease\CloudMusic")
    )
    foreach ($c in $cands) {
        $c2 = Clean-Path $c
        if ($c2 -and (Test-Path -LiteralPath (Join-Path $c2 "cloudmusic.exe") -PathType Leaf)) { $ncmDir = $c2; break }
    }
}
if (-not $ncmDir) {
    $proc = Get-Process cloudmusic -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($proc -and $proc.Path) { $ncmDir = Split-Path -Parent $proc.Path }
}
if (-not $ncmDir) {
    Write-Warn2 "未找到网易云音乐安装目录。"
    $inp = Read-Host "请手动输入 cloudmusic.exe 所在目录（直接回车则跳过装载器安装，仅安装桥接器）"
    $inp = Clean-Path $inp
    if ($inp -and (Test-Path -LiteralPath (Join-Path $inp "cloudmusic.exe") -PathType Leaf)) { $ncmDir = $inp }
}
if ($ncmDir) { Write-OK "网易云目录：$ncmDir" } else { Write-Warn2 "未提供网易云目录，将只安装桥接器本体" }

# ---------- 2. 自提升（网易云目录不可写时）----------
# 注意：子进程不回传 -Root —— 资产靠 $PSScriptRoot 自探测（install.ps1 与资产同目录）
function Test-Writable($dir) {
    try {
        $t = Join-Path $dir "__cb_test__"
        New-Item -ItemType File -Path $t -Force | Out-Null
        Remove-Item -LiteralPath $t -Force
        return $true
    } catch { return $false }
}
if ($ncmDir -and -not (Test-Writable $ncmDir) -and -not $Elevated) {
    Write-Warn2 "网易云目录需要管理员权限写入，正在请求提升…"
    Start-Process powershell -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" -Elevated"
    exit 0
}

# ---------- 0. 结束运行中的网易云（r3 核心：必须在装载器替换之前）----------
# 装完会自动带调试端口重启，无需用户手动关闭。
$ncmProc = Get-Process cloudmusic -ErrorAction SilentlyContinue
if ($ncmProc) {
    Write-Step "检测到网易云音乐正在运行 — 自动关闭（安装完成后将自动重启）"
    Stop-Process -Name cloudmusic -Force -ErrorAction SilentlyContinue
    for ($i = 0; $i -lt 20; $i++) {
        if (-not (Get-Process cloudmusic -ErrorAction SilentlyContinue)) { break }
        Start-Sleep -Milliseconds 500
    }
    Start-Sleep -Milliseconds 800   # 留出句柄释放时间
    if (Get-Process cloudmusic -ErrorAction SilentlyContinue) {
        Write-Warn2 "网易云进程未能完全退出，装载器替换可能失败（重试机制兜底）"
    } else {
        Write-OK "网易云音乐已关闭"
    }
}

# ---------- 3. 拷贝兜底 + 架构检查 + 装载器（msimg32.dll 代理） ----------
function Copy-Item-Retry([string]$src, [string]$dst) {
    for ($i = 0; $i -lt 5; $i++) {
        try {
            Copy-Item -LiteralPath $src -Destination $dst -Force
            return $true
        } catch {
            if ($i -eq 4) { throw }
            Write-Warn2 "文件被占用，1 秒后重试（$($i + 1)/5）…"
            Start-Sleep -Seconds 1
        }
    }
    return $false
}

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
        Write-Warn2 ("网易云不是 x64 版（machine=0x{0:X4}），跳过装载器（桥接器仍可通过本程序代启生效）" -f $machine)
    } else {
        $dstDll = Join-Path $ncmDir "msimg32.dll"
        $ourSz  = (Get-Item -LiteralPath $SrcDll).Length
        $needCopy = $true
        if (Test-Path -LiteralPath $dstDll -PathType Leaf) {
            $sz = (Get-Item -LiteralPath $dstDll).Length
            if ($sz -eq $ourSz) {
                Write-OK "装载器已是当前版本，跳过"
                $needCopy = $false
            } else {
                $bak = Join-Path $ncmDir "msimg32.dll.chushi-backup"
                try {
                    Copy-Item -LiteralPath $dstDll -Destination $bak -Force
                    Write-Warn2 "已存在 msimg32.dll（可能是 BetterNCM），已备份为 msimg32.dll.chushi-backup 后替换"
                } catch {
                    Write-Warn2 "原 msimg32.dll 备份失败，将直接覆盖"
                }
            }
        }
        if ($needCopy) {
            try {
                Copy-Item-Retry $SrcDll $dstDll | Out-Null
            } catch {
                Write-Warn2 "装载器写入失败：$($_.Exception.Message)"
                Write-Warn2 "请手动关闭网易云音乐后重新运行安装（桌面快捷方式不受影响）"
            }
        }
        $loaderDone = $true
        Write-OK "装载器就位：$dstDll"
    }
}

# ---------- 4. 桥接器本体 + 配置 ----------
Write-Step "安装桥接器本体"
New-Item -ItemType Directory -Path $Home_ -Force | Out-Null
Copy-Item-Retry $SrcExe $ExeDst | Out-Null
Write-OK "本体：$ExeDst"

# 卸载脚本复制进数据目录（卸载不依赖安装包存活）
if ($SrcUn) {
    try { Copy-Item -LiteralPath $SrcUn -Destination (Join-Path $Home_ "uninstall.ps1") -Force } catch {}
}

$cfgPath = Join-Path $Home_ "config.json"
$cfgJson = if ($ncmDir) {
    @{ cdp = 18754; ncmPath = $ncmDir } | ConvertTo-Json
} else {
    @{ cdp = 18754 } | ConvertTo-Json
}
[System.IO.File]::WriteAllText($cfgPath, $cfgJson, (New-Object System.Text.UTF8Encoding($false)))
Write-OK "配置写入 config.json"

# ---------- 5. 生成卸载入口（纯 ASCII，无路径参数——卸载上下文读 config.json） ----------
$un = Join-Path $Home_ "uninstall.bat"
$unBat = "@echo off`r`n" +
         "REM ChuShiBridge uninstaller (auto-generated, do not edit)`r`n" +
         "powershell -NoProfile -ExecutionPolicy Bypass -File `"%LOCALAPPDATA%\ChuShiBridge\uninstall.ps1`"`r`n" +
         "pause`r`n"
[System.IO.File]::WriteAllText($un, $unBat, [System.Text.Encoding]::ASCII)

# ---------- 6. 桌面快捷方式 ----------
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

# ---------- 7. 开机自启（可选） ----------
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

# ---------- 8. 启动桥接（网易云已停，直接带参拉起） ----------
Write-Step "启动桥接（自动以调试端口重启网易云音乐）"
Start-Process -FilePath $ExeDst -ArgumentList "--kill-ncm" -WorkingDirectory $Home_

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
    Write-Host "  桥接状态自查：浏览器打开 http://127.0.0.1:10754/api/debug" -ForegroundColor Gray
    Write-Host "  attach 字段为 ok 即可回到「初始」点击连接。" -ForegroundColor Gray
} else {
    Write-Host "==============================================" -ForegroundColor Yellow
    Write-Host "  桥接器已安装，但服务尚未就绪" -ForegroundColor Yellow
    Write-Host "  请查看日志：%LOCALAPPDATA%\ChuShiBridge\bridge.log" -ForegroundColor Yellow
    Write-Host "  或浏览器打开 http://127.0.0.1:10754/api/debug 查看 attach 字段" -ForegroundColor Yellow
    Write-Host "  常见原因：网易云首次启动较慢 / 安全软件拦截" -ForegroundColor Yellow
    Write-Host "==============================================" -ForegroundColor Yellow
}
Write-Host ""
Write-Host "下一步：打开「初始」（Dock 栏音乐按钮或网页版音乐面板）→ 点击连接。"
Write-Host "卸载：运行 $un"
if ($Elevated) { Write-Host ""; Read-Host "安装完成，按回车关闭窗口" }
