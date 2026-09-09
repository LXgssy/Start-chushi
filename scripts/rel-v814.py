#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v8.1.4 GitHub Release 发布（歌词高光三律 + 强行逐字开关；逐资产 SHA-256 校验）"""
import hashlib, json, sys, time
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError

ROOT = Path(__file__).resolve().parents[1]
TOKEN = (ROOT / '.pkgtmp/gh-token').read_text().strip()
REPO = 'LXgssy/Start-chushi'
TAG = 'v8.1.4'
OUT = ROOT / 'download/v8.1.4'

ASSETS = [
    'ChuShi-Music-Bridge-8.1.3.plugin',
    'ChuShi-Lyric-Source-7.3.0.plugin',
    'ChuShi-NewTab-v8.1.4.zip',
    'ChuShi-Music-Preset-8.1.4.cshz',
    'ChuShi-v8.1.4-AllInOne.zip',
    'SHA256SUMS.txt',
]

BODY = r'''## v8.1.4 · 歌词高光三律根治 + 强行逐字开关 + 进度条帧率

### 用户实机反馈四条全闭环

| 反馈 | 根因 | 修复 |
|---|---|---|
| **逐字歌词播放完一句，只要没到下一句，当前句持续高亮** | 双层：① 宿主给纯 lrc 歌生成的伪逐字时间轴**铺满行距**（lrc 行结束时间=下一行开始、末行还 +8 秒）——唱完后扫光仍在爬或停在 100%；② 部件「已唱渐隐」只挂在切行事件上，行不切就永远不隐 | ① 伪逐字时长改按歌词字数**估算实际演唱时长**（约 4 字/秒，下限 1.2s）；② 部件**句尾渐隐律**：扫光到 100% 后保持 250ms 收尾即开始渐隐，不再等下一句开始 |
| **回退歌曲进度后，之前高光过的歌词一直保持高光** | 行切换只还原「曾标记已唱」的行——正在唱的行扫光进度直接残留；回退落在间奏时「已唱界」还用回退前的行号，把没唱的行误标已唱 | **「当前歌曲位置之后零高光」律**：每次切行把已唱界之后的行无条件还原未唱态；宿主间奏快照携带已唱界（lastLine），回退落间奏也还原正确 |
| 面板加「**强行逐字歌词**」选项 | 纯 lrc 歌没有逐字时间轴，此前一律按估算强加逐字效果（准确率低）且无开关 | 面板左下角新增**强行逐字**开关（**默认关**）：关 = 这类歌词使用逐行歌词；开 = 按估算添加逐字效果（准确率低）。真逐字（yrc）的歌不受开关影响，永远逐字。状态自动记忆 |
| **进度条悬停放大动画帧率低** | 悬停动画用 height 过渡——每帧触发布局重排（毛玻璃卡片内代价极高） | 改 transform 缩放**合成层动画**，只走 GPU 合成不掉帧 |

### 测试

- 新增 verify-v814-core **15/15**（伪逐字估算/下限上限/yrc 不受影响/间奏 lastLine/回退落间奏/src 标记透传/估算轴词定位）+ verify-v814-lyric **23/23**（回退残留根治/句尾渐隐/行内重扫撤销/间奏 ref/**强行逐字开关六态**/progress scaleY/**旧包阴性对照复现残留**）
- 回归：verify-v813-core 18/18 + verify-v810-core 12/12 + verify-v809-core 21/21 + lyricapi 11/11 全绿
- 规范扩展包：真浏览器冒烟 10/10 + 防呆门（manifest 8.1.4 / 零内联 / 保留名 0 违规 / v8.1.4 歌词配套特征）

### 升级步骤（本版两件必换）

1. 「初始」页更新到 v8.1.4（扩展用户覆盖安装 `ChuShi-NewTab-v8.1.4.zip`：**删净旧解压目录** → 解压新包 → 扩展页点刷新；网页版 gh-pages 已同步）
2. 重新导入 **`ChuShi-Music-Preset-8.1.4.cshz`**（句尾渐隐/回退残留/强行逐字开关/进度条帧率四项全在预设部件里，必换：dock 部件按钮 → 删除旧「SMTC 音乐」→ 导入新 cshz）
3. 桥 8.1.3 / 歌词源 7.3.0 / hub 8.0.9 **全部沿用无需动**
4. 验收：逐字歌词唱完一句约 0.25 秒后开始渐隐；拖回早前位置后未来歌词零高光；面板左下角「强行逐字」开关默认灰（关）；悬停进度条放大顺滑

> ⚠ 旧版「初始」（v8.1.3 及更早）导入本 cshz 会被拒（部件体积门随宿主同步放宽 20000→22000）——**先更新 NewTab 再导入预设**
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
        s = 'OK' if got == want else 'MISMATCH'
        if got != want:
            all_ok = False
        print(f'  VERIFY {name}: {s}')
    print('ALL OK' if all_ok else 'HAS FAILURES')
    sys.exit(0 if all_ok else 1)

if __name__ == '__main__':
    main()
