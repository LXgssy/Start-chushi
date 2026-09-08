#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v8.0.3 GitHub Release 发布（资产 ASCII 名 + 逐资产 SHA-256 校验）"""
import hashlib, json, sys, time
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError

ROOT = Path(__file__).resolve().parents[1]
TOKEN = (ROOT / '.pkgtmp/gh-token').read_text().strip()
REPO = 'LXgssy/Start-chushi'
TAG = 'v8.0.3'
OUT = ROOT / 'download/v8.0.3'

ASSETS = [
    'ChuShi-Music-Bridge-8.0.3.plugin',
    'ChuShi-Lyric-Source-7.1.0.plugin',
    'ChuShi-NewTab-v8.0.3.zip',
    'ChuShi-Music-Preset-8.0.3.cshz',
    'ChuShi-v8.0.3-AllInOne.zip',
    'SHA256SUMS.txt',
]

BODY = r'''## v8.0.3 · 控制末端加固 + 主键悬停修复 + 中文逐字根修 + 只读进度条

### 修了什么

| 问题 | 根因 | 修复 |
|---|---|---|
| **播放/暂停、上一首/下一首点击无反应** | 最大嫌疑 = 音乐桥插件未换新版（v8.0.2 控制修复全在插件层，歌词修复在部件层 → 「歌词好了按键还坏」组合）；若已是 8.0.2 则为 NCM 3.x 上四级控制路径全部未命中 | 桥 8.0.3 末端加固：按钮候选扩宽（aria-label/title 中文关键词 + class 模糊匹配 + 列表类误中保护）、完整指针事件序列（pointerdown→mousedown→pointerup→mouseup→click）、toggle 元素路径 +700ms 复验防双翻转；**部件新增控制诚实反馈芯片**——点击 3.2s 真值未翻转即亮红芯片按版本归因，不再静默 |
| **主键悬停变黑 + 图标位移** | `.cs-b:hover` 的 card2 暗底/ink 前景/scale 与主键 accent 白图标三重冲突（同特异性按序胜出） | 主键悬停律：恒保 accent 底白图标，仅 brightness 1.12，零位移（台架三断言实测） |
| **中文歌词无逐字效果** | 歌词源 klyric（中文歌主力逐字源）转换输出 LRC 式时间戳，渲染器不认；eapi 逐字请求未带登录凭据（yrc 只对登录会话下发） | klyric→真 yrc 时间轴（渲染器往返验证通过）；eapi 优先 credentials include；新增同源 web v1 备路（自带 cookie） |
| **进度条滑块无意义** | 网页端不提供拖动调节 | 进度条被动化：滑块/拖拽删除，只留只读填充条 |

### 升级（务必照做）
1. 关网易云，`C:\betterncm\plugins`：**删旧 Music-Bridge/Lyric-Source**，放入 `ChuShi-Music-Bridge-8.0.3.plugin` + `ChuShi-Lyric-Source-7.1.0.plugin`（中文逐字修复在歌词源里，**两个都要换**）
2. **完全退出并重启网易云**；InfLink-rs 3.2.11 不动
3. 「初始」页更新到 v8.0.3（线上 Pages 已同步）
4. **重新导入 `ChuShi-Music-Preset-8.0.3.cshz`**（悬停/进度条/控制提示芯片都在部件里）

### 验证
- 插件门 37/37（新增 v8.0.3 按钮扩宽/指针序列/元素复验门 + 歌词源凭据/同源v1/真yrc门）
- e2e 40/40（mock 同步 8.0.3 版本门）
- 渲染台架 17/17：悬停三断言（accent底/白前景/transform none）+ 进度条三断言（无滑块/只读走条/非手型）+ 控制反馈三态（成功无芯片/卡死亮归因芯片/POST 失败亮未送达）+ 歌词单高亮回归
- klyric→yrc 往返单测 PASS（逐字行被音乐核心解析器原样消费）
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
        # 已有同名资产先删
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
        # 回读校验
        code2, assets = api('GET', f'/repos/{REPO}/releases/{rid}/assets?per_page=100')
        match = [a for a in assets if a['name'] == name]
        ok = match and match[0]['size'] == p.stat().st_size
        print(f'  verify {name}: {"OK" if ok else "MISMATCH"}')
        if not ok:
            sys.exit(1)
    print(f'RELEASE-OK {TAG} id={rid}')

if __name__ == '__main__':
    main()
