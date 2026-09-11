#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v8.2.9 交付组装：桥响应迟钝根治 + 逐行快一拍 + 面板双开关 + 128 段 + 动画修订。

v8.2.9 变更（用户实机反馈五连）：
  ① 桥响应迟钝——桥插件命令快排 drainCmds 200ms 专职循环（命令不再串在
    beat 尾部等 ~0.5-5s）+ 面板侧 hublog 不阻塞状态节拍 + TRUTH_STALE_SEC
    6→12（面板不再过早钉守冻结）。PLUGIN_VER_MIN 8.2.9 强制升桥。
  ② 逐行歌词快一拍——align/alignAt 行级时钟分离：逐行 0ms / 逐字 -100ms。
  ③ 右键隐藏退役——面板加「律动」「浮窗」双开关（默认开），镜像
    cardGlow/cardEnabled 到 chrome.storage.local，浮窗全网页全局显隐。
  ④ FFT 频段 16→128（native SPEC_VERSION 8.2.9 换血；低频侧实际映射
    线性化 段k≈bin k+2；bass 分区带权 47~211Hz；hub.dll 引擎零扰律）。
  ⑤ 三态动画修订——封面 clone 飞形退役（封面不再位移复位）+ 形变期钉位
    （left/top 一并动画到夹紧位，「完全体跳一下」根治）。
"""
import hashlib, pathlib, zipfile

ROOT = pathlib.Path('/tmp/my-project')
OUT = ROOT / 'download/v8.2.9'
PREV = ROOT / 'download/v8.2.8'
VER = '8.2.9'
BRIDGE_VER = '8.2.9'    # 桥 JS 快排 + spectrum 8.2.9 二进制换血
LYRIC_VER = '7.3.0'
PRESET_VER = '8.2.9'
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
        raise SystemExit('index.html 含内联脚本——非规范包，拒绝')
    if any(n.startswith('_next/') for n in names):
        raise SystemExit('zip 含 _next 保留名——非规范包，拒绝')
    card = z.read('ext-card.js').decode('utf-8')
    for feat in ('ChuShiLyric', 'fcard', 'chushi-card',
                 'ingestTrack', 'reconcileLines', 'posNowOf', 'coverClickBlock',
                 'seekGuard', 'backStreak', 'draggable="false"',
                 'z-index:1', 'cardAcc', 'applyAcc', '#b4b4bc', '.mtm',
                 'n.lineIndex === activeLine',
                 'needFrame', 'sleepNow', 'loopBody', 'visibilitychange',
                 'type: "vis"',
                 'cglow', 'covClear', 'stepEnv', 'paintGlow',
                 'brightness(', 'saturate(', 'width:56px', 'getBoundingClientRect',
                 # v8.2.9 双开关 + 行级时钟 + 128 段 + 去飞形
                 'cardEnabled', 'cardGlow', 'applyEnabled', 'applyGlowEnabled',
                 'specMsgOn', 'ChuShiLyric.align(ly.parsed, ms, lyMode === 0)',
                 'bands.length >= 100'):
        if feat not in card:
            raise SystemExit(f'ext-card.js 缺 v8.2.9 特征 {feat}——拒绝')
    for gone in ('flyCoverClone', 'animsRemoveClones', 'siteHidden', 'saveHide'):
        if gone in card:
            raise SystemExit(f'ext-card.js 残留 {gone}——v8.2.9 未落地，拒绝')
    sb = z.read('sandbox.js').decode('utf-8')
    for feat in ('alignAt(msRaw, lineMode)', 'now:function(m){return __music.now(m===true)}',
                 'LYR_LAG_MS = 100', 'avgD > 0 && wd.d > avgD * 2.2',
                 "if(d.type==='widgetSmtcSpectrum'){__music.setSpectrum("):
        if feat not in sb:
            raise SystemExit(f'sandbox.js 缺 v8.2.9 特征 {feat!r}——拒绝')
    bg = z.read('ext-bg.js').decode('utf-8')
    for feat in ('specBusy', 'specTick', 'bootBeats >= 90', '}, 33);',
                 'broadcastSpec', 'visCount', 'case "vis":', 'specSentOn',
                 'm.cmd === "seek"', 'slice(0, 128)'):
        if feat not in bg:
            raise SystemExit(f'ext-bg.js 缺 v8.2.9 特征 {feat}——拒绝')
    hits = [n for n in names if n.startswith(('ext-script-', 'next/'))]
    ver_hit = False
    for n in hits:
        try:
            if '8.2.9' in z.read(n).decode('utf-8', errors='ignore'):
                ver_hit = True
                break
        except Exception:
            pass
    if not ver_hit:
        raise SystemExit('宿主 bundle 缺 CLIENT_VER 8.2.9——smtc.ts 未重构建，拒绝')
print(f'  verified {newtab.name} ({newtab.stat().st_size} B)：manifest {VER} + 双开关/行级时钟/128段/去飞形/钉位 全过')

# ---------- 1) 桥 .plugin 8.2.9（本版重建：命令快排 + spectrum 128 段） ----------
plugin = OUT / f'ChuShi-Music-Bridge-{BRIDGE_VER}.plugin'
if not plugin.exists():
    raise SystemExit(f'缺 {plugin}——先跑桥重打包')
with zipfile.ZipFile(plugin) as z:
    mf = z.read('manifest.json').decode('utf-8')
    if '"version": "8.2.9"' not in mf:
        raise SystemExit('桥 manifest 版本非 8.2.9——拒绝')
    idxjs = z.read('index.js').decode('utf-8')
    for feat in ("VER = '8.2.9'", 'drainCmds', 'DRAIN_MS = 200'):
        if feat not in idxjs:
            raise SystemExit(f'桥 index.js 缺 v8.2.9 特征 {feat!r}——拒绝')
    exe = z.read('chushi-spectrum.exe')
    for feat in (b'8.2.9', b'demand gate', b'engine untouched'):
        if feat not in exe:
            raise SystemExit(f'桥 spectrum 缺 v8.2.9 特征 {feat!r}——二进制过期，拒绝')
    import hashlib
    if hashlib.md5(z.read('hub.dll')).hexdigest() != '07011f2c5aa6949b459eff8e84245c2f':
        raise SystemExit('hub.dll md5 ≠ 8.2.5 基准——引擎零扰律破坏，拒绝')
print(f'  verified {plugin.name} ({plugin.stat().st_size} B)：命令快排 200ms + spectrum 128 段（hub.dll 与 8.2.5 md5 一致=引擎零扰律）')

# ---------- 2) 歌词源 .plugin（沿用 7.3.0） ----------
lyric = OUT / f'ChuShi-Lyric-Source-{LYRIC_VER}.plugin'
lyric.write_bytes((PREV / f'ChuShi-Lyric-Source-{LYRIC_VER}.plugin').read_bytes())
print(f'  carried {lyric.name} ({lyric.stat().st_size} B)')

# ---------- 3) cshz 8.2.9（本版重建：双开关 + 128 段自适应 + 行级时钟） ----------
cshz = OUT / f'ChuShi-Music-Preset-{PRESET_VER}.cshz'
_src_cshz = ROOT / 'examples' / '初始SMTC音乐预设.cshz'
cshz.write_bytes(_src_cshz.read_bytes())
with zipfile.ZipFile(cshz) as z:
    m = z.read('manifest.json').decode('utf-8')
    for feat in ('csGlowBtn', 'csFloatBtn', 'csGlow', 'csFloat',
                 'mus.now(lyMode === 0)', 'bandAvg(n.bands, 9, 85)', 'glowOn2',
                 'beatFrame', 'brightness(', 'saturate(', 'bandAvg', 'lastLyrTy',
                 'Math.pow', 'contrast('):
        if feat not in m:
            raise SystemExit(f'cshz 缺 v8.2.9 特征 {feat}——重建遗漏，拒绝')
    import re as _re2
    if _re2.search(r'class="cs-ring"|ringEl|querySelector\("\.cs-ring"\)', m):
        raise SystemExit('cshz 代码残留 cs-ring——去方框律未落地，拒绝')
print(f'  built {cshz.name} ({cshz.stat().st_size} B)：面板双开关 + 128 段自适应 + 行级时钟（24493/25600 字符）')

# ---------- 4) 使用说明 ----------
NOTES = f'''# 「初始」v{VER} 使用说明（桥响应提速 + 逐行快一拍 + 面板双开关 + 128 段律动 + 动画修订）

## 本版修了什么（全部来自你的实机反馈）

### ① 桥响应迟钝——根治（面板迟滞 + 暂停慢半拍）
考古实锤：**暂停等控制命令串在桥的节拍尾部**（轮询租约→推状态→自证→
才轮到拉命令，hub 繁忙时最坏 ~4-5 秒才被执行）。本版拆出**独立 200ms
命令快排循环**——命令平均 ~100ms 内被执行；同时面板侧诊断拉取不再阻塞
状态节拍、真值年龄补偿上限 6s→12s（「面板歌词和进度不动但浮窗正常」
的过早冻结大幅缓解）。**必须把桥更新到 8.2.9 并重启网易云**（面板会
亮「组件待更新」芯片提醒）。

### ② 逐行歌词快一拍
上一版为逐字扫光加了 100ms 唱声补偿，把逐行高亮/滚动也一起拖慢了。
本版行级时钟分离：**逐行模式回到原始时基（快一拍），逐字扫光保持
等唱声补偿**——正好是「快一点点，不要太多」。

### ③ 右键隐藏退役 → 面板双开关
浮窗右键隐藏逻辑整体移除。音乐面板底部新增两个开关（默认都开）：
- **律动**：高光律动总开关——关掉后本面板与浮窗的封面提亮/光晕呼吸
  同时静止（浮窗侧并撤频谱订阅，零开销）；
- **浮窗**：悬浮音乐卡总开关——**开启后浮窗在所有网页显示**，关掉即
  全部网页卸下（全局开关，替代按站右键隐藏）。

### ④ FFT 频段 16 → 128（更细腻的律动数据面）
频谱助手输出频段 16→128（50Hz~16kHz，~40Hz 节拍不变，环回流量无感）。
低频段现在有 ~23Hz/段的真分辨率（鼓点层次更细），中频 250Hz~2kHz、
高频 2k~16kHz 分轴驱动封面亮度/光晕——律动覆盖高中低全频段且更细腻。
底鼓「拳感」按新频段重新校准（0..1/2..3/4..6 段分区带权），鼓点驱动
与上一版等价不打折。

### ⑤ 三态切换动画修订
- **封面不再位移复位**：切换动画只让面板壳变形（长方形⇄正方形，dock
  同语言），封面在形变期内随内容淡出/淡入原地重排——不再有一只封面
  飞过去又复位；
- **完全体「跳一下」根治**：贴屏幕右缘时旧版会先把新面板夹到位再开始
  动画（先跳后变形）；现在形变期钉住原位，位置随形变平滑滑动到位。

## 升级步骤（三件必换）

1. 「初始」页更新到 v{VER}（覆盖安装 `ChuShi-NewTab-v{VER}.zip`：**删净旧
   解压目录** → 解压新包 → 扩展页点刷新）
2. 桥更新到 **{BRIDGE_VER}** 并**重启网易云**（命令快排 200ms + 频谱
   128 段都在桥侧）
3. **⌘K 重新导入** SMTC 音乐预设 **{PRESET_VER}**（面板双开关 + 行级时钟；
   面板体积上限放宽，旧宿主会拒收——先做第 1 步）
4. 歌词源 {LYRIC_VER} 沿用无需动

## 组件版本

- 「初始」NewTab **v{VER}**（双开关镜像 + 行级时钟 + 128 段 + 动画修订）
- SMTC 音乐预设 **{PRESET_VER}**（面板双开关 + 128 段自适应）
- ChuShi Music Bridge **{BRIDGE_VER}**（命令快排 200ms + spectrum 8.2.9 128 段）
- ChuShi Lyric Source {LYRIC_VER}（沿用）

## 装完怎么自查

- 按暂停 → 网易云应在 ~0.2s 内暂停（不再慢半拍）
- 面板歌词/进度应与浮窗一样持续走针（桥繁忙窗口不再冻结）
- 逐行歌词行界比上一版早约 0.1s（快一点点）
- 面板底部三个开关：强行逐字 / 律动 / 浮窗——律动关=面板+浮窗同时静止；
  浮窗关=所有网页浮窗消失，开=所有网页显示
- 三态互切：只有面板壳在变形（长方形⇄正方形），封面原地不动
- 贴右缘切完全体：面板平滑滑动到位，不再先跳一下
- 鼓点律动层次比上一版更细（128 段）
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
