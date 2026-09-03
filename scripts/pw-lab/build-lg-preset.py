#!/usr/bin/env python3
"""把 lg-engine-v3.js 打包进「液态玻璃」预设包 JSON（全部引擎代码住预设包里）。
用法: python3 scripts/pw-lab/build-lg-preset.py
输出: examples/液态玻璃预设.json （并校验 code 长度 ≤ PRESET_LIMITS.codeLen=16000）
"""
import json
import pathlib
import re
import sys

ROOT = pathlib.Path("/home/z/my-project")
ENGINE = ROOT / "scripts/pw-lab/lg-engine-v3.js"
OUT = ROOT / "examples/液态玻璃预设.json"

CODE_MAX = 16000  # src/lib/startpage/preset.ts PRESET_LIMITS.codeLen

def strip_comments(src: str) -> str:
    """保守注释剥离：只删「行首 /* 块注释 / 纯 // 注释 / 延续 * 行」。
    引擎的 GLSL 全部在字符串拼接行内（行首 token 是 var/return 等），
    不会被误删；行尾注释保留（体积占比可忽略）。"""
    out = []
    for line in src.split("\n"):
        s = line.strip()
        if s.startswith("//") or s.startswith("/*") or s.startswith("*"):
            continue
        out.append(line)
    txt = "\n".join(out)
    txt = re.sub(r"\n{3,}", "\n\n", txt)
    return txt

raw = ENGINE.read_text(encoding="utf-8")
code = strip_comments(raw)
if len(code) > CODE_MAX:
    sys.exit(f"engine code too long after strip: {len(code)} > {CODE_MAX}")

preset = {
    "chushi": 1,
    "name": "液态玻璃",
    "author": "初始",
    "description": "自带 WebGL 引擎的液态玻璃：圆弧透镜剖面边缘折射（对齐 Apple 观感）、"
    "可选七通道色散、Vogel 盘霜化与边缘高光，折射/霜化等可在设置面板热调",
    "commands": [
        {
            "title": "什么是液态玻璃",
            "action": {
                "type": "copy",
                "text": "液态玻璃：本预设包自带完整 WebGL 引擎——把玻璃视为带圆角倒边的凸透镜，"
                "剖面取圆弧（球面透镜投影），边缘采样向玻璃内偏折（放大弯折），可选七通道色散与边缘高光；"
                "折射/霜化/色散等可在设置面板热调（Chromium/Firefox 完整生效，其余内核自动保持磨砂）。",
            },
        }
    ],
    "scripts": [{"id": "engine", "name": "液态玻璃引擎", "code": code}],
}

OUT.write_text(
    json.dumps(preset, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
)
print(f"OK -> {OUT} (code {len(code)} chars, raw {len(raw)})")
