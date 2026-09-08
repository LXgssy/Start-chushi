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
TAG = 'v8.0.2'
OUT = ROOT / 'download/v8.0.2'

ASSETS = [
    'ChuShi-Music-Bridge-8.0.2.plugin',
    'ChuShi-Lyric-Source-7.0.0.plugin',
    'ChuShi-NewTab-v8.0.2.zip',
    'ChuShi-Music-Preset-8.0.2.cshz',
    'ChuShi-v8.0.2-AllInOne.zip',
    'SHA256SUMS.txt',
]

BODY = r'''## v8.0.2 · 实机对症三联修（按键 / 状态脱同步 / 双语歌词）

**取证链**：用户实机录屏 + hub/桥日志 + InfLink-rs 3.2.11 源码解剖。

### 修了什么

| 问题 | 根因 | 修复 |
|---|---|---|
| **播放/上一首/下一首按键全坏** | InfLink 控制面 = `reduxStore?.dispatch`（play/pause/next/prev/seek 全是），部分网易云 3.x 版本上这些 action 被 reducer **静默忽略**；数据读取同 store 却正常 → 「数据活、按键全死」 | 桥改「下发 → 延时验证（曲目/播放态真翻转）→ 直发 dva action（动词逐字抄 InfLink 3.2.11：`playing/resume`、`playing/pause`、`playingList/jump2Track`、`playing/setPlayingPosition`）→ audio 元素 → 可见按钮」三级备路；执行轨迹 `window.__chushiMusicBridge.debug().cmdTrace` |
| **播放中面板显示播放键/黄灯** | InfLink `playState` 在部分网易云 3.x 上冻结为 Paused 而时间线仍推进 | 桥时间线自愈：报 Paused 但进度推进 ≥1.2s/拍（同曲、拍间 <4s）→ 按播放处理（只治假暂停） |
| **中英双语歌词双高亮混乱** | 部件歌词行离场定格全亮（已唱遮罩 100% 不回落） | 已唱行回落灰（`.done`），仅当前行卡拉OK高亮 + 翻译；倒回（seek）自动还原未唱行 |
| 封面恒显默认底 | 网易云封面 http URL 被 https 页面按混合内容策略丢弃 | 桥端 http→https 升级（126 CDN 双协议） |

### 升级（务必照做）
1. 关网易云，`C:\betterncm\plugins`：**删 ChuShi-Music-Bridge-8.0.1.plugin**，放入 `ChuShi-Music-Bridge-8.0.2.plugin`
2. **同时删掉 v7 时代遗留插件**（ChuShi-SMTC-Manager / 旧 Music-Bridge——双代同跑互相打架）
3. **完全退出并重启网易云**；InfLink-rs 3.2.11 不动
4. 「初始」页更新到 v8.0.2（线上 Pages 已同步）
5. **重新导入 `ChuShi-Music-Preset-8.0.2.cshz`**（歌词修复必须重导入才生效）

### 验证
- 插件门 35/35（新增 v8.0.2 备路/自愈/封面升级符号门 + cmdTrace 门）
- e2e 40/40（mock 同步 8.0.2 版本门）
- 渲染台架 8/8 断言：回声行×2+翻译场景——已唱行回落灰、唯一高亮行、翻译只挂当前行（截图核验）
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
