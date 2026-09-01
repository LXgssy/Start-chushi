"use client";

import { memo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useNow } from "@/hooks/use-start";
import { getLunarText } from "@/lib/startpage/lunar";
import type { Settings } from "@/lib/startpage/types";

const EASE = [0.22, 1, 0.36, 1] as const;

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

/*
 * 时钟冒号采用自绘双圆点（而非字体字符 ":"）：
 * - 圆形由 border-radius 构造保证，与 Geist 超细字重的气质一致；
 * - digit-slot 槽位（overflow:hidden）的盒底落在行基线上，其内部
 *   数字墨迹中心位于盒顶下方 0.5075em 处（Canvas 实测 @1em weight 150）；
 * - 两个圆点关于该墨迹中心上下对称分布，实现构造性光学居中，
 *   不依赖字体度量，任何字号下严格一致。
 */
/** 数字墨迹中心相对槽位盒顶的距离（em，实测烤定） */
export const DIGIT_INK_CENTER_EM = 0.5075;
/** 圆点直径（em） */
const COLON_DOT_D_EM = 0.082;
/** 上下两点中心距（em） */
const COLON_DOT_GAP_EM = 0.295;

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

/** 单个数字槽位：逐字符翻转模糊动效（供时钟与番茄钟复用）
 *  注意：不用 popLayout——多位并发翻转（如番茄钟 25:00→24:59 三位同翻）时
 *  popLayout 的全局布局快照存在竞态，会让部分槽位卡在 exit 态（高度塌 0、
 *  字符消失直到该位下次翻转）。sync 模式下各槽位独立管理 exit（absolute 飞出），
 *  并发安全。digit-slot 固定 height:1em 兜底防塌。 */
export function Digit({ char }: { char: string }) {
  return (
    <span className="digit-slot inline-block overflow-hidden align-baseline">
      <AnimatePresence initial={false}>
        <motion.span
          key={char}
          className="inline-block tabular-nums"
          initial={{ y: "55%", opacity: 0, filter: "blur(8px)" }}
          animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
          exit={{ y: "-55%", opacity: 0, filter: "blur(8px)", position: "absolute" }}
          transition={{ duration: 0.5, ease: EASE }}
        >
          {char}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/**
 * 时钟冒号：自绘双圆点，轻微呼吸 + 构造性垂直光学居中。
 * 外层 colon-slot 与 digit-slot 同构（盒底落在行基线、盒顶严格对齐），
 * 两圆点关于数字墨迹中心（DIGIT_INK_CENTER_EM）对称分布。
 */
export function Colon({
  className = "",
  breathe = true,
}: {
  className?: string;
  breathe?: boolean;
}) {
  return (
    <span
      aria-hidden
      className={`colon-slot inline-block align-baseline ${className}`}
      style={{ width: "0.32em", height: "1em" }}
    >
      <motion.span
        animate={breathe ? { opacity: [0.9, 0.35, 0.9] } : undefined}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        className="absolute inset-0"
      >
        {[-1, 1].map((sign) => (
          <span
            key={sign}
            className="absolute rounded-full bg-current"
            style={{
              width: `${COLON_DOT_D_EM}em`,
              height: `${COLON_DOT_D_EM}em`,
              left: "50%",
              top: `${DIGIT_INK_CENTER_EM + (sign * COLON_DOT_GAP_EM) / 2}em`,
              transform: "translate(-50%, -50%)",
            }}
          />
        ))}
      </motion.span>
    </span>
  );
}

function Clock({
  settings,
  mini = false,
}: {
  settings: Settings;
  mini?: boolean;
}) {
  const now = useNow();

  let hours = now.getHours();
  const minutes = pad(now.getMinutes());
  const seconds = pad(now.getSeconds());

  let ampm = "";
  if (settings.hour12) {
    ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12 || 12;
  }
  const hh = settings.hour12 ? String(hours).padStart(2, " ") : pad(hours);

  const lunarText = getLunarText(now);
  const dateStr = `${now.getMonth() + 1}月${now.getDate()}日 星期${WEEKDAYS[now.getDay()]}`;
  const greeting = greetingFor(now.getHours());
  const name = settings.userName.trim();

  return (
    <div className="cl-clock flex flex-col items-center select-none">
      {/* 时钟主体 */}
      <time
        dateTime={now.toISOString()}
        className={`clock-text font-extralight leading-none tracking-[-0.02em] text-zinc-900 dark:text-zinc-100 ${
          mini
            ? "text-[clamp(2.4rem,9vw,4.2rem)]"
            : "text-[clamp(3.6rem,min(13vw,22vh),10.5rem)]"
        }`}
        style={{ fontWeight: 150 }}
      >
        {ampm && (
          <span className="mr-3 align-top text-[clamp(0.8rem,1.6vw,1.2rem)] font-light tracking-widest opacity-60">
            {ampm}
          </span>
        )}
        <Digit char={hh[0]} />
        <Digit char={hh[1]} />
        <Colon />
        <Digit char={minutes[0]} />
        <Digit char={minutes[1]} />
        {settings.showSeconds && !mini && (
          /* 秒数组（含第二个冒号）：冒号与秒数同字号同行盒，双点关于小字墨迹中心对称——
             构造性对齐秒数而非分钟；opacity 继承主色，photo/明暗主题自适应 */
          <span className="align-top text-[clamp(1.4rem,3vw,2.6rem)] opacity-60">
            <Colon />
            <Digit char={seconds[0]} />
            <Digit char={seconds[1]} />
          </span>
        )}
      </time>

      {/* 日期 · 农历 · 问候 */}
      {!mini && (
        <div className="clock-sub mt-5 flex h-6 items-center gap-3 text-sm font-light tracking-wide text-zinc-500 dark:text-zinc-400">
          <span>{dateStr}</span>
          {lunarText && (
            <>
              <span aria-hidden className="h-3 w-px bg-zinc-300 dark:bg-zinc-700" />
              <span>{lunarText}</span>
            </>
          )}
          <span aria-hidden className="h-3 w-px bg-zinc-300 dark:bg-zinc-700" />
          <motion.span
            key={greeting}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: EASE }}
          >
            {greeting}
            {name ? `，${name}` : ""}
          </motion.span>
        </div>
      )}
    </div>
  );
}

export function greetingFor(hour: number): string {
  if (hour < 4) return "夜深了";
  if (hour < 6) return "凌晨好";
  if (hour < 9) return "早上好";
  if (hour < 12) return "上午好";
  if (hour < 14) return "中午好";
  if (hour < 18) return "下午好";
  if (hour < 23) return "晚上好";
  return "夜深了";
}

export default memo(Clock);
