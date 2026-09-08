#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v8.0.9 GitHub Release 发布（拖动显示三连修 + 逐字 yrc 优先根修；逐资产 SHA-256 校验）"""
import hashlib, json, sys, time
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError

ROOT = Path(__file__).resolve().parents[1]
TOKEN = (ROOT / '.pkgtmp/gh-token').read_text().strip()
REPO = 'LXgssy/Start-chushi'
TAG = 'v8.0.9'
OUT = ROOT / 'download/v8.0.9'

ASSETS = [
    'ChuShi-Music-Bridge-8.0.9.plugin',
    'ChuShi-Lyric-Source-7.3.0.plugin',
    'ChuShi-NewTab-v8.0.9.zip',
    'ChuShi-Music-Preset-8.0.9.cshz',
    'ChuShi-v8.0.9-AllInOne.zip',
    'SHA256SUMS.txt',
]

BODY = r'''## v8.0.9 · 拖动显示三连修 + 逐字歌词 yrc 优先根修

### 本版修复

| 问题 | 根因 | 修复 |
|---|---|---|
| **拖动成功了却提示「拖动未生效」** | 桥读回校验只读 audio 元素且仅两拍：元素缺席时结果恒「未知」却被折叠成「失败」上报 | seek 读回校验 v2：InfLink 时间线第一读回源（页面所见即所验）+ 420/1000/2200ms 三拍耐心 + 三态诚实上报 `seekAckKnown`——未知≠失败，芯片只在验证过的真失败时亮 |
| **拖动后进度条回弹几下、等几秒才跳到目标** | 拖动后桥真值要 1~3 秒才收敛，期间每拍都把面板硬锚回旧位置 | 核心引擎 **seek 护航窗**：窗内忽略拖动前旧轨迹的陈旧拍，真值到目标±2s 提前确认；真失败时窗口过期诚实回锚 |
| **拖动后歌词乱跳** | 同根因（位置锚点被陈旧拍来回拽） | 护航窗一并根治；**暂停/播放时的逐字歌词校准管线原样未动** |
| **逐字歌词永远不是真逐字** | 歌词源 eapi 加密信封带 `?` 且加密路径多 `/eapi` 前缀 → 服务端 404/空响应，eapi 层历代从未生效，一直降级拿 lrc | 歌词源 **7.3.0 信封根修**（实测修正后同参数 yrc 正常返回）；逐字歌词恢复 **yrc 优先**，无 yrc 的歌自动回退原「时间戳对歌词」方案；本地缓存升代防旧结果遮蔽 |
| **悬停高光突兀 / 关闭瞬消 / 进度条放大生硬** | 无过渡 | 进度条悬停放大加缓动；播放/上一首/下一首/关闭键背景、前景、提亮全部渐显；关闭面板先淡出再收起 |

### 测试

- 歌词源 eapi 信封等价门 11/11（插件加密实现与规范实现逐字节一致 + 实测 yrc 返回）
- 核心护航窗单测 21/21（陈旧拍忽略/真值确认/过期回锚/暂停校准不变/换歌弃窗）
- 桥 e2e（真实桥 × 真实 hub × 双实例租约）15/15（含 seekAckOk/known 三态两路）

### 升级（本版三个文件都换了，请全部更新）

1. **任务管理器结束所有网易云进程**
2. 进 BetterNCM 插件目录：替换 `ChuShi-Music-Bridge-8.0.9.plugin` 与 **`ChuShi-Lyric-Source-7.3.0.plugin`**（yrc 根修在这里）
3. 「初始」页更新到 v8.0.9（扩展用户覆盖安装 NewTab zip）
4. 「初始」页内重新导入 `ChuShi-Music-Preset-8.0.9.cshz`（部件动效更新）
5. 启动网易云 → 面板显示 `已连接 · API v8.0.9`

### 验收要点

- 拖动进度条：立即停在目标位置，无回弹、无「拖动未生效」提示，歌词直接对位
- 有逐字歌词的歌：逐字扫色与实际演唱逐字对齐（yrc 主源生效）
- 无逐字歌词的歌：行内伪逐字按时间推进（自动回退方案）
- 若异常：`__chushiMusicBridge.debug()` 截图（`postTrace.recv` / `cmdTrace` / `selftest`）
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
