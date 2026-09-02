"use client";

import { memo, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { PresenceClass } from "./PresenceClass";
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
import { dockIcon, type PresetAction, type PresetDockItem } from "@/lib/startpage/preset";
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

/** 面板切换 = 单动作平滑形变：旧内容原地淡出 + 卡片高度弹簧到新内容高度 + 新内容淡入，
 *  三者重叠为一个连续动作（无先关后开、无两次动画）。
 *  退出面板绝对定位钉回内容盒原位（inset 0），在高度形变期间与新面板重叠溶解。
 *  ⚠ v1.0.8 统一「拉伸」语言：打开 = 高度 0→内容高弹簧（首开/重开与互切同一语言），
 *    关闭 = 高度→0 塌缩（.panel-sink .panel-hbox，CSS transition）+ 淡出。
 *  ⚠ 入场/退场淡入淡出均不在 framer 内（移交 .panel-rise / .panel-sink 等 CSS 关键帧，见 globals.css）：
 *    framer v12 对 opacity 走 WAAPI 加速，入场空窗期真机整板闪黑，退场中途被取消
 *    回跳 1 等于没有关闭动画。framer 仅保留高度弹簧与计时职责。
 *  ⚠ 玻璃卡上禁 transform 动画（v1.0.8 戒律）：transform 每帧改 border-box →
 *    backdrop 采样区逐帧重算（掉帧），且 Chromium 对 backdrop-filter 元素的
 *    transform 动画存在未合成完闪底的帧（真机「一直闪」的根源）——
 *    原 y/scale 入场与 .panel-sink 的 translateY/scale 已全部移除 */

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
     ⚠ 首开拉伸不需要测高：高度盒 initial height 0 + animate 目标 auto（framer 自动
     测量），挂载帧零 setState；首开 arming（≈0.5s）后回写的 contentH 与 auto 解析值
     相同，无跳变。切换路径（contentH 已有值）立即测高，高度形变不受影响 */
  const [contentH, setContentH] = useState<number | null>(null);
  /* 镜像到 ref 供稳定的 measureRef 回调读取（渲染期直接写 ref 违反 React Compiler 规则；
     effect 时序依然正确：commit 阶段的 ref 回调读到的永远是上一次提交后的值） */
  const contentHRef = useRef<number | null>(null);
  useEffect(() => {
    contentHRef.current = contentH;
  }, [contentH]);
  const roRef = useRef<ResizeObserver | null>(null);
  const armRef = useRef<number | null>(null);
  const measureRef = useCallback((el: HTMLDivElement | null) => {
    /* 退场卸载（el=null）不清理：交叉溶解期共享 roRef 已指向新面板的观察器，
       此处误断会让新面板内部高度变化失察（待办增删/天气加载/设置展开不再跟随）。
       退场面板的 RO 随元素回收（ResizeObserver 对 target 为弱引用） */
    if (!el) return;
    roRef.current?.disconnect();
    roRef.current = null;
    if (armRef.current != null) {
      window.clearTimeout(armRef.current);
      armRef.current = null;
    }
    const attach = () => {
      const update = () => setContentH(el.offsetHeight);
      update();
      const ro = new ResizeObserver(update);
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
     出现再弹簧撑开（入场混入高度动画）。重置放在 AnimatePresence 的
     onExitComplete（退场完成后）：⚠ 不能用渲染期 setState 重置 —— 那会在退出
     刚启动时同步触发二次渲染，打断 v12 的退场动画调度（实测是关闭动画失效的
     直接根因之一）；互切路径（A→B）外层卡片不退场，不触发重置，正是所需 */
  const resetContentH = useCallback(() => setContentH(null), []);

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
      <AnimatePresence onExitComplete={resetContentH}>
        {panel && (
          <PresenceClass
            key="dock-panel"
            role="dialog"
            aria-label={`${PANEL_TITLES[panel]}面板`}
            data-panel={panel}
            exitClass="panel-sink"
            duration={0.26}
            className="glass-card backdrop-blur-xl backdrop-saturate-150 panel-rise cl-panel pointer-events-auto relative w-[min(92vw,360px)] overflow-hidden rounded-2xl p-4 shadow-2xl"
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

          {/* 高度盒（panel-hbox）：高度 px 弹簧（无 layout scale），内容溢出由卡片 overflow-hidden 裁剪；
              initial height 0 → 每次打开（首开/重开）都从 dock 拔起拉伸到内容高，与互切同语言；
              关闭时 .panel-sink .panel-hbox 用 CSS transition 塌缩回 0（对称）。
              contain:layout 把弹簧逐帧 reflow 的失效范围圈在本盒内部，
              不再波及卡片以外任何布局（帧预算从整页降到面板盒） */}
          <motion.div
            className="panel-hbox relative"
            style={{ contain: "layout" }}
            initial={{ height: 0 }}
            animate={{ height: contentH == null ? "auto" : contentH }}
            transition={SPRING}
          >
          <AnimatePresence initial={false}>
            <PresenceClass
              key={panel}
              ref={measureRef}
              /* 退场视觉走 CSS .view-exit（absolute 钉位 + 淡出）；卸载由 PresenceClass 定时器接管 */
              exitClass="view-exit"
              duration={0.2}
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
            </PresenceClass>
          </AnimatePresence>
          </motion.div>
          </PresenceClass>
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
  presetDock,
  onRunAction,
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
  presetDock: (PresetDockItem & { key: string })[];
  onRunAction: (a: PresetAction) => void;
}) {
  const undone = todos.filter((t) => !t.done).length;

  /* dock 番茄钟：运行中或暂停中在按钮旁显示剩余分钟 + 呼吸灯 */
  const pomoText = useSyncExternalStore(subscribePomo, getPomoSnapshot, () => null);
  const pomoRunning = useSyncExternalStore(subscribePomo, getPomoRunning, () => false);

  /* 面板互切只有淡切一条路径，无需方向状态。
     ⚠ 挂载后一帧内的二次渲染会让 framer-motion v12 投影重测量（历史教训，
     v1.0.6 二分法实证）；现架构首开拉伸走 auto 目标，挂载帧零 setState */
  function switchTo(p: PanelId) {
    setPanel(p);
  }

  /* 面板关闭统一入口：稳定引用传给 PanelStage（memo 前提），见 PanelStage 注释 */
  const closePanel = useCallback(() => setPanel(null), [setPanel]);

  return (
    <>
      {/* 关闭遮罩：纯点击捕获层（无视觉），不做任何动画——原 framer opacity 入场 +
          veil-out 退场是隐形 div 上的纯 WAAPI 开销；卸载时机随 panel 状态即时切换 */}
      {panel && (
        <div
          className="fixed inset-0 z-30"
          onClick={() => switchTo(null)}
          aria-hidden
        />
      )}

      <nav
        aria-label="快捷操作"
        className="glass-pill backdrop-blur-2xl backdrop-saturate-150 dock-intro zen-dock cl-dock fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-1/2 z-40 flex -translate-x-1/2 items-center gap-0.5 rounded-full p-1.5 shadow-lg"
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

        {/* 预设注册的 tab 栏按钮（声明式，来自已安装预设，上限 3 个） */}
        {presetDock.length > 0 && <Divider />}
        {presetDock.map((d) => {
          const Icon = dockIcon(d.icon);
          return (
            <DockButton
              key={d.key}
              active={false}
              label={d.title}
              onClick={() => onRunAction(d.action)}
            >
              {Icon ? (
                <Icon className="h-[17px] w-[17px]" strokeWidth={1.5} />
              ) : (
                <span className="flex h-4 w-4 items-center justify-center rounded-full border border-current text-[9px] leading-none opacity-80">
                  {d.title[0]}
                </span>
              )}
            </DockButton>
          );
        })}

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
