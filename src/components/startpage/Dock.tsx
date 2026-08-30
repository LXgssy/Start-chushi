"use client";

import { memo, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CheckSquare,
  CloudSun,
  Command,
  NotebookPen,
  Settings2,
  Timer,
} from "lucide-react";
import WeatherGlyph from "./WeatherGlyph";
import WeatherPanel from "./WeatherPanel";
import TodoPanel from "./TodoPanel";
import NotePanel from "./NotePanel";
import PomodoroPanel, {
  POMO_KEY,
  subscribePomo,
  type PomoRuntime,
} from "./PomodoroPanel";
import SettingsPanel from "./SettingsPanel";
import { readLS } from "@/hooks/use-start";
import type { Place, PanelId, Settings, TodoItem, WeatherState } from "@/lib/startpage/types";
import { weatherText } from "@/lib/startpage/weather";

/* ---------- dock 番茄钟倒计时（订阅 localStorage 运行时 + 每秒滴答；
   subscribePomo 移至 PomodoroPanel 共享，禅模式迷你番茄钟同源订阅） ---------- */

/* tab 栏只显示分钟，不显示秒：向上取整（首分钟内仍计满额） */
function getPomoSnapshot(): string | null {
  const rt = readLS<PomoRuntime | null>(POMO_KEY, null);
  if (rt && rt.mode) {
    if (rt.running) {
      return String(Math.max(0, Math.ceil((rt.endAt - Date.now()) / 60000)));
    }
    if (!rt.atFull && rt.remaining > 0) {
      return String(Math.ceil(rt.remaining / 60));
    }
  }
  return null;
}

function getPomoRunning(): boolean {
  const rt = readLS<PomoRuntime | null>(POMO_KEY, null);
  return Boolean(rt && rt.running);
}

const EASE = [0.22, 1, 0.36, 1] as const;

const SPRING = { type: "spring" as const, stiffness: 420, damping: 34 };

/* 高度动画不交给 framer：v12 对 duration+ease 的 height 动画实测仍
   2-3 帧冲线（transition 参数被吞，CSS 对比实验确认为 framer 黑盒行为，
   同 Task 37 opacity WAAPI 空窗同族），改由 .h-height CSS transition 承载，
   data-soft 切换快慢两档：切换面板 0.25s 快曲线（原 SPRING 3-4 帧读感），
   面板内内容增长 0.45s ease-out 与结果列表淡入同步 */

/** 面板切换 = 单动作平滑形变：旧内容原地淡出 + 卡片高度弹簧到新内容高度 + 新内容淡入，
 *  三者重叠为一个连续动作（无先关后开、无两次动画）。
 *  退出面板绝对定位钉回内容盒原位（inset 0），在高度形变期间与新面板重叠溶解。
 *  ⚠ 入场淡入不在 framer 内（移交 .panel-rise CSS 关键帧，见 globals.css）：
 *    framer v12 对 opacity 走 WAAPI 加速，内联停在初始 0、动画结束后才补写 1，
 *    空窗期真机整板闪黑（进入动画卡一下复位）。退场保留 opacity：
 *    退场终点是卸载，补写空窗不可见 */
const PANEL_EXIT = {
  opacity: 0,
  position: "absolute" as const,
  left: 0,
  right: 0,
  top: 0,
  pointerEvents: "none" as const,
  transition: { duration: 0.2, ease: [0.4, 0, 1, 1] as const },
};

const PANEL_TITLES: Record<Exclude<PanelId, null>, string> = {
  weather: "天气",
  todo: "待办",
  note: "便签",
  pomodoro: "番茄钟",
  settings: "设置",
};

/* ---------- 面板舞台：卡片 + 高度形变 + 新旧内容溶解，整体 memo。
   收益：Dock 因番茄钟每秒滴答（useSyncExternalStore）重渲时，面板卡片区域
   （含 exit 溶解中的旧面板与五个重面板子树）不再连带重渲染；反之面板内容
   测高（ResizeObserver→contentH）也不再重渲 dock 栏与活动指示 pill。
   ⚠ 动画结构（key/variants/弹簧参数/className）与原实现逐字节等价，仅迁移容器；
     onClose 必须传稳定引用，否则 memo 在每次滴答中失效。 */
const PanelStage = memo(function PanelStage({
  panel,
  onClose,
  weather,
  place,
  onPlaceChange,
  todos,
  setTodos,
  note,
  commitNote,
  settings,
  patchSettings,
  exportData,
  importData,
  resetAll,
}: {
  panel: PanelId;
  onClose: () => void;
  weather: WeatherState;
  place: Place;
  onPlaceChange: (p: Place) => void;
  todos: TodoItem[];
  setTodos: (updater: (prev: TodoItem[]) => TodoItem[]) => void;
  note: string;
  commitNote: (v: string) => void;
  settings: Settings;
  patchSettings: (patch: Partial<Settings>) => void;
  exportData: () => void;
  importData: (f: File) => void;
  resetAll: () => void;
}) {
  /* 面板内容真实高度：卡片高度动画的驱动源。
     为什么不用 framer layout：layout 用 transform scale 缩放卡片盒子，内部内容无反向补偿，
     切换瞬间整卡内容被纵向压扁/拉伸，读起来像「旧卡压扁关闭 + 新卡撑开打开」两次动画；
     改为测量内容高度 + 高度 px 弹簧（reflow 形变），内容全程零畸变，视觉上只是
     「容器平滑地变成另一个面板的尺寸」。ResizeObserver 同时兜底面板内部高度变化
     （待办增删、天气加载、设置分区展开），同样平滑跟随。
     ⚠ 首开路径（contentH 为 null）禁止在挂载帧回写：同步 setState 构成 Dock 顶部
     ⚠ 所述「挂载后一帧内的二次渲染」，真机上叠加 v12 投影重测可打断入场。
     推迟到入场结束（≈0.5s）后武装测高，期间高度盒 auto 直就位（视觉无差异）；
     切换路径（contentH 已有值）立即测高，高度形变不受影响 */
  const [contentH, setContentH] = useState<number | null>(null);
  /* 高度弹簧分级：false=切换面板快弹簧（SPRING），true=面板内内容增长柔和过渡
     （HEIGHT_GROW）。由 measureRef 的测高来源驱动，见其注释 */
  const [hSoft, setHSoft] = useState(false);
  /* 镜像到 ref 供稳定的 measureRef 回调读取（渲染期直接写 ref 违反 React Compiler 规则；
     effect 时序依然正确：commit 阶段的 ref 回调读到的永远是上一次提交后的值） */
  const contentHRef = useRef<number | null>(null);
  useEffect(() => {
    contentHRef.current = contentH;
  }, [contentH]);
  const roRef = useRef<ResizeObserver | null>(null);
  const armRef = useRef<number | null>(null);
  const measureRef = useCallback((el: HTMLDivElement | null) => {
    roRef.current?.disconnect();
    roRef.current = null;
    if (armRef.current != null) {
      window.clearTimeout(armRef.current);
      armRef.current = null;
    }
    if (!el) return;
    const attach = () => {
      /* 两个测高入口 = 两种弹簧：attach 首测（面板切换 key 重挂/首开武装）
         必须快弹簧（与新内容淡入同拍，慢了会拖面板切换节奏）；RO 后续触发
         = 同一面板内内容增长（搜索结果/详情行/待办增删），用柔和过渡。
         只在高度真变了时才改 hSoft——RO observe() 后必发一次初始回调，
         若无条件重置会把首测刚设的快弹簧又改回慢弹簧（值相同 bailout
         不会发生，setHSoft(false) 本身就是状态变更） */
      const update = (soft: boolean) => {
        const h = el.offsetHeight;
        if (h !== contentHRef.current) {
          setHSoft(soft);
          setContentH(h);
        }
      };
      update(false);
      const ro = new ResizeObserver(() => update(true));
      ro.observe(el);
      roRef.current = ro;
    };
    if (contentHRef.current != null) {
      attach();
    } else {
      armRef.current = window.setTimeout(() => {
        armRef.current = null;
        if (!el.isConnected) return;
        attach();
      }, 500);
    }
  }, []);

  /* 面板关闭后清空测高缓存：否则关闭后再打开另一个面板，高度盒会先以旧面板高度
     出现再弹簧撑开（入场混入高度动画）。渲染期重置模式（React 官方推荐），
     同一次渲染内生效，覆盖所有关闭路径（dock 同 tab 再点、遮罩、X、page.tsx 的 setPanel(null)） */
  const [prevPanel, setPrevPanel] = useState(panel);
  if (panel !== prevPanel) {
    setPrevPanel(panel);
    if (panel === null) setContentH(null);
  }

  return (
    /* 面板浮层：外层静态 wrapper 负责定位（fixed + CSS -translate-x-1/2 居中），
        内层卡片由 framer 只做像素级变换（y/scale，入场淡入走 .panel-rise CSS）——百分比 x 由 framer 接管时
        会与 v12 投影测量循环冲突，故居中变换永久留在 CSS，不进 framer。
        wrapper 自带 transform，成为卡片 absolute 子元素的包含块。
        高度形变不用 framer layout（transform scale 会压扁内容、读作两次动画），
        改由内容盒 measureRef 测高 + 高度盒 px 弹簧，见 contentH 注释 */
    <div
      className="pointer-events-none fixed bottom-[calc(max(1.25rem,env(safe-area-inset-bottom))+60px)] left-1/2 z-40 -translate-x-1/2"
    >
      <AnimatePresence>
        {panel && (
          <motion.div
            key="dock-panel"
            role="dialog"
            aria-label={`${PANEL_TITLES[panel]}面板`}
            initial={{ y: 14, scale: 0.96 }}
            animate={{ y: 0, scale: 1 }}
            exit={{
              opacity: 0,
              y: 10,
              scale: 0.97,
              /* 离场专用加速曲线：替代弹簧渐近尾（与指令面板退出同语言） */
              transition: { duration: 0.22, ease: [0.4, 0, 1, 1] },
            }}
            transition={SPRING}
            style={{ transformOrigin: "bottom center", willChange: "transform" }}
            className="glass-card backdrop-blur-2xl backdrop-saturate-150 panel-rise pointer-events-auto relative w-[min(92vw,360px)] overflow-hidden rounded-2xl p-4 shadow-2xl"
          >
          {/* 关闭按钮固定右上，不随内容重绘 */}
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭面板"
            className="absolute right-3.5 top-3.5 z-10 rounded-full p-1.5 text-zinc-400 opacity-70 transition-all duration-200 hover:bg-zinc-900/5 hover:opacity-100 dark:text-zinc-500 dark:hover:bg-white/10"
          >
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
              <path
                d="M2 2l8 8M10 2l-8 8"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
          </button>

          {/* 高度盒：CSS transition 驱动高度（无 layout scale），内容溢出由卡片
              overflow-hidden 裁剪；首开 contentH 为 null → 不设 height（auto）
              直接就位，不参与入场动画（CSS 对 auto↔px 亦不动画，同效）。
              contain:layout 把逐帧 reflow 的失效范围圈在本盒内部，
              不再波及卡片以外任何布局（帧预算从整页降到面板盒） */}
          <div
            className="h-height relative"
            data-soft={hSoft ? "true" : undefined}
            style={{ contain: "layout", height: contentH == null ? undefined : contentH }}
          >
          <AnimatePresence initial={false}>
            <motion.div
              key={panel}
              ref={measureRef}
              exit={PANEL_EXIT}
              className="flow-root panel-rise"
            >
              <header className="mb-3 flex items-center justify-between px-1 pr-7">
                <h2 className="text-xs font-normal tracking-[0.22em] text-zinc-500 dark:text-zinc-400">
                  {PANEL_TITLES[panel]}
                </h2>
              </header>

              {panel === "weather" && (
                <WeatherPanel weather={weather} place={place} onPlaceChange={onPlaceChange} />
              )}
              {panel === "todo" && <TodoPanel todos={todos} setTodos={setTodos} />}
              {panel === "note" && <NotePanel note={note} onCommit={commitNote} />}
              {panel === "pomodoro" && (
                <PomodoroPanel settings={settings} onPatch={patchSettings} />
              )}
              {panel === "settings" && (
                <SettingsPanel
                  settings={settings}
                  onPatch={patchSettings}
                  onExport={exportData}
                  onImportFile={importData}
                  onReset={resetAll}
                />
              )}
            </motion.div>
          </AnimatePresence>
          </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

export default function Dock({
  panel,
  setPanel,
  weather,
  place,
  onPlaceChange,
  todos,
  setTodos,
  note,
  commitNote,
  settings,
  patchSettings,
  openPalette,
  exportData,
  importData,
  resetAll,
}: {
  panel: PanelId;
  setPanel: (p: PanelId) => void;
  weather: WeatherState;
  place: Place;
  onPlaceChange: (p: Place) => void;
  todos: TodoItem[];
  setTodos: (updater: (prev: TodoItem[]) => TodoItem[]) => void;
  note: string;
  commitNote: (v: string) => void;
  settings: Settings;
  patchSettings: (patch: Partial<Settings>) => void;
  openPalette: () => void;
  exportData: () => void;
  importData: (f: File) => void;
  resetAll: () => void;
}) {
  const undone = todos.filter((t) => !t.done).length;

  /* dock 番茄钟：运行中或暂停中在按钮旁显示剩余分钟 + 呼吸灯 */
  const pomoText = useSyncExternalStore(subscribePomo, getPomoSnapshot, () => null);
  const pomoRunning = useSyncExternalStore(subscribePomo, getPomoRunning, () => false);

  /* 面板互切只有淡切一条路径，无需方向状态。
     ⚠ 挂载后一帧内的二次渲染会让 framer-motion v12 layout 投影重测量并把卡片
     transform 重置为 none（x/y/scale 全灭、面板失去居中），已用二分法实证——
     任何面板相关状态都不可在挂载后再补一帧回写 */
  function switchTo(p: PanelId) {
    setPanel(p);
  }

  /* 面板关闭统一入口：稳定引用传给 PanelStage（memo 前提），见 PanelStage 注释 */
  const closePanel = useCallback(() => setPanel(null), [setPanel]);

  return (
    <>
      {/* 关闭遮罩 */}
      <AnimatePresence>
        {panel && (
          <motion.div
            key="dock-overlay"
            className="fixed inset-0 z-30"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={() => switchTo(null)}
            aria-hidden
          />
        )}
      </AnimatePresence>

      <nav
        aria-label="快捷操作"
        className="glass-pill backdrop-blur-2xl backdrop-saturate-150 dock-intro zen-dock fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-1/2 z-40 flex -translate-x-1/2 items-center gap-0.5 rounded-full p-1.5 shadow-lg"
      >
        {/* 天气 */}
        <DockButton
          active={panel === "weather"}
          label={weather.temp != null ? `${weather.temp}° ${weatherText(weather.code)}` : "天气"}
          onClick={() => switchTo(panel === "weather" ? null : "weather")}
        >
          {weather.code != null ? (
            <WeatherGlyph code={weather.code} size={16} />
          ) : (
            <CloudSun className="h-[17px] w-[17px]" strokeWidth={1.5} />
          )}
          {weather.temp != null && (
            <span className="ml-1 tabular-nums text-xs">{weather.temp}°</span>
          )}
        </DockButton>

        <Divider />

        {/* 待办 */}
        <DockButton
          active={panel === "todo"}
          label="待办"
          badge={undone > 0 ? undone : undefined}
          onClick={() => switchTo(panel === "todo" ? null : "todo")}
        >
          <CheckSquare className="h-[17px] w-[17px]" strokeWidth={1.5} />
        </DockButton>

        {/* 便签 */}
        <DockButton
          active={panel === "note"}
          label="便签"
          onClick={() => switchTo(panel === "note" ? null : "note")}
        >
          <NotebookPen className="h-[17px] w-[17px]" strokeWidth={1.5} />
        </DockButton>

        {/* 番茄钟：选框真实布局拉伸展开（图标不变形）；分钟旁呼吸灯——计时中闪动，暂停时常亮；
            呼吸灯 wrapper 与图标同高（17px）使其同心且不撑高行盒，p-1 留光晕缓冲；
            数字 digit-slot 必须带 overflow-hidden（盒底=基线模型前提）+ leading-none，否则墨迹悬低 */}
        <DockButton
          active={panel === "pomodoro"}
          label={pomoText ? `番茄钟 剩余 ${pomoText} 分钟` : "番茄钟"}
          onClick={() => switchTo(panel === "pomodoro" ? null : "pomodoro")}
        >
          <Timer className="h-[17px] w-[17px]" strokeWidth={1.5} />
          <AnimatePresence initial={false}>
            {pomoText && (
              <motion.span
                key="dock-pomo-time"
                initial={{ width: 0, opacity: 0, marginLeft: 0 }}
                animate={{ width: "auto", opacity: 1, marginLeft: 4 }}
                exit={{ width: 0, opacity: 0, marginLeft: 0 }}
                transition={{ duration: 0.34, ease: EASE }}
                className="flex overflow-hidden whitespace-nowrap"
              >
                <span className="inline-flex items-center">
                  <span className="flex h-[17px] items-center p-1" aria-hidden>
                    <span
                      className="pomo-dot"
                      data-running={pomoRunning ? "true" : undefined}
                    />
                  </span>
                  {/* digit-slot 构造性居中：overflow:hidden 令盒底=基线 + leading-none 令内行盒=1em，
                      墨迹中心即落在盒心（同 Clock 烤定值 0.5075em≈0.5em）；二者缺一模型即失效
                      （v12 真机数字悬低 4px 的根因）；prime 用自绘竖线，不参与字体度量 */}
                  <span className="digit-slot inline-block overflow-hidden align-baseline text-xs leading-none tabular-nums">
                    {pomoText}
                  </span>
                  <span
                    aria-hidden
                    className="ml-[2px] inline-block h-[5px] w-[1.5px] -translate-y-[2.5px] rounded-full bg-current"
                  />
                </span>
              </motion.span>
            )}
          </AnimatePresence>
        </DockButton>

        <Divider />

        {/* 命令面板 */}
        <DockButton active={false} label="指令 ⌘K" onClick={openPalette}>
          <Command className="h-[17px] w-[17px]" strokeWidth={1.5} />
          <kbd className="pointer-events-none absolute -bottom-9 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-zinc-900/10 bg-white/80 px-1.5 py-0.5 font-sans text-[10px] tracking-wider text-zinc-500 opacity-0 shadow-sm backdrop-blur transition-opacity duration-300 group-hover:opacity-100 sm:block dark:border-white/10 dark:bg-[#17171c]/90 dark:text-zinc-400">
            ⌘K
          </kbd>
        </DockButton>

        <Divider />

        {/* 设置 */}
        <DockButton
          active={panel === "settings"}
          label="设置"
          onClick={() => switchTo(panel === "settings" ? null : "settings")}
        >
          <Settings2 className="h-[17px] w-[17px]" strokeWidth={1.5} />
        </DockButton>

      </nav>

      <PanelStage
        panel={panel}
        onClose={closePanel}
        weather={weather}
        place={place}
        onPlaceChange={onPlaceChange}
        todos={todos}
        setTodos={setTodos}
        note={note}
        commitNote={commitNote}
        settings={settings}
        patchSettings={patchSettings}
        exportData={exportData}
        importData={importData}
        resetAll={resetAll}
      />
    </>
  );
}

function Divider() {
  return <span aria-hidden className="mx-1 h-5 w-px bg-[var(--pill-line)]" />;
}

function DockButton({
  children,
  label,
  active,
  onClick,
  badge,
}: {
  children: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  badge?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={active}
      data-active={active ? "true" : undefined}
      className={`dock-btn accent-ring group relative flex h-9 items-center rounded-full px-3 outline-none transition-colors duration-300 focus-visible:ring-2 ${
        active || typeof badge === "number"
          ? "text-zinc-900 dark:text-zinc-50"
          : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
      }`}
    >
      {active && (
        <motion.span
          layoutId="dock-active-pill"
          transition={SPRING}
          className="absolute inset-0 rounded-full bg-[var(--pill-seg)] ring-1 ring-[color:var(--pill-seg-ring)]"
          aria-hidden
        />
      )}
      <span className="relative flex items-center">{children}</span>
      <AnimatePresence initial={false}>
        {typeof badge === "number" && (
          <motion.span
            key="dock-badge"
            initial={{ width: 0, opacity: 0, marginLeft: 0 }}
            animate={{ width: "auto", opacity: 1, marginLeft: 4 }}
            exit={{ width: 0, opacity: 0, marginLeft: 0 }}
            transition={{ duration: 0.34, ease: EASE }}
            className="overflow-hidden"
          >
            <span
              aria-label={`${badge} 项待办`}
              className="accent-badge relative flex min-w-[15px] justify-center rounded-full px-1 text-[10px] leading-[15px] tabular-nums"
            >
              {badge}
            </span>
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}
