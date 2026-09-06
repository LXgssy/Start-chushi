<#
.SYNOPSIS
  「初始」SMTC 桥 v1.5.0 —— 把 Windows 系统媒体会话（SMTC）暴露给本机 HTTP

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

  v1.2.0 新增：网易云「初始歌词源」BetterNCM 插件的数据接入（插件在网易云客户端内
  主动 POST 推送到本桥，桥只做内存缓存与转发，不落盘）：
    POST /api/plugin/state  网易云精确播放状态（songId/positionMs/durationMs/pic…）
    POST /api/plugin/lyric  当前曲目歌词（yrc 逐字 / lrc / tlyric / ytlrc）
    GET  /api/lyric         宿主页面拉取歌词（?rev= 变化检测）
    GET  /api/state         快照新增 ne 字段（网易云状态，≤5s 新鲜度才附带）
  用途：SMTC 时间轴缺失/停滞时用插件精确进度兑底；SMTC 封面读不到时用插件 picUrl
  兑底；歌词逐字卡拉 OK 需要 songId 与 yrc——这些只有网易云客户端内部拿得到。

  v1.3.0 根治：播放位置时钟补偿。SMTC 的 TimelineProperties.Position 只在播放器
  主动上报时刷新（网易云实测：整首歌期间 Position 钉死不前进），按 SMTC 设计
  消费端应以 LastUpdatedTime 为基准自行插值。桥在采样时直接补齐：raw Position /
  LastUpdatedTime / Playing 任一变化即重置墙钟锚点，其间 /api/state 的 position
  按墙钟 × 速率推进 —— 网页端无需任何补偿即可拿到平滑前进的进度。

  v1.4.0 根治：暂停/恢复归零。v1.3.0 在锚点重置时一律取 raw Position 作新基準，
  而网易云的 raw Position 整首歌钉死在 0 —— 暂停（Playing 变化触发重锚）瞬间
  进度归零、恢复后从 0 重头计数（v2.0.0 真机录屏实锤：1:04 → 0:00）。现在：
  曲目未变时的锚点重置改用「上一拍补偿计算出的连续位置」（暂停=无缝冻结在
  当前进度，恢复=从冻结处续接）；仅切歌（曲目键变化）才回到 raw Position。
  另：seek 命令成功后立即把锚点设为请求位置（网易云不刷新 SMTC 时间轴时，
  桥自己从新位置继续插值，网页端拖动不再被旧基準拽回）。

  v1.5.0 根治（真机第 6 轮录屏取证后）：
    ① 插件真值锚定 —— 网易云插件在客户端内直读播放器（el.currentTime 帧级），
       每秒心跳把插值基準重锚到真值：暂停/恢复的检测滞后不再累积成永久偏移
      （v1.4.0 连续位置锚点在暂停检测晚一拍时多算 ≤1 采样窗，多次暂停逐次累积，
       真机表现即「暂停再继续后歌词对不上」）；插件在场且曲目匹配时真值优先，
       SMTC 连续性插值只对无插件场景兑底。
    ② seek 不再被 IsSeekAvailable 一票否决 —— 网易云 SMTC 常报 IsSeekAvailable=false
      （真机实测拖动 6 次全部秒弹回），现在照发 TryChangePlaybackPositionAsync 取真实
       返回值；同时把 seek 命令经心跳应答下发插件（el.currentTime 直写，下一拍
       PlayProgress/Seek 事件回报真值自动验证）。二者任一生效即 ok。
    ③ /api/lyric 尊重 ?v= 参数：桥内存歌词 rev 与请求不符时明确拒绝（rev-mismatch），
       防止旧歌歌词顶替新歌请求（切歌窗口 1-4s 内新旧歌歌词错挂）。
    ④ 暂停半窗补偿（无插件场景）：暂停检测晚一拍（≤采样间隔），按均匀假设把
       连续位置回退半个不确定性窗口，期望残差归零。

  v1.6.0 根治（真机第 7 轮反馈：面板能拖但网易云本体不动 / 暂停恢复仍累积漂移 /
  桥要并入扩展不再多开窗口）：
    ① seek 命令带 id（seekId）随心跳下发插件；插件按「内部 dispatch API
       （playing/setPlayingPosition）→ el.currentTime 兑底」双级执行并实测校验，
       结果以 seekAck 随心跳回传，桥透传给宿主做快速确认与诚实弹回。
    ② 插件心跳捎带 v（插件版本），随 ne 字段透传 —— 面板页脚可诊断
       「插件在场/版本 + 桥版本」，多组件版本漂移一眼可见。
    ③ 自愈升级：若用户已注册开机自启（Run 键存在），每次启动自动把键值重写
       到当前这份桥（新包解压后启动一次即完成自启升级，无需重跑 bat）。
    ④ 升级接管：端口被占时识别占用者，若为本桥旧实例（命令行匹配）则结束它
       并重试绑定 —— 手动启动新桥不再被老自启实例拦住。
    ⑤ 附 bridge-hidden.vbs（纯 ASCII）：开机自启改经 wscript 静默拉起，
       登录后零窗口零闪烁；手动「启动SMTC桥.bat」仍保留可见窗口供诊断。

.NOTES
  v1.1.0：启动器 bat 改为 ANSI(GBK) 编码发布（UTF-8+chcp 会触发 cmd 重读错位乱码）；
  v1.2.0：新增插件推送通道（见上）；
  v1.3.0：播放位置时钟补偿（LastUpdatedTime 插值，见上）；
  v1.4.0：暂停/恢复连续位置锚点 + seek 重锚（见上）；
  v1.5.0：插件真值锚定 + seek 插件直通 + 歌词 rev 校验 + 暂停半窗补偿（见上）；
  v1.6.0：seekId/seekAck/v 透传 + 自愈自启 + 旧实例接管 + hidden vbs（见上）。
  本文件必须以 UTF-8 with BOM 保存（PS 5.1 对无 BOM 文件按 ANSI 解析，中文全乱码）。
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

$BRIDGE_VERSION = '1.6.0'

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

# ---------- 网易云插件通道（v1.2.0：「初始歌词源」BetterNCM 插件推送 → 内存缓存） ----------
# NeState：精确播放状态（songId/positionMs/durationMs/playing/pic…）；插件 1s 心跳
# NeLyric：当前曲目歌词（yrc/lrc/tlyric/ytlrc）；切歌时插件推送
# 两者均带 ReceivedAt，/api/state 只附带 ≤5s 新鲜的 NeState（插件被关后自动失效）
$script:NeState = $null
$script:NeLyric = $null
$script:NeLyricRev = ''
$script:NeStateAt = [DateTime]::MinValue
$script:NeLyricAt = [DateTime]::MinValue

# 播放位置墙钟锚点（v1.3.0 引入 / v1.4.0 重写重置策略）：
#   曲目键变化（切歌）→ Base = raw Position（新曲目从 raw 起步）；
#   其余元组变化（暂停/恢复/LastUpdatedTime 刷新）→ Base = 上一拍连续位置
#   CurPos（暂停无缝冻结、恢复无缝续接——网易云 raw 恒 0，绝不能回退到 raw）；
# 其间 position = Base + 墙钟差 × 速率（playing 时）
$script:PosAnchor = @{
  Key = ''; Base = 0.0; At = [DateTime]::UtcNow
  Raw = -1.0; Lu = [DateTime]::MinValue; Playing = $false
}
# 上一拍输出的连续位置（v1.4.0：锚点重置时的续接基准）
$script:CurPos = 0.0
# v1.5.0：上一次成功采样时刻（暂停半窗补偿的不确定性窗口）
$script:LastSampleAt = [DateTime]::MinValue
# v1.5.0：待下发插件命令（seek 直通；插件心跳应答捎带，消费即清，5s 过期）
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
  # v1.6.0：插件版本 + 最近 seek 执行结果（seekAck）透传（宿主做 seek 快速确认/诚实弹回）
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
  # 歌词版本：非空 = 桥有当前曲歌词可拉（宿主据此决定是否 GET /api/lyric）
  $st.lyricRev = $script:NeLyricRev
  return $st
}

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

# v1.5.0：SMTC 标题 ↔ 插件标题匹配（与宿主 trackMatchesNe 同律）：
# 双向包含 → 归一化（去空白/常见标点）后再双向包含
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

    # ---------- 播放位置时钟补偿（v1.3.0 引入 / v1.4.0 重写重置策略）----------
    # 先用现有锚点算本拍连续位置 CurPos，再判断锚点三元组是否变化：
    # 曲目键变 → Base=raw（新曲目）；否则 → Base=CurPos（暂停冻结/恢复续接，见 .DESCRIPTION）。
    $rawPos = [Math]::Max(0.0, $tl.Position.TotalSeconds)
    $lu = $tl.LastUpdatedTime.UtcDateTime
    $aKey = [string]$sess.SourceAppUserModelId + '|' + $title
    $anchorChanged = ($aKey -ne $script:PosAnchor.Key -or $rawPos -ne $script:PosAnchor.Raw -or `
      $lu -ne $script:PosAnchor.Lu -or $script:State.Playing -ne $script:PosAnchor.Playing)
    if ($anchorChanged) {
      if ($aKey -ne $script:PosAnchor.Key) { $script:PosAnchor.Base = $rawPos }
      elseif (-not $script:State.Playing -and $script:PosAnchor.Playing) {
        # v1.5.0 暂停半窗补偿：暂停检测晚一拍（≤采样间隔），连续位置含这段多算；
        # 按均匀假设回退半个不确定性窗口（期望残差归零；插件真值在场时本值会被覆盖）
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
    # ---------- v1.5.0 插件真值锚定 ----------
    # 网易云插件在客户端内直读播放器（el.currentTime，帧级真值），每秒心跳重锚：
    # 暂停/恢复/微 seek 的插值漂移不再累积（SMTC 连续性只对无插件场景兑底）。
    if ($null -ne $script:NeState -and (Test-TitleMatch $script:State.Title $script:NeState.title) -and `
        [double]$script:NeState.positionMs -gt 0 -and `
        ((Get-Date) - $script:NeStateAt).TotalSeconds -le 5) {
      $neSec = [double]$script:NeState.positionMs / 1000.0
      $neAge = ((Get-Date) - $script:NeStateAt).TotalSeconds
      if ($neAge -lt 0) { $neAge = 0 }
      if ($script:NeState.playing) {
        $r3 = $script:State.Rate; if ($r3 -le 0) { $r3 = 1.0 }
        $neSec = $neSec + $neAge * $r3
      }
      $neDur = [double]$script:NeState.durationMs / 1000.0
      if ($neDur -le 0) { $neDur = $script:State.Duration }
      if ($neDur -gt 0 -and $neSec -gt $neDur) { $neSec = $neDur }
      if ($neSec -lt 0) { $neSec = 0.0 }
      $posSec = $neSec
    }
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
        # v1.5.0：不再以 IsSeekAvailable 一票否决（网易云实测报 false 但真机时间轴
        # 本就不可信），照发 TryChangePlaybackPositionAsync 取真实返回值
        $sec = [double]$PositionSec
        if ($sec -lt 0) { $sec = 0 }
        $ticks = [long]([Math]::Round($sec * 10000000))
        $smtcOk = $false
        try { $smtcOk = Await ($sess.TryChangePlaybackPositionAsync($ticks)) ([System.Boolean]) } catch { $smtcOk = $false }
        # 同时把 seek 经心跳应答下发插件（内部 API 阶梯执行——SMTC 拒绝/静默忽略时
        # 的可靠直通；插件实测校验后以 seekAck 回报）；v1.6.0 命令带 id 供插件
        # seekAck 与宿主快速确认配对
        $neT = $false
        if ($null -ne $script:NeState) { $neT = Test-TitleMatch $script:State.Title $script:NeState.title }
        if ($null -ne $script:NeState -and $neT -and ((Get-Date) - $script:NeStateAt).TotalSeconds -le 8) {
          $seekId = [System.Guid]::NewGuid().ToString('N').Substring(0, 12)
          $script:NeCmd = @{ cmd = 'seek'; position = $sec; title = [string]$script:NeState.title; id = $seekId; at = [DateTime]::UtcNow }
        }
        if ($smtcOk) {
          # v1.4.0：seek 成功即重置锚点到请求位置（网易云常不刷新 SMTC 时间轴，
          # 不重锚则下一拍补偿仍从旧基準推进，网页端拖动会被拽回原处）
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
  # v1.6.0 升级接管：端口被占时识别占用者，若为本桥旧实例（命令行匹配本脚本）
  # 则结束它并重试一次 —— 手动启动新桥不再被老自启实例拦住；其他程序占用则照旧退出
  $killed = $false
  try {
    $conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    foreach ($c in @($conns)) {
      try {
        $procId = [int]$c.OwningProcess
        if ($procId -le 0 -or $procId -eq $PID) { continue }
        $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$procId" -ErrorAction SilentlyContinue
        if ($proc -and ([string]$proc.CommandLine) -match 'ChuShi-SMTC-Bridge\.ps1') {
          Write-Host "[初始SMTC桥] 发现旧版桥实例（PID $procId），升级接管中…" -ForegroundColor Yellow
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
      Write-Host '[初始SMTC桥] 旧实例已接管，绑定成功。' -ForegroundColor Green
    } catch {
      Write-Host "[初始SMTC桥] 端口 $Port 绑定失败（接管后仍不可用，请稍后重试或改 -Port 参数）。" -ForegroundColor Yellow
      exit 1
    }
  } else {
    Write-Host "[初始SMTC桥] 端口 $Port 绑定失败（被其他程序占用；如确定是旧桥请先关闭它）。" -ForegroundColor Yellow
    exit 1
  }
}

# ---------- v1.6.0 自愈自启：已注册开机自启的用户，每次启动自动把 Run 键
# 重写到当前这份桥（新包解压 → 启动一次 → 自启指向新包，版本漂移不再发生）；
# 未注册过自启的用户不受影响（不静默替用户开自启） ----------
try {
  $runKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
  $existing = Get-ItemProperty -Path $runKey -Name 'ChuShiSmtcBridge' -ErrorAction SilentlyContinue
  if ($null -ne $existing) {
    $self = $MyInvocation.MyCommand.Path
    if ($self) {
      $vbs = Join-Path (Split-Path $self -Parent) 'bridge-hidden.vbs'
      if (Test-Path $vbs) {
        $val = 'wscript.exe "' + $vbs + '"'
      } else {
        $val = 'powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $self + '"'
      }
      Set-ItemProperty -Path $runKey -Name 'ChuShiSmtcBridge' -Value $val
      Write-Host "[初始SMTC桥] 开机自启已自愈升级到当前版本。" -ForegroundColor DarkCyan
    }
  }
} catch { }

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
            position = [Math]::Round([double]$s.Position, 3)
            duration = [Math]::Round([double]$s.Duration, 3)
            rate = $s.Rate
            coverRev = $s.CoverRev
          }
          ne = (Get-NeFresh)
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

    if ($path -eq '/api/lyric') {
      # v1.5.0：?v= 与桥内存歌词 rev 不符时明确拒绝（防旧歌歌词顶替新歌请求——
      # 宿主收到 rev-mismatch 即重试等待新词到位）
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
      # v1.5.0：心跳应答捎带待执行命令（seek 直通）；消费即清，5s 过期
      $cmdResp = @{ ok = $true }
      if ($null -ne $script:NeCmd) {
        if (((Get-Date) - $script:NeCmd.at).TotalSeconds -gt 5) { $script:NeCmd = $null }
        else {
          $cmdResp.cmd = [string]$script:NeCmd.cmd
          $cmdResp.position = [double]$script:NeCmd.position
          $cmdResp.title = [string]$script:NeCmd.title
          if ($script:NeCmd.id) { $cmdResp.id = [string]$script:NeCmd.id }
          $script:NeCmd = $null
        }
      }
      Send-Json $res $cmdResp
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
