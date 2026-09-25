#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v8.7.21：抽屉磁贴墙双击不进禅（use-start-zen.ts）"""
import io

P = "/tmp/beta-wt/src/app/startpage/use-start-zen.ts"
src = io.open(P, encoding="utf-8").read()

OLD = """      if (
        t.closest("button, a, nav, [role='dialog'], [role='tablist'], [role='radiogroup']") ||
        panelOpen ||"""
NEW = """      if (
        t.closest("button, a, nav, [role='dialog'], [role='tablist'], [role='radiogroup']") ||
        /* v8.7.21 抽屉磁贴墙守卫：链接抽屉（中键唤出的全屏磁贴墙）开着时，
           墙面空白处双击不进禅——墙内空白区不是交互元素，closest 链拦不住；
           html.cs-drawer 由 QuickLinks 挂载态同步 effect 维护（挂载即挂类），
           是最可靠的归属面。禅与抽屉本互斥：进禅收浮层，抽屉开着不进禅。 */
        document.documentElement.classList.contains("cs-drawer") ||
        panelOpen ||"""

assert src.count(OLD) == 1, "zen anchor not unique"
src = src.replace(OLD, NEW)
io.open(P, "w", encoding="utf-8").write(src)
print("use-start-zen.ts: cs-drawer guard added")
