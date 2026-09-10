#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v8.2.5 交付组装：电流音根治·引擎零扰律

v8.2.5 变更（用户 v8.2.4 实测电音依旧 + 「关扩展/移桥即消」对照实验定位）：
  ① 需求门挡在引擎门口——零消费者绝不 Initialize/Start loopback（连 COM 都
    不初始化）；link down 的 retry 归途同门。日志实锤 served=0 时仍每 5s 一次
    0x88890004 → reinit = 驱动节能拉闸 × 本程序唤醒 = 扬声器上下电 pop 循环。
  ② 退避真实化——consecDown 归零挪到「稳定运行 ≥60s」，退避 800ms→30s 封顶。
  ③ 撤 MMCSS "Pro Audio"（v8.2.4 误方）→ BELOW_NORMAL 让核。
  ④ FFT 20Hz 节流（DSP CPU -80%）。
  ⑤ hub 中继/keeper 线程 BELOW_NORMAL（网易云进程内让核给音频）。
  ⑥ SW/宿主频谱轮询 33ms→50ms（60→40 req/s，与助手发布节奏对齐）。
⚠ Task 110 律：NewTab zip 必须采用 build-extension.py 规范包。
⚠ Task 87 律：plugins 目录陈货必须与 native 同步（md5 对拍）。
"""
import hashlib, pathlib, zipfile

ROOT = pathlib.Path('/tmp/my-project')
OUT = ROOT / 'download/v8.2.5'
VER = '8.2.5'
BRIDGE_VER = '8.2.5'
LYRIC_VER = '7.3.0'
PRESET_VER = '8.2.4'   # cshz 本轮零改动，沿用 8.2.4
BRIDGE_DIR = ROOT / 'bridge/v8/plugins/music-bridge'
LYRIC_DIR = ROOT / 'bridge/v8/plugins/lyric-source'
NATIVE_DIR = ROOT / 'bridge/v8/native'
OUT.mkdir(parents=True, exist_ok=True)

# ---------- 0) plugins 目录陈货对拍（Task 87 律） ----------
for name in ('hub.dll', 'hub.dll.x64.dll', 'chushi-spectrum.exe'):
    a = (NATIVE_DIR / name).read_bytes()
    b = (BRIDGE_DIR / name).read_bytes()
    if hashlib.md5(a).hexdigest() != hashlib.md5(b).hexdigest():
        raise SystemExit(f'plugins 目录 {name} 与 native 不一致——先同步再打包')
print('  plugins/native md5 对拍一致')

# ---------- 1) 桥 .plugin 8.2.5（电流音根治，必换） ----------
plugin = OUT / f'ChuShi-Music-Bridge-{BRIDGE_VER}.plugin'
with zipfile.ZipFile(plugin, 'w', zipfile.ZIP_DEFLATED) as z:
    for name in ('manifest.json', 'index.js', 'hub.dll', 'hub.dll.x64.dll', 'chushi-spectrum.exe'):
        p = BRIDGE_DIR / name
        if not p.exists():
            p = NATIVE_DIR / name
        if not p.exists():
            raise SystemExit(f'缺文件: {name}（先跑 bash scripts/build-hub-v825.sh）')
        z.write(p, name)
with zipfile.ZipFile(plugin) as z:
    m = z.read('manifest.json').decode('utf-8')
    if '"version": "8.2.5"' not in m:
        raise SystemExit('桥 manifest 版本非 8.2.5——更新信号缺失，拒绝')
    exe = z.read('chushi-spectrum.exe')
    # 宽字符教训：ASCII 特征只能搜窄文案串（v8.2.1/v8.2.2 教训）
    for feat in (b'8.2.5', b'process starting', b'[dsp] pkts=',
                 b'demand gate', b'engine untouched', b'link down (storm',
                 b'loopback paused', b'consumer back', b'graceful teardown'):
        if feat not in exe:
            raise SystemExit(f'chushi-spectrum.exe 缺 v8.2.5 特征 {feat!r}——拒绝')
    if b'Pro Audio' in exe:
        raise SystemExit('chushi-spectrum.exe 残留 MMCSS "Pro Audio"——v8.2.4 误方必须撤净，拒绝')
    for dllname in ('hub.dll', 'hub.dll.x64.dll'):
        dll = z.read(dllname)
        if b'8.2.5' not in dll:
            raise SystemExit(f'{dllname} 缺 8.2.5 版本串——拒绝')
        for feat in (b'demand fresh', b'keeper'):
            if feat not in dll:
                raise SystemExit(f'{dllname} 缺 keeper/需求门特征 {feat!r}——拒绝')
print(f'  built {plugin.name} ({plugin.stat().st_size} B)：需求门/退避真实化/撤MMCSS/20Hz 特征全在位')

# ---------- 2) 歌词源 .plugin（沿用 7.3.0） ----------
lyric = OUT / f'ChuShi-Lyric-Source-{LYRIC_VER}.plugin'
with zipfile.ZipFile(lyric, 'w', zipfile.ZIP_DEFLATED) as z:
    for name in ('manifest.json', 'index.js'):
        z.write(LYRIC_DIR / name, name)
print(f'  built {lyric.name} ({lyric.stat().st_size} B)')

# ---------- 3) NewTab zip：build-extension.py 规范包（防呆门内嵌） ----------
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
    sb = z.read('sandbox.js').decode('utf-8')
    if 'setSpectrum' not in sb or 'widgetSmtcSpectrum' not in sb:
        raise SystemExit('sandbox.js 缺 v8.2.0 频谱中继特征——拒绝')
    card = z.read('ext-card.js').decode('utf-8')
    for feat in ('ChuShiLyric', 'fcard', 'chushi-card',
                 'ingestTrack', 'reconcileLines', 'posNowOf', 'coverClickBlock',
                 'seekGuard', 'backStreak', 'draggable="false"',
                 'z-index:1', 'cardAcc', 'applyAcc', '#b4b4bc', '.mtm',
                 'n.lineIndex === activeLine'):
        if feat not in card:
            raise SystemExit(f'ext-card.js 缺三态特征 {feat}——拒绝')
    bg = z.read('ext-bg.js').decode('utf-8')
    for feat in ('specBusy', 'specTick', 'bootBeats >= 100', '}, 50);', 'v8.2.5'):
        if feat not in bg:
            raise SystemExit(f'ext-bg.js 缺 v8.2.5 特征 {feat}——拒绝')
    if '}, 33);' in bg:
        raise SystemExit('ext-bg.js 残留 33ms 定时器——20Hz 轮询未生效，拒绝')
    if 'case "openPanel"' in bg:
        raise SystemExit('ext-bg.js 残留 openPanel 转发——零跳转律，拒绝')
    # 宿主 bundle 里 CLIENT_VER 8.2.5（smtc.ts 编译产物）
    hits = [n for n in names if n.startswith(('ext-script-', 'next/'))]
    ver_hit = False
    for n in hits:
        try:
            if '8.2.5' in z.read(n).decode('utf-8', errors='ignore'):
                ver_hit = True
                break
        except Exception:
            pass
    if not ver_hit:
        raise SystemExit('宿主 bundle 缺 CLIENT_VER 8.2.5——smtc.ts 未重构建，拒绝')
print(f'  verified {newtab.name} ({newtab.stat().st_size} B)：manifest {VER} + 20Hz 轮询 + CLIENT_VER 全过')

# ---------- 4) cshz 8.2.4（沿用） ----------
src_cshz = ROOT / 'examples' / '初始SMTC音乐预设.cshz'
if not src_cshz.exists():
    raise SystemExit('缺 examples/初始SMTC音乐预设.cshz')
cshz = OUT / f'ChuShi-Music-Preset-{PRESET_VER}.cshz'
cshz.write_bytes(src_cshz.read_bytes())
with zipfile.ZipFile(cshz) as z:
    mm = z.read('manifest.json').decode('utf-8')
    if 'beatFrame' not in mm or 'cs-glow' not in mm:
        raise SystemExit('cshz 缺 v8.2.0 律动高光特征——拒绝')
    if 'n.lineIndex === activeLine' not in mm:
        raise SystemExit('cshz 缺 v8.2.4 yrc 保持门特征——拒绝')
print(f'  verified {cshz.name} ({cshz.stat().st_size} B)：8.2.4 沿用（本轮零改动）')

# ---------- 5) 使用说明 ----------
NOTES = f'''# 「初始」v{VER} 使用说明（电流音根治·引擎零扰律）

## 本版修什么

### 扬声器电流音——v8.2.4 后仍存在的真凶抓到了（引擎零扰律四刀）

你上次实验（关扩展 + 移桥 → 电音消失）把噪声窗钉死在了频谱采集链路上。
日志实锤：没有消费者时（served=0），助手仍每 5 秒一次「设备失效 → 重
初始化」——**loopback 采集客户端的反复挂载/摘除本身就是对音频引擎的折腾**：
驱动对「没有活跃声音流」的输出端点会节能拉闸，我们的重初始化又把端点
唤醒，扬声器就这样被反复上下电——你听到的电流音/噗噗声就是这个循环。

v8.2.4 的「按需采集」只挡住了已连接后的暂停态，没挡住这个重初始化循环
（而且旧退避在「连上又断开」的风暴面前等于没有）。

本版四刀：

- **刀一 · 需求门挡在引擎门口**：没有消费者（面板没开、浮窗没在放歌页）
  时，助手**连 COM 都不初始化、绝不创建 loopback**——音频引擎上零客户端，
  驱动彻底安静。link 断开后的重试也过同一道门
- **刀二 · 退避真实化**：连上后稳定运行满 60 秒才算健康；没到 60 秒就断
  = 驱动拉闸风暴，重试间隔从 800ms 逐级退到 30 秒封顶，风暴自然衰减
- **刀三 · 撤掉 v8.2.4 误加的 MMCSS "Pro Audio"**：采集线程被提到与音频
  引擎同档做 FFT 反而抢调度；现改「低于正常」优先级，永远让核给引擎和
  网易云（hub 的中继/看护线程也一并降级——它们住在网易云进程里）
- **刀四 · 全链减负**：频谱发布与轮询统一 20Hz（原 30Hz 轮询 ×2 路），
  本机回环每秒请求数 -33%，DSP 计算 -80%；律动顺滑度无感（C 侧本就
  20Hz 快攻慢放包络）

### 其余修复（v8.2.4 已含，本版继续有效）

- 律动复活（FFT 幅域归一，`[dsp]` 行 bass 随拍起伏）
- 面板重连 / 浮窗控制失灵（hub keeper 线程 + 需求门，请求热路零阻塞）
- 真 yrc 逐字高光保持到下一行（浮窗 + 面板同律）

## 升级步骤（本版两件必换）

1. 「初始」页更新到 v{VER}（覆盖安装 `ChuShi-NewTab-v{VER}.zip`：**删净旧解压目录** → 解压新包 → 扩展页点刷新）
2. 更新桥插件到 **{BRIDGE_VER}**（**必换**：需求门/退避/撤 MMCSS——替换插件目录后**重启网易云**）
3. SMTC 音乐预设 **{PRESET_VER}** 沿用无需动；歌词源 {LYRIC_VER} 沿用

## 组件版本

- 「初始」NewTab **v{VER}**（SW 20Hz 轮询）
- ChuShi Music Bridge **{BRIDGE_VER}**（助手 8.2.5 引擎零扰律；hub 8.2.5 让核）
- SMTC 音乐预设 **{PRESET_VER}**（沿用）
- ChuShi Lyric Source {LYRIC_VER}（沿用）
- InfLink-rs 3.2.11（保持启用）

## 排障口令

- 电音是否根治？→ 关掉所有「初始」页 + 隐藏浮窗 10 秒后，日志应出现
  `[cap] demand gate: no consumer, engine untouched`（此后引擎零客户端，
  连挂载都没有）；打开面板/浮窗且播放中才会看到 `loopback up`
- 若播放中仍有轻微杂音 → 试关掉系统音效增强（Realtek 音效/DTS/杜比 APO
  对 loopback 采集的兼容性问题，属驱动侧），并把结果日志发我
- 律动是否正常？→ 日志 `[dsp]` 行 bass 0~1 摆动、pkts 在涨
'''
notes = OUT / f'ChuShi-v{VER}-Usage-Notes.md'
notes.write_text(NOTES, encoding='utf-8')
print(f'  built {notes.name}')

# ---------- 6) SHA256SUMS + AllInOne ----------
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
print('ASSETS v8.2.5 DONE')
