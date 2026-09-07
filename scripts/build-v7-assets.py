#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v7.0.0 交付包组装：SHA256SUMS + 合并交付包 + 使用说明"""
import hashlib, json, zipfile
from pathlib import Path

ROOT = Path('/home/z/my-project')
OUT = ROOT / 'download/v7.0.0'
VER = '7.0.0'

FILES = [
    f'ChuShi-SMTC-Manager-{VER}.plugin',
    f'ChuShi-Music-Bridge-{VER}.plugin',
    f'ChuShi-Lyric-Source-{VER}.plugin',
    f'ChuShi-NewTab-v{VER}.zip',
    '初始SMTC音乐预设.cshz',
]

def sha256(p: Path) -> str:
    h = hashlib.sha256()
    with open(p, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()

# 1) 拷入预设包
preset_src = ROOT / 'examples/初始SMTC音乐预设.cshz'
preset_dst = OUT / '初始SMTC音乐预设.cshz'
preset_dst.write_bytes(preset_src.read_bytes())

# 2) SHA256SUMS
lines = []
for name in FILES:
    p = OUT / name
    assert p.exists(), f'缺件: {p}'
    lines.append(f'{sha256(p)}  {name}')
(OUT / 'SHA256SUMS.txt').write_text('\n'.join(lines) + '\n', encoding='utf-8')
print('SHA256SUMS.txt written')

# 3) 使用说明（中文）
readme = f'''# 「初始」v{VER} · 音乐链路全量重写（三插件原生架构）

## 本代修复了什么
- **SMTC 连 Windows 都读不到** → 根治：SMTC Manager 现在是真正的**原生 DLL**
  （BetterNCM native_plugin），在网易云主进程内用自有隐藏窗口注册独立的
  Windows 系统媒体会话（ISystemMediaTransportControlsInterop::GetForWindow）。
  系统悬浮窗卡片、锁屏封面、媒体键、可拖进度条全部真实可用；
  网易云自带 SMTC 开关**保持关闭**即可。
- **三个插件完全不工作 / 页面不显示音乐** → 根因确诊：BetterNCM v2 是 CEF
  环境，渲染进程没有 Node，v6 的 `require("http")` 枢纽与 `navigator.mediaSession`
  在真机上必然失效。v7 起：数据枢纽住进原生 DLL（本机回环 HTTP 中继），
  三个插件全部纯 JS / 原生，零 Node 依赖。
- 歌词源改为纯 JS 自实现 eapi 协议（MD5 + AES-128-ECB，向量级验证），
  eapi → 内部 channel → 公开接口三层回退。

## 三插件分工
| 插件 | 职责 |
|------|------|
| ChuShi SMTC Manager（原生） | 独立系统媒体会话 + 本机数据枢纽（127.0.0.1:26901，占用退 26902/26903） |
| ChuShi Music Bridge | 只读网易云播放真值、执行播放控制（单次执行+seek读回校验）、转发状态/歌词 |
| ChuShi Lyric Source | 完整歌词（逐字 yrc + 翻译 + 行级 lrc）三层回退获取 |

## 安装 / 升级（重要：必须删干净旧插件）
1. **删除网易云插件目录里所有旧 .plugin 文件**（旧版同目录会反向覆盖新版）。
   目录通常在：BetterNCM 数据目录 / Plugins。
2. 放入本包三个 .plugin 文件。
3. **完全重启网易云音乐**（不是刷新，是退出进程再启动）。
4. 浏览器扩展：替换为 ChuShi-NewTab-v{VER}.zip 内的解压产物（开发者模式重新加载），
   或 web 版直接 Ctrl+F5 强刷（清理 sw.js 缓存）。
5. 重新导入 初始SMTC音乐预设.cshz（样式不变，脚本更新）。

## 30 秒自查
1. 网易云 BetterNCM 插件列表：**三个 ChuShi 插件全部可见**。
2. 播放任意歌曲 → Windows 音量悬浮窗/锁屏出现**独立媒体卡片**（无需开网易云 SMTC 开关）。
3. 卡片进度条可拖动；媒体键播放/暂停/切歌有效。
4. 「初始」新标签页音乐面板出现当前曲目、进度推进、逐字歌词扫色。
5. 面板页脚显示 `API v{VER} · 管理 v{VER}`。

## 若列表还是看不到插件
- 检查网易云安装目录/BetterNCM 数据目录下 `Plugins/disable_list.txt`，
  删除其中 ChuShi 开头的行。
- 确认 .plugin 文件名保持英文（中文名会因编码问题无法加载）。

## 校验
sha256sum -c SHA256SUMS.txt
'''
(OUT / '使用说明-音乐链路.md').write_text(readme, encoding='utf-8')
print('使用说明 written')

# 4) 合并交付包
merged = OUT / f'ChuShi-v{VER}-合并交付包.zip'
if merged.exists():
    merged.unlink()
with zipfile.ZipFile(merged, 'w', zipfile.ZIP_DEFLATED) as z:
    for name in FILES + ['SHA256SUMS.txt', '使用说明-音乐链路.md']:
        z.write(OUT / name, name)
print(f'合并包 {merged.name}: {merged.stat().st_size} bytes')
print('ALL DONE')
