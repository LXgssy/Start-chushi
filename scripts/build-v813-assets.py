#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v8.1.3 交付组装：NewTab v8.1.3（引擎恒源钉守——歌词卡死 2s 闪烁根治）+
桥 8.1.3（状态推送先行 + 超时收紧——stateAge 峰值腰斩）+ 歌词源 7.3.0（沿用）+
cshz 8.1.2（沿用）+ 说明 + SHA256SUMS + AllInOne

v8.1.3 变更（真机录屏 2026-09-09 18:28，用户：「歌词还是有问题」）：
  部件时间 1:06↔1:08 两秒闪烁、歌词行恒驻不前（肉眼即「歌词冻住」）。
  4fps 逐帧取证：词扫色亮度 2.0s 周期锯齿 = 熔断「拒 1 拍→第 2 拍硬锚」
  循环；页面诊断 stateAge 11.5s = 桥推送停滞。
  ① sandbox.js 引擎恒源钉守：8s 窗口内重现近似拒收值 = 上游停滞铁证 →
    显示封顶在拒收值+0.75（仍在拒收带内），不重锚不回跳；恢复/翻转/拖动
    即解除。配合 v8.1.0 熔断（单次回退仍拒收）双层防锯齿。
  ② music-bridge 状态推送先行：/api/state 提到命令链路之前 + 全链超时
    收紧（poll 1.2s/state 1.5s/selftest 1.2s/cmds 1.2s）——hub 半死时
    单拍最坏 ~5s（旧 ~9.5s），stateAge 峰值腰斩。
  ③ smtc.ts CLIENT_VER 漏升修正（8.0.9→8.1.3）：v8.1.0 起仅改头注释
    未升常量，诊断口 ver 字段误导排查（本次排查被它带偏的第一现场）。
⚠ Task 110 律：NewTab zip 必须采用 build-extension.py 规范包（manifest/
  _locales/icons/内联外置/保留名改造），组装脚本严禁直接 zip out/。
"""
import hashlib, pathlib, zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / 'download/v8.1.3'
VER = '8.1.3'
BRIDGE_VER = '8.1.3'
LYRIC_VER = '7.3.0'
PRESET_VER = '8.1.2'
BRIDGE_DIR = ROOT / 'bridge/v8/plugins/music-bridge'
LYRIC_DIR = ROOT / 'bridge/v8/plugins/lyric-source'
OUT.mkdir(parents=True, exist_ok=True)

# ---------- 1) 桥 .plugin（zip 根部平铺；hub.dll 沿用 8.0.9 双架构） ----------
plugin = OUT / f'ChuShi-Music-Bridge-{BRIDGE_VER}.plugin'
with zipfile.ZipFile(plugin, 'w', zipfile.ZIP_DEFLATED) as z:
    for name in ('manifest.json', 'index.js', 'hub.dll', 'hub.dll.x64.dll'):
        p = BRIDGE_DIR / name
        if not p.exists():
            raise SystemExit(f'缺文件: {p}')
        z.write(p, name)
print(f'  built {plugin.name} ({plugin.stat().st_size} B)')

# ---------- 2) 歌词源 .plugin（沿用 7.3.0） ----------
lyric = OUT / f'ChuShi-Lyric-Source-{LYRIC_VER}.plugin'
with zipfile.ZipFile(lyric, 'w', zipfile.ZIP_DEFLATED) as z:
    for name in ('manifest.json', 'index.js'):
        z.write(LYRIC_DIR / name, name)
print(f'  built {lyric.name} ({lyric.stat().st_size} B)')

# ---------- 3) NewTab zip：直接采用 build-extension.py 规范包（防呆门内嵌） ----------
newtab = OUT / f'ChuShi-NewTab-v{VER}.zip'
if not newtab.exists():
    raise SystemExit(f'缺规范扩展包 {newtab}——先跑 EXTENSION_MODE=1 bun run build:extension + python3 scripts/build-extension.py')
with zipfile.ZipFile(newtab) as z:
    names = z.namelist()
    manifest = z.read('manifest.json').decode('utf-8')
    if '"version": "8.1.3"' not in manifest:
        raise SystemExit('NewTab zip manifest 版本非 8.1.3——规范包过期，重跑 build-extension.py')
    idx = z.read('index.html').decode('utf-8')
    if '<script>' in idx.replace('<script src=', '').replace('<script type=', ''):
        raise SystemExit('index.html 含内联脚本——非规范包（Task 110 回归），拒绝')
    if any(n.startswith('_next/') for n in names):
        raise SystemExit('zip 含 _next 保留名——非规范包（Task 111 回归），拒绝')
    sb = z.read('sandbox.js').decode('utf-8')
    if '恒源钉守' not in sb or 'rejHist' not in sb:
        raise SystemExit('sandbox.js 缺 v8.1.3 恒源钉守特征——引擎未更新，拒绝')
print(f'  verified {newtab.name} ({newtab.stat().st_size} B)：manifest 8.1.3 + 零内联 + 保留名改造 + 恒源钉守特征')

# ---------- 4) cshz（沿用 8.1.2：部件零改动） ----------
src_cshz = ROOT / 'examples' / '初始SMTC音乐预设.cshz'
if not src_cshz.exists():
    raise SystemExit('缺 examples/初始SMTC音乐预设.cshz')
cshz = OUT / f'ChuShi-Music-Preset-{PRESET_VER}.cshz'
cshz.write_bytes(src_cshz.read_bytes())
print(f'  built {cshz.name} ({cshz.stat().st_size} B，沿用 8.1.2)')

# ---------- 5) 使用说明 ----------
NOTES = f'''# 「初始」v{VER} 使用说明（歌词卡死两秒闪烁根治 + 桥推送停滞根治）

## 本版修了什么

### 歌词卡死 / 时间两秒闪烁（用户实机录屏 2026-09-09 18:28：「歌词还是有问题」）

| 现象 | 根因 | 修复 |
|---|---|---|
| 歌曲正常播放，但部件时间在 1:06↔1:08 每 2 秒来回跳、歌词行长时间不动（肉眼看就是「歌词冻住」） | 三层串联：① 桥推送停滞（页面诊断 stateAge 11.5s——hub 半死时 /api/state 排在命令链路三次往返之后，最坏 ~9.5s/拍）；② 页面把陈旧真值 +6s 封顶后每拍喂**恒定位置**；③ v8.1.0 回退熔断遇恒定源变成「拒 1 拍→第 2 拍硬锚回跳」循环 = 2 秒闪烁（录屏 4fps 取证：词扫色亮度 2.0s 周期锯齿实锤） | ① 桥 8.1.3 **状态推送先行**（读真值→推状态提到命令链路之前）+ 全链超时收紧（stateAge 峰值腰斩）；② NewTab v8.1.3 引擎**恒源钉守**：8 秒窗口内重现近似拒收值 = 上游停滞铁证 → 显示封顶在拒收值+0.75 原地保持，绝不向前虚构再拽回；桥恢复/切歌/暂停/拖动立即解除。18 项新增单测 + 48 项回归全绿 |
| （附带修正）诊断口 `_chushiMusicBridge.debug().ver` 一直显示 8.0.9 | v8.1.0 起 `CLIENT_VER` 常量漏升（只改了头注释）——本次排查被它误导的第一现场 | ver 字段现如实显示 8.1.3 |

## 升级步骤

1. 「初始」页更新到 v{VER}（扩展用户覆盖安装 `ChuShi-NewTab-v{VER}.zip`：解压覆盖旧目录 → 扩展页点刷新；网页版 gh-pages 已同步上线）
2. 网易云侧更新 `ChuShi-Music-Bridge-{BRIDGE_VER}.plugin`（**推送先行修复在这里，必换**：BetterNCM 插件页卸载旧桥 → 安装新版）
3. 歌词源 7.3.0 / hub 8.0.9 / cshz 预设 8.1.2 **全部沿用无需动**
4. 面板显示 `已连接 · API v8.1.3 · InfLink-rs v3.2.11` 即正常；`_chushiMusicBridge.debug().stateAge` 应保持 <8s

## 组件版本

- 「初始」NewTab **v{VER}**（引擎恒源钉守 + CLIENT_VER 修正）
- ChuShi Music Bridge **{BRIDGE_VER}**（状态推送先行 + 超时收紧，必换）
- ChuShi Lyric Source **{LYRIC_VER}**（沿用）
- SMTC 音乐预设 **{PRESET_VER}**（沿用）
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
