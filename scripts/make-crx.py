#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""make-crx.py —— 把扩展 zip 打成可安装 / 可原地升级的 .crx。

用法:
  python3 scripts/make-crx.py --zip download/v8.4.0/ChuShi-NewTab-v8.4.0.zip \
      --key updates/crx-private-key.pem --pub updates/extension-key.pub.pem \
      --out download/v8.4.0/ChuShi-NewTab-v8.4.0.crx

做三件事：
  1. 把公钥写进 manifest 的 "key"：让「解压加载」与「.crx 安装」两种装法扩展 ID 一致，
     用户从解压版迁到 crx 版时不丢本地数据；
  2. 调 scripts/pack-crx.mjs 用私钥签名成 CRX3；
  3. 打印扩展 ID（此后每次发版都用同一把私钥 → ID 不变 → 直接覆盖安装即升级）。

私钥务必备份、绝不提交仓库；丢了私钥 = 扩展 ID 变了 = 老用户无法覆盖升级。
"""
import argparse, json, os, subprocess, sys, tempfile, zipfile

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--zip", required=True)
    ap.add_argument("--key", required=True)
    ap.add_argument("--pub", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()

    pub_b64 = "".join(x for x in open(a.pub, encoding="utf-8").read().strip().splitlines()
                      if x and not x.startswith("-----"))

    zin = zipfile.ZipFile(a.zip)
    mf = json.loads(zin.read("manifest.json").decode("utf-8"))
    mf["key"] = pub_b64
    man = json.dumps(mf, ensure_ascii=False, indent=2) + "\n"

    tmp = tempfile.NamedTemporaryFile(suffix=".zip", delete=False)
    tmp.close()
    with zipfile.ZipFile(tmp.name, "w", zipfile.ZIP_DEFLATED) as z:
        for e in zin.infolist():
            z.writestr(e, man.encode("utf-8") if e.filename == "manifest.json" else zin.read(e.filename))
    zin.close()

    here = os.path.dirname(os.path.abspath(__file__))
    r = subprocess.run(["node", os.path.join(here, "pack-crx.mjs"), tmp.name, a.key, a.out],
                       capture_output=True, text=True)
    os.unlink(tmp.name)
    sys.stdout.write(r.stdout)
    sys.stderr.write(r.stderr)
    sys.exit(r.returncode)

if __name__ == "__main__":
    main()
