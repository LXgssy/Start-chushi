# ChuShi SMTC Bridge v2.0.0 (embedded edition, ASCII-only)
# ============================================================
# IMPORTANT: this file MUST stay pure ASCII (no CJK) so encoding can never
# break it. It is embedded (base64) inside the ChuShi SMTC Bridge BetterNCM
# plugin (cc.chushi.smtcbridge), which deploys + starts + supervises it.
#
# v3.0.0 architecture rule: THIS BRIDGE IS TRANSPORT ONLY.
# It relays the Windows SMTC session and the NetEase plugin truth (ne) as-is.
# It NEVER blends/corrects one with the other (the v1.7.x ne-anchoring of the
# SMTC position is REMOVED - the host now owns all arbitration, one layer).
#
# Exposes the Windows system media session (SMTC) on http://127.0.0.1:20754:
#   GET  /api/state          snapshot + plugins registry (smtc plugin version)
#   GET  /api/cover?v=rev    cover bytes (cached)
#   POST /api/control        {cmd: play|pause|toggle|next|prev|seek, position?}
#   GET  /api/lyric?v=rev    lyric payload pushed by the NetEase plugin
#   POST /api/plugin/state   plugin heartbeat (state in / cmd out via resp)
#   POST /api/plugin/register {role:'smtc', v} - supervisor plugin self-report
#   GET  /api/plugin/cmd     plugin fast command poll (seek latency <= 300ms)
#   GET  /api/ping           liveness probe {ok,name,version}
#
# v2.0.0 changes (two-plugin split, transport-only):
#   + /api/plugin/register: the SMTC supervisor plugin reports {role:'smtc',
#     v}; registry surfaced in /api/state as plugins.smtc (fresh <= 90s) so
#     the host can see the supervisor live instead of guessing versions.
#   + heartbeat role arbitration: state POSTs carrying role='ncm' (the new
#     NetEase API plugin) mark the ne channel owner for 10s; role-less
#     heartbeats (legacy integrated plugin still installed alongside) are
#     IGNORED while the ncm owner is alive - two producers can no longer
#     fight over the same channel (last-writer-wins alternation bug).
#   - REMOVED: ne-anchoring of the SMTC position inside Update-MediaState
#     (the three-layer correction war was the structural root of inverted
#     states / 0.5x crawling progress / frozen panels).
# v1.7.1 changes:
#   + /api/plugin/state heartbeat response carries needLyric = <songId>
#     when the current song has no lyric in this bridge's memory (bridge was
#     restarted mid-song) - the plugin re-pushes its cached lyric on sight,
#     so the panel never loses lyrics to a bridge restart.
# v1.7.0 changes (one-file architecture):
#   + /api/plugin/cmd fast command endpoint (plugin polls every 300ms)
#   + version arbitration on port conflict: if the running bridge is same or
#     newer, exit quietly; if older, kill it (by command line match) and bind
#   + always ensure HKCU Run key points at THIS deployed copy (plugin deploys
#     it, so the bridge follows the plugin version with zero manual steps)
#   + removes the legacy 'ChuShiSmtcBridge' manual-autostart key semantics by
#     simply overwriting it with the deployed path
#   carried over from v1.5.0/v1.6.0: seek via SMTC +
#     plugin passthrough (with id), lyric rev check, pause half-window
#     compensation.
param(
  [int]$Port = 20754,
  [string]$AppFilter = 'netease|cloudmusic|163music|orpheus'
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$BRIDGE_VERSION = '2.0.0'

# ---------- WinRT projection (Windows PowerShell 5.1 only) ----------
if ($PSVersionTable.PSVersion.Major -ge 6) {
  Write-Host '[ChuShiBridge] Please run with Windows PowerShell 5.1 (the launcher handles this).'
  exit 1
}
Add-Type -AssemblyName System.Runtime.WindowsRuntime | Out-Null

$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media.Control, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime]

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

# ---------- shared state ----------
$script:State = @{
  HasSession = $false; App = ''; Title = ''; Artist = ''; Album = ''
  Playing = $false; Position = 0.0; Duration = 0.0; Rate = 1.0
  CoverRev = ''; UpdatedAt = [DateTime]::UtcNow
}
$script:CoverCache = @{ Rev = ''; Bytes = $null; ContentType = 'image/png' }
$script:LastPoll = [DateTime]::MinValue
$script:CurrentSession = $null

# ---------- NetEase plugin channel (state cache + lyric cache + cmd queue) ----------
$script:NeState = $null
$script:NeLyric = $null
$script:NeLyricRev = ''
$script:NeStateAt = [DateTime]::MinValue
$script:NeLyricAt = [DateTime]::MinValue
# v2.0.0 two-plugin split: ne channel owner + supervisor plugin registry
$script:NeOwner = 'legacy'          # 'legacy' (role-less heartbeat) | 'ncm' (role=ncm)
$script:NeNcmAt = [DateTime]::MinValue
$script:SmtcPluginVer = ''          # supervisor plugin self-reported version
$script:SmtcPluginAt = [DateTime]::MinValue

$script:PosAnchor = @{
  Key = ''; Base = 0.0; At = [DateTime]::UtcNow
  Raw = -1.0; Lu = [DateTime]::MinValue; Playing = $false
}
$script:CurPos = 0.0
$script:LastSampleAt = [DateTime]::MinValue
$script:NeCmd = $null

function Read-BodyJson($Req) {
  try {
    $reader = New-Object System.IO.StreamReader($Req.InputStream, [System.Text.Encoding]::UTF8)
    $raw = $reader.ReadToEnd()
    if (-not $raw) { return $null }
    return $raw | ConvertFrom-Json
  } catch { return $null }
}

function S-Str($Obj, [string]$Key, [int]$Max) {
  try { $v = $Obj.$Key; if ($null -ne $v) { return ([string]$v).Substring(0, [Math]::Min($Max, ([string]$v).Length)) } } catch {}
  return ''
}

function S-Num($Obj, [string]$Key) {
  try { $v = $Obj.$Key; if ($null -ne $v) { $d = 0.0; if ([double]::TryParse([string]$v, [System.Globalization.NumberStyles]::Any, [System.Globalization.CultureInfo]::InvariantCulture, [ref]$d)) { return $d } } } catch {}
  return 0.0
}

function Update-NeState($Obj) {
  if ($null -eq $Obj) { return }
  # v2.0.0 owner arbitration: role='ncm' heartbeat claims the channel for 10s;
  # role-less (legacy integrated plugin) heartbeats are dropped while an ncm
  # owner is alive so two producers can never interleave on the same channel.
  $role = S-Str $Obj 'role' 8
  if ($role -eq 'ncm') {
    $script:NeOwner = 'ncm'
    $script:NeNcmAt = Get-Date
  } else {
    if ($script:NeOwner -eq 'ncm' -and ((Get-Date) - $script:NeNcmAt).TotalSeconds -le 10) { return }
    $script:NeOwner = 'legacy'
  }
  $song = $Obj.song
  $st = @{
    songId = 0; title = ''; artist = ''; album = ''; pic = ''
    positionMs = 0.0; durationMs = 0.0; playing = $false; ts = 0.0
  }
  if ($null -ne $song) {
    $st.songId = [long](S-Num $song 'id')
    $st.title = S-Str $song 'name' 200
    try { $ars = $song.artists; if ($ars) { $st.artist = (($ars | ForEach-Object { S-Str $_ 'name' 60 }) -join '/') } } catch {}
    $st.album = S-Str $song 'album' 200
    $st.pic = S-Str $song 'cover' 500
  }
  $st.positionMs = S-Num $Obj 'positionMs'
  $st.durationMs = S-Num $Obj 'durationMs'
  $st.playing = ($Obj.playing -eq $true)
  $st.ts = S-Num $Obj 'ts'
  $st.v = S-Str $Obj 'v' 16
  $st.seekAckId = ''; $st.seekAckOk = $false; $st.seekAckPos = 0.0; $st.seekAckAt = 0.0
  try {
    $ack = $Obj.seekAck
    if ($null -ne $ack) {
      $st.seekAckId = S-Str $ack 'id' 40
      $st.seekAckOk = ($ack.ok -eq $true)
      $st.seekAckPos = S-Num $ack 'pos'
      $st.seekAckAt = S-Num $ack 'at'
    }
  } catch { }
  $script:NeState = $st
  $script:NeStateAt = Get-Date
}

function Update-NeLyric($Obj) {
  if ($null -eq $Obj) { return }
  $cap = { param($s) if ($null -eq $s) { return '' }; $t = [string]$s; return $t.Substring(0, [Math]::Min(200000, $t.Length)) }
  $st = @{
    songId = [long](S-Num $Obj 'songId')
    title = S-Str $Obj 'title' 200
    artist = S-Str $Obj 'artist' 200
    yrc = & $cap $Obj.yrc
    lrc = & $cap $Obj.lrc
    tlyric = & $cap $Obj.tlyric
    ytlrc = & $cap $Obj.ytlrc
    source = S-Str $Obj 'source' 24
  }
  if (-not $st.yrc -and -not $st.lrc) { return }
  $script:NeLyric = $st
  $script:NeLyricAt = Get-Date
  $script:NeLyricRev = [string]([Math]::Abs(("$($st.songId)|$($st.title)|$($st.yrc.Length)|$($st.lrc.Length)").GetHashCode()))
}

function Get-NeFresh {
  if ($null -eq $script:NeState) { return $null }
  if (((Get-Date) - $script:NeStateAt).TotalSeconds -gt 5) { return $null }
  $st = $script:NeState.Clone()
  $st.lyricRev = $script:NeLyricRev
  return $st
}

function Get-AppDisplayName([string]$Aumid) {
  if (-not $Aumid) { return 'MediaApp' }
  if ($Aumid -match 'netease|cloudmusic|163music|orpheus') { return 'NetEase Music' }
  if ($Aumid -match 'qqmusic')    { return 'QQ Music' }
  if ($Aumid -match 'kugou')      { return 'Kugou' }
  if ($Aumid -match 'kuwo')       { return 'Kuwo' }
  if ($Aumid -match 'spotify')    { return 'Spotify' }
  if ($Aumid -match 'msedge')     { return 'Edge' }
  if ($Aumid -match 'chrome')     { return 'Chrome' }
  if ($Aumid -match 'firefox')    { return 'Firefox' }
  if ($Aumid -match 'bilibili')   { return 'Bilibili' }
  $first = ($Aumid -split '!')[0] -split '_' | Select-Object -First 1
  if ($first -and $first.Length -gt 24) { $first = $first.Substring(0, 24) }
  if ($first) { return $first }
  return 'MediaApp'
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

function Test-TitleMatch([string]$A, [string]$B) {
  if (-not $A -or -not $B) { return $false }
  $a = $A.Trim().ToLowerInvariant(); $b = $B.Trim().ToLowerInvariant()
  if ($a -eq $b) { return $true }
  if ($a.Contains($b) -or $b.Contains($a)) { return $true }
  $re = '[\s\-\_\u00b7\u30fb()\uff08\uff09\[\]\u3010\u3011\u300c\u300d\u300e\u300f,\uff0c\u3002\u3001!\uff01?\uff1f~\uff5e\''\"]'
  $a2 = [regex]::Replace($a, $re, ''); $b2 = [regex]::Replace($b, $re, '')
  if ($a2 -and $b2 -and ($a2.Contains($b2) -or $b2.Contains($a2))) { return $true }
  return $false
}

function Update-MediaState {
  $prevSampleAt = $script:LastSampleAt
  $script:LastSampleAt = Get-Date
  $script:LastPoll = $script:LastSampleAt
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
    $script:State.Duration = [Math]::Max(0.0, $tl.EndTime.TotalSeconds)
    if ($tl.PlaybackRate -gt 0) { $script:State.Rate = [double]$tl.PlaybackRate } else { $script:State.Rate = 1.0 }

    # ---------- position wall-clock compensation ----------
    $rawPos = [Math]::Max(0.0, $tl.Position.TotalSeconds)
    $lu = $tl.LastUpdatedTime.UtcDateTime
    $aKey = [string]$sess.SourceAppUserModelId + '|' + $title
    $anchorChanged = ($aKey -ne $script:PosAnchor.Key -or $rawPos -ne $script:PosAnchor.Raw -or `
      $lu -ne $script:PosAnchor.Lu -or $script:State.Playing -ne $script:PosAnchor.Playing)
    if ($anchorChanged) {
      if ($aKey -ne $script:PosAnchor.Key) { $script:PosAnchor.Base = $rawPos }
      elseif (-not $script:State.Playing -and $script:PosAnchor.Playing) {
        # pause detected late (<= one sampling window): rewind half the window
        $win = ([DateTime]::UtcNow - $prevSampleAt).TotalSeconds
        if ($win -gt 0 -and $win -lt 10) {
          $r2 = $script:State.Rate; if ($r2 -le 0) { $r2 = 1.0 }
          $script:PosAnchor.Base = [Math]::Max(0.0, $script:CurPos - 0.5 * $win * $r2)
        } else { $script:PosAnchor.Base = $script:CurPos }
      }
      else { $script:PosAnchor.Base = $script:CurPos }
      $script:PosAnchor.Key = $aKey
      $script:PosAnchor.Raw = $rawPos
      $script:PosAnchor.Lu = $lu
      $script:PosAnchor.Playing = $script:State.Playing
      $script:PosAnchor.At = [DateTime]::UtcNow
    }
    $posSec = $script:PosAnchor.Base
    if ($script:State.Playing) {
      $el = ([DateTime]::UtcNow - $script:PosAnchor.At).TotalSeconds
      if ($el -gt 0 -and $el -lt 21600) { $posSec = $script:PosAnchor.Base + $el * $script:State.Rate }
    }
    # v2.0.0: NO ne-anchoring here. The bridge is transport only - the SMTC
    # position is compensated by wall-clock (above) and relayed as-is. The
    # NetEase plugin truth (ne) reaches the host untouched; the HOST owns the
    # single arbitration layer (three-layer correction war removed).
    if ($script:State.Duration -gt 0 -and $posSec -gt $script:State.Duration) { $posSec = $script:State.Duration }
    if ($posSec -lt 0) { $posSec = 0.0 }
    $script:CurPos = $posSec
    $script:State.Position = $posSec
    $script:State.CoverRev = $rev
    $script:State.UpdatedAt = [DateTime]::UtcNow

    if ($rev -ne '') {
      $null = Read-CoverBytes $props $rev
    }
  } catch {
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

# ---------- control ----------
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
        # NetEase ignores SMTC seek (client-side limitation). Send it anyway
        # for well-behaved players, and always queue the command for the
        # plugin (which seeks via the client internal API, with verification).
        $sec = [double]$PositionSec
        if ($sec -lt 0) { $sec = 0 }
        $ticks = [long]([Math]::Round($sec * 10000000))
        $smtcOk = $false
        try { $smtcOk = Await ($sess.TryChangePlaybackPositionAsync($ticks)) ([System.Boolean]) } catch { $smtcOk = $false }
        $neT = $false
        if ($null -ne $script:NeState) { $neT = Test-TitleMatch $script:State.Title $script:NeState.title }
        if ($null -ne $script:NeState -and $neT -and ((Get-Date) - $script:NeStateAt).TotalSeconds -le 8) {
          $seekId = [System.Guid]::NewGuid().ToString('N').Substring(0, 12)
          $script:NeCmd = @{ cmd = 'seek'; position = $sec; title = [string]$script:NeState.title; id = $seekId; at = [DateTime]::UtcNow }
        }
        if ($smtcOk) {
          $script:PosAnchor.Base = $sec
          $script:PosAnchor.At = [DateTime]::UtcNow
          $script:CurPos = $sec
          return @{ ok = $true }
        }
        if ($null -ne $script:NeCmd) { return @{ ok = $true; via = 'plugin' } }
        return @{ ok = $false; reason = 'seek-unavailable' }
      }
      default { return @{ ok = $false; reason = 'unknown-cmd' } }
    }
  } catch {
    return @{ ok = $false; reason = 'error' }
  }
}

function Pop-NeCmd {
  if ($null -eq $script:NeCmd) { return $null }
  if (((Get-Date) - $script:NeCmd.at).TotalSeconds -gt 5) { $script:NeCmd = $null; return $null }
  $c = $script:NeCmd
  $script:NeCmd = $null
  return $c
}

# ---------- init session manager ----------
try {
  $script:Manager = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
} catch {
  Write-Host '[ChuShiBridge] Failed to init SMTC manager (needs Windows 10 1809+).'
  Write-Host $_.Exception.Message
  exit 1
}

# ---------- HTTP listener (with version-aware takeover) ----------
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://127.0.0.1:$Port/") | Out-Null
function Test-PortFree([int]$P) {
  try {
    $t = New-Object System.Net.HttpListener
    $t.Prefixes.Add("http://127.0.0.1:$P/") | Out-Null
    $t.Start(); $t.Stop()
    return $true
  } catch { return $false }
}
try {
  $listener.Start()
} catch {
  # v1.7.0 arbitration: ask the running bridge its version first
  $running = ''
  try {
    $pingRaw = (New-Object System.Net.WebClient).DownloadString("http://127.0.0.1:$Port/api/ping")
    $pj = $pingRaw | ConvertFrom-Json
    if ($pj.name -eq 'chushi-smtc-bridge') { $running = [string]$pj.version }
  } catch { $running = '' }
  if ($running) {
    $mine = [version]($BRIDGE_VERSION)
    $sameOrNewer = $false
    try { $sameOrNewer = ([version]$running) -ge $mine } catch { $sameOrNewer = ($running -eq $BRIDGE_VERSION) }
    if ($sameOrNewer) {
      Write-Host "[ChuShiBridge] Bridge v$running already running and up to date - exit quietly."
      exit 0
    }
    Write-Host "[ChuShiBridge] Running bridge v$running is older than v$BRIDGE_VERSION - taking over."
  }
  $killed = $false
  try {
    $conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    foreach ($c in @($conns)) {
      try {
        $procId = [int]$c.OwningProcess
        if ($procId -le 0 -or $procId -eq $PID) { continue }
        $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$procId" -ErrorAction SilentlyContinue
        if ($proc -and ([string]$proc.CommandLine) -match 'ChuShi-SMTC-Bridge\.ps1|chushi-bridge\.ps1') {
          Write-Host "[ChuShiBridge] Stopping outdated bridge instance (PID $procId)."
          Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
          $killed = $true
        }
      } catch { }
    }
  } catch { }
  if ($killed) {
    Start-Sleep -Milliseconds 900
    try {
      $listener = New-Object System.Net.HttpListener
      $listener.Prefixes.Add("http://127.0.0.1:$Port/") | Out-Null
      $listener.Start()
      Write-Host '[ChuShiBridge] Takeover complete.'
    } catch {
      Write-Host "[ChuShiBridge] Port $Port still unavailable after takeover."
      exit 1
    }
  } else {
    Write-Host "[ChuShiBridge] Port $Port occupied by another program."
    exit 1
  }
}

# ---------- v1.7.0: always ensure autostart Run key points at THIS copy ----------
# The plugin deploys this file, so autostart follows the plugin version.
try {
  $self = $MyInvocation.MyCommand.Path
  if ($self) {
    $vbs = Join-Path (Split-Path $self -Parent) 'chushi-bridge-launch.vbs'
    if (Test-Path $vbs) {
      $val = 'wscript.exe "' + $vbs + '"'
    } else {
      $val = 'powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $self + '"'
    }
    Set-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name 'ChuShiSmtcBridge' -Value $val
  }
} catch { }

Write-Host ''
Write-Host '  ============================ ChuShi SMTC Bridge ============================'
Write-Host "   Version  v$BRIDGE_VERSION (embedded edition, deployed by NetEase plugin)"
Write-Host "   Listen   http://127.0.0.1:$Port  (loopback only)"
Write-Host '   API      /api/state /api/cover /api/control /api/lyric /api/plugin/*'
Write-Host '   Note     Closing the NetEase window does NOT stop this bridge;'
Write-Host '            the NetEase plugin restarts/upgrades it automatically.'
Write-Host '  ============================================================================'
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

    if ($path -eq '/api/plugin/register' -and $req.HttpMethod -eq 'POST') {
      # v2.0.0: supervisor plugin self-report {role:'smtc', v:'x.y.z'}
      $j = Read-BodyJson $req
      if ($null -ne $j) {
        $r = S-Str $j 'role' 8
        $v = S-Str $j 'v' 16
        if ($r -eq 'smtc' -and $v) {
          $script:SmtcPluginVer = $v
          $script:SmtcPluginAt = Get-Date
        }
      }
      Send-Json $res @{ ok = $true }
      continue
    }

    if ($path -eq '/api/state') {
      Ensure-Fresh
      $s = $script:State
      # v2.0.0: plugins registry (supervisor plugin self-report, fresh <= 90s)
      $plugins = $null
      if ($script:SmtcPluginVer -and ((Get-Date) - $script:SmtcPluginAt).TotalSeconds -le 90) {
        $plugins = @{ smtc = [string]$script:SmtcPluginVer }
      }
      if ($s.HasSession) {
        Send-Json $res @{
          ok = $true; name = 'chushi-smtc-bridge'; version = $BRIDGE_VERSION
          track = @{
            app = $s.App; title = $s.Title; artist = $s.Artist; album = $s.Album
            playing = [bool]$s.Playing
            position = [Math]::Round([double]$s.Position, 3)
            duration = [Math]::Round([double]$s.Duration, 3)
            rate = $s.Rate
            coverRev = $s.CoverRev
          }
          ne = (Get-NeFresh)
          plugins = $plugins
        }
      } else {
        Send-Json $res @{ ok = $true; name = 'chushi-smtc-bridge'; version = $BRIDGE_VERSION; track = $null; plugins = $plugins }
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

    if ($path -eq '/api/lyric') {
      $wantRev = ''
      try { $wantRev = [string]$req.QueryString['v'] } catch { $wantRev = '' }
      if ($script:NeLyric) {
        if ($wantRev -and $wantRev -ne $script:NeLyricRev) {
          Send-Json $res @{ ok = $false; name = 'chushi-smtc-bridge'; version = $BRIDGE_VERSION; reason = 'rev-mismatch'; rev = $script:NeLyricRev }
        } else {
          Send-Json $res @{
            ok = $true; name = 'chushi-smtc-bridge'; version = $BRIDGE_VERSION
            rev = $script:NeLyricRev
            lyric = $script:NeLyric
          }
        }
      } else {
        Send-Json $res @{ ok = $false; name = 'chushi-smtc-bridge'; version = $BRIDGE_VERSION; reason = 'no-lyric' }
      }
      continue
    }

    if ($path -eq '/api/plugin/state' -and $req.HttpMethod -eq 'POST') {
      Update-NeState (Read-BodyJson $req)
      # heartbeat response may carry a pending command (backward compatible
      # with plugin v1.2.0; v1.3.0+ also polls /api/plugin/cmd every 300ms)
      $cmdResp = @{ ok = $true }
      $c = Pop-NeCmd
      if ($null -ne $c) {
        $cmdResp.cmd = [string]$c.cmd
        $cmdResp.position = [double]$c.position
        $cmdResp.title = [string]$c.title
        if ($c.id) { $cmdResp.id = [string]$c.id }
      }
      # v1.7.1 lyric self-heal: if this bridge was restarted mid-song it lost
      # the lyric payload; ask the plugin to re-push from its cache.
      try {
        if ($script:NeState -and $script:NeState.songId -gt 0 -and -not $script:NeLyricRev) {
          $cmdResp.needLyric = [long]$script:NeState.songId
        }
      } catch { }
      Send-Json $res $cmdResp
      continue
    }

    if ($path -eq '/api/plugin/cmd') {
      # v1.7.0 fast command poll (plugin hits this every 300ms while idle,
      # giving seek latency <= 300ms instead of <= 1s heartbeat piggyback)
      $c = Pop-NeCmd
      if ($null -ne $c) {
        Send-Json $res @{ ok = $true; cmd = [string]$c.cmd; position = [double]$c.position; title = [string]$c.title; id = [string]$c.id }
      } else {
        Send-Json $res @{ ok = $true }
      }
      continue
    }

    if ($path -eq '/api/plugin/lyric' -and $req.HttpMethod -eq 'POST') {
      Update-NeLyric (Read-BodyJson $req)
      Send-Json $res @{ ok = $true; rev = $script:NeLyricRev }
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
