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
import type {
  Place,
  PanelId,
  Settings,
  TodoItem,
  WeatherState,
} from "@/lib/startpage/types";
import type { PresetSettingValues, PresetSettingsSchema } from "@/lib/startpage/preset-settings";
import type { PresetIconTarget } from "@/lib/startpage/preset";
import { weatherText } from "@/lib/startpage/weather";

/** 预设贡献的设置分区（v1.2.0 设置面作用面）：脚本激活即出现，删除/冻结即消失 */
export interface PresetSettingSection {
  scriptKey: string;
  presetName: string;
  schema: PresetSettingsSchema;
}

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

/* ---------- 动效语言（v1.7.0 预设 motion.profile）----------
 * 面板高度弹簧与选框滑动共用同一参数组；standard 为产品默认手感，
 * playful 即用户可选的 Q 弹档，instant 用于无动效偏好场景 */
export type MotionProfile = "standard" | "playful" | "calm" | "instant";

export const MOTION_PROFILES: Record<
  MotionProfile,
  { type: "spring"; stiffness: number; damping: number; mass?: number }
> = {
  standard: { type: "spring", stiffness: 420, damping: 34 },
  playful: { type: "spring", stiffness: 500, damping: 22, mass: 0.9 },
  calm: { type: "spring", stiffness: 240, damping: 30 },
  instant: { type: "spring", stiffness: 700, damping: 42 },
};

/** 选框出场/滑移 Q 弹（backOut 型过冲回弹，非玻璃材质）。
 *  v1.7.1 定位：出场（开面板时首次出现）固定用它；切换滑移仅 playful 档
 *  （示例预设的动效语言）采用，其余档位恢复基线手感（用户：切换动画
 *  没必要 Q 弹，恢复以前的样式；这个动画留在示例预设里） */
const POPPING = { type: "spring" as const, stiffness: 520, damping: 20, mass: 0.9 };

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
  presetSettingSections,
  onPresetSettingChange,
  motionSpring,
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
  presetSettingSections: PresetSettingSection[];
  onPresetSettingChange: (scriptKey: string, values: PresetSettingValues) => void;
  motionSpring: (typeof MOTION_PROFILES)[MotionProfile];
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
            transition={motionSpring}
          >
          {/* 视图互切：新视图 .content-focus 模糊聚拢、旧视图 .view-exit 钉位模糊散场。
              不加 initial={false}——首次挂载（面板打开）也要让内容模糊聚拢进来，
              与「开=容器拉伸 + 内容模糊聚拢」的语言一致（CSS 动画，无挂载帧 setState） */}
          <AnimatePresence>
            <PresenceClass
              key={panel}
              ref={measureRef}
              /* 退场视觉走 CSS .view-exit（absolute 钉位 + 模糊散场）；卸载由 PresenceClass 定时器接管。
                 关闭路径不走本类：卡片 .panel-sink 级联令 .content-focus 模糊散场（globals.css） */
              exitClass="view-exit"
              duration={0.2}
              className="flow-root content-focus"
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
                  presetSections={presetSettingSections}
                  onPresetSettingChange={onPresetSettingChange}
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
  presetSettingSections,
  onPresetSettingChange,
  presetIcons,
  motionProfile,
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
  presetSettingSections: PresetSettingSection[];
  onPresetSettingChange: (scriptKey: string, values: PresetSettingValues) => void;
  /** 预设图标覆写（v1.7.0 图标作用面）：target → lucide 名 / data:image URL */
  presetIcons: Partial<Record<PresetIconTarget, string>>;
  /** 预设动效语言（v1.7.0 动效作用面）：面板/选框弹簧参数档位 */
  motionProfile: MotionProfile;
}) {
  const motionSpring = MOTION_PROFILES[motionProfile] ?? MOTION_PROFILES.standard;
  const undone = todos.filter((t) => !t.done).length;

  /* 选框出场只在「无面板 → 打开面板」时播 Q 弹（null→panel）；面板间切换时
     新按钮的选框不重播 initial（否则 Q 弹会重新出现——正是用户点名要退回去的
     「切换动画」），layoutId 从旧按钮位置纯滑移，即基线（v1.1.x）手感。
     渲染期同步 prevPanel（React 官方「渲染期间调整 state」模式，不用 effect）。
     v1.8.0 补充：面板刚关闭（退场动画中，≤450ms 窗口）快速点开另一个功能，
     视觉上旧选框还在退场——此刻应延续「切换」语言（layoutId 从旧位置纯滑移），
     不重新播 Q 弹出场（用户点名：此时的动画不是打开动画，是切换动画） */
  const prevPanelRef = useRef<PanelId>(null);
  /** 最近一次面板关闭时刻（switchTo(null) / closePanel 统一记录） */
  const lastCloseRef = useRef(0);
  /** 关闭退场的「切换窗口」：选框退场 0.16s + 面板沉没 0.22s，取 450ms 覆盖双击节奏 */
  const PILL_SWITCH_WINDOW_MS = 450;
  const pillPop =
    panel != null &&
    prevPanelRef.current == null &&
    Date.now() - lastCloseRef.current > PILL_SWITCH_WINDOW_MS;
  if (prevPanelRef.current !== panel) prevPanelRef.current = panel;

  /* dock 番茄钟：运行中或暂停中在按钮旁显示剩余分钟 + 呼吸灯 */
  const pomoText = useSyncExternalStore(subscribePomo, getPomoSnapshot, () => null);
  const pomoRunning = useSyncExternalStore(subscribePomo, getPomoRunning, () => false);

  /* 面板互切只有淡切一条路径，无需方向状态。
     ⚠ 挂载后一帧内的二次渲染会让 framer-motion v12 layout 投影重测量并把卡片
     transform 重置为 none（x/y/scale 全灭、面板失去居中），已用二分法实证——
     任何面板相关状态都不可在挂载后再补一帧回写 */
  function switchTo(p: PanelId) {
    if (p == null) lastCloseRef.current = Date.now();
    setPanel(p);
  }

  /* 面板关闭统一入口：稳定引用传给 PanelStage（memo 前提），见 PanelStage 注释 */
  const closePanel = useCallback(() => {
    lastCloseRef.current = Date.now();
    setPanel(null);
  }, [setPanel]);

  return (
    <>
      {/* 关闭遮罩：纯点击捕获层（无视觉），不做任何动画——原 framer opacity 入场 +
          veil-out 退场是隐形 div 上的纯 WAAPI 开销（合并自远端 bb1e0d6）；
          卸载时机随 panel 状态即时切换 */}
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
          motionProfile={motionProfile}
          pillPop={pillPop}
          active={panel === "weather"}
          label={weather.temp != null ? `${weather.temp}° ${weatherText(weather.code)}` : "天气"}
          onClick={() => switchTo(panel === "weather" ? null : "weather")}
          presetIcon={presetIcons.weather}
        >
          {presetIcons.weather ? (
            <PresetGlyph spec={presetIcons.weather} />
          ) : weather.code != null ? (
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
          motionProfile={motionProfile}
          pillPop={pillPop}
          active={panel === "todo"}
          label="待办"
          badge={undone > 0 ? undone : undefined}
          onClick={() => switchTo(panel === "todo" ? null : "todo")}
          presetIcon={presetIcons.todo}
        >
          {presetIcons.todo ? (
            <PresetGlyph spec={presetIcons.todo} />
          ) : (
            <CheckSquare className="h-[17px] w-[17px]" strokeWidth={1.5} />
          )}
        </DockButton>

        {/* 便签 */}
        <DockButton
          motionProfile={motionProfile}
          pillPop={pillPop}
          active={panel === "note"}
          label="便签"
          onClick={() => switchTo(panel === "note" ? null : "note")}
          presetIcon={presetIcons.note}
        >
          {presetIcons.note ? (
            <PresetGlyph spec={presetIcons.note} />
          ) : (
            <NotebookPen className="h-[17px] w-[17px]" strokeWidth={1.5} />
          )}
        </DockButton>

        {/* 番茄钟：选框真实布局拉伸展开（图标不变形）；分钟旁呼吸灯——计时中闪动，暂停时常亮；
            呼吸灯 wrapper 与图标同高（17px）使其同心且不撑高行盒，p-1 留光晕缓冲；
            数字 digit-slot 必须带 overflow-hidden（盒底=基线模型前提）+ leading-none，否则墨迹悬低 */}
        <DockButton
          motionProfile={motionProfile}
          pillPop={pillPop}
          active={panel === "pomodoro"}
          label={pomoText ? `番茄钟 剩余 ${pomoText} 分钟` : "番茄钟"}
          onClick={() => switchTo(panel === "pomodoro" ? null : "pomodoro")}
          presetIcon={presetIcons.pomodoro}
        >
          {presetIcons.pomodoro ? (
            <PresetGlyph spec={presetIcons.pomodoro} />
          ) : (
            <Timer className="h-[17px] w-[17px]" strokeWidth={1.5} />
          )}
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
        <DockButton motionProfile={motionProfile} pillPop={false} active={false} label="指令 ⌘K" onClick={openPalette} presetIcon={presetIcons.command}>
          {presetIcons.command ? (
            <PresetGlyph spec={presetIcons.command} />
          ) : (
            <Command className="h-[17px] w-[17px]" strokeWidth={1.5} />
          )}
          <kbd className="pointer-events-none absolute -bottom-9 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-zinc-900/10 bg-white/80 px-1.5 py-0.5 font-sans text-[10px] tracking-wider text-zinc-500 opacity-0 shadow-sm backdrop-blur transition-opacity duration-300 group-hover:opacity-100 sm:block dark:border-white/10 dark:bg-[#17171c]/90 dark:text-zinc-400">
            ⌘K
          </kbd>
        </DockButton>

        <Divider />

        {/* 设置 */}
        <DockButton
          motionProfile={motionProfile}
          pillPop={pillPop}
          active={panel === "settings"}
          label="设置"
          onClick={() => switchTo(panel === "settings" ? null : "settings")}
          presetIcon={presetIcons.settings}
        >
          {presetIcons.settings ? (
            <PresetGlyph spec={presetIcons.settings} />
          ) : (
            <Settings2 className="h-[17px] w-[17px]" strokeWidth={1.5} />
          )}
        </DockButton>

        {/* 预设注册的 tab 栏按钮（声明式，来自已安装预设，上限 3 个） */}
        {presetDock.length > 0 && <Divider />}
        {presetDock.map((d) => {
          const Icon = dockIcon(d.icon);
          return (
            <DockButton
              key={d.key}
              motionProfile={motionProfile}
              pillPop={false}
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
        presetSettingSections={presetSettingSections}
        onPresetSettingChange={onPresetSettingChange}
        motionSpring={motionSpring}
      />
    </>
  );
}

function Divider() {
  return <span aria-hidden className="mx-1 h-5 w-px bg-[var(--pill-line)]" />;
}

/** 预设覆写图标渲染（v1.7.0 图标作用面）：
 *  lucide 名 → 白名单组件（currentColor 跟随主题）；data:image URL → <img>
 *  （SVG 在 img 中处于静态模式：脚本不执行、外链不加载） */
function PresetGlyph({ spec }: { spec: string }) {
  const Lucide = dockIcon(spec);
  if (Lucide) return <Lucide className="h-[17px] w-[17px]" strokeWidth={1.5} />;
  return (
    <img
      src={spec}
      alt=""
      width={17}
      height={17}
      draggable={false}
      className="h-[17px] w-[17px] object-contain"
    />
  );
}

function DockButton({
  children,
  label,
  active,
  onClick,
  badge,
  presetIcon,
  motionProfile,
  pillPop,
}: {
  children: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  badge?: number;
  /** 预设图标覆写：存在时本按钮的 active 选框仍由宿主渲染（图标只换字形） */
  presetIcon?: string;
  /** 动效语言档位：切换滑移 playful 档用 Q 弹，其余档位用基线标准弹簧 */
  motionProfile: MotionProfile;
  /** 本次挂载是否播 Q 弹出场（无面板→打开面板时为 true；面板间切换为 false → 纯滑移） */
  pillPop: boolean;
}) {
  const reduceMotion = useReducedMotion();
  /* 选框三段动效（v1.7.1）：
   *  - 出现（开面板首次挂载）：Q 弹 scale .6→1（POPPING，固定不变）；
   *  - 切换（layoutId 跨按钮滑移）：恢复基线手感 standard 弹簧（420/34，与 v1.1.x 一致），
   *    仅 playful 档（示例预设）换成 Q 弹滑移；
   *  - 消失（关闭面板）：快速缩回 + 淡出（退场加速曲线，与出场对称）。 */
  const pillSwitchSpring =
    motionProfile === "playful" ? POPPING : MOTION_PROFILES.standard;
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
      <AnimatePresence>
        {active && (
          /* 选框：layoutId 承担按钮间滑移（transition.layout）；出场/消失由
             opacity/scale 承担。pillPop=false（面板间切换）时不播 initial，
             新选框从旧按钮位置纯滑移（基线手感）；出场 Q 弹只在真首次出现时可见；
             reduceMotion 下不播出场 */
          <motion.span
            layoutId="dock-active-pill"
            initial={reduceMotion || !pillPop ? false : { opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{
              opacity: 0,
              scale: 0.6,
              transition: { duration: 0.16, ease: EXIT_EASE },
            }}
            transition={{
              layout: pillSwitchSpring,
              opacity: POPPING,
              scale: POPPING,
            }}
            className="absolute inset-0 rounded-full bg-[var(--pill-seg)] ring-1 ring-[color:var(--pill-seg-ring)]"
            aria-hidden
          />
        )}
      </AnimatePresence>
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
