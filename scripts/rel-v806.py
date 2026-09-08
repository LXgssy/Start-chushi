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
TAG = 'v8.0.6'
OUT = ROOT / 'download/v8.0.6'

ASSETS = [
    'ChuShi-Music-Bridge-8.0.6.plugin',
    'ChuShi-Lyric-Source-7.2.0.plugin',
    'ChuShi-NewTab-v8.0.6.zip',
    'ChuShi-Music-Preset-8.0.6.cshz',
    'ChuShi-v8.0.6-AllInOne.zip',
    'SHA256SUMS.txt',
]

BODY = r'''## v8.0.6 · 媒体键退役 + 桥端备路实锤修复（InfLink-rs 源码逐行比对）+ 跳转恢复

### 这轮的结论（源码级）

系统媒体卡片能控制 ⇔ **InfLink-rs 内部控制通路有效**。源码实锤：系统卡片按钮 → Rust SMTC → InfLink 前端 handleAdapterCommand → adapter.play() → redux dispatch；而 `window.InfLinkApi.play()` 就是同一个 adapter.play()——三者同一条路。桥 v8.0.2 起主路就在调它，但备路有实锤 bug，导致一失效就全灭。

### 修了什么

| 问题 | 根因 | 修复 |
|---|---|---|
| **桥 redux 备路全灭（实锤）** | 桥全部 store 判定只认网易云 2.x 顶层 st.player；NCM 3.x 顶层是 st.playing（InfLink v3 adapter 即读 playing/playingList）→ 3.x 上备路永远 no-store | storeOk/findDvaStore/readStore 判三代（player ∥ playing）；控制 store 优先级反转 fiber（InfLink 同款 #root 遍历）第一——第二路与系统卡片按钮的 dispatch 等效 |
| **媒体键方案退役（按你指令）** | 系统卡片实测可控证明 InfLink 通路有效，OS 输入层重放不再需要 | /api/native 从桥与 hub.dll 双侧根除；导入表回到 ws2_32 + kernel32（user32 清零），构建门断言「零 USER32」+「媒体键符号根除」 |
| **断点不可见** | 主路调用缺遥测，失败看不见 | 控制全链调用级遥测进 cmdTrace（link:play-called / pause-called / next-called / seek-called / absent / throw），容量 12→20 |
| **命令可能被静默吞** | hub 重启后 _id 归零重计，桥侧 lastCmdDone 残留旧世代 _id 把新命令当重复跳过（trace 都不留） | 幂等闸回退防护：检测 _id 回退自动清空旧世代记录（e2e B5 断言） |
| **主路验证误判（e2e 台架实锤）** | 首拍无源帧 position=0 → toggle 拍跳变 12.3s → 「假暂停自愈」误触发 → 900ms 验证被冻结病仲裁判败 → 主路误降级 | 执行后验证改 linkNow()（只信 InfLink 实时状态，零快照仲裁）；自愈收紧（上一拍必须已是同源，首拍/源切换跳变绝不自愈） |
| **跳转（seek）恢复** | v8.0.3 曾把进度条改只读 | 部件进度条恢复拖动/点击（InfLink seekTo 同源通路），拖动中本地预览、松手跳转；失败亮「拖动未生效」芯片诚实呈现；面板与网易云双向同步 |

### 升级（务必照做）
1. 关网易云，`C:\betterncm\plugins`：删旧 **ChuShi-Music-Bridge**，放入 `ChuShi-Music-Bridge-8.0.6.plugin`（Lyric-Source 7.2.0 不变；hub.dll 已内嵌）
2. **完全退出并重启网易云**（托盘也要退）；InfLink-rs 3.2.11 不动
3. 「初始」页更新到 v8.0.6（线上 Pages 已同步；扩展用户重装 zip）
4. **重新导入 `ChuShi-Music-Preset-8.0.6.cshz`**（进度条拖动在部件里）

### 验证
- 插件门 43/43（新增：零 USER32 导入门 + 媒体键符号根除门 + 三代 store/遥测/幂等闸回退门）
- e2e 50/50（新增 B3 死网易云→诚实失败 path=button + 媒体键零触碰行为断言；B4 活 link 主路一枪命中 path=link；B5 hub 重启 _id 回退不吞命令）
- Pages 线上核验：chunk 含 8.0.6 版本门、sandbox.js unitizeLine 在位
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
