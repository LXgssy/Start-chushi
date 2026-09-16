"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useStored } from "./use-start";
import {
  DEFAULT_POMODORO,
  POMO_LIMITS,
  pomoMinutesOf,
  type PomodoroMode,
  type PomodoroState,
} from "@/lib/startpage/types";

export function pomoToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** 专注完成后：每累计 4 次进入长休，否则短休 */
function nextModeOf(mode: PomodoroMode, doneToday: number): PomodoroMode {
  if (mode !== "focus") return "focus";
  return (doneToday + 1) % 4 === 0 ? "long" : "short";
}

export interface PomodoroApi {
  state: PomodoroState;
  /** 当前剩余毫秒（运行中按 endAt 实时推导） */
  remaining: number;
  /** 今日已完成专注次数 */
  doneToday: number;
  toggle: () => void;
  reset: () => void;
  switchMode: (m: PomodoroMode) => void;
  /** 调整某阶段时长（分钟，自动钳位）；若为当前阶段则重置该阶段 */
  setDuration: (m: PomodoroMode, minutes: number) => void;
  /** 整体替换状态（备份导入用） */
  replaceAll: (s: PomodoroState) => void;
}

/**
 * 番茄钟：状态持久化，运行中基于结束时间戳计时，
 * 刷新 / 关闭页面后回来仍能正确续算或补记完成。
 */
export function usePomodoro(
  onEvent: (kind: "focus-done" | "break-done") => void
): PomodoroApi {
  const [state, setState] = useStored<PomodoroState>("start:pomo", DEFAULT_POMODORO);
  const [, setTick] = useState(0);

  const stateRef = useRef(state);
  stateRef.current = state;
  const eventRef = useRef(onEvent);
  eventRef.current = onEvent;

  const finish = useCallback(() => {
    const s = stateRef.current;
    if (!s.running) return;
    const wasFocus = s.mode === "focus";
    const oldCount = wasFocus && s.doneDate === pomoToday() ? s.doneCount : 0;
    const nm = nextModeOf(s.mode, oldCount);
    setState({
      mode: nm,
      running: false,
      endAt: null,
      remaining: pomoMinutesOf(s)[nm] * 60_000,
      doneDate: pomoToday(),
      doneCount: wasFocus ? oldCount + 1 : oldCount,
    });
    eventRef.current(wasFocus ? "focus-done" : "break-done");
  }, [setState]);

  /* 运行中：500ms 心跳（驱动展示刷新 + 到点完成）；面板关闭时依旧生效 */
  useEffect(() => {
    if (!state.running) return;
    const t = setInterval(() => {
      const s = stateRef.current;
      if (s.running && s.endAt != null && s.endAt <= Date.now()) {
        finish();
      } else {
        setTick((x) => (x + 1) % 1_000_000);
      }
    }, 500);
    return () => clearInterval(t);
  }, [state.running, finish]);

  /* 挂载时：若计时已在上次会话中走完，静默补记（含跨天重置计数） */
  useEffect(() => {
    const s = stateRef.current;
    if (s.running && s.endAt != null && s.endAt <= Date.now()) {
      finish();
    }
  }, [finish]);

  const toggle = useCallback(() => {
    setState((s) => {
      if (s.running) {
        return {
          ...s,
          running: false,
          endAt: null,
          remaining: Math.max(0, (s.endAt ?? Date.now()) - Date.now()),
        };
      }
      const base = s.remaining > 0 ? s.remaining : pomoMinutesOf(s)[s.mode] * 60_000;
      return { ...s, running: true, endAt: Date.now() + base };
    });
  }, [setState]);

  const reset = useCallback(() => {
    setState((s) => ({
      ...s,
      running: false,
      endAt: null,
      remaining: pomoMinutesOf(s)[s.mode] * 60_000,
    }));
  }, [setState]);

  const switchMode = useCallback(
    (m: PomodoroMode) => {
      setState((s) => ({
        ...s,
        mode: m,
        running: false,
        endAt: null,
        remaining: pomoMinutesOf(s)[m] * 60_000,
      }));
    },
    [setState]
  );

  /** 调整阶段时长：当前阶段立即按新时长重置（停止计时）；其余阶段仅存盘 */
  const setDuration = useCallback(
    (m: PomodoroMode, minutes: number) => {
      const lim = POMO_LIMITS[m];
      const val = Math.min(lim.max, Math.max(lim.min, Math.round(minutes)));
      setState((s) => {
        const base = { ...s, durations: { ...pomoMinutesOf(s), [m]: val } };
        if (s.mode !== m) return base;
        return { ...base, running: false, endAt: null, remaining: val * 60_000 };
      });
    },
    [setState]
  );

  const replaceAll = useCallback(
    (s: PomodoroState) => {
      setState({ ...DEFAULT_POMODORO, ...s });
    },
    [setState]
  );

  const remaining =
    state.running && state.endAt != null
      ? Math.max(0, state.endAt - Date.now())
      : state.remaining;
  const doneToday = state.doneDate === pomoToday() ? state.doneCount : 0;

  return { state, remaining, doneToday, toggle, reset, switchMode, setDuration, replaceAll };
}
