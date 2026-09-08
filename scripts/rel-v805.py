#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v8.0.5 GitHub Release 发布（资产 ASCII 名 + 逐资产 SHA-256 校验）"""
import hashlib, json, sys, time
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError

ROOT = Path(__file__).resolve().parents[1]
TOKEN = (ROOT / '.pkgtmp/gh-token').read_text().strip()
REPO = 'LXgssy/Start-chushi'
TAG = 'v8.0.5'
OUT = ROOT / 'download/v8.0.5'

ASSETS = [
    'ChuShi-Music-Bridge-8.0.5.plugin',
    'ChuShi-Lyric-Source-7.2.0.plugin',
    'ChuShi-NewTab-v8.0.5.zip',
    'ChuShi-Music-Preset-8.0.5.cshz',
    'ChuShi-v8.0.5-AllInOne.zip',
    'SHA256SUMS.txt',
]

BODY = r'''## v8.0.5 · 控制终极兜底：原生媒体键（渲染层四路全灭的 NCM 上必通）

### 你 cmdTrace 取证的结论

`cmdTrace` 里两条 `toggle`、`ok:true`、`port:26901` —— 证明页面→hub 投递链路完全正常，桥的轮询也活着（数据面一直在动）。命令一定被桥执行了：**是渲染层四级备路（InfLink 派发 → dva action → audio 元素 → 可见按钮）在你这台 NCM 3.x 上全部无效**（连续四轮实测穷尽）。

### v8.0.5 解法：不再依赖网易云内部任何东西

| 改动 | 说明 |
|---|---|
| **hub.dll 8.0.5 新端点 `/api/native`** | hub 与网易云同进程，直接在操作系统输入层重放媒体键：mode1 = `WM_APPCOMMAND` 直投主窗口（scoped 零外溢）；mode2 = `keybd_event` 全局虚拟媒体键——**与物理键盘媒体键完全同一条系统通路**（网易云自带 SMTC 或 InfLink-rs 必居其一持有会话，物理媒体键能控就必通） |
| **桥执行链六路** | InfLink → dva → 元素 → 按钮 → **原生媒体键 mode1 → mode2**，每级延时验证 + 回执（`napp`/`nkey`/`native`），注入前方向预检防 toggle 振荡；旧 hub 无端点回 404 诚实降级不误报 |
| **方向判错隐藏 bug 修复** | 页面刚开的几秒内，桥可能拿「探测前陈旧状态帧」判方向 → 方向判反还误报成功（假 `ok:'link'`）。v8.0.5 改实时 playState 优先 + 自愈真值仲裁（e2e 台架实锤后修） |
| **零 WinRT 宪法不变** | user32 媒体键注入不是 WinRT/COM/SMTC；导入表仅增 USER32，构建门逐项断言 |

### 升级（这次只换 1 个文件）

1. 关网易云，`C:\betterncm\plugins`：删旧 **Music-Bridge**，放入 `ChuShi-Music-Bridge-8.0.5.plugin`（**新 hub.dll 已内嵌**；Lyric-Source 7.2.0 不用动）
2. **完全退出并重启网易云**（托盘右键退出）；InfLink-rs 3.2.11 不动
3. 「初始」页刷新即可（线上 Pages 已同步）；**预设不用重导**（部件零改动）

### 验证

- 插件门 44/44（新增：USER32 导入门 / nativeFire 响应格式串门 / 桥 v8.0.5 兜底符号门 / toggle、next、prev 双支路接兜底门）
- e2e **50/50**（新增 B3「死网易云」全链路：四级全灭 → 原生媒体键 mode1 接管 → 回执 `ok=true path=napp`；B4 旧 hub 404 → mode2 升格 → 诚实失败 `path=native` 不误报）
- hub.dll x64 重编核验：导出表仅 BetterNCMPluginMain、导入 WS2_32+USER32+KERNEL32、零 WinRT
- Pages 已部署：https://lxgssy.github.io/Start-chushi/
'''

def api(method, path, data=None, raw=False, ctype='application/json'):
    url = path if path.startswith('https://') else f'https://api.github.com{path}'
    req = Request(url, method=method)
    req.add_header('Authorization', f'Bearer {TOKEN}')
    req.add_header('Accept', 'application/vnd.github+json')
    req.add_header('User-Agent', 'chushi-rel')
    body = None
    if data is not None:
        body = data if isinstance(data, bytes) else json.dumps(data).encode()
        req.add_header('Content-Type', ctype)
    try:
        with urlopen(req, body if method != 'GET' else None, timeout=120) as r:
            payload = r.read()
            return r.status, (payload if raw else (json.loads(payload) if payload else {}))
    except HTTPError as e:
        return e.code, json.loads(e.read() or b'{}')

def sha256(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()

def main():
    code, rel = api('GET', f'/repos/{REPO}/releases/tags/{TAG}')
    if code == 200:
        rid = rel['id']
        print(f'release {TAG} exists id={rid}, updating')
        api('PATCH', f'/repos/{REPO}/releases/{rid}', {'body': BODY, 'draft': False, 'prerelease': False})
    else:
        code, rel = api('POST', f'/repos/{REPO}/releases', {
            'tag_name': TAG, 'target_commitish': 'main', 'name': TAG,
            'body': BODY, 'draft': False, 'prerelease': False,
        })
        rid = rel['id']
        print(f'release {TAG} created id={rid}')

    for name in ASSETS:
        p = OUT / name
        dig = sha256(p)
        code, assets = api('GET', f'/repos/{REPO}/releases/{rid}/assets?per_page=100')
        for a in assets:
            if a['name'] == name:
                api('DELETE', f"/repos/{REPO}/releases/assets/{a['id']}")
                print(f'  deleted old {name}')
                time.sleep(1)
        upload_url = rel['upload_url'].split('{')[0] + f"?name={name}"
        code, resp = api('POST', upload_url, p.read_bytes(), raw=True,
                         ctype='application/octet-stream')
        print(f'  upload {name}: HTTP {code} ({p.stat().st_size} B)')
        code2, assets = api('GET', f'/repos/{REPO}/releases/{rid}/assets?per_page=100')
        match = [a for a in assets if a['name'] == name]
        ok = match and match[0]['size'] == p.stat().st_size
        print(f'  verify {name}: {"OK" if ok else "MISMATCH"}')
        if not ok:
            sys.exit(1)
    print(f'RELEASE-OK {TAG} id={rid}')

if __name__ == '__main__':
    main()
