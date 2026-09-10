#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v8.2.7 交付组装：面板律动根修 + 变亮律/细节环 + 封面态律动 + 一镜到底三态动画。

v8.2.7 变更（用户实机反馈四连）：
  ① 面板律动根修——sandbox.js 宿主→部件下行透传白名单补 widgetSmtcSpectrum
    （v8.2.0 加了部件处理器却漏了透传，频谱帧永远到不了「初始」音乐面板）。
  ② 律动变亮律——封面本体 brightness/saturate 随拍脉冲（旧版只晕外圈 =
    「变暗」观感）；辉光上限 .5→.85；三轴包络（低/中/高）拆自 16 频段。
  ③ 中频细节环 .gring/.cs-ring——rim light 无模糊，「有些中音跟没有律动一样」根治。
  ④ 封面态 48→56px + 封面态同款律动高光（glow+ring 上身）。
  ⑤ 三态一镜到底——clone 封面连续飞形 + 面板以封面为锚长出/缩回，同步开始。
  ⚠ 桥零改动——chushi-spectrum 8.2.5（引擎零扰律）继续有效，资产直接沿用。
  ⚠ 体积门：widgetHtmlLen 22000→24000（宿主 preset.ts 与打包断言同步）——
    旧宿主导入 8.2.7 cshz 会被拒，必须先更 NewTab。

⚠ Task 110 律：NewTab zip 必须采用 build-extension.py 规范包。
"""
import hashlib, pathlib, zipfile

ROOT = pathlib.Path('/tmp/my-project')
OUT = ROOT / 'download/v8.2.7'
PREV = ROOT / 'download/v8.2.6'
VER = '8.2.7'
BRIDGE_VER = '8.2.5'    # 桥沿用（v8.2.5 引擎零扰律继续有效）
LYRIC_VER = '7.3.0'
PRESET_VER = '8.2.7'
OUT.mkdir(parents=True, exist_ok=True)

# ---------- 0) NewTab zip：build-extension.py 规范包（防呆门内嵌） ----------
newtab = OUT / f'ChuShi-NewTab-v{VER}.zip'
if not newtab.exists():
    raise SystemExit(f'缺规范扩展包 {newtab}——先跑 EXTENSION_MODE=1 next build + python3 scripts/build-extension.py')
with zipfile.ZipFile(newtab) as z:
    names = set(z.namelist())
    manifest = z.read('manifest.json').decode('utf-8')
    if f'"version": "{VER}"' not in manifest:
        raise SystemExit(f'NewTab zip manifest 版本非 {VER}——规范包过期，重跑 build-extension.py')
    for must in ('ext-bg.js', 'ext-card.js', 'sandbox.js'):
        if must not in names:
            raise SystemExit(f'zip 缺 {must}——非规范包，拒绝')
    if '26911' not in manifest:
        raise SystemExit('manifest 缺频谱助手端口——律动数据面缺失，拒绝')
    idx = z.read('index.html').decode('utf-8')
    if '<script>' in idx.replace('<script src=', '').replace('<script type=', ''):
        raise SystemExit('index.html 含内联脚本——非规范包（Task 110 回归），拒绝')
    if any(n.startswith('_next/') for n in names):
        raise SystemExit('zip 含 _next 保留名——非规范包（Task 111 回归），拒绝')
    card = z.read('ext-card.js').decode('utf-8')
    for feat in ('ChuShiLyric', 'fcard', 'chushi-card',
                 'ingestTrack', 'reconcileLines', 'posNowOf', 'coverClickBlock',
                 'seekGuard', 'backStreak', 'draggable="false"',
                 'z-index:1', 'cardAcc', 'applyAcc', '#b4b4bc', '.mtm',
                 'n.lineIndex === activeLine',
                 # v8.2.6 渲染休眠律特征
                 'needFrame', 'sleepNow', 'loopBody', 'visibilitychange',
                 'type: "vis"',
                 # v8.2.7 变亮律 + 细节环 + 一镜到底
                 'gring', 'cglow', 'cring', 'covClear', 'stepEnv', 'paintGlow',
                 'finishTrans', 'covImgOf', 'brightness(', 'saturate(',
                 'width:56px', 'getBoundingClientRect'):
        if feat not in card:
            raise SystemExit(f'ext-card.js 缺 v8.2.7 特征 {feat}——拒绝')
    # ① 面板律动根修铁证：sandbox.js 必须含频谱透传
    sb = z.read('sandbox.js').decode('utf-8')
    for feat in ('|| m.type === "widgetSmtcSpectrum"',
                 "if(d.type==='widgetSmtcSpectrum'){__music.setSpectrum("):
        if feat not in sb:
            raise SystemExit(f'sandbox.js 缺 v8.2.7 根修特征 {feat!r}——面板律动链路断，拒绝')
    bg = z.read('ext-bg.js').decode('utf-8')
    for feat in ('specBusy', 'specTick', 'bootBeats >= 100', '}, 50);',
                 'broadcastSpec', 'visCount', 'case "vis":', 'specSentOn'):
        if feat not in bg:
            raise SystemExit(f'ext-bg.js 缺特征 {feat}——拒绝')
    # 宿主 bundle 里 CLIENT_VER 8.2.7（smtc.ts 编译产物）
    hits = [n for n in names if n.startswith(('ext-script-', 'next/'))]
    ver_hit = False
    for n in hits:
        try:
            if '8.2.7' in z.read(n).decode('utf-8', errors='ignore'):
                ver_hit = True
                break
        except Exception:
            pass
    if not ver_hit:
        raise SystemExit('宿主 bundle 缺 CLIENT_VER 8.2.7——smtc.ts 未重构建，拒绝')
print(f'  verified {newtab.name} ({newtab.stat().st_size} B)：manifest {VER} + 频谱透传根修 + 变亮律/细节环/一镜到底全过')

# ---------- 1) 桥 .plugin 8.2.5（沿用 v8.2.6 交付——特征门当时已过） ----------
plugin = OUT / f'ChuShi-Music-Bridge-{BRIDGE_VER}.plugin'
src_plugin = PREV / f'ChuShi-Music-Bridge-{BRIDGE_VER}.plugin'
if not src_plugin.exists():
    raise SystemExit(f'缺源 {src_plugin}——v8.2.6 交付目录不完整')
plugin.write_bytes(src_plugin.read_bytes())
with zipfile.ZipFile(plugin) as z:
    exe = z.read('chushi-spectrum.exe')
    for feat in (b'8.2.5', b'demand gate', b'engine untouched'):
        if feat not in exe:
            raise SystemExit(f'沿用的桥缺 v8.2.5 特征 {feat!r}——源包损坏，拒绝')
print(f'  carried {plugin.name} ({plugin.stat().st_size} B)：v8.2.5 引擎零扰律继续有效')

# ---------- 2) 歌词源 .plugin（沿用 7.3.0） ----------
lyric = OUT / f'ChuShi-Lyric-Source-{LYRIC_VER}.plugin'
lyric.write_bytes((PREV / f'ChuShi-Lyric-Source-{LYRIC_VER}.plugin').read_bytes())
print(f'  carried {lyric.name} ({lyric.stat().st_size} B)')

# ---------- 3) cshz 8.2.7（本版重建：变亮律 + 细节环 + 三轴 beatFrame） ----------
cshz = OUT / f'ChuShi-Music-Preset-{PRESET_VER}.cshz'
_src_cshz = ROOT / 'examples' / '初始SMTC音乐预设.cshz'
cshz.write_bytes(_src_cshz.read_bytes())
with zipfile.ZipFile(cshz) as z:
    m = z.read('manifest.json').decode('utf-8')
    for feat in ('cs-ring', 'beatFrame', 'brightness(', 'saturate(', 'bandAvg'):
        if feat not in m:
            raise SystemExit(f'cshz 缺 v8.2.7 特征 {feat}——重建遗漏，拒绝')
print(f'  built {cshz.name} ({cshz.stat().st_size} B)：面板律动升级版（23299/24000 字符）')

# ---------- 4) 使用说明 ----------
NOTES = f'''# 「初始」v{VER} 使用说明（面板律动根修 + 变亮律 + 一镜到底）

## 本版修了什么（全部来自你的实机反馈）

### ① 「律动只有浮窗有，初始面板没有」——根修
考古实锤：v8.2.0 给音乐面板加了律动处理器，却**漏了把频谱数据帧透传进
面板**（宿主下行白名单少了 `widgetSmtcSpectrum` 一项）——频谱帧永远到不
了面板，面板辉光只能恒静态。本版补齐透传，面板与浮窗同一份频谱数据。
本版自带 e2e 阴性对照：旧版代码跑新测试必挂（环带 Δ=1），新版全绿。

### ② 「应该变亮不是变暗」——变亮律
旧版律动只在封面**外圈**晕开彩色光晕，观感像「变暗」。本版：
- **封面本体随低音提亮**（brightness 滤镜直写，鼓点越重封面越亮）
- 高频驱动饱和度脉冲（色彩更鲜活）
- 辉光上限从 0.5 提到 0.85（外圈光晕明显更亮）

### ③ 「有些中音跟没有律动一样」——细节环
16 段频谱拆成**低/中/高三轴**：低音管封面亮度+大光晕；**中频驱动一圈细
边框 rim light**（不模糊、动得快看得清）；高频管饱和度。中频段（人声主
能量区）从此有自己的可见律动。

### ④ 封面态 48→56px + 封面态律动高光
收起态的封面放大了一点，并且底下同样有律动高光+细节环。

### ⑤ 三态切换「一镜到底」动画
封面是唯一连续锚：切换时封面从旧位置**连续飞形**到新位置（缩放+位移），
面板同时以封面为锚**长出来**（展开）或**缩回封面底下**（收起），同步开
始、不换镜不闪黑。所有路径（封面↔标准↔完全体）全覆盖；系统开启「减少
动态」时自动直切。

## 升级步骤（两件必换）

1. 「初始」页更新到 v{VER}（覆盖安装 `ChuShi-NewTab-v{VER}.zip`：**删净旧
   解压目录** → 解压新包 → 扩展页点刷新）
2. **⌘K 重新导入** SMTC 音乐预设 **{PRESET_VER}**（面板律动升级——⚠ 本版
   预设体积门放宽，旧版 NewTab 导入会被拒，必须先完成第 1 步）
3. 桥 **{BRIDGE_VER}** / 歌词源 {LYRIC_VER} 沿用无需动（若桥还是 ≤8.2.4
   请务必换 8.2.5 并重启网易云）

## 组件版本

- 「初始」NewTab **v{VER}**（频谱透传根修 + 浮窗变亮律/细节环 + 56px 封面态 + 一镜到底）
- SMTC 音乐预设 **{PRESET_VER}**（面板变亮律 + 细节环）
- ChuShi Music Bridge **{BRIDGE_VER}**（沿用）
- ChuShi Lyric Source {LYRIC_VER}（沿用）

## 装完怎么自查

- 面板放歌 → 封面随鼓点**变亮**（不是变暗）、外圈光晕呼吸、中频段有细节环
- 浮窗三态互切 → 封面连续飞形、面板从封面处长出/缩回，无跳切
- 封面态（56px）底下也有律动高光
- v8.2.6 的性能休眠律全部保留（后台标签零负载、浏览器后台全链静默）
- 歌词/拖动/零跳转等 31 项 e2e 回归全绿
'''
notes = OUT / f'ChuShi-v{VER}-Usage-Notes.md'
notes.write_text(NOTES, encoding='utf-8')
print(f'  built {notes.name}')

# ---------- 5) SHA256SUMS + AllInOne ----------
staged = [plugin, lyric, newtab, cshz, notes]

def sha256(p: pathlib.Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()

sums = OUT / 'SHA256SUMS.txt'
with sums.open('w', encoding='utf-8') as f:
    for p in sorted(staged):
        f.write(f'{sha256(p)}  {p.name}\n')
print('  built SHA256SUMS.txt')

allin = OUT / f'ChuShi-v{VER}-AllInOne.zip'
with zipfile.ZipFile(allin, 'w', zipfile.ZIP_DEFLATED) as z:
    for p in staged:
        z.write(p, p.name)
    z.write(sums, 'SHA256SUMS.txt')
with zipfile.ZipFile(allin) as z:
    for p in staged:
        assert hashlib.sha256(z.read(p.name)).hexdigest() == sha256(p)
print(f'  built {allin.name} ({allin.stat().st_size} B)：五件全字节一致')
print(f'ASSETS v{VER} DONE')
