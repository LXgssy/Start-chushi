#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v7.2.0 GitHub Release 发布（token 取自 git remote URL）"""
import re, subprocess, sys, json
from pathlib import Path

WT = Path('/home/z/my-project/.wt-v7')
url = subprocess.run(['git', '-C', str(WT), 'remote', 'get-url', 'origin'],
                     capture_output=True, text=True).stdout.strip()
m = re.search(r'https://([^:]+):([^@]+)@github.com/', url)
TOKEN = m.group(2)
HDR = {'Authorization': f'token {TOKEN}', 'Accept': 'application/vnd.github+json'}
API = 'https://api.github.com/repos/LXgssy/Start-chushi'
OUT = WT / 'download/v7.2.0'
TAG = 'v7.2.0'

import urllib.request

def req(path, data=None, method=None, headers=None, raw=False):
    r = urllib.request.Request(API + path, data=data, method=method)
    for k, v in HDR.items():
        r.add_header(k, v)
    if headers:
        for k, v in headers.items():
            r.add_header(k, v)
    with urllib.request.urlopen(r) as resp:
        body = resp.read()
        return json.loads(body) if not raw else body

# 1) 创建 Release
notes = (OUT / 'v7.2.0-修复说明.md').read_text(encoding='utf-8')
body = json.dumps({
    'tag_name': TAG,
    'target_commitish': 'main',
    'name': 'ChuShi SMTC v7.2.0 — raise 路径 SEH 全覆盖 + 未知曲目根治',
    'body': notes,
    'draft': False,
    'prerelease': False,
}).encode()
try:
    rel = req('/releases', data=body, method='POST')
    print(f'release created id={rel["id"]}')
except Exception as e:
    if 'already_exists' in str(e):
        rels = req('/releases/tags/' + TAG)
        rel = rels
        print(f'release exists id={rel["id"]}')
    else:
        raise

# 2) 上传资产
assets = ['ChuShi-SMTC-Manager-7.2.0.plugin', 'ChuShi-Music-Bridge-7.1.0.plugin',
          'ChuShi-Lyric-Source-7.0.0.plugin', '初始SMTC音乐预设.cshz',
          'ChuShi-SMTC-v7.2.0-FixNotes.md', 'SHA256SUMS.txt',
          'ChuShi-v7.2.0-Music-Bundle.zip']
existing = {a['name'] for a in rel.get('assets', [])}
for name in assets:
    p = OUT / name
    if name in existing:
        print(f'skip (exists): {name}')
        continue
    data = p.read_bytes()
    up = urllib.request.Request(
        f'https://uploads.github.com/repos/LXgssy/Start-chushi/releases/{rel["id"]}/assets?name='
        + urllib.parse.quote(name), data=data, method='POST')
    up.add_header('Authorization', f'token {TOKEN}')
    up.add_header('Content-Type', 'application/octet-stream')
    with urllib.request.urlopen(up) as resp:
        j = json.loads(resp.read())
        print(f'uploaded: {j["name"]} ({j["size"]} bytes)')

# 3) 核验
rel2 = req('/releases/tags/' + TAG)
print(f'\nrelease id={rel2["id"]} assets={len(rel2["assets"])}:')
for a in rel2['assets']:
    ok = 'OK' if a['size'] == (OUT / a['name']).stat().st_size else 'SIZE-MISMATCH'
    print(f'  {a["name"]}  {a["size"]}  {ok}')
