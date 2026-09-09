#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v8.1.2 交付组装：NewTab v8.1.2（dock 选框单实例化）+ cshz 8.1.2（部件 strict
模式崩溃修复——预设包无法接入根治）+ 桥 8.1.0 / 歌词源 7.3.0（沿用）+
说明 + SHA256SUMS + AllInOne

v8.1.2 变更（用户实机两项）：
  ①「8.1.1 版本的预设包直接就没有办法接入，8.0.9 都可以」：
    部件 v8.1.0 新增的防闪断宽限里 `offSince = 0` 误写——offSince 从未声明，
    部件脚本运行在 "use strict"，每次 connected 渲染必抛 ReferenceError 且
    死在 setMode("fl") 之前 → 面板永久卡死「系统媒体待接入」空态。
    桥侧 debug 一切健康（hub connected/selftest ok/song 在放）的实锢闭环。
    修复：offT = 0（宽限计时器正确复位）。
  ②「连续快速点击切换两个 tab 栏功能时，选框动效变成液态玻璃时期」：
    dock 选框原为各按钮内条件挂载（AnimatePresence + layoutId 跨按钮交接），
    连点快于退场+弹簧收敛时新选框继承旧选框退场中的 scale/opacity 投影
    （Playwright 逐帧取证：连点期 scale 0.44~0.59 / opacity 0.11~0.46 反复泵动）。
    根治：nav 级单实例常驻选框——开面板挂载一次，切换=同一元素 x/width
    弹簧滑移（任意点击速度零交接零泵动），关闭才退场；Q 弹出场
    （跃迁帧捕获 pillPop）与 ≤450ms 快开滑移语言全保留。
"""
import hashlib, zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'download/v8.1.2'
VER = '8.1.2'
BRIDGE_VER = '8.1.0'
LYRIC_VER = '7.3.0'
PRESET_VER = '8.1.2'
BRIDGE_DIR = ROOT / 'bridge/v8/plugins/music-bridge'
LYRIC_DIR = ROOT / 'bridge/v8/plugins/lyric-source'
OUT.mkdir(parents=True, exist_ok=True)

# ---------- 1) 桥 .plugin（zip 根部平铺；hub.dll 沿用 8.0.9 双架构） ----------
plugin = OUT / f'ChuShi-Music-Bridge-{BRIDGE_VER}.plugin'
with zipfile.ZipFile(plugin, 'w', zipfile.ZIP_DEFLATED) as z:
    for name in ('manifest.json', 'index.js', 'hub.dll', 'hub.dll.x64.dll'):
        p = BRIDGE_DIR / name
        if not p.exists():
            raise SystemExit(f'缺文件: {p}')
        z.write(p, name)
print(f'  built {plugin.name} ({plugin.stat().st_size} B)')

# ---------- 2) 歌词源 .plugin（沿用 7.3.0） ----------
lyric = OUT / f'ChuShi-Lyric-Source-{LYRIC_VER}.plugin'
with zipfile.ZipFile(lyric, 'w', zipfile.ZIP_DEFLATED) as z:
    for name in ('manifest.json', 'index.js'):
        z.write(LYRIC_DIR / name, name)
print(f'  built {lyric.name} ({lyric.stat().st_size} B)')

# ---------- 3) NewTab zip（EXTENSION_MODE=1 产物，含 dock 选框单实例化） ----------
out_dir = ROOT / 'out'
if not out_dir.exists():
    raise SystemExit('缺 out/（先 EXTENSION_MODE=1 npx next build）')
main_css_feat = False
for css in (out_dir / '_next/static/chunks').glob('*.css'):
    txt = css.read_text(encoding='utf-8', errors='ignore')
    if 'dock-btn' in txt and 'pill-seg' in txt:
        main_css_feat = True
        break
if not main_css_feat:
    raise SystemExit('产物 CSS 缺 dock/pill 特征——构建内容异常，拒绝打包')
idx = (out_dir / 'index.html').read_text(encoding='utf-8')
if '"/Start-chushi/' in idx:
    raise SystemExit('index.html 含 basePath——EXPORT_MODE 产物误用，拒绝打包')
if not (out_dir / '.nojekyll').exists() or not (out_dir / 'sandbox.js').exists():
    raise SystemExit('缺 .nojekyll / sandbox.js——产物不完整')
newtab = OUT / f'ChuShi-NewTab-v{VER}.zip'
with zipfile.ZipFile(newtab, 'w', zipfile.ZIP_DEFLATED) as z:
    for p in sorted(out_dir.rglob('*')):
        if p.is_file():
            z.write(p, p.relative_to(out_dir).as_posix())
print(f'  built {newtab.name} ({newtab.stat().st_size} B)')

# ---------- 4) cshz（含部件接入修复，版本化改名） ----------
src_cshz = ROOT / 'examples' / '初始SMTC音乐预设.cshz'
if not src_cshz.exists():
    raise SystemExit('缺 examples/初始SMTC音乐预设.cshz（先跑 build-smtc-preset.py）')
cshz = OUT / f'ChuShi-Music-Preset-{PRESET_VER}.cshz'
cshz.write_bytes(src_cshz.read_bytes())
print(f'  built {cshz.name} ({cshz.stat().st_size} B)')

# ---------- 5) 使用说明 ----------
NOTES = f'''# 「初始」v{VER} 使用说明（预设包接入根治 + dock 选框连点动效根治）

## 本版修了什么

### ① v8.1.1 预设包无法接入（用户实锢：「8.1.1 版本的预设包直接就没有办法接入，8.0.9 都可以」）

| 现象 | 根因 | 修复 |
|---|---|---|
| 导入 v8.1.1 附带的 cshz 后音乐面板永久显示「系统媒体待接入」，桥侧 `debug()` 却一切健康（hub connected / selftest ok / 歌曲在放） | 部件 v8.1.0 新增防闪断宽限时误写 `offSince = 0`——变量从未声明，部件脚本运行在严格模式，**每次连接渲染必抛 ReferenceError 且死在进入完整模式之前** → 面板永久卡空态（Playwright 阴性对照实锢：旧包连抛 `offSince is not defined`，修复后正常接入） | `offT = 0`（宽限计时器正确复位）；重新导入本版 `ChuShi-Music-Preset-{PRESET_VER}.cshz` 即愈 |

### ② 快速连点 tab 栏，选框动效回退（用户实锢：「连续快速点击切换两个 tab 栏功能时，选框的切换动效会变成液态玻璃时期的切换动效」）

| 现象 | 根因 | 修复 |
|---|---|---|
| 连续快速点击两个 dock 功能时，选框反复缩小+淡出再弹回（泵动） | 选框原在各按钮内条件挂载（AnimatePresence + layoutId 跨按钮交接）：连点快于「160ms 退场 + 弹簧收敛」时，新选框继承旧选框**退场进行中**的 scale/opacity 投影（逐帧取证：scale 0.44~0.59、opacity 0.11~0.46 反复泵动） | **选框单实例化**：nav 级常驻选框，开面板挂载一次，切换=同一元素 x/width 弹簧滑移——任意点击速度零交接零泵动（逐帧复验：连点期 scale 恒 1、opacity 恒 1）；Q 弹出场、关闭缩回、≤450ms 快开滑移三段语言全保留 |

## 升级步骤

1. 「初始」页更新到 v{VER}（扩展用户覆盖安装 `ChuShi-NewTab-v{VER}.zip`；网页版 gh-pages 已同步上线）
2. 「初始」页内重新导入 `ChuShi-Music-Preset-{PRESET_VER}.cshz`（**接入修复在这里，必换**）
3. 网易云侧插件**无需动**：桥 8.1.0 / 歌词源 7.3.0 / hub 8.0.9 全部沿用
4. 面板显示 `已连接 · API v8.1.0 · InfLink-rs v3.2.11` 即正常

## 组件版本

- 「初始」NewTab **v{VER}**（dock 选框单实例化）
- SMTC 音乐预设 **{PRESET_VER}**（部件接入修复，必换）
- ChuShi Music Bridge **{BRIDGE_VER}**（沿用）
- ChuShi Lyric Source **{LYRIC_VER}**（沿用）
- InfLink-rs 3.2.11（保持启用）
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
print('\nDONE v8.1.2')
