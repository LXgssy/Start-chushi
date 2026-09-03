#!/usr/bin/env python3
"""把 lg-engine.js 打包进「液态玻璃」预设包 JSON（全部引擎代码住预设包里）。
用法: python3 scripts/pw-lab/build-lg-preset.py
输出: examples/液态玻璃预设.json （并校验 code 长度 ≤ PRESET_LIMITS.codeLen=16000）
"""
import json
import pathlib
import sys

ROOT = pathlib.Path("/home/z/my-project")
ENGINE = ROOT / "scripts/pw-lab/lg-engine.js"
OUT = ROOT / "examples/液态玻璃预设.json"

CODE_MAX = 16000  # src/lib/startpage/preset.ts PRESET_LIMITS.codeLen

code = ENGINE.read_text(encoding="utf-8")
if len(code) > CODE_MAX:
    sys.exit(f"engine code too long: {len(code)} > {CODE_MAX}")

preset = {
    "chushi": 1,
    "name": "液态玻璃",
    "author": "初始",
    "description": "自带引擎的液态玻璃：物理透镜边缘折射、外绕环绕、可选色散，折射/霜化等可在设置面板热调",
    "commands": [
        {
            "title": "什么是液态玻璃",
            "action": {
                "type": "copy",
                "text": "液态玻璃：本预设包自带完整引擎——canvas 生成物理透镜位移贴图"
                "（SDF 梯度方向 + 外绕边缘窄带 + 滤镜域外扩），SVG feDisplacementMap 实时折射背景，"
                "设置面板可热调折射/霜化/色散等七项（Chromium 系完整生效，其余内核自动保持磨砂）。",
            },
        }
    ],
    "scripts": [{"id": "engine", "name": "液态玻璃引擎", "code": code}],
}

OUT.write_text(
    json.dumps(preset, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
)
print(f"OK -> {OUT} (code {len(code)} chars)")
