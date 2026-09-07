# ============================================================================
# chushi-smtc-engine.ps1 -- ChuShi full-power SMTC engine (v4.0.0)
#
# REWRITTEN FROM SCRATCH (v4 generation). Design contract from the user:
#   * Owns ONE full-power Windows SMTC session (media keys, overlay card,
#     draggable progress bar, lock screen) driven entirely by this engine.
#   * NEVER reads any external SMTC session (the reader-side WinRT manager
#     class is banned from this file entirely). NetEase Music's built-in
#     SMTC switch is NOT required (ON or OFF, both fine).
#   * The single data source is the Music API plugin running inside NetEase
#     (plugin "cc.chushi.ncmapi"), which pushes playback truth over HTTP.
#   * All control commands (from Windows media keys / overlay drag / the
#     ChuShi new tab page) are queued here and executed by the plugin inside
#     NetEase (element-level play/pause/seek/skip). The engine never tries to
#     control NetEase's own ( crippled ) SMTC session.
#
# Loopback HTTP hub on 127.0.0.1:<Port> (default 26801):
#   GET  /api/ping                 -> identity + version
#   GET  /api/state                -> merged snapshot for the host page
#   POST /api/ne                   <- plugin 1 Hz playback truth push
#   POST /api/lyric                <- plugin full-lyrics push (song change)
#   GET  /api/lyric?songId=<id>    -> lyrics payload for the host page
#   POST /api/cmd                  <- host control (play/pause/toggle/next/prev/seek)
#   GET  /api/cmd                  -> plugin pops the outbound command queue
#   POST /api/mgr                  <- SMTC Manager plugin heartbeat
#
# Windows-side technique (documented facts, official manual-control mode):
#   Windows.Media.Playback.MediaPlayer + CommandManager.IsEnabled = $false
#   + silent in-memory WAV source (InMemoryRandomAccessStream, never touches
#   %TEMP%) + IsPlay/Pause/Next/Previous/PlaybackPositionEnabled = $true
#   + MinSeekTime/MaxSeekTime MUST be set or the overlay never raises
#   PositionChangeRequest + events captured with Register-ObjectEvent and a
#   synchronized ArrayList (scriptblock-cast WinRT delegates crash: the
#   callback thread has no runspace).
#
# This file is ASCII-only by contract (the host asserts it in CI).
# ============================================================================

param([int]$Port = 26801)

$ErrorActionPreference = "Stop"
$EngineVersion = "4.0.0"
$NeStaleMs = 6000        # plugin truth older than this -> close the card
$CmdExpireMs = 5000      # queued command older than this -> drop
$CmdCap = 8              # outbound queue capacity (drop oldest)

Write-Host "[ChuShiSmtcEngine] starting v$EngineVersion on port $Port"

# ---------------------------------------------------------------------------
# 1) WinRT projections + WinRT->NET async bridge (AsTask via reflection)
# ---------------------------------------------------------------------------
Add-Type -AssemblyName System.Runtime.WindowsRuntime | Out-Null

$null = [Windows.Media.Playback.MediaPlayer, Windows.Media.Playback, ContentType = WindowsRuntime]
$null = [Windows.Media.Core.MediaSource, Windows.Media.Core, ContentType = WindowsRuntime]
$null = [Windows.Media.Core.MediaPlaybackItem, Windows.Media.Core, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.InMemoryRandomAccessStream, Windows.Storage.Streams, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.DataWriter, Windows.Storage.Streams, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.RandomAccessStreamReference, Windows.Storage.Streams, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime]
$null = [Windows.Media.MediaPlaybackStatus, Windows.Media, ContentType = WindowsRuntime]
$null = [Windows.Media.MediaPlaybackType, Windows.Media, ContentType = WindowsRuntime]
$null = [Windows.Media.SystemMediaTransportControlsButton, Windows.Media, ContentType = WindowsRuntime]
$null = [Windows.Media.SystemMediaTransportControlsTimelineProperties, Windows.Media, ContentType = WindowsRuntime]
$null = [Windows.Media.AudioPlaybackType, Windows.Media, ContentType = WindowsRuntime]

$script:AsTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() |
  Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
    $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
  })[0]

function Await([object]$WinRtTask, [Type]$ResultType) {
  $netTask = $script:AsTaskGeneric.MakeGenericMethod($ResultType).Invoke($null, @($WinRtTask))
  $netTask.Wait(-1) | Out-Null
  return $netTask.Result
}

# ---------------------------------------------------------------------------
# 2) Explicit AUMID so the session is identifiable (and stable across restarts)
# ---------------------------------------------------------------------------
if (-not ("ChuShi.EngineNative" -as [type])) {
  Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
namespace ChuShi.EngineNative {
  public static class AppId {
    [DllImport("shell32.dll", SetLastError = true)]
    public static extern int SetCurrentProcessExplicitAppUserModelID(
      [MarshalAs(UnmanagedType.LPWStr)] string AppID);
  }
}
"@
}
$null = [ChuShi.EngineNative.AppId]::SetCurrentProcessExplicitAppUserModelID("ChuShi.SmtcEngine")

# ---------------------------------------------------------------------------
# 3) Shared state (HTTP runspace <-> main WinRT thread), all synchronized
# ---------------------------------------------------------------------------
$sync = [hashtable]::Synchronized(@{})
$sync.Ne = $null                                   # last plugin truth (hashtable) or $null
$sync.Out = [System.Collections.ArrayList]::Synchronized((New-Object System.Collections.ArrayList))
$sync.Lyrics = [hashtable]::Synchronized(@{})      # songId -> lyrics payload (cap 4)
$sync.Mgr = ""                                     # manager plugin version (90 s window)
$sync.MgrAt = 0
$sync.CmdSeq = 0
$sync.Stop = $false

function New-Cmd([string]$type, [object]$position) {
  $sync.CmdSeq = [int]$sync.CmdSeq + 1
  $c = @{ id = $sync.CmdSeq; cmd = $type; at = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() }
  if ($null -ne $position) { $c.position = [double]$position }
  return $c
}

function Push-Cmd([string]$type, [object]$position) {
  try { $sync.Out.Add((New-Cmd $type $position)) | Out-Null } catch { }
  try {
    while ($sync.Out.Count -gt $CmdCap) { $sync.Out.RemoveAt(0) }
  } catch { }
}

# ---------------------------------------------------------------------------
# 4) Own full-power SMTC session (MediaPlayer, manual control mode)
# ---------------------------------------------------------------------------
function New-SilentWavStream {
  # 1 s of silence, 8000 Hz / 16 bit / mono, built fully in memory.
  $sampleRate = 8000; $seconds = 1
  $dataBytes = $sampleRate * 2 * $seconds
  $ms = New-Object Windows.Storage.Streams.InMemoryRandomAccessStream
  $dw = New-Object Windows.Storage.Streams.DataWriter($ms.GetOutputStreamAt(0))
  $dw.ByteOrder = [Windows.Storage.Streams.ByteOrder]::LittleEndian
  foreach ($ch in [System.Text.Encoding]::ASCII.GetBytes("RIFF")) { $dw.WriteByte($ch) }
  $dw.WriteUInt32([uint32]($dataBytes + 36))
  foreach ($ch in [System.Text.Encoding]::ASCII.GetBytes("WAVE")) { $dw.WriteByte($ch) }
  foreach ($ch in [System.Text.Encoding]::ASCII.GetBytes("fmt ")) { $dw.WriteByte($ch) }
  $dw.WriteUInt32([uint32]16)
  $dw.WriteUInt16([uint16]1)              # PCM
  $dw.WriteUInt16([uint16]1)              # mono
  $dw.WriteUInt32([uint32]$sampleRate)
  $dw.WriteUInt32([uint32]($sampleRate * 2))
  $dw.WriteUInt16([uint16]2)              # block align
  $dw.WriteUInt16([uint16]16)             # bits
  foreach ($ch in [System.Text.Encoding]::ASCII.GetBytes("data")) { $dw.WriteByte($ch) }
  $dw.WriteUInt32([uint32]$dataBytes)
  $left = $dataBytes
  while ($left -gt 0) {
    $n = [Math]::Min(4096, $left)
    $chunk = New-Object byte[] $n
    $dw.WriteBytes($chunk)
    $left -= $n
  }
  $null = $dw.StoreAsync()
  try { $null = Await ($dw.FlushAsync()) ([Boolean]) } catch { }
  $dw.DetachStream() | Out-Null
  $ms.Seek(0) | Out-Null
  return $ms
}

function Initialize-OwnSmtc {
  $mp = New-Object Windows.Media.Playback.MediaPlayer
  $mp.AudioCategory = [Windows.Media.AudioPlaybackType]::Media
  $mp.Volume = 0.0
  $mp.IsMuted = $true

  $wav = New-SilentWavStream
  $src = New-Object Windows.Media.Core.MediaPlaybackItem(
    (New-Object Windows.Media.Core.MediaSource($wav)))
  $mp.Source = $src

  $ctl = $mp.SystemMediaTransportControls
  $ctl.CommandManager.IsEnabled = $false          # manual control mode (official)
  $ctl.IsPlayEnabled = $true
  $ctl.IsPauseEnabled = $true
  $ctl.IsNextEnabled = $true
  $ctl.IsPreviousEnabled = $true
  $ctl.IsPlaybackPositionEnabled = $true          # overlay progress becomes draggable

  # Events: Register-ObjectEvent with a synchronized queue in MessageData.
  # (Never cast a PS scriptblock to a WinRT delegate: the callback thread has
  # no runspace and the process dies.)
  $null = Register-ObjectEvent -InputObject $ctl -EventName ButtonPressed -MessageData $sync -Action {
    try {
      $nowMs = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
      $b = $Event.SourceEventArgs.Button
      $type = ""
      if ($b -eq [Windows.Media.SystemMediaTransportControlsButton]::Play)        { $type = "play" }
      elseif ($b -eq [Windows.Media.SystemMediaTransportControlsButton]::Pause)   { $type = "pause" }
      elseif ($b -eq [Windows.Media.SystemMediaTransportControlsButton]::Next)    { $type = "next" }
      elseif ($b -eq [Windows.Media.SystemMediaTransportControlsButton]::Previous){ $type = "prev" }
      if ($type) { $Event.MessageData.Out.Add(@{ id = 0; cmd = $type; at = $nowMs }) | Out-Null }
    } catch { }
  }
  $null = Register-ObjectEvent -InputObject $ctl -EventName PlaybackPositionChangeRequested -MessageData $sync -Action {
    try {
      $ts = $Event.SourceEventArgs.RequestedPlaybackPosition
      $sec = [Math]::Max(0.0, $ts.TotalSeconds)
      $nowMs = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
      $Event.MessageData.Out.Add(@{ id = 0; cmd = "seek"; position = $sec; at = $nowMs }) | Out-Null
    } catch { }
  }

  $mp.Play()   # registering the session: the card exists from now on

  $script:SmtcPlayer = $mp
  $script:SmtcCtl = $ctl
  $script:SmtcMeta = ""       # signature of metadata currently on the card
  $script:SmtcOpen = $false   # card currently has a track (not Closed)
  Write-Host "[ChuShiSmtcEngine] own full-power SMTC session initialized (AUMID ChuShi.SmtcEngine)"
}

function Set-SmtcClosed {
  if (-not $script:SmtcOpen) { return }
  try { $script:SmtcCtl.PlaybackStatus = [Windows.Media.MediaPlaybackStatus]::Closed } catch { }
  $script:SmtcOpen = $false
  $script:SmtcMeta = ""
}

function Update-SmtcFromNe {
  $ne = $sync.Ne
  $nowMs = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  if ($null -eq $ne) { Set-SmtcClosed; return }
  $age = $nowMs - [long]$ne.ts
  if ($age -gt $NeStaleMs) { Set-SmtcClosed; return }

  $playing = ($ne.playing -eq $true)
  $posSec = [double]$ne.position
  if ($playing) { $posSec += ($age / 1000.0) }
  $durSec = [double]$ne.duration
  if ($durSec -gt 0) {
    if ($posSec -lt 0) { $posSec = 0 }
    if ($posSec -gt $durSec) { $posSec = $durSec }
  } elseif ($posSec -lt 0) { $posSec = 0 }

  # Metadata: only rewrite when content actually changed (cheap stability).
  $pic = [string]$ne.pic
  $metaSig = "$( $ne.title )|$( $ne.artist )|$( $ne.album )|$pic"
  if ($metaSig -ne $script:SmtcMeta) {
    try {
      $du = $script:SmtcCtl.DisplayUpdater
      $du.Type = [Windows.Media.MediaPlaybackType]::Music
      $du.MusicProperties.Title = [string]$ne.title
      $du.MusicProperties.Artist = [string]$ne.artist
      $du.MusicProperties.AlbumTitle = [string]$ne.album
      if ($pic -and $pic.ToLower().StartsWith("https://")) {
        try { $du.Thumbnail = [Windows.Storage.Streams.RandomAccessStreamReference]::CreateFromUri([Uri]$pic) } catch { }
      }
      $du.Update()
    } catch { }
    $script:SmtcMeta = $metaSig
  }

  try {
    $status = [Windows.Media.MediaPlaybackStatus]::Paused
    if ($playing) { $status = [Windows.Media.MediaPlaybackStatus]::Playing }
    $script:SmtcCtl.PlaybackStatus = $status
  } catch { }

  try {
    $tl = New-Object Windows.Media.SystemMediaTransportControlsTimelineProperties
    $tl.StartTime = [TimeSpan]::FromSeconds($posSec)
    $tl.EndTime = [TimeSpan]::FromSeconds([Math]::Max(0.0, $durSec))
    $tl.MinSeekTime = [TimeSpan]::FromSeconds(0)
    $tl.MaxSeekTime = [TimeSpan]::FromSeconds([Math]::Max(0.0, $durSec))
    $tl.Position = [TimeSpan]::FromSeconds($posSec)
    $script:SmtcCtl.UpdateTimelineProperties($tl)
  } catch { }

  $script:SmtcOpen = $true
}

# ---------------------------------------------------------------------------
# 5) HTTP hub (own runspace; only touches $sync, never WinRT objects)
# ---------------------------------------------------------------------------
$httpScript = {
  param($sync, $port, $engineVersion, $neStaleMs, $cmdExpireMs)

  function Write-Json($rsp, [object]$obj, [int]$code = 200) {
    try {
      $body = [System.Text.Encoding]::UTF8.GetBytes(($obj | ConvertTo-Json -Depth 8 -Compress))
      $rsp.StatusCode = $code
      $rsp.ContentType = "application/json"
      $rsp.ContentLength64 = $body.Length
      $rsp.Headers["Access-Control-Allow-Origin"] = "*"
      $rsp.Headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
      $rsp.Headers["Access-Control-Allow-Headers"] = "Content-Type"
      $rsp.OutputStream.Write($body, 0, $body.Length)
    } catch { }
    try { $rsp.OutputStream.Close() } catch { }
  }

  $listener = $null
  try {
    $listener = New-Object System.Net.HttpListener
    $listener.Prefixes.Add("http://127.0.0.1:$port/")
    $listener.Start()
  } catch {
    Write-Host "[ChuShiSmtcEngine] FATAL: cannot bind 127.0.0.1:$port ($($_.Exception.Message))"
    $sync.Stop = $true
    return
  }
  Write-Host "[ChuShiSmtcEngine] listening http://127.0.0.1:$port (loopback only)"

  while (-not $sync.Stop) {
    try {
      $ctx = $listener.GetContext()
      $req = $ctx.Request
      $rsp = $ctx.Response
      $path = $req.Url.AbsolutePath
      $method = $req.HttpMethod

      if ($method -eq "OPTIONS") {
        $rsp.StatusCode = 204
        $rsp.Headers["Access-Control-Allow-Origin"] = "*"
        $rsp.Headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
        $rsp.Headers["Access-Control-Allow-Headers"] = "Content-Type"
        try { $rsp.OutputStream.Close() } catch { }
        continue
      }

      if ($path -eq "/api/ping" -and $method -eq "GET") {
        Write-Json $rsp @{ ok = $true; name = "chushi-smtc-engine"; ver = $engineVersion }
        continue
      }

      if ($path -eq "/api/state" -and $method -eq "GET") {
        $nowMs = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
        $ne = $sync.Ne
        $neOut = $null
        if ($null -ne $ne -and ($nowMs - [long]$ne.ts) -le $neStaleMs) { $neOut = $ne }
        $mgr = [string]$sync.Mgr
        if ($mgr -and ($nowMs - [long]$sync.MgrAt) -gt 90000) { $mgr = "" }
        $status = "closed"
        if ($null -ne $ne) { if ($ne.playing -eq $true) { $status = "playing" } else { $status = "paused" } }
        Write-Json $rsp @{
          ok = $true; name = "chushi-smtc-engine"; ver = $engineVersion
          mgr = $mgr; ne = $neOut; cmds = $sync.Out.Count
          smtc = @{ own = $true; status = $status }
        }
        continue
      }

      if ($path -eq "/api/ne" -and $method -eq "POST") {
        try {
          $body = (New-Object System.IO.StreamReader($req.InputStream, [System.Text.Encoding]::UTF8)).ReadToEnd()
          $j = $body | ConvertFrom-Json
          $ne = @{
            v = [string]$j.v; ts = [long]$j.ts
            songId = [long]$j.songId
            title = [string]$j.title; artist = [string]$j.artist; album = [string]$j.album
            pic = [string]$j.pic
            position = [double]$j.position; duration = [double]$j.duration
            playing = [bool]$j.playing
            seekAckId = [string]$j.seekAckId; seekAckOk = [bool]$j.seekAckOk; seekAckAt = [long]$j.seekAckAt
          }
          $sync.Ne = $ne
          Write-Json $rsp @{ ok = $true }
        } catch { Write-Json $rsp @{ ok = $false; err = "bad-ne" } 400 }
        continue
      }

      if ($path -eq "/api/lyric" -and $method -eq "POST") {
        try {
          $body = (New-Object System.IO.StreamReader($req.InputStream, [System.Text.Encoding]::UTF8)).ReadToEnd()
          $j = $body | ConvertFrom-Json
          $sid = [string]$j.songId
          if ($sid) {
            $sync.Lyrics[$sid] = @{
              songId = [long]$j.songId; title = [string]$j.title; artist = [string]$j.artist
              rev = [string]$j.rev
              yrc = [string]$j.yrc; ytlrc = [string]$j.ytlrc
              lrc = [string]$j.lrc; tlyric = [string]$j.tlyric
              source = [string]$j.source
            }
            while ($sync.Lyrics.Count -gt 4) {
              $oldest = $sync.Lyrics.Keys | Select-Object -First 1
              $sync.Lyrics.Remove($oldest)
            }
          }
          Write-Json $rsp @{ ok = $true }
        } catch { Write-Json $rsp @{ ok = $false; err = "bad-lyric" } 400 }
        continue
      }

      if ($path -eq "/api/lyric" -and $method -eq "GET") {
        $sid = $req.QueryString["songId"]
        if ($sid -and $sync.Lyrics.ContainsKey($sid)) {
          $ly = $sync.Lyrics[$sid]
          Write-Json $rsp @{ ok = $true; rev = $ly.rev; lyric = $ly }
        } else {
          Write-Json $rsp @{ ok = $false }
        }
        continue
      }

      if ($path -eq "/api/cmd" -and $method -eq "POST") {
        try {
          $body = (New-Object System.IO.StreamReader($req.InputStream, [System.Text.Encoding]::UTF8)).ReadToEnd()
          $j = $body | ConvertFrom-Json
          $type = [string]$j.cmd
          if ($type -in @("play", "pause", "toggle", "next", "prev", "seek")) {
            $pos = $null
            if ($type -eq "seek" -and $null -ne $j.position) { $pos = [double]$j.position }
            $sync.Out.Add(@{ id = 0; cmd = $type; position = $pos; at = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() }) | Out-Null
            while ($sync.Out.Count -gt 8) { $sync.Out.RemoveAt(0) }
            Write-Json $rsp @{ ok = $true }
          } else {
            Write-Json $rsp @{ ok = $false; err = "unknown-cmd" } 400
          }
        } catch { Write-Json $rsp @{ ok = $false; err = "bad-cmd" } 400 }
        continue
      }

      if ($path -eq "/api/cmd" -and $method -eq "GET") {
        $nowMs = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
        $out = @()
        while ($sync.Out.Count -gt 0) {
          $c = $sync.Out[0]
          $sync.Out.RemoveAt(0)
          if ($c.at -gt 0 -and ($nowMs - [long]$c.at) -gt $cmdExpireMs) { continue }
          $out += $c
          if ($out.Count -ge 8) { break }
        }
        Write-Json $rsp @{ ok = $true; cmds = $out }
        continue
      }

      if ($path -eq "/api/mgr" -and $method -eq "POST") {
        try {
          $body = (New-Object System.IO.StreamReader($req.InputStream, [System.Text.Encoding]::UTF8)).ReadToEnd()
          $j = $body | ConvertFrom-Json
          $sync.Mgr = [string]$j.v
          $sync.MgrAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
          Write-Json $rsp @{ ok = $true }
        } catch { Write-Json $rsp @{ ok = $false } 400 }
        continue
      }

      Write-Json $rsp @{ ok = $false; err = "not-found" } 404
    } catch {
      try { Start-Sleep -Milliseconds 50 } catch { }
    }
  }
  try { $listener.Stop() } catch { }
}

# ---------------------------------------------------------------------------
# 6) Boot + main loop (WinRT stays on this thread)
# ---------------------------------------------------------------------------
try { Initialize-OwnSmtc } catch {
  Write-Host "[ChuShiSmtcEngine] FATAL: SMTC init failed: $($_.Exception.Message)"
  exit 1
}

$rs = [runspacefactory]::CreateRunspace()
$rs.Open()
$ps = [powershell]::Create()
$ps.Runspace = $rs
$null = $ps.AddScript($httpScript).AddArgument($sync).AddArgument($Port).AddArgument($EngineVersion).AddArgument($NeStaleMs).AddArgument($CmdExpireMs)
$null = $ps.BeginInvoke()

$lastTick = 0
while (-not $sync.Stop) {
  try {
    $nowMs = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    if (($nowMs - $lastTick) -ge 900) {
      $lastTick = $nowMs
      Update-SmtcFromNe
    }
  } catch { }
  try { Start-Sleep -Milliseconds 120 } catch { }
}

try { $ps.Stop() } catch { }
try { $rs.Close() } catch { }
Write-Host "[ChuShiSmtcEngine] stopped"
