#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v8.3.2 交付组装：歌词高斯模糊景深（浮窗+面板双渲染层）+ 动效全覆盖。

v8.3.2 变更（用户实机反馈两连）：
  ① 歌词高斯模糊景深——未播放/已播放歌词有高斯模糊：未唱 blur 2px /
    已唱 blur 1.1px / 当前行 sharp，filter .45s 同曲线过渡，与 v8.3.1
    呼吸缩放叠加 = 完整景深动效（浮窗）。
  ② 动效覆盖「初始」面板——v8.3.1 呼吸只落了浮窗，面板仍 .55s/.5s 旧
    时序且无呼吸无模糊（用户「新动效没看到」真因）；本版面板同步呼吸+
    模糊+时序，两渲染层动效语言完全一致。
  桥 8.3.1 / 歌词源 7.3.0 沿用（本版零原生改动）。
"""
import hashlib, pathlib, zipfile

ROOT = pathlib.Path('/tmp/my-project')
OUT = ROOT / 'download/v8.3.2'
PREV = ROOT / 'download/v8.3.1'
VER = '8.3.2'
BRIDGE_VER = '8.3.1'    # 沿用（本版零原生改动）
LYRIC_VER = '7.3.0'     # 沿用
PRESET_VER = '8.3.2'    # 面板歌词动效（呼吸+模糊+时序）本版重建
OUT.mkdir(parents=True, exist_ok=True)

# ---------- 0) NewTab zip：build-extension.py 规范包（防呆门内嵌） ----------
newtab = OUT / f'ChuShi-NewTab-v{VER}.zip'
if not newtab.exists():
    raise SystemExit(f'缺规范扩展包 {newtab}——先跑 EXTENSION_MODE=1 bun run build:extension + python3 scripts/build-extension.py')
with zipfile.ZipFile(newtab) as z:
    names = set(z.namelist())
    manifest = z.read('manifest.json').decode('utf-8')
    if f'"version": "{VER}"' not in manifest:
        raise SystemExit(f'NewTab zip manifest 版本非 {VER}——规范包过期，重跑 build-extension.py')
    if '"scripting"' not in manifest or '"http://*/*"' not in manifest:
        raise SystemExit('manifest 缺注入兜底权限面——拒绝')
    for must in ('ext-bg.js', 'ext-card.js', 'sandbox.js'):
        if must not in names:
            raise SystemExit(f'zip 缺 {must}——非规范包，拒绝')
    idx = z.read('index.html').decode('utf-8')
    if '<script>' in idx.replace('<script src=', '').replace('<script type=', ''):
        raise SystemExit('index.html 含内联脚本——非规范包，拒绝')
    if any(n.startswith('_next/') for n in names):
        raise SystemExit('zip 含 _next 保留名——非规范包，拒绝')
    card = z.read('ext-card.js').decode('utf-8')
    for feat in ('ChuShiLyric', 'fcard', 'chushi-card',
                 'ingestTrack', 'reconcileLines', 'posNowOf', 'coverClickBlock',
                 'seekGuard', 'backStreak',
                 'needFrame', 'sleepNow', 'visibilitychange',
                 'cglow', 'covClear', 'stepEnv', 'paintGlow',
                 'bands.length >= 100',
                 'springFrames', 'morphFrames', 'covClone', 'cloneImg',
                 'display:block;position:fixed', 'SPRING_COVER',
                 'glowRampAt', 'envNorm', 'transform:scale(1.06)', 'updateTiming',
                 # v8.3.2 歌词景深特征
                 'filter:blur(2px)', 'filter:blur(1.1px)', 'filter:blur(0)'):
        if feat not in card:
            raise SystemExit(f'ext-card.js 缺特征 {feat}——拒绝')
    for gone in ('flyCoverClone', 'animsRemoveClones', 'siteHidden', 'saveHide',
                 'type: "vis"'):
        if gone in card:
            raise SystemExit(f'ext-card.js 残留 {gone}——拒绝')
    bg = z.read('ext-bg.js').decode('utf-8')
    for feat in ('specBusy', 'broadcastSpec', 'slice(0, 128)',
                 'ensureCardInjected', 'sweepInjectAll',
                 'chrome.scripting.executeScript', 'chrome.tabs.onUpdated'):
        if feat not in bg:
            raise SystemExit(f'ext-bg.js 缺特征 {feat}——拒绝')
    hits = [n for n in names if n.startswith(('ext-script-', 'next/'))]
    ver_hit = False
    for n in hits:
        try:
            if f'"{VER}"' in z.read(n).decode('utf-8', errors='ignore'):
                ver_hit = True
                break
        except Exception:
            pass
    if not ver_hit:
        raise SystemExit(f'宿主 bundle 缺 CLIENT_VER {VER}——smtc.ts 未重构建，拒绝')
print(f'  verified {newtab.name} ({newtab.stat().st_size} B)：manifest {VER} + 歌词景深三档模糊全过')

# ---------- 1) cshz 8.3.2（面板歌词动效——本版核心交付之一） ----------
src_cshz = ROOT / 'examples' / '初始SMTC音乐预设.cshz'
if not src_cshz.exists():
    raise SystemExit('缺 examples/初始SMTC音乐预设.cshz——先跑 python3 scripts/build-smtc-preset.py')
cshz = OUT / f'ChuShi-Music-Preset-{PRESET_VER}.cshz'
cshz.write_bytes(src_cshz.read_bytes())
with zipfile.ZipFile(cshz) as z:
    m = z.read('manifest.json').decode('utf-8')
    for feat in ('csGlowBtn', 'csFloatBtn', 'beatFrame', 'bandAvg',
                 # v8.3.2 面板歌词动效与浮窗对齐
                 'transform:scale(1.06)', 'filter:blur(2px)', 'filter:blur(1.1px)',
                 'transform .45s var(--ez)', 'filter .45s var(--ez)'):
        if feat not in m:
            raise SystemExit(f'cshz 缺特征 {feat}——面板动效未入包，拒绝')
print(f'  verified {cshz.name} ({cshz.stat().st_size} B)：面板呼吸+模糊+时序全过')

# ---------- 2) 桥 .plugin（沿用 8.3.1 + 校验） ----------
plugin = OUT / f'ChuShi-Music-Bridge-{BRIDGE_VER}.plugin'
plugin.write_bytes((PREV / f'ChuShi-Music-Bridge-{BRIDGE_VER}.plugin').read_bytes())
with zipfile.ZipFile(plugin) as z:
    mf = z.read('manifest.json').decode('utf-8')
    if f'"version": "{BRIDGE_VER}"' not in mf:
        raise SystemExit('桥 manifest 版本非 8.3.1——拒绝')
    idxjs = z.read('index.js').decode('utf-8')
    for feat in ("VER = '8.3.1'", 'drainCmds', 'DRAIN_MS = 200'):
        if feat not in idxjs:
            raise SystemExit(f'桥 index.js 缺特征 {feat!r}——拒绝')
    exe = z.read('chushi-spectrum.exe')
    if b'self exit' in exe:
        raise SystemExit('桥 spectrum 残留空闲自退——常驻律被回退，拒绝')
    h = hashlib.md5(z.read('hub.dll')).hexdigest()
    if h == '07011f2c5aa6949b459eff8e84245c2f':
        raise SystemExit('hub.dll md5 = 8.2.5 基准——keeper 政策未换血，拒绝')
print(f'  carried {plugin.name} ({plugin.stat().st_size} B)：hub.dll {h[:12]}（keeper 常驻律）')

# ---------- 3) 歌词源 .plugin（沿用 7.3.0） ----------
lyric = OUT / f'ChuShi-Lyric-Source-{LYRIC_VER}.plugin'
lyric.write_bytes((PREV / f'ChuShi-Lyric-Source-{LYRIC_VER}.plugin').read_bytes())
print(f'  carried {lyric.name} ({lyric.stat().st_size} B)')

# ---------- 4) SHA256SUMS（四件二进制） ----------
import os
sums = []
for f in sorted(os.listdir(OUT)):
    p = OUT / f
    if p.is_file() and f != 'SHA256SUMS.txt':
        sums.append(hashlib.sha256(p.read_bytes()).hexdigest() + '  ' + f)
(OUT / 'SHA256SUMS.txt').write_text('\n'.join(sums) + '\n', encoding='utf-8')
print('  SHA256SUMS.txt x', len(sums))

# ---------- 5) 使用说明（仓库名中文 + 发布资产 ASCII 双名，CJK 剥离律） ----------
NOTES = f'''# 「初始」v{VER} 使用说明（歌词高斯模糊景深 + 动效覆盖浮窗与面板）

## 本版修了什么（全部来自你的实机反馈）

### ① 歌词高斯模糊景深（未播放 / 已播放歌词有高斯模糊）
未唱的行 blur 2px、已唱的行 blur 1.1px、当前行完全清晰（sharp）——行切换
时新行「聚焦」浮现，与呼吸缩放叠加，就是完全体歌词该有的景深感。filter
与缩放同曲线（.45s）过渡，不跳变。

### ② 歌词动效覆盖浮窗和「初始」面板（两渲染层完全一致）
上版呼吸动效只落了浮窗，「初始」面板还是旧时序（滚动 .55s / 行色 .5s）
且没有呼吸与模糊——这就是你「新动效没看到」的原因。本版面板同步：
- 当前行放大 1.06 / 邻行缩小 0.94 呼吸过渡
- 三档高斯模糊景深（未唱 2px / 已唱 1.1px / 当前行清晰）
- 滚动 .55s→.45s、行色 .5s→.35s（入场行滚动途中就亮）

## 升级步骤（两件必换）

1. 「初始」页更新到 v{VER}（覆盖安装 `ChuShi-NewTab-v{VER}.zip`：**删净旧
   解压目录** → 解压新包 → 扩展页点刷新）
2. **SMTC 音乐预设更新到 {PRESET_VER}**（面板动效在本版预设里，旧预设
   8.2.9 不会有效果；⌘K → 预设 → 导入新 cshz 覆盖）
3. 桥 8.3.1 / 歌词源 7.3.0 **沿用无需动**

## 组件版本

- 「初始」NewTab **v{VER}**（浮窗歌词景深 + 呼吸）
- SMTC 音乐预设 **{PRESET_VER}**（面板歌词景深 + 呼吸 + 时序对齐）
- ChuShi Music Bridge **{BRIDGE_VER}**（沿用）
- ChuShi Lyric Source {LYRIC_VER}（沿用）

## 装完怎么自查

- 完全体浮窗：非当前行有毛玻璃般的模糊、当前行清晰且略大，行切换时
  「聚焦」跟着走
- 「初始」音乐面板：效果与浮窗一致（呼吸 + 模糊 + 利落的滚动）
- 已唱过的行比未唱的行更清晰一点（1.1px vs 2px 的景深层次）
'''
(OUT / f'使用说明-v{VER}.md').write_text(NOTES, encoding='utf-8')
(OUT / f'ChuShi-v{VER}-Usage-Notes.md').write_text(NOTES, encoding='utf-8')
print(f'  使用说明-v{VER}.md + ChuShi-v{VER}-Usage-Notes.md（ASCII 资产名）')

# ---------- 6) AllInOne 合并包（六件平铺，说明用 ASCII 名——GitHub 资产律） ----------
allin = OUT / f'ChuShi-v{VER}-AllInOne.zip'
with zipfile.ZipFile(allin, 'w', zipfile.ZIP_DEFLATED) as z:
    for name in (f'ChuShi-NewTab-v{VER}.zip', f'ChuShi-Music-Bridge-{BRIDGE_VER}.plugin',
                 f'ChuShi-Music-Preset-{PRESET_VER}.cshz', f'ChuShi-Lyric-Source-{LYRIC_VER}.plugin',
                 'SHA256SUMS.txt', f'ChuShi-v{VER}-Usage-Notes.md'):
        z.write(OUT / name, name)
print(f'  {allin.name} ({allin.stat().st_size} B)')
print('DELIVERY OK')
