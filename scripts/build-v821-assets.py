#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v8.2.1 交付组装：NewTab v8.2.1（悬浮卡三态+完全体歌词）+
桥 8.2.1（助手日志回退链）+ cshz 8.2.0（沿用）+ 歌词源 7.3.0（沿用）+
说明 + SHA256SUMS + AllInOne

v8.2.1 变更（用户三条实机反馈）：
  ① spectrum-log.txt 找不到根治——助手日志写盘回退链（exe 同目录试写失败 →
    %LOCALAPPDATA%\\ChuShi\\），启动首行自证实际路径；
  ② 浮窗三态——封面收起态（单击展开，替退役药丸）/ 标准态（右上角 × 退役 →
    [收起成封面][放大到完全体]，点进度条展开完全体不再跳转「初始」）/
    完全体（逐字+逐行歌词：句尾渐隐/回退还原/间奏/翻译/暂停淡出全律随行，
    时间显示 + 可 seek 进度条）；
  ③ 封面禁拖——封面纯点击目标，拖动把手只在主体空白（防拖窗口误触）。
⚠ Task 110 律：NewTab zip 必须采用 build-extension.py 规范包。
"""
import hashlib, pathlib, zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / 'download/v8.2.1'
VER = '8.2.1'
BRIDGE_VER = '8.2.1'
LYRIC_VER = '7.3.0'
PRESET_VER = '8.2.0'
BRIDGE_DIR = ROOT / 'bridge/v8/plugins/music-bridge'
LYRIC_DIR = ROOT / 'bridge/v8/plugins/lyric-source'
NATIVE_DIR = ROOT / 'bridge/v8/native'
OUT.mkdir(parents=True, exist_ok=True)

# ---------- 1) 桥 .plugin 8.2.1（助手日志回退链，必换） ----------
plugin = OUT / f'ChuShi-Music-Bridge-{BRIDGE_VER}.plugin'
with zipfile.ZipFile(plugin, 'w', zipfile.ZIP_DEFLATED) as z:
    for name in ('manifest.json', 'index.js', 'hub.dll', 'hub.dll.x64.dll', 'chushi-spectrum.exe'):
        p = BRIDGE_DIR / name
        if not p.exists():
            p = NATIVE_DIR / name
        if not p.exists():
            raise SystemExit(f'缺文件: {name}（先跑 bash scripts/build-hub-v821.sh）')
        z.write(p, name)
with zipfile.ZipFile(plugin) as z:
    m = z.read('manifest.json').decode('utf-8')
    if '"version": "8.2.1"' not in m:
        raise SystemExit('桥 manifest 版本非 8.2.1——更新信号缺失，拒绝')
    exe = z.read('chushi-spectrum.exe')
    # LOCALAPPDATA 为宽字符（UTF-16）——窄特征用 logModeText() 的档位串
    if b'8.2.1' not in exe or b'log file' not in exe or b'local-appdata' not in exe:
        raise SystemExit('chushi-spectrum.exe 缺 v8.2.1 日志回退特征——拒绝')
print(f'  built {plugin.name} ({plugin.stat().st_size} B)：助手日志回退特征在位')

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
    for feat in ('ChuShiLyric', 'parseWordText', 'fcard', 'flyr-in', 'chushi-card'):
        if feat not in card:
            raise SystemExit(f'ext-card.js 缺三态/歌词引擎特征 {feat}——拒绝')
    bg = z.read('ext-bg.js').decode('utf-8')
    if 'chushi-spectrum' not in bg or 'case "lyric"' not in bg:
        raise SystemExit('ext-bg.js 缺频谱发现/歌词代理特征——拒绝')
print(f'  verified {newtab.name} ({newtab.stat().st_size} B)：manifest {VER} + 三态卡/歌词引擎/频谱/引擎特征全过')

# ---------- 4) cshz 8.2.0（沿用：部件未改） ----------
src_cshz = ROOT / 'examples' / '初始SMTC音乐预设.cshz'
if not src_cshz.exists():
    raise SystemExit('缺 examples/初始SMTC音乐预设.cshz')
cshz = OUT / f'ChuShi-Music-Preset-{PRESET_VER}.cshz'
cshz.write_bytes(src_cshz.read_bytes())
with zipfile.ZipFile(cshz) as z:
    m = z.read('manifest.json').decode('utf-8')
    if 'beatFrame' not in m or 'cs-glow' not in m:
        raise SystemExit('cshz 缺 v8.2.0 律动高光特征——拒绝')
print(f'  verified {cshz.name} ({cshz.stat().st_size} B)：8.2.0 律动特征在位（沿用）')

# ---------- 5) 使用说明 ----------
NOTES = f'''# 「初始」v{VER} 使用说明（浮窗三态 + 完全体歌词 + 频谱日志可发现）

## 本版修什么（三条实机反馈全落地）

### ① spectrum-log.txt 找不到——根治

- 真因：频谱助手的日志写在**自己 exe 旁边**（与 hub.dll 同目录），但网易云插件目录
  常在 Program Files 下，普通权限进程**写不进去且此前不报错**——文件根本没生成
- 本版带回退链：exe 同目录试写失败 → 自动退到 `%LOCALAPPDATA%\\ChuShi\\spectrum-log.txt`
- 日志首行自证实际路径（`[boot] log file (...)`），永远找得到
- 排查三步：①任务管理器搜 `chushi-spectrum` 是否在跑；②在跑就先看 hub.dll 旁，
  再看 `%LOCALAPPDATA%\\ChuShi\\`；③不在跑 = hub 没拉起——确认桥已是 8.2.x 并**重启过网易云**，
  再到「初始」诊断口看 hubLog 是否有 `[spec]` 行

### ② 浮窗三个状态（重构）

- **封面态**：整个卡只显示封面，播放中右下角绿点；**单击封面展开标准卡**
  （旧「药丸收起」退役；旧用户会自动迁移成封面态）
- **标准态**：原迷你卡。右上角 × 退役，改为 **[收起成封面][放大到完全体]**（放大钮在原 × 位）
- **完全体**：与「初始」页音乐卡片同级——**逐字歌词（yrc 真时间轴扫光）与逐行歌词（lrc）
  都支持**，含句尾渐隐、回退还原、间奏灰、翻译行、暂停淡出；另有时间显示与
  **可点按跳转（seek）的进度条**
- **点进度条 = 展开完全体**（不再跳转回「初始」页）；标准态点卡片主体仍是回面板
- 歌词数据经后台中继拉取，切歌自动跟随（songId 归属校验，绝不串歌）

### ③ 封面禁拖

- 封面是纯点击目标，不再触发拖动——拖动把手只在卡片主体空白处（标题区/留白），
  拖窗口不会再误触；封面态本身不可拖，单击展开后再拖

## 升级步骤（本版两件必换）

1. 「初始」页更新到 v{VER}（覆盖安装 `ChuShi-NewTab-v{VER}.zip`：**删净旧解压目录** → 解压新包 → 扩展页点刷新）
2. 更新桥插件到 **{BRIDGE_VER}**（**必换**：内含 8.2.1 频谱助手——替换插件目录后**重启网易云**）
3. SMTC 音乐预设 {PRESET_VER} / 歌词源 {LYRIC_VER} **沿用无需动**

## 组件版本

- 「初始」NewTab **v{VER}**（浮窗三态 + 完全体歌词引擎 + SW 歌词代理）
- ChuShi Music Bridge **{BRIDGE_VER}**（chushi-spectrum.exe 8.2.1 日志回退；hub/桥 JS 沿用 8.2.0 行为）
- SMTC 音乐预设 {PRESET_VER}（沿用）
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
