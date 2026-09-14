"use client";

/* 「检查更新」（v8.4.8）——「更新日志」旁的手动云端更新入口。
 *
 * 架构对齐 v8.4.5+ 本地直载壳（shell-bridge.js / ext-bg.js / cs-snap/sw.js）：
 *   · 触发：chrome.storage.local 写 csSnapCheck —— ext-bg 自 v8.4.5 起的
 *     常驻手动通道（onChanged 唤醒后台 SW 执行 snapCheck）。v8.4.8 起携带
 *     { manual: true } 标记请求过程回写；旧壳（8.4.5~8.4.7）无回写也能触发，
 *     本组件随快照/包体下发时对存量装机全兼容；
 *   · 预判：页面直接 fetch 镜像 version.json（GitHub Pages 全开 CORS），
 *     云端版本 ≤ 本地地板 max(内嵌版, 快照 meta) → 秒回「已是最新」，
 *     连不上更新源 → 如实报错，不冒充「最新」；
 *   · 结果：双通道——新壳 ext-bg 写 csSnapStatus（checking/downloading/
 *     updated/latest/error，带下载进度 done/total）；旧壳无回写 → 轮询
 *     IndexedDB chushi-snap.kv.meta 等版本前进（12MB 量级给足 90s 预算）；
 *   · 启用：快照提交后顶层导航回 shell.html 重走版本路由（快照较新时即达
 *     新版，地址栏仍被壳收敛为 index.html）。顶层直载 / 壳内 iframe 两种
 *     宿主同源可达；SW 合成的快照文档同为扩展 origin，一律适用；
 *   · 宿主守卫：网页版 /web/（无 chrome.runtime.id）整颗隐藏；一切
 *     chrome 访问走局部结构类型 + try/catch，绝不影响纯网页渲染。
 */

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { RefreshCw } from "lucide-react";

const EASE = [0.22, 1, 0.36, 1] as const;

/* —— chrome 局部结构类型（与 PresetWidgets 同约定：不引 @types/chrome） —— */
type CsChrome = {
  runtime?: {
    id?: string;
    getManifest?: () => { version?: string };
    getURL?: (path: string) => string;
  };
  storage?: {
    local?: {
      set?: (items: Record<string, unknown>, cb?: () => void) => void;
    };
    onChanged?: {
      addListener?: (fn: (ch: Record<string, { newValue?: unknown }>, area: string) => void) => void;
      removeListener?: (fn: (ch: Record<string, { newValue?: unknown }>, area: string) => void) => void;
    };
  };
};
const csChrome = (): CsChrome | undefined =>
  (window as unknown as { chrome?: CsChrome }).chrome;

/* —— 版本比较（与 shell-bridge/ext-bg/sw.js 四方同构：逐段数值，缺段补 0） —— */
function cmpVer(a: string, b: string): number {
  const pa = String(a || "").split(".").map((x) => parseInt(x, 10) || 0);
  const pb = String(b || "").split(".").map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}

/* —— 快照 meta 读取（库/键与 ext-bg、shell-bridge、sw.js 三份同构一致） —— */
function snapMetaRead(): Promise<{ v?: string } | null> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v: { v?: string } | null) => {
      if (!settled) {
        settled = true;
        resolve(v);
      }
    };
    try {
      const rq = indexedDB.open("chushi-snap", 1);
      rq.onupgradeneeded = () => {
        const db = rq.result;
        if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
        if (!db.objectStoreNames.contains("files")) db.createObjectStore("files");
      };
      rq.onerror = () => done(null);
      rq.onsuccess = () => {
        const db = rq.result;
        try {
          const tx = db.transaction("kv", "readonly");
          const g = tx.objectStore("kv").get("meta");
          g.onsuccess = () => done((g.result as { v?: string }) || null);
          g.onerror = () => done(null);
          tx.oncomplete = () => {
            try {
              db.close();
            } catch {
              /* noop */
            }
          };
        } catch {
          done(null);
        }
      };
    } catch {
      done(null);
    }
  });
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

type Phase = "idle" | "checking" | "downloading" | "latest" | "updated" | "error";

function CheckUpdateButton() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [note, setNote] = useState("");
  const [targetV, setTargetV] = useState("");
  const [busy, setBusy] = useState(false);

  const runIdRef = useRef(0);
  const settledRef = useRef(false);

  const extHost = !!csChrome()?.runtime?.id && !!csChrome()?.storage?.local;

  const settle = useCallback((run: number, p: Phase, n: string) => {
    if (run !== runIdRef.current || settledRef.current) return;
    settledRef.current = true;
    setPhase(p);
    setNote(n);
    setBusy(false);
  }, []);

  const autoReset = useCallback((run: number) => {
    const my = run;
    setTimeout(() => {
      if (my !== runIdRef.current) return;
      settledRef.current = false;
      runIdRef.current = my + 1;
      setPhase("idle");
      setNote("");
    }, 6000);
  }, []);

  /* —— 通道①：新壳 ext-bg 的过程回写（csSnapStatus）。只在本次手动检查
     进行中消费；后台 6h 自动检查保持静默，不会打扰面板。 —— */
  useEffect(() => {
    if (!extHost) return;
    const oc = csChrome()?.storage?.onChanged;
    if (!oc?.addListener) return;
    const handler = (ch: Record<string, { newValue?: unknown }>, area: string) => {
      if (area !== "local" || !ch?.csSnapStatus) return;
      const st = ch.csSnapStatus.newValue as
        | { state?: string; v?: string; done?: number; total?: number; err?: string }
        | undefined;
      if (!st || typeof st !== "object" || !st.state) return;
      const run = runIdRef.current;
      if (run === 0 || settledRef.current) return;
      if (st.state === "downloading") {
        setPhase("downloading");
        setTargetV(String(st.v || ""));
        setNote(
          Number.isFinite(st.total) && (st.total as number) > 0
            ? `正在下载 v${st.v}（${st.done || 0}/${st.total}）…`
            : `正在下载 v${st.v}…`
        );
        return;
      }
      if (st.state === "updated") {
        settle(run, "updated", `已更新到 v${st.v || targetV}`);
      } else if (st.state === "latest") {
        settle(run, "latest", `已是最新版本 v${st.v || ""}`.trim());
        autoReset(run);
      } else if (st.state === "error") {
        settle(run, "error", st.err === "network" ? "检查失败：暂时连不上更新源" : "下载未完成，请稍后重试");
        autoReset(run);
      }
    };
    oc.addListener(handler);
    return () => {
      try {
        oc.removeListener?.(handler);
      } catch {
        /* noop */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extHost, settle, autoReset]);

  /* —— 启用新版：顶层导航回壳页，重走版本路由（快照就位即达新版） —— */
  const apply = useCallback(() => {
    const c = csChrome();
    const url = c?.runtime?.getURL?.("shell.html");
    try {
      if (url && window.top && window.top !== window) {
        window.top.location.href = url;
        return;
      }
    } catch {
      /* 顶层不可达（异常宿主）：退回自刷新 */
    }
    if (url) {
      try {
        window.location.href = url;
        return;
      } catch {
        /* noop */
      }
    }
    window.location.reload();
  }, []);

  /* —— 主流程：预判 → 触发 → 双通道等结果 —— */
  const check = useCallback(async () => {
    if (busy) return;
    const c = csChrome();
    if (!c?.runtime?.id || !c.storage?.local?.set) return;
    const run = runIdRef.current + 1;
    runIdRef.current = run;
    settledRef.current = false;
    setBusy(true);
    setPhase("checking");
    setNote("正在检查更新…");

    const bundleV = String(c.runtime.getManifest?.().version || "");
    const meta = await snapMetaRead();
    const floor =
      meta?.v && bundleV && cmpVer(meta.v, bundleV) > 0 ? meta.v : bundleV;

    /* 云端预判（镜像 Pages 全开 CORS；10s 超时） */
    let cloudV = "";
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 10000);
      const r = await fetch("https://lxgssy.github.io/Start-chushi/version.json", {
        cache: "no-store",
        signal: ctrl.signal,
      });
      clearTimeout(t);
      if (r.ok) {
        const j = (await r.json()) as { v?: string };
        if (j && typeof j.v === "string") cloudV = j.v;
      }
    } catch {
      /* 断网/被墙：cloudV 保持空 */
    }
    if (run !== runIdRef.current) return;

    if (!cloudV) {
      settle(run, "error", "检查失败：暂时连不上更新源");
      autoReset(run);
      return;
    }
    if (!floor || cmpVer(cloudV, floor) <= 0) {
      settle(run, "latest", `已是最新版本 v${floor || cloudV}`);
      autoReset(run);
      return;
    }

    /* 发现新版本：触发后台更新器（旧壳新壳通用的 csSnapCheck 通道） */
    setPhase("downloading");
    setTargetV(cloudV);
    setNote(`发现新版本 v${cloudV}，正在下载…`);
    await new Promise<void>((res) => {
      try {
        c.storage.local!.set!({ csSnapCheck: { ts: Date.now(), manual: true } }, () => res());
      } catch {
        res();
      }
    });
    if (run !== runIdRef.current) return;

    /* 通道②：meta 轮询（旧壳无状态回写时的通用兜底；90s 预算） */
    const t0 = Date.now();
    while (Date.now() - t0 < 90000) {
      await sleep(800);
      if (run !== runIdRef.current || settledRef.current) return;
      const m = await snapMetaRead();
      if (m?.v && floor && cmpVer(m.v, floor) > 0) {
        settle(run, "updated", `已更新到 v${m.v}`);
        return;
      }
    }
    if (run !== runIdRef.current || settledRef.current) return;
    settle(run, "error", "下载未能在限时内完成，请稍后再试");
    autoReset(run);
  }, [busy, settle, autoReset]);

  const onClick = useCallback(() => {
    if (phase === "updated") {
      apply();
      return;
    }
    void check();
  }, [phase, apply, check]);

  if (!extHost) return null;

  const label =
    phase === "checking"
      ? "检查中…"
      : phase === "downloading"
        ? "下载中…"
        : phase === "updated"
          ? `启用新版 v${targetV}`
          : "检查更新";

  const isApply = phase === "updated";

  return (
    <div className="flex flex-col items-start gap-1.5">
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        aria-live="polite"
        className={`group inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[11px] font-light tracking-wide transition-colors duration-300 disabled:cursor-default ${
          isApply
            ? "border-transparent text-white"
            : "border-zinc-900/10 text-zinc-600 hover:bg-zinc-900/5 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/10"
        }`}
        style={isApply ? { background: "var(--ui-accent, #8b5cf6)" } : undefined}
      >
        {(phase === "checking" || phase === "downloading") && (
          <RefreshCw
            className="h-3 w-3 animate-spin opacity-70"
            strokeWidth={1.5}
            aria-hidden
          />
        )}
        {isApply && (
          <RefreshCw
            className="h-3 w-3 opacity-80 transition-transform duration-500 group-hover:rotate-180"
            strokeWidth={1.5}
            aria-hidden
          />
        )}
        <span>{label}</span>
      </button>
      <AnimatePresence>
        {note && (
          <motion.span
            key={note}
            initial={{ opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -3 }}
            transition={{ duration: 0.3, ease: EASE }}
            className="max-w-[240px] text-[10.5px] font-extralight leading-relaxed tracking-wide"
            style={{
              color:
                phase === "error"
                  ? "rgba(244,63,94,.75)"
                  : phase === "updated" || phase === "latest"
                    ? "var(--ui-accent, #8b5cf6)"
                    : undefined,
            }}
          >
            {note}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}

export default memo(CheckUpdateButton);
