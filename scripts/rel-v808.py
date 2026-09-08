#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v8.0.8 GitHub Release 发布（排空 JSON 八代根因修复；逐资产 SHA-256 校验）"""
import hashlib, json, sys, time
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError

ROOT = Path(__file__).resolve().parents[1]
TOKEN = (ROOT / '.pkgtmp/gh-token').read_text().strip()
REPO = 'LXgssy/Start-chushi'
TAG = 'v8.0.8'
OUT = ROOT / 'download/v8.0.8'

ASSETS = [
    'ChuShi-Music-Bridge-8.0.8.plugin',
    'ChuShi-Lyric-Source-7.2.0.plugin',
    'ChuShi-NewTab-v8.0.8.zip',
    'ChuShi-Music-Preset-8.0.6.cshz',
    'ChuShi-v8.0.8-AllInOne.zip',
    'SHA256SUMS.txt',
]

BODY = r'''## v8.0.8 · 排空 JSON 八代根因修复——「控制全灭」的真凶落网

### 你上一轮证据的完整解释

「所有控制还是无效」+ `postTrace: (7)`（页面 7 条命令全部 POST ok）+ `cmdTrace: []`（桥侧轨迹永远空白）+ 面板状态/进度正常——唯一自洽解释：**hub 在把命令交给桥的那一刻把它们全部弄坏了**。

本版以「hub C 逻辑逐行移植 Linux + 真实桥 JS 对打」的协议级复现抓到铁证：hub 排空接口拼出的数组**每条命令都缺外层对象收尾 `}`** → 非法 JSON → 桥解析必抛 → 静默丢弃，而队列已排空——命令灰飞烟灭，轨迹永远空白。反汇编比对确认 **v8.0.0~v8.0.7 八代发布二进制无一幸免**（全无写入 `}` 的指令）；历次 e2e 的模拟枢纽自拼正确 JSON，所以永远测不出。

### 修复

| 修复 | 说明 |
|---|---|
| **排空 JSON 收尾 `}`（根因）** | hub 补写缺失字节，命令交付链路协议级闭合（修复前 e2e 必红 → 修复后 19/19 全绿） |
| **回路自证** | 桥每 8s 向自己队列投 `_selftest` 探针并验证 4s 内收回；连败 2 次自动全端口重发现枢纽；`debug().selftest` 直读 |
| **拉取失败显形** | 桥拉取解析失败落 `pull-fail` 轨迹；`poll.drains/delivered/emptyStreak` 透传——「桥在拉但永远空」从猜测变事实 |
| **状态新鲜度** | `debug().stateAge`（秒）；持续 >8s 自动全端口重探 |
| **枢纽请求日志** | hub 新增 `/api/hublog`（入队/排空/租约/拦截收据环形 48 条），`debug().hubLog` 直读，断链一屏定层 |
| **no-recv 标记** | `postTrace` 条目 `recv:false` = POST ok 但桥 6s 未收到（断层直接证据） |

### 升级（务必杀干净进程）

1. **任务管理器结束所有网易云进程**
2. 只换 `ChuShi-Music-Bridge-8.0.8.plugin`（歌词源 7.2.0 / cshz 预设与上版相同）
3. 「初始」页更新到 v8.0.8（扩展用户覆盖安装 NewTab zip）
4. 启动 → 面板显示 `已连接 · API v8.0.8`

### 验证 / 若仍无效

浏览器控制台 `__chushiMusicBridge.debug()` 截图完整输出，本轮起一屏定层：
- `selftest.ok:false` → 命令回路断（桥自动重探中；持续 false 请发截图）
- `postTrace` 有 `recv:false` → 命令未达桥（配 `hubLog` 直接定位断层）
- `cmdTrace` 有 `cmd#` 且 `cmdLast.ok:true` → 控制链路全通，问题在网易云侧
- `stateAge > 8` → 桥状态冻结（重启网易云）
'''

def api(method, path, data=None, raw=False, ctype='application/json'):
    if path.startswith('http'):
        url = path
    else:
        url = f'https://api.github.com/repos/{REPO}/{path.lstrip("/")}'
    req = Request(url, method=method)
    req.add_header('Authorization', f'Bearer {TOKEN}')
    req.add_header('Accept', 'application/vnd.github+json')
    body = None
    if data is not None:
        body = data if raw else json.dumps(data).encode()
        if raw:
            req.add_header('Content-Type', ctype)
        else:
            req.add_header('Content-Type', 'application/json')
    try:
        with urlopen(req, body) as r:
            txt = r.read()
            return r.status, json.loads(txt) if txt and not raw else (json.loads(txt) if txt else {})
    except HTTPError as e:
        return e.code, json.loads(e.read() or b'{}')

def sha256(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()

def main():
    code, rel = api('GET', f'/releases/tags/{TAG}')
    if code == 200:
        rid = rel['id']
        print(f'release {TAG} exists id={rid}, updating')
        api('PATCH', f'/releases/{rid}', {'body': BODY, 'draft': False, 'prerelease': False})
    else:
        code, rel = api('POST', '/releases', {
            'tag_name': TAG, 'target_commitish': 'main', 'name': TAG,
            'body': BODY, 'draft': False, 'prerelease': False,
        })
        rid = rel['id']
        print(f'release {TAG} created id={rid} (HTTP {code})')

    for name in ASSETS:
        p = OUT / name
        code, assets = api('GET', f'/releases/{rid}/assets?per_page=100')
        for a in assets:
            if a['name'] == name:
                api('DELETE', f'/releases/assets/{a["id"]}')
                print(f'  deleted old {name}')
                time.sleep(1)
        upload_url = rel['upload_url'].split('{')[0] + f'?name={name}'
        code, resp = api('POST', upload_url, p.read_bytes(), raw=True,
                         ctype='application/octet-stream')
        state = resp.get('state') if isinstance(resp, dict) else None
        print(f'  upload {name}: HTTP {code} state={state} ({p.stat().st_size} B)')

    code, assets = api('GET', f'/releases/{rid}/assets?per_page=100')
    names = {a['name']: a['id'] for a in assets}
    all_ok = True
    for name in ASSETS:
        if name not in names:
            print(f'  VERIFY {name}: MISSING')
            all_ok = False
            continue
        import urllib.request as ur2
        req = ur2.Request(f'https://api.github.com/repos/{REPO}/releases/assets/{names[name]}', method='GET')
        req.add_header('Authorization', f'Bearer {TOKEN}')
        req.add_header('Accept', 'application/octet-stream')
        with ur2.urlopen(req) as r:
            got = hashlib.sha256(r.read()).hexdigest()
        want = sha256(OUT / name)
        okk = got == want
        all_ok = all_ok and okk
        print(f'  VERIFY {name}: {"OK" if okk else "MISMATCH"}')
    print('ALL OK' if all_ok else 'HAS FAILURES')
    sys.exit(0 if all_ok else 1)

if __name__ == '__main__':
    main()
