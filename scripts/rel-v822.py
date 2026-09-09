#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v8.2.2 GitHub Release 发布（乱跳根治 + 高光保持 + 频谱保活与日志定位；逐资产 SHA-256 校验）"""
import hashlib, json, sys, time
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError

ROOT = Path(__file__).resolve().parents[1]
TOKEN = (ROOT / '.pkgtmp/gh-token').read_text().strip()
REPO = 'LXgssy/Start-chushi'
TAG = 'v8.2.2'
OUT = ROOT / 'download/v8.2.2'

ASSETS = [
    'ChuShi-Music-Bridge-8.2.2.plugin',
    'ChuShi-Lyric-Source-7.3.0.plugin',
    'ChuShi-NewTab-v8.2.2.zip',
    'ChuShi-Music-Preset-8.2.2.cshz',
    'ChuShi-v8.2.2-AllInOne.zip',
    'SHA256SUMS.txt',
]

BODY = r'''## v8.2.2 · 歌词乱跳根治 + 高光保持律 + 频谱助手保活与日志定位

### ① chushi-spectrum 没在跑 / 日志找不到——双根治

- **日志位置（唯一，不再到处找）**：
  - 助手：`%LOCALAPPDATA%\ChuShi\spectrum-log.txt`
  - 枢纽（新增）：`%LOCALAPPDATA%\ChuShi\hub-log.txt`
  - 插件目录只读时日志不再静默消失——两个日志都固定写用户目录
- **为什么之前没在跑**：旧版只有扩展在线且播放中才触发拉起；本版 hub 收到任何
  `/api/state`（桥每秒推状态）就**主动保障助手在场**（20s 冷却，探测在前，在位零开销）
- **没跑也会留下证据**：hub 记录助手**退出码**（`0xC0000135`=缺运行库、
  `0xC0000022`=被拦截等）；助手自身启动最先写日志（含互斥体占用/端口全忙/WSA 失败）

### ② 浮窗歌词乱跳——根治（数据面）

- 真因：浮窗每秒拿到一次真值就**硬换锚点**，锚点年龄抖动让显示位置每秒向后锯齿，
  逐字歌词在行界来回跥（「初始」面板早有同族防护，浮窗本轮补齐同款管线）
- 修法（与面板 sandbox.js 同律）：微噪 800ms 软重锚平滑入轨 / 回退拍先拒收
  （连续 2 拍才放行）/ seek 后乐观重锚 + 4.5s 护航窗（拖动后进度条不回弹）

### ③ 逐字歌词高光提前消失——根治（浮窗 + 面板同律）

- 旧行为：一句唱完 250ms 后高光就渐隐——下一句还没开始高光就没了
- 新律：**唱完的行高光一直挂住，直到下一句开始才随行切换渐隐；间奏段同样挂住**
- 附带修复：seek 回退时曾唱行的白色定格残留（clean 标记漏洞）+ 词扫光写值防抖（掉帧治理）

### ④ 浮窗交互整改

- **浮窗任何位置点击都不再跳转「初始」**（含点歌名）
- **封面态可以拖动了**：按住封面拖动移窗；单击仍是展开标准卡（拖后 350ms 不误触）
- **封面禁止原生拖拽鬼影**（浮窗与「初始」面板都处理）
- **标准态按钮分行**：右上角[收起成封面][放大到完全体]独立顶带，与上一首/播放/下一首明确分开

### 测试

- 新增 verify-v822-ext **17/17**（真浏览器 e2e：三态往返 261↔321↔45；**点歌名零跳转 3→3 页**；
  **封面态拖动 949→1048 移窗 + 单击展开不误触**；标准态封面禁拖 1009→1009；把手拖动 949→868；
  hublog 歌词取证；零致命报错；截图终审）
- v814-lyric 升 **24/24**（L2 改判高光保持律：唱完 400ms 高光挂住，行切换才渐隐）
- 回归：v821-lyric 36/36 + v809-e2e 15/15 + v808-e2e 19/19（真桥×真 hub 双实例）+
  v814-core 15/15 + v813-core 18/18 + v810-core 12/12 + v809-core 21/21 + lyricapi 11/11 +
  v820-glow 9/9 全绿；native 宪法门（hub 导入表仅 ws2_32+kernel32）双架构过
- 规范扩展包防呆门 + 桥资产门（hub 特征 `auto-ensure`/`helper exited code`；
  助手特征 `process starting`/`local-appdata`）

### 升级步骤（本版三件必换）

1. 「初始」页更新到 v8.2.2（覆盖安装 `ChuShi-NewTab-v8.2.2.zip`：**删净旧解压目录** → 解压新包 → 扩展页点刷新）
2. 更新桥插件到 **8.2.2**（hub 保活 + 日志回退链 + 助手 8.2.2——替换后**重启网易云**）
3. SMTC 音乐预设更新到 **8.2.2**（面板高光保持/禁拖/防抖——⌘K 导入新 cshz）；歌词源 7.3.0 沿用
4. 验收：①`%LOCALAPPDATA%\ChuShi\` 下两个日志都在且助手在任务管理器可见；
  ②浮窗歌词不再乱跳、唱完的高光挂到下一句开始；③封面态按住拖得动、单击展开；
  ④点浮窗任何位置都不再跳「初始」；⑤标准态按钮明显分开
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
