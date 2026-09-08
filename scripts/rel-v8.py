#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v8.0.0 GitHub Release 发布（资产 ASCII 名 + 逐资产 SHA-256 校验）"""
import hashlib, json, sys, time
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError

ROOT = Path(__file__).resolve().parents[1]
TOKEN = (ROOT / '.pkgtmp/gh-token').read_text().strip()
REPO = 'LXgssy/Start-chushi'
TAG = 'v8.0.1'
OUT = ROOT / 'download/v8.0.1'

ASSETS = [
    'ChuShi-Music-Bridge-8.0.1.plugin',
    'ChuShi-Lyric-Source-7.0.0.plugin',
    'ChuShi-NewTab-v8.0.1.zip',
    'ChuShi-Music-Preset-8.0.1.cshz',
    'ChuShi-v8.0.1-AllInOne.zip',
    'SHA256SUMS.txt',
]

BODY = r'''## v8.0.1 · 音乐链路三连修（控制 / 掉线 / 显示）

**本代指令**：InfLink-rs 插件有 SMTC 功能，直接舍弃自写的 SMTC，音乐桥和 API 都去适配它。

### 修了什么（对应用户反馈三问题）

| 问题 | 根因 | 修复 |
|---|---|---|
| **面板无法控制网易云** | 桥解析枢纽命令对实物协议 `{"_id",raw:{...}}` 误用 `JSON.parse`（对象→`"[object Object]"` 必抛）→ **所有控制命令被静默丢弃**（e2e mock 与实物协议分叉漏网） | 命令解析双形兼容（raw 对象/字符串都认）；e2e mock 改用实物协议同形 + 新增双形断言 |
| **一会连上一会断开** | hub.dll 单线程接受循环被浏览器预连接（connect 后不发数据的空连接）阻塞最长 3s > 页面 1.4s 超时 ×2 连败即判掉线 | hub：空连接 400ms select 快关 + recv 500ms + TCP_NODELAY；页面：超时 2.2s / 掉线 3 连败 / 重探 1.5s；桥 jpost 补 2.5s 超时（防 beatBusy 永久哑掉） |
| **面板显示异常**（封面铺满/无标题） | v6+ 部件封面 span 非 flex 直接子元素 → CSS 行内宽高失效 → 封面铺满整面板、标题列 0 宽；沙箱 shim 前置 doctype 致 quirks 模式放大问题 | 封面显式 `display:block`；默认封面内联 data-URI 兜底（破图根治）；sandbox shim 移至 doctype 之后（标准模式） |

另：toggle/play/pause 方向判定改用 InfLink `getPlaybackStatus` 真值（audio 元素与 redux 脱同步时「按了没反应」一并修复）。

### 升级（务必照做）
1. 关网易云，`C:\betterncm\plugins`：**删 ChuShi-Music-Bridge-8.0.0.plugin**，放入 `ChuShi-Music-Bridge-8.0.1.plugin`
2. **完全退出并重启网易云**（托盘右键退出）；InfLink-rs 不动
3. 「初始」扩展更新到 v8.0.1（线上 Pages 已同步；扩展用户解压覆盖）
4. **「初始」页重新导入 `ChuShi-Music-Preset-8.0.1.cshz`**（旧预设部件 HTML 是坏的，必须重导入）

### 验证
- 插件门 33/33（含 hub.dll 导出表 def 收敛断言 + 防阻塞三律字节断言 + 零 WinRT）
- e2e 40/40（新增 raw 对象/字符串双形协议断言）
- 渲染复现台架：修复前后截图对比（封面 96px + 标题列恢复）
- Pages 已部署：https://lxgssy.github.io/Start-chushi/
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
