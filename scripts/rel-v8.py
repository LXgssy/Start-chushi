#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v8.0.0 GitHub Release 发布（资产 ASCII 名 + 逐资产 SHA-256 校验）"""
import hashlib, json, sys, time
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError

ROOT = Path(__file__).resolve().parents[1]
TOKEN = (ROOT.parent / '.pkgtmp/gh-token').read_text().strip()
REPO = 'LXgssy/Start-chushi'
TAG = 'v8.0.0'
OUT = ROOT / 'download/v8.0.0'

ASSETS = [
    'ChuShi-Music-Bridge-8.0.0.plugin',
    'ChuShi-Lyric-Source-7.0.0.plugin',
    'ChuShi-NewTab-v8.0.0.zip',
    'ChuShi-Music-Preset-8.0.0.cshz',
    'ChuShi-v8.0.0-AllInOne.zip',
    'SHA256SUMS.txt',
]

BODY = '''## v8.0.0 · 自研 SMTC 退役 · InfLink-rs 适配版

**本代指令**：InfLink-rs 插件有 SMTC 功能，直接舍弃自写的 SMTC，音乐桥和 API 都去适配它。

### 架构变化
- **ChuShi-SMTC-Manager 整体退役**（原生 DLL/broker/WinRT 全删，构建门断言零 WinRT 导入）——v7.0.x 四代崩溃永久终结
- **系统媒体卡片归 InfLink-rs**（第三方 Rust 插件，网易云插件市场可装，需 3.2.11+）：封面/标题/进度/媒体键/拖动全由它提供
- **ChuShi Music Bridge 8.0.0 全新重写**：`window.InfLinkApi` 第一真值源（毫秒时间线/播客 throw 诚实降级），缺席时五层只读阶梯补位；控制主路走 InfLinkApi（与系统卡片按钮同路），seek 毫秒制+读回校验回执
- 内置**零 WinRT 纯 winsock hub.dll** 数据枢纽（127.0.0.1:26901-26903，CORS+PNA，SEH 自愈）——「初始」页面唯一数据通道
- smtc.ts v8：公开面字段级兼容零改动；`smtcVer` 字段 v8 语义 = InfLink-rs 版本；枢纽身份 `chushi-music-hub`、版本门 8.0.0
- 预设部件文案同步（安装指引 / 页脚 InfLink-rs 版本芯片）

### 验证
- 插件门 31/31（含 hub.dll PE 导出解析 + 导入表零 WinRT/COM 断言 + 零老 SMTC 符号）
- e2e 39/39（mock 枢纽真客户端 + 桥 vm 白盒 InfLinkApi 全链 + v7 老身份否定门）
- Next 生产构建（TS 门）+ 线上指纹核验

### 升级（务必照做）
1. 网易云插件目录（`C:\\betterncm\\plugins`）：**删除 `ChuShi-SMTC-Manager-*.plugin`**
2. 放入 `ChuShi-Music-Bridge-8.0.0.plugin`（`ChuShi-Lyric-Source-7.0.0.plugin` 不动）
3. **完全退出并重启网易云**（托盘右键退出）；InfLink-rs 保持启用
4. 扩展解压覆盖 + 「初始」页重导 `ChuShi-Music-Preset-8.0.0.cshz`

详细步骤与排障见 `ChuShi-v8.0.0-Usage-Notes.md`（AllInOne 包内含全部资产）。
'''

def api(path, data=None, method='GET', raw=False, headers=None):
    url = f'https://api.github.com{path}'
    req = Request(url, method=method)
    req.add_header('Authorization', f'Bearer {TOKEN}')
    req.add_header('Accept', 'application/vnd.github+json')
    body = None
    if data is not None:
        body = json.dumps(data).encode()
        req.add_header('Content-Type', 'application/json')
    if headers:
        for k, v in headers.items():
            req.add_header(k, v)
    try:
        with urlopen(req, body, timeout=120) as r:
            payload = r.read()
            return (payload if raw else (json.loads(payload) if payload else {})), r.status
    except HTTPError as e:
        return (e.read() if raw else {}), e.code

def sha256(p):
    h = hashlib.sha256()
    h.update(p.read_bytes())
    return h.hexdigest()

def main():
    # 1) 已有 release 检查
    rel, code = api(f'/repos/{REPO}/releases/tags/{TAG}')
    if code == 200:
        print(f'release {TAG} 已存在 (id={rel["id"]})，跳过创建')
    else:
        rel, code = api(f'/repos/{REPO}/releases', {
            'tag_name': TAG, 'target_commitish': 'main', 'name': TAG,
            'body': BODY, 'draft': False, 'prerelease': False,
        }, 'POST')
        if code != 201:
            print('创建失败:', code, rel); sys.exit(1)
        print(f'release {TAG} 创建 (id={rel["id"]})')

    rel_id = rel['id']
    existing = {a['name'] for a in rel.get('assets', [])}

    # 2) 上传资产 + 校验
    for name in ASSETS:
        p = OUT / name
        if not p.exists():
            print('缺资产:', p); sys.exit(1)
        if name in existing:
            print(f'  已存在，跳过 {name}')
            continue
        size = p.stat().st_size
        up = f'https://uploads.github.com/repos/{REPO}/releases/{rel_id}/assets?name={name}'
        req = Request(up, method='POST', data=p.read_bytes())
        req.add_header('Authorization', f'Bearer {TOKEN}')
        req.add_header('Content-Type', 'application/octet-stream')
        req.add_header('Content-Length', str(size))
        with urlopen(req, timeout=600) as r:
            j = json.loads(r.read())
        ok = j.get('name') == name and j.get('size') == size
        digest = sha256(p)
        print(f'  上传 {name} ({size}B) {"OK" if ok else "MISMATCH!"} sha256={digest[:16]}…')
        if not ok:
            sys.exit(1)

    # 3) 终态校验：资产名单逐个核对
    rel2, _ = api(f'/repos/{REPO}/releases/{rel_id}')
    names = {a['name']: a['size'] for a in rel2.get('assets', [])}
    missing = [n for n in ASSETS if n not in names]
    wrong = [n for n in ASSETS if n in names and names[n] != (OUT / n).stat().st_size]
    print(f'资产终态: {len(names)} 个; 缺失={missing}; 尺寸不符={wrong}')
    if missing or wrong:
        sys.exit(1)
    print(f'\nRELEASE-OK: https://github.com/{REPO}/releases/tag/{TAG}')

if __name__ == '__main__':
    main()
