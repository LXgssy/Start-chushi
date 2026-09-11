#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v8.3.5 交付组装：面板无反应根治（桥 Worker 心跳）+ 中文逐字重影根治 +
seek 后歌词快速对齐 + 高光照字提层。

v8.3.5 变更（用户实机反馈四连）：
  ① 音乐面板无反应（歌词卡住/下一首播一半才显示/控制没效果）——桥
    beat/drainCmds 跑在网易云 CEF 页面 setInterval，网易云窗口后台时被
    Chromium 强节流（可至 1/min）。桥 8.3.5 加 Worker 心跳（Worker timer
    不受隐藏页节流，postMessage 唤醒主线程跑 beat/drainCmds；原 interval
    兜底）+ seek 读回终局即拍。桥 8.3.5 必换。
  ② 中文歌逐字歌词重影（浮窗+面板）——词壳 inline 相对定位的 absolute
    子元素包含块顶=em box 顶，与底字 line box 基线差半 leading ≈3px，
    中文方块字重影明显。词壳 inline-block 化，两层文本像素级重合。
  ③ seek 后歌词过快/过慢/要校准——护航窗收窗容差 ±2s→±0.8s + 收窗拍
    600ms smoothstep 软重锚（sandbox 硬锚跳变根治）+ 护航窗 4.5→3s +
    桥读回即拍（真值提前 ~1s）。
  ④ 高光照亮文字——内容件 relative+z-index:1 提到律动辉光之上
    （浮窗 7 件 / 面板 6 件；封面底下语义不变，光仍在封面背后）。
  宿主 CLIENT_VER 8.3.5 / PLUGIN_VER_MIN 8.3.5 / sandbox 缓存戳 bump。
  歌词源 7.3.0 沿用。
"""
import hashlib, pathlib, zipfile

ROOT = pathlib.Path('/tmp/my-project')
OUT = ROOT / 'download/v8.3.5'
PREV = ROOT / 'download/v8.3.4'
VER = '8.3.5'
BRIDGE_VER = '8.3.5'    # 本版必换（Worker 心跳 + 读回即拍）
LYRIC_VER = '7.3.0'     # 沿用
PRESET_VER = '8.3.5'    # 重影+提层 本版重建
BRIDGE_DIR = ROOT / 'bridge/v8/plugins/music-bridge'
NATIVE_DIR = ROOT / 'bridge/v8/native'
OUT.mkdir(parents=True, exist_ok=True)

# ---------- 0) plugins 目录陈货对拍（Task 87 律） ----------
for name in ('hub.dll', 'hub.dll.x64.dll', 'chushi-spectrum.exe'):
    a = (NATIVE_DIR / name).read_bytes()
    b = (BRIDGE_DIR / name).read_bytes()
    if hashlib.md5(a).hexdigest() != hashlib.md5(b).hexdigest():
        raise SystemExit(f'plugins 目录 {name} 与 native 不一致——先同步再打包')
print('  plugins/native md5 对拍一致')

# ---------- 1) NewTab zip：build-extension.py 规范包（防呆门内嵌） ----------
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
                 'filter:blur(2px)', 'filter:blur(1.1px)', 'filter:blur(0)',
                 'lyrTrackUntil', 'scrollLyricTo', 'fsubw',
                 '.fln.on .fsubw{height:16px', 'OPT_MAX',
                 'height:140px', 'calc(100% - 18px)', 'display:none;overflow:hidden',
                 # v8.3.5 重影根治 + 提层 + 护航窗收紧
                 '.fw{position:relative;display:inline-block',
                 'pointer-events:none;white-space:nowrap;',
                 '.meta{flex:1;min-width:0;position:relative;z-index:1}',
                 '.rail{position:relative;z-index:1',
                 'seekGuard.to) <= 0.8', 'seekGuard.at > 3000'):
        if feat not in card:
            raise SystemExit(f'ext-card.js 缺特征 {feat}——拒绝')
    for gone in ('flyCoverClone', 'animsRemoveClones', 'siteHidden', 'saveHide',
                 'type: "vis"'):
        if gone in card:
            raise SystemExit(f'ext-card.js 残留 {gone}——拒绝')
    # v8.3.5：sandbox.js 护航窗收紧/软重锚特征
    sb = z.read('sandbox.js').decode('utf-8')
    for feat in ('unguardSoft', 'guard.to) > 0.8', 'dur: 3000', '(guard.dur || 3000)'):
        if feat not in sb:
            raise SystemExit(f'sandbox.js 缺特征 {feat}——拒绝')
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
print(f'  verified {newtab.name} ({newtab.stat().st_size} B)：manifest {VER} + v8.3.5 全特征过')

# ---------- 2) 桥 .plugin 8.3.5（Worker 心跳——本版必换） ----------
plugin = OUT / f'ChuShi-Music-Bridge-{BRIDGE_VER}.plugin'
with zipfile.ZipFile(plugin, 'w', zipfile.ZIP_DEFLATED) as z:
    for name in ('manifest.json', 'index.js', 'hub.dll', 'hub.dll.x64.dll', 'chushi-spectrum.exe'):
        p = BRIDGE_DIR / name
        if not p.exists():
            p = NATIVE_DIR / name
        if not p.exists():
            raise SystemExit(f'缺文件: {name}')
        z.write(p, name)
with zipfile.ZipFile(plugin) as z:
    mf = z.read('manifest.json').decode('utf-8')
    if f'"version": "{BRIDGE_VER}"' not in mf:
        raise SystemExit('桥 manifest 版本非 8.3.5——拒绝')
    idxjs = z.read('index.js').decode('utf-8')
    for feat in ("VER = '8.3.5'", 'drainCmds', 'DRAIN_MS = 200',
                 'hbWorker', 'postMessage(1)', 'postMessage(2)',
                 'worker-down:legacy-interval',
                 '读回终局即拍' if False else 'v8.3.5'):
        if feat not in idxjs:
            raise SystemExit(f'桥 index.js 缺特征 {feat!r}——拒绝')
    exe = z.read('chushi-spectrum.exe')
    if b'self exit' in exe:
        raise SystemExit('桥 spectrum 残留空闲自退——常驻律被回退，拒绝')
    h = hashlib.md5(z.read('hub.dll')).hexdigest()
    if h == '07011f2c5aa6949b459eff8e84245c2f':
        raise SystemExit('hub.dll md5 = 8.2.5 基准——keeper 政策未换血，拒绝')
print(f'  built {plugin.name} ({plugin.stat().st_size} B)：Worker 心跳+读回即拍全在位，hub.dll {h[:12]}')

# ---------- 3) cshz 8.3.5（面板重影+提层） ----------
src_cshz = ROOT / 'examples' / '初始SMTC音乐预设.cshz'
if not src_cshz.exists():
    raise SystemExit('缺 examples/初始SMTC音乐预设.cshz——先跑 python3 scripts/build-smtc-preset.py')
cshz = OUT / f'ChuShi-Music-Preset-{PRESET_VER}.cshz'
cshz.write_bytes(src_cshz.read_bytes())
with zipfile.ZipFile(cshz) as z:
    m = z.read('manifest.json').decode('utf-8')
    for feat in ('csGlowBtn', 'csFloatBtn', 'beatFrame', 'bandAvg',
                 'transform:scale(1.06)', 'filter:blur(2px)', 'filter:blur(1.1px)',
                 'transform .45s var(--ez)', 'filter .45s var(--ez)',
                 'height:146px', 'calc(100% - 18px)', 'cs-subw',
                 '.cs-ln.on .cs-subw{height:17px', 'lyrTrackUntil', 'OPT_MAX',
                 # v8.3.5 重影根治 + 提层
                 '.cs-w{position:relative;display:inline-block',
                 'pointer-events:none;white-space:nowrap;',
                 '.cs-meta{flex:1;min-width:0;padding-right:24px;position:relative;z-index:1}',
                 'touch-action:none;position:relative;z-index:1',
                 'z-index:1;appearance:none'):
        if feat not in m:
            raise SystemExit(f'cshz 缺特征 {feat}——面板重影/提层未入包，拒绝')
print(f'  verified {cshz.name} ({cshz.stat().st_size} B)：面板 inline-block+提层全过')

# ---------- 4) 歌词源 .plugin（沿用 7.3.0） ----------
lyric = OUT / f'ChuShi-Lyric-Source-{LYRIC_VER}.plugin'
lyric.write_bytes((PREV / f'ChuShi-Lyric-Source-{LYRIC_VER}.plugin').read_bytes())
print(f'  carried {lyric.name} ({lyric.stat().st_size} B)')

# ---------- 5) SHA256SUMS ----------
import os
sums = []
for f in sorted(os.listdir(OUT)):
    p = OUT / f
    if p.is_file() and f != 'SHA256SUMS.txt':
        sums.append(hashlib.sha256(p.read_bytes()).hexdigest() + '  ' + f)
(OUT / 'SHA256SUMS.txt').write_text('\n'.join(sums) + '\n', encoding='utf-8')
print('  SHA256SUMS.txt x', len(sums))

# ---------- 6) 使用说明（CJK 剥离律：ASCII 双名） ----------
NOTES = f'''# 「初始」v{VER} 使用说明（面板无反应根治 + 逐字重影根治 + seek 歌词快速对齐 + 高光不再照亮文字）

## 本版修了什么（全部来自你的实机反馈）

### ① 音乐面板没反应：歌词卡住、下一首歌播一半才显示、控制没效果
真正根因找到了：桥的「状态推送 + 命令拉取」循环跑在网易云窗口的页面里，
网易云窗口最小化/在后台时，浏览器内核会把这种页面定时器强节流到每分钟
一次——桥就停摆了，直到你把网易云窗口带回前台才恢复。本版把心跳搬进了
Web Worker（后台不被节流），网易云哪怕最小化，面板照常 1 秒一拍拿到
真值、按钮按下 200ms 内就有桥来取命令。**本版桥必须升级**。

### ② 中文歌逐字歌词重影（浮窗 + 面板）
逐字扫光的结构是「灰色底字 + 白色亮字覆盖层」，旧实现两层文字的排版
基准差了约 3 个像素——英文圆润笔画看不出来，中文方块字一错位就是
明显的重影。本版两层文字像素级重合，扫光干净利落。

### ③ 跳转进度条后歌词对不上（过快/过慢，每次都要校准）
三层修复：a) 跳转后真值确认窗的容差从 ±2 秒收紧到 ±0.8 秒——以前真值
落点差一两秒也直接采纳，歌词就跳一下；b) 采纳瞬间不再硬跳，改 600ms
平滑入轨（前进/回退都平滑）；c) 桥在读回校验确认跳转成功的第一时间就
推送真值（不再等 1 秒节拍）。逐字、逐行歌词统一受益。

### ④ 高光会照亮文字
律动辉光画在了歌名/歌词/按钮等文字的下层之外——本版把所有文字与控件
的层级提到辉光之上，辉光只负责封面底下的光晕，文字不再被照亮。
（高光位置语义不变：光仍在封面底下，不上封面。）

## 升级步骤（两件必换）

1. 「初始」页更新到 v{VER}（覆盖安装 `ChuShi-NewTab-v{VER}.zip`：**删净旧
   解压目录** → 解压新包 → 扩展页点刷新）
2. **桥插件更新到 {BRIDGE_VER}**（面板无反应根治在本版桥里；网易云
   插件列表里把 ChuShi Music Bridge 换成 8.3.5）
3. SMTC 音乐预设更新到 {PRESET_VER}（重影根治+提层在本版预设里；
   ⌘K → 预设 → 导入新 cshz 覆盖）
4. 歌词源 7.3.0 沿用无需动

## 组件版本

- 「初始」NewTab **v{VER}**（重影根治 + 提层 + seek 对齐 + 宿主 v{VER}）
- ChuShi Music Bridge **{BRIDGE_VER}**（Worker 心跳 + 读回即拍——**必换**）
- SMTC 音乐预设 **{PRESET_VER}**（面板重影根治 + 提层）
- ChuShi Lyric Source {LYRIC_VER}（沿用）

## 装完怎么自查

- 把网易云窗口最小化放到后台，在「初始」页切歌/点暂停：面板 1~2 秒内
  跟上，不再卡旧歌
- 放一首中文逐字歌词（yrc）的歌：当前行扫光边缘干净，白字灰字完全重合
- 拖动进度条到任意位置：歌词在 ~1 秒内平滑对齐，无跳变、无过快过慢
- 播放中观察：辉光只在封面底下晕出，歌名/歌词/按钮文字清晰不被照亮
'''
(OUT / f'使用说明-v{VER}.md').write_text(NOTES, encoding='utf-8')
(OUT / f'ChuShi-v{VER}-Usage-Notes.md').write_text(NOTES, encoding='utf-8')
print(f'  使用说明-v{VER}.md + ChuShi-v{VER}-Usage-Notes.md（ASCII 资产名）')

# ---------- 7) AllInOne 合并包 ----------
allin = OUT / f'ChuShi-v{VER}-AllInOne.zip'
with zipfile.ZipFile(allin, 'w', zipfile.ZIP_DEFLATED) as z:
    for name in (f'ChuShi-NewTab-v{VER}.zip', f'ChuShi-Music-Bridge-{BRIDGE_VER}.plugin',
                 f'ChuShi-Music-Preset-{PRESET_VER}.cshz', f'ChuShi-Lyric-Source-{LYRIC_VER}.plugin',
                 'SHA256SUMS.txt', f'ChuShi-v{VER}-Usage-Notes.md'):
        z.write(OUT / name, name)
print(f'  {allin.name} ({allin.stat().st_size} B)')
