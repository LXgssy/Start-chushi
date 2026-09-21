"use client";

/* 「初始」— 面板统一舞台（v9 架构重写，行为与 v8.6.39 逐帧等价）
 *
 * ================================ 动效语言 ================================
 * 面板打开 / 切换 / 关闭 = 同一套高度形变语言（「拉伸」）：
 *  · 打开：高度盒从 0 弹簧展开到内容高度 + 玻璃卡 .panel-rise 凝入；
 *  · 切换：高度盒弹簧到新内容高度 + 同一张玻璃卡直接换内容
 *    （新内容 .cl-panel-content 模糊聚拢淡入）；
 *  · 关闭：高度盒折回 0（0.22s EXIT_EASE）+ 壳体 .panel-sink 级联散场，
 *    与打开严格对称。
 *
 * ================================ 互切拉伸律 ================================
 * 互切 = 一张玻璃卡换内容（v1.0.8 结构定律）：
 *  ① 内建玻璃卡 open 相位恒挂载（不随面板 key 重挂）——互切前后同一个 DOM
 *     节点，玻璃底/描边/投影零动画，双玻璃交叉溶解从结构上不可能发生；
 *  ② 内容层 keyed 重挂（key=session+panel）：旧内容同帧卸载（零残留结构性
 *     保证），新内容播 .cl-panel-content 模糊聚拢淡入；
 *  ③ 动效主角 = 高度/宽度 px 弹簧（拉伸），内容过场用全 app 统一的模糊聚拢。
 *
 * ============================== 关闭会话归属 ==============================
 * closing 相位「谁在收场」由单一状态 activeView 结构性回答：
 * activeView 只在「有视图激活」的渲染帧同步（React 渲染期调整 state 模式），
 * 关闭帧视图态变 null 时 activeView 保持前值 = 恰为关闭会话的归属——
 * 内建会话收场只渲染内建卡、部件会话收场只点亮部件视图。
 * panel/dockWidgetOpen 单帧批量互斥律保证无双活帧，因此不存在
 * 「陈旧 ref 让幽灵内容在收场窗复活」这类病灶（v8.6.39 前的 ㊲ 家族）。
 *
 * ============================== 玻璃壳满窗律 ==============================
 * 玻璃卡 h-full：卡高每帧恒等于高度盒当前动画值——玻璃底边恒贴壳体底缘，
 * 顶边随弹簧收放（收缩=顶边收下、伸展=顶边拉起，双向对称零跳变）。
 *
 * ================================ 其它定律 ================================
 *  · 高度形变不用 framer layout（transform scale 会压扁内容、读作两次动画），
 *    改为内容盒测高 + 高度盒 px 弹簧；height 非 WAAPI 加速属性，无取消回跳；
 *  · 内容淡入不在 framer 内（framer v12 对 opacity 走 WAAPI 有入场空窗）——
 *    淡入走 CSS .cl-panel-content，玻璃凝入走 .panel-rise；
 *  · 部件视图 = 常驻 overlay（iframe 永不卸载 = 预热零白屏），激活经
 *    content-focus-solid 重播（模糊聚拢）；显隐用 opacity（v8.7.1：常驻合成
 *    树，重激活零重栅格化——白帧从结构上不存在，白罩只剩加载保护职责）；
 *  · 互切底锚律：部件视图 top = max(0px, calc(100% - h px))——窗口高 s≤部件高
 *    h（首开/收折全程）顶锚保留，s>h（互切收折段）卡底即帧贴 dock 底锚、
 *    窗口顶边收下来贴合（收缩方向与内建一致）；
 *  · 材质恒定律：关闭全程玻璃五项材质冻结自然值（globals.css
 *    .panel-sink .cl-panel animation:none），高度归零在先、卸载在后零突跳。
 */

import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useMorphHeight } from "./use-morph-height";
import WeatherPanel from "./WeatherPanel";
import TodoPanel from "./TodoPanel";
import NotePanel from "./NotePanel";
import PomodoroPanel from "./PomodoroPanel";
import SettingsPanel from "./SettingsPanel";
import { sandboxWidgetSrc } from "@/lib/startpage/sandbox";
import { postToWidget, widgetFrameSet } from "@/lib/startpage/widget-frames";
import type {
  Place,
  PanelId,
  Settings,
  TodoItem,
  WeatherState,
} from "@/lib/startpage/types";
import type { ActiveWidget } from "./PresetWidgets";
import type { PresetSettingValues, PresetSettingsSchema } from "@/lib/startpage/preset-settings";
import { PANEL_TITLES, SINK_MS, EXIT_EASE, WIDGET_H_MIN, PANEL_CARD_BORDER } from "./dock-motion";

/** 预设贡献的设置分区（v1.2.0 设置面作用面）：脚本激活即出现，删除/冻结即消失 */
export interface PresetSettingSection {
  scriptKey: string;
  presetName: string;
  schema: PresetSettingsSchema;
}

/** 关闭会话归属（见文件头「关闭会话归属」节） */
type ActiveView =
  | { kind: "builtin"; panel: Exclude<PanelId, null> }
  | { kind: "widget"; key: string }
  | null;

function sameView(a: ActiveView, b: ActiveView): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (a.kind !== b.kind) return false;
  return a.kind === "builtin"
    ? a.panel === (b as { panel: Exclude<PanelId, null> }).panel
    : a.key === (b as { key: string }).key;
}

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
  dockWidgets,
  dockWidgetOpen,
  widgetHeights,
  isDark,
  accent,
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
  motionSpring: { type: "spring"; stiffness: number; damping: number; mass?: number };
  dockWidgets: ActiveWidget[];
  dockWidgetOpen: string | null;
  widgetHeights: Record<string, number>;
  isDark: boolean;
  accent: string;
}) {
  /* 面板内容真实高度：卡片高度动画的驱动源（测高/RO 兜底/零高毒化防护见
     use-morph-height 注释）。 */
  const { contentH, measureRef, reset: resetContentH } = useMorphHeight();
  const reduceMotion = useReducedMotion();

  /* ---------- 活动视图与相位机 ---------- */
  const widgetActive =
    dockWidgetOpen != null && dockWidgets.some((w) => w.key === dockWidgetOpen);
  /** 当前渲染帧的激活视图（null = 无） */
  const view: ActiveView = widgetActive
    ? { kind: "widget", key: dockWidgetOpen as string }
    : panel != null
      ? { kind: "builtin", panel }
      : null;
  const anyActive = view != null;

  const [phase, setPhase] = useState<"closed" | "open" | "closing">("closed");
  /** 打开期次：false→true 迁移时 +1——内容层 key 携带期次，同面板关后重开也
      重播 .cl-panel-content 淡入（否则内容层 key 不变不重挂，重开无入场过场） */
  const [session, setSession] = useState(0);
  /** 关闭会话归属：仅在有视图激活的帧同步，closing 期冻结为最后激活视图 */
  const [activeView, setActiveView] = useState<ActiveView>(view);
  /** 相位迁移用 React 官方「渲染期间调整 state」模式（同步 setState 在 effect
      里会级联渲染；对比键入 prev state，仅在真变化时派生新相位） */
  const [prevAnyActive, setPrevAnyActive] = useState(anyActive);
  if (prevAnyActive !== anyActive) {
    setPrevAnyActive(anyActive);
    if (anyActive) setSession((s) => s + 1);
    setPhase(anyActive ? "open" : (p) => (p === "closed" ? "closed" : "closing"));
  }
  if (view != null && !sameView(activeView, view)) {
    setActiveView(view); /* 首开赋值 + 互切换装 */
  }

  /* closing → closed：sink 播完清类（下次打开重播 rise）并复位内建测高 */
  useEffect(() => {
    if (phase !== "closing") return;
    const t = window.setTimeout(() => setPhase("closed"), SINK_MS);
    return () => window.clearTimeout(t);
  }, [phase]);
  useEffect(() => {
    if (phase === "closed") resetContentH();
  }, [phase, resetContentH]);

  /* 部件激活时重播 content-focus-solid（无 opacity 的模糊聚拢，杀闪白）：
     常驻元素不能靠重挂重播，用「摘类 → reflow → 挂类」重启同一 CSS 动画；
     类此后保留——关闭时壳体 .panel-sink 级联散场依赖它在。
     ⚠ 白帧罩 boot-fade 不在此挂（v8.7.1 解耦）：罩子由 iframe onLoad 一次性
     挂上（加载保护，forwards 保持揭开态）。若在此重挂，互切重激活会把
     280ms 驻留白罩重新盖回弹簧期——高度/宽度弹簧全程被纯色罩遮蔽，
     「拉伸/收缩」动画感知归零（㊴ 根因，诊断曲线：stageH 442→127 弹簧期间
     ::after opacity 恒 1）。opacity 常驻合成后重激活零白帧，重挂纯属多余。 */
  const widgetViewRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const themeRef = useRef({ isDark, accent });
  useEffect(() => {
    themeRef.current = { isDark, accent };
  });
  useLayoutEffect(() => {
    if (phase !== "open" || !widgetActive || !dockWidgetOpen) return;
    const el = widgetViewRefs.current.get(dockWidgetOpen);
    if (!el) return;
    el.classList.remove("content-focus-solid");
    void el.offsetWidth;
    el.classList.add("content-focus-solid");
  }, [phase, widgetActive, dockWidgetOpen]);

  /* 高度/宽度目标：内建=测高（首开 auto 直就位），部件=自报高度（chushi.resize） */
  const activeWidget =
    activeView?.kind === "widget"
      ? (dockWidgets.find((w) => w.key === activeView.key) ?? null)
      : null;
  const widgetH = activeWidget
    ? Math.max(WIDGET_H_MIN, Math.round(widgetHeights[activeWidget.key] ?? activeWidget.height))
    : 0;
  const openH = activeWidget
    ? widgetH
    : contentH == null
      ? ("auto" as const)
      : contentH + PANEL_CARD_BORDER;
  const shellWidth = activeWidget ? activeWidget.width : 360;
  /* 壳体类：透明壳上入场类无视觉（panel-fade 只动 bg/border/shadow），open 相位
     恒无类；closing 恒 .panel-sink（散场级联宿主）。reduceMotion 下同样挂
     panel-sink——瞬时性由 globals.css prefers-reduced-motion 块兜底 */
  const shellAnim = phase === "closing" ? "panel-sink" : "";

  /* 渲染面板：open 相位 = 当前内建面板；closing 相位 = 关闭会话归属为内建时
     渲染 activeView.panel（旧内容继续渲染播散场，SINK_MS 后随 closed 卸载）；
     closed = null 不渲染。 */
  const displayPanel: PanelId =
    phase !== "closed" && activeView?.kind === "builtin"
      ? panel ?? activeView.panel
      : null;

  return (
    /* 面板浮层：外层静态 wrapper 负责定位（fixed + CSS -translate-x-1/2 居中），
        内层舞台壳由 framer 做宽度 px 弹簧（透明壳体，玻璃/部件视觉在视图层）——
        百分比 x 由 framer 接管时会与 v12 投影测量循环冲突，故居中变换永久留在 CSS。
        wrapper 自带 transform，成为壳内 absolute 子元素的包含块。 */
    <div
      className="pointer-events-none fixed bottom-[calc(max(1.25rem,env(safe-area-inset-bottom))+60px)] left-1/2 z-40 -translate-x-1/2"
    >
      <motion.div
        role={phase === "open" ? "dialog" : undefined}
        aria-hidden={phase === "closed"}
        aria-label={
          activeWidget ? activeWidget.name : panel ? `${PANEL_TITLES[panel]}面板` : undefined
        }
        data-widget={activeWidget?.key}
        initial={false}
        animate={{ width: shellWidth }}
        transition={reduceMotion ? { duration: 0 } : motionSpring}
        className={`cl-stage pointer-events-auto relative overflow-hidden rounded-[18px] ${shellAnim}`}
        style={{
          transformOrigin: "bottom center",
          willChange: "transform",
          maxWidth: "92vw",
        }}
      >
        {/* 高度盒：打开从 0 弹簧展开 + 切换 px 弹簧 + 关闭折回 0（关闭走逐帧 height
            写入，height 非 WAAPI 加速属性，无取消回跳风险）；内容溢出由壳体
            overflow-hidden 裁剪；contain:layout 把弹簧逐帧 reflow 的失效范围
            圈在本盒内部（帧预算从整页降到面板盒） */}
        <motion.div
          className="relative"
          style={{ contain: "layout" }}
          initial={false}
          animate={{ height: phase === "open" ? openH : 0 }}
          transition={
            reduceMotion
              ? { duration: 0 }
              : phase === "open"
                ? motionSpring
                : { duration: 0.22, ease: EXIT_EASE }
          }
        >
          {/* 互切拉伸律：内建玻璃卡 open 相位恒挂载（互切不重挂=同一张玻璃）；
              内容层 key=session+panel 换装重挂——旧内容同帧卸载（零残留结构性
              保证），新内容播 .cl-panel-content 模糊聚拢淡入。测高 ref 挂 keyed
              内容层（RO 只测真实内容高）；玻璃卡 h-full 满窗（卡高=壳体动画值）。
              律保留：内容层在玻璃卡内部（后代 opacity 不触磨砂采样链），
              p-4 在内容层（关闭按钮包含块矩形逐像素等位）。 */}
          {displayPanel != null && phase !== "closed" && (
            <div className="flow-root h-full">
              <div
                className="glass-card cl-panel panel-rise relative h-full rounded-2xl shadow-2xl"
                data-panel={displayPanel}
              >
                {/* panel-rise 上卡本体（仅挂载帧播：首开/部件→内建互切；互切不重挂
                    不重播=玻璃恒定）；关闭经 .panel-sink .cl-panel animation:none
                    材质冻结 + 高度盒归零（材质恒定律，见文件头）。 */}
                <div
                  key={`${session}-${displayPanel}`}
                  ref={measureRef}
                  className="cl-panel-content relative p-4"
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

                  <header className="mb-3 flex items-center justify-between px-1 pr-7">
                    <h2 className="text-xs font-normal tracking-[0.22em] text-zinc-500 dark:text-zinc-400">
                      {PANEL_TITLES[displayPanel]}
                    </h2>
                  </header>

                  {displayPanel === "weather" && (
                    <WeatherPanel weather={weather} place={place} onPlaceChange={onPlaceChange} />
                  )}
                  {displayPanel === "todo" && <TodoPanel todos={todos} setTodos={setTodos} />}
                  {displayPanel === "note" && <NotePanel note={note} onCommit={commitNote} />}
                  {displayPanel === "pomodoro" && (
                    <PomodoroPanel settings={settings} onPatch={patchSettings} />
                  )}
                  {displayPanel === "settings" && (
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
                </div>
              </div>
            </div>
          )}
        </motion.div>

        {/* ---------- dock 部件视图（常驻预热 overlay）----------
         * 与高度盒同壳（壳体 overflow-hidden 裁剪），absolute 高度自报，
         * 高度盒目标高度 = 部件自报高度，同高同弹簧；iframe 节点随页面常驻
         * （沙箱 srcdoc 只注入一次），SMTC 订阅/封面/歌词后台持续更新——
         * 打开零白屏、零重载。激活重播 .content-focus-solid（模糊聚拢）；
         * 切走同帧 opacity 0（零残留律）、关闭由壳体
         * .panel-sink 级联散场——与内建同语言。 */}
        {dockWidgets.map((w) => {
          const isActive = phase !== "closed" && dockWidgetOpen === w.key;
          const h = Math.max(WIDGET_H_MIN, Math.round(widgetHeights[w.key] ?? w.height));
          /* 视图存活判定（显隐与散场豁免共用）：active / 部件会话收场可见，
             其余（内建会话收场 / closed / 非激活部件）硬藏 */
          const viewLive =
            isActive ||
            (phase === "closing" &&
              activeView?.kind === "widget" &&
              activeView.key === w.key);
          return (
            <div
              key={w.key}
              data-widget={w.key}
              aria-hidden={!isActive}
              role={isActive ? "dialog" : undefined}
              aria-label={w.name}
              ref={(el) => {
                if (el) widgetViewRefs.current.set(w.key, el);
                else widgetViewRefs.current.delete(w.key);
              }}
              className="cl-dockwidget content-focus-solid"
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                /* 互切底锚律：窗口高 s≤部件高 h（首开/收折全程）top=0——顶边骑
                   窗口顶边（与内建 h-full 玻璃卡同语言，开/关动画逐帧不变）；
                   窗口高 s>h（内建→部件互切收折段）top=s-h——部件卡即帧贴住
                   dock 底锚、窗口顶边收下来贴合，根除「卡底悬空下降」的底部
                   收缩观感。max() 纯 CSS 每帧随壳体动画高度重新解析，零 JS 同步 */
                top: `max(0px, calc(100% - ${h}px))`,
                height: h,
                /* v8.7.1 显隐换构：visibility → opacity——visibility:hidden 会在
                   重激活时丢合成层栅格缓存（Chromium 旧层树白帧，白罩常开态的
                   成因）；opacity 常驻合成树，重激活零重栅格化 = 白帧结构性
                   不存在，互切弹簧全程内容可见（㊴）。opacity:0 +
                   pointer-events:none 等价不可见；viewLive 三条件 = active /
                   部件会话收场归属（内建会话收场不再被陈旧键误点亮） */
                opacity: viewLive ? 1 : 0,
                /* 散场豁免（v8.7.1）：panel-sink 级联的 content-defocus
                   （opacity 1→0 动画）会覆盖 inline opacity——非存活视图若不
                   豁免，内建会话收场时散场动画把 inline opacity:0 复活为
                   1→0 的 160ms 淡出 = 幽灵叠印回归（visibility 时代
                   visibility:hidden 硬藏优先于动画；换构 opacity 后必须显式
                   豁免）。存活视图正常播散场与 content-focus-solid 激活聚拢 */
                animation: viewLive ? undefined : "none",
                pointerEvents: isActive ? "auto" : "none",
                ["--boot-bg" as string]: isDark ? "rgba(24,24,28,1)" : "rgba(255,255,255,1)",
              }}
            >
              <iframe
                ref={(el) => {
                  widgetFrameSet(w.key, el);
                }}
                src={sandboxWidgetSrc()}
                onLoad={() => {
                  /* 白帧罩一次性揭幕（v8.7.1）：srcdoc 加载完成即挂 boot-fade
                     （280ms 驻留+180ms 揭开，forwards 保持揭开态）——加载保护
                     与激活逻辑解耦：互切重激活时罩子早已揭开，弹簧全程内容
                     可见（㊴）；极速点击（onLoad 未到）时基态罩仍盖着加载
                     白屏，onLoad 后揭开，保护语义不破 */
                  widgetViewRefs.current.get(w.key)?.classList.add("boot-fade");
                  postToWidget(w.key, {
                    type: "renderWidget",
                    key: w.key,
                    html: w.html,
                    theme: themeRef.current.isDark ? "dark" : "light",
                    accent: themeRef.current.accent,
                    /* dock 表面部件以面板形态渲染：沙箱置 dataset.panel，
                       部件据此直开展开卡并把收起键映射为 chushi.close() */
                    panelMode: true,
                  });
                }}
                title={`初始 dock 面板：${w.name}`}
                className="block border-0 bg-transparent"
                style={{ width: "100%", height: "100%" }}
                sandbox="allow-scripts"
              />
            </div>
          );
        })}
      </motion.div>
    </div>
  );
});

export default PanelStage;
