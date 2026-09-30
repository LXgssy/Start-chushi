#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v8.7.21：ChangelogDialog 复位修复两刀（越界滚动隔离 + 重开回位）"""
import io

P = "/tmp/beta-wt/src/components/startpage/ChangelogDialog.tsx"
src = io.open(P, encoding="utf-8").read()

def rep(old, new, tag):
    global src
    assert src.count(old) == 1, f"[{tag}] not unique"
    src = src.replace(old, new)
    print(f"  ok {tag}")

# R1 模块级阅读位置变量（跨卸载存活）
rep("""const SPRING = { type: "spring" as const, stiffness: 460, damping: 38 };""",
"""const SPRING = { type: "spring" as const, stiffness: 460, damping: 38 };

/* v8.7.21 复位修复两刀：
 * ①越界滚动隔离：滚动区 overscroll-behavior:contain——更新日志滚到顶/底
 *   继续滚动不再链穿到半透明纱罩后面的设置面板（背景内容跟着滑 = 「内容
 *   复位」观感的主源）；
 * ②阅读位置保持：本次页面会话内关闭再打开回到上次读到处（模块级变量跨
 *   卸载存活；刷新/新会话自然归零 = 恒从最新版本顶部开始）。 */
let chgLastScrollTop = 0;""", "R1 module var")

# R2 组件内 ref + 重开回位 effect
rep("""  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);""",
"""  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  /* v8.7.21 复位修复②：重开回位——open 翻真后一帧恢复上次阅读位置
     （级联入场只动 transform/opacity 不动布局高度，rAF 时布局已就位） */
  const chgScrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => {
      const el = chgScrollRef.current;
      if (el && chgLastScrollTop > 0) el.scrollTop = chgLastScrollTop;
    });
    return () => cancelAnimationFrame(raf);
  }, [open]);""", "R2 ref+effect")

# R3 滚动区：ref + onScroll 记账 + overscroll-contain
rep("""              <div
                className="slim-scroll max-h-[min(58vh,430px)] overflow-x-hidden overflow-y-auto pr-1.5"
                style={{""",
"""              <div
                ref={chgScrollRef}
                onScroll={(e) => {
                  chgLastScrollTop = (e.target as HTMLDivElement).scrollTop;
                }}
                className="slim-scroll overscroll-contain max-h-[min(58vh,430px)] overflow-x-hidden overflow-y-auto pr-1.5"
                style={{""", "R3 scroll area")

io.open(P, "w", encoding="utf-8").write(src)
print("ChangelogDialog.tsx patched")
