<#
.SYNOPSIS
  「初始」SMTC 桥 v1.0.0 —— 把 Windows 系统媒体会话（SMTC）暴露给本机 HTTP

.DESCRIPTION
  零依赖：Windows 10/11 自带 PowerShell 5.1 + WinRT，无需安装任何运行库。
  通过 WinRT GlobalSystemMediaTransportControlsSessionManager 枚举系统媒体会话
  （网易云音乐 / QQ 音乐 / Spotify / 浏览器视频等任何注册 SMTC 的播放器），
  在 http://127.0.0.1:20754 暴露：

    GET  /api/state   当前会话快照（轻量 JSON，position 为采样时刻值）
    GET  /api/cover   封面二进制（?v=<coverRev>，内存缓存）
    POST /api/control {cmd: play|pause|toggle|next|prev|seek, position?}
    GET  /api/ping    存活探针

  采样策略：请求驱动轮询 —— 每次收到请求且距上次采样 >350ms 才重读会话，
  没有请求时不做任何工作（CPU 近零）。
  会话选择：优先匹配 AppFilter 正则（默认网易云系），其次「正在播放」的会话，
  最后取第一个会话。

.NOTES
  双击同目录「启动SMTC桥.bat」即可运行；关闭窗口即停止。
  Ctrl+C 亦可退出。绑定 127.0.0.1 回环地址，不监听外网。
#>
param(
  [int]$Port = 20754,
  # 优先选中的来源应用（正则，不区分大小写；默认网易云系）
  [string]$AppFilter = 'netease|cloudmusic|163music|orpheus'
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$BRIDGE_VERSION = '1.0.0'

# ---------- WinRT 投影（PowerShell 5.1 专用；请勿在 PowerShell 7 下运行） ----------
if ($PSVersionTable.PSVersion.Major -ge 6) {
  Write-Host '[初始SMTC桥] 请使用 Windows 自带 PowerShell 5.1 运行（启动SMTC桥.bat 已自动处理）' -ForegroundColor Red
  exit 1
}
Add-Type -AssemblyName System.Runtime.WindowsRuntime | Out-Null

$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media.Control, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime]

# WinRT IAsyncOperation[T] → 同步等待（经典 AsTask 反射法）
$script:AsTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() |
  Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
    $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
  })[0]

function Await($WinRtTask, $ResultType) {
  $netTask = $script:AsTaskGeneric.MakeGenericMethod($ResultType).Invoke($null, @($WinRtTask))
  $netTask.Wait(-1) | Out-Null
  return $netTask.Result
}

# ---------- 共享状态 ----------
$script:State = @{
  HasSession = $false; App = ''; Title = ''; Artist = ''; Album = ''
  Playing = $false; Position = 0.0; Duration = 0.0; Rate = 1.0
  CoverRev = ''; UpdatedAt = [DateTime]::UtcNow
}
$script:CoverCache = @{ Rev = ''; Bytes = $null; ContentType = 'image/png' }
$script:LastPoll = [DateTime]::MinValue
$script:CurrentSession = $null

function Get-AppDisplayName([string]$Aumid) {
  if (-not $Aumid) { return '媒体应用' }
  if ($Aumid -match 'netease|cloudmusic|163music|orpheus') { return '网易云音乐' }
  if ($Aumid -match 'qqmusic')    { return 'QQ音乐' }
  if ($Aumid -match 'kugou')      { return '酷狗音乐' }
  if ($Aumid -match 'kuwo')       { return '酷我音乐' }
  if ($Aumid -match 'spotify')    { return 'Spotify' }
  if ($Aumid -match 'msedge')     { return 'Edge' }
  if ($Aumid -match 'chrome')     { return 'Chrome' }
  if ($Aumid -match 'firefox')    { return 'Firefox' }
  if ($Aumid -match 'bilibili')   { return '哔哩哔哩' }
  $first = ($Aumid -split '!')[0] -split '_' | Select-Object -First 1
  if ($first -and $first.Length -gt 24) { $first = $first.Substring(0, 24) }
  if ($first) { return $first }
  return '媒体应用'
}

function Select-Session($Sessions) {
  foreach ($s in $Sessions) {
    if ($s.SourceAppUserModelId -match $AppFilter) { return $s }
  }
  foreach ($s in $Sessions) {
    if ($s.GetPlaybackInfo().PlaybackStatus -eq [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionPlaybackStatus]::Playing) { return $s }
  }
  if ($Sessions.Count -gt 0) { return $Sessions[0] }
  return $null
}

function Read-CoverBytes($Properties, [string]$Rev) {
  if ($script:CoverCache.Rev -eq $Rev -and $script:CoverCache.Bytes) { return $script:CoverCache }
  try {
    $stream = Await ($Properties.Thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
    if (-not $stream -or $stream.Size -le 0 -or $stream.Size -gt 8MB) { return $null }
    $reader = [Windows.Storage.Streams.DataReader]::new($stream.GetInputStreamAt(0))
    try {
      $null = Await ($reader.LoadAsync($stream.Size)) ([System.UInt32])
      $bytes = New-Object byte[] $stream.Size
      $reader.ReadBytes($bytes)
      $script:CoverCache.Rev = $Rev
      $script:CoverCache.Bytes = $bytes
      $ct = $stream.ContentType
      if (-not $ct -or $ct -notmatch '^image/') { $ct = 'image/jpeg' }
      $script:CoverCache.ContentType = $ct
      return $script:CoverCache
    } finally {
      $reader.DetachStream() | Out-Null
      $reader.Dispose()
    }
  } catch {
    return $null
  }
}

function Update-MediaState {
  $script:LastPoll = Get-Date
  $manager = $script:Manager
  $sessions = $null
  try { $sessions = $manager.GetSessions() } catch { $sessions = $null }

  if (-not $sessions -or $sessions.Count -eq 0) {
    $script:CurrentSession = $null
    $script:State.HasSession = $false
    $script:State.App = ''; $script:State.Title = ''; $script:State.Artist = ''; $script:State.Album = ''
    $script:State.Playing = $false; $script:State.Position = 0.0; $script:State.Duration = 0.0; $script:State.Rate = 1.0
    $script:State.CoverRev = ''
    return
  }

  $sess = Select-Session $sessions
  $script:CurrentSession = $sess
  try {
    $props = Await ($sess.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
    $tl = $sess.GetTimelineProperties()
    $pb = $sess.GetPlaybackInfo()

    $title = ''
    $artist = ''
    try { $title = [string]$props.Title; $artist = [string]$props.Artist } catch {}
    $rev = [string]([Math]::Abs(("$title|$artist|$( [string]$props.AlbumName )").GetHashCode()))

    $script:State.HasSession = $true
    $script:State.App = Get-AppDisplayName $sess.SourceAppUserModelId
    $script:State.Title = $title
    $script:State.Artist = $artist
    $script:State.Album = [string]$props.AlbumName
    $script:State.Playing = ($pb.PlaybackStatus -eq [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionPlaybackStatus]::Playing)
    $script:State.Position = [math]::Max(0.0, $tl.Position.TotalSeconds)
    $script:State.Duration = [math]::Max(0.0, $tl.EndTime.TotalSeconds)
    if ($tl.PlaybackRate -gt 0) { $script:State.Rate = [double]$tl.PlaybackRate } else { $script:State.Rate = 1.0 }
    $script:State.CoverRev = $rev
    $script:State.UpdatedAt = [DateTime]::UtcNow

    if ($rev -ne '') {
      $null = Read-CoverBytes $props $rev
    }
  } catch {
    # 会话可能刚被关闭（音乐退出）：视作无会话，下轮请求再重新选择
    $script:CurrentSession = $null
    $script:State.HasSession = $false
    $script:State.Playing = $false
    $script:State.CoverRev = ''
  }
}

function Ensure-Fresh {
  if (((Get-Date) - $script:LastPoll).TotalMilliseconds -lt 350) { return }
  try { Update-MediaState } catch { $script:LastPoll = Get-Date }
}

# ---------- 控制 ----------
function Invoke-Control([string]$Cmd, $PositionSec) {
  $sess = $script:CurrentSession
  if (-not $sess) { Ensure-Fresh; $sess = $script:CurrentSession }
  if (-not $sess) { return @{ ok = $false; reason = 'no-session' } }
  try {
    $pb = $sess.GetPlaybackInfo()
    switch ($Cmd) {
      'play'  { if ($pb.PlaybackStatus -ne 'Playing') { $null = Await ($sess.TryPlayAsync()) ([System.Boolean]) }; return @{ ok = $true } }
      'pause' { if ($pb.PlaybackStatus -eq 'Playing') { $null = Await ($sess.TryPauseAsync()) ([System.Boolean]) }; return @{ ok = $true } }
      'toggle' {
        if ($pb.PlaybackStatus -eq 'Playing') { $null = Await ($sess.TryPauseAsync()) ([System.Boolean]) }
        else { $null = Await ($sess.TryPlayAsync()) ([System.Boolean]) }
        return @{ ok = $true }
      }
      'next'  { $null = Await ($sess.TrySkipNextAsync()) ([System.Boolean]); return @{ ok = $true } }
      'prev'  { $null = Await ($sess.TrySkipPreviousAsync()) ([System.Boolean]); return @{ ok = $true } }
      'seek'  {
        if (-not $pb.IsSeekAvailable) { return @{ ok = $false; reason = 'seek-unavailable' } }
        $sec = [double]$PositionSec
        if ($sec -lt 0) { $sec = 0 }
        $ticks = [long]([math]::Round($sec * 10000000))
        $null = Await ($sess.TryChangePlaybackPositionAsync($ticks)) ([System.Boolean])
        return @{ ok = $true }
      }
      default { return @{ ok = $false; reason = 'unknown-cmd' } }
    }
  } catch {
    return @{ ok = $false; reason = 'error' }
  }
}

# ---------- 初始化会话管理器 ----------
try {
  $script:Manager = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
} catch {
  Write-Host '[初始SMTC桥] 初始化系统媒体会话管理器失败（SMTC 仅在 Windows 10 1809+ 可用）。' -ForegroundColor Red
  Write-Host $_.Exception.Message -ForegroundColor Red
  exit 1
}

# ---------- HTTP ----------
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://127.0.0.1:$Port/") | Out-Null
try {
  $listener.Start()
} catch {
  Write-Host "[初始SMTC桥] 端口 $Port 绑定失败（可能已有一个 SMTC 桥在运行，或被其他程序占用）。" -ForegroundColor Yellow
  Write-Host '            关掉已有实例后重试；如仍失败请修改启动SMTC桥.bat 里的 -Port 参数。' -ForegroundColor Yellow
  exit 1
}

Write-Host ''
Write-Host '  ================================ 初始 SMTC 桥 ================================' -ForegroundColor Cyan
Write-Host "   版本     v$BRIDGE_VERSION"
Write-Host "   监听     http://127.0.0.1:$Port  （仅本机回环）"
Write-Host '   接口     /api/state  /api/cover  /api/control  /api/ping'
Write-Host "   优先来源 正则 $AppFilter"
Write-Host '   提示     保持本窗口开着即可；关闭窗口 = 停止桥。' -ForegroundColor DarkCyan
Write-Host '           建议运行「添加开机自启.bat」，之后无需手动打开。' -ForegroundColor DarkCyan
Write-Host '  =============================================================================='
Write-Host ''

function Send-Json($Res, $Obj, [int]$Code = 200) {
  $json = $Obj | ConvertTo-Json -Compress -Depth 3
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
  $Res.StatusCode = $Code
  $Res.ContentType = 'application/json; charset=utf-8'
  $Res.Headers['Access-Control-Allow-Origin'] = '*'
  $Res.Headers['Access-Control-Allow-Private-Network'] = 'true'
  $Res.Headers['Cache-Control'] = 'no-store'
  $Res.ContentLength64 = $bytes.Length
  $Res.OutputStream.Write($bytes, 0, $bytes.Length)
  $Res.OutputStream.Close()
}

while ($true) {
  $ctx = $null
  try { $ctx = $listener.GetContext() } catch { break }
  $req = $ctx.Request
  $res = $ctx.Response
  try {
    # CORS 预检
    if ($req.HttpMethod -eq 'OPTIONS') {
      $res.StatusCode = 204
      $res.Headers['Access-Control-Allow-Origin'] = '*'
      $res.Headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
      $res.Headers['Access-Control-Allow-Headers'] = 'Content-Type'
      $res.Headers['Access-Control-Allow-Private-Network'] = 'true'
      $res.Headers['Access-Control-Max-Age'] = '86400'
      $res.OutputStream.Close()
      continue
    }

    $path = $req.Url.AbsolutePath

    if ($path -eq '/api/ping') {
      Send-Json $res @{ ok = $true; name = 'chushi-smtc-bridge'; version = $BRIDGE_VERSION }
      continue
    }

    if ($path -eq '/api/state') {
      Ensure-Fresh
      $s = $script:State
      if ($s.HasSession) {
        Send-Json $res @{
          ok = $true; name = 'chushi-smtc-bridge'; version = $BRIDGE_VERSION
          track = @{
            app = $s.App; title = $s.Title; artist = $s.Artist; album = $s.Album
            playing = [bool]$s.Playing
            position = [math]::Round([double]$s.Position, 3)
            duration = [math]::Round([double]$s.Duration, 3)
            rate = $s.Rate
            coverRev = $s.CoverRev
          }
        }
      } else {
        Send-Json $res @{ ok = $true; name = 'chushi-smtc-bridge'; version = $BRIDGE_VERSION; track = $null }
      }
      continue
    }

    if ($path -eq '/api/cover') {
      Ensure-Fresh
      $cover = $script:CoverCache
      if ($cover.Bytes) {
        $res.StatusCode = 200
        $res.ContentType = [string]$cover.ContentType
        $res.Headers['Access-Control-Allow-Origin'] = '*'
        $res.Headers['Access-Control-Allow-Private-Network'] = 'true'
        $res.Headers['Cache-Control'] = 'no-store'
        $res.ContentLength64 = $cover.Bytes.Length
        $res.OutputStream.Write($cover.Bytes, 0, $cover.Bytes.Length)
        $res.OutputStream.Close()
      } else {
        $res.StatusCode = 404
        $res.Headers['Access-Control-Allow-Origin'] = '*'
        $res.OutputStream.Close()
      }
      continue
    }

    if ($path -eq '/api/control' -and $req.HttpMethod -eq 'POST') {
      $body = ''
      try {
        $reader = New-Object System.IO.StreamReader($req.InputStream, [System.Text.Encoding]::UTF8)
        $body = $reader.ReadToEnd()
      } catch { $body = '' }
      $cmd = ''
      $pos = $null
      try {
        $j = $body | ConvertFrom-Json
        if ($j.cmd) { $cmd = [string]$j.cmd }
        if ($null -ne $j.position) { $pos = [double]$j.position }
      } catch {}
      if (-not $cmd) {
        Send-Json $res @{ ok = $false; reason = 'missing-cmd' } 400
        continue
      }
      Ensure-Fresh
      $r = Invoke-Control $cmd $pos
      Send-Json $res $r
      continue
    }

    $res.StatusCode = 404
    $res.Headers['Access-Control-Allow-Origin'] = '*'
    $res.OutputStream.Close()
  } catch {
    try { $res.StatusCode = 500; $res.OutputStream.Close() } catch {}
  }
}
