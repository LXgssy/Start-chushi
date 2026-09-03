"use client";

import React, { memo, useCallback, useEffect, useLayoutEffect, useRef, useSyncExternalStore } from "react";
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
import { FxIcon } from "./FxIcon";
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
import {
  TabIndicatorMotion,
  LiquidButtonPress,
  interpolateSlot,
  type SlotRect,
} from "@/lib/startpage/liquid-glass/dock-motion";
import type {
  Place,
  PanelId,
  Settings,
  TodoItem,
  WeatherState,
} from "@/lib/startpage/types";
import type { PresetSettingValues, PresetSettingsSchema } from "@/lib/startpage/preset-settings";
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

const SPRING = { type: "spring" as const, stiffness: 420, damping: 34 };

/* 退场加速曲线（与 globals.css 的 .panel-sink/.veil-out 同参） */
const EXIT_EASE = [0.4, 0, 1, 1] as const;

/** 底栏动效体系（v1.5.0 · 玻璃游乐场移植版）：
 *  活动指示器不再是 framer layoutId 背景色药丸，而是**液态玻璃指示器**
 *  （.cl-dock-indicator，引擎单独折射的滑动玻璃胶囊），滑动/按压/速度拉伸
 *  物理忠实移植自 LiquidBottomTabs.kt + DampedDragAnimation.kt（经
 *  liquid-glass-webgl「玻璃游乐场」转译，作者 martin65536 / Kyant0）：
 *    - 滑动与按压：临界阻尼 spring(1f, 1000f)；
 *    - 指示器缩放：欠阻尼 spring(0.6f/0.7f, 250f)，按下 78/56；
 *    - 速度拉伸：velocity/10，scaleX /= 1−clamp(v×0.75)、scaleY ×= 1−clamp(v×0.25)；
 *    - panelOffset：4dp × sign × EaseOut 整行随手指微移；
 *    - 容器/内容缩放：lerp(1, 1+16dp/W, press) × lerp(1, 1.2, press)。
 *  按钮按压动效 = LiquidButton.kt 移植（LiquidButtonPress）：
 *  scale 1+4/48×p + tanh 拖拽平移 + 追光白晕（.liquid-btn ::after）。
 *  指示器玻璃画布由液态玻璃引擎逐帧跟随（rAF getBoundingClientRect 律，
 *  transform 动画零侵入）。 */

/** 面板 tab 槽位序（指示器只在五个面板按钮之间滑动；⌘K/预设按钮是动作不参与） */
const TAB_ORDER = ["weather", "todo", "note", "pomodoro", "settings"] as const;
type TabId = (typeof TAB_ORDER)[number];

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
 *    且逐帧重采样 backdrop 是掉帧主力；玻璃启用时卡片本体透明由引擎画布着色 */

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
            <FxIcon slot="dock-close" fallback={XGlyph} className="h-[11px] w-[11px]" />
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
}) {
  const undone = todos.filter((t) => !t.done).length;

  /* dock 番茄钟：运行中或暂停中在按钮旁显示剩余分钟 + 呼吸灯 */
  const pomoText = useSyncExternalStore(subscribePomo, getPomoSnapshot, () => null);
  const pomoRunning = useSyncExternalStore(subscribePomo, getPomoRunning, () => false);

  /* ---------- 液态玻璃指示器动效（LiquidBottomTabs 移植） ---------- */
  const navRef = useRef<HTMLElement | null>(null);
  const indicatorRef = useRef<HTMLDivElement | null>(null);
  const rowRef = useRef<HTMLDivElement | null>(null);
  const slotRefs = useRef<Map<string, HTMLElement>>(new Map());
  const slotsRef = useRef<SlotRect[]>([]);
  const motionRef = useRef<TabIndicatorMotion | null>(null);
  /* 拖拽状态（pointer 事件委托在 nav 上；按钮 press 的取消句柄也挂这里） */
  const dragRef = useRef({ x0: 0, idx0: 0, active: false, dragging: false, suppressClick: false });
  const pressCancelRef = useRef<(() => void) | null>(null);

  const measureSlots = useCallback(() => {
    const slots: SlotRect[] = [];
    for (const id of TAB_ORDER) {
      const el = slotRefs.current.get(id);
      if (el) slots.push({ x: el.offsetLeft, w: el.offsetWidth });
    }
    slotsRef.current = slots;
    motionRef.current?.setSlots(slots, slots.length);
  }, []);

  useEffect(() => {
    const m = new TabIndicatorMotion();
    motionRef.current = m;
    m.onUpdate = (f) => {
      /* 指示器 transform：插值槽位 x/w + 按压缩放（含速度拉伸）。
         玻璃画布由引擎 rAF 逐帧跟随 rect，transform 动画零侵入。 */
      const ind = indicatorRef.current;
      if (ind) {
        const slot = interpolateSlot(slotsRef.current, f.fraction);
        if (slot) {
          ind.style.width = `${slot.w}px`;
          ind.style.transform = `translateX(${slot.x}px) scale(${f.scaleX}, ${f.scaleY})`;
        }
      }
      /* 内容行：容器缩放 × 内容缩放（lerp(1,1+16/W,p) × lerp(1,1.2,p)）+ panelOffset */
      const row = rowRef.current;
      const nav = navRef.current;
      if (row && nav) {
        const w = Math.max(1, nav.offsetWidth);
        const containerScale = 1 + (16 / w) * f.press;
        const contentScale = 1 + 0.2 * f.press;
        row.style.transform = `translateX(${f.panelOffset}px) scale(${containerScale * contentScale})`;
      }
    };
    return () => {
      m.dispose();
      motionRef.current = null;
    };
  }, []);

  /* 槽位几何：内容宽度随天气温度/番茄钟分钟/待办徽标变化，布局后重测；
     ResizeObserver 兜底字体加载等隐性尺寸变化 */
  useLayoutEffect(measureSlots);
  useEffect(() => {
    measureSlots();
    const nav = navRef.current;
    if (!nav || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measureSlots);
    ro.observe(nav);
    return () => ro.disconnect();
  }, [measureSlots, pomoText, undone, weather.temp, presetDock.length]);

  /* 面板 ↔ 指示器：面板变化驱动指示器滑到对应槽位（⌘K 打开设置等路径同样生效） */
  useEffect(() => {
    const m = motionRef.current;
    if (!m) return;
    if (panel) {
      const i = TAB_ORDER.indexOf(panel as TabId);
      if (i >= 0) m.select(i);
    }
  }, [panel]);

  /* ---------- nav 级拖拽（手指按住任意位置滑动指示器，LiquidBottomTabs 律） ---------- */
  const nearestSlot = (x: number): number => {
    const nav = navRef.current;
    if (!nav) return 0;
    const nx = x - nav.getBoundingClientRect().left;
    const slots = slotsRef.current;
    let best = 0;
    let bestD = Infinity;
    slots.forEach((s, i) => {
      const c = s.x + s.w / 2;
      const d = Math.abs(nx - c);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  };

  const avgTabWidth = (): number => {
    const slots = slotsRef.current;
    if (slots.length < 2) return slots[0]?.w ?? 64;
    const span = slots[slots.length - 1].x + slots[slots.length - 1].w - slots[0].x;
    return Math.max(1, span / (slots.length - 1));
  };

  const onNavPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    dragRef.current = { x0: e.clientX, idx0: nearestSlot(e.clientX), active: true, dragging: false, suppressClick: false };
  };
  const onNavPointerMove = (e: React.PointerEvent) => {
    const st = dragRef.current;
    if (!st.active) return;
    const m = motionRef.current;
    if (!m) return;
    if (!st.dragging) {
      if (Math.abs(e.clientX - st.x0) < 8) return;
      st.dragging = true;
      st.suppressClick = true;
      pressCancelRef.current?.(); /* 拖拽接管：取消按钮按压 */
      m.beginDrag(st.idx0, st.x0);
    }
    const slots = slotsRef.current;
    const tabW = slots.length > 1 ? (slots[slots.length - 1].x - slots[0].x) / (slots.length - 1) : avgTabWidth();
    m.drag(e.clientX, st.x0, Math.max(1, tabW));
  };
  const onNavPointerUp = () => {
    const st = dragRef.current;
    if (!st.active) return;
    const m = motionRef.current;
    if (st.dragging && m) {
      const final = m.endDrag();
      const id = TAB_ORDER[final] as PanelId;
      if (id && id !== panel) switchTo(id);
    }
    st.active = false;
    st.dragging = false;
  };
  const onNavClickCapture = (e: React.MouseEvent) => {
    if (dragRef.current.suppressClick) {
      e.stopPropagation();
      e.preventDefault();
      dragRef.current.suppressClick = false;
    }
  };

  /* 面板互切只有淡切一条路径，无需方向状态。
     ⚠ 挂载后一帧内的二次渲染会让 framer-motion v12 layout 投影重测量并把卡片
     transform 重置为 none（x/y/scale 全灭、面板失去居中），已用二分法实证——
     任何面板相关状态都不可在挂载后再补一帧回写 */
  function switchTo(p: PanelId) {
    setPanel(p);
  }

  /* tab 点击：指示器滑过去 + 打开面板；重复点击当前面板 = 关闭（指示器淡出） */
  const tabSlot = useCallback((id: PanelId) => TAB_ORDER.indexOf(id as TabId), []);
  const onTabClick = (id: PanelId) => {
    if (panel === id) {
      switchTo(null);
      return;
    }
    const m = motionRef.current;
    const i = tabSlot(id);
    if (m && i >= 0) m.select(i);
    switchTo(id);
  };

  /* 面板关闭统一入口：稳定引用传给 PanelStage（memo 前提），见 PanelStage 注释 */
  const closePanel = useCallback(() => setPanel(null), [setPanel]);

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
        ref={navRef}
        aria-label="快捷操作"
        onPointerDown={onNavPointerDown}
        onPointerMove={onNavPointerMove}
        onPointerUp={onNavPointerUp}
        onPointerCancel={onNavPointerUp}
        onClickCapture={onNavClickCapture}
        className="glass-pill backdrop-blur-2xl backdrop-saturate-150 dock-intro zen-dock cl-dock fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-1/2 z-40 -translate-x-1/2 rounded-full p-1.5 shadow-lg"
      >
        {/* 液态玻璃指示器（LiquidBottomTabs 指示器移植）：引擎单独折射的
            滑动玻璃胶囊；56/64 内缩律 = 上下 4dp（nav p-1.5 + 按钮高） */}
        <div
          ref={indicatorRef}
          aria-hidden
          className="cl-dock-indicator pointer-events-none absolute inset-y-1.5 left-0 z-0 rounded-full bg-[var(--pill-seg)] ring-1 ring-[color:var(--pill-seg-ring)] transition-opacity duration-200"
          style={{
            opacity: panel ? 1 : 0,
            transformOrigin: "center",
            willChange: "transform, width",
          }}
        />

        {/* 内容行：容器缩放 × 内容缩放 + panelOffset 的作用面（ LiquidBottomTabs
            容器 Row 律；指示器是兄弟节点不参与容器缩放 —— 原实现同） */}
        <div
          ref={rowRef}
          className="relative z-10 flex items-center gap-0.5"
          style={{ transformOrigin: "center", willChange: "transform" }}
        >
        {/* 天气 */}
        <DockButton
          slotRef={(el) => registerSlot("weather", el)}
          active={panel === "weather"}
          label={weather.temp != null ? `${weather.temp}° ${weatherText(weather.code)}` : "天气"}
          onClick={() => onTabClick("weather")}
          pressRegistry={pressCancelRef}
        >
          {weather.code != null ? (
            <WeatherGlyph code={weather.code} size={16} />
          ) : (
            <FxIcon slot="dock-weather" fallback={CloudSun} className="h-[17px] w-[17px]" strokeWidth={1.5} />
          )}
          {weather.temp != null && (
            <span className="ml-1 tabular-nums text-xs">{weather.temp}°</span>
          )}
        </DockButton>

        <Divider />

        {/* 待办 */}
        <DockButton
          slotRef={(el) => registerSlot("todo", el)}
          active={panel === "todo"}
          label="待办"
          badge={undone > 0 ? undone : undefined}
          onClick={() => onTabClick("todo")}
          pressRegistry={pressCancelRef}
        >
          <FxIcon slot="dock-todo" fallback={CheckSquare} className="h-[17px] w-[17px]" strokeWidth={1.5} />
        </DockButton>

        {/* 便签 */}
        <DockButton
          slotRef={(el) => registerSlot("note", el)}
          active={panel === "note"}
          label="便签"
          onClick={() => onTabClick("note")}
          pressRegistry={pressCancelRef}
        >
          <FxIcon slot="dock-note" fallback={NotebookPen} className="h-[17px] w-[17px]" strokeWidth={1.5} />
        </DockButton>

        {/* 番茄钟：选框真实布局拉伸展开（图标不变形）；分钟旁呼吸灯——计时中闪动，暂停时常亮；
            呼吸灯 wrapper 与图标同高（17px）使其同心且不撑高行盒，p-1 留光晕缓冲；
            数字 digit-slot 必须带 overflow-hidden（盒底=基线模型前提）+ leading-none，否则墨迹悬低 */}
        <DockButton
          slotRef={(el) => registerSlot("pomodoro", el)}
          active={panel === "pomodoro"}
          label={pomoText ? `番茄钟 剩余 ${pomoText} 分钟` : "番茄钟"}
          onClick={() => onTabClick("pomodoro")}
          pressRegistry={pressCancelRef}
        >
          <FxIcon slot="dock-pomodoro" fallback={Timer} className="h-[17px] w-[17px]" strokeWidth={1.5} />
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

        {/* 命令面板（动作按钮，不参与指示器滑动） */}
        <DockButton active={false} label="指令 ⌘K" onClick={openPalette} pressRegistry={pressCancelRef}>
          <FxIcon slot="dock-cmdk" fallback={Command} className="h-[17px] w-[17px]" strokeWidth={1.5} />
          <kbd className="pointer-events-none absolute -bottom-9 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-zinc-900/10 bg-white/80 px-1.5 py-0.5 font-sans text-[10px] tracking-wider text-zinc-500 opacity-0 shadow-sm backdrop-blur transition-opacity duration-300 group-hover:opacity-100 sm:block dark:border-white/10 dark:bg-[#17171c]/90 dark:text-zinc-400">
            ⌘K
          </kbd>
        </DockButton>

        <Divider />

        {/* 设置 */}
        <DockButton
          slotRef={(el) => registerSlot("settings", el)}
          active={panel === "settings"}
          label="设置"
          onClick={() => onTabClick("settings")}
          pressRegistry={pressCancelRef}
        >
          <FxIcon slot="dock-settings" fallback={Settings2} className="h-[17px] w-[17px]" strokeWidth={1.5} />
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
              pressRegistry={pressCancelRef}
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
        </div>
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
      />
    </>
  );

  function registerSlot(id: TabId, el: HTMLElement | null) {
    if (el) slotRefs.current.set(id, el);
    else slotRefs.current.delete(id);
  }
}

function Divider() {
  return <span aria-hidden className="mx-1 h-5 w-px bg-[var(--pill-line)]" />;
}

/** 面板关闭图标（原内联 SVG 的组件化 fallback，供 FxIcon dock-close 槽位回落） */
function XGlyph(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden {...props}>
      <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

/** dock 按钮：LiquidButton 按压动效（v1.5.0 · 玻璃游乐场移植）。
 *  按下 scale 1+4/48×p（临界阻尼）+ tanh 拖拽平移 + 追光白晕；
 *  pressRegistry：nav 级拖拽开始时经此取消按钮按压（拖拽接管律）。 */
function DockButton({
  children,
  label,
  active,
  onClick,
  badge,
  slotRef,
  pressRegistry,
}: {
  children: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  badge?: number;
  slotRef?: (el: HTMLButtonElement | null) => void;
  pressRegistry?: React.MutableRefObject<(() => void) | null>;
}) {
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const pressRef = useRef<LiquidButtonPress | null>(null);
  const glowPos = useRef({ x: 50, y: 50 });

  useEffect(() => {
    const lp = new LiquidButtonPress();
    pressRef.current = lp;
    lp.onUpdate = ({ scale, tx, ty, press }) => {
      const el = btnRef.current;
      if (!el) return;
      el.style.transform =
        scale === 1 && tx === 0 && ty === 0
          ? ""
          : `translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px) scale(${scale.toFixed(4)})`;
      el.style.setProperty("--press-p", press.toFixed(3));
    };
    return () => {
      lp.dispose();
      pressRef.current = null;
    };
  }, []);

  const localXY = (e: React.PointerEvent) => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    glowPos.current = {
      x: ((e.clientX - r.left) / Math.max(1, r.width)) * 100,
      y: ((e.clientY - r.top) / Math.max(1, r.height)) * 100,
    };
    el.style.setProperty("--press-x", `${glowPos.current.x.toFixed(1)}%`);
    el.style.setProperty("--press-y", `${glowPos.current.y.toFixed(1)}%`);
  };

  const release = useCallback(() => {
    pressRef.current?.release();
    if (pressRegistry && pressRegistry.current === release) pressRegistry.current = null;
  }, [pressRegistry]);

  return (
    <button
      type="button"
      ref={(el) => {
        btnRef.current = el;
        slotRef?.(el);
      }}
      onClick={onClick}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        localXY(e);
        pressRef.current?.press(e.clientX, e.clientY);
        if (pressRegistry) pressRegistry.current = release;
      }}
      onPointerMove={(e) => {
        if (e.buttons & 1) {
          localXY(e);
          pressRef.current?.move(e.clientX, e.clientY);
        }
      }}
      onPointerUp={release}
      onPointerLeave={release}
      onPointerCancel={release}
      aria-label={label}
      title={label}
      aria-pressed={active}
      data-active={active ? "true" : undefined}
      className={`dock-btn liquid-btn accent-ring group relative flex h-9 items-center rounded-full px-3 outline-none transition-colors duration-300 focus-visible:ring-2 ${
        active || typeof badge === "number"
          ? "text-zinc-900 dark:text-zinc-50"
          : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
      }`}
    >
      {/* LiquidButton 追光白晕（InteractiveHighlight 等价：按压进度驱动） */}
      <span
        aria-hidden
        className="liquid-btn-glow pointer-events-none absolute inset-0 rounded-full"
      />
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
