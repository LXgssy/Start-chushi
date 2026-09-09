#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Release v8.1.2 body 资产修复注记刷新：旧「资产修复」段替换为两轮修复的最终说明。幂等。"""
import json
import pathlib
import sys
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
TOKEN = (ROOT / '.pkgtmp/gh-token').read_text().strip()
REPO = 'LXgssy/Start-chushi'
TAG = 'v8.1.2'
MARK = '2025-09-09 资产修复'

NEW_NOTE = f'''

---

### ⚠ {MARK}（两轮，当前包为最终修复版）

1. 原发布包缺 `manifest.json` 等扩展必需文件，全新环境无法加载 → 已修复。
2. 修复版仍含 Next.js 默认的 `_next/` 等下划线开头目录，Chromium/Edge 的「加载已解压的扩展程序」拒绝该类保留名 → 已在打包流程内自动改名（`_next→next` 等）并同步全部引用。

**此前下载过本 Release 任何版本 `ChuShi-NewTab-v8.1.2.zip` 的用户请重新下载**（文件名不变；现大小 12,259,300 B，SHA-256 以最新 `SHA256SUMS.txt` 为准）。

安装：解压到永久目录 → `chrome://extensions`（Edge：`edge://extensions`）→ 开发者模式 →「加载已解压的扩展程序」→ 选解压目录。'''

def call(path, method='GET', data=None):
    req = urllib.request.Request(path if path.startswith('https') else f'https://api.github.com{path}', method=method)
    req.add_header('Authorization', f'Bearer {TOKEN}')
    req.add_header('Accept', 'application/vnd.github+json')
    req.add_header('Content-Type', 'application/json')
    req.add_header('User-Agent', 'chushi-rel')
    body = json.dumps(data).encode() if data is not None else None
    with urllib.request.urlopen(req, body, timeout=60) as r:
        return json.loads(r.read())

rel = call(f'/repos/{REPO}/releases/tags/{TAG}')
body = rel['body']
if '最终修复版' in body:
    print('注记已是最终版，跳过')
    sys.exit(0)
if MARK in body:
    head = body.split('\n\n---\n')[0]  # 旧注记起于第一个分隔线，整体替换
    new_body = head + NEW_NOTE
else:
    new_body = body + NEW_NOTE
patched = call(f'/repos/{REPO}/releases/{rel["id"]}', method='PATCH', data={'body': new_body})
print('body 已刷新:', len(body), '→', len(patched['body']), '| 最终版标记:', '最终修复版' in patched['body'], '| 旧段残留:', '原发布包缺' in patched['body'] and '保留名' in patched['body'])
