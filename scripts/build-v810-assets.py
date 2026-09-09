#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v8.1.0 交付组装：桥插件（hub.dll 沿用 8.0.9 双架构，无功能性变更）
+ 歌词源 7.3.0（沿用）+ cshz 8.1.0 + 使用说明 + SHA256SUMS

v8.1.0 变更（真机录屏：歌曲正常播放但歌词 1:05↔1:06 秒级锯齿乱跳 +
面板周期性闪断成「系统媒体待接入」）：
  桥 8.1.0        位置单源化——InfLink 时间线（SMTC 上报滞后 ~1s）与元素
                  真值空缺交替补位是锯齿上游根源；现一律以 audio 元素
                  currentTime 为位置唯一源，InfLink 时间线仅元素缺席兜底
  NewTab 8.1.0    ①核心引擎回退熔断（稳态期回退 0.6~6s 拒收，连续 2 拍放行，
                  护航窗收窗 grace 6s 豁免）②feed 中间态快照保位 + 判歌
                  容错 ③smtc.ts state-stale 重探不再触发面板 offline
  cshz 8.1.0      防闪断宽限（connected 瞬断保内容亮黄灯 3s 才降级空态）
                  + 版本门 8.1.0 + 归因文案精简
"""
import hashlib, zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'download/v8.1.0'
VER = '8.1.0'
LYRIC_VER = '7.3.0'
PRESET_VER = '8.1.0'
BRIDGE_DIR = ROOT / 'bridge/v8/plugins/music-bridge'
LYRIC_DIR = ROOT / 'bridge/v8/plugins/lyric-source'
OUT.mkdir(parents=True, exist_ok=True)

# ---------- 1) 桥 .plugin（zip 根部平铺，与历版同构；hub.dll 沿用 8.0.9） ----------
plugin = OUT / f'ChuShi-Music-Bridge-{VER}.plugin'
with zipfile.ZipFile(plugin, 'w', zipfile.ZIP_DEFLATED) as z:
    for name in ('manifest.json', 'index.js', 'hub.dll', 'hub.dll.x64.dll'):
        p = BRIDGE_DIR / name
        if not p.exists():
            raise SystemExit(f'缺文件: {p}')
        z.write(p, name)
print(f'  built {plugin.name} ({plugin.stat().st_size} B)')

# ---------- 2) 歌词源 .plugin（沿用 7.3.0，本轮零改动） ----------
lyric = OUT / f'ChuShi-Lyric-Source-{LYRIC_VER}.plugin'
with zipfile.ZipFile(lyric, 'w', zipfile.ZIP_DEFLATED) as z:
    for name in ('manifest.json', 'index.js'):
        z.write(LYRIC_DIR / name, name)
print(f'  built {lyric.name} ({lyric.stat().st_size} B)')

# ---------- 3) cshz 预设包（examples/ 最新打包产物） ----------
cshz_src = ROOT / 'examples/初始SMTC音乐预设.cshz'
cshz = OUT / '初始SMTC音乐预设.cshz'
cshz.write_bytes(cshz_src.read_bytes())
print(f'  built {cshz.name} ({cshz.stat().st_size} B)')

# ---------- 4) 使用说明 ----------
readme = OUT / 'v8.1.0-更新说明.txt'
readme.write_text("""v8.1.0 更新说明（歌词乱跳 / 面板闪断 双根治）
================================================

【问题现象】（真机录屏 2026-09-09）
1. 歌曲正常播放，但歌词乱跳：进度在 1:05↔1:06 之间每秒来回锯齿，
   歌词行跟着在两段之间反复横跳。
2. 拖动进度条 seek 后，时间与歌词短暂脱节（时间已到 2:02，
   歌词却还显示拖动前段落的行）。
3. 音乐面板每约 4~5 秒整体消失成「系统媒体待接入」提示卡，
   约 2 秒后恢复，循环往复。

【根因】
1. 桥端位置双源交替：InfLink 时间线（SMTC 上报滞后约 1 秒）与
   audio 元素真值在「时间线空缺时」交替补位，桥每秒上报的位置在
   两个相差约 1 秒的源之间跳动；页面端每拍偏差 ≥0.35s 就硬锚，
   显示位置呈 1 秒锯齿，歌词行在边界处反复横跳。
2. seek 后网易云应用过程中会上报「中间态」位置快照，旧版护航窗
   对中间态直接弃窗回锚 → 时间与歌词短暂脱节。
3. 页面端「桥状态时间戳陈旧」触发全端口重探，重探失败计入掉线
   连败 → 面板判定未接入整体切空态；重探恢复后又切回，周期闪断。

【修复】
- 桥 8.1.0：位置单源化——一律以 audio 元素 currentTime（帧级连续
  真值）为位置唯一源，InfLink 时间线仅元素缺席时兜底（源恒定单一，
  不再交替）。
- NewTab 8.1.0：核心引擎新增回退熔断（稳态播放期位置倒退 0.6~6s
  的拍拒收，连续 2 拍才放行；seek 护航窗收窗后 6 秒豁免，暂停/播放
  校准管线不变）；seek 后中间态快照一律保位到护航窗过期；歌名比较
  去标点容错；桥状态陈旧重探不再触发面板掉线。
- 部件 8.1.0：连接瞬断先保内容亮黄灯「重连中…」3 秒，超过才降级
  空态——面板不再周期性整体消失。

【安装/升级（三件套版本须一致）】
1. 更新网易云插件：ChuShi-Music-Bridge-8.1.0.plugin（歌词源 7.3.0
   无变化可不动），完全退出并重启网易云。
2. 更新「初始」NewTab 到 8.1.0（网页版 gh-pages 已上线；
   BetterNCM/扩展版随 Release 包）。
3. 在「初始」⌘K 预设面板重新导入 初始SMTC音乐预设.cshz（8.1.0）。

【验证】
- 核心单测：verify-v809-core 21/21 + verify-v810-core 12/12
  （双源交替零回跳 / 连续回退诚实放行 / 收窗 grace / 中间态保位 /
  判歌容错 / 翻转放行暂停取真值）
- 链路 e2e：真实桥×真实 hub×双实例 15/15
- 歌词源信封门 11/11（yrc 主源可达不变）
""", encoding="utf-8")
print(f'  built {readme.name}')

# ---------- 5) SHA256SUMS ----------
def sha256(p: Path) -> str:
    h = hashlib.sha256()
    h.update(p.read_bytes())
    return h.hexdigest()

lines = []
for f in sorted(OUT.iterdir()):
    if f.name == 'SHA256SUMS.txt' or f.is_dir():
        continue
    lines.append(f'{sha256(f)}  {f.name}')
(OUT / 'SHA256SUMS.txt').write_text('\n'.join(lines) + '\n', encoding='utf-8')
print('  built SHA256SUMS.txt')
print('DONE v8.1.0')
