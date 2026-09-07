#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v7.0.0 Release 资产改名修复：删中文/断名资产 → ASCII 名重传 → 终检"""
import hashlib, json, sys, time, urllib.request
from pathlib import Path

TOKEN = Path('/home/z/my-project/.pkgtmp/gh-token').read_text().strip().splitlines()[0].strip()
REPO = 'LXgssy/Start-chushi'
OUT = Path('/home/z/my-project/download/v7.0.0')
TAG = 'v7.0.0'

# 断名/需改名资产 → ASCII 名 + 本地源文件
REDO = {
    'ChuShi-v7.0.0-.zip': 'ChuShi-v7.0.0-AllInOne.zip',
    '.zip': None,  # 可能存在的其它断名变体，直接删
}
RENAMES = [
    ('初始SMTC音乐预设.cshz', 'ChuShi-Smtc-Preset-7.0.0.cshz'),
    ('ChuShi-v7.0.0-合并交付包.zip', 'ChuShi-v7.0.0-AllInOne.zip'),
]
SHA_NAME_MAP = {
    '初始SMTC音乐预设.cshz': 'ChuShi-Smtc-Preset-7.0.0.cshz',
    'ChuShi-v7.0.0-合并交付包.zip': 'ChuShi-v7.0.0-AllInOne.zip',
}

def api(path, method='GET', data=None, headers=None):
    url = f'https://api.github.com{path}' if path.startswith('/') else path
    req = urllib.request.Request(url, method=method)
    req.add_header('Authorization', f'token {TOKEN}')
    req.add_header('Accept', 'application/vnd.github+json')
    req.add_header('User-Agent', 'chushi-rel-v7-fix')
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    body = json.dumps(data).encode() if isinstance(data, (dict, list)) else data
    try:
        with urllib.request.urlopen(req, body, timeout=180) as r:
            payload = r.read()
            return r.status, (json.loads(payload) if payload else None)
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read())
        except Exception:
            return e.code, None

def sha256(p: Path) -> str:
    h = hashlib.sha256()
    with open(p, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()

code, rel = api(f'/repos/{REPO}/releases/tags/{TAG}')
assert code == 200, rel
upload_base = rel['upload_url'].split('{')[0]
assets = rel.get('assets', [])
by_name = {a['name']: a for a in assets}
print('current assets:', list(by_name))

# 1) 删除断名资产（含中文被剥离的所有变体）+ 旧中文名资产
for a in assets:
    name = a['name']
    need_del = (name in RENAMES and name in by_name) or name == 'ChuShi-v7.0.0-.zip' or \
               (name.endswith('.zip') and 'ChuShi-v7.0.0-' in name) or \
               (name.endswith('.cshz') and not name.startswith('ChuShi-')) or \
               (name == '.cshz') or (name.endswith('.md') and '使用说明' in name)
    if need_del:
        code, _ = api(f'/repos/{REPO}/releases/assets/{a["id"]}', 'DELETE')
        print(f'delete {name}: {code}')

# 2) SHA256SUMS.txt 用 ASCII 资产名重写并本地同步
files = [
    ('ChuShi-SMTC-Manager-7.0.0.plugin', 'ChuShi-SMTC-Manager-7.0.0.plugin'),
    ('ChuShi-Music-Bridge-7.0.0.plugin', 'ChuShi-Music-Bridge-7.0.0.plugin'),
    ('ChuShi-Lyric-Source-7.0.0.plugin', 'ChuShi-Lyric-Source-7.0.0.plugin'),
    ('ChuShi-NewTab-v7.0.0.zip', 'ChuShi-NewTab-v7.0.0.zip'),
    ('初始SMTC音乐预设.cshz', 'ChuShi-Smtc-Preset-7.0.0.cshz'),
    ('ChuShi-v7.0.0-合并交付包.zip', 'ChuShi-v7.0.0-AllInOne.zip'),
]
lines = []
for local, relname in files:
    lines.append(f'{sha256(OUT / local)}  {relname}')
(OUT / 'SHA256SUMS.txt').write_text('\n'.join(lines) + '\n', encoding='utf-8')

# 3) 上传改名资产 + 更新后的 SHA256SUMS
to_upload = [('ChuShi-Smtc-Preset-7.0.0.cshz', OUT / '初始SMTC音乐预设.cshz'),
             ('ChuShi-v7.0.0-AllInOne.zip', OUT / 'ChuShi-v7.0.0-合并交付包.zip'),
             ('SHA256SUMS.txt', OUT / 'SHA256SUMS.txt')]
code, rel = api(f'/repos/{REPO}/releases/tags/{TAG}')
existing = {a['name'] for a in rel.get('assets', [])}
for relname, path in to_upload:
    if relname in existing:
        print(f'skip existing {relname}')
        continue
    for attempt in range(4):
        code, resp = api(f'{upload_base}?name={urllib.request.quote(relname)}', 'POST',
                         data=path.read_bytes(), headers={'Content-Type': 'application/octet-stream'})
        if code in (200, 201):
            print(f'uploaded {relname} ({path.stat().st_size} bytes)')
            break
        print(f'  retry {attempt+1} {relname}: {code}')
        time.sleep(2 * (attempt + 1))
    else:
        print(f'UPLOAD FAILED {relname}')
        sys.exit(1)

# 4) 终检：全资产 API 名单 + browser_download_url 逐一下载校验
time.sleep(2)
code, rel = api(f'/repos/{REPO}/releases/tags/{TAG}')
expect = {relname for _, relname in files} | {'SHA256SUMS.txt'}
got_names = {a['name'] for a in rel['assets']}
print('final assets:', sorted(got_names))
bad = 0
local_by_rel = {relname: OUT / local for local, relname in files}
for a in rel['assets']:
    name = a['name']
    if name not in local_by_rel:
        if name != 'SHA256SUMS.txt':
            bad += 1
            print('  UNEXPECTED', name)
        continue
    want = sha256(local_by_rel[name])
    for i in range(3):
        try:
            r = urllib.request.Request(a['browser_download_url'], headers={'User-Agent': 'chushi'})
            data = urllib.request.urlopen(r, timeout=300).read()
            got = hashlib.sha256(data).hexdigest()
            if got == want:
                print(f'  OK {name} ({len(data)} bytes)')
                break
            print(f'  MISMATCH {name} ({len(data)} bytes)')
        except Exception as e:
            print(f'  retry {i+1} {name}: {str(e)[:60]}')
            time.sleep(2)
    else:
        bad += 1
print('RELEASE OK' if bad == 0 else f'RELEASE BAD ({bad})')
sys.exit(1 if bad else 0)
