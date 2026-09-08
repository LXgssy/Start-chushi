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
OUT = ROOT / 'download/v8.0.1'
VER = '8.0.1'

FILES = [
    ('download/v8.0.1/ChuShi-Music-Bridge-8.0.1.plugin', f'ChuShi-Music-Bridge-{VER}.plugin'),
    ('download/v8.0.1/ChuShi-Lyric-Source-7.0.0.plugin', 'ChuShi-Lyric-Source-7.0.0.plugin'),
    ('download/v8.0.1/ChuShi-NewTab-v8.0.1.zip', f'ChuShi-NewTab-v{VER}.zip'),
    ('examples/初始SMTC音乐预设.cshz', f'ChuShi-Music-Preset-{VER}.cshz'),
    ('download/v8.0.1/ChuShi-v8.0.1-Usage-Notes.md', f'ChuShi-v{VER}-Usage-Notes.md'),
]

NOTES = f'''# 「初始」v{VER} 音乐链路修复版使用说明

## v8.0.1 修了什么（对应你反馈的三个问题）

| 问题 | 根因 | 修复 |
|---|---|---|
| 面板无法控制网易云 | 桥解析枢纽命令时对实物协议 `{{"_id",raw:{{...}}}}` 误用 JSON.parse（对象被转成 "[object Object]" 必抛异常）→ 所有控制命令被静默丢弃 | 命令解析双形兼容（raw 对象/字符串都认）；toggle 方向改用 InfLink 真值（audio 元素脱同步时按了没反应的问题一并修复） |
| 一会连上一会断开 | hub.dll 单线程接受循环被浏览器预连接（connect 后不发数据的空连接）阻塞最长 3 秒 > 页面 1.4 秒超时 × 2 连败即判掉线 | hub：空连接 400ms 快关 + 收包超时降 500ms + TCP_NODELAY；页面：超时放宽 2.2s、掉线判定 3 连败、重探 1.5s |
| 面板显示异常（封面铺满/无标题） | 部件 HTML 的封面 span 非 flex 直接子元素，CSS 宽高对行内元素无效 → 封面铺满整面板、标题列被挤成 0 宽；且沙箱 shim 前置导致 quirks 模式放大问题 | 封面显式 display:block + 默认封面内联 data-URI 兜底（不再出破图）；沙箱 shim 改注入 doctype 之后（标准模式） |

## 更新步骤（照做即可）

1. 关闭网易云，把 `ChuShi-Music-Bridge-8.0.1.plugin` 放进 `C:\\betterncm\\plugins`
   （**删掉旧的 ChuShi-Music-Bridge-8.0.0.plugin**），其余插件不动。
2. 完全退出并重启网易云（托盘右键退出，不是关窗口）。
3. 「初始」页：`ChuShi-NewTab-v{VER}.zip` 覆盖旧扩展（或等商店/GitHub Pages 自动更新）。
4. **「初始」页重新导入 `ChuShi-Music-Preset-{VER}.cshz`**（旧预设里的部件 HTML 是坏的，
   必须重导入才会换新——这一步不做，显示问题不会消失）。
5. InfLink-rs 保持启用，无需任何改动。

## 验收点

- 音乐面板显示完整卡片（96px 封面 + 标题/歌手/专辑 + 进度随动）。
- 点播放/暂停/上下曲/拖进度，网易云真实响应。
- 长时间挂着面板不再反复「未连接 ↔ 已连接」跳动。
- 系统媒体卡片照旧由 InfLink-rs 提供，不受本次更新影响。

## 组件版本

- ChuShi Music Bridge **{VER}**（含 hub.dll 8.0.1：防阻塞三律）
- ChuShi Lyric Source 7.0.0（不变）
- 「初始」NewTab **{VER}**（smtc 客户端容错调优 + 沙箱标准模式修复）
- SMTC 音乐预设 {VER}（封面尺寸修复 + data-URI 兜底）
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
