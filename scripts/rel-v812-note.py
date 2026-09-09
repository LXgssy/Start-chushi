#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Release v8.1.2 body 追加资产修复注记（幂等：已有注记则跳过）。"""
import json
import pathlib
import sys
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
TOKEN = (ROOT / '.pkgtmp/gh-token').read_text().strip()
REPO = 'LXgssy/Start-chushi'
TAG = 'v8.1.2'

NOTE = '''

---

### ⚠ 2025-09-09 资产修复

本 Release 的 `ChuShi-NewTab-v8.1.2.zip` / `SHA256SUMS.txt` / `ChuShi-v8.1.2-AllInOne.zip` 已替换为**修正版**：原包缺 `manifest.json` 等扩展必需文件，全新环境无法加载（老用户覆盖安装不受影响）。已下载旧包的用户请**重新下载**（文件名不变，SHA-256 以最新 `SHA256SUMS.txt` 为准；NewTab zip 现大小 12,264,798 B）。解压 → `chrome://extensions` → 开发者模式 →「加载已解压的扩展程序」→ 选解压目录即可安装。'''

def api(path, method='GET', data=None):
    req = urllib.request.Request(path if path.startswith('https://') else f'https://api.github.com{path}', method=method)
    req.add_header('Authorization', f'Bearer {TOKEN}')
    req.add_header('Accept', 'application/vnd.github+json')
    req.add_header('User-Agent', 'chushi-rel')
    body = json.dumps(data).encode() if data is not None else None
    if body:
        req.add_header('Content-Type', 'application/json')
    with urllib.request.urlopen(req, body, timeout=60) as r:
        return json.loads(r.read()) if r.read.__self__ is not None or True else {}

st = {}
req = urllib.request.Request(f'https://api.github.com/repos/{REPO}/releases/tags/{TAG}')
req.add_header('Authorization', f'Bearer {TOKEN}')
req.add_header('Accept', 'application/vnd.github+json')
req.add_header('User-Agent', 'chushi-rel')
with urllib.request.urlopen(req, timeout=60) as r:
    rel = json.loads(r.read())

if '2025-09-09 资产修复' in rel['body']:
    print('注记已存在，跳过')
    sys.exit(0)

new_body = rel['body'] + NOTE
req = urllib.request.Request(f'https://api.github.com/repos/{REPO}/releases/{rel["id"]}', method='PATCH', data=json.dumps({'body': new_body}).encode())
req.add_header('Authorization', f'Bearer {TOKEN}')
req.add_header('Accept', 'application/vnd.github+json')
req.add_header('Content-Type', 'application/json')
req.add_header('User-Agent', 'chushi-rel')
with urllib.request.urlopen(req, timeout=60) as r:
    patched = json.loads(r.read())
print('body 已更新，新长度:', len(patched['body']), '| 注记在位:', '2025-09-09 资产修复' in patched['body'])
