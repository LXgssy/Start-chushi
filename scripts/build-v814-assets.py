#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v8.1.4 交付组装：NewTab v8.1.4（歌词高光三律宿主配套）+
cshz 8.1.4（部件句尾渐隐/回退残留根治/强行逐字开关/进度条 scaleY）+
桥 8.1.3（沿用）+ 歌词源 7.3.0（沿用）+ 说明 + SHA256SUMS + AllInOne

v8.1.4 变更（用户实机反馈，四条）：
  ① 逐字歌词播放完一句，只要没到下一句就持续高亮：
    宿主根因 = unitizeLine 伪逐字时长铺满行距（lrc 行 e=下一行 s、末行
    s+8000）——唱完后扫光仍爬行/停 100% 直到下一句。修复 = 伪逐字时长按
    显示单元加权估算（CJK ~260ms/字、拉丁 ~130ms/词，下限 1.2s，上限行距）。
    部件根因 = 行离场渐隐只挂在 lineIndex 切换上。修复 = 句尾渐隐律：
    扫光到 100% 后 250ms 收尾即进已唱态渐隐，不等下一句。
  ② 回退进度后之前高光过的歌词一直保持高光：
    部件根因 = 行切换只还原「曾 done」的行，曾 on 行的 --p 扫光残留 +
    间奏 ref=回退前行号误标已唱。修复 = 未来行无条件还原未唱态 + 宿主
    alignAt 间奏返回 lastLine（已唱界）。
  ③ 面板新增「强行逐字歌词」开关（默认关）：关 = 无逐字时间轴（lrc）的
    歌词用逐行渲染；开 = 伪逐字（准确率低）；真逐字（yrc）永不降级。
    状态持久化在宿主 storage；配套 widgetHtmlLen 20000→22000 同步放宽。
  ④ 进度条悬停放大动画帧率低：height 过渡每帧触发 layout（backdrop-filter
    卡片内代价极高）→ 改 transform scaleY 合成层动画。
⚠ Task 110 律：NewTab zip 必须采用 build-extension.py 规范包（manifest/
  _locales/icons/内联外置/保留名改造），组装脚本严禁直接 zip out/。
"""
import hashlib, pathlib, zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / 'download/v8.1.4'
VER = '8.1.4'
BRIDGE_VER = '8.1.3'
LYRIC_VER = '7.3.0'
PRESET_VER = '8.1.4'
BRIDGE_DIR = ROOT / 'bridge/v8/plugins/music-bridge'
LYRIC_DIR = ROOT / 'bridge/v8/plugins/lyric-source'
OUT.mkdir(parents=True, exist_ok=True)

# ---------- 1) 桥 .plugin（沿用 8.1.3） ----------
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
    if f'"version": "{VER}"' not in manifest:
        raise SystemExit(f'NewTab zip manifest 版本非 {VER}——规范包过期，重跑 build-extension.py')
    idx = z.read('index.html').decode('utf-8')
    if '<script>' in idx.replace('<script src=', '').replace('<script type=', ''):
        raise SystemExit('index.html 含内联脚本——非规范包（Task 110 回归），拒绝')
    if any(n.startswith('_next/') for n in names):
        raise SystemExit('zip 含 _next 保留名——非规范包（Task 111 回归），拒绝')
    sb = z.read('sandbox.js').decode('utf-8')
    if '恒源钉守' not in sb or 'rejHist' not in sb:
        raise SystemExit('sandbox.js 缺 v8.1.3 恒源钉守特征——引擎回退，拒绝')
    if 'lastLine' not in sb or '伪逐字时长估算律' not in sb or 'src: "yrc"' not in sb:
        raise SystemExit('sandbox.js 缺 v8.1.4 歌词配套特征（lastLine/伪逐字估算/src 标记）——拒绝')
print(f'  verified {newtab.name} ({newtab.stat().st_size} B)：manifest {VER} + 零内联 + 保留名改造 + v8.1.4 歌词配套特征')

# ---------- 4) cshz 8.1.4（部件三律 + 开关，必换） ----------
src_cshz = ROOT / 'examples' / '初始SMTC音乐预设.cshz'
if not src_cshz.exists():
    raise SystemExit('缺 examples/初始SMTC音乐预设.cshz——先跑 scripts/build-smtc-preset.py')
cshz = OUT / f'ChuShi-Music-Preset-{PRESET_VER}.cshz'
cshz.write_bytes(src_cshz.read_bytes())
with zipfile.ZipFile(cshz) as z:
    m = z.read('manifest.json').decode('utf-8')
    if 'csWbw' not in m or 'scaleY' not in m:
        raise SystemExit('cshz 部件缺 v8.1.4 特征（csWbw 开关/scaleY 进度条）——拒绝')
    if 'csForceWord' not in m:
        raise SystemExit('cshz 部件缺 storage 持久化键 csForceWord——拒绝')
print(f'  verified {cshz.name} ({cshz.stat().st_size} B)：csWbw 开关 + scaleY + storage 特征门过')

# ---------- 5) 使用说明 ----------
NOTES = f'''# 「初始」v{VER} 使用说明（歌词高光三律根治 + 强行逐字开关 + 进度条帧率）

## 本版修了什么

### 逐字歌词高光行为（用户实机反馈四条全闭环）

| 反馈 | 根因 | 修复 |
|---|---|---|
| 逐字歌词播放完一句，只要没到下一句，当前句持续高亮 | 双层：① 宿主给纯 lrc 歌生成的伪逐字时间轴**铺满行距**（lrc 行结束时间=下一行开始、末行还 +8 秒）——唱完后扫光仍在爬或停在 100%；② 部件「已唱渐隐」只挂在切行事件上，行不切就永远不隐 | ① 伪逐字时长改按歌词字数**估算实际演唱时长**（约 4 字/秒，下限 1.2s）；② 部件**句尾渐隐律**：扫光到 100% 后保持 250ms 收尾即开始渐隐，不再等下一句开始 |
| 回退歌曲进度后，之前播放过高光的歌词一直保持高光 | 部件行切换只还原「曾标记已唱」的行——正在唱的行扫光进度直接残留；回退落在间奏时「已唱界」还用回退前的行号，把没唱的行误标已唱 | 「当前歌曲位置之后零高光」律：每次切行把已唱界之后的行**无条件还原未唱态**；宿主间奏快照携带已唱界（lastLine），回退落间奏也还原正确 |
| 面板加「强行逐字歌词」选项 | 纯 lrc 歌没有逐字时间轴，此前一律按估算强加逐字效果（准确率低）且无开关 | 面板左下角新增**强行逐字**开关（默认关）：关 = 这类歌词使用逐行歌词；开 = 按估算添加逐字效果（准确率低）。真逐字（逐字时间轴）的歌不受开关影响，永远逐字。开关状态自动记忆 |
| 进度条鼠标悬停放大动画帧率低 | 悬停动画用 height 过渡——每帧触发布局重排（毛玻璃卡片内代价极高） | 改用 transform 缩放合成层动画，只走 GPU 合成不掉帧 |

## 升级步骤

1. 「初始」页更新到 v{VER}（扩展用户覆盖安装 `ChuShi-NewTab-v{VER}.zip`：删净旧解压目录 → 解压新包 → 扩展页点刷新；网页版 gh-pages 已同步上线）
2. 重新导入 `ChuShi-Music-Preset-{PRESET_VER}.cshz`（**句尾渐隐/回退残留/强行逐字开关/进度条帧率四项全在预设部件里，必换**：dock 部件按钮 → 删除旧「SMTC 音乐」→ 导入新 cshz）
3. 桥 8.1.3 / 歌词源 7.3.0 / hub 8.0.9 **全部沿用无需动**
4. 验收：逐字歌词唱完一句 ~0.25s 后开始渐隐；拖回早前位置后未来歌词零高光；面板左下角有「强行逐字」开关且默认灰（关）；悬停进度条放大顺滑
⚠ 旧版「初始」（v8.1.3 及更早）导入本 cshz 会被拒（部件体积门 20000→22000 随宿主同步放宽）——先更新 NewTab 再导入预设

## 组件版本

- 「初始」NewTab **v{VER}**（伪逐字时长估算 + 间奏已唱界 + CLIENT_VER 8.1.4）
- SMTC 音乐预设 **{PRESET_VER}**（句尾渐隐 + 回退残留根治 + 强行逐字开关 + 进度条 scaleY，必换）
- ChuShi Music Bridge **{BRIDGE_VER}**（沿用）
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
