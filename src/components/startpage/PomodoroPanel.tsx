"use client";

import { memo, useCallback, useEffect, useState } from "react";
import { motion, useSpring } from "framer-motion";
import { Pause, Play, RotateCcw, SkipForward } from "lucide-react";
import { Colon, Digit } from "./Clock";
import { useToast } from "@/hooks/use-toast";
import { readLS, writeLS } from "@/hooks/use-start";
import type { PomodoroDurations, Settings } from "@/lib/startpage/types";

const EASE = [0.22, 1, 0.36, 1] as const;

export type PomoMode = "focus" | "short" | "long";

const TABS: Array<{ value: PomoMode; label: string }> = [
  { value: "focus", label: "专注" },
  { value: "short", label: "短休" },
  { value: "long", label: "长休" },
];

export const MODE_TEXT: Record<PomoMode, string> = {
  focus: "专注",
  short: "短休",
  long: "长休",
};

/** 番茄钟运行时在 localStorage 中的键 */
export const POMO_KEY = "start:pomo";
/** 完整专注轮数（每完成 N 次进入长休） */
export const CYCLE = 4;

/** 番茄钟运行时状态（持久化于 localStorage，Dock 徽标/禅模式迷你行读取倒计时） */
export interface PomoRuntime {
  mode: PomoMode;
  running: boolean;
  /** 运行中的结束时间戳（ms）；暂停时无效 */
  endAt: number;
  /** 暂停时快照的剩余秒数（atFull 时以当前时长设置为准） */
  remaining: number;
  /** 暂停位置是否为"完整时长起点"（此时长设置变更即时生效） */
  atFull: boolean;
  /** 已完成的专注次数 */
  completedFocus: number;
}

/** 跨组件订阅番茄钟运行时：每秒拉新（同页写 LS 不触发 storage 事件）+ 跨 tab storage */
export function subscribePomo(cb: () => void) {
  const t = setInterval(cb, 1000);
  window.addEventListener("storage", cb);
  return () => {
    clearInterval(t);
    window.removeEventListener("storage", cb);
  };
}

/** 番茄钟时间盒内数字墨迹中心的垂直校准量（em）。像素级实测烤定（含行盒 strut 下延） */
export const DIGIT_CENTER_EM = 0.099;
/** 番茄钟面板时间字号（px） */
const POMO_TIME_PX = 48;
/** 进度环：外径（px）、圆弧半径（px）与描边宽（px） */
const RING_PX = 176;
const RING_RADIUS = 84;
const RING_STROKE = 3.5;

export function durationSec(d: PomodoroDurations, m: PomoMode): number {
  return (m === "focus" ? d.focusMin : m === "short" ? d.shortMin : d.longMin) * 60;
}

export function fmt(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

/* 完成提示音：两记柔和的正弦音（E5 → A5） */
export function chime() {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [659.25, 880].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = f;
      const t0 = ctx.currentTime + i * 0.22;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(0.12, t0 + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.9);
      o.connect(g);
      g.connect(ctx.destination);
      o.start(t0);
      o.stop(t0 + 1);
    });
    setTimeout(() => void ctx.close(), 2600);
  } catch {
    /* 无声环境静默失败 */
  }
}

/** 阶段推进纯函数（自然到点 auto / 手动跳过共用）：禅模式迷你番茄钟与面板保持同一结算规则 */
export function advanceRuntime(
  rt: PomoRuntime,
  durations: PomodoroDurations,
  auto: boolean
): PomoRuntime {
  const from = rt.mode;
  const completedFocus =
    from === "focus" && auto ? rt.completedFocus + 1 : rt.completedFocus;
  const nextMode: PomoMode =
    from === "focus"
      ? completedFocus % CYCLE === 0
        ? "long"
        : "short"
      : "focus";
  const sec = durationSec(durations, nextMode);
  return {
    mode: nextMode,
    running: auto,
    endAt: auto ? Date.now() + sec * 1000 : 0,
    remaining: sec,
    atFull: true,
    completedFocus,
  };
}

function Stepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-xs font-light tracking-wide text-zinc-600 dark:text-zinc-300">
        {label}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label={`减少${label}`}
          onClick={() => onChange(Math.max(min, value - 1))}
          className="flex h-6 w-6 items-center justify-center rounded-full text-zinc-400 transition-colors duration-200 hover:bg-zinc-900/5 hover:text-zinc-700 dark:hover:bg-white/10 dark:hover:text-zinc-200"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
            <path d="M1 5h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>
        <span className="w-12 text-center text-xs tabular-nums text-zinc-700 dark:text-zinc-200">
          {value} 分
        </span>
        <button
          type="button"
          aria-label={`增加${label}`}
          onClick={() => onChange(Math.min(max, value + 1))}
          className="flex h-6 w-6 items-center justify-center rounded-full text-zinc-400 transition-colors duration-200 hover:bg-zinc-900/5 hover:text-zinc-700 dark:hover:bg-white/10 dark:hover:text-zinc-200"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
            <path d="M1 5h8M5 1v8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function PomodoroPanel({
  settings,
  onPatch,
}: {
  settings: Settings;
  onPatch: (patch: Partial<Settings>) => void;
}) {
  const { toast } = useToast();
  const durations = settings.pomodoro;

  const [rt, setRt] = useState<PomoRuntime>(() => {
    const saved = readLS<PomoRuntime | null>(POMO_KEY, null);
    if (!saved || !saved.mode)
      return {
        mode: "focus",
        running: false,
        endAt: 0,
        remaining: 0,
        atFull: true,
        completedFocus: 0,
      };
    return { ...saved, atFull: saved.atFull ?? false };
  });
  const [now, setNow] = useState(() => Date.now());

  /* 阶段推进：自然到点 / 手动跳过共用（auto=true 时伴随提示音与通知）。
     rt 从闭包捕获，心跳 effect 会在 rt 变化时重建，无需 ref。 */
  const finish = useCallback(
    (auto: boolean) => {
      const from = rt.mode;
      const next = advanceRuntime(rt, durations, auto);
      setRt(next);
      if (auto) {
        chime();
        toast({
          title:
            from === "focus"
              ? `专注完成，进入${next.mode === "long" ? "长休" : "短休"}`
              : "休息结束，开始新的专注",
          duration: 4000,
        });
      }
    },
    [rt, durations, toast]
  );

  /* 心跳：500ms。基于结束时间戳运算，无累积漂移；到点结算在回调内完成 */
  useEffect(() => {
    if (!rt.running) return;
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (rt.endAt > 0 && n >= rt.endAt) finish(true);
    }, 500);
    return () => clearInterval(t);
  }, [rt.running, rt.endAt, finish]);

  /* 运行时持久化 */
  useEffect(() => {
    writeLS(POMO_KEY, rt);
  }, [rt]);

  const remaining = rt.running
    ? Math.max(0, Math.ceil((rt.endAt - now) / 1000))
    : rt.atFull || rt.remaining <= 0
      ? durationSec(durations, rt.mode)
      : rt.remaining;
  const total = durationSec(durations, rt.mode);

  /* 运行时更新标签页标题 */
  useEffect(() => {
    if (!rt.running) {
      document.title = "初始 · Start";
      return;
    }
    document.title = `${fmt(remaining)} · ${MODE_TEXT[rt.mode]} — 初始`;
    return () => {
      document.title = "初始 · Start";
    };
  }, [rt.running, remaining, rt.mode]);

  const toggle = () => {
    setNow(Date.now());
    setRt((prev) => {
      if (prev.running) {
        return {
          ...prev,
          running: false,
          atFull: false,
          remaining: Math.max(0, Math.ceil((prev.endAt - Date.now()) / 1000)),
        };
      }
      const rem =
        prev.atFull || prev.remaining <= 0
          ? durationSec(durations, prev.mode)
          : prev.remaining;
      return { ...prev, running: true, atFull: false, endAt: Date.now() + rem * 1000 };
    });
  };

  const reset = () => {
    setRt((prev) => ({
      ...prev,
      running: false,
      endAt: 0,
      atFull: true,
      remaining: durationSec(durations, prev.mode),
    }));
  };

  const skip = () => finish(false);

  const switchMode = (m: PomoMode) => {
    if (m === rt.mode) return;
    setRt((prev) => ({
      ...prev,
      mode: m,
      running: false,
      endAt: 0,
      atFull: true,
      remaining: durationSec(durations, m),
    }));
  };

  const patchDur = (key: keyof PomodoroDurations, v: number) =>
    onPatch({ pomodoro: { ...durations, [key]: v } });

  const t = fmt(remaining);

  /* 进度环弧长比例：面板挂载时弹簧自 0 画出（进入动画），运行中随滴答平滑流动 */
  const frac = total > 0 ? Math.min(1, Math.max(0, remaining / total)) : 0;
  const ringFrac = useSpring(0, { stiffness: 40, damping: 16, mass: 0.9 });
  useEffect(() => {
    ringFrac.set(frac);
  }, [frac, ringFrac]);

  return (
    <div className="slim-scroll max-h-[calc(100dvh-180px)] overflow-y-auto pr-0.5">
      {/* 模式 Tab：指示器以强调色填充，双向弹性拉伸 */}
      <div
        role="tablist"
        aria-label="番茄钟模式"
        className="relative mb-5 flex rounded-full border border-zinc-900/10 bg-zinc-900/[0.04] p-1 dark:border-white/10 dark:bg-white/[0.06]"
      >
        {TABS.map((t) => {
          const active = rt.mode === t.value;
          return (
            <button
              key={t.value}
              role="tab"
              aria-selected={active}
              onClick={() => switchMode(t.value)}
              className={`relative z-10 flex-1 rounded-full px-3 py-1.5 text-xs font-light tracking-wide transition-colors duration-300 ${
                active
                  ? "text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.18)]"
                  : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100"
              }`}
            >
              {active && (
                <motion.span
                  layoutId="pomodoro-tab-pill"
                  transition={{ type: "spring", stiffness: 400, damping: 30, mass: 0.9 }}
                  className="absolute inset-0 -z-10 rounded-full shadow-sm"
                  style={{ background: "var(--ui-accent, #8b5cf6)" }}
                  aria-hidden
                />
              )}
              {t.label}
            </button>
          );
        })}
      </div>

      {/* 进度环：打开面板时弧线自零弹簧画出；时间居中环心 */}
      <div className="flex items-center justify-center">
        <div
          className="relative flex items-center justify-center"
          style={{ width: RING_PX, height: RING_PX }}
        >
          <svg
            width={RING_PX}
            height={RING_PX}
            viewBox={`0 0 ${RING_PX} ${RING_PX}`}
            className="absolute inset-0 -rotate-90"
            aria-hidden
          >
            <circle
              cx={RING_PX / 2}
              cy={RING_PX / 2}
              r={RING_RADIUS}
              fill="none"
              strokeWidth={RING_STROKE}
              className="stroke-zinc-900/[0.07] dark:stroke-white/[0.09]"
            />
            <motion.circle
              cx={RING_PX / 2}
              cy={RING_PX / 2}
              r={RING_RADIUS}
              fill="none"
              strokeWidth={RING_STROKE}
              strokeLinecap="round"
              stroke="var(--ui-accent, #8b5cf6)"
              style={{ pathLength: ringFrac }}
            />
          </svg>
          <time
            className="relative tabular-nums font-extralight leading-none tracking-[0.01em] text-zinc-900 dark:text-zinc-100"
            style={{
              fontWeight: 150,
              fontSize: POMO_TIME_PX,
              transform: `translateY(${DIGIT_CENTER_EM}em)`,
            }}
            aria-label={`${MODE_TEXT[rt.mode]}剩余 ${t}`}
          >
            <Digit char={t[0]} />
            <Digit char={t[1]} />
            <Colon breathe={!rt.running} className="mx-1" />
            <Digit char={t[3]} />
            <Digit char={t[4]} />
          </time>
        </div>
      </div>

      {/* 控制区 */}
      <div className="mt-7 flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          aria-label="重置"
          title="重置"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-zinc-900/10 text-zinc-500 transition-all duration-300 hover:bg-zinc-900/5 hover:text-zinc-800 dark:border-white/10 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-zinc-100"
        >
          <RotateCcw className="h-4 w-4" strokeWidth={1.5} />
        </button>
        <button
          type="button"
          onClick={toggle}
          className="flex h-11 items-center gap-2 rounded-full px-6 text-sm font-normal tracking-widest text-white shadow-md transition-all duration-300 hover:opacity-80 active:scale-[0.97]"
          style={{ background: "var(--ui-accent, #8b5cf6)" }}
        >
          {rt.running ? (
            <Pause className="h-4 w-4" strokeWidth={1.8} />
          ) : (
            <Play className="h-4 w-4" strokeWidth={1.8} />
          )}
          {rt.running ? "暂停" : remaining < total ? "继续" : "开始"}
        </button>
        <button
          type="button"
          onClick={skip}
          aria-label="跳过当前阶段"
          title="跳过"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-zinc-900/10 text-zinc-500 transition-all duration-300 hover:bg-zinc-900/5 hover:text-zinc-800 dark:border-white/10 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-zinc-100"
        >
          <SkipForward className="h-4 w-4" strokeWidth={1.5} />
        </button>
      </div>

      {/* 时长设置 */}
      <div className="mt-5 border-t border-zinc-900/5 pt-3 dark:border-white/5">
        <Stepper
          label="专注时长"
          value={durations.focusMin}
          min={1}
          max={180}
          onChange={(v) => patchDur("focusMin", v)}
        />
        <Stepper
          label="短休时长"
          value={durations.shortMin}
          min={1}
          max={60}
          onChange={(v) => patchDur("shortMin", v)}
        />
        <Stepper
          label="长休时长"
          value={durations.longMin}
          min={1}
          max={60}
          onChange={(v) => patchDur("longMin", v)}
        />
      </div>
    </div>
  );
}

export default memo(PomodoroPanel);
