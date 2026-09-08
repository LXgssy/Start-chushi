#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v8.0.9 交付组装：桥插件（hub 双架构重编）+ 歌词源 7.3.0 + NewTab zip
+ cshz 8.0.9 + 说明 + AllInOne + SHA256SUMS

v8.0.9 变更：
  桥 8.0.9        doSeek 读回校验 v2（InfLink 时间线第一源 + 420/1000/2200ms
                  三拍耐心 + 三态诚实上报 seekAckKnown）——拖动假失败芯片根治
  hub 8.0.9       版本链同步（无功能性变更）
  歌词源 7.3.0    eapi 信封根修（加密消息去 '?'、加密路径去 /eapi 前缀）——
                  eapi 层首次真正生效，yrc 逐字主源可达；缓存键升代 v8
  NewTab 8.0.9    seekAckKnown 透传 + 「拖动未生效」芯片只在已验证失败时亮；
                  核心引擎 seek 护航窗（sandbox.js）：回弹/歌词乱跳根治
  cshz 8.0.9      进度条悬停放大过渡 + 播放/关闭键高光渐显 + 关闭面板淡出
"""
import hashlib, zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'download/v8.0.9'
VER = '8.0.9'
LYRIC_VER = '7.3.0'
PRESET_VER = '8.0.9'
BRIDGE_DIR = ROOT / 'bridge/v8/plugins/music-bridge'
LYRIC_DIR = ROOT / 'bridge/v8/plugins/lyric-source'
OUT.mkdir(parents=True, exist_ok=True)

# ---------- 1) 桥 .plugin（zip 根部平铺，与历版同构） ----------
plugin = OUT / f'ChuShi-Music-Bridge-{VER}.plugin'
with zipfile.ZipFile(plugin, 'w', zipfile.ZIP_DEFLATED) as z:
    for name in ('manifest.json', 'index.js', 'hub.dll', 'hub.dll.x64.dll'):
        p = BRIDGE_DIR / name
        if not p.exists():
            raise SystemExit(f'缺文件: {p}')
        z.write(p, name)
print(f'  built {plugin.name} ({plugin.stat().st_size} B)')

# ---------- 2) 歌词源 .plugin（manifest + index.js 平铺） ----------
lyric = OUT / f'ChuShi-Lyric-Source-{LYRIC_VER}.plugin'
with zipfile.ZipFile(lyric, 'w', zipfile.ZIP_DEFLATED) as z:
    for name in ('manifest.json', 'index.js'):
        z.write(LYRIC_DIR / name, name)
print(f'  built {lyric.name} ({lyric.stat().st_size} B)')

# ---------- 3) NewTab zip（EXTENSION_MODE=1 产物 out/ 根平铺） ----------
out_dir = ROOT / 'out'
if not out_dir.exists():
    raise SystemExit('缺 out/（先 EXTENSION_MODE=1 npx next build）')
newtab = OUT / f'ChuShi-NewTab-v{VER}.zip'
with zipfile.ZipFile(newtab, 'w', zipfile.ZIP_DEFLATED) as z:
    for p in sorted(out_dir.rglob('*')):
        if p.is_file():
            z.write(p, p.relative_to(out_dir).as_posix())
print(f'  built {newtab.name} ({newtab.stat().st_size} B)')

# ---------- 4) cshz（build-smtc-preset.py 产物改名入列） ----------
src_cshz = ROOT / 'examples' / '初始SMTC音乐预设.cshz'
if not src_cshz.exists():
    raise SystemExit('缺 examples/初始SMTC音乐预设.cshz（先跑 build-smtc-preset.py）')
cshz = OUT / f'ChuShi-Music-Preset-{PRESET_VER}.cshz'
cshz.write_bytes(src_cshz.read_bytes())
print(f'  built {cshz.name} ({cshz.stat().st_size} B)')

# ---------- 5) 使用说明 ----------
NOTES = f'''# 「初始」v{VER} 使用说明（拖动显示三连修 + 逐字歌词 yrc 优先根修）

## 本版修了什么

| 问题 | 根因 | 修复 |
|---|---|---|
| **拖动成功了却提示「拖动未生效」** | 桥读回校验只读 audio 元素且仅两拍：元素缺席时结果恒「未知」却被当「失败」上报 | 桥 seek 读回校验 v2：InfLink 时间线第一读回源 + 三拍耐心 + 三态诚实上报（`seekAckKnown`）——未知≠失败，芯片只在验证过的真失败时亮 |
| **拖动后进度条回弹几下、等几秒才跳到目标** | 拖动后桥真值要 1~3 秒才收敛到新位置，期间每拍都把面板硬锚回旧位置 | 核心引擎 seek 护航窗：窗内忽略拖动前旧轨迹的陈旧拍，真值到目标±2s 提前确认；拖动真失败时窗口过期诚实回锚 |
| **拖动后歌词乱跳** | 同一根因（位置锚点被陈旧拍来回拽） | 同上（护航窗一并根治）；暂停/播放时的逐字歌词校准管线**原样未动** |
| **逐字歌词永远不是真逐字（yrc 不生效）** | 歌词源 eapi 加密信封带 `?` 且加密路径多 `/eapi` 前缀 → 服务端 404/空响应，eapi 层从未生效，一直降级拿 lrc | 歌词源 7.3.0 信封根修（实测修正后 yrc 正常返回）；逐字歌词恢复 **yrc 优先**，无 yrc 的歌自动回退原「时间戳对歌词」方案；本地旧缓存升代防遮蔽 |
| **悬停高光突兀 / 关闭瞬消 / 进度条放大生硬** | 无过渡 | 进度条悬停放大加缓动；播放/上一首/下一首/关闭键背景、前景、提亮全部渐显；关闭面板先淡出再收起 |

## 升级步骤（三个文件都换了，请全部更新）

1. **任务管理器结束所有网易云进程**（老规矩，防残留进程干扰）
2. 进 BetterNCM 插件目录：**替换以下两个 `.plugin`**
   - `ChuShi-Music-Bridge-{VER}.plugin`
   - `ChuShi-Lyric-Source-{LYRIC_VER}.plugin`（**本版必换**——yrc 根修在这里）
3. 「初始」页更新到 v{VER}（扩展用户覆盖安装 `ChuShi-NewTab-v{VER}.zip`）
4. 「初始」页内重新导入 `ChuShi-Music-Preset-{PRESET_VER}.cshz`（部件动效更新）
5. 启动网易云 → 面板显示 `已连接 · API v{VER}`

## 验收要点

- 拖动进度条：立即停在目标位置，无回弹、无「拖动未生效」提示，歌词直接对位
- 有逐字歌词的歌（大部分中文热歌）：逐字扫色与实际演唱逐字对齐（yrc）
- 无逐字歌词的歌：整行照常显示，行内伪逐字按时间推进（回退方案）
- 若 seek 仍异常，「初始」页控制台 `__chushiMusicBridge.debug()` 截图：
  `postTrace` 看 `recv` 标记、`cmdTrace` 看 `seek-called` 与读回结论

## 组件版本

- ChuShi Music Bridge **{VER}**（hub.dll **{VER}** 双架构：x86 主架 + x64 变体）
- ChuShi Lyric Source **{LYRIC_VER}**（eapi 信封根修，yrc 主源生效）
- 「初始」NewTab **{VER}**（插件版本门升至 {VER}；seek 护航窗在页面引擎层）
- SMTC 音乐预设 **{PRESET_VER}**（悬停动效 + 关闭淡出）
'''
notes = OUT / f'ChuShi-v{VER}-Usage-Notes.md'
notes.write_text(NOTES, encoding='utf-8')
print(f'  built {notes.name}')

# ---------- 6) SHA256SUMS + AllInOne ----------
staged = [plugin, lyric, newtab, cshz, notes]

def sha256(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()

sums = OUT / 'SHA256SUMS.txt'
with sums.open('w', encoding='utf-8') as f:
    for p in sorted(staged):
        f.write(f'{sha256(p)}  {p.name}\n')
print('  built SHA256SUMS.txt')

aio = OUT / f'ChuShi-v{VER}-AllInOne.zip'
if aio.exists():
    aio.unlink()
with zipfile.ZipFile(aio, 'w', zipfile.ZIP_DEFLATED) as z:
    for p in sorted(staged):
        z.write(p, p.name)
    z.write(sums, 'SHA256SUMS.txt')
print(f'  built {aio.name} ({aio.stat().st_size} B)')
print('\nDONE')
