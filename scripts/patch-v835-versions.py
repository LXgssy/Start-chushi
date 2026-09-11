#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""patch-v835-versions.py —— v8.3.5 版本号与构建门统一落位：
①smtc.ts：CLIENT_VER 8.3.5 + PLUGIN_VER_MIN 8.3.5（桥 Worker 心跳是实质
  行为变化，旧桥必须升级提示）
②桥 manifest.json：8.3.1→8.3.5
③sandbox.ts：iframe 缓存戳 bump（sandbox.js 本版实质变更：收窗 0.8/软重锚/3s）
④build-extension.py：VERSION 8.3.5 + ext-card 特征门补 v8.3.5 五特征
⑤build-smtc-preset.py：cshz 特征门补 v8.3.5 面板特征"""
import io, sys

def patch(path, pairs, tag):
    src = io.open(path, encoding="utf-8").read()
    for i, (old, new) in enumerate(pairs):
        hits = src.count(old)
        if hits != 1:
            print("FAIL %s#%d: %d hits: %r" % (tag, i, hits, old[:60])); sys.exit(1)
        src = src.replace(old, new)
    io.open(path, "w", encoding="utf-8").write(src)
    print("ok  %s (%d edits)" % (tag, len(pairs)))

patch("/tmp/my-project/src/lib/startpage/smtc.ts", [
    ('const CLIENT_VER = "8.3.4";', 'const CLIENT_VER = "8.3.5";'),
    ('const PLUGIN_VER_MIN = "8.3.1";', 'const PLUGIN_VER_MIN = "8.3.5";'),
], "smtc.ts")

patch("/tmp/my-project/bridge/v8/plugins/music-bridge/manifest.json", [
    ('"version": "8.3.1",', '"version": "8.3.5",'),
], "manifest")

patch("/tmp/my-project/src/lib/startpage/sandbox.ts", [
    ("sandbox.html?v=123", "sandbox.html?v=124"),
    ("sandbox.html?mode=page&v=121", "sandbox.html?mode=page&v=122"),
    ("sandbox.html?mode=widget&v=121", "sandbox.html?mode=widget&v=122"),
], "sandbox.ts")

patch("/tmp/my-project/scripts/build-extension.py", [
    ('VERSION = "8.3.4"', 'VERSION = "8.3.5"'),
    ('''             "height:140px", "calc(100% - 18px)",               # v8.3.4 歌词容器加高+mask 固定渐隐（防裁切）
             "display:none;overflow:hidden",                    # v8.3.4 mini/full 壳裁切（高光防溢出）
             "updateTiming"):                                   # v8.3.1 壳/封面统一形变时长''',
     '''             "height:140px", "calc(100% - 18px)",               # v8.3.4 歌词容器加高+mask 固定渐隐（防裁切）
             "display:none;overflow:hidden",                    # v8.3.4 mini/full 壳裁切（高光防溢出）
             # v8.3.5 逐字重影根治 + 高光照字提层 + seek 护航窗收紧
             ".fw{position:relative;display:inline-block",      # v8.3.5 词壳 inline-block（两层文本基线重合）
             "pointer-events:none;white-space:nowrap;",         # v8.3.5 .ov nowrap 双保险
             ".meta{flex:1;min-width:0;position:relative;z-index:1}",  # v8.3.5 内容件提层（辉光之上）
             ".rail{position:relative;z-index:1",
             "seekGuard.to) <= 0.8", "seekGuard.at > 3000",     # v8.3.5 收窗 0.8s + 护航窗 3s
             "updateTiming"):                                   # v8.3.1 壳/封面统一形变时长'''),
], "build-extension.py")

patch("/tmp/my-project/scripts/build-smtc-preset.py", [
    ('''             "height:146px", "calc(100% - 18px)", "cs-subw", ".cs-ln.on .cs-subw{height:17px",
             "lyrTrackUntil", "scrollLyrTo", "OPT_MAX"):''',
     '''             "height:146px", "calc(100% - 18px)", "cs-subw", ".cs-ln.on .cs-subw{height:17px",
             "lyrTrackUntil", "scrollLyrTo", "OPT_MAX",
             # v8.3.5 逐字重影根治（.cs-w inline-block）+ 高光照字提层（内容件 z-index:1）
             ".cs-w{position:relative;display:inline-block",
             "pointer-events:none;white-space:nowrap;",
             ".cs-meta{flex:1;min-width:0;padding-right:24px;position:relative;z-index:1}",
             "touch-action:none;position:relative;z-index:1",
             "z-index:1;appearance:none"):'''),
], "build-smtc-preset.py")

print("ALL VERSION PATCHES OK")
