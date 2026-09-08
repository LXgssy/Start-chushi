#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v8.0.0 交付七件套组装 + SHA256SUMS + 合并包（GitHub 资产名一律 ASCII）

资产名单（v8 固定）：
  ChuShi-Music-Bridge-8.0.0.plugin      音乐桥（含零 WinRT hub.dll）
  ChuShi-Lyric-Source-7.0.0.plugin      歌词源（v7.0.0 沿用，协议不变）
  ChuShi-NewTab-v8.0.0.zip              新标签页扩展（MV3）
  ChuShi-Music-Preset-8.0.0.cshz        SMTC 音乐预设（InfLink-rs 文案版）
  ChuShi-v8.0.0-Usage-Notes.md          使用说明（ASCII 名）
  ChuShi-v8.0.0-AllInOne.zip            合并交付包（全部内容 + SHA256SUMS）
  SHA256SUMS.txt
"""
import hashlib, shutil, zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'download/v8.0.2'
VER = '8.0.2'

FILES = [
    ('download/v8.0.2/ChuShi-Music-Bridge-8.0.2.plugin', f'ChuShi-Music-Bridge-{VER}.plugin'),
    ('download/v8.0.2/ChuShi-Lyric-Source-7.0.0.plugin', 'ChuShi-Lyric-Source-7.0.0.plugin'),
    ('download/v8.0.2/ChuShi-NewTab-v8.0.2.zip', f'ChuShi-NewTab-v{VER}.zip'),
    ('examples/初始SMTC音乐预设.cshz', f'ChuShi-Music-Preset-{VER}.cshz'),
    ('download/v8.0.2/ChuShi-v8.0.2-Usage-Notes.md', f'ChuShi-v{VER}-Usage-Notes.md'),
]

NOTES = f'''# 「初始」v{VER} 实机对症版使用说明

## v8.0.2 修了什么（对应你视频里的三个问题）

| 问题 | 根因 | 修复 |
|---|---|---|
| 播放/暂停/上一首/下一首按键全坏 | InfLink-rs 的控制面是纯 redux 派发（play/pause/next/prev/seek 全部 `reduxStore?.dispatch`），在部分网易云 3.x 版本上这些 action 被静默忽略——而数据读取走同一 store 却正常，所以现场呈「数据活、按键全死」 | 桥改为「下发 → 延时验证（曲目/播放态真翻转）→ 不动则直发 dva action（动词逐字抄 InfLink 3.2.11）→ 再不动则 audio 元素/可见按钮」三级备路；执行轨迹记入 `window.__chushiMusicBridge.debug().cmdTrace` |
| 播放中面板却显示播放键/黄灯（状态脱同步） | InfLink 的 playState 在部分网易云 3.x 版本上冻结为 Paused，但时间线仍在推进 | 桥加时间线自愈：报 Paused 但进度每秒推进 ≥1.2s → 按播放处理（只治假暂停，不反向伪造） |
| 中英双语歌词显示混乱（上一行与当前行双高亮） | 部件歌词行离场时定格全亮（已唱遮罩 100% 不回落），回声行/重复句场景下读起来像两行同时在唱 | 已唱行离场后回落灰（.done），仅当前行保持卡拉OK高亮，翻译只挂当前行 |
| 封面恒显默认底 | 网易云封面 URL 是 http 协议，页面 https 源按混合内容策略丢弃 | 桥端 http→https 升级（126 CDN 双协议均可用） |

## 更新步骤（照做即可）

1. 关闭网易云，进 `C:\\betterncm\\plugins`：**删掉旧 ChuShi-Music-Bridge-8.0.1.plugin**，
   放入 `ChuShi-Music-Bridge-8.0.2.plugin`；**同时删掉 v7 时代遗留插件**（如
   ChuShi-SMTC-Manager 或更旧的 Music-Bridge——双代插件同跑会互相打架）。
2. 完全退出并重启网易云（托盘右键退出，不是关窗口）。
3. 「初始」页更新到 v{VER}（线上 Pages 已同步；扩展用户覆盖安装）。
4. **「初始」页重新导入 `ChuShi-Music-Preset-{VER}.cshz`**（旧预设部件 HTML 是旧的，
   必须重导入歌词修复才会生效）。
5. InfLink-rs 保持 3.2.11 启用。

## 验收点

- 点播放/暂停/上一首/下一首/拖进度，网易云真实响应（若 InfLink 派发失灵，
  桥会自动降级直发 dva/元素，体感仍是「一点就动」）。
- 播放中面板主键显示暂停图标（不再是播放键+黄灯同屏矛盾）。
- 双语歌词：已唱行灰色、当前行卡拉OK高亮 + 翻译、未唱行淡灰——只有一行亮。
- 封面显示真实专辑图（不再是紫色默认底）。

## 组件版本

- ChuShi Music Bridge **{VER}**（hub.dll 8.0.2：防阻塞三律不变）
- ChuShi Lyric Source 7.0.0（不变）
- 「初始」NewTab **{VER}**（插件版本门升至 8.0.2）
- SMTC 音乐预设 {VER}（歌词已唱行回落灰 + 单高亮律）
'''


def sha256(p: Path) -> str:
    h = hashlib.sha256()
    h.update(p.read_bytes())
    return h.hexdigest()

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / f'ChuShi-v{VER}-Usage-Notes.md').write_text(NOTES, encoding='utf-8')

    staged = []
    for rel, arc in FILES:
        src = ROOT / rel
        if not src.exists():
            raise SystemExit(f'缺资产: {src}')
        dst = OUT / arc
        if src != dst:
            shutil.copy2(src, dst)
        staged.append(dst)
        print(f'  asset {arc} ({dst.stat().st_size} bytes)')

    sums = OUT / 'SHA256SUMS.txt'
    with sums.open('w', encoding='utf-8') as f:
        for p in sorted(staged):
            f.write(f'{sha256(p)}  {p.name}\n')
        print(f'  asset SHA256SUMS.txt')

    aio = OUT / f'ChuShi-v{VER}-AllInOne.zip'
    if aio.exists():
        aio.unlink()
    with zipfile.ZipFile(aio, 'w', zipfile.ZIP_DEFLATED) as z:
        for p in sorted(staged):
            z.write(p, p.name)
        z.write(sums, 'SHA256SUMS.txt')
    print(f'  built {aio.name} ({aio.stat().st_size} bytes)')

    print(f'\nAllInOne: {aio}')

if __name__ == '__main__':
    main()
