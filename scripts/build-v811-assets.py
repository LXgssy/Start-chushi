#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v8.1.1 交付组装：NewTab v8.1.1（右侧黑边根治）+ 桥 8.1.0 / 歌词源 7.3.0 /
cshz 8.1.0（v8.1.0 未单独发版，随本版一并交付；未变组件按 v8.0.8 先例保留
真实版本号）+ 说明 + SHA256SUMS + AllInOne

v8.1.1 变更（用户实机：「初始」页面右边空一条大黑边）：
  NewTab v8.1.1   根滚动条隐藏（scrollbar-width:none 替代 v1.8.0 的
                  scrollbar-gutter:stable）——gutter 常驻 ~15px 经典滚动条槽位，
                  Chromium 对槽位只画画布背景且一切元素绘制裁剪在 ICB，
                  壁纸模式下右侧露出近黑画布底色即黑边；无滚动条即无槽位，
                  壁纸全出血，滚动仍可用（滚轮/触摸/键盘）；旧 CEF 自动回退。
                  配套 html 画布主题底色（首帧防闪白）+ body 透明。
  桥 8.1.0        （沿用）位置单源化——audio 元素 currentTime 唯一源
  歌词源 7.3.0    （沿用）eapi 信封根修，yrc 逐字主源
  cshz 8.1.0      （沿用）连接瞬断保内容黄灯 3s 防闪断
"""
import hashlib, zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'download/v8.1.1'
VER = '8.1.1'          # 本版发布版本（NewTab）
BRIDGE_VER = '8.1.0'   # 桥未变，保留真实版本（v8.0.8 先例）
LYRIC_VER = '7.3.0'    # 歌词源未变
PRESET_VER = '8.1.0'   # cshz 未变
BRIDGE_DIR = ROOT / 'bridge/v8/plugins/music-bridge'
LYRIC_DIR = ROOT / 'bridge/v8/plugins/lyric-source'
OUT.mkdir(parents=True, exist_ok=True)

# ---------- 1) 桥 .plugin（zip 根部平铺，与历版同构；hub.dll 沿用 8.0.9 双架构） ----------
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

# ---------- 3) NewTab zip（EXTENSION_MODE=1 产物 out/ 根平铺，含 v8.1.1 黑边修复） ----------
out_dir = ROOT / 'out'
if not out_dir.exists():
    raise SystemExit('缺 out/（先 EXTENSION_MODE=1 npx next build）')
# 产物自检：主 CSS 必须含 v8.1.1 黑边修复特征
main_css = out_dir / '_next/static/chunks'
feat = False
for css in main_css.glob('*.css'):
    if 'scrollbar-width:none' in css.read_text(encoding='utf-8', errors='ignore').replace(' ', ''):
        feat = True
        break
if not feat:
    raise SystemExit('产物 CSS 缺 scrollbar-width:none 特征——构建不是 v8.1.1 内容，拒绝打包')
idx = (out_dir / 'index.html').read_text(encoding='utf-8')
if '"/Start-chushi/' in idx:
    raise SystemExit('index.html 含 /Start-chushi basePath——这是 EXPORT_MODE 产物，拒绝打包（Pages 事故律）')
if not (out_dir / '.nojekyll').exists() or not (out_dir / 'sandbox.js').exists():
    raise SystemExit('缺 .nojekyll / sandbox.js——产物不完整')
newtab = OUT / f'ChuShi-NewTab-v{VER}.zip'
with zipfile.ZipFile(newtab, 'w', zipfile.ZIP_DEFLATED) as z:
    for p in sorted(out_dir.rglob('*')):
        if p.is_file():
            z.write(p, p.relative_to(out_dir).as_posix())
print(f'  built {newtab.name} ({newtab.stat().st_size} B)')

# ---------- 4) cshz（build-smtc-preset.py 产物，8.1.0 未变，版本化改名入列） ----------
src_cshz = ROOT / 'examples' / '初始SMTC音乐预设.cshz'
if not src_cshz.exists():
    raise SystemExit('缺 examples/初始SMTC音乐预设.cshz（先跑 build-smtc-preset.py）')
cshz = OUT / f'ChuShi-Music-Preset-{PRESET_VER}.cshz'
cshz.write_bytes(src_cshz.read_bytes())
print(f'  built {cshz.name} ({cshz.stat().st_size} B)')

# ---------- 5) 使用说明 ----------
NOTES = f'''# 「初始」v{VER} 使用说明（右侧黑边根治 + 歌词乱跳/面板闪断双根治一并交付）

> 本版为 v8.1.0 + v8.1.1 合并发版（v8.1.0 未单独发 Release，其修复全部包含在内）。

## 本版修了什么

### v8.1.1 · 「初始」页面右侧大黑边根治

| 现象 | 根因 | 修复 |
|---|---|---|
| 壁纸模式下页面右侧空一条大黑边 | `scrollbar-gutter:stable` 常驻预留 ~15px 经典滚动条槽位；Chromium 对槽位只画画布背景，且一切元素绘制（含根元素背景图像）均裁剪在 ICB 边界——壁纸铺不到槽位 | 根滚动条隐藏（`scrollbar-width:none`）：无滚动条即无槽位，壁纸全出血；滚动条出现/消失不再改变布局宽度（v1.8.0「两排变一排抖动」防抖目标同源保持）；页面仍可滚（滚轮/触摸/键盘）；旧 CEF 无此属性自动回退经典滚动条（行为同 v8.0 时代） |
| 首帧可能闪白 | 画布无底色 | html 配主题底色（浅色 `#f6f5f2` / 深色 `#0a0a0e`），与 Aurora 底层严格一致；body 保持透明不遮壁纸层 |

### v8.1.0 · 歌词乱跳 / 面板闪断 双根治

| 现象 | 根因 | 修复 |
|---|---|---|
| 歌曲正常播放，歌词在 1:05↔1:06 秒级锯齿乱跳 | 桥端位置双源交替：InfLink 时间线（SMTC 上报滞后 ~1s）与 audio 元素真值在空缺时交替补位，位置每拍在两源间跳动 | 桥 8.1.0 **位置单源化**：一律以 audio 元素 currentTime（帧级连续真值）为唯一源，InfLink 时间线仅元素缺席兜底 |
| seek 后时间与歌词短暂脱节 | seek 后网易云上报「中间态」位置快照，旧护航窗对中间态弃窗回锚 | NewTab 8.1.0 回退熔断 + 中间态保位：稳态期回退 0.6~6s 拍拒收（连续 2 拍放行、护航窗收窗 grace 豁免）；中间态快照保位到护航窗过期；**暂停/播放逐字歌词校准管线原样未动** |
| 音乐面板每 ~4.5s 整体消失成「系统媒体待接入」再恢复 | 桥状态时间戳陈旧触发全端口重探，重探计入掉线连败 → 面板周期切空态 | 重探不再触发掉线（只换端口、本拍照常上屏）；部件连接瞬断先保内容亮黄灯「重连中…」3 秒才降级（cshz 8.1.0） |
| gh-pages 网页黑屏 | 上一次部署误用 EXTENSION_MODE（无 basePath）构建 | 已用 EXPORT_MODE basePath=/Start-chushi 重建部署并线上核验 |

## 升级步骤

**上次用到 v8.0.9 或更早（大多数用户）——四件全换：**

1. **任务管理器结束所有网易云进程**（老规矩）
2. 进 BetterNCM 插件目录替换：
   - `ChuShi-Music-Bridge-8.1.0.plugin`（歌词乱跳根治在这里）
   - `ChuShi-Lyric-Source-7.3.0.plugin`（若已是 7.3.0 可不动）
3. 「初始」页更新到 v{VER}（扩展用户覆盖安装 `ChuShi-NewTab-v{VER}.zip`；网页版 gh-pages 已同步上线）
4. 「初始」页内重新导入 `ChuShi-Music-Preset-8.1.0.cshz`（面板防闪断宽限）
5. 启动网易云 → 面板显示 `已连接 · API v8.0.9`（hub 版本线）

**已在内测 v8.1.0（未发布版）：只需更新 NewTab v{VER}。**

## 组件版本

- 「初始」NewTab **v{VER}**（本版唯一新内容：黑边根治）
- ChuShi Music Bridge **{BRIDGE_VER}**（hub.dll 8.0.9 双架构沿用，无变更）
- ChuShi Lyric Source **{LYRIC_VER}**（沿用）
- SMTC 音乐预设 **{PRESET_VER}**（沿用）
- InfLink-rs 3.2.11（保持启用，系统媒体卡片提供方）

## 验收要点

- 壁纸模式下右侧无黑边，壁纸直通屏幕右缘；窗口拉窄/拉宽无布局抖动
- 正常播放歌词行稳定推进，无秒级来回锯齿
- 拖动进度条：立即停在目标位置，歌词直接对位
- 音乐面板不再周期性整体消失
'''
notes = OUT / f'ChuShi-v{VER}-Usage-Notes.md'
notes.write_text(NOTES, encoding='utf-8')
print(f'  built {notes.name}')

# ---------- 6) SHA256SUMS + AllInOne ----------
staged = [plugin, lyric, newtab, cshz, notes]

def sha256(p: Path) -> str:
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
print('\nDONE v8.1.1')
