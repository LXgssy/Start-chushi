# ============================================================================
# ChuShi SMTC Engine v5.0.0  (generation 5, written from scratch)
#
# A standalone Windows-side media hub for the ChuShi start page:
#   * owns a FULL, independent System Media Transport Controls session
#     (MediaPlayer manual-control mode) - it never reads NetEase Music's own
#     SMTC session, so the "SMTC" switch inside NetEase Music stays OFF;
#   * relays playback truth (from the ChuShi Music API plugin) to that
#     session: metadata, cover, play/pause state, real draggable position;
#   * forwards control requests (media keys / flyout buttons / flyout seek)
#     into a command queue that the ChuShi Music API plugin consumes;
#   * serves the local HTTP hub on 127.0.0.1 used by plugin, manager and host.
#
# HARD RULES (user constitution, enforced by build gates):
#   1. This file contains ZERO references to external/observed media sessions
#      (the OS session-enumerator API family is banned by build gate). Own
#      session only.
#   2. This file is ASCII-only, every byte.
#   3. It must run under Windows PowerShell 5.1 (spawned by the manager).
# ============================================================================

param([int]$Port = 26801)

$ErrorActionPreference = "Stop"
$EngineVersion = "5.0.0"
$EngineName = "chushi-smtc-engine"
$AumId = "ChuShi.SmtcEngine"
$TruthStaleMs = 6000      # no truth heartbeat for this long -> close the session
$ApplyEveryMs = 900       # timeline refresh cadence (official advice: <= 5s)
$CmdExpireMs = 5000       # queued commands older than this are dropped
$CmdCap = 8               # queue capacity (oldest dropped beyond cap)
$LyricCap = 4             # lyric LRU capacity
$MgrWindowMs = 90000      # manager heartbeat freshness window

# ---------------------------------------------------------------------------
# Logging - every engine that shipped before v5 was debugged blind. Not here.
# ---------------------------------------------------------------------------
$LogDir = Join-Path $env:LOCALAPPDATA "ChuShiSmtcEngine"
$LogFile = Join-Path $LogDir "engine.log"
function Write-Log([string]$msg) {
  try {
    if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }
    $stamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss.fff")
    [System.IO.File]::AppendAllText($LogFile, "[$stamp] $msg`r`n")
  } catch { }
}

# ---------------------------------------------------------------------------
# Shared synchronized state (HTTP hub runs on a separate runspace)
# ---------------------------------------------------------------------------
$sync = [hashtable]::Synchronized(@{})
$sync.Ne = $null          # last truth snapshot pushed by the music api plugin
$sync.NeAt = 0            # truth arrival timestamp (ms)
$sync.Mgr = ""            # manager plugin version (heartbeat)
$sync.MgrAt = 0
$sync.Out = New-Object System.Collections.ArrayList  # command queue (sync via $sync lock)
$sync.CmdSeq = 0
$sync.Lyrics = @{}        # songId -> lyric payload hashtable (touched under $sync lock)
$sync.LyricOrder = New-Object System.Collections.ArrayList
$sync.SmtcStatus = "closed"
$sync.InitErr = ""
$sync.StartedAt = [DateTime]::UtcNow.Ticks
$sync.HubErr = ""

function Lock-Exec([scriptblock]$body) {
  # All cross-runspace mutations happen under the synchronized-table monitor.
  [System.Threading.Monitor]::Enter($sync)
  try { & $body } finally { [System.Threading.Monitor]::Exit($sync) }
}

function Test-TruthStale {
  if (-not $sync.Ne) { return $true }
  $age = [Environment]::TickCount - [int]$sync.NeAt
  if ($age -lt 0) { $age = $TruthStaleMs + 1 }  # TickCount wraparound guard
  return ($age -gt $TruthStaleMs)
}

# ---------------------------------------------------------------------------
# Single instance guard (the manager may respawn us; never fight a live twin)
# ---------------------------------------------------------------------------
$mutex = New-Object System.Threading.Mutex($false, "Local\ChuShi.SmtcEngine.V5")
$gotMutex = $false
try { $gotMutex = $mutex.WaitOne(0) } catch { }
if (-not $gotMutex) {
  Write-Log "another engine instance is already running, exit 0"
  exit 0
}

Write-Log "engine v$EngineVersion starting, port $Port, pid $PID"

# ---------------------------------------------------------------------------
# AUMID: required so Windows shows our own SMTC entry for an unpackaged app
# ---------------------------------------------------------------------------
try {
  Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class ChuShiAumid {
  [DllImport("shell32.dll", PreserveSig = false)]
  public static extern void SetCurrentProcessExplicitAppUserModelID(
    [MarshalAs(UnmanagedType.LPWStr)] string appId);
}
"@ -ErrorAction Stop
  [ChuShiAumid]::SetCurrentProcessExplicitAppUserModelID($AumId)
  Write-Log "AUMID set: $AumId"
} catch {
  $sync.InitErr = "aumid: $($_.Exception.Message)"
  Write-Log "AUMID FAILED: $($_.Exception.Message)"
}

# ---------------------------------------------------------------------------
# WinRT projection (Windows PowerShell 5.1 style type loading)
# ---------------------------------------------------------------------------
try {
  $null = [Windows.Media.Playback.MediaPlayer, Windows.Media.Playback, ContentType = WindowsRuntime]
  $null = [Windows.Storage.Streams.InMemoryRandomAccessStream, Windows.Storage.Streams, ContentType = WindowsRuntime]
  $null = [Windows.Storage.Streams.DataWriter, Windows.Storage.Streams, ContentType = WindowsRuntime]
  $null = [Windows.Storage.Streams.RandomAccessStreamReference, Windows.Storage.Streams, ContentType = WindowsRuntime]
  $null = [Windows.Media.Playback.MediaPlaybackStatus, Windows.Media.Playback, ContentType = WindowsRuntime]
  $null = [Windows.Media.Playback.MediaPlaybackType, Windows.Media.Playback, ContentType = WindowsRuntime]
  $null = [Windows.Media.SystemMediaTransportControlsButton, Windows.Media, ContentType = WindowsRuntime]
  Write-Log "winrt types projected"
} catch {
  $sync.InitErr = "winrt: $($_.Exception.Message)"
  Write-Log "WINRT PROJECTION FAILED: $($_.Exception.Message)"
  # keep serving HTTP so diagnostics can observe the failure
}

function Wait-AsyncOp($op, [string]$what) {
  $spin = 0
  while ($op.Status -eq 0 -and $spin -lt 500) {  # 0 = Started
    Start-Sleep -Milliseconds 10
    $spin++
  }
  if ($op.Status -ne 1) { throw "$what async op status=$($op.Status)" }  # 1 = Completed
}

# ---------------------------------------------------------------------------
# Own full SMTC session via MediaPlayer manual-control mode:
#   * zero-volume silent in-memory wav gives the process a real media pipeline
#     (never touches disk - CJK/one-drive %TEMP% paths are a known trap);
#   * CommandManager disabled = official manual control mode, we own metadata,
#     status and timeline; OS media keys + flyout become OUR commands.
# ---------------------------------------------------------------------------
$player = $null
$ctl = $null
try {
  # --- build 1 second of 8kHz 16-bit mono silence in memory ---
  $stream = New-Object Windows.Storage.Streams.InMemoryRandomAccessStream
  $writer = New-Object Windows.Storage.Streams.DataWriter($stream)
  $writer.ByteOrder = [Windows.Storage.Streams.ByteOrder]::LittleEndian
  $hdr = [byte[]](
    0x52,0x49,0x46,0x46, 0x24,0x77,0x01,0x00, 0x57,0x41,0x56,0x45,
    0x66,0x6D,0x74,0x20, 0x10,0x00,0x00,0x00, 0x01,0x00,0x01,0x00,
    0x40,0x1F,0x00,0x00, 0x80,0x3E,0x00,0x00, 0x02,0x00,0x10,0x00,
    0x64,0x61,0x74,0x61, 0x00,0x77,0x01,0x00)
  $writer.WriteBytes($hdr)
  $silence = New-Object byte[] 8000
  $writer.WriteBytes($silence)
  Wait-AsyncOp ($writer.StoreAsync()) "wav-store"
  Wait-AsyncOp ($writer.FlushAsync()) "wav-flush"
  $writer.DetachStream()
  $writer = $null
  $stream.Seek(0)

  $item = New-Object Windows.Media.Playback.MediaPlaybackItem(
    [Windows.Media.Playback.MediaSource]::CreateFromStream($stream, "audio/wav"))

  $player = New-Object Windows.Media.Playback.MediaPlayer
  $player.Volume = 0
  $player.IsMuted = $true

  # manual control mode: CommandManager must be disabled BEFORE any property
  $ctl = $player.SystemMediaTransportControls
  $ctl.CommandManager.IsEnabled = $false
  $ctl.IsEnabled = $true
  $ctl.IsPlayEnabled = $true
  $ctl.IsPauseEnabled = $true
  $ctl.IsNextEnabled = $true
  $ctl.IsPreviousEnabled = $true
  $ctl.IsPlaybackPositionEnabled = $true   # draggable progress in flyout/lockscreen

  # Min/MaxSeekTime MUST be set, otherwise the OS never raises
  # PlaybackPositionChangeRequested (documented manual-control requirement)
  $tl0 = New-Object Windows.Media.Playback.SystemMediaTransportControlsTimelineProperties
  $tl0.StartTime = [TimeSpan]::Zero
  $tl0.EndTime = [TimeSpan]::FromSeconds(1)
  $tl0.MinSeekTime = [TimeSpan]::Zero
  $tl0.MaxSeekTime = [TimeSpan]::FromSeconds(1)
  $tl0.Position = [TimeSpan]::Zero
  $ctl.UpdateTimelineProperties($tl0)

  $player.Source = $item
  $player.Play()   # registers the session with the system media flyout

  Write-Log "own smtc session up (MediaPlayer manual-control mode)"
} catch {
  $sync.InitErr = "smtc: $($_.Exception.Message)"
  Write-Log "SMTC SESSION FAILED: $($_.Exception.Message)"
}

# ---------------------------------------------------------------------------
# SMTC events -> command queue. Register-ObjectEvent + synchronized
# ArrayList: a raw scriptblock cast to a WinRT delegate fires on a callback
# thread with no runspace and kills the process; never do that here.
# ---------------------------------------------------------------------------
function Push-Cmd([string]$cmd, $position) {
  Lock-Exec {
    if ($sync.Out.Count -ge $CmdCap) { $sync.Out.RemoveAt(0) }
    $sync.CmdSeq = [int]$sync.CmdSeq + 1
    $null = $sync.Out.Add(@{
      id = [int]$sync.CmdSeq; cmd = $cmd; at = [Environment]::TickCount;
      position = $position })
  }
  Write-Log "cmd enqueued: $cmd $(if ($null -ne $position) { "pos=$position" })"
}

if ($ctl) {
  try {
    Register-ObjectEvent -InputObject $ctl -EventName ButtonPressed `
      -MessageData $sync -Action {
      $b = $Event.SourceEventArgs.Button
      $c = $null
      if ($b -eq [Windows.Media.SystemMediaTransportControlsButton]::Play) { $c = "play" }
      elseif ($b -eq [Windows.Media.SystemMediaTransportControlsButton]::Pause) { $c = "pause" }
      elseif ($b -eq [Windows.Media.SystemMediaTransportControlsButton]::Next) { $c = "next" }
      elseif ($b -eq [Windows.Media.SystemMediaTransportControlsButton]::Previous) { $c = "prev" }
      elseif ($b -eq [Windows.Media.SystemMediaTransportControlsButton]::Stop) { $c = "pause" }
      if ($c) {
        [System.Threading.Monitor]::Enter($Event.MessageData)
        try {
          if ($Event.MessageData.Out.Count -ge 8) { $Event.MessageData.Out.RemoveAt(0) }
          $Event.MessageData.CmdSeq = [int]$Event.MessageData.CmdSeq + 1
          $null = $Event.MessageData.Out.Add(@{
            id = [int]$Event.MessageData.CmdSeq; cmd = $c; at = [Environment]::TickCount })
        } finally { [System.Threading.Monitor]::Exit($Event.MessageData) }
      }
    } | Out-Null
    Register-ObjectEvent -InputObject $ctl -EventName PlaybackPositionChangeRequested `
      -MessageData $sync -Action {
      $p = $Event.SourceEventArgs.RequestedPosition
      [System.Threading.Monitor]::Enter($Event.MessageData)
      try {
        if ($Event.MessageData.Out.Count -ge 8) { $Event.MessageData.Out.RemoveAt(0) }
        $Event.MessageData.CmdSeq = [int]$Event.MessageData.CmdSeq + 1
        $null = $Event.MessageData.Out.Add(@{
          id = [int]$Event.MessageData.CmdSeq; cmd = "seek"; at = [Environment]::TickCount;
          position = [Math]::Round($p.TotalSeconds, 3) })
      } finally { [System.Threading.Monitor]::Exit($Event.MessageData) }
    } | Out-Null
    Write-Log "smtc event subscriptions registered"
  } catch {
    $sync.InitErr = "events: $($_.Exception.Message)"
    Write-Log "EVENT SUBSCRIPTION FAILED: $($_.Exception.Message)"
  }
}

# ---------------------------------------------------------------------------
# HTTP hub (separate runspace; touches ONLY $sync - never WinRT objects)
# ---------------------------------------------------------------------------
$hubScript = {
  param($sync, $Port, $EngineVersion, $EngineName, $CmdExpireMs, $CmdCap, $LyricCap, $MgrWindowMs)

  function Resp($ctx, [int]$code, $obj) {
    $bytes = [Text.Encoding]::UTF8.GetBytes(($obj | ConvertTo-Json -Compress -Depth 6))
    $ctx.Response.StatusCode = $code
    $ctx.Response.ContentType = "application/json; charset=utf-8"
    $ctx.Response.Headers["Access-Control-Allow-Origin"] = "*"
    $ctx.Response.Headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    $ctx.Response.Headers["Access-Control-Allow-Headers"] = "Content-Type"
    $ctx.Response.Headers["Cache-Control"] = "no-store"
    $ctx.Response.ContentLength64 = $bytes.Length
    $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    $ctx.Response.OutputStream.Close()
  }

  function Enqueue($sync, $item, $cap) {
    if ($sync.Out.Count -ge $cap) { $sync.Out.RemoveAt(0) }
    $sync.CmdSeq = [int]$sync.CmdSeq + 1
    $item.id = [int]$sync.CmdSeq
    $null = $sync.Out.Add($item)
  }

  $listener = New-Object System.Net.HttpListener
  $listener.Prefixes.Add("http://127.0.0.1:$Port/")
  try {
    $listener.Start()
  } catch {
    $sync.HubErr = "bind: $($_.Exception.Message)"
    return
  }
  while ($listener.IsListening) {
    $ctx = $null
    try { $ctx = $listener.GetContext() } catch { break }
    try {
      $req = $ctx.Request
      $path = $req.Url.AbsolutePath
      $verb = $req.HttpMethod

      if ($verb -eq "OPTIONS") {
        $ctx.Response.StatusCode = 204
        $ctx.Response.Headers["Access-Control-Allow-Origin"] = "*"
        $ctx.Response.Headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
        $ctx.Response.Headers["Access-Control-Allow-Headers"] = "Content-Type"
        $ctx.Response.Headers["Access-Control-Max-Age"] = "600"
        $ctx.Response.OutputStream.Close()
        continue
      }

      # ---- GET /api/ping --------------------------------------------------
      if ($path -eq "/api/ping" -and $verb -eq "GET") {
        Resp $ctx 200 @{ ok = $true; name = $EngineName; ver = $EngineVersion }
        continue
      }

      # ---- GET /api/state -------------------------------------------------
      if ($path -eq "/api/state" -and $verb -eq "GET") {
        $mgr = ""
        [System.Threading.Monitor]::Enter($sync)
        try {
          $ageMgr = [Environment]::TickCount - [int]$sync.MgrAt
          if ($sync.Mgr -and $ageMgr -ge 0 -and $ageMgr -lt $MgrWindowMs) { $mgr = $sync.Mgr }
          $ne = $null
          if ($sync.Ne) {
            $ageNe = [Environment]::TickCount - [int]$sync.NeAt
            if ($ageNe -ge 0 -and $ageNe -le 6000) { $ne = $sync.Ne }
          }
          $outCount = $sync.Out.Count
          $status = [string]$sync.SmtcStatus
          $initErr = [string]$sync.InitErr
        } finally { [System.Threading.Monitor]::Exit($sync) }
        Resp $ctx 200 @{
          ok = $true; name = $EngineName; ver = $EngineVersion; mgr = $mgr; ne = $ne
          cmds = $outCount; smtc = @{ own = $true; status = $status; initErr = $initErr }
        }
        continue
      }

      # ---- POST /api/ne (truth heartbeat from the music api plugin) -------
      if ($path -eq "/api/ne" -and $verb -eq "POST") {
        $body = (New-Object IO.StreamReader($req.InputStream, [Text.Encoding]::UTF8)).ReadToEnd()
        try {
          $o = $body | ConvertFrom-Json
          if (-not $o -or -not $o.v) { throw "missing v" }
          [System.Threading.Monitor]::Enter($sync)
          try { $sync.Ne = $o; $sync.NeAt = [Environment]::TickCount } finally { [System.Threading.Monitor]::Exit($sync) }
          Resp $ctx 200 @{ ok = $true }
        } catch {
          Resp $ctx 400 @{ ok = $false; err = "bad-ne" }
        }
        continue
      }

      # ---- POST /api/lyric (plugin pushes full lyrics) / GET (host pulls) -
      if ($path -eq "/api/lyric") {
        if ($verb -eq "POST") {
          $body = (New-Object IO.StreamReader($req.InputStream, [Text.Encoding]::UTF8)).ReadToEnd()
          try {
            $o = $body | ConvertFrom-Json
            $sid = [string]$o.songId
            if (-not $sid) { throw "missing songId" }
            [System.Threading.Monitor]::Enter($sync)
            try {
              if (-not $sync.Lyrics.ContainsKey($sid)) {
                $null = $sync.LyricOrder.Add($sid)
                while ($sync.LyricOrder.Count -gt $LyricCap) {
                  $old = [string]$sync.LyricOrder[0]
                  $sync.LyricOrder.RemoveAt(0)
                  $sync.Lyrics.Remove($old)
                }
              }
              $sync.Lyrics[$sid] = $o
            } finally { [System.Threading.Monitor]::Exit($sync) }
            Resp $ctx 200 @{ ok = $true }
          } catch {
            Resp $ctx 400 @{ ok = $false; err = "bad-lyric" }
          }
        } else {
          $sid = [string]$req.QueryString["songId"]
          $hit = $null
          [System.Threading.Monitor]::Enter($sync)
          try { if ($sid -and $sync.Lyrics.ContainsKey($sid)) { $hit = $sync.Lyrics[$sid] } } finally { [System.Threading.Monitor]::Exit($sync) }
          if ($hit) { Resp $ctx 200 @{ ok = $true; rev = [string]$hit.rev; lyric = $hit } }
          else { Resp $ctx 200 @{ ok = $false } }
        }
        continue
      }

      # ---- POST /api/cmd (host controls) / GET (plugin polls) -------------
      if ($path -eq "/api/cmd") {
        if ($verb -eq "POST") {
          $body = (New-Object IO.StreamReader($req.InputStream, [Text.Encoding]::UTF8)).ReadToEnd()
          try {
            $o = $body | ConvertFrom-Json
            $c = [string]$o.cmd
            $known = @("play", "pause", "toggle", "next", "prev", "seek")
            if ($known -notcontains $c) { throw "unknown-cmd" }
            $pos = $null
            if ($c -eq "seek") {
              $pos = [double]::Parse([string]$o.position, [Globalization.CultureInfo]::InvariantCulture)
              if ($pos -lt 0 -or $pos -gt 86400) { throw "bad-position" }
            }
            [System.Threading.Monitor]::Enter($sync)
            try { Enqueue $sync @{ cmd = $c; at = [Environment]::TickCount; position = $pos } $CmdCap } finally { [System.Threading.Monitor]::Exit($sync) }
            Resp $ctx 200 @{ ok = $true }
          } catch {
            Resp $ctx 400 @{ ok = $false; err = "bad-cmd" }
          }
        } else {
          $cmds = @()
          [System.Threading.Monitor]::Enter($sync)
          try {
            $now = [Environment]::TickCount
            while ($sync.Out.Count -gt 0 -and ($now - [int]$sync.Out[0].at) -gt $CmdExpireMs) { $sync.Out.RemoveAt(0) }
            while ($sync.Out.Count -gt 0 -and $cmds.Count -lt 8) {
              $it = $sync.Out[0]; $sync.Out.RemoveAt(0)
              $cmds += $it
            }
          } finally { [System.Threading.Monitor]::Exit($sync) }
          Resp $ctx 200 @{ ok = $true; cmds = $cmds }
        }
        continue
      }

      # ---- POST /api/mgr (manager heartbeat) -------------------------------
      if ($path -eq "/api/mgr" -and $verb -eq "POST") {
        $body = (New-Object IO.StreamReader($req.InputStream, [Text.Encoding]::UTF8)).ReadToEnd()
        try {
          $o = $body | ConvertFrom-Json
          [System.Threading.Monitor]::Enter($sync)
          try { $sync.Mgr = [string]$o.v; $sync.MgrAt = [Environment]::TickCount } finally { [System.Threading.Monitor]::Exit($sync) }
          Resp $ctx 200 @{ ok = $true }
        } catch { Resp $ctx 400 @{ ok = $false; err = "bad-mgr" } }
        continue
      }

      Resp $ctx 404 @{ ok = $false; err = "not-found" }
    } catch {
      try { Resp $ctx 500 @{ ok = $false; err = "hub" } } catch { }
    }
  }
}

$hubState = [powershell]::Create()
$null = $hubState.AddScript($hubScript)
$null = $hubState.AddArgument($sync)
$null = $hubState.AddArgument($Port)
$null = $hubState.AddArgument($EngineVersion)
$null = $hubState.AddArgument($EngineName)
$null = $hubState.AddArgument($CmdExpireMs)
$null = $hubState.AddArgument($CmdCap)
$null = $hubState.AddArgument($LyricCap)
$null = $hubState.AddArgument($MgrWindowMs)
$hubHandle = $hubState.BeginInvoke()
Write-Log "http hub launching on 127.0.0.1:$Port"

# ---------------------------------------------------------------------------
# Timeline / metadata driver (main thread; the only WinRT writer)
# ---------------------------------------------------------------------------
$metaSig = ""
$lastApply = 0

function Close-Session {
  if (-not $ctl) { return }
  try { $ctl.PlaybackStatus = [Windows.Media.Playback.MediaPlaybackStatus]::Closed } catch { }
  $sync.SmtcStatus = "closed"
}

function Apply-Truth {
  if (-not $ctl) { return }
  $ne = $null
  Lock-Exec { $ne = $sync.Ne }
  if (Test-TruthStale) {
    if ($sync.SmtcStatus -ne "closed") {
      Close-Session
      Write-Log "truth stale -> session closed"
    }
    return
  }
  try {
    $playing = ($ne.playing -eq $true)
    $dur = 0.0
    if ($ne.duration) { $dur = [double]$ne.duration }
    if ($dur -lt 0) { $dur = 0 }
    $pos = 0.0
    if ($ne.position) { $pos = [double]$ne.position }
    if ($playing -and $sync.NeAt -gt 0) {
      $ageMs = [Environment]::TickCount - [int]$sync.NeAt
      if ($ageMs -lt 0) { $ageMs = 0 }
      if ($ageMs -gt 6000) { $ageMs = 6000 }
      $pos = $pos + ($ageMs / 1000.0)
    }
    if ($dur -gt 0 -and $pos -gt $dur) { $pos = $dur }
    if ($pos -lt 0) { $pos = 0 }

    $status = [Windows.Media.Playback.MediaPlaybackStatus]::Paused
    if ($playing) { $status = [Windows.Media.Playback.MediaPlaybackStatus]::Playing }
    $ctl.PlaybackStatus = $status

    # metadata only when it actually changed (DisplayUpdater rewrites are heavy)
    $pic = ""
    if ($ne.pic) { $pic = [string]$ne.pic }
    $sig = "$($ne.title)|$($ne.artist)|$($ne.album)|$pic"
    if ($sig -ne $metaSig) {
      $metaSig = $sig
      $du = $ctl.DisplayUpdater
      $du.Type = [Windows.Media.Playback.MediaPlaybackType]::Music
      $du.MusicProperties.Title = [string]$ne.title
      $du.MusicProperties.Artist = [string]$ne.artist
      $du.MusicProperties.AlbumTitle = [string]$ne.album
      if ($pic -like "https://*") {
        try {
          $du.Thumbnail = [Windows.Storage.Streams.RandomAccessStreamReference]::CreateFromUri(
            [Uri]::new($pic))
        } catch { }
      }
      $du.Update()
    }

    $tl = New-Object Windows.Media.Playback.SystemMediaTransportControlsTimelineProperties
    $tl.StartTime = [TimeSpan]::Zero
    $tl.EndTime = [TimeSpan]::FromSeconds([Math]::Max(1.0, $dur))
    $tl.MinSeekTime = [TimeSpan]::Zero
    $tl.MaxSeekTime = [TimeSpan]::FromSeconds([Math]::Max(1.0, $dur))
    $tl.Position = [TimeSpan]::FromSeconds($pos)
    $ctl.UpdateTimelineProperties($tl)

    $sync.SmtcStatus = "playing"
    if (-not $playing) { $sync.SmtcStatus = "paused" }
  } catch {
    Write-Log "apply-truth error: $($_.Exception.Message)"
  }
}

while ($true) {
  Start-Sleep -Milliseconds 120
  $now = [Environment]::TickCount
  if (($now - $lastApply) -ge $ApplyEveryMs) {
    $lastApply = $now
    Apply-Truth
  }
}
