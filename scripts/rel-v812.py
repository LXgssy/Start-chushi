#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v8.1.1 GitHub Release 发布（黑边根治；v8.1.0 未单独发版一并交付；逐资产 SHA-256 校验）"""
import hashlib, json, sys, time
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError

ROOT = Path(__file__).resolve().parents[1]
TOKEN = (ROOT / '.pkgtmp/gh-token').read_text().strip()
REPO = 'LXgssy/Start-chushi'
TAG = 'v8.1.2'
OUT = ROOT / 'download/v8.1.2'

ASSETS = [
    'ChuShi-Music-Bridge-8.1.0.plugin',
    'ChuShi-Lyric-Source-7.3.0.plugin',
    'ChuShi-NewTab-v8.1.2.zip',
    'ChuShi-Music-Preset-8.1.2.cshz',
    'ChuShi-v8.1.2-AllInOne.zip',
    'SHA256SUMS.txt',
]

BODY = r'''## v8.1.2 · 预设包接入根治 + dock 选框连点动效根治

### ① v8.1.1 预设包无法接入（8.0.9 正常）

| 现象 | 根因 | 修复 |
|---|---|---|
| 导入 v8.1.1 附带的 cshz 后音乐面板**永久「系统媒体待接入」**，桥侧 `debug()` 却一切健康（hub connected / selftest ok / 歌曲在放） | 部件 v8.1.0 防闪断宽限误写 `offSince = 0`——变量从未声明，部件脚本严格模式下**每次连接渲染必抛 ReferenceError**，死在进入完整模式之前 → 永久空态 | `offT = 0`（宽限计时器复位）；**重新导入本版 `ChuShi-Music-Preset-8.1.2.cshz` 即愈** |

> 实锢闭环：Playwright 阴性对照——旧包同环境连抛 `offSince is not defined` 永久空态；修复包同环境正常接入显示「已连接 · API v8.1.0 · InfLink-rs v3.2.11」。

### ② 快速连点 tab 栏，选框动效回退

| 现象 | 根因 | 修复 |
|---|---|---|
| 连续快速点击两个 dock 功能，选框反复**缩小+淡出再弹回**（泵动，即「液态玻璃时期的动效」观感） | 选框原在各按钮内条件挂载（AnimatePresence + layoutId 跨按钮交接）：连点快于「160ms 退场+弹簧收敛」时，新选框继承旧选框**退场进行中**的 scale/opacity 投影（逐帧取证：scale 0.44~0.59 / opacity 0.11~0.46 泵动） | **选框单实例化**：nav 级常驻选框，切换=同一元素 x/width 弹簧滑移，任意点击速度零交接零泵动（复验：连点期 scale 恒 1 / opacity 恒 1）；Q 弹出场、关闭缩回、快开滑移三段语言全保留 |

### 测试

- 部件接入：修复包 PASS（cs-mode-fl + 已连接页脚 + 零异常）/ 旧包阴性对照 FAIL 复现（ReferenceError ×2 + 永久空态）
- 选框动效逐帧取证：基线滑移 ✓ / 110ms×6 连点 scale 恒 1 opacity 恒 1 纯滑移 ✓ / Q 弹出场（0.6→1.066 过冲→1）✓ / 退场中 60ms 快开连续复活滑移 ✓ / 退场后 250ms 快开滑移落位 ✓
- 回归：tsc 零错误 / dock 冒烟（天气→待办→设置互切 + 遮罩关闭 + 选框退场 + ⌘K）9/9 + 控制台零报错 / gh-pages 线上三件套（首页 200 + 主 CSS hash 一致 + sandbox 200）

### 升级步骤

1. 「初始」页更新到 v8.1.2（扩展用户覆盖安装 `ChuShi-NewTab-v8.1.2.zip`；网页版 gh-pages 已同步）
2. 「初始」页内**重新导入 `ChuShi-Music-Preset-8.1.2.cshz`**（接入修复在这里，必换）
3. 网易云侧插件**无需动**（桥 8.1.0 / 歌词源 7.3.0 / hub 8.0.9 沿用）
4. 面板显示 `已连接 · API v8.1.0 · InfLink-rs v3.2.11` 即正常

### 验收要点

- 导入本版预设后：面板立即接入显示歌曲（不再「系统媒体待接入」）
- 快速连点 dock 两个功能：选框平滑滑移，无缩小/淡出泵动
- 开面板：选框 Q 弹出场；关面板：缩回淡出（原动效语言不变）
- 若异常：「初始」页控制台 `__chushiMusicBridge.debug()` 截图
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
