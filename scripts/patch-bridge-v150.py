#!/usr/bin/env python3
"""桥 v1.5.0 结构补丁：Test-TitleMatch / 插件真值锚定 / 暂停半窗 / seek 直通 / lyric rev / 心跳命令"""
p = 'bridge/smtc/ChuShi-SMTC-Bridge.ps1'
src = open(p, 'r', encoding='utf-8-sig').read()

def rep(old, new):
    global src
    assert old in src, f"ANCHOR NOT FOUND: {old[:70]!r}"
    assert src.count(old) == 1, f"ANCHOR NOT UNIQUE: {old[:70]!r}"
    src = src.replace(old, new)

# ---------- 1. Test-TitleMatch（标题匹配：双向包含 + 归一化包含，与宿主同律） ----------
rep(
    "function Update-MediaState {",
    """# v1.5.0：SMTC 标题 ↔ 插件标题匹配（与宿主 trackMatchesNe 同律）：
# 双向包含 → 归一化（去空白/常见标点）后再双向包含
function Test-TitleMatch([string]$A, [string]$B) {
  if (-not $A -or -not $B) { return $false }
  $a = $A.Trim().ToLowerInvariant(); $b = $B.Trim().ToLowerInvariant()
  if ($a -eq $b) { return $true }
  if ($a.Contains($b) -or $b.Contains($a)) { return $true }
  $re = '[\\s\\-\\_\\u00b7\\u30fb()\\uff08\\uff09\\[\\]\\u3010\\u3011\\u300c\\u300d\\u300e\\u300f,\\uff0c\\u3002\\u3001!\\uff01?\\uff1f~\\uff5e\\''\\"]'
  $a2 = [regex]::Replace($a, $re, ''); $b2 = [regex]::Replace($b, $re, '')
  if ($a2 -and $b2 -and ($a2.Contains($b2) -or $b2.Contains($a2))) { return $true }
  return $false
}

function Update-MediaState {""",
)

# ---------- 2. Update-MediaState 开头：记录上一拍采样时刻（半窗补偿窗口） ----------
rep(
    "function Update-MediaState {\n  $script:LastPoll = Get-Date",
    "function Update-MediaState {\n  $prevSampleAt = $script:LastSampleAt\n  $script:LastSampleAt = Get-Date\n  $script:LastPoll = $script:LastSampleAt",
)

# ---------- 3. 锚点重置：暂停半窗补偿 ----------
rep(
    """    if ($anchorChanged) {
      if ($aKey -ne $script:PosAnchor.Key) { $script:PosAnchor.Base = $rawPos }
      else { $script:PosAnchor.Base = $script:CurPos }""",
    """    if ($anchorChanged) {
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
      else { $script:PosAnchor.Base = $script:CurPos }""",
)

# ---------- 4. 插件真值锚定（SMTC 连续性 → 真值覆盖） ----------
rep(
    """    $posSec = $script:PosAnchor.Base
    if ($script:State.Playing) {
      $el = ([DateTime]::UtcNow - $script:PosAnchor.At).TotalSeconds
      if ($el -gt 0 -and $el -lt 21600) { $posSec = $script:PosAnchor.Base + $el * $script:State.Rate }
    }
    if ($script:State.Duration -gt 0 -and $posSec -gt $script:State.Duration) { $posSec = $script:State.Duration }
    if ($posSec -lt 0) { $posSec = 0.0 }
    $script:CurPos = $posSec""",
    """    $posSec = $script:PosAnchor.Base
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
    $script:CurPos = $posSec""",
)

# ---------- 5. seek 重写：不再被 IsSeekAvailable 否决 + 插件直通 ----------
rep(
    """      'seek'  {
        if (-not $pb.IsSeekAvailable) { return @{ ok = $false; reason = 'seek-unavailable' } }
        $sec = [double]$PositionSec
        if ($sec -lt 0) { $sec = 0 }
        $ticks = [long]([math]::Round($sec * 10000000))
        $null = Await ($sess.TryChangePlaybackPositionAsync($ticks)) ([System.Boolean])
        # v1.4.0：seek 成功即重置锚点到请求位置（网易云常不刷新 SMTC 时间轴，
        # 不重锚则下一拍补偿仍从旧基準推进，网页端拖动会被拽回原处）
        $script:PosAnchor.Base = $sec
        $script:PosAnchor.At = [DateTime]::UtcNow
        $script:CurPos = $sec
        return @{ ok = $true }
      }""",
    """      'seek'  {
        # v1.5.0：不再以 IsSeekAvailable 一票否决（网易云实测报 false 但真机时间轴
        # 本就不可信），照发 TryChangePlaybackPositionAsync 取真实返回值
        $sec = [double]$PositionSec
        if ($sec -lt 0) { $sec = 0 }
        $ticks = [long]([math]::Round($sec * 10000000))
        $smtcOk = $false
        try { $smtcOk = Await ($sess.TryChangePlaybackPositionAsync($ticks)) ([System.Boolean]) } catch { $smtcOk = $false }
        # 同时把 seek 经心跳应答下发插件（el.currentTime 直写——SMTC 拒绝/静默忽略时
        # 的可靠直通；插件下一拍 PlayProgress/Seek 事件回报真值自动验证）
        $neT = $false
        if ($null -ne $script:NeState) { $neT = Test-TitleMatch $script:State.Title $script:NeState.title }
        if ($null -ne $script:NeState -and $neT -and ((Get-Date) - $script:NeStateAt).TotalSeconds -le 8) {
          $script:NeCmd = @{ cmd = 'seek'; position = $sec; title = [string]$script:NeState.title; at = [DateTime]::UtcNow }
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
      }""",
)

# ---------- 6. /api/lyric 尊重 ?v= ----------
rep(
    """    if ($path -eq '/api/lyric') {
      if ($script:NeLyric) {
        Send-Json $res @{
          ok = $true; name = 'chushi-smtc-bridge'; version = $BRIDGE_VERSION
          rev = $script:NeLyricRev
          lyric = $script:NeLyric
        }
      } else {
        Send-Json $res @{ ok = $false; name = 'chushi-smtc-bridge'; version = $BRIDGE_VERSION; reason = 'no-lyric' }
      }
      continue
    }""",
    """    if ($path -eq '/api/lyric') {
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
    }""",
)

# ---------- 7. 心跳应答捎带插件命令 ----------
rep(
    """    if ($path -eq '/api/plugin/state' -and $req.HttpMethod -eq 'POST') {
      Update-NeState (Read-BodyJson $req)
      Send-Json $res @{ ok = $true }
      continue
    }""",
    """    if ($path -eq '/api/plugin/state' -and $req.HttpMethod -eq 'POST') {
      Update-NeState (Read-BodyJson $req)
      # v1.5.0：心跳应答捎带待执行命令（seek 直通）；消费即清，5s 过期
      $cmdResp = @{ ok = $true }
      if ($null -ne $script:NeCmd) {
        if (((Get-Date) - $script:NeCmd.at).TotalSeconds -gt 5) { $script:NeCmd = $null }
        else {
          $cmdResp.cmd = [string]$script:NeCmd.cmd
          $cmdResp.position = [double]$script:NeCmd.position
          $cmdResp.title = [string]$script:NeCmd.title
          $script:NeCmd = $null
        }
      }
      Send-Json $res $cmdResp
      continue
    }""",
)

with open(p, 'w', encoding='utf-8-sig', newline='') as f:
    f.write(src)
print('PATCH OK, all 7 anchors applied')
