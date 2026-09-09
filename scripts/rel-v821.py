#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v8.2.1 GitHub Release 发布（悬浮音乐卡 + 封面高光律动；逐资产 SHA-256 校验）"""
import hashlib, json, sys, time
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError

ROOT = Path(__file__).resolve().parents[1]
TOKEN = (ROOT / '.pkgtmp/gh-token').read_text().strip()
REPO = 'LXgssy/Start-chushi'
TAG = 'v8.2.1'
OUT = ROOT / 'download/v8.2.1'

ASSETS = [
    'ChuShi-Music-Bridge-8.2.0.plugin',
    'ChuShi-Lyric-Source-7.3.0.plugin',
    'ChuShi-NewTab-v8.2.1.zip',
    'ChuShi-Music-Preset-8.2.0.cshz',
    'ChuShi-v8.2.1-AllInOne.zip',
    'SHA256SUMS.txt',
]

BODY = r'''## v8.2.1 · 浮窗三态 + 完全体逐字/逐行歌词 + 频谱日志可发现

### ① spectrum-log.txt 找不到——根治

- 真因：日志原写在助手 exe 旁（与 hub.dll 同目录），但网易云插件目录常在 Program Files 下，普通权限进程**写不进去且静默**
- 本版回退链：exe 同目录试写失败 → 自动退 `%LOCALAPPDATA%\ChuShi\spectrum-log.txt`
- 启动首行自证实际路径：`[boot] log file (档位): 路径`——永远找得到
- 排查三步：①任务管理器搜 `chushi-spectrum`；②在跑则看 hub.dll 旁 → `%LOCALAPPDATA%\ChuShi\`；③不在跑 = hub 未拉起（确认桥 8.2.x + 重启网易云，「初始」诊断口 hubLog 看 `[spec]` 行）

### ② 浮窗三个状态（重构）

| 状态 | 内容 | 交互 |
|---|---|---|
| **封面态** | 整卡只显示封面 + 播放绿点 | **单击 → 标准态**；不可拖 |
| **标准态** | 封面+歌名歌手+三键+进度条 | 右上角 **[收起成封面][放大到完全体]**；点主体回面板；**点进度条 → 完全体**（不再跳「初始」） |
| **完全体** | 与「初始」页音乐卡同级 | 逐字（yrc 扫光）**与**逐行（lrc）歌词、翻译、句尾渐隐、回退还原、间奏灰、暂停淡出；时间显示；**进度条可点按 seek**；右上角 [收起成封面][缩回标准] |

- 旧「药丸收起」退役（坏交互），旧用户自动迁移成封面态
- 歌词数据 = SW 代理 hub `/api/lyric`，songId 归属强校验——切歌窗口绝不串歌
- **封面禁拖**：封面纯点击目标，拖动把手只在主体空白（拖窗口不再误触）
- 按站隐藏入口改**右键卡片**（原 × 位让给放大钮；仍是会话级，重启浏览器还原）

### ③ 测试

- 新增 verify-v821-lyric **36/36**（yrc/lrc 解析、伪逐字权重估算、二分对齐、间奏 lastLine、翻译吸附、fadeMs）
- 新增 verify-v821-ext **15/15**（真浏览器 e2e：closed shadow 外部探测判态——宽度带 cover 45 / mini 261 / full 321；三态往返全链；**封面禁拖 949→949**；把手拖动 949→868；hublog 歌词取证；截图终审）
- 回归：v814-core 15/15 + v814-lyric 23/23 + v813-core 18/18 + v810-core 12/12 + v809-core 21/21 + lyricapi 11/11 + v820-glow 9/9 全绿
- 规范扩展包防呆门 + 桥资产门（助手 exe 特征：`8.2.1` / `log file` / `local-appdata`）

### 升级步骤（本版两件必换）

1. 「初始」页更新到 v8.2.1（覆盖安装 `ChuShi-NewTab-v8.2.1.zip`：**删净旧解压目录** → 解压新包 → 扩展页点刷新）
2. 更新桥插件到 **8.2.1**（内含 8.2.1 频谱助手——替换后**重启网易云**）
3. SMTC 音乐预设 8.2.0 / 歌词源 7.3.0 **沿用无需动**
4. 验收：①浮窗点进度条直接看歌词；②右上角放大/收起按钮三态往返；③拖封面不再误触，拖标题区换位；④spectrum-log.txt 在 `%LOCALAPPDATA%\ChuShi\` 或 hub.dll 旁
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
