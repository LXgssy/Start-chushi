#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v7.1.0 GitHub Release 发布（curl + PAT，资产全 ASCII）"""
import json, os, subprocess, sys
from pathlib import Path

D = Path('/home/z/my-project/.wt-v7/download/v7.1.0')
url = subprocess.run(['git', '-C', '/home/z/my-project/.wt-v7', 'remote', 'get-url', 'origin'],
                     capture_output=True, text=True).stdout.strip()
PAT = url.split('https://')[1].split('@')[0].split(':', 1)[1]
AUTH = f'Authorization: token {PAT}'
API = 'https://api.github.com/repos/LXgssy/Start-chushi'
TAG = 'v7.1.0'

body = """# v7.1.0 — SMTC 崩溃架构级终修（独立 broker 进程）+ 预设包 registerCommand 修复

## 为什么是架构级
v7.0.0→v7.0.2 四代崩溃收束：ABI 全对仍崩于系统 QI 路径 = 网易云进程内 COM/SMTC 环境被污染。本版把全部 WinRT/SMTC 工作移出网易云进程：

- **ChuShiSMTCBroker.exe 独立进程**承载全部 SMTC + HTTP 枢纽（协议与 v7.0.2 完全一致）
- 插件 DLL 瘦身为纯监督者：释放/拉起/看护 broker（内嵌 blob），**网易云进程内零 WinRT——结构上不可能再崩宿主**
- broker 崩溃仅自杀退出（无弹窗）+ 自动重启（10 分钟 ≤5 次预算）；网易云退出自动跟随退出
- 时间线对象自实现 CCW 唯一路径（绕开崩溃过的系统类激活路径）；23 条编译期 offsetof 静态断言锁 ABI
- 预设包修复：「registerCommand is not defined」→ 改用 chushi.* 命名空间

## 安装
1. 卸载旧版 ChuShi-SMTC-Manager → 安装 `ChuShi-SMTC-Manager-7.1.0.plugin`
2. Music-Bridge / Lyric-Source 7.0.0 无变化，已装无需重装
3. 「初始」内重新导入 `ChuShi-SMTC-Music-Preset.cshz`（先删旧音乐预设）

## 验收
启动不再崩；任务管理器见 ChuShiSMTCBroker.exe；系统卡片显示真实曲目（非「未知曲目」）；卡片按钮/拖动进度可用；无需开网易云自带 SMTC。

## 报障
一并取 `C:\\betterncm\\plugins_runtime\\ChuShi-SMTC-Manager\\native-log.txt` 与 `broker-log.txt`。

（资产名 ASCII 为 GitHub 剥 CJK 文件名规避；SHA256 见 SHA256SUMS.txt）"""

r = subprocess.run(['curl', '-s', '-X', 'POST', API + '/releases',
    '-H', AUTH, '-H', 'Accept: application/vnd.github+json',
    '-d', json.dumps({'tag_name': TAG, 'target_commitish': 'main',
                      'name': 'v7.1.0 — SMTC 独立 broker 进程架构（崩溃终修）+ 预设修复',
                      'body': body, 'draft': False, 'prerelease': False})],
    capture_output=True, text=True)
rel = json.loads(r.stdout)
if 'id' not in rel:
    print('RELEASE CREATE FAILED:', r.stdout[:500]); sys.exit(1)
rid = rel['id']
print(f'release id={rid} url={rel.get("html_url")}')

assets = [
    ('ChuShi-SMTC-Manager-7.1.0.plugin', D / 'ChuShi-SMTC-Manager-7.1.0.plugin'),
    ('ChuShi-Music-Bridge-7.0.0.plugin', D / 'ChuShi-Music-Bridge-7.0.0.plugin'),
    ('ChuShi-Lyric-Source-7.0.0.plugin', D / 'ChuShi-Lyric-Source-7.0.0.plugin'),
    ('ChuShi-SMTC-Music-Preset.cshz', D / 'ChuShi-SMTC-Music-Preset.cshz'),
    ('ChuShi-v7.1.0-FixNotes.md', D / 'ChuShi-v7.1.0-FixNotes.md'),
    ('SHA256SUMS.txt', D / 'SHA256SUMS.txt'),
    ('ChuShi-v7.1.0-Music-Bundle.zip', D / 'ChuShi-v7.1.0-Music-Bundle.zip'),
]
ok = 0
for name, path in assets:
    u = subprocess.run(['curl', '-s', '-X', 'POST',
        f'https://uploads.github.com/repos/LXgssy/Start-chushi/releases/{rid}/assets?name={name}',
        '-H', AUTH, '-H', 'Content-Type: application/octet-stream',
        '--data-binary', f'@{path}'], capture_output=True, text=True)
    j = json.loads(u.stdout)
    if 'state' in j and j['state'] == 'uploaded':
        ok += 1; print(f'  UPLOADED {name} ({path.stat().st_size}B)')
    else:
        print(f'  FAILED {name}: {u.stdout[:200]}')
print(f'{ok}/{len(assets)} assets uploaded')
sys.exit(0 if ok == len(assets) else 1)
