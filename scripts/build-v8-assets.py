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
OUT = ROOT / 'download/v8.0.0'
VER = '8.0.0'

FILES = [
    ('download/v8.0.0/ChuShi-Music-Bridge-8.0.0.plugin', f'ChuShi-Music-Bridge-{VER}.plugin'),
    ('download/v8.0.0/ChuShi-Lyric-Source-7.0.0.plugin', 'ChuShi-Lyric-Source-7.0.0.plugin'),
    ('download/v8.0.0/ChuShi-NewTab-v8.0.0.zip', f'ChuShi-NewTab-v{VER}.zip'),
    ('examples/初始SMTC音乐预设.cshz', f'ChuShi-Music-Preset-{VER}.cshz'),
    ('download/v8.0.0/ChuShi-v8.0.0-Usage-Notes.md', f'ChuShi-v{VER}-Usage-Notes.md'),
]

NOTES = f'''# 「初始」v{VER} 音乐链路 · InfLink-rs 适配版使用说明

## 本代架构（v8.0.0）

**自研 SMTC 全面退役，系统媒体卡片改由 [InfLink-rs](https://github.com/apoint123/InfLink-rs)（网易云插件市场可装）提供。**

| 组件 | 角色 | 状态 |
|---|---|---|
| InfLink-rs 3.2.11 | 系统媒体卡片：封面/标题/进度/媒体键/拖动，Rust 原生实现 | **必须安装**（你已装） |
| ChuShi Music Bridge 8.0.0 | 以 window.InfLinkApi 为第一真值源；内置零 WinRT 纯 winsock 数据枢纽；播放控制主路走 InfLinkApi | 本代全新（含 hub.dll） |
| ChuShi Lyric Source 7.0.0 | 逐字歌词生产者（eapi/yrc） | 与 v7 相同，无需更新 |
| 「初始」新标签页 8.0.0 | 音乐面板真值直显 + 控制 + 歌词 | 本代更新 |

## 安装 / 升级步骤（照做即可）

1. **删除旧插件**：网易云插件目录（`C:\\betterncm\\plugins`）删掉
   `ChuShi-SMTC-Manager-*.plugin`（自研 SMTC 全家：DLL + broker 已无存在必要）。
2. 放入 `ChuShi-Music-Bridge-{VER}.plugin`（覆盖旧 Music Bridge）。
3. `ChuShi-Lyric-Source-7.0.0.plugin` 保持不动（没有就一并放入）。
4. **完全退出并重启网易云**（托盘右键退出，不是关窗口）。
5. InfLink-rs 保持启用；网易云自带「系统媒体控制」开关随意（InfLink-rs 会自动接管）。
6. 扩展更新：解压 `ChuShi-NewTab-v{VER}.zip` 覆盖旧版（或从商店/Release 更新）。
7. 「初始」页导入 `ChuShi-Music-Preset-{VER}.cshz`（旧版预设可删除）。

## 验收点

- 播放歌曲 → Windows 音量弹层/锁屏出现媒体卡片（InfLink-rs 提供），
  封面/歌名/进度正确，媒体键与进度拖动可用。
- 「初始」音乐面板显示真值（标题/歌手/进度随动），控制可用，逐字歌词照常。
- 网易云插件页看到 ChuShi Music Bridge 8.0.0 启用；任务管理器**不再有**
  ChuShiSMTCBroker.exe。

## 排障

- 面板提示「音乐桥未连接」：确认 Music Bridge 8.0.0 已装并完全重启网易云；
  `GET http://127.0.0.1:26901/api/ping` 应返回 `chushi-music-hub`。
- 系统卡片异常：那是 InfLink-rs 的领域——检查 InfLink-rs 设置里 SMTC 已启用；
  与本桥无关（本桥零 SMTC 代码）。
- 桥日志：`C:\\betterncm\\plugins_runtime\\ChuShi-Music-Bridge\\hub-log.txt`；
  网易云控制台：`window.__chushiMusicBridge.debug()` 一眼看全真值链。
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
