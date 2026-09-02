"use client";

import { memo, useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { PresenceClass } from "./PresenceClass";
import { useMorphHeight } from "./use-morph-height";
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

/* 退场加速曲线（与 globals.css 的 .panel-sink/.veil-out 同参） */
const EXIT_EASE = [0.4, 0, 1, 1] as const;

/** 面板打开 / 切换 / 关闭 = 同一套高度形变语言（用户认可的「拉伸」）：
 *  打开：高度盒从 0 弹簧展开到内容高度（initial height 0）+ 卡片 .panel-rise 淡入；
 *  切换：高度盒弹簧到新内容高度 + 新旧内容交叉溶解；
 *  关闭：高度盒折回 0（exit height→0，JS 逐帧写样式非 WAAPI，无取消回跳风险）
 *        + 卡片 .panel-sink 淡出，与打开严格对称。
 *  退出面板绝对定位钉回内容盒原位（inset 0），在高度形变期间与新面板重叠溶解。
 *  ⚠ 入场/退场淡入淡出均不在 framer 内（移交 .panel-rise / .panel-sink 等 CSS 关键帧，见 globals.css）：
 *    framer v12 对 opacity 走 WAAPI 加速，入场空窗期真机整板闪黑，退场中途被取消
 *    回跳 1 等于没有关闭动画。卡片本体不再持有 framer 入场动画（y/scale 并入高度展开语言）
 *  ⚠ 卡片不再带 backdrop-filter：磨砂玻璃 + opacity 动画是 Chromium 闪烁的经典组合，
 *    且逐帧重采样 backdrop 是掉帧主力；glass-card 底色 92% 不透明，磨砂本就不可见（v1.0.8 实证修复） */

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
  /* 面板内容真实高度：卡片高度动画的驱动源（测高/RO 兜底/零高毒化防护见 hook 注释）。
     为什么不用 framer layout：layout 用 transform scale 缩放卡片盒子，内部内容无反向补偿，
     切换瞬间整卡内容被纵向压扁/拉伸，读起来像「旧卡压扁关闭 + 新卡撑开打开」两次动画；
     改为测量内容高度 + 高度 px 弹簧（reflow 形变），内容全程零畸变，视觉上只是
     「容器平滑地变成另一个面板的尺寸 */
  const { contentH, measureRef, reset: resetContentH } = useMorphHeight();
  const reduceMotion = useReducedMotion();

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
            style={{ transformOrigin: "bottom center", willChange: "transform" }}
            data-panel={panel}
            exitClass="panel-sink"
            className="glass-card panel-rise cl-panel pointer-events-auto relative w-[min(92vw,360px)] overflow-hidden rounded-2xl p-4 shadow-2xl"
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

          {/* 高度盒：打开从 0 弹簧展开（initial height 0）+ 切换 px 弹簧 + 关闭折回 0
              （exit 交给 framer 逐帧写样式，height 非 WAAPI 加速属性，无取消回跳风险），
              内容溢出由卡片 overflow-hidden 裁剪；contain:layout 把弹簧逐帧 reflow
              的失效范围圈在本盒内部（帧预算从整页降到面板盒） */}
          <motion.div
            className="relative"
            style={{ contain: "layout" }}
            initial={reduceMotion ? false : { height: 0 }}
            animate={{ height: contentH == null ? "auto" : contentH }}
            exit={{ height: 0, transition: { duration: 0.22, ease: EXIT_EASE } }}
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
      {/* 关闭遮罩：退场淡出走 CSS .veil-out（framer exit 仅计时） */}
      <AnimatePresence>
        {panel && (
          <PresenceClass
            key="dock-overlay"
            exitClass="veil-out"
            duration={0.25}
            className="fixed inset-0 z-30"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onClick={() => switchTo(null)}
            aria-hidden
          />
        )}
      </AnimatePresence>

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
