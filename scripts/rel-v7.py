#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Release v7.0.0：创建 release + 上传 7 资产（幂等：已存在则校验 SHA-256 收尾）"""
import hashlib, json, sys, time, urllib.request
from pathlib import Path

ROOT = Path('/home/z/my-project')
TOKEN = (ROOT / '.pkgtmp/gh-token').read_text().strip().splitlines()[0].strip()
REPO = 'LXgssy/Start-chushi'
TAG = 'v7.0.0'
OUT = ROOT / 'download/v7.0.0'
ASSETS = [
    f'ChuShi-SMTC-Manager-7.0.0.plugin',
    f'ChuShi-Music-Bridge-7.0.0.plugin',
    f'ChuShi-Lyric-Source-7.0.0.plugin',
    'ChuShi-NewTab-v7.0.0.zip',
    '初始SMTC音乐预设.cshz',
    'ChuShi-v7.0.0-合并交付包.zip',
    'SHA256SUMS.txt',
]

def api(path, method='GET', data=None, headers=None, raw=False):
    url = f'https://api.github.com{path}' if path.startswith('/') else path
    req = urllib.request.Request(url, method=method)
    req.add_header('Authorization', f'token {TOKEN}')
    req.add_header('Accept', 'application/vnd.github+json')
    req.add_header('User-Agent', 'chushi-rel-v7')
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    body = None
    if data is not None:
        body = json.dumps(data).encode() if not isinstance(data, bytes) else data
    try:
        with urllib.request.urlopen(req, body, timeout=120) as r:
            payload = r.read()
            return r.status, (payload if raw else (json.loads(payload) if payload else None))
    except urllib.error.HTTPError as e:
        payload = e.read()
        try:
            return e.code, json.loads(payload)
        except Exception:
            return e.code, payload[:200]

def sha256(p: Path) -> str:
    h = hashlib.sha256()
    with open(p, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()

BODY = '''「初始」v7.0.0 — 音乐链路全量重写（三插件原生架构）

**本代根治**
- SMTC 连 Windows 都读不到 → **真原生 DLL**（独立系统媒体会话，GetForWindow 自有窗口）：悬浮窗卡片/锁屏封面/媒体键/可拖进度全可用，无需开网易云 SMTC 开关
- 三插件全坏/页面无音乐 → 根因：BetterNCM v2 为 CEF 环境无 Node，v6 的 require(\"http\") 枢纽与 navigator.mediaSession 必然失效；v7 枢纽住进原生 DLL（127.0.0.1:26901，占用退 26902/26903）
- 歌词源纯 JS 自实现 eapi（MD5 + AES-128-ECB 向量级验证），eapi→channel→直连三层回退

**升级三步**：删光旧 .plugin → 放入三个新 .plugin → 完全重启网易云；浏览器扩展重新加载 / web 版 Ctrl+F5。详见 使用说明-音乐链路.md。

**校验**：sha256sum -c SHA256SUMS.txt'''

# 1) 建 release（幂等：按 tag 查，404 才建）
code, rel = api(f'/repos/{REPO}/releases/tags/{TAG}')
if code == 200 and rel and rel.get('upload_url'):
    print(f'release exists id={rel["id"]}')
else:
    code, rel = api(f'/repos/{REPO}/releases', 'POST', {
        'tag_name': TAG, 'name': 'v7.0.0 · 原生 SMTC + 纯 JS 三插件', 'body': BODY, 'draft': False, 'prerelease': False,
    })
    if code not in (200, 201):
        print('create release failed', code, rel)
        sys.exit(1)
    print(f'release created id={rel["id"]}')

upload_base = rel['upload_url'].split('{')[0]
existing = {a['name'] for a in rel.get('assets', [])}

# 2) 上传资产（4 次退避重试）
ok_assets = []
for name in ASSETS:
    p = OUT / name
    if not p.exists():
        print('MISSING', name); sys.exit(1)
    if name in existing:
        print(f'skip (already present) {name}')
        ok_assets.append(name)
        continue
    digest = sha256(p)
    for attempt in range(4):
        code, resp = api(f'{upload_base}?name={urllib.request.quote(name)}', 'POST',
                         data=p.read_bytes(),
                         headers={'Content-Type': 'application/octet-stream'})
        if code in (200, 201):
            print(f'uploaded {name} ({p.stat().st_size} bytes)')
            ok_assets.append(name)
            break
        print(f'  retry {attempt + 1} for {name}: {code} {str(resp)[:80]}')
        time.sleep(2 * (attempt + 1))
    else:
        print(f'UPLOAD FAILED {name}')
        sys.exit(1)

# 3) 终检：直链 SHA-256
print('== 终检 ==')
bad = 0
for name in ASSETS:
    url = f'https://github.com/{REPO}/releases/download/{TAG}/{urllib.request.quote(name)}'
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'chushi-rel-v7'})
        with urllib.request.urlopen(req, timeout=180) as r:
            data = r.read()
        got = hashlib.sha256(data).hexdigest()
        want = sha256(OUT / name)
        status = 'OK' if got == want else 'MISMATCH'
        if got != want:
            bad += 1
        print(f'  {status} {name} ({len(data)} bytes)')
    except Exception as e:
        bad += 1
        print(f'  FETCH-FAIL {name}: {str(e)[:80]}')
print('RELEASE OK' if bad == 0 else f'RELEASE BAD ({bad})')
sys.exit(1 if bad else 0)
