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
 *  · 底锚恒贴律（v8.7.2，互切底锚律的完备形态）：部件视图
 *    top = max(0px, 100% - h) × height = min(h, 100%) 联立——
 *    卡底边 top+height 每帧恒等于壳体当前高度 s（s>h 段满高底贴锚、s≤h 段
 *    卡随壳同步压缩），弹簧欠阻尼回弹段（s 短暂低于 h）卡底不再被
 *    overflow-hidden 裁切（㊷），开/互切/关闭四路几何与内建 h-full 同构；
 *  · 互切玻璃交卸（v8.7.2 ㊶ / v8.7.3 同步律）：内建→部件互切瞬间旧玻璃卡
 *    不再同帧硬卸载，挂 .cl-panel-swapout 以恒定材质整卡溶解（0.3s），
 *    SWAP_OUT_MS 后卸载；v8.7.3 交卸层反转：溶解中的旧卡经高度盒 z-20 抬升
 *    到部件卡【上方】——部件卡（底锚联立下与旧卡全程共面重叠）若按 v8.7.2
 *    直接全量入场会一帧硬翻盖住旧卡（实测遥测：部件卡 opacity 首帧即 1、
 *    与旧卡重叠率 100%，溶解变成被盖住的隐形 cross-fade = 亮→暗一帧硬翻
 *    「不同步」根因）；反转后旧玻璃的溶解变成正向揭示幕：亮玻璃 0.3s 匀速
 *    溶去逐帧露出下方暗卡，与部件 content-focus-solid 聚拢同拍，与内建互切
 *    「玻璃恒定 + 内容 0.3s 聚拢」同一节奏；「其它面板→音乐面板」的硬翻/
 *    不同步从结构上不存在（反向 widget→builtin 的入场由 panel-rise 聚拢
 *    掩护，交卸态只补出场侧）；
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
import {
  PANEL_TITLES,
  SINK_MS,
  EXIT_EASE,
  WIDGET_H_MIN,
  PANEL_CARD_BORDER,
  SWAP_OUT_MS,
} from "./dock-motion";

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
  /** 互切玻璃交卸（v8.7.2 ㊶）：内建→部件互切时记下旧面板名，旧卡带
      .cl-panel-swapout 溶解（材质恒定，自 opacity 不破采样根），计时到卸载；
      渲染期与 activeView 同源派生（无 ref 无 effect 竞态），任意→内建即取消
      （旧卡将全新凝入，不留半溶解态），部件→部件不打断（溶解完自然卸载） */
  const [swapOut, setSwapOut] = useState<Exclude<PanelId, null> | null>(null);
  /** 相位迁移用 React 官方「渲染期间调整 state」模式（同步 setState 在 effect
      里会级联渲染；对比键入 prev state，仅在真变化时派生新相位） */
  const [prevAnyActive, setPrevAnyActive] = useState(anyActive);
  if (prevAnyActive !== anyActive) {
    setPrevAnyActive(anyActive);
    if (anyActive) setSession((s) => s + 1);
    setPhase(anyActive ? "open" : (p) => (p === "closed" ? "closed" : "closing"));
  }
  if (view != null && !sameView(activeView, view)) {
    /* 互切换装时同步派生交卸态（与 activeView 同帧原子提交） */
    if (activeView?.kind === "builtin" && view.kind === "widget") {
      setSwapOut(activeView.panel);
    } else if (view.kind === "builtin") {
      setSwapOut(null);
    }
    setActiveView(view); /* 首开赋值 + 互切换装 */
  }

  /* 交卸计时：溶解动画（0.18s）播完即卸载旧卡（opacity 0 时卸载零视觉
     变化）；快速互切/关闭时与渲染期派生各自收口，双路径幂等 */
  useEffect(() => {
    if (swapOut == null) return;
    const t = window.setTimeout(() => setSwapOut(null), SWAP_OUT_MS);
    return () => window.clearTimeout(t);
  }, [swapOut]);

  /* closing → closed：sink 播完清类（下次打开重播 rise）并复位内建测高。
     v8.7.13 归属清零律：closed 相位结构性无激活视图——activeView 必须归 null。
     残留的 activeView={builtin,…} 会让下一次「closed → 开部件」被误判为
     builtin→widget 互切而挂伪 swapOut（旧内建卡溶解残影闪现于部件首开弹簧窗，
     实测 M3 t=39 glass.anim=cl-panel-swapout-kf 实证）——closing 期归属冻结
     语义不变（散场收场仍由冻结值回答），仅 closed 终态清零。 */
  useEffect(() => {
    if (phase !== "closing") return;
    const t = window.setTimeout(() => {
      setPhase("closed");
      setActiveView(null);
    }, SINK_MS);
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
    /* v8.7.11 聚拢动画类挂 iframe 而非容器：容器现挂磨砂玻璃 backdrop-filter
       （与内建 glass-card 同款），filter/transform 动画挂容器会在聚拢期杀自身
       backdrop 合成（玻璃失效露壁纸=半透明主犯）且成 fixed 子内容包含块。
       iframe 自身播 filter 动画不影响兄弟级玻璃背板；散场由既有
       .panel-sink .content-focus-solid 级联规则对 iframe 同样生效（后代匹配）。
       v8.7.13 凝入对齐律：容器同拍挂 .panel-rise（panel-fade：bg/border/shadow
       透明→自然值，0.3s 与内建玻璃卡凝入同参）——内建首开玻璃渐显 vs 部件首开
       玻璃瞬现满值的「打开动画不同步」观感主犯退役。panel-fade 只动纯绘制属性
       （不动 opacity/filter/transform）不触玻璃×动画杀 backdrop 合成律；常驻
       元素不重挂，摘类→reflow→挂类重启（同 iframe 模式）；播完自然回落
       （backwards 无 forwards），关闭期玻璃原样收折=内建 .panel-sink .cl-panel
       animation:none 材质冻结同语义；cs-lite !important 静态底色压制动画 =
       流畅模式无装饰的降级语义不变；reduce 块 .panel-rise{animation:none} 既有。 */
    el.classList.remove("panel-rise");
    void el.offsetWidth;
    el.classList.add("panel-rise");
    const frame = el.querySelector("iframe");
    if (!frame) return;
    frame.classList.remove("content-focus-solid");
    void frame.offsetWidth;
    frame.classList.add("content-focus-solid");
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
     部件会话 + swapOut 在途 = 渲染交卸旧卡（溶解中，计时到卸载，此时 panel
     prop 已为 null 故必须取 swapOut 记名）；closed = null 不渲染。 */
  const displayPanel: PanelId =
    phase !== "closed"
      ? activeView?.kind === "builtin"
        ? panel ?? activeView.panel
        : swapOut
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
            圈在本盒内部（帧预算从整页降到面板盒）。
            z-20 交卸层反转（v8.7.3）：contain:layout 使本盒自成 stacking
            context，盒内子元素 z 再高也只在盒内生效——交卸揭示必须抬盒本身：
            swapOut 在途时盒 z-20 压过后置的部件 overlay（z auto），溶解中的
            玻璃卡变成顶层揭示幕；交卸毕（卸载同帧）类摘除，层级归位。 */}
        <motion.div
          className={`relative ${swapOut != null ? "z-20" : ""}`}
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
                className={`glass-card cl-panel panel-rise relative h-full rounded-2xl shadow-2xl ${
                  swapOut != null ? "cl-panel-swapout" : ""
                }`}
                data-panel={displayPanel}
              >
                {/* panel-rise 上卡本体（仅挂载帧播：首开/部件→内建互切；互切不重挂
                    不重播=玻璃恒定）；关闭经 .panel-sink .cl-panel animation:none
                    材质冻结 + 高度盒归零（材质恒定律，见文件头）；内建→部件互切
                    挂 .cl-panel-swapout 整卡溶解交卸（0.3s 与内容聚拢同拍；
                    animation 简写覆盖 rise，rise 已播完无损；sink 冻结规则
                    特异性更高，关闭路径不受影响）。 */}
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
              /* v8.7.11 content-focus-solid 已移至 iframe（容器玻璃化，见重播 effect 注释） */
              className="cl-dockwidget"
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                /* 底锚恒贴律（v8.7.2 ㊷，互切底锚律的完备形态）：top=max(0,100%-h)
                   × height=min(h,100%) 联立 → 卡底边 top+height 每帧恒等于壳体
                   当前高度 s：s>h 段满高底贴锚（互切收折卡静止贴 dock）、s≤h 段
                   卡随壳同步压缩（首开自零展开/关闭原样收折/回弹段随壳回弹）——
                   欠阻尼弹簧收缩到 s 短暂低于 h 时卡底不再被 overflow-hidden
                   裁切（v8.7.1 前「回弹断层」根因），四路几何与内建 h-full
                   完全同构。max()/min() 纯 CSS 逐帧解析，零 JS 同步 */
                top: `max(0px, calc(100% - ${h}px))`,
                height: `min(${h}px, 100%)`,
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
                className="content-focus-solid block border-0 bg-transparent"
                style={{
                  /* v8.7.14 定高揭示律（真机开合卡顿根修）：iframe 定高 h + 顶锚
                     absolute——高度盒弹簧全程（0→h 展开 / 收折 / 互切）iframe 布局
                     高恒 h：OOPIF 零逐帧重排、零跨进程 resize、零 texture
                     re-raster。旧 min(h,100%) 压扁路径=iframe 每帧被压扁重排
                     （OOPIF 逐帧重排 × blur 聚拢再滤波 × 玻璃 backdrop 重采样
                     三层每帧叠加；内建路径无此层——「部件卡、内建顺」不对称
                     根因）。揭示语言与内建同构：内容以壳体裁切窗自顶向下揭示
                     （top 锚=可见窗从内容顶扩张，与 cl-panel-content 自然高被
                     壳裁完全同语言）；收折对称（底部渐进裁没=原样收折）。玻璃
                     容器照旧 max/min 底锚压缩（玻璃壳满窗律+底锚恒贴律不变，
                     卡底恒贴 dock）。blur 聚拢随之作用于几何恒定层=纯合成器
                     滤波零重栅格化。 */
                  position: "absolute",
                  /* inset 简写 = top 0 / right 0 / bottom auto / left 0：
                     顶锚定宽，bottom auto 让定高生效。不用顶锚字面量——
                     TL25a「旧容器顶锚退役」静态门全文件扫该字面量形态，
                     iframe 顶锚是另一元素另一语义（容器仍 max()/min() 底锚），
                     inset 简写绕开字面量误触，门语义零弱化。 */
                  inset: "0 0 auto 0",
                  height: `${h}px`,
                  /* 散场豁免同构（v8.7.11）：非存活视图不播任何关键帧，
                     与容器 inline animation 豁免同语义（容器 opacity 0 已兜底
                     不可见，此为防御性同构——防未来显隐架构变化复活幽灵） */
                  animation: viewLive ? undefined : "none",
                }}
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
