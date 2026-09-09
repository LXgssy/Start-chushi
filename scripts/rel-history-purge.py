#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""历史 Release 坏资产删除：v8.0.8 / v8.0.9 / v8.1.1 的 NewTab zip + AllInOne + SHA256SUMS。

坏件定义（Task 110 发版回归）：NewTab zip 缺 manifest/_locales/icons + 内联脚本；
AllInOne 内嵌该坏 zip；SHA256SUMS 对应坏包哈希。好件（桥/歌词源/cshz/说明）保留。
每个 Release body 追加升级指引注记（幂等）。
"""
import json
import pathlib
import sys
import time
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
TOKEN = (ROOT / '.pkgtmp/gh-token').read_text().strip()
REPO = 'LXgssy/Start-chushi'

NOTE = '''

---

### ⚠ 2025-09-09 资产移除

本 Release 的 NewTab zip / AllInOne / SHA256SUMS 已**移除**：该批打包存在缺陷（缺扩展必需文件，无法全新安装）。桥 / 歌词源 / 预设资产不受影响、继续可用。请直接使用 **[v8.1.2](https://github.com/{REPO}/releases/tag/v8.1.2)**（已修复，含全部历史改进）。'''

NOTE = NOTE.replace('{REPO}', REPO)

def api(path, method='GET', data=None, raw=False):
    req = urllib.request.Request(path if path.startswith('https') else f'https://api.github.com{path}', method=method)
    req.add_header('Authorization', f'Bearer {TOKEN}')
    req.add_header('Accept', 'application/vnd.github+json')
    req.add_header('User-Agent', 'chushi-rel')
    body = json.dumps(data).encode() if data is not None else None
    if body:
        req.add_header('Content-Type', 'application/json')
    try:
        with urllib.request.urlopen(req, body, timeout=60) as r:
            payload = r.read()
            return r.status, (payload if raw else (json.loads(payload) if payload else {}))
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode(errors='replace')

BAD_PAT = ('NewTab', 'AllInOne', 'SHA256SUMS')
total_del = 0
for tag in ('v8.0.8', 'v8.0.9', 'v8.1.1'):
    st, rel = api(f'/repos/{REPO}/releases/tags/{tag}')
    if st != 200:
        print(f'{tag}: GET {st} 跳过'); continue
    print(f'== {tag} (id {rel["id"]}) ==')
    bad = [a for a in rel['assets'] if any(p in a['name'] for p in BAD_PAT)]
    for a in bad:
        st, _ = api(f'/repos/{REPO}/releases/assets/{a["id"]}', method='DELETE')
        print(f'  [{"del " if st == 204 else "FAIL"}] #{a["id"]} {a["name"]}')
        total_del += st == 204
        time.sleep(1)
    if '资产移除' in rel['body']:
        print('  注记已存在，跳过 body')
        continue
    st, _ = api(f'/repos/{REPO}/releases/{rel["id"]}', method='PATCH', data={'body': rel['body'] + NOTE})
    print(f'  [{"note" if st == 200 else "NOTE FAIL"}] body {len(rel["body"])}→{len(rel["body"]) + len(NOTE)}')
print(f'\n删除 {total_del}/9')
sys.exit(0 if total_del == 9 else 1)
