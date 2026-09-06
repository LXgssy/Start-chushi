#!/usr/bin/env python3
"""桥 v1.5.0 静态审计：括号/引号平衡、关键标记、编码、行尾"""
import re, sys

p = 'bridge/smtc/ChuShi-SMTC-Bridge.ps1'
raw = open(p, 'rb').read()
ok = True

def check(name, cond, detail=""):
    global ok
    print(("PASS " if cond else "FAIL ") + name + (f" :: {detail}" if detail else ""))
    if not cond:
        ok = False

# 编码
check("UTF-8 BOM", raw[:3] == b'\xef\xbb\xbf')
# 可解码
src = raw.decode('utf-8-sig')
# 行尾：不应有 CR（LF 文件）
check("LF 行尾（无 CR）", b'\r' not in raw)
# 括号平衡（剔除字符串与注释后粗检）
s = re.sub(r'<#[\s\S]*?#>', '', src)            # 块注释
s = re.sub(r"#.*", '', s)                        # 行注释
s = re.sub(r"'[^']*'", "''", s)                  # 单引号字符串
s = re.sub(r'"(?:[^"]|"")*"', '""', s)           # 双引号字符串
for o, c in [('{', '}'), ('(', ')'), ('[', ']')]:
    check(f"平衡 {o}{c}", s.count(o) == s.count(c), f"{s.count(o)} vs {s.count(c)}")
# 关键标记
for marker in [
    "$BRIDGE_VERSION = '1.5.0'",
    "function Test-TitleMatch",
    "$script:NeCmd = $null",
    "$script:LastSampleAt = [DateTime]::MinValue",
    "TryChangePlaybackPositionAsync($ticks)) ([System.Boolean]) } catch { $smtcOk = $false }",
    "reason = 'rev-mismatch'",
    "$cmdResp.cmd = [string]$script:NeCmd.cmd",
    "$script:PosAnchor.Base = [Math]::Max(0.0, $script:CurPos - 0.5 * $win * $r2)",
    "[double]$script:NeState.positionMs / 1000.0",
]:
    check(f"标记: {marker[:48]}", marker in src)
# 损坏残留：独立 ath] （非 [math]/[Math] 的一部分）
dmg = [m.start() for m in re.finditer(r'(?<!\[m)(?<!\[M)ath\]::', src)]
check("无残留损坏 ath]::", len(dmg) == 0, f"{len(dmg)} 处" if dmg else "")
# IsSeekAvailable 不再一票否决
check("IsSeekAvailable 不再作为硬门", "if (-not $pb.IsSeekAvailable) { return @{ ok = $false; reason = 'seek-unavailable' } }" not in src)
# Await 的 TryChange 调用存在
check("TryChange 调用存在", "TryChangePlaybackPositionAsync" in src)
print("\nRESULT:", "ALL PASS" if ok else "HAS FAILURES")
sys.exit(0 if ok else 1)
