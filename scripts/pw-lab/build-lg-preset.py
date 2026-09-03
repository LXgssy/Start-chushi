#!/usr/bin/env python3
"""把 lg-engine.js（薄调用脚本）打包进「液态玻璃」预设包 JSON。
引擎自 v1.4.0 内建于宿主（liquid-glass.ts），预设只注册设置并调用 chushi.glass。
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
    "description": "调用「初始」内建实时液态玻璃引擎：物理透镜边缘折射（负量内采样，对齐 Apple 观感）、可选色散；折射/霜化/覆盖范围等八项可在设置面板热调",
    "commands": [
        {
            "title": "什么是液态玻璃",
            "action": {
                "type": "copy",
                "text": "液态玻璃：引擎内建于「初始」并在可见文档中以 rAF 实时渲染——物理透镜位移贴图"
                "（SDF 梯度方向 + 负量内采样凸透镜折射 + 边缘窄带），布局/弹簧动画期间折射全程在线不冻结；"
                "本预设向设置面板贡献八项调节（Chromium 系完整生效，其余内核自动保持磨砂）。",
            },
        }
    ],
    "scripts": [{"id": "engine", "name": "液态玻璃", "code": code}],
}

OUT.write_text(
    json.dumps(preset, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
)
print(f"OK -> {OUT} (code {len(code)} chars)")
