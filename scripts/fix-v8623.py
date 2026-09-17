#!/usr/bin/env python3
"""v8.6.23 磨砂写入底层：纱罩/遮罩/入场玻璃件 backdrop 全程在线，不再闪纯色底。

病灶（v8.6.22 实验定律：backdrop-filter 元素【自身或祖先】opacity<1 / filter≠none 一律杀磨砂）：
  1. .cl-drawer-veil 抽屉纱罩：framer 自身 opacity 0↔1（0.28s）+ blur(28px) → 开合全程纯色纱
  2. veil-in/veil-fade 关键帧：opacity 淡入淡出 → 五处对话框/指令面板/预设文档遮罩磨砂死亡
  3. .search-pill 入场 intro-rise：自身 opacity+filter（globals 假律②「自承载安全」已作废）
  4. .dock-intro 入场 dock-rise：自身 opacity 0→1（0.8s）
  5. intro-tile-frost：霜层自承载 opacity 0.18s「侥幸」

修法（磨砂写入底层）：
  磨砂本体只走 blur 值通道（1px↔N px，transition/keyframes 插值），染色走底色 alpha
  或无磨砂 ::before 层 opacity，opacity/filter 只许落在无玻璃的内容层。
"""
import shutil
import sys
from pathlib import Path

ROOT = Path("/tmp/my-project")


def sub_once(path: str, old: str, new: str, tag: str) -> None:
    p = ROOT / path
    t = p.read_text(encoding="utf-8")
    n = t.count(old)
    if n != 1:
        print(f"[FAIL] {tag}: 命中 {n} 次（须 1）@ {path}")
        sys.exit(1)
    p.write_text(t.replace(old, new), encoding="utf-8")
    print(f"[ok] {tag}")


# ============ A. globals.css ============

# A1 磨砂存活原则总律重写（假律②作废）
sub_once(
    "src/app/globals.css",
    """/* ================================================================
   磨砂玻璃存活原则（v22 病根根治）：
   祖先元素 opacity<1 或 filter≠none 会成为 backdrop root，
   令后代 backdrop-filter 采样不到壁纸——磨砂整体失效，
   动画结束后才瞬跳恢复（reload 后数秒玻璃变平、禅模式进出同理的根因）。
   故入场/禅雾化动画只允许落在：
   ① 无玻璃子元素的区块（intro-rise 的 section、.zen-fade）
   ② 玻璃元素自身（.search-pill / .zen-dock —— 自身 opacity/filter 不构成
      自身 backdrop root，霜感随动画同步渐凝/渐散，全程无死亡期）
   ================================================================ */""",
    """/* ================================================================
   磨砂玻璃存活原则（v22 实验定律 · v23 底层律收官）：
   backdrop-filter 元素【自身或祖先】opacity<1 / filter≠none 一律杀磨砂
   （v22 blur-selftest 实验实证：自身与祖先同罪，动画中梯度 2.997 vs 稳态
   1.395；v23 前总律②「自承载安全」为假律，作废勿再引用）。
   磨砂写入底层——玻璃件的入退场只许动四类安全通道：
   transform / background-color alpha / backdrop-filter blur 值 / box-shadow；
   opacity 与 filter 只许落在【无玻璃】的内容层。遮罩族（veil-in/veil-fade）
   与抽屉纱罩同改：磨砂经 blur 值通道凝聚/收拢（1px↔Npx 全程在线），
   染色经底色 alpha 或无磨砂 ::before 层渐显，任何帧都不退化为纯色底。
   ================================================================ */""",
    "A1 磨砂存活总律重写",
)

# A2 搜索药丸入场：壳体底色凝入+上浮（无 opacity/filter），内容淡入聚拢交给子元素
sub_once(
    "src/app/globals.css",
    """/* ---------- 搜索药丸入场：自承载（与原 section 级 intro-rise 同参 0.95s/延迟 0.24s） ---------- */
.search-pill {
  animation: intro-rise 0.95s cubic-bezier(0.22, 1, 0.36, 1) 0.24s backwards;
}""",
    """/* ---------- 搜索药丸入场（v8.6.23 底层律）：壳体只动底色 alpha + transform
   （opacity/filter 全程不碰——自身 opacity<1 与祖先同罪杀磨砂，v8.6.22 实验
   实证，旧「自承载」写法为假律）；淡入+模糊聚拢移交内容子元素（无玻璃，安全）。
   同参 0.95s/延迟 0.24s 与原 section 级 intro-rise 一致 ---------- */
.search-pill {
  animation: pill-shell-in 0.95s cubic-bezier(0.22, 1, 0.36, 1) 0.24s backwards;
}
@keyframes pill-shell-in {
  from {
    background-color: transparent;
    border-color: transparent;
    box-shadow: 0 0 0 0 transparent;
    transform: translateY(26px) scale(0.985);
  }
}
.search-pill > * {
  animation: pill-content-in 0.95s cubic-bezier(0.22, 1, 0.36, 1) 0.24s backwards;
}
@keyframes pill-content-in {
  from {
    opacity: 0;
    filter: blur(10px);
  }
  to {
    opacity: 1;
    filter: blur(0);
  }
}""",
    "A2 搜索药丸壳体/内容分层入场",
)

# A3 霜层凝聚通道：自承载 opacity → blur 值凝聚（自然值 = 内联 blur(14px) saturate(1.6)，同构）
sub_once(
    "src/app/globals.css",
    """@keyframes intro-tile-frost {
  from {
    opacity: 0;
  }
}""",
    """@keyframes intro-tile-frost {
  from {
    backdrop-filter: blur(1px) saturate(1.6);
  }
}""",
    "A3a 霜层凝聚 blur 通道",
)
sub_once(
    "src/app/globals.css",
    """   ② 霜层 .link-intro-frost：backdrop-filter 载体，0.18s 快速凝聚（自承载
      opacity，霜感几乎即刻在线，随凝聚渐显不突兀）；""",
    """   ② 霜层 .link-intro-frost：backdrop-filter 载体，0.18s 快速凝聚（v8.6.23
      起 blur 值通道 1px→14px 凝聚——自承载 opacity 同样杀磨砂，旧写法作废）；""",
    "A3b 霜层凝聚注释同步",
)

# A4 遮罩入场关键帧：opacity → 底色 alpha + blur 值（to 留空 = 各元素自然值归位）
sub_once(
    "src/app/globals.css",
    """@keyframes veil-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
.veil-in {
  animation: veil-in calc(0.28s * var(--mo-speed, 1)) cubic-bezier(0.22, 1, 0.36, 1) backwards;
}""",
    """@keyframes veil-in {
  from {
    background-color: transparent;
    backdrop-filter: blur(1px) saturate(1.5);
  }
}
.veil-in {
  animation: veil-in calc(0.28s * var(--mo-speed, 1)) cubic-bezier(0.22, 1, 0.36, 1) backwards;
}""",
    "A4 veil-in 底层通道",
)

# A5 遮罩退场关键帧：opacity → 底色 alpha 渐隐 + blur 收拢（与 glass-card-out 同语言）
sub_once(
    "src/app/globals.css",
    """@keyframes veil-fade {
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
}
/* 遮罩层退场淡出：0.25s（dock 遮罩/指令面板磨砂遮罩）/ 0.28s（预设对话框背板）。
   ⚠ 声明顺序律：.veil-out 必须在 .veil-in 之后（退场帧两者同在元素上，后者胜） */""",
    """@keyframes veil-fade {
  to {
    background-color: transparent;
    backdrop-filter: blur(1px) saturate(1.5);
  }
}
/* 遮罩层退场（v8.6.23 底层律）：0.25s（dock 遮罩/指令面板磨砂遮罩）/ 0.28s（预设对话框背板）。
   to 帧 blur(1px)：磨砂收拢=壁纸透出，与底色渐隐合成自然淡出；无磨砂遮罩
   （右键菜单捕获层/沙箱页）按 none↔列表替换律插值，1px 过渡不可感。
   ⚠ 声明顺序律：.veil-out 必须在 .veil-in 之后（退场帧两者同在元素上，后者胜） */""",
    "A5 veil-fade 底层通道",
)

# A6 dock 入场：壳体只动 transform，淡入移交按钮子元素（无玻璃）
sub_once(
    "src/app/globals.css",
    """/* ---------- dock 入场：自承载（原 page.tsx framer 包裹层 opacity 动画移除，同参 0.8s/延迟 0.55s）；
   居中是 Tailwind v4 独立 translate 属性，与 keyframes 的 transform 合成不覆盖 ---------- */
.dock-intro {
  animation: dock-rise calc(0.8s * var(--mo-speed, 1)) cubic-bezier(0.22, 1, 0.36, 1) calc(0.55s * var(--mo-speed, 1)) backwards;
}
@keyframes dock-rise {
  from {
    opacity: 0;
    transform: translateY(18px);
  }
}""",
    """/* ---------- dock 入场（v8.6.23 底层律）：壳体只动 transform（glass-pill 磨砂
   全程在线），淡入下沉到按钮子元素（> button 均无玻璃，opacity 安全；
   选框 span / 指示器不参与，避免与其 framer 弹簧打架）。
   居中是 Tailwind v4 独立 translate 属性，与 keyframes 的 transform 合成不覆盖 ---------- */
.dock-intro {
  animation: dock-rise calc(0.8s * var(--mo-speed, 1)) cubic-bezier(0.22, 1, 0.36, 1) calc(0.55s * var(--mo-speed, 1)) backwards;
}
@keyframes dock-rise {
  from {
    transform: translateY(18px);
  }
}
.dock-intro > button {
  animation: dock-btn-in calc(0.8s * var(--mo-speed, 1)) cubic-bezier(0.22, 1, 0.36, 1) calc(0.55s * var(--mo-speed, 1)) backwards;
}
@keyframes dock-btn-in {
  from {
    opacity: 0;
  }
}""",
    "A6 dock 壳体/按钮分层入场",
)

# A7 抽屉纱罩：磨砂底层 blur transition + ::before 染色层 opacity
sub_once(
    "src/app/globals.css",
    """.cl-drawer-veil {
  background: linear-gradient(
    180deg,
    rgba(255, 255, 255, 0.32),
    rgba(255, 255, 255, 0.2) 42%,
    rgba(255, 255, 255, 0.28)
  );
  backdrop-filter: blur(28px) saturate(1.5);
}
.dark .cl-drawer-veil {
  /* 深色态：zinc-900 轻纱替代旧 zinc-950 厚涂（「纯黑遮罩」差评），模糊承担主分离 */
  background: linear-gradient(
    180deg,
    rgba(24, 24, 27, 0.42),
    rgba(24, 24, 27, 0.28) 42%,
    rgba(24, 24, 27, 0.38)
  );
}""",
    """/* v8.6.23 磨砂底层律：纱罩拆两层——磨砂本体在底层走 blur 值通道
   （transition 1px↔28px，data-veil 门控，全程无 opacity，任何帧不退化为
   纯色纱）；染色渐变走 ::before（无磨砂载体，opacity 安全）。visibility
   延迟门控：关态 blur(1px)+transparent 视觉不可见且退场收尾后才隐藏，
   常挂架构下关态零合成开销。开态可见即时（0s）、隐藏延迟（0.28s 收拢后） */
.cl-drawer-veil {
  background-color: transparent;
  backdrop-filter: blur(1px) saturate(1.5);
  visibility: hidden;
  transition:
    backdrop-filter 0.28s cubic-bezier(0.22, 1, 0.36, 1),
    visibility 0s linear 0.28s;
}
.cl-drawer-veil::before {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(
    180deg,
    rgba(255, 255, 255, 0.32),
    rgba(255, 255, 255, 0.2) 42%,
    rgba(255, 255, 255, 0.28)
  );
  opacity: 0;
  transition: opacity 0.28s cubic-bezier(0.22, 1, 0.36, 1);
}
.cl-drawer-veil[data-veil="1"] {
  backdrop-filter: blur(28px) saturate(1.5);
  visibility: visible;
  transition:
    backdrop-filter 0.28s cubic-bezier(0.22, 1, 0.36, 1),
    visibility 0s;
}
.cl-drawer-veil[data-veil="1"]::before {
  opacity: 1;
}
.dark .cl-drawer-veil::before {
  /* 深色态：zinc-900 轻纱替代旧 zinc-950 厚涂（「纯黑遮罩」差评），模糊承担主分离 */
  background: linear-gradient(
    180deg,
    rgba(24, 24, 27, 0.42),
    rgba(24, 24, 27, 0.28) 42%,
    rgba(24, 24, 27, 0.38)
  );
}""",
    "A7 纱罩磨砂底层/染色层拆分",
)

# A8 cs-lite 纱罩：纯色加深移到 ::before（磨砂关停模式同结构）
sub_once(
    "src/app/globals.css",
    """/* 流畅模式：cs-lite 通配已把 backdrop-filter 压为 none，纱罩纯色加深保证磁贴可读性 */
html.cs-lite .cl-drawer-veil {
  background: linear-gradient(
    180deg,
    rgba(255, 255, 255, 0.55),
    rgba(255, 255, 255, 0.45) 42%,
    rgba(255, 255, 255, 0.52)
  );
}
html.cs-lite.dark .cl-drawer-veil {
  background: linear-gradient(
    180deg,
    rgba(9, 9, 11, 0.62),
    rgba(9, 9, 11, 0.52) 42%,
    rgba(9, 9, 11, 0.6)
  );
}""",
    """/* 流畅模式：cs-lite 通配已把 backdrop-filter 压为 none，纱罩纯色加深保证磁贴可读性
   （v8.6.23 随底层律移到 ::before 染色层；纯色模式无磨砂，opacity 渐显同构） */
html.cs-lite .cl-drawer-veil::before {
  background: linear-gradient(
    180deg,
    rgba(255, 255, 255, 0.55),
    rgba(255, 255, 255, 0.45) 42%,
    rgba(255, 255, 255, 0.52)
  );
}
html.cs-lite.dark .cl-drawer-veil::before {
  background: linear-gradient(
    180deg,
    rgba(9, 9, 11, 0.62),
    rgba(9, 9, 11, 0.52) 42%,
    rgba(9, 9, 11, 0.6)
  );
}""",
    "A8 cs-lite 纱罩染色层跟移",
)

# ============ B. QuickLinks.tsx ============

# B1 纱罩 framer opacity 退役 → data-veil 门控（注释同步重写，旧律引用作废）
sub_once(
    "src/components/startpage/QuickLinks.tsx",
    """                  {/* 纱罩：整页高斯模糊 + 轻染色（v8.6.2 用户指令——不再纯色遮罩）。
                      淡入淡出由纱罩【自身】opacity 承载（自承载不形成祖先 backdrop
                      root，磁贴磨砂不受影响）；模糊经 cs-lite 通配自动降级为纯色纱 */}
                  <motion.div
                    aria-hidden
                    className="cl-drawer-veil absolute inset-0"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: open ? 1 : 0 }}
                    transition={{ duration: 0.28, ease: EASE }}
                    style={{ pointerEvents: open ? undefined : "none" }}
                    onPointerDown={(e) => {
                      if (e.button !== 0) return;
                      if (!editing) setOpen(false);
                    }}
                  />""",
    """                  {/* 纱罩：整页高斯模糊 + 轻染色（v8.6.2 用户指令——不再纯色遮罩）。
                      v8.6.23 磨砂底层律：自身 opacity<1 与祖先同罪杀磨砂（v8.6.22
                      blur-selftest 实验实证，「自承载安全」旧律作废）——磨砂本体在
                      底层走 blur 值通道（CSS transition，data-veil 门控，1px↔28px
                      全程在线），染色渐变走 ::before opacity；模糊经 cs-lite 通配
                      自动降级为纯色纱。veilOn 经 rAF 置位：首次唤出（portal 首挂
                      即 open）也走闭态值→开态的凝聚入场，不瞬跳 */}
                  <div
                    aria-hidden
                    className="cl-drawer-veil absolute inset-0"
                    data-veil={veilOn ? "1" : "0"}
                    style={{ pointerEvents: open ? undefined : "none" }}
                    onPointerDown={(e) => {
                      if (e.button !== 0) return;
                      if (!editing) setOpen(false);
                    }}
                  />""",
    "B1 纱罩 data-veil 门控",
)

# B2 veilOn 状态（rAF 置位）
sub_once(
    "src/components/startpage/QuickLinks.tsx",
    """  const fadeAnimsRef = useRef<Array<Animation>>([]);""",
    """  /* v8.6.23 纱罩开关门控：rAF 置位保首次唤出也有凝聚入场
     （portal 首挂即 open，若直挂 data-veil=1 则首帧无过渡瞬跳；
     rAF 后下一帧置 1，CSS transition 从闭态值起插值） */
  const [veilOn, setVeilOn] = useState(false);
  useEffect(() => {
    if (!open) {
      setVeilOn(false);
      return;
    }
    const id = requestAnimationFrame(() => setVeilOn(true));
    return () => cancelAnimationFrame(id);
  }, [open]);
  const fadeAnimsRef = useRef<Array<Animation>>([]);""",
    "B2 veilOn rAF 门控状态",
)

# ============ C. 版本 / changelog ============

sub_once(
    "scripts/build-extension.py",
    'VERSION = "8.6.22"',
    'VERSION = "8.6.23"',
    "C1 VERSION bump",
)

sub_once(
    "src/lib/startpage/changelog.ts",
    """export const CHANGELOG: ChangelogEntry[] = [
  {""",
    """export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "8.6.23",
    date: "2026-09-17",
    title: "磨砂写入底层：纱罩与遮罩开合全程磨砂在线，不再闪纯色底",
    channel: "page",
    highlights: [
      "抽屉纱罩磨砂改走底层 blur 通道，开合动画全程在线，不再退化为纯色纱",
      "对话框/指令面板/预设文档遮罩同步修复，磨砂随开合凝聚与收拢",
      "搜索栏与 Dock 栏入场期间磨砂恒定在线，磁贴霜层入场改 blur 凝聚",
    ],
  },
  {""",
    "C2 changelog 插条",
)

# ============ D. 探针克隆 probe-v8623 ============

src_probe = ROOT / "scripts/probe-v8622.mjs"
dst_probe = ROOT / "scripts/probe-v8623.mjs"
t = src_probe.read_text(encoding="utf-8").replace("8.6.22", "8.6.23")


def sub_probe(old: str, new: str, tag: str, want: int = 1) -> None:
    global t
    n = t.count(old)
    if n != want:
        print(f"[FAIL] probe {tag}: 命中 {n} 次（须 {want}）")
        sys.exit(1)
    t = t.replace(old, new)
    print(f"[ok] probe {tag}")


# D1 T4/T6 纱罩见证：opacity → backdrop blur 值
sub_probe(
    """        veil: veil ? parseFloat(getComputedStyle(veil).opacity) : null,""",
    """        veil: veil ? (parseFloat((getComputedStyle(veil).backdropFilter || "").match(/blur\\(([\\d.]+)px\\)/)?.[1] ?? "28")) : null,""",
    "D1 纱罩见证改 blur 值",
    want=2,
)

# D2 T6a 门：纱罩退场见证 = blur 收拢（<27px 即在收拢通道上；回归=恒 28px）
sub_probe(
    """  const leafMinS = Math.min(...exitSamples.filter((s) => s.leaf !== null).map((s) => s.leaf));
  const veilMinS = Math.min(...exitSamples.filter((s) => s.veil !== null).map((s) => s.veil));
  gate("T6a 稳态退场：叶与纱罩同窗走低", leafMinS < 0.9 && veilMinS < 0.9,
    `leafMin=${leafMinS.toFixed(3)} veilMin=${veilMinS.toFixed(3)}`);""",
    """  const leafMinS = Math.min(...exitSamples.filter((s) => s.leaf !== null).map((s) => s.leaf));
  const veilMinS = Math.min(...exitSamples.filter((s) => s.veil !== null).map((s) => s.veil));
  gate("T6a 稳态退场：叶淡出与纱罩 blur 收拢同窗（v8.6.23 底层律，见证由 opacity 改 blur 值）",
    leafMinS < 0.9 && veilMinS < 27,
    `leafMin=${leafMinS.toFixed(3)} veilBlurMin=${veilMinS.toFixed(1)}`);""",
    "D2 T6a 门改 blur 见证",
)

# D3 TL14 关键帧清单扩展（遮罩族/霜层/dock/药丸壳体全部纳入零 opacity 扫描）
sub_probe(
    """        kfOut: kfPack(["palette-out-kf", "dialog-sink", "panel-sink", "ctx-out-kf", "glass-card-out-kf"]),
        kfIn: kfPack(["card-in", "panel-fade", "ctx-in-kf", "intro-tile-shadow"]),""",
    """        kfOut: kfPack(["palette-out-kf", "dialog-sink", "panel-sink", "ctx-out-kf", "glass-card-out-kf", "veil-fade"]),
        kfIn: kfPack(["card-in", "panel-fade", "ctx-in-kf", "intro-tile-shadow", "veil-in", "intro-tile-frost", "dock-rise", "pill-shell-in"]),""",
    "D3 TL14 关键帧清单扩展",
)

# D4 TL14e/f 新门：遮罩族磨砂化 + 纱罩底层律结构在位
sub_probe(
    """    gate("TL14d 中途关闭掐阴影动画通道（closing 收窄 animation-name 只留 rise）",
      cssScan.closingIntro && /animation-name\\s*:\\s*intro-tile-rise/.test(cssScan.closingIntro),
      cssScan.closingIntro?.slice(0, 90));
  }""",
    """    gate("TL14d 中途关闭掐阴影动画通道（closing 收窄 animation-name 只留 rise）",
      cssScan.closingIntro && /animation-name\\s*:\\s*intro-tile-rise/.test(cssScan.closingIntro),
      cssScan.closingIntro?.slice(0, 90));
    /* ---------- TL14e/f v8.6.23 磨砂写入底层 ---------- */
    const veilInT = (cssScan.kfIn.find((k) => k.n === "veil-in")?.t || "").replace(/\\s+/g, " ");
    const veilOutT = (cssScan.kfOut.find((k) => k.n === "veil-fade")?.t || "").replace(/\\s+/g, " ");
    gate("TL14e 遮罩族关键帧磨砂化（veil-in/veil-fade 走 blur 底层通道，零 opacity）",
      /backdrop-filter/.test(veilInT) && /blur\\(1px\\)\\s*saturate\\(1\\.5\\)/.test(veilInT) &&
      /backdrop-filter/.test(veilOutT) && /blur\\(1px\\)\\s*saturate\\(1\\.5\\)/.test(veilOutT),
      `in=${veilInT.slice(0, 120)} | out=${veilOutT.slice(0, 120)}`);
    const veilBase = (cssScan.rules.find((x) => x.includes(".cl-drawer-veil") && !x.includes("data-veil") && !x.includes("::before") && !x.includes("cs-lite")) || "");
    const veilOpen = (cssScan.rules.find((x) => x.includes('.cl-drawer-veil[data-veil="1"]') && !x.includes("::before")) || "");
    const veilBefore = (cssScan.rules.find((x) => x.includes(".cl-drawer-veil::before")) || "");
    gate("TL14f 纱罩底层律（base blur transition + open 28px + ::before 染色层）",
      /backdrop-filter\\s*:\\s*blur\\(1px\\)/.test(veilBase.replace(/\\s+/g, " ")) &&
      /blur\\(28px\\)/.test(veilOpen.replace(/\\s+/g, " ")) && !!veilBefore,
      `base=${veilBase ? "ok" : "NULL"} open=${veilOpen ? "ok" : "NULL"} before=${veilBefore ? "ok" : "NULL"}`);
  }""",
    "D4 TL14e/f 新门",
)

dst_probe.write_text(t, encoding="utf-8")
print(f"[ok] probe-v8623 写出（{len(t)} 字节）")

# ============ E. 残留检查 ============

g = (ROOT / "src/app/globals.css").read_text(encoding="utf-8")
checks = [
    ("pill-shell-in 在位", "pill-shell-in" in g),
    ("dock-btn-in 在位", "dock-btn-in" in g),
    ('data-veil 开态在位', '.cl-drawer-veil[data-veil="1"]' in g),
    ("纱罩 ::before 在位", ".cl-drawer-veil::before" in g),
    ("假律②已清除", "自身 opacity/filter 不构成" not in g and "自身 opacity/filter 不构成" not in g),
]
q = (ROOT / "src/components/startpage/QuickLinks.tsx").read_text(encoding="utf-8")
checks += [
    ("veilOn 状态在位", "veilOn" in q and "data-veil={veilOn" in q),
    ("纱罩 framer opacity 已退役", "animate={{ opacity: open ? 1 : 0 }}" not in q),
]
for name, ok in checks:
    print(f"[{'ok' if ok else 'FAIL'}] 残留检查：{name}")
if not all(ok for _, ok in checks):
    sys.exit(1)

print("\n=== fix-v8623 全部完成 ===")
