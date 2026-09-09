#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v8.2.2 交付组装：NewTab v8.2.2（乱跳根治+高光保持+封面态拖动+零跳转）+
桥 8.2.2（hub 日志回退链 + 助手主动保活 + 退出码留痕 + 助手日志固定
%LOCALAPPDATA%\\ChuShi）+ cshz 8.2.2（面板高光保持/ghost 禁拖/写值防抖）+
歌词源 7.3.0（沿用）+ 说明 + SHA256SUMS + AllInOne

v8.2.2 变更（用户实机反馈）：
  ① chushi-spectrum 根本没在跑 + 日志找不到——hub 日志回退链 + 助手主动
    保活（/api/state 附带保障在场）+ 退出码留痕 + 助手日志固定用户目录；
  ② 浮窗歌词乱跳根治——数据面软重锚/回退熔断/seek 护航（sandbox.js 同族
    管线精简移植），面板侧同源问题此前已由 sandbox.js 治理；
  ③ 逐字高光提前消失根治（浮窗+面板）——扫完高光挂住直到行切换渐隐，
    250ms 自动渐隐废弃；间奏段高光同样挂住；done→future 残留修复；
  ④ 浮窗零跳转「初始」（openPanel 全拆）；封面态按住拖动；img ghost 禁拖
    （浮窗+面板）；标准态按钮分行；写值防抖（掉帧治理）。
⚠ Task 110 律：NewTab zip 必须采用 build-extension.py 规范包。
"""
import hashlib, pathlib, zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / 'download/v8.2.2'
VER = '8.2.2'
BRIDGE_VER = '8.2.2'
LYRIC_VER = '7.3.0'
PRESET_VER = '8.2.2'
BRIDGE_DIR = ROOT / 'bridge/v8/plugins/music-bridge'
LYRIC_DIR = ROOT / 'bridge/v8/plugins/lyric-source'
NATIVE_DIR = ROOT / 'bridge/v8/native'
OUT.mkdir(parents=True, exist_ok=True)

# ---------- 1) 桥 .plugin 8.2.2（助手保活+日志双修，必换） ----------
plugin = OUT / f'ChuShi-Music-Bridge-{BRIDGE_VER}.plugin'
with zipfile.ZipFile(plugin, 'w', zipfile.ZIP_DEFLATED) as z:
    for name in ('manifest.json', 'index.js', 'hub.dll', 'hub.dll.x64.dll', 'chushi-spectrum.exe'):
        p = BRIDGE_DIR / name
        if not p.exists():
            p = NATIVE_DIR / name
        if not p.exists():
            raise SystemExit(f'缺文件: {name}（先跑 bash scripts/build-hub-v822.sh）')
        z.write(p, name)
with zipfile.ZipFile(plugin) as z:
    m = z.read('manifest.json').decode('utf-8')
    if '"version": "8.2.2"' not in m:
        raise SystemExit('桥 manifest 版本非 8.2.2——更新信号缺失，拒绝')
    dll = z.read('hub.dll.x64.dll')
    # LOCALAPPDATA/hub-log.txt 是 UTF-16 宽字符——ASCII 搜不到（v8.2.1 教训），
    # 窄特征用日志文案/格式串
    for feat in (b'8.2.2', b'auto-ensure: helper absent', b'helper exited code', b'/api/spectrum-boot'):
        if feat not in dll:
            raise SystemExit(f'hub.dll.x64.dll 缺 v8.2.2 特征 {feat!r}——拒绝')
    exe = z.read('chushi-spectrum.exe')
    # spectrum-log.txt/ChuShi 在 exe 内是 UTF-16 宽字符（日志路径拼接串），
    # ASCII 特征用档位串/启动留痕文案
    for feat in (b'8.2.2', b'process starting', b'local-appdata',
                 b'another instance holds the mutex'):
        if feat not in exe:
            raise SystemExit(f'chushi-spectrum.exe 缺 v8.2.2 特征 {feat!r}——拒绝')
print(f'  built {plugin.name} ({plugin.stat().st_size} B)：保活/退出码/固定日志位特征全在位')

# ---------- 2) 歌词源 .plugin（沿用 7.3.0） ----------
lyric = OUT / f'ChuShi-Lyric-Source-{LYRIC_VER}.plugin'
with zipfile.ZipFile(lyric, 'w', zipfile.ZIP_DEFLATED) as z:
    for name in ('manifest.json', 'index.js'):
        z.write(LYRIC_DIR / name, name)
print(f'  built {lyric.name} ({lyric.stat().st_size} B)')

# ---------- 3) NewTab zip：build-extension.py 规范包（防呆门内嵌） ----------
newtab = OUT / f'ChuShi-NewTab-v{VER}.zip'
if not newtab.exists():
    raise SystemExit(f'缺规范扩展包 {newtab}——先跑 EXTENSION_MODE=1 bun run build:extension + python3 scripts/build-extension.py')
with zipfile.ZipFile(newtab) as z:
    names = set(z.namelist())
    manifest = z.read('manifest.json').decode('utf-8')
    if f'"version": "{VER}"' not in manifest:
        raise SystemExit(f'NewTab zip manifest 版本非 {VER}——规范包过期，重跑 build-extension.py')
    for must in ('ext-bg.js', 'ext-card.js'):
        if must not in names:
            raise SystemExit(f'zip 缺 {must}——非规范包，拒绝')
    if '"background"' not in manifest or '"content_scripts"' not in manifest:
        raise SystemExit('manifest 缺 background/content_scripts——悬浮卡缺失，拒绝')
    if '26911' not in manifest:
        raise SystemExit('manifest 缺频谱助手端口——律动数据面缺失，拒绝')
    idx = z.read('index.html').decode('utf-8')
    if '<script>' in idx.replace('<script src=', '').replace('<script type=', ''):
        raise SystemExit('index.html 含内联脚本——非规范包（Task 110 回归），拒绝')
    if any(n.startswith('_next/') for n in names):
        raise SystemExit('zip 含 _next 保留名——非规范包（Task 111 回归），拒绝')
    sb = z.read('sandbox.js').decode('utf-8')
    if '恒源钉守' not in sb or 'rejHist' not in sb:
        raise SystemExit('sandbox.js 缺 v8.1.3 恒源钉守特征——引擎回退，拒绝')
    if 'lastLine' not in sb or '伪逐字时长估算律' not in sb:
        raise SystemExit('sandbox.js 缺 v8.1.4 歌词配套特征——拒绝')
    if 'setSpectrum' not in sb or 'widgetSmtcSpectrum' not in sb:
        raise SystemExit('sandbox.js 缺 v8.2.0 频谱中继特征——拒绝')
    card = z.read('ext-card.js').decode('utf-8')
    for feat in ('ChuShiLyric', 'fcard', 'flyr-in', 'chushi-card',
                 'ingestTrack', 'reconcileLines', 'posNowOf', 'coverClickBlock',
                 'seekGuard', 'backStreak', 'draggable="false"'):
        if feat not in card:
            raise SystemExit(f'ext-card.js 缺三态/乱跳根治/高光保持特征 {feat}——拒绝')
    if 'postMessage({ type: "openPanel"' in card:
        raise SystemExit('ext-card.js 残留 openPanel 发送方——零跳转律，拒绝')
    bg = z.read('ext-bg.js').decode('utf-8')
    if 'chushi-spectrum' not in bg or 'case "lyric"' not in bg:
        raise SystemExit('ext-bg.js 缺频谱发现/歌词代理特征——拒绝')
    if 'case "openPanel"' in bg:
        raise SystemExit('ext-bg.js 残留 openPanel 转发——零跳转律，拒绝')
    if 'ne.ts' not in bg:
        raise SystemExit('ext-bg.js 缺 ne.ts 采样时刻透传——乱跳根治数据面缺失，拒绝')
print(f'  verified {newtab.name} ({newtab.stat().st_size} B)：manifest {VER} + 乱跳根治/高光保持/零跳转特征全过')

# ---------- 4) cshz 8.2.2（面板高光保持/ghost 禁拖/写值防抖） ----------
src_cshz = ROOT / 'examples' / '初始SMTC音乐预设.cshz'
if not src_cshz.exists():
    raise SystemExit('缺 examples/初始SMTC音乐预设.cshz')
cshz = OUT / f'ChuShi-Music-Preset-{PRESET_VER}.cshz'
cshz.write_bytes(src_cshz.read_bytes())
with zipfile.ZipFile(cshz) as z:
    m = z.read('manifest.json').decode('utf-8')
    if 'beatFrame' not in m or 'cs-glow' not in m:
        raise SystemExit('cshz 缺 v8.2.0 律动高光特征——拒绝')
    if 'reconcileLines' not in m or 'lastLine' not in m:
        raise SystemExit('cshz 缺 v8.2.2 高光保持特征——先重跑 build-smtc-preset.py，拒绝')
    if 'user-drag' not in m or 'draggable' not in m:
        raise SystemExit('cshz 缺 v8.2.2 封面 ghost 禁拖特征——拒绝')
print(f'  verified {cshz.name} ({cshz.stat().st_size} B)：8.2.2 高光保持/禁拖/防抖特征全过')

# ---------- 5) 使用说明 ----------
NOTES = f'''# 「初始」v{VER} 使用说明（乱跳根治 + 高光保持 + 频谱保活与日志定位）

## 本版修什么（实机反馈全落地）

### ① chushi-spectrum 没在跑 / 日志找不到——双根治

- **日志位置（唯一）**：`%LOCALAPPDATA%\\ChuShi\\spectrum-log.txt`（助手）
  与 `%LOCALAPPDATA%\\ChuShi\\hub-log.txt`（枢纽，本版新增）。再也不会
  因为插件目录只读而"日志消失"——两个日志都固定写用户目录
- **为什么之前没在跑**：旧版只有扩展在线且播放中才会触发拉起助手；
  本版 hub 收到任何 `/api/state` 请求（桥每秒推状态）就**主动保障助手
  在场**（20s 冷却，探测在前）——只要网易云开着、桥活着，助手就会被拉起
- **如果还是没跑，日志会告诉你为什么**：hub 日志新增助手**退出码留痕**
  （`[spec] helper exited code=0xC0000135` = 缺运行库、`=0xC0000022` =
  被杀毒拦截等）；助手自身启动最先写日志（含被互斥体挡住/端口占用）
- 验收三步：①重启网易云（换完 8.2.2 桥之后）；②任务管理器搜
  `chushi-spectrum`；③看 `%LOCALAPPDATA%\\ChuShi\\` 两个日志的首行

### ② 浮窗歌词乱跳——根治（数据面）

- 真因：浮窗每秒拿到一次真值就**硬换锚点**，锚点年龄抖动让显示位置
  每秒向后锯齿一次，逐字歌词在行界来回跥（「初始」面板早有同族防护，
  浮窗这次补齐同款管线）
- 修法（与面板同律）：真值按偏差分带——微噪平滑吸收（800ms 软重锚）、
  回退拍先拒收（连续 2 拍才放行）、seek 后乐观重锚 + 护航窗（拖动后
  进度条不回弹）

### ③ 逐字歌词高光提前消失——根治（浮窗 + 面板同律）

- 旧行为：一句唱完 250ms 后高光就渐隐了——下一句还没开始高光就没了
- 新律：**唱完的行高光一直挂住，直到下一句开始才随行切换渐隐**；
  间奏段同样挂住；面板与浮窗一致
- 附带修复：seek 回退时曾唱行的白色定格残留（v8.1.4 的 clean 标记漏洞）

### ④ 浮窗交互整改

- **浮窗任何位置点击都不再跳转「初始」**（包括点歌名）
- **封面态可以拖动了**：按住封面拖动即可移窗；单击仍是展开标准卡
  （拖动后 350ms 内的松手不会误触发展开）
- **封面禁止原生拖拽鬼影**（浮窗与「初始」面板都处理了——拖窗口时
  封面不会再被浏览器当图片拖走）
- **标准态按钮分行**：右上角[收起成封面][放大到完全体]独立顶带，
  与上一首/播放/下一首明确分开，不再挤在一起
- 写值防抖：逐字扫光/时间/进度只在变化时写 DOM（掉帧治理）

## 升级步骤（本版两件必换）

1. 「初始」页更新到 v{VER}（覆盖安装 `ChuShi-NewTab-v{VER}.zip`：**删净旧解压目录** → 解压新包 → 扩展页点刷新）
2. 更新桥插件到 **{BRIDGE_VER}**（**必换**：hub 带保活+日志双修、助手 8.2.2——替换插件目录后**重启网易云**）
3. SMTC 音乐预设 **{PRESET_VER}**（**必换**：面板高光保持/禁拖/防抖——⌘K 导入新 cshz）；
   歌词源 {LYRIC_VER} 沿用无需动

## 组件版本

- 「初始」NewTab **v{VER}**（数据面软重锚 + 高光保持律 + 零跳转 + 封面态拖动）
- ChuShi Music Bridge **{BRIDGE_VER}**（hub 保活/日志回退链/退出码留痕；助手 8.2.2 固定日志位）
- SMTC 音乐预设 **{PRESET_VER}**（面板高光保持 + ghost 禁拖 + 写值防抖）
- ChuShi Lyric Source {LYRIC_VER}（沿用）
- InfLink-rs 3.2.11（保持启用）
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

aio = OUT / f'ChuShi-v{VER}-AllInOne.zip'
if aio.exists():
    aio.unlink()
with zipfile.ZipFile(aio, 'w', zipfile.ZIP_DEFLATED) as z:
    for p in sorted(staged):
        z.write(p, p.name)
    z.write(sums, 'SHA256SUMS.txt')
print(f'  built {aio.name} ({aio.stat().st_size} B)')
print(f'\nDONE v{VER}')
