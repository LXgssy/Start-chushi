#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""eapi /eapi/song/lyric/v1 参数实测：插件现行 yv:0 与 yv:-1 的 yrc 返回差异"""
import hashlib, json, urllib.request, urllib.parse, uuid
from Crypto.Cipher import AES

SECRET = b'e82ckenh8dichen8'

def eapi_encrypt(path, params_json):
    text = path + params_json
    msg = hashlib.md5(text.encode()).digest() + text.encode()
    pad = 16 - len(msg) % 16
    msg += bytes([pad]) * pad
    cipher = AES.new(SECRET, AES.MODE_ECB)
    return cipher.encrypt(msg).hex().upper()

def eapi_post(path, params):
    payload = eapi_encrypt(path, json.dumps(params, separators=(',', ':')))
    tag = params.get('_tag', '?')
    url = 'https://music.163.com' + path.replace('/eapi', '/eapi')
    data = urllib.parse.urlencode({'params': payload}).encode()
    # eapi 需要把密文同时作为 eparams cookie（部分端点校验）
    cookie = 'os=pc; appver=2.10.13; osver=Microsoft-Windows-10-; ' + 'EPARAMS=' + payload[:0]  # placeholder
    req = urllib.request.Request(url, data=data, method='POST')
    req.add_header('Content-Type', 'application/x-www-form-urlencoded')
    req.add_header('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) NetEaseMusic/2.10.13')
    req.add_header('Cookie', 'os=pc; appver=2.10.13')
    req.add_header('Referer', 'https://music.163.com/')
    with urllib.request.urlopen(req, timeout=12) as r:
        body = r.read().decode()
        print(f"[{tag}] raw head: {body[:200]!r}")
        return json.loads(body)

def show(tag, params):
    try:
        params = dict(params, _tag=tag)
        j = eapi_post('/eapi/song/lyric/v1', params)
        keys = list(j.keys())
        yrc = (j.get('yrc') or {}).get('lyric', '') if isinstance(j.get('yrc'), dict) else ''
        lrc = (j.get('lrc') or {}).get('lyric', '') if isinstance(j.get('lrc'), dict) else ''
        kly = j.get('klyric')
        kly_has = isinstance(kly, dict) and bool(kly.get('lyric'))
        print(f"[{tag}] code={j.get('code')} keys={keys}")
        print(f"   lrc={len(lrc)} yrc={len(yrc)} klyric={kly_has}")
        if yrc:
            print('   yrc head:', yrc[:120].replace('\n', '␤'))
    except Exception as e:
        print(f"[{tag}] FAIL: {e}")

# 插件现行参数（yv:0）
show('current yv=0', {'id': 186016, 'cp': False, 'lv': 0, 'tv': 0, 'rv': 0, 'kv': 0, 'yv': 0, 'ytv': 0})
# 全 -1 强制返回
show('force -1', {'id': 186016, 'cp': False, 'lv': -1, 'tv': -1, 'rv': -1, 'kv': -1, 'yv': -1, 'ytv': -1})
