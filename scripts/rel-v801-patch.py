#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v8.0.1 Release 资产修补：替换 cshz / NewTab zip / AllInOne / SHA256SUMS（导入上限修复版）"""
import hashlib, json, sys
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError

ROOT = Path(__file__).resolve().parents[1]
TOKEN = (ROOT / '.pkgtmp/gh-token').read_text().strip()
REPO = 'LXgssy/Start-chushi'
TAG = 'v8.0.1'
OUT = ROOT / 'download/v8.0.1'
RELEASE_ID = 384565121

REPLACE = [
    'ChuShi-NewTab-v8.0.1.zip',
    'ChuShi-Music-Preset-8.0.1.cshz',
    'ChuShi-v8.0.1-AllInOne.zip',
    'SHA256SUMS.txt',
]

def api(path, data=None, method='GET', raw=False, headers=None):
    req = Request(f'https://api.github.com/repos/{REPO}/{path}',
                  method=method,
                  data=json.dumps(data).encode() if isinstance(data, dict) else data,
                  headers={'Authorization': f'Bearer {TOKEN}',
                           'Accept': 'application/vnd.github+json', **(headers or {})})
    try:
        r = urlopen(req, timeout=120)
        body = r.read()
        return (body if raw else (json.loads(body) if body else {})), r.status
    except HTTPError as e:
        return (e.read() if raw else {}), e.code

# 1) 列出现有资产，取待替换者的 id
assets, _ = api(f'releases/{RELEASE_ID}/assets?per_page=50')
by_name = {a['name']: a for a in assets}
print('现有资产:', sorted(by_name))

# 2) 删除待替换资产
for name in REPLACE:
    if name in by_name:
        _, code = api(f'releases/assets/{by_name[name]["id"]}', method='DELETE')
        print(f'删除 {name}: HTTP {code}')

# 3) 重新上传（名称带 token 防中文参数问题，走 upload_url）
up, _ = api(f'releases/{RELEASE_ID}')
upload_url = up['upload_url'].split('{')[0]
for name in REPLACE:
    data = (OUT / name).read_bytes()
    req = Request(f'{upload_url}?name={name}', method='POST', data=data,
                  headers={'Authorization': f'Bearer {TOKEN}',
                           'Content-Type': 'application/octet-stream'})
    r = urlopen(req, timeout=300)
    j = json.loads(r.read())
    local = hashlib.sha256(data).hexdigest()
    print(f'上传 {name} ({len(data)}B) state={j["state"]} sha256={local[:16]}…')

# 4) 终态核验
assets2, _ = api(f'releases/{RELEASE_ID}/assets?per_page=50')
names = {a['name']: a['size'] for a in assets2}
missing = [n for n in REPLACE if n not in names]
sizebad = [n for n in REPLACE if n in names and names[n] != (OUT / n).stat().st_size]
print('资产终态:', len(names), '个; 缺失=', missing, '; 尺寸不符=', sizebad)
sys.exit(1 if (missing or sizebad) else 0)
