#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v8.1.2 资产修复收尾：NewTab zip 已由 build-extension.py 重建为规范扩展包
（manifest/_locales/icons/内联外置），本脚本同步重算 SHA256SUMS.txt + 重建 AllInOne.zip。

v8.0.8~v8.1.2 发版回归：build-v8xx-assets.py 直接 zip 纯网页导出 out/，
发布的 NewTab zip 缺 manifest.json 无法全新安装；本脚本只处理本地交付物。
"""
import hashlib, zipfile
from pathlib import Path

OUT = Path('/home/z/my-project/download/v8.1.2')
staged = [
    OUT / 'ChuShi-Music-Bridge-8.1.0.plugin',
    OUT / 'ChuShi-Lyric-Source-7.3.0.plugin',
    OUT / 'ChuShi-NewTab-v8.1.2.zip',
    OUT / 'ChuShi-Music-Preset-8.1.2.cshz',
    OUT / 'ChuShi-v8.1.2-Usage-Notes.md',
]

def sha256(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()

# 校验 NewTab zip 是规范扩展包（防呆门）
z = zipfile.ZipFile(OUT / 'ChuShi-NewTab-v8.1.2.zip')
names = z.namelist()
assert 'manifest.json' in names, 'NewTab zip 缺 manifest——不是规范扩展包'
assert '_locales/zh_CN/messages.json' in names, 'NewTab zip 缺 _locales'
assert 'icons/icon128.png' in names, 'NewTab zip 缺 icons'
import re
html = z.read('index.html').decode('utf-8')
inline = [s for s in re.findall(r'<script>(.*?)</script>', html, re.S) if s.strip()]
assert not inline, f'index.html 仍有 {len(inline)} 个内联脚本'
print('规范扩展包防呆门通过（manifest/_locales/icons/零内联）')

# SHA256SUMS
sums = OUT / 'SHA256SUMS.txt'
with sums.open('w', encoding='utf-8') as f:
    for p in sorted(staged):
        f.write(f'{sha256(p)}  {p.name}\n')
print('SHA256SUMS.txt 已重算')

# AllInOne
aio = OUT / 'ChuShi-v8.1.2-AllInOne.zip'
aio.unlink(missing_ok=True)
with zipfile.ZipFile(aio, 'w', zipfile.ZIP_DEFLATED) as z:
    for p in sorted(staged):
        z.write(p, p.name)
    z.write(sums, 'SHA256SUMS.txt')
print(f'AllInOne 已重建 ({aio.stat().st_size} B)')

# 回读校验
with zipfile.ZipFile(aio) as z:
    ok = 0
    for line in z.read('SHA256SUMS.txt').decode().splitlines():
        h, name = line.split('  ', 1)
        if hashlib.sha256(z.read(name)).hexdigest() == h:
            ok += 1
    print(f'AllInOne 内 {ok}/5 资产 SHA 回读一致')
