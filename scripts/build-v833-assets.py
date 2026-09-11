#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v8.3.3 交付组装：高光归位（封面底下）+ 模糊防重置（done 提层+行界滞回门）
+ 新标签页焦点归位。桥 8.3.1 / 歌词源 7.3.0 沿用（本版零原生改动）。"""
import hashlib, pathlib, zipfile

ROOT = pathlib.Path('/tmp/my-project')
OUT = ROOT / 'download/v8.3.3'
PREV = ROOT / 'download/v8.3.2'
VER = '8.3.3'
BRIDGE_VER = '8.3.1'    # 沿用（本版零原生改动）
LYRIC_VER = '7.3.0'     # 沿用
PRESET_VER = '8.3.3'    # 面板 done 提层 + 高光归位，本版重建
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
                 'filter:blur(2px)', 'filter:blur(1.1px)', 'filter:blur(0)',
                 # v8.3.3 高光归位 + 模糊防重置（提层+滞回门）
                 'will-change:transform,filter', '高光归位律',
                 'GATE_MS', 'gPend', 'lastHardAt'):
        if feat not in card:
            raise SystemExit(f'ext-card.js 缺特征 {feat}——拒绝')
    for gone in ('flyCoverClone', 'animsRemoveClones', 'siteHidden', 'saveHide',
                 'type: "vis"', 'c.img.style.filter'):
        if gone in card:
            raise SystemExit(f'ext-card.js 残留 {gone}——拒绝')
    sb = z.read('sandbox.js').decode('utf-8')
    for feat in ('gateFrame', 'GATE_MS', 'guard &&', 'now(lineMode)'):
        if feat not in sb:
            raise SystemExit(f'sandbox.js 缺特征 {feat}——宿主滞回门未入包，拒绝')
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
print(f'  verified {newtab.name} ({newtab.stat().st_size} B)：manifest {VER} + 归位/提层/滞回门全过')

# ---------- 1) cshz 8.3.3（面板 done 提层 + 高光归位） ----------
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
                 'transform .45s var(--ez)', 'filter .45s var(--ez)',
                 # v8.3.3 done 提层 + 高光归位
                 'will-change:transform,filter', '0.30 + pb * 0.72'):
        if feat not in m:
            raise SystemExit(f'cshz 缺特征 {feat}——面板未入包，拒绝')
    if 'picImgEl.style.filter' in m:
        raise SystemExit('cshz 封面滤镜残留——高光归位律未落地，拒绝')
print(f'  verified {cshz.name} ({cshz.stat().st_size} B)：面板提层+辉光归位全过')

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

# ---------- 4) SHA256SUMS（显式四件二进制——目录扫描会混入陈旧文件，禁止回退） ----------
sums = []
for fn in (f'ChuShi-NewTab-v{VER}.zip', f'ChuShi-Music-Preset-{PRESET_VER}.cshz',
           f'ChuShi-Music-Bridge-{BRIDGE_VER}.plugin', f'ChuShi-Lyric-Source-{LYRIC_VER}.plugin'):
    p = OUT / fn
    if not p.exists():
        raise SystemExit(f'缺 {fn}——组装顺序断裂，拒绝')
    sums.append(hashlib.sha256(p.read_bytes()).hexdigest() + '  ' + fn)
(OUT / 'SHA256SUMS.txt').write_text('\n'.join(sums) + '\n', encoding='utf-8')
print('  SHA256SUMS.txt x', len(sums))

# ---------- 5) 使用说明（仓库名中文 + 发布资产 ASCII 双名，CJK 剥离律） ----------
NOTES = f'''# 「初始」v{VER} 使用说明（高光归位 + 模糊防重置 + 新标签页焦点归位）

## 本版修了什么（全部来自你的实机反馈）

### ① 高光归位：高光只在封面底下，封面本身不再发亮
上一版把「高光明显」做成了封面图变亮（brightness/saturate 滤镜）——方向
错了。本版封面滤镜整体退役：封面图片恒定不动，律动能量全部改走封面
**背后**的光晕层（浮窗与「初始」面板同律），低音时光晕从封面四周更亮地
晕出来，增益比上版更足（弱歌也拳拳到肉）。

### ② 上一句歌词的模糊不再「重置」
你反馈的「切下一句时上一句的模糊有个重置效果」根修，双管齐下：
- 已唱行常驻合成层——动画结束瞬间的重新栅格化（模糊质感突然变一下）
  彻底消灭；
- 行界滞回门——位置信号回跳会让行号翻转（上一行刚糊又要点亮再糊一遍），
  现在前进行照旧秒切，后退/间奏判定需持续 650ms 才生效，拖动进度条
  依然零延迟。浮窗、「初始」面板、宿主预计算层三层同修。

### ③ 新开「初始」标签页不再聚焦网址搜索栏
Chrome 开新标签页默认把焦点交给地址栏；现在页面挂载后立刻把焦点偷回
页面——直接敲字照样触发搜索（type-to-search），不用先点一下页面。

## 升级步骤（两件必换）

1. 「初始」页更新到 v{VER}（覆盖安装 `ChuShi-NewTab-v{VER}.zip`：**删净旧
   解压目录** → 解压新包 → 扩展页点刷新）
2. **SMTC 音乐预设更新到 {PRESET_VER}**（面板侧修改在本版预设里；⌘K →
   预设 → 导入新 cshz 覆盖）
3. 桥 8.3.1 / 歌词源 7.3.0 **沿用无需动**

## 组件版本

- 「初始」NewTab **v{VER}**（高光归位 + 模糊防重置 + 焦点归位）
- SMTC 音乐预设 **{PRESET_VER}**（面板同款：提层 + 辉光归位）
- ChuShi Music Bridge **{BRIDGE_VER}**（沿用）
- ChuShi Lyric Source {LYRIC_VER}（沿用）

## 装完怎么自查

- 播放时看封面：光从封面**四周**晕出来一跳一跳，封面图本身不再忽明忽暗
- 盯上一句歌词：切换后它平滑地糊下去，定住时不再「咯噔」变一下
- Ctrl/Cmd+T 新开标签：直接打字就能搜，地址栏不再抢焦点
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
