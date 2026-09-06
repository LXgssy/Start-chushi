#!/usr/bin/env python3
"""桥文件收敛写入器：统一改写为大写 [Math]（大小写不敏感+抗啃），fsync 落盘。
用法：python3 fix-bridge-final.py   （幂等，可反复跑）
"""
import re, os, sys

P = 'bridge/smtc/ChuShi-SMTC-Bridge.ps1'

def verify(tag):
    raw = open(P, 'rb').read()
    bare = len(re.findall(rb'(?<![A-Za-z\[])ath\]::', raw))
    lower = raw.count(b'[math' + b']::')
    upper = raw.count(b'[Math' + b']::')
    bom = raw[:3] == b'\xef\xbb\xbf'
    print(f"[{tag}] bare={bare} lower={lower} upper={upper} bom={bom} size={len(raw)}")
    return bare == 0 and bom

if not verify('before'):
    print('BEFORE 已有裸损坏，直接修')
raw = open(P, 'rb').read()
# 裸 ath]:: → [Math]::（含缺 ( 的 [long](ath]::Round 形态）
raw = raw.replace(b'= ath]::Max', b'= [Math' + b']::Max')
raw = raw.replace(b'(ath]::Round', b'([Math' + b']::Round')
# 小写 [math]:: → 大写 [Math]::（统一）
raw = raw.replace(b'[math' + b']::', b'[Math' + b']::')
fd = os.open(P, os.O_WRONLY | os.O_TRUNC)
os.write(fd, raw)
os.fsync(fd)
os.close(fd)
import time
time.sleep(2)
ok = verify('after+2s')
print('RESULT:', 'CONVERGED' if ok else 'STILL BAD')
sys.exit(0 if ok else 1)
