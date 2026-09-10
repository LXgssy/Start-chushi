#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""ext-card.js v8.2.3 追加修（本会话发现）：
mini 态顶带时间冻结——mtm 只在 full 分支更新，mini 恒 0:00，
空带填充修复形同虚设。修：mini 分支同步走针 + setMode 清 lastTcur
防态切换残留旧串。
"""
import io, sys

P = "/tmp/my-project/extension-src/ext-card.js"
src = io.open(P, encoding="utf-8").read()

def rep(old, new, tag):
    global src
    if old not in src:
        print(f"FAIL [{tag}]: anchor not found"); sys.exit(1)
    if src.count(old) != 1:
        print(f"FAIL [{tag}]: anchor not unique ({src.count(old)})"); sys.exit(1)
    src = src.replace(old, new)
    print(f"ok [{tag}]")

# ---------- ① mini 态时间走针 ----------
rep(
"""        lyricFrame();
      }
    }
    var tgt = lastSpec.on && effPlaying() ? lastSpec.bass : 0;""",
"""        lyricFrame();
      } else if (mode === "mini") {
        /* v8.2.3b 顶带时间在 mini 也走针（空带填充修复的本体——不然带左
           时间永远冻结在 0:00，空带照旧） */
        var tc = fmt(posNow());
        if (tc !== lastTcur) { lastTcur = tc; mtm.textContent = tc; }
      }
    }
    var tgt = lastSpec.on && effPlaying() ? lastSpec.bass : 0;""",
"mini-time-tick")

# ---------- ② setMode 清缓存防残留 ----------
rep(
"""    if (!SURFS[m] || m === mode) return;
    mode = m; savePos(); applyMode();""",
"""    if (!SURFS[m] || m === mode) return;
    mode = m; lastTcur = ""; /* 强制下一帧重写 tcur/mtm——防态切换残留旧串 */
    savePos(); applyMode();""",
"setmode-resync")

io.open(P, "w", encoding="utf-8", newline="").write(src)
print("saved", P)
