"use client";

/* 「初始」— 待办/便签常驻磁贴（v8.7.105 引入，v8.7.106 拖拽化）。
 *
 * 用户指令：把待办/便签的内容变成磁贴常驻在「初始」页面里，出现/消失
 * 动画要高雅，刷新页面时要有入场动画。
 * v8.7.106 用户澄清：支持自由拖拽的是【常驻磁贴本体】（浮窗开关固定在
 * 面板关闭按钮左侧，见 PinTileFab）——磁贴位置自由拖拽，但不能拖进
 * 快捷服务磁贴区域（常驻模式开启时）、搜索框、时间等区域；拖进禁区
 * 就回弹到拖拽前位置（动画与快捷服务磁贴的拖拽动画一致）。
 *
 * 默认位置：视口左下（待办）/ 右下（便签），Dock 上方两侧的空白带——
 * 不占快捷服务磁贴墙、不碰搜索框/时钟；合法拖拽落点钉位持久化
 * （v8.7.123 起 settings.pinTile，随账号云同步跨设备跟随；
 *   v8.7.105~121 存 localStorage start:pintile-todo/note，本版随存储域
 *   重置退役——旧键孤儿由一次性迁移接管），刷新后仍在。
 *
 * 动画（磨砂存活律三层拆分，与磁贴墙 intro 同语言）：
 *   · 外层 motion.div 只动 transform（y/scale）——升起/落座，绝不携带
 *     opacity/filter（祖先 opacity<1 / filter≠none 会成为 backdrop root，
 *     令 .glass-card 的磨砂整体失效，v8.6.1 用户实测律）；
 *   · 拖拽层（v8.7.106）同样是 transform-only 包裹（x/y motion value
 *     直写）——拖拽全程磨砂在线；
 *   · 内容层单独动 opacity + blur（模糊聚拢/散场）——内容层内无任何
 *     backdrop-filter 后代，零毒；
 *   · 出现 = 磁贴上浮 16px + 缩放 0.92 + 内容 8px 模糊聚拢（0.5s 减速曲线）；
 *     消失 = 反向散场（0.32s）；刷新入场 = 同出现动画 + 0.55s 错拍延迟
 *     （等磁贴墙入场过半，整页动效一气呵成）。
 * 禅模式：外层挂 .zen-gone（visibility+transform 零毒通道，globals.css）。
 *
 * v8.7.148 用户指令：待办浮窗磁贴加可交互——点击磁贴里的待办即可「划掉」
 * （标记完成）：行级按钮化 + 划线动画（.strike 与面板同语言）+ 计数徽标
 * 即时随 pending 数变化；划掉的条目带划线样式驻留 1.1s 再优雅退场，
 * 驻留期内再点可反悔（恢复未完成）；拖拽 4px 容差与拖后 300ms 吞
 * click 两律对行级点击同样生效——按住行上拖磁贴不误划，落点合法重钉。
 * 存量修复（真扩展冒烟实证）：v8.7.106 起 pointerdown 即 setPointerCapture
 * 会把点按的 pointerup/click 重定向到拖拽宿主——磁贴本体的 click 从未
 * 到达过本体按钮，「点磁贴开面板」一直处于失效态（用户都走 Dock 入口
 * 未察觉）；现 click 统一收口在宿主一层：capture 重定向流（target=宿主）
 * 用 elementFromPoint 还原真实落点，键盘流（target=真实元素）直接用
 * target——行级→划掉切换，磁贴本域→开面板（便签磁贴同批修复）。
 *
 * v8.7.149 用户三项实测反馈：
 * ①划掉不消失——划掉的条目带划线永久驻留磁贴，待办面板里把该条删除
 *   后才从磁贴退场（v8.7.148 的 LINGER_MS 1.1s 驻留退场退役）；行按
 *   todos 原序渲染：done 全收 + pending 前 4，划掉原地划线不动位。
 * ②拖动重放根修——落座重钉 setSaved 触发的 render 会让 layout 行把
 *   「磁贴搬家」误判为行位移（拖拽 a→b 后行内容重放一次 a→b 移动动画）。
 *   framer-motion 测量仅在 willUpdate（dependency 变化）时发生，故行与
 *   磁贴本体的 layoutDependency 统一锁在 {todos, exitTick} 引用上：
 *   todos 未变的 render（拖拽落座/resize clamp）跳过测量直接吸收新 box，
 *   todos 变化的 render（划掉/增/删）才测量播放。
 * ③磁贴高度拉伸——待办/便签磁贴本体升级 motion 组件挂 layout（同一
 *   dependency 锁），行增删/便签内容变化时高度平滑拉伸过渡（framer
 *   layout 动画纯 transform 通道，磨砂存活律零毒）；删除行的 exit 完成
 *   卸载阶段 props 引用已稳定，onExitComplete 递增 exitTick 并入
 *   dependency 补一次测量，磁贴收缩/兄弟行上移不丢动画。
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, animate, motion, useMotionValue } from "framer-motion";
import { CheckSquare, StickyNote } from "lucide-react";
import type { PanelId, PinTilePos, TodoItem } from "@/lib/startpage/types";

const EASE = [0.22, 1, 0.36, 1] as const;

/** 外层升降弹簧/补间：transform-only（磨砂存活律） */
const RISE = { duration: 0.5, ease: EASE };
const SINK = { duration: 0.32, ease: [0.5, 0, 0.3, 1] as const };
/** 内容层模糊聚拢（opacity+filter，无磨砂后代零毒） */
const FOCUS = { duration: 0.55, ease: EASE };

/** 快捷服务磁贴拖拽让位同款弹簧（用户指令：回弹动画一致） */
const LAYOUT_SPRING = { type: "spring" as const, stiffness: 420, damping: 41, mass: 0.9 };
/** 拖拽判定容差（px）：4px 内仍是点击（浮窗开关同律） */
const DRAG_SLOP = 4;
/* v8.7.149：v8.7.148 的 LINGER_MS 驻留退场退役——划掉条目永久驻留磁贴，
   待办面板里删除该条才消失（用户指令）；磁贴 pending 行数上限仍 4 条。 */

const POS_KEY = { todo: "start:pintile-todo", note: "start:pintile-note" } as const;
type PinKey = keyof typeof POS_KEY;

/** 旧 localStorage 钉位一次性迁移（v8.7.123）：settings.pinTile 空位且
 *  旧键有值时接管，旧键随即清掉防双源漂移 */
export function readLegacyPinPos(k: PinKey): { x: number; y: number } | null {
  try {
    const raw = window.localStorage.getItem(POS_KEY[k]);
    if (!raw) return null;
    const j = JSON.parse(raw) as { x?: unknown; y?: unknown };
    if (typeof j?.x === "number" && typeof j?.y === "number") return { x: j.x, y: j.y };
  } catch {
    /* noop */
  }
  return null;
}

export function dropLegacyPinPos(k: PinKey) {
  try {
    window.localStorage.removeItem(POS_KEY[k]);
  } catch {
    /* noop */
  }
}

/* 禁区矩形（浮窗开关同表，v8.7.106 随拖拽一并移交磁贴，4px 容差）：
   时钟（[aria-label="时间与问候"]）、搜索框（.search-pill）、Dock
   （.cl-dock）、快捷服务磁贴墙（[aria-label="快捷链接"]——该标记只在
   常驻形态渲染，抽屉形态磁贴不占页面，磁贴不受限，与用户指令一致）。 */
function forbiddenRects(): DOMRect[] {
  const sels = [
    '[aria-label="时间与问候"]',
    ".search-pill",
    ".cl-dock",
    '[aria-label="快捷链接"]',
  ];
  const out: DOMRect[] = [];
  for (const s of sels) {
    try {
      const el = document.querySelector(s);
      if (el) out.push(el.getBoundingClientRect());
    } catch {
      /* noop */
    }
  }
  return out;
}

/**
 * 常驻磁贴自由拖拽（v8.7.106）：
 *   · 拖拽层 transform-only（x/y motion value 直写，磨砂存活律零毒）；
 *   · pointer capture 全程 1:1 跟手 + 4px 容差区分点击（点击仍开面板）；
 *   · 松手落点与禁区相交 → LAYOUT_SPRING 弹簧回弹拖拽前位（快捷服务
 *     磁贴拖拽同款手感）；合法落点 → 以当前视觉位重钉并持久化；
 *   · 拖后 300ms 吞 click；拖拽中 body.cl-fab-dragging 全局防选中
 *     （类名沿用浮窗时代的全局防选中通道，globals.css 同一条规则）。
 * 返回：x/y 位移、钉位（null=默认锚位）、宿主 ref、pointer 处理器。
 */
function usePinDrag(
  key: PinKey,
  /** 钉位权威值（settings.pinTile?.[key]）：云同步/跨文档 storage 事件到达后自然跟进 */
  savedProp: { x: number; y: number } | null,
  /** 钉位提交（合法落点/resize clamp）：写回 settings 域 */
  commit: (p: { x: number; y: number } | null) => void,
) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const [saved, setSaved] = useState<{ x: number; y: number } | null>(savedProp);
  const hostRef = useRef<HTMLDivElement | null>(null);
  /* 拖拽前视觉左上角（基准位）：回弹目标 = 基准位 = 位移 (0,0) */
  const base = useRef<{ x: number; y: number } | null>(null);
  const drag = useRef({ on: false, moved: false, px: 0, py: 0, upAt: 0 });

  /* 钉位权威值跟随：云同步恢复/换设备/跨文档变更 → 本地状态跟进 */
  useEffect(() => {
    setSaved((cur) => {
      if (savedProp === cur) return cur;
      if (
        savedProp &&
        cur &&
        savedProp.x === cur.x &&
        savedProp.y === cur.y
      )
        return cur;
      return savedProp;
    });
  }, [savedProp]);

  /* 跨设备钉位 clamp（display-only）：云同步来的坐标可能超出本视口
     （别的设备分辨率/窗口更大），hostRef 就绪后把越界坐标收回视口——
     不回写（防多设备互相打点），下次拖拽/resize 落点自然持久化 */
  useEffect(() => {
    if (!saved) return;
    const el = hostRef.current;
    const w = el?.offsetWidth ?? 224;
    const h = el?.offsetHeight ?? 120;
    const np = {
      x: Math.min(Math.max(8, saved.x), Math.max(8, window.innerWidth - w - 8)),
      y: Math.min(Math.max(8, saved.y), Math.max(8, window.innerHeight - h - 8)),
    };
    if (np.x !== saved.x || np.y !== saved.y) setSaved(np);
  }, [saved]);

  const setBodyDragging = (on: boolean) => {
    try {
      document.body.classList.toggle("cl-fab-dragging", on);
    } catch {
      /* noop */
    }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const el = hostRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    base.current = { x: r.left, y: r.top };
    const d = drag.current;
    d.on = true;
    d.moved = false;
    d.px = e.clientX;
    d.py = e.clientY;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d.on || !base.current) return;
    const dx = e.clientX - d.px;
    const dy = e.clientY - d.py;
    if (!d.moved && Math.hypot(dx, dy) <= DRAG_SLOP) return;
    if (!d.moved) setBodyDragging(true);
    d.moved = true;
    const el = hostRef.current;
    const w = el?.offsetWidth ?? 224;
    const h = el?.offsetHeight ?? 120;
    const nx = Math.min(Math.max(8, base.current.x + dx), Math.max(8, window.innerWidth - w - 8));
    const ny = Math.min(Math.max(8, base.current.y + dy), Math.max(8, window.innerHeight - h - 8));
    x.set(nx - base.current.x);
    y.set(ny - base.current.y);
  };

  const onPointerUp = () => {
    const d = drag.current;
    if (!d.on) return;
    d.on = false;
    if (!d.moved) return;
    d.moved = false;
    d.upAt = Date.now();
    setBodyDragging(false);
    const el = hostRef.current;
    if (!el || !base.current) return;
    const fr = el.getBoundingClientRect();
    const hit = forbiddenRects().some(
      (z) =>
        fr.left < z.right - 4 && fr.right > z.left + 4 && fr.top < z.bottom - 4 && fr.bottom > z.top + 4,
    );
    if (hit) {
      /* 禁区回弹：弹簧回到拖拽前位置（快捷服务磁贴拖拽同款手感） */
      animate(x, 0, LAYOUT_SPRING);
      animate(y, 0, LAYOUT_SPRING);
    } else {
      /* 合法落点：以当前视觉位重钉（left/top 改写 + 位移归零，同帧无缝），
         持久化 settings.pinTile（v8.7.123 云同步随行） */
      const p = { x: Math.round(fr.left), y: Math.round(fr.top) };
      x.set(0);
      y.set(0);
      setSaved(p);
      commit(p);
    }
  };

  /* 窗口缩放：钉位 clamp 回视口（拖拽中不干预）。
     commit 在 updater 外提交（updater 必须纯——副作用入 updater 在 React
     18 下会被丢弃/双跑，钉位丢失的根因）；savedRef 供事件回调读最新值 */
  const savedRef = useRef(saved);
  savedRef.current = saved;
  useEffect(() => {
    const onResize = () => {
      if (drag.current.on) return;
      x.set(0);
      y.set(0);
      const p = savedRef.current;
      if (!p) return;
      const el = hostRef.current;
      const w = el?.offsetWidth ?? 224;
      const h = el?.offsetHeight ?? 120;
      const np = {
        x: Math.min(Math.max(8, p.x), Math.max(8, window.innerWidth - w - 8)),
        y: Math.min(Math.max(8, p.y), Math.max(8, window.innerHeight - h - 8)),
      };
      if (np.x !== p.x || np.y !== p.y) {
        setSaved(np);
        commit(np);
      }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [key, x, y, commit]);

  const afterDragClick = useCallback(() => Date.now() - drag.current.upAt < 300, []);

  return { x, y, saved, hostRef, onPointerDown, onPointerMove, onPointerUp, afterDragClick };
}

function PinnedTiles({
  todos,
  note,
  todoTile,
  noteTile,
  pinTilePos,
  onPinPos,
  onOpenPanel,
  setTodos,
}: {
  todos: TodoItem[];
  note: string;
  todoTile: boolean;
  noteTile: boolean;
  /** settings.pinTile：待办/便签磁贴钉位（云同步随行，v8.7.123） */
  pinTilePos?: PinTilePos;
  /** 钉位提交：写回 settings.pinTile（随 settings 持久化+云同步） */
  onPinPos: (k: "todo" | "note", p: { x: number; y: number } | null) => void;
  onOpenPanel: (p: PanelId) => void;
  /** 待办写回（v8.7.148 行级划掉）：与 TodoPanel 同一 setState 通道 */
  setTodos: (updater: (prev: TodoItem[]) => TodoItem[]) => void;
}) {
  return (
    <AnimatePresence>
      {todoTile && (
        <TodoTile
          key="pintile-todo"
          todos={todos}
          saved={pinTilePos?.todo ?? null}
          commit={(p) => onPinPos("todo", p)}
          onOpenPanel={onOpenPanel}
          setTodos={setTodos}
        />
      )}
      {noteTile && (
        <NoteTile
          key="pintile-note"
          note={note}
          saved={pinTilePos?.note ?? null}
          commit={(p) => onPinPos("note", p)}
          onOpenPanel={onOpenPanel}
        />
      )}
    </AnimatePresence>
  );
}

/** 待办常驻磁贴（左下默认锚位；v8.7.106 自由拖拽+禁区回弹+钉位持久化；
 *  v8.7.148 行级划掉；v8.7.149 划掉永久驻留+layout 拉伸+拖动重放根修） */
function TodoTile({
  todos,
  saved,
  commit,
  onOpenPanel,
  setTodos,
}: {
  todos: TodoItem[];
  saved: { x: number; y: number } | null;
  commit: (p: { x: number; y: number } | null) => void;
  onOpenPanel: (p: PanelId) => void;
  setTodos: (updater: (prev: TodoItem[]) => TodoItem[]) => void;
}) {
  const pin = usePinDrag("todo", saved, commit);

  /* v8.7.149 磁贴行：todos 原序遍历——划掉（done）条目全部驻留显示
     （用户指令：划掉不消失，待办面板里删掉才退场），pending 取前 4 条。
     行原地划线不动位（strike 动画承担视觉），仅删除触发退场+行上移。 */
  const pending = todos.filter((t) => !t.done);
  const rows: TodoItem[] = [];
  let slots = 4;
  for (const t of todos) {
    if (t.done) rows.push(t);
    else if (slots > 0) {
      rows.push(t);
      slots--;
    }
  }
  const shownPending = rows.reduce((n, t) => n + (t.done ? 0 : 1), 0);
  const morePending = pending.length - shownPending;

  /* layout 测量锁（v8.7.149）：dependency 必须「稳定引用 + 内容变化时
     换新引用」——todos 引用直接编码内容变化（划掉/增/删当帧生效），
     exitTick 编码 exit 卸载（删除行退场完成后 props 引用已复原，靠
     onExitComplete 递增补一次测量，磁贴收缩/兄弟行上移才有动画）。
     拖拽落座/resize clamp 的 setSaved render 两源均未动 → 同引用 →
     framer 跳过测量直接吸收新 box → 拖动后内容重放动画根治。 */
  const [exitTick, setExitTick] = useState(0);
  const layoutDep = useMemo(() => ({ todos, exitTick }), [todos, exitTick]);

  /* v8.7.149：toggleRow 纯化——点行即切换完成态，划掉的行按 todos 原序
     原地驻留（划线样式），无退场计时；删除只在面板/清除完成侧发生 */
  function toggleRow(t: TodoItem) {
    setTodos((prev) => prev.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)));
  }

  /* v8.7.148 点击统一宿主代理：pointerdown 即 setPointerCapture 会把点按
     的 pointerup/click 重定向到拖拽宿主（真扩展冒烟实证），行级/本体
     上的 onClick 永远收不到——故 click 统一收口在宿主一层：capture
     重定向流（target=宿主）用 elementFromPoint 还原真实落点，键盘流
     （target=真实元素）直接用 target；行级→划掉切换，本域→开面板。 */
  const onTileClick = (e: React.MouseEvent) => {
    if (pin.afterDragClick()) return;
    const fromTarget =
      e.target !== e.currentTarget ? (e.target as HTMLElement) : null;
    const real =
      fromTarget ??
      (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null);
    if (!real) return;
    const rowEl = real.closest("[data-todo-row]");
    if (rowEl) {
      const item = todos.find((t) => t.id === rowEl.getAttribute("data-todo-id"));
      if (item) toggleRow(item);
      return;
    }
    if (real.closest("[data-tile-body]")) onOpenPanel("todo");
  };
  return (
    <motion.div
      className={
        "zen-gone fixed z-30 hidden w-56 sm:block " +
        (pin.saved
          ? ""
          : "bottom-[calc(max(1.25rem,env(safe-area-inset-bottom))+84px)] left-6")
      }
      style={pin.saved ? { left: pin.saved.x, top: pin.saved.y } : undefined}
      initial={{ y: 16, scale: 0.92 }}
      animate={{ y: 0, scale: 1 }}
      exit={{ y: 12, scale: 0.94, transition: SINK }}
      transition={{ ...RISE, delay: 0.55 }}
    >
      {/* 拖拽层：transform-only（x/y 位移直写），磨砂存活律零毒；
          onClick 收口在此（见 onTileClick 注释） */}
      <motion.div
        ref={pin.hostRef}
        className="cursor-grab touch-none active:cursor-grabbing"
        style={{ x: pin.x, y: pin.y }}
        onPointerDown={pin.onPointerDown}
        onPointerMove={pin.onPointerMove}
        onPointerUp={pin.onPointerUp}
        onPointerCancel={pin.onPointerUp}
        onClick={onTileClick}
      >
        {/* v8.7.148：磁贴本体从 <button> 退为 role="button" div——行级划掉
            按钮不可嵌套在 button 里（HTML 交互元素禁嵌套）；onClick 已
            收口到拖拽宿主（capture 重定向实证），此处只保留键盘语义：
            Enter/Space 开面板仅响应磁贴自身焦点（e.target 守卫，行上
            回车仍是行级切换）。data-tile-body 供宿主代理识别本域 */}
        {/* v8.7.149：本体升级 motion 组件挂 layout（layoutDep 测量锁）——
            行增删时磁贴高度平滑拉伸/收缩（transform 通道，磨砂存活律零毒）；
            拖拽落座 render（layoutDep 不变）跳过测量，本体不重放位移 */}
        <motion.div
          role="button"
          tabIndex={0}
          aria-label="打开待办面板"
          data-tile-body="todo"
          layout
          layoutDependency={layoutDep}
          onKeyDown={(e) => {
            if (e.target !== e.currentTarget) return;
            if (e.key !== "Enter" && e.key !== " ") return;
            e.preventDefault();
            if (pin.afterDragClick()) return;
            onOpenPanel("todo");
          }}
          transition={{ ...RISE, delay: 0.55, layout: { duration: 0.38, ease: EASE } }}
          className="glass-card block w-full cursor-pointer rounded-2xl p-3.5 text-left shadow-xl outline-none transition-shadow duration-300 hover:shadow-2xl focus-visible:ring-2 accent-ring"
        >
          <motion.span
            className="block"
            initial={{ opacity: 0, filter: "blur(8px)" }}
            animate={{ opacity: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, filter: "blur(8px)", transition: { duration: 0.22 } }}
            transition={{ ...FOCUS, delay: 0.62 }}
          >
            <span className="mb-2 flex items-center gap-1.5">
              <CheckSquare className="h-3.5 w-3.5" strokeWidth={1.5} style={{ color: "var(--ui-accent, #8b5cf6)" }} />
              <span className="text-[11px] font-normal tracking-[0.18em] text-zinc-500 dark:text-zinc-400">待办</span>
              <span className="ml-auto rounded-full bg-zinc-900/5 px-1.5 text-[10px] tabular-nums font-light text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
                {pending.length}
              </span>
            </span>
            {rows.length === 0 ? (
              <span className="block py-1 text-xs font-extralight tracking-wide text-zinc-400 dark:text-zinc-500">
                今日无事，从容一些
              </span>
            ) : (
              <span className="block space-y-1">
                {/* 行级划掉（v8.7.148 交互沿用，v8.7.149 驻留律改）：点行
                    即切换完成态（点击由拖拽宿主统一代理，见 onTileClick
                    注释）；划线 .strike 与面板同语言（globals.css 0.45s
                    scaleX 扫线）；划掉的行按 todos 原序原地驻留不消失
                    （面板里删掉才退场）；layoutDependency={layoutDep}
                    引用锁防拖拽落座 render 重放位移动画；onExitComplete
                    在删除行退场完成后递增 exitTick 补一次测量，兄弟行
                    上移/磁贴收缩动画不丢；拖后 300ms 吞 click 律防拖拽
                    起点落在行上时误划 */}
                <AnimatePresence
                  initial={false}
                  onExitComplete={() => setExitTick((v) => v + 1)}
                >
                  {rows.map((t) => {
                    const struck = t.done;
                    return (
                      <motion.button
                        key={t.id}
                        type="button"
                        layout
                        layoutDependency={layoutDep}
                        data-todo-row={struck ? "done" : "open"}
                        data-todo-id={t.id}
                        aria-pressed={struck}
                        aria-label={(struck ? "恢复待办：" : "划掉待办：") + t.text}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: 18, transition: { duration: 0.26, ease: EASE } }}
                        transition={{
                          duration: 0.3,
                          ease: EASE,
                          layout: { duration: 0.38, ease: EASE },
                        }}
                        className={
                          "flex w-full cursor-pointer items-center gap-2 rounded-lg px-1 py-0.5 text-left text-xs font-light transition-colors duration-200 hover:bg-zinc-900/[0.05] dark:hover:bg-white/[0.06] " +
                          (struck
                            ? "text-zinc-400 dark:text-zinc-600"
                            : "text-zinc-600 dark:text-zinc-300")
                        }
                      >
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full transition-opacity duration-300"
                          style={{ background: "var(--ui-accent, #8b5cf6)", opacity: struck ? 0.18 : 0.55 }}
                        />
                        <span className="relative min-w-0 flex-1 truncate">
                          <span
                            aria-hidden
                            className="strike absolute left-0 top-1/2 h-px w-full origin-left bg-zinc-400 dark:bg-zinc-500"
                            style={{ transform: struck ? "scaleX(1)" : "scaleX(0)" }}
                          />
                          {t.text}
                        </span>
                      </motion.button>
                    );
                  })}
                </AnimatePresence>
                {morePending > 0 && (
                  <span className="block pl-3.5 text-[10px] font-extralight text-zinc-400 dark:text-zinc-500">
                    还有 {morePending} 项…
                  </span>
                )}
              </span>
            )}
          </motion.span>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

/** 便签常驻磁贴（右下默认锚位；v8.7.106 自由拖拽+禁区回弹+钉位持久化；
 *  v8.7.149 本体挂 layout——note 内容增减时磁贴高度平滑拉伸，note 值
 *  做 layoutDependency（字符串比较），拖拽落座 note 不变即跳过测量） */
function NoteTile({
  note,
  saved,
  commit,
  onOpenPanel,
}: {
  note: string;
  saved: { x: number; y: number } | null;
  commit: (p: { x: number; y: number } | null) => void;
  onOpenPanel: (p: PanelId) => void;
}) {
  const pin = usePinDrag("note", saved, commit);
  /* v8.7.148 存量修复（同待办磁贴）：capture 重定向把点按 click 吞在宿主，
     便签磁贴「点击开面板」自 v8.7.106 起同样失效——宿主代理同构收口 */
  const onTileClick = (e: React.MouseEvent) => {
    if (pin.afterDragClick()) return;
    const fromTarget =
      e.target !== e.currentTarget ? (e.target as HTMLElement) : null;
    const real =
      fromTarget ??
      (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null);
    if (real && real.closest("[data-tile-body]")) onOpenPanel("note");
  };
  return (
    <motion.div
      className={
        "zen-gone fixed z-30 hidden w-56 sm:block " +
        (pin.saved
          ? ""
          : "bottom-[calc(max(1.25rem,env(safe-area-inset-bottom))+84px)] right-6")
      }
      style={pin.saved ? { left: pin.saved.x, top: pin.saved.y } : undefined}
      initial={{ y: 16, scale: 0.92 }}
      animate={{ y: 0, scale: 1 }}
      exit={{ y: 12, scale: 0.94, transition: SINK }}
      transition={{ ...RISE, delay: 0.62 }}
    >
      <motion.div
        ref={pin.hostRef}
        className="cursor-grab touch-none active:cursor-grabbing"
        style={{ x: pin.x, y: pin.y }}
        onPointerDown={pin.onPointerDown}
        onPointerMove={pin.onPointerMove}
        onPointerUp={pin.onPointerUp}
        onPointerCancel={pin.onPointerUp}
        onClick={onTileClick}
      >
        <motion.button
          type="button"
          aria-label="打开便签面板"
          data-tile-body="note"
          layout
          layoutDependency={note}
          transition={{ layout: { duration: 0.38, ease: EASE } }}
          className="glass-card block w-full cursor-pointer rounded-2xl p-3.5 text-left shadow-xl outline-none transition-shadow duration-300 hover:shadow-2xl focus-visible:ring-2 accent-ring"
        >
          <motion.span
            className="block"
            initial={{ opacity: 0, filter: "blur(8px)" }}
            animate={{ opacity: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, filter: "blur(8px)", transition: { duration: 0.22 } }}
            transition={{ ...FOCUS, delay: 0.69 }}
          >
            <span className="mb-2 flex items-center gap-1.5">
              <StickyNote className="h-3.5 w-3.5" strokeWidth={1.5} style={{ color: "var(--ui-accent, #8b5cf6)" }} />
              <span className="text-[11px] font-normal tracking-[0.18em] text-zinc-500 dark:text-zinc-400">便签</span>
            </span>
            <span className="pintile-label block max-h-[6.25rem] overflow-hidden whitespace-pre-wrap break-all text-xs font-extralight leading-relaxed text-zinc-600 dark:text-zinc-300 [-webkit-box-orient:vertical] [-webkit-line-clamp:5] [display:-webkit-box]">
              {note.trim() || "随手记点什么…"}
            </span>
          </motion.span>
        </motion.button>
      </motion.div>
    </motion.div>
  );
}

export default memo(PinnedTiles);
