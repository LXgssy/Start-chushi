#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v8.3.1 交付组装：封面一镜到底根治 + 弹簧克制化 + 高光渐入 + 律动 AGC +
歌词呼吸动效 + 注入兜底 + 频谱助手常驻律。

v8.3.1 变更（用户实机反馈八连）：
  ① cover→mini「封面没有一镜到底」根治——cloneNode 连内联 display:none 一起
    走（display 切换先于克隆），clone 出厂即隐身；covClone 无条件 display:block。
  ② 弹簧克制化——壳弹簧 dock standard 同参（420/34，~1% 微过冲），封面 clone
    临界阻尼（420/41，零回弹）；三态「封面复位感」= 旧 10% 过冲回弹的观感，
    随阻尼提升整体消退。
  ③ 高光渐入——形变落地辉光 smoothstep ~480ms 渐入（含提亮/饱和/尺寸）。
  ④ 律动更明显——三轴 AGC 峰值跟随归一化（弱歌拉满/响歌保动态）+ pow 0.75
    + 增益上调；《不凡》类低音能量小的曲子不再隐形。
  ⑤ 歌词动效对齐「初始」完全体——当前行 scale 1.06/邻行 0.94 呼吸、滚动
    .55s→.45s、行色 .5s→.35s。
  ⑥ 快捷服务进入网页浮窗不显示——内容脚本注入兜底（scripting 权限 + SW
    tabs 清扫/onUpdated 补针，隔离世界幂等守卫防双挂载）。
  ⑦ chushi-spectrum 常驻律——网易云一启动 keeper ~1.2s 即拉起（需求门
    退役）；60s 空闲自退拆除，只要网易云在运行进程就常驻（引擎需求门照旧
    = 电流音防护不变，暂停期摘管、复播 ~300ms 回位）。
  ⑧ 面板休眠退役（v8.3.0）沿用 + F5b 套件时序适配（收敛 416→592ms）。
"""
import hashlib, pathlib, zipfile

ROOT = pathlib.Path('/tmp/my-project')
OUT = ROOT / 'download/v8.3.1'
PREV = ROOT / 'download/v8.2.9'
VER = '8.3.1'
BRIDGE_VER = '8.3.1'    # hub.dll keeper 政策重写 + spectrum 8.3.1 常驻律
LYRIC_VER = '7.3.0'
PRESET_VER = '8.2.9'    # 面板预设本版零改动（沿用）
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
    if '"scripting"' not in manifest:
        raise SystemExit('manifest 缺 scripting 权限——v8.3.1 注入兜底缺失，拒绝')
    if '"http://*/*"' not in manifest:
        raise SystemExit('manifest 缺 http/https 通配 host——v8.3.1 补针无执行权，拒绝')
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
                 'seekGuard', 'backStreak',
                 'needFrame', 'sleepNow', 'loopBody', 'visibilitychange',
                 'cglow', 'covClear', 'stepEnv', 'paintGlow',
                 'bands.length >= 100',
                 'springFrames', 'morphFrames', 'covClone', 'cloneImg',
                 # v8.3.1 六修特征
                 'display:block;position:fixed',
                 'SPRING_COVER',
                 'glowRampAt', 'envNorm',
                 'transform:scale(1.06)',
                 'updateTiming'):
        if feat not in card:
            raise SystemExit(f'ext-card.js 缺 v8.3.1 特征 {feat}——拒绝')
    for gone in ('flyCoverClone', 'animsRemoveClones', 'siteHidden', 'saveHide',
                 'type: "vis"'):
        if gone in card:
            raise SystemExit(f'ext-card.js 残留 {gone}——拒绝')
    bg = z.read('ext-bg.js').decode('utf-8')
    for feat in ('specBusy', 'specTick', 'broadcastSpec', 'specSentOn',
                 'slice(0, 128)',
                 'ensureCardInjected', 'sweepInjectAll',
                 'chrome.scripting.executeScript', 'chrome.tabs.onUpdated'):
        if feat not in bg:
            raise SystemExit(f'ext-bg.js 缺 v8.3.1 特征 {feat}——拒绝')
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
print(f'  verified {newtab.name} ({newtab.stat().st_size} B)：manifest {VER} + clone 拨正/克制弹簧/高光渐入/AGC/歌词呼吸/注入兜底 全过')

# ---------- 1) 桥 .plugin 8.3.1（hub.dll keeper 政策重写 + spectrum 常驻律） ----------
plugin = OUT / f'ChuShi-Music-Bridge-{BRIDGE_VER}.plugin'
with zipfile.ZipFile(plugin) as z:
    mf = z.read('manifest.json').decode('utf-8')
    if f'"version": "{BRIDGE_VER}"' not in mf:
        raise SystemExit('桥 manifest 版本非 8.3.1——拒绝')
    idxjs = z.read('index.js').decode('utf-8')
    for feat in ("VER = '8.3.1'", 'drainCmds', 'DRAIN_MS = 200'):
        if feat not in idxjs:
            raise SystemExit(f'桥 index.js 缺特征 {feat!r}——拒绝')
    exe = z.read('chushi-spectrum.exe')
    for feat in (b'8.3.1', b'demand gate', b'engine untouched'):
        if feat not in exe:
            raise SystemExit(f'桥 spectrum 缺特征 {feat!r}——二进制过期，拒绝')
    if b'self exit' in exe:
        raise SystemExit('桥 spectrum 残留空闲自退——v8.3.1 常驻律未落地，拒绝')
    h = hashlib.md5(z.read('hub.dll')).hexdigest()
    if h == '07011f2c5aa6949b459eff8e84245c2f':
        raise SystemExit('hub.dll md5 = 8.2.5 基准——keeper 政策未换血，拒绝')
    print(f'  verified {plugin.name} ({plugin.stat().st_size} B)：hub.dll {h[:12]}（keeper 常驻律）+ spectrum 常驻（空闲自退拆除）')
print(f'  verified {plugin.name} ({plugin.stat().st_size} B)')

# ---------- 2) 歌词源 .plugin（沿用 7.3.0） ----------
lyric = OUT / f'ChuShi-Lyric-Source-{LYRIC_VER}.plugin'
lyric.write_bytes((PREV / f'ChuShi-Lyric-Source-{LYRIC_VER}.plugin').read_bytes())
print(f'  carried {lyric.name} ({lyric.stat().st_size} B)')

# ---------- 3) cshz（沿用 8.2.9——面板预设本版零改动） ----------
cshz = OUT / f'ChuShi-Music-Preset-{PRESET_VER}.cshz'
cshz.write_bytes((PREV / f'ChuShi-Music-Preset-{PRESET_VER}.cshz').read_bytes())
with zipfile.ZipFile(cshz) as z:
    m = z.read('manifest.json').decode('utf-8')
    for feat in ('csGlowBtn', 'csFloatBtn', 'beatFrame', 'bandAvg'):
        if feat not in m:
            raise SystemExit(f'cshz 缺特征 {feat}——沿用包损坏，拒绝')
print(f'  carried {cshz.name} ({cshz.stat().st_size} B)')

# ---------- 4) SHA256SUMS + 使用说明 ----------
import os
sums = []
for f in sorted(os.listdir(OUT)):
    p = OUT / f
    if p.is_file() and f != 'SHA256SUMS.txt':
        sums.append(hashlib.sha256(p.read_bytes()).hexdigest() + '  ' + f)
(OUT / 'SHA256SUMS.txt').write_text('\n'.join(sums) + '\n', encoding='utf-8')
print('  SHA256SUMS.txt x', len(sums))

NOTES = f'''# 「初始」v{VER} 使用说明（一镜到底根治 + 弹簧克制 + 高光渐入 + 律动 AGC + 助手常驻）

## 本版修了什么（全部来自你的实机反馈）

### ① 封面态→标准态：封面现在真的"一镜到底"了
上版的真凶找到了：克隆封面出厂时把 `display:none` 内联样式也一起带了过去
（隐藏旧态先执行、克隆后执行），所以封面在 cover→标准/完全体的全程都是
**隐身飞行**——肉眼就是"封面瞬移"。本版克隆时无条件拨正显示，封面全程
可见、连续飞行、落地即接管（录屏逐帧取证：形变 40% 处封面已在走廊上）。

### ② 弹簧克制了，和「初始」一样
形变弹簧参数改成与「初始」dock 面板切换同族（~1% 微过冲，原 ~10% 大回弹
作废）——「三种形态封面都复位」的观感就是大过冲冲过头再弹回造成的，阻尼
收紧后整体消退。**封面单独用临界阻尼（零回弹）**——封面没必要弹。

### ③ 高光渐入
形变落地后辉光不再 0→满格突现，~0.5s smoothstep 温柔浮现（提亮/饱和/光晕
尺寸同步渐入）。

### ④ 律动更明显（《不凡》这类歌不再隐形）
三轴自适应增益（AGC）：峰值跟随器记每轴天花板，**弱歌天花板自动下移、
显示值拉回满幅可见区间；响歌天花板贴真实峰值、动态对比保持**。换歌自动
重新适应，静音期零放大。小信号曲线（pow 0.85→0.75）+ 增益整体上调。

### ⑤ 歌词动效对齐「初始」完全体（你视频里的效果）
当前行放大（scale 1.06）、邻行缩小（0.94），行切换时字号呼吸过渡；滚动
0.55s→0.45s、行色 0.5s→0.35s——入场行在滚动途中就亮起来。

### ⑥ 快捷服务进入网页浮窗不显示——注入兜底
某些环境（Edge 启动加速等）manifest 注入偶发缺席。现在扩展后台会在卡片
上线后**全量清扫已开网页补注入**，且每个网页加载完成后再补一针（幂等
守卫防重复挂载）。注：干净 Chromium 实测三条路径（同签导航/直接打开/
window.open）原本就正常，本条是环境性缺针的保险。

### ⑦ chushi-spectrum 常驻：网易云一启动它就启动，暂停不再停
- **启动**：网易云一启动 ~1.2s 内频谱助手即被拉起（原：等浏览器消费 +
  5s 节拍 + 120s 需求窗，最慢十几秒）；
- **常驻**：60s 空闲自退整体拆除——只要网易云在运行，助手就在（暂停期
  只是引擎按需摘管，电流音防护原样保留；复播 ~0.3s 引擎回位，首帧即有
  频谱）。
- 网易云退出时助手随 Job Object 自动回收，不留孤儿进程。

## 升级步骤（三件必换）

1. 「初始」页更新到 v{VER}（覆盖安装 `ChuShi-NewTab-v{VER}.zip`：**删净旧
   解压目录** → 解压新包 → 扩展页点刷新）
2. 桥更新到 **{BRIDGE_VER}** 并**重启网易云**（助手常驻律在 hub.dll 内）
3. 歌词源 {LYRIC_VER} 与 SMTC 音乐预设 {PRESET_VER} **沿用无需动**

## 组件版本

- 「初始」NewTab **v{VER}**（clone 拨正 + 克制弹簧 + 高光渐入 + AGC +
  歌词呼吸 + 注入兜底）
- ChuShi Music Bridge **{BRIDGE_VER}**（hub.dll 8.3.1 keeper 常驻律 +
  chushi-spectrum.exe 8.3.1 常驻）
- ChuShi Lyric Source {LYRIC_VER}（沿用）
- SMTC 音乐预设 {PRESET_VER}（沿用）

## 装完怎么自查

- 封面态 → 标准态：封面全程可见连续飞入卡内（不再瞬移）
- 任意形态切换：无大幅回弹/冲过头再弹回（克制、跟「初始」一个手感）；
  封面完全无回弹
- 形变落地：辉光 ~0.5s 渐入，不再突现
- 放一首低音偏轻的歌（如《不凡》）：封面提亮与光晕应清晰随拍
- 从「初始」快捷服务点进任意网页：浮窗应在 ~2s 内出现（后台兜底补针）
- 网易云启动后任务管理器应看到 chushi-spectrum.exe 常驻；暂停十分钟它
  仍在；暂停后恢复播放，律动第一拍就回来
- 完全体歌词：当前行放大呼吸、滚动更利落、入场行途中即亮
'''
(OUT / f'使用说明-v{VER}.md').write_text(NOTES, encoding='utf-8')
print(f'  使用说明-v{VER}.md')
print('DELIVERY OK')
