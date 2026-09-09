#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v8.2.0 交付组装：NewTab v8.2.0（悬浮音乐卡 + 律动高光宿主链路）+
cshz 8.2.0（部件律动高光）+ 桥 8.2.0（hub 频谱助手监护 + 助手 exe，必换）+
歌词源 7.3.0（沿用）+ 说明 + SHA256SUMS + AllInOne

v8.2.0 变更（用户两想法）：
  想法一（音乐卡置顶所有网页）：三件套落地——
    ① ext-bg.js（MV3 SW 状态中继：hub 真值 1s 轮询广播 / 命令代理 / 频谱流转发
      / openPanel 聚焦面板页；惰性律：零卡片零轮询）
    ② ext-card.js（<all_urls> 内容脚本：closed Shadow DOM 悬浮迷你卡，拖动+
      位置记忆+药丸收起+按站会话级隐藏+本地插值+封面辉光律动）
    ③ build-extension.py（manifest background/content_scripts/storage+tabs 权限/
      host_permissions +26911-26913）
  想法二（封面高光跟随歌曲律动，方案 A 宪章内实现）：
    chushi-spectrum.exe 独立进程（WASAPI loopback+FFT 16 段+bass，26911-26913），
    hub v8.2.0 只做 CreateProcess+Job 监护（零 COM 宪法门不破），hubsim/spectrumsim
    POSIX 测试替身 e2e 闭环；数据链 hub-boot→助手→smtc.ts 30Hz 包络→sandbox 中继
    →部件 .cs-glow 律动（opacity/transform 合成器友好）。
⚠ Task 110 律：NewTab zip 必须采用 build-extension.py 规范包，组装脚本严禁直接 zip out/。
"""
import hashlib, pathlib, zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / 'download/v8.2.0'
VER = '8.2.0'
BRIDGE_VER = '8.2.0'
LYRIC_VER = '7.3.0'
PRESET_VER = '8.2.0'
BRIDGE_DIR = ROOT / 'bridge/v8/plugins/music-bridge'
LYRIC_DIR = ROOT / 'bridge/v8/plugins/lyric-source'
NATIVE_DIR = ROOT / 'bridge/v8/native'
OUT.mkdir(parents=True, exist_ok=True)

# ---------- 1) 桥 .plugin 8.2.0（hub 频谱助手监护 + 助手 exe，必换） ----------
plugin = OUT / f'ChuShi-Music-Bridge-{BRIDGE_VER}.plugin'
with zipfile.ZipFile(plugin, 'w', zipfile.ZIP_DEFLATED) as z:
    for name in ('manifest.json', 'index.js', 'hub.dll', 'hub.dll.x64.dll', 'chushi-spectrum.exe'):
        p = BRIDGE_DIR / name
        if not p.exists():
            p = NATIVE_DIR / name  # 原生产物从 native 目录取（hub.dll/exe 同源双写）
        if not p.exists():
            raise SystemExit(f'缺文件: {name}（先跑 bash scripts/build-hub-v820.sh）')
        z.write(p, name)
with zipfile.ZipFile(plugin) as z:
    m = z.read('manifest.json').decode('utf-8')
    if '"version": "8.2.0"' not in m:
        raise SystemExit('桥 manifest 版本非 8.2.0——更新信号缺失，拒绝')
print(f'  built {plugin.name} ({plugin.stat().st_size} B)')

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
    bg = z.read('ext-bg.js').decode('utf-8')
    if 'chushi-spectrum' not in bg or 'spectrum-boot' not in bg:
        raise SystemExit('ext-bg.js 缺频谱助手发现特征——拒绝')
print(f'  verified {newtab.name} ({newtab.stat().st_size} B)：manifest {VER} + SW/悬浮卡/频谱端口 + 引擎特征全过')

# ---------- 4) cshz 8.2.0（律动高光 + 既有三律，必换） ----------
src_cshz = ROOT / 'examples' / '初始SMTC音乐预设.cshz'
if not src_cshz.exists():
    raise SystemExit('缺 examples/初始SMTC音乐预设.cshz——先跑 scripts/build-smtc-preset.py')
cshz = OUT / f'ChuShi-Music-Preset-{PRESET_VER}.cshz'
cshz.write_bytes(src_cshz.read_bytes())
with zipfile.ZipFile(cshz) as z:
    m = z.read('manifest.json').decode('utf-8')
    if 'csWbw' not in m or 'scaleY' not in m or 'csForceWord' not in m:
        raise SystemExit('cshz 缺 v8.1.4 特征（csWbw/scaleY/csForceWord）——拒绝')
    if 'beatFrame' not in m or 'cs-glow' not in m:
        raise SystemExit('cshz 缺 v8.2.0 律动高光特征（beatFrame/cs-glow）——拒绝')
print(f'  verified {cshz.name} ({cshz.stat().st_size} B)：v8.1.4 三律 + v8.2.0 律动高光特征门过')

# ---------- 5) 使用说明 ----------
NOTES = f'''# 「初始」v{VER} 使用说明（悬浮音乐卡 + 封面高光律动）

## 本版新增什么（两大想法全落地）

### 想法一：音乐卡片置顶在所有网页上

搜索完跳转到其它页面，也能直接控制音乐——悬浮迷你音乐卡出现在所有 http/https 网页上：

- 迷你卡：封面 + 歌名/歌手 + 上一首/播放暂停/下一首 + 进度条，**点卡片主体回到完整面板**
- 可拖动（位置自动记忆）；点 × 在当前网站隐藏（浏览器重启后还原，不会丢）
- 播放暂停有乐观反馈，命令未送达时卡片不会假装成功
- 诚实边界：chrome:// 设置页、浏览器商店页等浏览器特权页无法显示（Chrome 安全规则，所有扩展都一样）；音乐系统未连接时卡片自动隐没，绝不摆空壳
- 数据面：新增 background 中继（有卡片在线才轮询，零卡片零轮询，不白耗电）

### 想法二：音乐面板封面高光跟随歌曲律动

封面辉光随**系统正在播放的音频**实时起伏（低频驱动，鼓点跟拍）：

- 采集在**独立小进程**里完成（系统声音环回采集 + 频谱分析），崩溃波及不到网易云与浏览器
- 任何应用放歌都有效（网易云/QQ 音乐/浏览器视频…）；暂停即安静回落
- 尊重系统「减少动态效果」设置（开启后高光保持静态）
- 旧 hub（未升级）下高光自动保持静态，不报错不闪烁

## 升级步骤（本版两件必换）

1. 「初始」页更新到 v{VER}（扩展用户覆盖安装 `ChuShi-NewTab-v{VER}.zip`：**删净旧解压目录** → 解压新包 → 扩展页点刷新；网页版 gh-pages 已同步）
2. 更新桥插件到 **{BRIDGE_VER}**（**必换**：内含 hub 8.2.0 + 频谱助手 chushi-spectrum.exe——替换插件目录后**重启网易云**）
3. 重新导入 `ChuShi-Music-Preset-{PRESET_VER}.cshz`（律动高光在预设部件里，必换：dock 部件按钮 → 删除旧「SMTC 音乐」→ 导入新 cshz）
4. 歌词源 {LYRIC_VER} **沿用无需动**
5. 验收：①搜索后跳转任意网页，右上角出现悬浮音乐卡，点它回面板、拖它换位置；②播放音乐时封面辉光随鼓点起伏，暂停即安静
> 提示：插件列表版本显示 **8.2.0** 即为新桥（诊断口 pluginVer 8.1.3 为桥 JS 自报版本，桥 JS 本体未变）；律动依赖 hub 版本 ≥ 8.2.0（诊断口可见）

## 组件版本

- 「初始」NewTab **v{VER}**（ext-bg 中继 + ext-card 悬浮卡 + 频谱宿主链路，CLIENT_VER 8.2.0）
- SMTC 音乐预设 **{PRESET_VER}**（封面高光律动，必换）
- ChuShi Music Bridge **{BRIDGE_VER}**（hub 8.2.0 + chushi-spectrum.exe，必换）
- ChuShi Lyric Source **{LYRIC_VER}**（沿用）
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
