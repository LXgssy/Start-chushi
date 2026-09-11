#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v8.3.4 交付组装：歌词防裁切 + 高光防溢出 + 切行「咯噔」根治 + 播放键复位根治。

v8.3.4 变更（用户实机反馈四连）：
  ① 歌词被边框吃掉——容器 flyr 118→140 / cs-lyr 124→146 加高 + mask 渐隐
    百分比改固定 18px + 行 padding 加呼吸（浮窗+面板双表面）。
  ② 标准态/完全态律动高光溢出容器——mini/full 壳 overflow:hidden
    （辉光仍在封面四周晕出但被卡片圆角裁住；cover 态保持晕出）。
  ③ 新歌词切上来「咯噔」——翻译行 display 硬切改显式 height 0↔16/17px
    过渡（布局零跳变；0fr↔1fr 实测离散跳变不可用）+ 滚动 target 逐帧
    追踪（lyrTrackUntil）；on 行提层实证反悔（任何 will-change 冻结
    raster 在 .94→1.06 放大采样模糊，F15b 245→203，撤销）。
  ④ 播放/暂停键按下「复位」——乐观窗固定 2500ms 到期强制回落改真值
    对齐即退役 + 未对齐顺延（OPT_MAX 7s 硬上限，浮窗+面板）。
  桥 8.3.1 / 歌词源 7.3.0 沿用（本版零原生改动）；宿主 CLIENT_VER 8.3.4。
"""
import hashlib, pathlib, zipfile

ROOT = pathlib.Path('/tmp/my-project')
OUT = ROOT / 'download/v8.3.4'
PREV = ROOT / 'download/v8.3.3'
VER = '8.3.4'
BRIDGE_VER = '8.3.1'    # 沿用（本版零原生改动）
LYRIC_VER = '7.3.0'     # 沿用
PRESET_VER = '8.3.4'    # 防裁切+防咯噔 本版重建
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
                 # v8.3.4 防裁切+防溢出+防咦噔+防复位
                 'lyrTrackUntil', 'scrollLyricTo', 'fsubw',
                 '.fln.on .fsubw{height:16px', 'OPT_MAX',
                 'height:140px', 'calc(100% - 18px)', 'display:none;overflow:hidden'):
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
                 'transform .45s var(--ez)', 'filter .45s var(--ez)',
                 # v8.3.4 防裁切+防咦噔
                 'height:146px', 'calc(100% - 18px)', 'cs-subw',
                 '.cs-ln.on .cs-subw{height:17px', 'lyrTrackUntil', 'OPT_MAX'):
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
NOTES = f'''# 「初始」v{VER} 使用说明（歌词防裁切 + 高光防溢出 + 切行防咯噔 + 播放键防复位）

## 本版修了什么（全部来自你的实机反馈）

### ① 歌词被边框吃掉一部分（很多歌都这样）
长歌词行（多行换行 + 翻译行）在歌词窗里垂直居中后上下余量不足，行顶/行底
被渐隐边和裁切边吃掉。本版：歌词窗加高（浮窗 118→140px / 面板 124→146px），
上下渐隐带改固定 18px 不再随内容浮动，行与行之间加了呼吸空间——长句和
翻译行不再被吃。

### ② 标准态和完全体的律动高光不再溢出容器
封面底下的律动辉光现在被卡片圆角裁住，只在卡片内部晕出；封面态（小方块）
保持环绕光晕不变。

### ③ 新歌词切上来时的「咯噔」
根因是翻译行用 display 硬切——切行瞬间旧行高度突减、新行高度突增，布局
一步跳变。本版改高度平滑过渡：切行时翻译行渐次展开/收起，布局连续无跳变，
滚动目标逐帧跟随收敛。

### ④ 暂停/播放键按下时的「复位」
旧逻辑乐观显示只保留 2.5 秒，超时强制回落旧状态再等真值——桥/网易云稍慢
就看到图标「弹回去再弹过来」。本版改为：点击方向一直保持，直到播放器真值
确认对齐（7 秒保护上限），不再复位。

## 升级步骤（两件必换）

1. 「初始」页更新到 v{VER}（覆盖安装 `ChuShi-NewTab-v{VER}.zip`：**删净旧
   解压目录** → 解压新包 → 扩展页点刷新）
2. **SMTC 音乐预设更新到 {PRESET_VER}**（歌词防裁切在本版预设里，旧预设
   8.3.2 不会有效果；⌘K → 预设 → 导入新 cshz 覆盖）
3. 桥 8.3.1 / 歌词源 7.3.0 **沿用无需动**

## 组件版本

- 「初始」NewTab **v{VER}**（浮窗四修 + 宿主 v{VER}）
- SMTC 音乐预设 **{PRESET_VER}**（面板歌词防裁切 + 防咯噔）
- ChuShi Music Bridge **{BRIDGE_VER}**（沿用）
- ChuShi Lyric Source {LYRIC_VER}（沿用）

## 装完怎么自查

- 完全体浮窗放一首带翻译的长句歌：当前行顶部不再被削平，翻译行完整可见
- 标准态/完全体播放中：辉光只在卡片圆角内，卡片外干净
- 连续切句观察：翻译行平滑展开/收起，下方歌词行不再抖动
- 点暂停/播放：图标保持点击方向，不再弹回
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
