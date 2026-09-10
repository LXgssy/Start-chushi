#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v8.2.6 交付组装：性能特供——「5070 卡成屎」根治（浮窗/SW 渲染休眠律）。

v8.2.6 变更（用户实机日志三方互证）：
  ① ext-card.js rAF 休眠——needFrame() 判活：hidden 立睡/无曲目睡/
    mini·cover 走针降 200ms 节拍/辉光衰减尾归零才睡（前台标签不再 60fps 永动）。
  ② visibilitychange 三联开关——标签切后台撤频谱订阅 + 停 SW state 需求 +
    睡渲染循环；切回全部恢复。后台标签整体撤离频谱链路。
  ③ ext-bg.js broadcastSpec 只发订阅卡；paused 空转帧翻转门（20msg/s→0）；
    {type:"vis"} 门控 state 轮询（全后台 = SW 全链静默）。
  ⚠ 桥零改动——chushi-spectrum 8.2.5（引擎零扰律）继续有效，资产直接沿用。

⚠ Task 110 律：NewTab zip 必须采用 build-extension.py 规范包。
⚠ v8.2.5 桥资产从 download/v8.2.5/ 直接复制（该包已过全套特征门）。
"""
import hashlib, pathlib, zipfile, shutil

ROOT = pathlib.Path('/tmp/my-project')
OUT = ROOT / 'download/v8.2.6'
PREV = ROOT / 'download/v8.2.5'
VER = '8.2.6'
BRIDGE_VER = '8.2.5'    # 桥沿用（v8.2.5 引擎零扰律继续有效）
LYRIC_VER = '7.3.0'
PRESET_VER = '8.2.4'
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
    for must in ('ext-bg.js', 'ext-card.js'):
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
                 'type: "vis"'):
        if feat not in card:
            raise SystemExit(f'ext-card.js 缺特征 {feat}——拒绝')
    bg = z.read('ext-bg.js').decode('utf-8')
    for feat in ('specBusy', 'specTick', 'bootBeats >= 100', '}, 50);',
                 'broadcastSpec', 'visCount', 'case "vis":', 'specSentOn',
                 'v8.2.6'):
        if feat not in bg:
            raise SystemExit(f'ext-bg.js 缺 v8.2.6 特征 {feat}——拒绝')
    if '}, 33);' in bg:
        raise SystemExit('ext-bg.js 残留 33ms 定时器——20Hz 轮询未生效，拒绝')
    # 宿主 bundle 里 CLIENT_VER 8.2.6（smtc.ts 编译产物）
    hits = [n for n in names if n.startswith(('ext-script-', 'next/'))]
    ver_hit = False
    for n in hits:
        try:
            if '8.2.6' in z.read(n).decode('utf-8', errors='ignore'):
                ver_hit = True
                break
        except Exception:
            pass
    if not ver_hit:
        raise SystemExit('宿主 bundle 缺 CLIENT_VER 8.2.6——smtc.ts 未重构建，拒绝')
print(f'  verified {newtab.name} ({newtab.stat().st_size} B)：manifest {VER} + 休眠律 + vis 门全过')

# ---------- 1) 桥 .plugin 8.2.5（沿用 v8.2.5 交付——特征门当时已过） ----------
plugin = OUT / f'ChuShi-Music-Bridge-{BRIDGE_VER}.plugin'
src_plugin = PREV / f'ChuShi-Music-Bridge-{BRIDGE_VER}.plugin'
if not src_plugin.exists():
    raise SystemExit(f'缺源 {src_plugin}——v8.2.5 交付目录不完整')
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

# ---------- 3) cshz 8.2.4（沿用） ----------
cshz = OUT / f'ChuShi-Music-Preset-{PRESET_VER}.cshz'
cshz.write_bytes((PREV / f'ChuShi-Music-Preset-{PRESET_VER}.cshz').read_bytes())
print(f'  carried {cshz.name} ({cshz.stat().st_size} B)')

# ---------- 4) 使用说明 ----------
NOTES = f'''# 「初始」v{VER} 使用说明（性能特供——「5070 卡成屎」根治）

## 先说结论：后台到底在跑什么

「初始」音乐三件套在你机器上的常驻进程一共三层（全部只监听本机回环）：

1. **ChuShiBridge（网易云插件）**
   - `hub.dll`（注入网易云进程）：SMTC 媒体真值 + 命令中继，本机 26901-26903
   - `chushi-spectrum.exe`（独立进程）：WASAPI loopback 音频采集 + FFT 频谱，本机 26911-26913
   - 歌词源插件：歌词代理
2. **NewTab 扩展 Service Worker**：1 次/秒播放状态轮询 + 20 次/秒频谱轮询（有消费者才跑）
3. **每个网页里的悬浮卡**：状态接收 + 渲染循环

## 你卡的三个真凶（按贡献排序）

### 真凶一：chushi-spectrum 死亡循环（你日志实锤——还没装 v8.2.5 桥！）

你发来的 spectrum-log 显示 10:55-14:06 三个小时里助手**启动了 71 次、
自杀了 69 次**——平均每 2.7 分钟走一遍「进程拉起 → 声卡 loopback 初始化 →
空转 60 秒 → 自杀 → 再拉起」。每次循环都要重新 seizure 一次音频设备，
还伴随设备失效错误（0x88890004）后的 800ms 重连风暴。这就是电音+卡顿
的音频侧根源。**这个循环 v8.2.5 桥已经结构性根治（需求门：零消费者连
COM 都不初始化），但日志证明你机器上还在跑 v8.2.2/v8.2.3——必须把桥
换到 {BRIDGE_VER} 并重启网易云！**

### 真凶二：悬浮卡渲染循环永不休眠（本版根治①）

旧版悬浮卡在每个网页里都有一个 **60fps 永转的 requestAnimationFrame
循环**——Chrome 只会暂停后台标签的 rAF，你**正在看的前台标签**哪怕没在
放歌也在每帧空转；放歌时还要叠加频谱辉光的重绘。你开着多少个网页，
前台就永远有一个 60fps 循环 + 后台一堆被消息唤醒的渲染进程。

本版改为「按需唤醒」：

- 没在放歌/没曲目 → 循环整个睡掉（消息驱动唤醒）
- 标准态/封面态纯走针 → 从 60fps 降到 5Hz 定时节拍（时间字符串每秒才变一次）
- 完全体逐字歌词/辉光律动 → 才用 60fps
- 辉光衰减尾归零后才睡（不会冻在半透明）

### 真凶三：频谱消息风暴（本版根治②③）

旧版两个浪费：**暂停时每秒 20 条空消息**全量广播；**每个开着网页的标签
都订阅频谱**（哪怕在后台）——你开 20 个网页 = 每秒 400 次跨进程消息唤醒。
本版三刀：

- 频谱帧只发给「可见且订阅」的浮窗（后台标签零唤醒）
- 暂停时空消息只发一条（翻转门），不再每秒 20 条
- 标签切后台自动撤订阅 + 扩展的 1 秒状态轮询整体停——**浏览器整个
  后台时，扩展全链静默（hub 零请求、助手引擎零参与、SW 可睡）**

## 升级步骤（本版一件必换 + 一件强烈建议）

1. 「初始」页更新到 v{VER}（覆盖安装 `ChuShi-NewTab-v{VER}.zip`：**删净旧解压目录** → 解压新包 → 扩展页点刷新）
2. **强烈建议**：桥插件换 **{BRIDGE_VER}**（若你还没换——死亡循环根治，替换插件目录后**重启网易云**）
3. SMTC 音乐预设 {PRESET_VER} / 歌词源 {LYRIC_VER} 沿用无需动

## 组件版本

- 「初始」NewTab **v{VER}**（渲染休眠 + 频谱订阅可见性门 + SW 需求门）
- ChuShi Music Bridge **{BRIDGE_VER}**（沿用——引擎零扰律，若已装无需重装）
- SMTC 音乐预设 **{PRESET_VER}**（沿用）
- ChuShi Lyric Source {LYRIC_VER}（沿用）

## 装完怎么自查

- **切到别的应用/最小化浏览器**：任务管理器里 Edge/Chrome 的 CPU 应掉到近零
  （旧版会持续有轮询+渲染开销）
- **后台标签**：随便开 20 个网页放着不动，不应再有可感知的整机负载
- 电音是否根治 → 看 `%LOCALAPPDATA%\\ChuShi\\spectrum-log.txt`：
  无消费者期应出现 `[cap] demand gate: no consumer, engine untouched`，
  且**不再有**每 2-3 分钟一轮的 boot/exit 循环
- 律动/歌词/三态/拖动 → v8.2.4 起全部行为不变（e2e 24 项回归全绿）
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
print(f'  built {allin.name} ({allin.stat().st_size} B)：六件全字节一致')
print(f'ASSETS v{VER} DONE')
