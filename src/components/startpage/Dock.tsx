"use client";

/* 「初始」— 底部 Dock（beta 重写架构）
 *
 * 结构：nav 栏（按钮 + 常驻选框）+ PanelStage（面板统一舞台，见 PanelStage.tsx）。
 * 数据/动作经 useStartPage() 上下文取得（不再 24 条 prop 钻孔）。
 *
 * 选框三段动效语言（v8.1.2 单实例化定案）：
 *  · 出场：无面板 → 打开面板时 Q 弹原地 pop（POPPING）；
 *  · 切换：面板间切换 = 同一元素 x/width 弹簧纯滑移（任意点击速度零交接零泵动
 *    ——旧「各按钮内条件挂载 + layoutId 交接」会让新选框继承旧选框退场中的
 *    scale/opacity 投影，快速连点时反复缩小淡出泵动）；
 *  · 关闭：缩回淡出。
 * 450ms 切换窗口（PILL_SWITCH_WINDOW_MS）：面板刚关闭的退场动画内快开另一
 * 功能，延续「切换」语言从旧位滑移，不重播 Q 弹出场。
 */

import { useCallback, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  CsCheckSquare,
  CsCloudSun,
  CsCommand,
  CsNotebookPen,
  CsSettings2,
  CsTimer,
} from "./cs-icons";
import WeatherGlyph from "./WeatherGlyph";
import PanelStage from "./PanelStage";
/* SettingsPanel 既有 import 面（PresetSettingSection 自 Dock 导入）保持稳定 */
export type { PresetSettingSection } from "./PanelStage";
import { readLS } from "@/hooks/use-start";
import { dockIcon } from "@/lib/startpage/preset";
import { weatherText } from "@/lib/startpage/weather";
import { useStartPage } from "@/app/startpage/startpage-context";
import {
  EASE,
  EXIT_EASE,
  MOTION_PROFILES,
  PILL_SWITCH_WINDOW_MS,
  POPPING,
  type MotionProfile,
} from "./dock-motion";
import { POMO_KEY, subscribePomo, type PomoRuntime } from "./PomodoroPanel";
import type { PanelId } from "@/lib/startpage/types";

/* ---------- dock 番茄钟倒计时（订阅 localStorage 运行时 + 每秒滴答） ----------
   tab 栏只显示分钟，不显示秒：向上取整（首分钟内仍计满额） */
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

function Dock() {
  const sp = useStartPage();
  const panel = sp.panel;
  const dockWidget = sp.dockWidget;

  const motionSpring = MOTION_PROFILES[sp.motionProfile as MotionProfile] ?? MOTION_PROFILES.standard;
  const undone = sp.todos.filter((t) => !t.done).length;

  /* 选框出场只在「无面板 → 打开面板」时播 Q 弹；面板间切换时选框从旧按钮位置
     纯滑移（基线 v1.1.x 手感）。渲染期同步 prevPanel（React 官方「渲染期间调整
     state」模式）。面板刚关闭（≤450ms 窗口）快速点开另一个功能，此刻应延续
     「切换」语言（从旧位置纯滑移），不重播 Q 弹出场；dock 部件开着时切到内建
     面板也算「切换」。 */
  const prevPanelRef = useRef<PanelId>(null);
  const prevWidgetOpenRef = useRef<string | null>(dockWidget);
  /** 最近一次面板关闭时刻（switchTo(null) / closePanel / 部件关闭 统一记录） */
  const lastCloseRef = useRef(0);
  const pillPop =
    panel != null &&
    prevPanelRef.current == null &&
    prevWidgetOpenRef.current == null &&
    Date.now() - lastCloseRef.current > PILL_SWITCH_WINDOW_MS;
  /* 选框晚一帧挂载（等几何测量），此时 prevPanelRef 已同步完成——
     pillPop 直接重算会误判为 false（Q 弹出场丢失）。跃迁帧捕获：
     仅在 panel/部件态发生变化的渲染帧捕获一次 pillPop，选框挂载帧读取捕获值 */
  const pillPopRef = useRef(false);
  if (prevPanelRef.current !== panel || prevWidgetOpenRef.current !== dockWidget) {
    pillPopRef.current = pillPop;
  }
  if (prevPanelRef.current !== panel) prevPanelRef.current = panel;
  if (prevWidgetOpenRef.current !== dockWidget) prevWidgetOpenRef.current = dockWidget;

  /* ---- 常驻选框：几何测量（active 按钮相对 nav padding 缘） ---- */
  const reduceMotion = useReducedMotion();
  const navRef = useRef<HTMLElement | null>(null);
  const btnRefs = useRef(new Map<string, HTMLButtonElement>());
  const registerBtn = useCallback(
    (id: string) => (el: HTMLButtonElement | null) => {
      if (el) btnRefs.current.set(id, el);
      else btnRefs.current.delete(id);
    },
    []
  );
  const [pillBox, setPillBox] = useState<{ x: number; w: number } | null>(null);
  /** 最近一次选框盒（关闭后保留）——450ms 内快开另一功能时从旧位滑移 */
  const pillPrevBoxRef = useRef<{ x: number; w: number } | null>(null);
  const activeId: string | null = panel ?? (dockWidget ? `widget:${dockWidget}` : null);
  /* 徽标/番茄分钟数宽度动画期间逐帧跟随；窗口缩放/字体就绪由 nav RO 兜底。
     无依赖数组：每次渲染后重测（原始实现同款） */
  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const measure = () => {
      const btn = activeId != null ? btnRefs.current.get(activeId) : null;
      if (!btn) {
        setPillBox((p) => (p == null ? p : null));
        return;
      }
      const x = btn.offsetLeft;
      const w = btn.offsetWidth;
      setPillBox((p) =>
        p && Math.abs(p.x - x) < 0.5 && Math.abs(p.w - w) < 0.5 ? p : { x, w }
      );
      pillPrevBoxRef.current = { x, w };
    };
    measure();
    const ro = new ResizeObserver(measure);
    const btn = activeId != null ? btnRefs.current.get(activeId) : null;
    if (btn) ro.observe(btn);
    ro.observe(nav);
    return () => ro.disconnect();
  });

  /* dock 番茄钟：运行中或暂停中在按钮旁显示剩余分钟 + 呼吸灯 */
  const pomoText = useSyncExternalStore(subscribePomo, getPomoSnapshot, () => null);
  const pomoRunning = useSyncExternalStore(subscribePomo, getPomoRunning, () => false);

  /* 面板互切只有淡切一条路径。
     ⚠ 挂载后一帧内的二次渲染会让 framer-motion v12 layout 投影重测量并把卡片
     transform 重置为 none（面板失去居中），已用二分法实证——任何面板相关状态
     都不可在挂载后再补一帧回写。
     打开内建面板时同批清掉 dock 部件——单帧批量切换（gotoPanel 已含互斥）。 */
  function switchTo(p: PanelId) {
    if (p == null) lastCloseRef.current = Date.now();
    sp.setPanel(p);
    if (p != null) sp.closeDockWidget();
  }

  /* 面板关闭统一入口：稳定引用传给 PanelStage（memo 前提） */
  const closePanel = useCallback(() => {
    lastCloseRef.current = Date.now();
    sp.setPanel(null);
  }, [sp.setPanel]);

  return (
    <>
      {/* 关闭遮罩：纯点击捕获层（无视觉），不做任何动画——隐形 div 上的
          纯 WAAPI 开销已退役；卸载时机随 panel 状态即时切换。
          dock 弹出面板与内建面板互斥，同一时刻至多一个遮罩存在 */}
      {(panel || dockWidget) && (
        <div
          className="fixed inset-0 z-30"
          onClick={() => (panel ? switchTo(null) : sp.closeDockWidget())}
          aria-hidden
        />
      )}

      <nav
        ref={navRef}
        aria-label="快捷操作"
        className="glass-pill backdrop-blur-2xl backdrop-saturate-150 dock-intro zen-dock cl-dock fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-1/2 z-40 flex -translate-x-1/2 items-center gap-0.5 rounded-full p-1.5 shadow-lg"
      >
        {/* 常驻选框（单实例，首子元素 → 按钮内容绘制其上；pointer-events-none
            不拦点击）。x/width 弹簧承担切换滑移——同一元素动画，任意连点速度
            零交接；出场：真首次开面板 Q 弹原地 pop；≤450ms 快开另一功能从旧位
            滑移（切换语言） */}
        <AnimatePresence>
          {activeId != null && pillBox != null && (
            <motion.span
              key="dock-pill"
              initial={
                reduceMotion
                  ? false
                  : pillPopRef.current
                    ? { opacity: 0, scale: 0.6, x: pillBox.x, width: pillBox.w }
                    : Date.now() - lastCloseRef.current <= PILL_SWITCH_WINDOW_MS &&
                        pillPrevBoxRef.current
                      ? {
                          opacity: 1,
                          scale: 1,
                          x: pillPrevBoxRef.current.x,
                          width: pillPrevBoxRef.current.w,
                        }
                      : false
              }
              animate={{ opacity: 1, scale: 1, x: pillBox.x, width: pillBox.w }}
              exit={{
                opacity: 0,
                scale: 0.6,
                transition: { duration: 0.16, ease: EXIT_EASE },
              }}
              transition={{
                x: sp.motionProfile === "playful" ? POPPING : MOTION_PROFILES.standard,
                width: sp.motionProfile === "playful" ? POPPING : MOTION_PROFILES.standard,
                opacity: POPPING,
                scale: POPPING,
              }}
              className="pointer-events-none absolute inset-y-1.5 left-0 rounded-full bg-[var(--pill-seg)] ring-1 ring-[color:var(--pill-seg-ring)]"
              aria-hidden
            />
          )}
        </AnimatePresence>

        {/* 天气 */}
        <DockButton
          btnId="weather"
          registerRef={registerBtn}
          active={panel === "weather"}
          label={
            sp.weather.temp != null
              ? `${sp.weather.temp}° ${weatherText(sp.weather.code)}`
              : "天气"
          }
          onClick={() => switchTo(panel === "weather" ? null : "weather")}
          presetIcon={sp.presetIcons.weather}
        >
          {sp.presetIcons.weather ? (
            <PresetGlyph spec={sp.presetIcons.weather} />
          ) : sp.weather.code != null ? (
            <WeatherGlyph code={sp.weather.code} size={16} />
          ) : (
            <CsCloudSun className="h-[17px] w-[17px]" strokeWidth={1.5} />
          )}
          {sp.weather.temp != null && (
            <span className="ml-1 tabular-nums text-xs">{sp.weather.temp}°</span>
          )}
        </DockButton>

        <Divider />

        {/* 待办 */}
        <DockButton
          btnId="todo"
          registerRef={registerBtn}
          active={panel === "todo"}
          label="待办"
          badge={undone > 0 ? undone : undefined}
          onClick={() => switchTo(panel === "todo" ? null : "todo")}
          presetIcon={sp.presetIcons.todo}
        >
          {sp.presetIcons.todo ? (
            <PresetGlyph spec={sp.presetIcons.todo} />
          ) : (
            <CsCheckSquare className="h-[17px] w-[17px]" strokeWidth={1.5} />
          )}
        </DockButton>

        {/* 便签 */}
        <DockButton
          btnId="note"
          registerRef={registerBtn}
          active={panel === "note"}
          label="便签"
          onClick={() => switchTo(panel === "note" ? null : "note")}
          presetIcon={sp.presetIcons.note}
        >
          {sp.presetIcons.note ? (
            <PresetGlyph spec={sp.presetIcons.note} />
          ) : (
            <CsNotebookPen className="h-[17px] w-[17px]" strokeWidth={1.5} />
          )}
        </DockButton>

        {/* 番茄钟：分钟旁呼吸灯——计时中闪动，暂停时常亮；
            数字 digit-slot 必须带 overflow-hidden（盒底=基线模型前提）+ leading-none，
            否则墨迹悬低 */}
        <DockButton
          btnId="pomodoro"
          registerRef={registerBtn}
          active={panel === "pomodoro"}
          label={pomoText ? `番茄钟 剩余 ${pomoText} 分钟` : "番茄钟"}
          onClick={() => switchTo(panel === "pomodoro" ? null : "pomodoro")}
          presetIcon={sp.presetIcons.pomodoro}
        >
          {sp.presetIcons.pomodoro ? (
            <PresetGlyph spec={sp.presetIcons.pomodoro} />
          ) : (
            <CsTimer className="h-[17px] w-[17px]" strokeWidth={1.5} />
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
                  {/* digit-slot 构造性居中：overflow:hidden 令盒底=基线 + leading-none
                      令内行盒=1em，墨迹中心即落在盒心（同 Clock 烤定值）；二者缺一
                      模型即失效；prime 用自绘竖线，不参与字体度量 */}
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
        <DockButton
          active={false}
          label="指令 ⌘K"
          onClick={sp.openPalette}
          presetIcon={sp.presetIcons.command}
        >
          {sp.presetIcons.command ? (
            <PresetGlyph spec={sp.presetIcons.command} />
          ) : (
            <CsCommand className="h-[17px] w-[17px]" strokeWidth={1.5} />
          )}
          <kbd className="pointer-events-none absolute -bottom-9 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-zinc-900/10 bg-white/80 px-1.5 py-0.5 font-sans text-[10px] tracking-wider text-zinc-500 opacity-0 shadow-sm backdrop-blur transition-opacity duration-300 group-hover:opacity-100 sm:block dark:border-white/10 dark:bg-[#17171c]/90 dark:text-zinc-400">
            ⌘K
          </kbd>
        </DockButton>

        <Divider />

        {/* 设置 */}
        <DockButton
          btnId="settings"
          registerRef={registerBtn}
          active={panel === "settings"}
          label="设置"
          onClick={() => switchTo(panel === "settings" ? null : "settings")}
          presetIcon={sp.presetIcons.settings}
        >
          {sp.presetIcons.settings ? (
            <PresetGlyph spec={sp.presetIcons.settings} />
          ) : (
            <CsSettings2 className="h-[17px] w-[17px]" strokeWidth={1.5} />
          )}
        </DockButton>

        {/* 预设注册的 tab 栏按钮（声明式，来自已安装预设） */}
        {sp.presetDock.length > 0 && <Divider />}
        {sp.presetDock.map((d) => {
          const Icon = dockIcon(d.icon);
          return (
            <DockButton
              key={d.key}
              active={false}
              label={d.title}
              onClick={() => sp.runPresetAction(d.action)}
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

        {/* dock 表面预设小部件：点击开/关 dock 上方的弹出面板 */}
        {sp.presetDockWidgets.length > 0 && <Divider />}
        {sp.presetDockWidgets.map((w) => (
          <DockButton
            key={w.key}
            btnId={`widget:${w.key}`}
            registerRef={registerBtn}
            active={dockWidget === w.key}
            label={w.name}
            onClick={() => {
              /* 部件关闭也记录 lastClose（450ms 切换窗口内快开内建面板不重播 Q 弹） */
              if (dockWidget === w.key) lastCloseRef.current = Date.now();
              sp.toggleDockWidget(w.key);
            }}
          >
            {w.icon ? (
              <PresetGlyph spec={w.icon} />
            ) : (
              <span className="flex h-4 w-4 items-center justify-center rounded-full border border-current text-[9px] leading-none opacity-80">
                {w.name[0]}
              </span>
            )}
          </DockButton>
        ))}
      </nav>

      <PanelStage
        panel={panel}
        onClose={closePanel}
        weather={sp.weather}
        place={sp.place}
        onPlaceChange={sp.setPlace}
        todos={sp.todos}
        setTodos={sp.setTodos}
        note={sp.note}
        commitNote={sp.commitNote}
        settings={sp.settings}
        patchSettings={sp.patchSettings}
        exportData={sp.exportData}
        importData={sp.importData}
        resetAll={sp.resetAll}
        presetSettingSections={sp.presetSettingSections}
        onPresetSettingChange={sp.changePresetSetting}
        motionSpring={motionSpring}
        dockWidgets={sp.presetDockWidgets}
        dockWidgetOpen={dockWidget}
        widgetHeights={sp.widgetHeights}
        isDark={sp.isDark}
        accent={sp.settings.accent}
      />
    </>
  );
}

function Divider() {
  /* dock-divider 纳入 dock-btn-in 同拍凝入通道（globals.css）——
     裸 span 第 0 帧满值，分割线先于按钮/玻璃抢跑入场 */
  return <span aria-hidden className="dock-divider mx-1 h-5 w-px bg-[var(--pill-line)]" />;
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
  btnId,
  registerRef,
}: {
  children: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  badge?: number;
  /** 预设图标覆写：存在时本按钮的 active 选框仍由宿主渲染（图标只换字形） */
  presetIcon?: string;
  /** 常驻选框：active 按钮由宿主 nav 级选框测量定位，本按钮只上报 ref */
  btnId?: string;
  registerRef?: (id: string) => (el: HTMLButtonElement | null) => void;
}) {
  return (
    <button
      type="button"
      ref={btnId && registerRef ? registerRef(btnId) : undefined}
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

export default Dock;
