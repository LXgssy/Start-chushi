#!/usr/bin/env python3
"""文叔叔匿名上传 v1.1.2 交付包（基于实测参考实现改造）"""
import hashlib, json, sys, time, base64

try:
    import base58
except ImportError:
    # 内置兜底：base58（Bitcoin 字母表）仅 b58encode 被使用
    class _B58:
        ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"

        def b58encode(self, s):
            if isinstance(s, str):
                s = s.encode()
            n = int.from_bytes(s, "big")
            out = []
            while n > 0:
                n, r = divmod(n, 58)
                out.append(self.ALPHABET[r])
            for byte in s:
                if byte == 0:
                    out.append(self.ALPHABET[0])
                else:
                    break
            return "".join(reversed(out)).encode()

    base58 = _B58()
import requests
from Cryptodome.Cipher import DES
from Cryptodome.Util import Padding

BASE = "https://www.wenshushu.cn"
S = requests.Session()
S.headers.update({
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:82.0) Gecko/20100101 Firefox/82.0",
    "Accept-Language": "en-US, en;q=0.9",
    "Prod": "com.wenshushu.web.pc",
    "Referer": "https://www.wenshushu.cn/",
    "Origin": "https://www.wenshushu.cn",
})

FILEPATH = sys.argv[1] if len(sys.argv) > 1 else "/home/z/my-project/download/v1.1.2/ChuShi-v1.1.2-交付包.zip"

with open(FILEPATH, "rb") as f:
    payload_bytes = f.read()
fname = FILEPATH.split("/")[-1]
file_size = len(payload_bytes)
print(f"文件: {fname} ({file_size/1048576:.1f}MB)")

# 1. 匿名登录
j = S.post(f"{BASE}/ap/login/anonymous", json={"dev_info": "{}"}).json()
assert j["code"] == 0, j
token = j["data"]["token"]
S.headers["X-TOKEN"] = token
print(f"[1] token = {token}")

# 2. 服务器时间
epochtime = S.get(f"{BASE}/ag/time").json()["data"]["time"]

# 3. addsend + A-code DES 签名
req_data = {
    "sender": "", "remark": "", "isextension": False, "notSaveTo": False,
    "notDownload": False, "notPreview": False, "downPreCountLimit": 0,
    "trafficStatus": 0, "pwd": "", "expire": "1",
    "recvs": ["social", "public"],
    "file_size": file_size, "file_count": 1,
}
body_str = json.dumps(req_data, ensure_ascii=False)
md5_hex = hashlib.md5((body_str + token).encode()).hexdigest()
b58 = base58.b58encode(md5_hex.encode())
key_iv = ("".join([epochtime[int(i)] for i in epochtime[::-1][:5]]) + "000").encode()
cipher = DES.new(key_iv, DES.MODE_CBC, key_iv)
a_code = base64.b64encode(cipher.encrypt(Padding.pad(b58, DES.block_size, style="pkcs7"))).decode()

j = S.post(f"{BASE}/ap/task/addsend", data=body_str.encode(), headers={
    "Content-Type": "application/json", "A-code": a_code, "Req-Time": epochtime,
}).json()
assert j.get("data"), f"addsend 失败(验证码/限速?): {json.dumps(j, ensure_ascii=False)[:300]}"
bid, ufileid, tid = j["data"]["bid"], j["data"]["ufileid"], j["data"]["tid"]
print(f"[3] bid={bid} ufileid={ufileid} tid={tid}")

# 4. getupid（length=总字节, count=块数）
CHUNK = 1024 * 1024  # 1MB 块（transfer 惯例）
if file_size > 2 * 1024 * 1024:
    ispart = True
    part_total = (file_size + CHUNK - 1) // CHUNK
    print(f"[4] 大文件分块: {part_total} 块 x 1MB")
else:
    ispart, part_total = False, 1

j = S.post(f"{BASE}/ap/uploadv2/getupid", json={
    "preid": ufileid, "boxid": bid, "linkid": tid,
    "utype": "sendcopy", "originUpid": "",
    "length": file_size, "count": part_total,
}).json()
upId = j["data"]["upId"]
print(f"[4] upId={upId}")

# 5+6. 逐块 psurl + PUT（partnu 从 1 起，fsize=该块实际大小）
ok_parts = 0
for idx in range(part_total):
    partnu = idx + 1
    part_size = min(CHUNK, file_size - idx * CHUNK)
    chunk = payload_bytes[idx * CHUNK : idx * CHUNK + part_size]
    j = S.post(f"{BASE}/ap/uploadv2/psurl", json={
        "ispart": ispart, "fname": fname, "partnu": partnu,
        "fsize": part_size, "upId": upId,
    }).json()
    up_url = j["data"]["url"]
    r = requests.put(up_url, data=chunk, headers={"Content-Type": "application/octet-stream"})
    assert r.status_code == 200, f"块 {partnu}/{part_total} PUT 失败: HTTP {r.status_code} {r.text[:200]}"
    ok_parts += 1
    if partnu % 4 == 0 or partnu == part_total:
        print(f"[6] 已传 {ok_parts}/{part_total} 块")
print(f"[5] 首块 host={up_url.split('/')[2]}")

# 7. complete
j = S.post(f"{BASE}/ap/uploadv2/complete", json={
    "ispart": ispart, "fname": fname, "upId": upId,
    "location": {"boxid": bid, "preid": ufileid},
}).json()
print(f"[7] complete code={j.get('code')}")

# 8. getprocess 轮询
for _ in range(30):
    j = S.post(f"{BASE}/ap/ufile/getprocess", json={"processId": upId}).json()
    if j.get("data", {}).get("rst") == "success":
        break
    time.sleep(1)
print(f"[8] process: {j.get('data', {}).get('rst')} pro={j.get('data', {}).get('pro')}")

# 9. copysend → 分享链接
j = S.post(f"{BASE}/ap/task/copysend", json={"bid": bid, "tid": tid, "ufileid": ufileid}).json()
d = j.get("data") or {}
print(f"\n=== public_url = {d.get('public_url')}")
print(f"=== social_url = {d.get('social_url')}")
print(f"=== mgr_url    = {d.get('mgr_url')}")
