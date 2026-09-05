#!/usr/bin/env python3
# build-bncm-delivery.py — 组装 ChuShi-音乐桥-BetterNCM-交付包.zip
#   内容：ChuShi-MusicBridge-1.2.0.plugin + 初始音乐桥-插件-1.2.0.zip
#         + betterncm_installer.exe + 安装指南.md
import os, sys, zipfile, hashlib

DL = "/home/z/my-project/download/v1.7.6"
VER = "1.2.0"
OUT = f"{DL}/ChuShi-音乐桥-BetterNCM-交付包.zip"
ITEMS = [
    f"ChuShi-MusicBridge-{VER}.plugin",
    f"初始音乐桥-插件-{VER}.zip",
    "betterncm_installer.exe",
    "安装指南.md",
]

def main():
    for i in ITEMS:
        assert os.path.exists(f"{DL}/{i}"), f"缺少 {i}"
    if os.path.exists(OUT):
        os.remove(OUT)
    with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as z:
        for i in ITEMS:
            z.write(f"{DL}/{i}", i)
    with zipfile.ZipFile(OUT) as z:
        names = z.namelist()
        assert sorted(names) == sorted(ITEMS), names
        bad = z.testzip()
        assert bad is None, f"zip 损坏: {bad}"
    print(f"[OK] {OUT} ({os.path.getsize(OUT)//1024} KB)")
    for i in ITEMS:
        h = hashlib.sha256(open(f"{DL}/{i}", "rb").read()).hexdigest()
        print(f"  - {i}  sha256={h[:12]}…")

if __name__ == "__main__":
    sys.exit(main())
