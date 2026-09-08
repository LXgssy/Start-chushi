#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v8.0.7 GitHub Release 发布（轮询租约版；逐资产 SHA-256 校验）"""
import hashlib, json, sys, time
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError

ROOT = Path(__file__).resolve().parents[1]
TOKEN = (ROOT / '.pkgtmp/gh-token').read_text().strip()
REPO = 'LXgssy/Start-chushi'
TAG = 'v8.0.7'
OUT = ROOT / 'download/v8.0.7'

ASSETS = [
    'ChuShi-Music-Bridge-8.0.7.plugin',
    'ChuShi-Lyric-Source-7.2.0.plugin',
    'ChuShi-NewTab-v8.0.7.zip',
    'ChuShi-Music-Preset-8.0.6.cshz',
    'ChuShi-v8.0.7-AllInOne.zip',
    'SHA256SUMS.txt',
]

BODY = r'''## v8.0.7 · 轮询租约——命令队列唯一消费者（控制失效根因级修复）

### 你上一轮证据的完整解释

cmdTrace 里 9 条命令全部 `ok:true`、面板已连接 v8.0.6、控制却全部无效、横幅亮「音乐桥未执行命令」——四件事唯一自洽的解释：**命令被第二个轮询者抢走了**。hub 的 `GET /api/cmd` 是排空式先到先得，网易云残留进程（或多进程注入）里的旧版桥 JS 和新桥 1Hz 轮询同一个队列，命令被随机分走：新桥永远空手（无回执），旧实例执行全灭（无效果）。

### 修复

| 修复 | 说明 |
|---|---|
| **轮询租约** | hub 新增 `POST /api/poll` 认领：粘性持有者（TTL 4s，沉默才许接管）；非持有者 GET /api/cmd 被 hub 拦为 `[]`——抢排在结构上不可能。持有者变更写 `[poll]` 日志，残留进程会在 hub-log.txt 现形 |
| **桥侧轨迹透传** | `state.cmd.trace`（20 条）+ `who` + `lease` 随 1Hz 上报——浏览器里 `__chushiMusicBridge.debug()` 直接看到桥内部每一步，诊断盲区永久消灭 |
| **双架构补齐** | hub.dll=x86 主架 + hub.dll.x64.dll=x64（六代 x64-only 欠账补齐，32 位网易云首次可用）；x86 用 -DHUB_NO_SEH 绕开 llvm-mingw i686 后端崩溃（历史挂起项解决） |

### 升级（务必杀干净进程）

1. **任务管理器结束所有网易云进程**（残留进程就是本轮根因，不杀 = 白升级）
2. 只换 `ChuShi-Music-Bridge-8.0.7.plugin`（歌词源/cshz 预设与上版相同，无需重导）
3. 启动 → 面板显示 `已连接 · API v8.0.7`

### 验证 / 若仍无效

浏览器控制台 `__chushiMusicBridge.debug()` 截图完整输出：
- `cmdTrace` 有条目 → 命令已到达桥，看走到哪一路失败
- `cmdTrace` 空 + `lease:'standby'` → 残留进程还在当家，回任务管理器杀
- `lease:'legacy'` → hub 未升级成功（插件没换对）
'''

def api(method, path, data=None, raw=False, ctype='application/json'):
    if path.startswith('http'):
        url = path  # upload_url 等绝对地址直用
    else:
        url = f'https://api.github.com/repos/{REPO}/{path.lstrip('/')}'
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
        dig = sha256(p)
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

    # 逐资产回读校验
    code, assets = api('GET', f'/releases/{rid}/assets?per_page=100')
    names = {a['name']: a['id'] for a in assets}
    all_ok = True
    for name in ASSETS:
        if name not in names:
            print(f'  VERIFY {name}: MISSING')
            all_ok = False
            continue
        import urllib.request as ur2
        req = ur2.Request(names[name] and f'https://api.github.com/repos/{REPO}/releases/assets/{names[name]}',
                          method='GET')
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
