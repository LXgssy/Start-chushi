#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v8.3.6 交付组装：歌词左右截断（浮窗 + 面板）+ 切新词复位 + 播放键按下位移。

本版为补丁版：本次修复只落在两处源文件——
  · extension-src/ext-card.js                （浮窗歌词左右截断）
  · preset-src/smtc/music-widget.html        （面板：截断 + 切新词复位 + 按下位移）
因此宿主 bundle 不重建、桥与歌词源原样沿用；NewTab 包在上一版规范包（v8.3.5）上
原位打 ext-card 补丁 + 升 manifest 版本，预设取 examples/初始SMTC音乐预设.cshz（已重打）。

用法: python3 scripts/build-v836-assets.py <repo-root>
"""
import hashlib, json, pathlib, sys, zipfile

ROOT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '.')
OUT = ROOT / 'download/v8.3.6'
PREV = ROOT / 'download/v8.3.5'
VER = '8.3.6'
BRIDGE_VER = '8.3.5'   # 沿用（本版未改桥）
LYRIC_VER = '7.3.0'    # 沿用
PRESET_VER = '8.3.6'
OUT.mkdir(parents=True, exist_ok=True)

# ext-card.js（浮窗）本版补丁：截断四修（与 scripts/patch-v836-ext.py 同源）
EXT_FIX = [
  (".flyr-in{position:absolute;left:0;right:0;top:0;", ".flyr-in{position:absolute;left:9px;right:9px;top:0;"),
  ("line-height:1.45;' +", "line-height:1.45;overflow-wrap:anywhere;' +"),
  (".fsubw{display:grid;grid-template-rows:1fr;", ".fsubw{display:grid;grid-template-columns:minmax(0,1fr);grid-template-rows:1fr;"),
  ("white-space:nowrap;text-overflow:ellipsis}' +", "white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +"),
]
# 面板 cshz 本版特征门
CSHZ_FEAT = ('css left:9px', 'grid minmax', 'sub overflow', 'overflow-wrap',
             'active non-geo', 'lyricSig', 'no identity gate')

def need(cond, msg):
    if not cond:
        raise SystemExit('  ✗ ' + msg)

# ---------- 1) NewTab：上一版规范包 + ext-card 补丁 + manifest -> 8.3.6 ----------
base = PREV / f'ChuShi-NewTab-v8.3.5.zip'
need(base.exists(), f'缺上一版规范包 {base}')
zin = zipfile.ZipFile(base)
card = zin.read('ext-card.js').decode('utf-8')
for old, new in EXT_FIX:
    need(card.count(old) == 1, f'ext-card 补丁串命中 {card.count(old)} 次：{old[:50]}')
    card = card.replace(old, new)
need('M6 4l12 8-12 8V4z' not in card, '▶ 不应再是 M6')
need(card.count('M8 4l12 8-12 8V4z') == 2, '▶ 应为原生 M8（mini+full 两处）')
mf = json.loads(zin.read('manifest.json').decode('utf-8'))
need(mf.get('version') == '8.3.5', '上一版包 manifest 版本非 8.3.5')
need('geolocation' not in (mf.get('permissions') or []), '上一版包 manifest 已含 geolocation')
mf['version'] = '8.3.6'
# v8.3.6 补齐 geolocation：扩展页 navigator.geolocation 必须有该权限，
# 否则天气「定位」按钮拿不到坐标（网页版标准 Web 权限流程不受影响）。
mf['permissions'] = list(mf.get('permissions') or []) + ['geolocation']
man = json.dumps(mf, ensure_ascii=False, indent=2) + '\n'
newtab = OUT / f'ChuShi-NewTab-v{VER}.zip'
with zipfile.ZipFile(newtab, 'w', zipfile.ZIP_DEFLATED) as z:
    for e in zin.infolist():
        if e.filename == 'ext-card.js':
            z.writestr(e, card.encode('utf-8'))
        elif e.filename == 'manifest.json':
            z.writestr(e, man.encode('utf-8'))
        else:
            z.writestr(e, zin.read(e.filename))
with zipfile.ZipFile(newtab) as z:
    names = set(z.namelist())
    for must in ('ext-bg.js', 'ext-card.js', 'sandbox.js', 'manifest.json', 'index.html'):
        need(must in names, f'zip 缺 {must}')
    mf2 = json.loads(z.read('manifest.json').decode('utf-8'))
    need(mf2.get('version') == '8.3.6', 'manifest 未升到 8.3.6')
    need('geolocation' in (mf2.get('permissions') or []), '新包 manifest 缺 geolocation 权限')
    for _p in ('storage', 'tabs', 'scripting'):
        need(_p in (mf2.get('permissions') or []), f'新包 manifest 缺 {_p}')
    c2 = z.read('ext-card.js').decode('utf-8')
    for feat in ('left:9px;right:9px', 'grid-template-columns:minmax(0,1fr)',
                 'nowrap;overflow:hidden;text-overflow:ellipsis', 'overflow-wrap:anywhere',
                 'M8 4l12 8-12 8V4z'):
        need(feat in c2, f'ext-card.js 缺特征 {feat}')
print(f'  built {newtab.name} ({newtab.stat().st_size} B)：ext-card 截断四修 + manifest {VER}')

# ---------- 2) cshz 8.3.6（面板三修）----------
src_cshz = ROOT / 'examples' / '初始SMTC音乐预设.cshz'
need(src_cshz.exists(), '缺 examples/初始SMTC音乐预设.cshz')
cshz = OUT / f'ChuShi-Music-Preset-{PRESET_VER}.cshz'
cshz.write_bytes(src_cshz.read_bytes())
with zipfile.ZipFile(cshz) as z:
    h = z.read('manifest.json').decode('utf-8')
    need('left:9px;right:9px' in h, 'cshz 缺歌词呼吸位')
    need('grid-template-columns:minmax(0,1fr)' in h, 'cshz 缺翻译行列锁宽')
    need('nowrap;overflow:hidden;text-overflow:ellipsis' in h, 'cshz 缺省略号')
    need('overflow-wrap:anywhere' in h, 'cshz 缺断行兜底')
    need('transform:none;filter:brightness(.94)' in h, 'cshz 缺按下位移修')
    need('lyricSig' in h, 'cshz 缺内容指纹重建门')
    need('l === lyRef' not in h, 'cshz 仍带身份维旧门')
print(f'  verified {cshz.name} ({cshz.stat().st_size} B)：面板三修特征全过')

# ---------- 3) 桥 / 歌词源 沿用 ----------
bridge = OUT / f'ChuShi-Music-Bridge-{BRIDGE_VER}.plugin'
bridge.write_bytes((PREV / f'ChuShi-Music-Bridge-{BRIDGE_VER}.plugin').read_bytes())
lyric = OUT / f'ChuShi-Lyric-Source-{LYRIC_VER}.plugin'
lyric.write_bytes((PREV / f'ChuShi-Lyric-Source-{LYRIC_VER}.plugin').read_bytes())
print(f'  carried {bridge.name} + {lyric.name}')

# ---------- 4) SHA256SUMS（组件四件套，与历版同口径：说明/AllInOne 不计入）----------
comps = sorted([f'ChuShi-NewTab-v{VER}.zip', f'ChuShi-Music-Bridge-{BRIDGE_VER}.plugin',
                f'ChuShi-Music-Preset-{PRESET_VER}.cshz', f'ChuShi-Lyric-Source-{LYRIC_VER}.plugin'])
sums = [hashlib.sha256((OUT / f).read_bytes()).hexdigest() + '  ' + f for f in comps]
(OUT / 'SHA256SUMS.txt').write_text('\n'.join(sums) + '\n', encoding='utf-8')
print('  SHA256SUMS.txt x', len(sums))

# ---------- 5) 使用说明 ----------
NOTES = f'''# 「初始」v{VER} 使用说明（歌词左右截断 + 切新词复位 + 播放键按下位移）

## 本版修了什么（全部来自你的实机反馈）

### ① 歌词左右截断（浮窗 + 面板）
两个叠加的根因：
- 当前行有呼吸放大（transform:scale(1.06)），它缩放的是**整行盒**，会把行盒横向
  撑出约 9px，被歌词区的裁切边界左右各切一刀；
- 翻译行只声明了「行」没声明「列」，浏览器按内容最大宽度把列撑到面板外，长翻译句
  被硬切——挂在它身上的 text-overflow:ellipsis 因此**从来没生效过**（是硬切，不是省略号）。

本版：歌词区内层左右各留 9px 呼吸位；翻译行显式把列锁在面板宽度内，让省略号真正
生效；超长不可断词自动换行。实测长翻译行首字不再被吃、右侧显示「…」，主行不顶边。

### ② 切新歌词出来时歌词复位（面板）
旧实现的歌词缓存门用了「歌词载荷对象身份」这一维。但快照每拍都要经过
postMessage 结构化克隆 + 重新解析，**每一拍都是全新对象**——身份维恒不相等，
门每拍失效，歌词 DOM 每拍被整体重建：高亮、滚动位置、已唱渐隐一起复位。
本版改用**内容指纹**：歌词内容没变就不重建；内容变了（换词 / 翻译回填 /
lrc→yrc 升级）照常重建，该更新的一个不漏。

### ③ 播放/暂停键按下时会位移（面板）
主键按下时原本会整键缩放（视觉上像位移），本版改为不变形的高亮反馈。
▶ 字形保持原样——它的视觉重心本来就落在按钮中心。

### ④ 天气「定位」在扩展里点不出坐标（补齐 geolocation 权限）
扩展页（chrome-extension://）读取经纬度必须显式声明 geolocation 权限，旧包漏了，
点「定位」拿不到坐标、只能手动搜城市。本版补上该权限（网页版走标准 Web 权限流程，
不受影响）。

## 升级步骤
1. 「初始」更新到 v{VER}：覆盖安装 `ChuShi-NewTab-v{VER}.zip`（**删净旧的解压目录** →
   解压新包 → 扩展页点刷新）。
2. SMTC 音乐预设更新到 {PRESET_VER}：⌘K → 预设 → 导入新 cshz 覆盖（歌词两修在本版预设里）。
3. 桥 ChuShi Music Bridge {BRIDGE_VER} 与歌词源 {LYRIC_VER} **沿用，无需更换**
   （本版没有改桥与歌词源）。

## 组件版本
- 「初始」NewTab **v{VER}**（浮窗：歌词左右截断修复）
- SMTC 音乐预设 **{PRESET_VER}**（面板：截断 + 切新词复位 + 按下位移）
- ChuShi Music Bridge **{BRIDGE_VER}**（沿用）
- ChuShi Lyric Source **{LYRIC_VER}**（沿用）

## 本版性质说明
补丁版：宿主页面 bundle 与桥未重建——本次修复只落在扩展卡与预设部件两处，宿主内部
版本号仍为 8.3.5；扩展 manifest 版本与预设交付资产名已升到 {VER}。

## 装完怎么自查
- 放一首带翻译的中文歌：翻译长句左首字完整、右侧显示「…」，不再左右被切
- 切歌等新歌词出来：歌词不再整块复位（高亮/滚动位置保持）
- 点播放/暂停：主键不缩放位移，▶/⏸ 不跳位
'''
(OUT / f'使用说明-v{VER}.md').write_text(NOTES, encoding='utf-8')
(OUT / f'ChuShi-v{VER}-Usage-Notes.md').write_text(NOTES, encoding='utf-8')
print(f'  使用说明-v{VER}.md + ChuShi-v{VER}-Usage-Notes.md')

# ---------- 6) AllInOne ----------
allin = OUT / f'ChuShi-v{VER}-AllInOne.zip'
with zipfile.ZipFile(allin, 'w', zipfile.ZIP_DEFLATED) as z:
    for name in (f'ChuShi-NewTab-v{VER}.zip', f'ChuShi-Music-Bridge-{BRIDGE_VER}.plugin',
                 f'ChuShi-Music-Preset-{PRESET_VER}.cshz', f'ChuShi-Lyric-Source-{LYRIC_VER}.plugin',
                 'SHA256SUMS.txt', f'ChuShi-v{VER}-Usage-Notes.md'):
        z.write(OUT / name, name)
print(f'  {allin.name} ({allin.stat().st_size} B)')
print('  done ->', OUT)
