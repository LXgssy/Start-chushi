"use client";

/* 「初始」— 小组件行（v8.7.48）
 *
 * iTab 式组件卡（日历 / 天气 / 待办 / 倒数日），落在搜索区下方、磁贴区上方。
 *
 * 数据面：全部来自 useStartPage() 既有状态（weather 30min 轮询 + 快照回退 /
 * todos / place / settings），零新增外部数据源；卡片点击直达对应内建面板
 * （gotoPanel），小组件是「展示 + 快捷入口」，详细操作仍在面板（iOS 小组件同语义）。
 *
 * 玻璃存活律：
 *  · 入场——壳体只动 transform（.wg-card-in，玻璃祖先零毒通道），内容层的
 *    opacity/filter 走 .wg-body-in（intro-tile-body 同款）；与搜索框同拍 0.24s
 *    逐卡 +70ms 级联；
 *  · 禅退场——整行挂 .zen-gone（visibility+opacity+filter 雾化散场，与磁贴墙
 *    同通道）；
 *  · 材质 .glass-card——深浅色 + cs-lite 实底兜底全站统一。
 *
 * 倒数日双语义（settings.countdownTarget = datetime-local 串）：
 *  · 含非零时刻 → 每日循环倒计时（如下班 18:00，到点后自动明天重来）；
 *  · 00:00 → 距目标日的天数（纪念日倒数）。
 *  编辑就卡片内联完成（点击卡片进入编辑态），不另开浮层。
 */

import { memo, useEffect, useRef, useState } from "react";
import { CalendarClock, CheckCheck, MapPin } from "lucide-react";
import { useNow } from "@/hooks/use-start";
import { useStartPage } from "@/app/startpage/startpage-context";
import { getLunarText } from "@/lib/startpage/lunar";
import { weatherText } from "@/lib/startpage/weather";
import {
  DEFAULT_WIDGETS,
  WIDGET_ORDER,
} from "@/lib/startpage/types";
import WeatherGlyph from "./WeatherGlyph";

/* ---------- 卡片骨架 ---------- */

/** 卡壳：玻璃材质 + 入场 transform 通道。可点卡以 <button> 承载点击直达。 */
function CardShell({
  children,
  delay,
  onClick,
  ariaLabel,
  ariaExpanded,
}: {
  children: React.ReactNode;
  delay: number;
  onClick?: () => void;
  ariaLabel?: string;
  ariaExpanded?: boolean;
}) {
  const cls = `glass-card wg-card-in relative flex h-44 flex-col overflow-hidden rounded-2xl p-3.5 text-left outline-none transition-[transform,box-shadow] duration-300 focus-visible:ring-2 focus-visible:ring-[var(--ui-accent)]/60 ${
    onClick
      ? "cursor-pointer hover:-translate-y-0.5 hover:shadow-lg hover:shadow-zinc-900/5 active:translate-y-0 dark:hover:shadow-black/20"
      : ""
  }`;
  const style = { animationDelay: `${delay}s` };
  if (onClick) {
    return (
      <button type="button" className={cls} style={style} onClick={onClick} aria-label={ariaLabel} aria-expanded={ariaExpanded}>
        {children}
      </button>
    );
  }
  return (
    <div className={cls} style={style}>
      {children}
    </div>
  );
}

/** 卡头：左标签 + 右注记（四卡同节奏） */
function CardHead({ label, note }: { label: string; note?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px] font-normal tracking-[0.12em] text-zinc-400 dark:text-zinc-500">
        {label}
      </span>
      {note != null && (
        <span className="truncate text-[10px] font-light tracking-wide text-zinc-400 dark:text-zinc-500">
          {note}
        </span>
      )}
    </div>
  );
}

/** 内容层：opacity/filter 入场通道（玻璃存活律——只在非玻璃的子层动画） */
function CardBody({ delay, children }: { delay: number; children: React.ReactNode }) {
  return (
    <div
      className="wg-body-in flex min-h-0 flex-1 flex-col"
      style={{ animationDelay: `${delay}s` }}
    >
      {children}
    </div>
  );
}

/* ---------- 日历卡 ---------- */

const WEEKDAYS_MIN = ["日", "一", "二", "三", "四", "五", "六"];

function CalendarCard({ now, delay }: { now: Date; delay: number }) {
  const y = now.getFullYear();
  const m = now.getMonth();
  const today = now.getDate();
  const firstDow = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const cells: Array<number | null> = [
    ...Array<null>(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  const lunar = getLunarText(now);

  return (
    <CardShell delay={delay}>
      <CardBody delay={delay}>
        <CardHead
          label={`${m + 1}月`}
          note={lunar || undefined}
        />
        <div className="mt-2 grid grid-cols-7 gap-y-[1px] text-center text-[9.5px] font-light text-zinc-400 dark:text-zinc-500" aria-hidden>
          {WEEKDAYS_MIN.map((w) => (
            <span key={w}>{w}</span>
          ))}
        </div>
        <div className="mt-0.5 grid flex-1 grid-cols-7 content-start gap-y-[1px] text-center" role="grid" aria-label="本月日历">
          {cells.map((d, i) =>
            d == null ? (
              <span key={`e${i}`} />
            ) : d === today ? (
              <span
                key={d}
                className="mx-auto flex h-[17px] w-[17px] items-center justify-center rounded-full text-[10px] font-medium text-white"
                style={{ background: "var(--ui-accent, #8b5cf6)" }}
                aria-current="date"
              >
                {d}
              </span>
            ) : (
              <span key={d} className="flex h-[17px] items-center justify-center text-[10px] font-light text-zinc-600 dark:text-zinc-300">
                {d}
              </span>
            )
          )}
        </div>
      </CardBody>
    </CardShell>
  );
}

/* ---------- 天气卡 ---------- */

function WeatherCard({ delay }: { delay: number }) {
  const { weather, place, gotoPanel } = useStartPage();

  /* 未定位：引导去天气面板（面板内有定位 / 城市搜索） */
  if (place.lat == null || place.lon == null) {
    return (
      <CardShell delay={delay} onClick={() => gotoPanel("weather")} ariaLabel="设置天气城市">
        <CardBody delay={delay}>
          <CardHead label="天气" />
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-zinc-400 dark:text-zinc-500">
            <MapPin size={20} strokeWidth={1.5} aria-hidden />
            <span className="text-xs font-light">点击设置城市</span>
          </div>
        </CardBody>
      </CardShell>
    );
  }

  const loading = weather.loading && weather.temp == null;
  const temp = weather.temp;

  return (
    <CardShell delay={delay} onClick={() => gotoPanel("weather")} ariaLabel="查看天气详情">
      <CardBody delay={delay}>
        <CardHead label="天气" note={weather.city || undefined} />
        {loading ? (
          <div className="mt-3 flex-1 animate-pulse">
            <div className="h-8 w-20 rounded-md bg-zinc-900/10 dark:bg-white/10" />
            <div className="mt-2.5 h-3 w-14 rounded bg-zinc-900/[0.07] dark:bg-white/[0.07]" />
            <div className="mt-5 h-3 w-24 rounded bg-zinc-900/[0.05] dark:bg-white/[0.05]" />
          </div>
        ) : temp != null ? (
          <div className="mt-1.5 flex flex-1 flex-col justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[2.6rem] font-extralight leading-none tracking-tight text-zinc-900 dark:text-zinc-100">
                {Math.round(temp)}°
              </span>
              <WeatherGlyph code={weather.code} size={30} className="opacity-80" />
            </div>
            <div>
              <div className="text-xs font-light text-zinc-500 dark:text-zinc-400">
                {weatherText(weather.code)}
                {weather.hi != null && weather.lo != null && (
                  <span className="ml-2 tabular-nums">
                    高 {Math.round(weather.hi)}° 低 {Math.round(weather.lo)}°
                  </span>
                )}
              </div>
              <div className="mt-0.5 truncate text-[10px] font-light text-zinc-400 dark:text-zinc-500">
                {weather.staleAt != null ? `${weather.city || "当前位置"} · 缓存` : "实时预报"}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-zinc-400 dark:text-zinc-500">
            <MapPin size={20} strokeWidth={1.5} aria-hidden />
            <span className="text-xs font-light">{weather.error ?? "点击查看天气"}</span>
          </div>
        )}
      </CardBody>
    </CardShell>
  );
}

/* ---------- 待办卡 ---------- */

function TodoCard({ delay }: { delay: number }) {
  const { todos, gotoPanel } = useStartPage();
  const undone = todos.filter((t) => !t.done);
  const top = undone.slice(0, 3);

  return (
    <CardShell delay={delay} onClick={() => gotoPanel("todo")} ariaLabel="查看待办清单">
      <CardBody delay={delay}>
        <CardHead
          label="待办"
          note={undone.length > 0 ? `${undone.length} 项` : undefined}
        />
        {undone.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-zinc-400 dark:text-zinc-500">
            <CheckCheck size={20} strokeWidth={1.5} aria-hidden />
            <span className="text-xs font-light">{todos.length > 0 ? "全部完成" : "今天没有待办"}</span>
          </div>
        ) : (
          <ul className="mt-2 flex-1 space-y-[7px] overflow-hidden">
            {top.map((t) => (
              <li key={t.id} className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="h-[7px] w-[7px] shrink-0 rounded-full border"
                  style={{ borderColor: "var(--ui-accent, #8b5cf6)" }}
                />
                <span className="truncate text-xs font-light text-zinc-600 dark:text-zinc-300">
                  {t.text}
                </span>
              </li>
            ))}
            {undone.length > top.length && (
              <li className="pl-[15px] text-[10px] font-light text-zinc-400 dark:text-zinc-500">
                还有 {undone.length - top.length} 项…
              </li>
            )}
          </ul>
        )}
      </CardBody>
    </CardShell>
  );
}

/* ---------- 倒数日卡 ---------- */

/** datetime-local 串 → {date, hhmm}；非法返回 null */
function parseTarget(v: string): { date: Date; hhmm: string } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  if (Number.isNaN(d.getTime())) return null;
  return { date: d, hhmm: `${m[4]}:${m[5]}` };
}

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

/** 倒数日展示态计算：daily = 距下一个 HH:mm 的剩余毫秒；days = 距目标日天数 */
function countdownState(target: string, now: Date) {
  const t = parseTarget(target);
  if (!t) return null;
  if (t.hhmm !== "00:00") {
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), t.date.getHours(), t.date.getMinutes(), 0, 0);
    if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
    return { mode: "daily" as const, msLeft: next.getTime() - now.getTime() };
  }
  const targetMid = new Date(t.date.getFullYear(), t.date.getMonth(), t.date.getDate());
  const todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((targetMid.getTime() - todayMid.getTime()) / 86400000);
  return { mode: "days" as const, days };
}

function CountdownCard({ delay }: { delay: number }) {
  const { settings, patchSettings } = useStartPage();
  const now = useNow(1000);
  const title = settings.countdownTitle.trim() || "倒数日";
  const target = settings.countdownTarget;
  const st = target ? countdownState(target, now) : null;

  const [editing, setEditing] = useState(false);
  const [fTitle, setFTitle] = useState(title);
  const [fTarget, setFTarget] = useState(target);
  const titleRef = useRef<HTMLInputElement | null>(null);

  function openEdit() {
    setFTitle(settings.countdownTitle);
    setFTarget(settings.countdownTarget);
    setEditing(true);
  }
  function save() {
    patchSettings({
      countdownTitle: fTitle.trim() || "倒数日",
      countdownTarget: fTarget.trim(),
    });
    setEditing(false);
  }
  function clear() {
    patchSettings({ countdownTarget: "" });
    setEditing(false);
  }
  useEffect(() => {
    if (editing) titleRef.current?.focus();
  }, [editing]);

  /* 编辑态：卡片内联表单（标题 + datetime-local + 保存/取消/清除） */
  if (editing) {
    return (
      <CardShell delay={delay}>
        <CardBody delay={delay}>
          <CardHead label="倒数日" note="编辑" />
          <form
            className="mt-2 flex flex-1 flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <input
              ref={titleRef}
              value={fTitle}
              onChange={(e) => setFTitle(e.target.value)}
              placeholder="名称（如 下班 / 生日）"
              aria-label="倒数日名称"
              className="w-full rounded-md bg-zinc-900/[0.05] px-2 py-1 text-xs font-light text-zinc-700 outline-none ring-[var(--ui-accent)] focus:ring-1 dark:bg-white/10 dark:text-zinc-200"
            />
            <input
              type="datetime-local"
              value={fTarget}
              onChange={(e) => setFTarget(e.target.value)}
              aria-label="目标日期与时间"
              className="w-full rounded-md bg-zinc-900/[0.05] px-2 py-1 text-xs font-light text-zinc-700 outline-none ring-[var(--ui-accent)] focus:ring-1 dark:bg-white/10 dark:text-zinc-200 dark:[color-scheme:dark]"
            />
            <div className="mt-auto flex items-center gap-2">
              <button
                type="submit"
                className="rounded-md px-2.5 py-1 text-[11px] font-normal text-white"
                style={{ background: "var(--ui-accent, #8b5cf6)" }}
              >
                保存
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="text-[11px] font-light text-zinc-400 transition-colors hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                取消
              </button>
              {target && (
                <button
                  type="button"
                  onClick={clear}
                  className="ml-auto text-[11px] font-light text-zinc-400 transition-colors hover:text-zinc-600 dark:hover:text-zinc-200"
                >
                  清除
                </button>
              )}
            </div>
          </form>
        </CardBody>
      </CardShell>
    );
  }

  /* 展示态 */
  return (
    <CardShell delay={delay} onClick={openEdit} ariaLabel={`编辑倒数日${title ? `（${title}）` : ""}`} ariaExpanded={editing}>
      <CardBody delay={delay}>
        <CardHead
          label={title}
          note={st ? (st.mode === "daily" ? "每日" : "倒数") : undefined}
        />
        {!st ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-zinc-400 dark:text-zinc-500">
            <CalendarClock size={20} strokeWidth={1.5} aria-hidden />
            <span className="text-xs font-light">点击设置时间</span>
          </div>
        ) : st.mode === "daily" ? (
          <div className="flex flex-1 flex-col justify-center">
            <div className="text-2xl font-extralight leading-none tracking-tight text-zinc-900 tabular-nums dark:text-zinc-100">
              {(() => {
                const s = Math.max(0, Math.floor(st.msLeft / 1000));
                const hh = Math.floor(s / 3600);
                const mm = Math.floor((s % 3600) / 60);
                const ss = s % 60;
                return `${pad2(hh)}:${pad2(mm)}:${pad2(ss)}`;
              })()}
            </div>
            <div className="mt-1.5 text-[10px] font-light text-zinc-400 dark:text-zinc-500">
              距每天 {parseTarget(target)!.hhmm}
            </div>
          </div>
        ) : (
          <div className="flex flex-1 flex-col justify-center">
            {st.days > 0 ? (
              <>
                <div className="text-[2.6rem] font-extralight leading-none tracking-tight text-zinc-900 tabular-nums dark:text-zinc-100">
                  {st.days}
                  <span className="ml-1 text-base font-light">天</span>
                </div>
                <div className="mt-1.5 text-[10px] font-light text-zinc-400 dark:text-zinc-500">
                  还有 {st.days} 天
                </div>
              </>
            ) : st.days === 0 ? (
              <div className="text-xl font-extralight leading-none text-zinc-900 dark:text-zinc-100">就是今天</div>
            ) : (
              <>
                <div className="text-[2.6rem] font-extralight leading-none tracking-tight text-zinc-900 tabular-nums dark:text-zinc-100">
                  {Math.abs(st.days)}
                  <span className="ml-1 text-base font-light">天</span>
                </div>
                <div className="mt-1.5 text-[10px] font-light text-zinc-400 dark:text-zinc-500">已经过去</div>
              </>
            )}
          </div>
        )}
      </CardBody>
    </CardShell>
  );
}

/* ---------- 行组装 ---------- */

function WidgetRowInner() {
  const sp = useStartPage();
  const now = useNow(1000);
  /* 渲染序恒为规范序过滤（存量顺序不敏感）；迁移 effect 未跑的极早帧按默认集兜底 */
  const ids = WIDGET_ORDER.filter(
    (id) => (sp.settings.widgets ?? DEFAULT_WIDGETS).includes(id)
  );
  if (ids.length === 0) return null;

  const delayOf = (i: number) => 0.24 + i * 0.07;
  let k = 0;
  return (
    <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-4" role="list" aria-label="小组件">
      {ids.map((id) => {
        const delay = delayOf(k++);
        switch (id) {
          case "calendar":
            return <CalendarCard key={id} now={now} delay={delay} />;
          case "weather":
            return <WeatherCard key={id} delay={delay} />;
          case "todo":
            return <TodoCard key={id} delay={delay} />;
          case "countdown":
            return <CountdownCard key={id} delay={delay} />;
        }
      })}
    </div>
  );
}

const WidgetRow = memo(WidgetRowInner);
export default WidgetRow;
