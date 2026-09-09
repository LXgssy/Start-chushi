#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Release v8.1.2 坏资产补传：NewTab zip（规范扩展包）/ SHA256SUMS / AllInOne 三件。

v8.0.8~v8.1.2 发版回归（Task 110）：发布 zip 缺 manifest/_locales/icons + 内联脚本，
无法全新安装。本地已重建规范包（真浏览器冒烟 10/10），本脚本替换 GitHub 侧三资产。
流程：GET release → DELETE 旧资产 → POST 上传新资产（命名不变，老链接不失效）→
逐资产下载回读 SHA-256 校验。body 若含 SHA 行同步不动（body 未列 SHA，无需改）。
"""
import hashlib
import json
import pathlib
import sys
import time
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
TOKEN = (ROOT / '.pkgtmp/gh-token').read_text().strip()
REPO = 'LXgssy/Start-chushi'
TAG = 'v8.1.2'
OUT = ROOT / 'download/v8.1.2'

REPLACE = {
    'ChuShi-NewTab-v8.1.2.zip': OUT / 'ChuShi-NewTab-v8.1.2.zip',
    'ChuShi-v8.1.2-AllInOne.zip': OUT / 'ChuShi-v8.1.2-AllInOne.zip',
    'SHA256SUMS.txt': OUT / 'SHA256SUMS.txt',
}

def api(path, method='GET', data=None, headers=None, raw=False):
    url = path if path.startswith('https://') else f'https://api.github.com{path}'
    req = urllib.request.Request(url, method=method)
    req.add_header('Authorization', f'Bearer {TOKEN}')
    req.add_header('Accept', 'application/vnd.github+json')
    req.add_header('User-Agent', 'chushi-rel')
    body = None
    if data is not None:
        body = data if isinstance(data, bytes) else json.dumps(data).encode()
        req.add_header('Content-Type', 'application/json')
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, body, timeout=120) as r:
            payload = r.read()
            return r.status, (payload if raw else (json.loads(payload) if payload else {}))
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode(errors='replace')

# 1) 定位 release 与旧资产
st, rel = api(f'/repos/{REPO}/releases/tags/{TAG}')
if st != 200:
    sys.exit(f'GET release {st}: {rel}')
rel_id = rel['id']
assets = {a['name']: a for a in rel['assets']}
print(f'Release {TAG} id={rel_id}, {len(assets)} 资产')

# 2) 本地文件预检（规范扩展包防呆门）
import re, zipfile
z = zipfile.ZipFile(REPLACE['ChuShi-NewTab-v8.1.2.zip'])
names = z.namelist()
assert 'manifest.json' in names and '_locales/zh_CN/messages.json' in names and 'icons/icon128.png' in names, 'NewTab zip 不是规范扩展包'
RESERVED_OK = {'_locales', '_platform_specific', '_metadata'}
for n in names:
    for c in n.split('/'):
        assert not (c and c.startswith('_') and c not in RESERVED_OK), f'保留名违规: {n}'
html = z.read('index.html').decode('utf-8')
assert not [s for s in re.findall(r'<script>(.*?)</script>', html, re.S) if s.strip()], 'index.html 含内联脚本'
print('防呆门通过（manifest/_locales/icons/零内联）')

# 3) 删旧传新
for name, local in REPLACE.items():
    old = assets.get(name)
    if old:
        st, _ = api(f'/repos/{REPO}/releases/assets/{old["id"]}', method='DELETE')
        if st != 204:
            sys.exit(f'DELETE {name} {st}: 中止（避免重名残留）')
        print(f'  deleted #{old["id"]} {name} ({old["size"]}B)')
        time.sleep(1)
    st, up = api(f'https://uploads.github.com/repos/{REPO}/releases/{rel_id}/assets?name={name}',
                 method='POST', data=local.read_bytes(),
                 headers={'Content-Type': 'application/octet-stream'})
    if st != 201:
        sys.exit(f'UPLOAD {name} {st}: {up}')
    print(f'  uploaded #{up["id"]} {name} ({up["size"]}B)')
    time.sleep(1)

# 4) 回读校验
print('\n回读校验:')
ok = 0
for name, local in REPLACE.items():
    st, rel2 = api(f'/repos/{REPO}/releases/tags/{TAG}')
    aid = {a['name']: a for a in rel2['assets']}[name]['id']
    st2, blob = api(f'/repos/{REPO}/releases/assets/{aid}', headers={'Accept': 'application/octet-stream'}, raw=True)
    remote_sha = hashlib.sha256(blob).hexdigest()
    local_sha = hashlib.sha256(local.read_bytes()).hexdigest()
    mark = 'OK' if (remote_sha == local_sha and st2 == 200) else 'MISMATCH'
    ok += mark == 'OK'
    print(f'  [{mark}] {name}: local={local_sha[:12]} remote={remote_sha[:12]}')
print(f'\n{ok}/{len(REPLACE)} OK')
sys.exit(0 if ok == len(REPLACE) else 1)
