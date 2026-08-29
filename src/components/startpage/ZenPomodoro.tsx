"use client";

/* 禅模式迷你番茄钟：仅在计时运行时浮现（暂停/静止不显示，退出禅模式可暂停）。
 * 与 dock 徽标同源订阅 localStorage 运行时（subscribePomo，每秒拉新）；
 * 禅中自然到点时按面板同一结算规则（advanceRuntime：推进模式 + 提示音 + 自动续跑）。
 * 纯文字呈现（无玻璃底，不涉磨砂存活原则），墨色随禅模式采样 tone 自适应。 */

import { memo, useEffect, useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  POMO_KEY,
  MODE_TEXT,
  advanceRuntime,
  chime,
  fmt,
  subscribePomo,
  type PomoMode,
  type PomoRuntime,
} from "./PomodoroPanel";
import { useToast } from "@/hooks/use-toast";
import { readLS, writeLS } from "@/hooks/use-start";
import type { Settings } from "@/lib/startpage/types";

const EASE = [0.22, 1, 0.36, 1] as const;

/** 活跃快照："mode|mm:ss"（运行中且未到点）；null = 不显示（暂停/静止/到点瞬间）。
 *  原始值字符串保证 useSyncExternalStore 快照稳定性（秒级更新恰好驱动重渲染） */
function getZenPomoSnapshot(): string | null {
  const rt = readLS<PomoRuntime | null>(POMO_KEY, null);
  if (rt && rt.mode && rt.running && rt.endAt > Date.now()) {
    const s = Math.max(0, Math.ceil((rt.endAt - Date.now()) / 1000));
    return `${rt.mode}|${fmt(s)}`;
  }
  return null;
}

function ZenPomodoro({
  settings,
  tone,
}: {
  settings: Settings;
  tone: "auto" | "on-dark" | "on-light";
}) {
  const { toast } = useToast();
  const snap = useSyncExternalStore(subscribePomo, getZenPomoSnapshot, () => null);
  const active = snap != null;
  const [rawMode, text] = active ? snap.split("|") : ["focus", ""];
  const mode: PomoMode =
    rawMode === "short" ? "short" : rawMode === "long" ? "long" : "focus";

  /* 到点结算：与面板 finish(auto) 同一规则；禅下面板必已收起，此处是唯一写者。
     随快照每秒轮询检查，到点即推进（提示音 + 通知 + 下一阶段自动续跑） */
  useEffect(() => {
    const rt = readLS<PomoRuntime | null>(POMO_KEY, null);
    if (!rt || !rt.running || rt.endAt <= 0 || Date.now() < rt.endAt) return;
    const next = advanceRuntime(rt, settings.pomodoro, true);
    writeLS(POMO_KEY, next);
    chime();
    toast({
      title:
        rt.mode === "focus"
          ? `专注完成，进入${next.mode === "long" ? "长休" : "短休"}`
          : "休息结束，开始新的专注",
      duration: 4000,
    });
  }, [snap, settings.pomodoro, toast]);

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          key="zen-pomo"
          data-tone={tone}
          className="zen-pomo mt-8 flex items-center gap-3"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.6, ease: EASE }}
        >
          <span className="pomo-dot" data-running="true" aria-hidden />
          <span className="text-[11px] font-extralight tracking-[0.42em]">
            {MODE_TEXT[mode]}
          </span>
          <span className="text-[11px] font-extralight tabular-nums tracking-[0.2em]">
            {text}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default memo(ZenPomodoro);
