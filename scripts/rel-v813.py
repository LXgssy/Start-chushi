#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v8.1.3 GitHub Release 发布（歌词卡死两秒闪烁根治；逐资产 SHA-256 校验）"""
import hashlib, json, sys, time
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError

ROOT = Path(__file__).resolve().parents[1]
TOKEN = (ROOT / '.pkgtmp/gh-token').read_text().strip()
REPO = 'LXgssy/Start-chushi'
TAG = 'v8.1.3'
OUT = ROOT / 'download/v8.1.3'

ASSETS = [
    'ChuShi-Music-Bridge-8.1.3.plugin',
    'ChuShi-Lyric-Source-7.3.0.plugin',
    'ChuShi-NewTab-v8.1.3.zip',
    'ChuShi-Music-Preset-8.1.2.cshz',
    'ChuShi-v8.1.3-AllInOne.zip',
    'SHA256SUMS.txt',
]

BODY = r'''## v8.1.3 · 歌词卡死（两秒闪烁）根治 + 桥推送停滞根治

### 用户实机录屏（2026-09-09 18:28）：「歌词还是有问题」

| 现象 | 根因 | 修复 |
|---|---|---|
| 歌曲正常播放，但部件时间在 **1:06↔1:08 每 2 秒来回跳**、歌词行长时间不动（肉眼看就是「歌词冻住」） | 三层串联：① 桥推送停滞（页面诊断 `stateAge 11.5s`——hub 半死时 `/api/state` 排在命令链路三次往返之后，最坏 ~9.5s/拍）；② 页面把陈旧真值 +6s 封顶后每拍喂**恒定位置**；③ v8.1.0 回退熔断遇恒定源变成「拒 1 拍→第 2 拍硬锚回跳」循环 = **2 秒闪烁**（录屏 4fps 逐帧取证：词扫色亮度 2.0s 周期锯齿实锤） | ① 桥 8.1.3 **状态推送先行**（读真值→推状态提到命令链路之前）+ 全链超时收紧（poll 1.2s / state 1.5s / selftest 1.2s / cmds 1.2s，stateAge 峰值腰斩）；② NewTab v8.1.3 引擎**恒源钉守**：8 秒窗口内重现近似拒收值 = 上游停滞铁证 → 显示封顶在拒收值+0.75 原地保持，**绝不向前虚构再拽回**；桥恢复/切歌/暂停/拖动立即解除 |
| （附带修正）诊断口 `_chushiMusicBridge.debug().ver` 一直显示 8.0.9 | v8.1.0 起 `CLIENT_VER` 常量漏升（只改了头注释）——本次排查被它误导的第一现场 | ver 字段现如实显示 **8.1.3** |

### 测试

- 新增 verify-v813-core **18/18**：恒定源稳态零回跳 + 纹波 <0.2s / 停滞恢复 1 拍跟随 / age 锯齿源稳态秒数不翻动 / 停滞中暂停→恢复不闪 / 拖动护航不受钉守干扰 / 慢爬源有界滞后 / **双源交替回归（v8.1.0 语义保持）** / 真回退第 2 拍诚实跟随
- 回归：verify-v810-core 12/12 + verify-v809-core 21/21 + lyricapi 11/11 + **e2e 真实桥×真实 hub 15/15**
- 规范扩展包：真浏览器冒烟 10/10（UI 加载路径）+ 防呆门（manifest 8.1.3 / 零内联 / 保留名 0 违规 / 恒源钉守特征）
- gh-pages 已同步（线上 sandbox.js 含 v8.1.3 引擎特征 ✓）

### 升级步骤（本版两件必换）

1. 「初始」页更新到 v8.1.3（扩展用户覆盖安装 `ChuShi-NewTab-v8.1.3.zip`；网页版 gh-pages 已同步）
2. 网易云侧更新 **`ChuShi-Music-Bridge-8.1.3.plugin`**（推送先行修复在这里，必换）
3. 歌词源 7.3.0 / hub 8.0.9 / cshz 预设 8.1.2 **全部沿用无需动**
4. 面板显示 `已连接 · API v8.1.3 · InfLink-rs v3.2.11` 即正常

### 验收要点

- 播放任意歌曲：时间匀速前进、歌词逐行/逐字正常推进，**不再 2 秒来回跳**
- 若异常：「初始」页控制台 `_chushiMusicBridge.debug()` 截图（ver 应为 8.1.3；stateAge 应 <8s）
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
