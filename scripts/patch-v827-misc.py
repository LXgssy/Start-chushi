#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v8.2.7 补丁④：体积门放宽 + 版本推进。

· preset.ts widgetHtmlLen 22000→24000（面板律动细节环/三轴 beatFrame 余量；
  v8.1.4 同款放宽律——旧宿主导入新 cshz 会被拒，需配套升级 NewTab v8.2.7）。
· build-smtc-preset.py 断言同步 24000。
· smtc.ts CLIENT_VER 8.2.6→8.2.7。
· build-extension.py VERSION 8.2.7 + 特征门（gring/cglow/modeMorph/clone.animate）。
"""
import pathlib, sys

def patch(path, old, new, tag, count=1):
    p = pathlib.Path(path)
    src = p.read_text(encoding="utf-8")
    if new in src and old not in src:
        print(f"  skip(已应用) {tag}")
        return
    if old not in src:
        sys.exit(f"anchor NOT FOUND: {tag}")
    p.write_text(src.replace(old, new, count), encoding="utf-8")
    print(f"  ok {tag}")

ROOT = "/tmp/my-project"

# 1) preset.ts 宿主体积门
patch(
    f"{ROOT}/src/lib/startpage/preset.ts",
    "     v8.1.4：20000 → 22000 —— 歌词高光三律（句尾渐隐/回退残留根治/强行逐字开关）余量；与 8.1.4 宿主同步放宽（旧宿主导入 8.1.4 预设会被拒，需配套升级） */\n  widgetHtmlLen: 22000,",
    "     v8.1.4：20000 → 22000 —— 歌词高光三律（句尾渐隐/回退残留根治/强行逐字开关）余量；与 8.1.4 宿主同步放宽（旧宿主导入 8.1.4 预设会被拒，需配套升级）\n"
    "     v8.2.7：22000 → 24000 —— 律动变亮律+细节环+三轴 beatFrame 余量（minified 实测 23299）；旧宿主导入 8.2.7 预设会被拒，需配套升级 */\n  widgetHtmlLen: 24000,",
    "preset.ts widgetHtmlLen 24000",
)

# 2) build-smtc-preset.py 断言
patch(
    f"{ROOT}/scripts/build-smtc-preset.py",
    'assert len(html) <= 22000, f"widget html 超限: {len(html)} > 22000"',
    'assert len(html) <= 24000, f"widget html 超限: {len(html)} > 24000"  # v8.2.7：22000→24000 与宿主同步放宽',
    "build-smtc-preset.py 断言",
)
patch(
    f"{ROOT}/scripts/build-smtc-preset.py",
    "# 校验：widget html ≤22000（v8.1.4 与宿主 widgetHtmlLen 同步放宽）、script code ≤16000",
    "# 校验：widget html ≤24000（v8.2.7 与宿主 widgetHtmlLen 同步放宽）、script code ≤16000",
    "build-smtc-preset.py 注释",
)

# 3) smtc.ts CLIENT_VER
patch(
    f"{ROOT}/src/lib/startpage/smtc.ts",
    'const CLIENT_VER = "8.2.6";',
    'const CLIENT_VER = "8.2.7";',
    "smtc.ts CLIENT_VER",
)

# 4) build-extension.py 版本 + 特征门
patch(
    f"{ROOT}/scripts/build-extension.py",
    'VERSION = "8.2.6"',
    'VERSION = "8.2.7"',
    "build-extension.py VERSION",
)
patch(
    f"{ROOT}/scripts/build-extension.py",
    '             "seekGuard", "backStreak",                       # seek 护航/回退熔断\n'
    '             "needFrame", "sleepNow", "visibilitychange"):    # v8.2.6 渲染休眠律',
    '             "seekGuard", "backStreak",                       # seek 护航/回退熔断\n'
    '             "needFrame", "sleepNow", "visibilitychange",     # v8.2.6 渲染休眠律\n'
    '             "gring", "cglow", "cring", "covClear",           # v8.2.7 细节环+封面态律动\n'
    '             "finishTrans", "covImgOf",                       # v8.2.7 一镜到底\n'
    '             "getBoundingClientRect", "borderRadius"):        # v8.2.7 morph 几何取证',
    "build-extension.py 特征门",
)

print("OK misc patch done")
