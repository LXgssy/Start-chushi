"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * localStorage 持久化状态（懒初始化，客户端安全）。
 * 注意：使用该 Hook 的组件必须在 mounted 门控之后渲染，
 * 以避免 SSR 与首帧水合不一致。
 */
export function useStored<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => readLS(key, initial));

  useEffect(() => {
    writeLS(key, value);
  }, [key, value]);

  return [value, setValue] as const;
}

/* ---------- v8.7.156 拖拽期写合并（多开移动磁贴掉帧根修 · 主线程侧） ----------
 * 根因（用户实测「多开新标签页然后移动磁贴时严重掉帧」）：useStored 每次
 * value 变化即同步 JSON.stringify + localStorage.setItem——拖拽让位时
 * handleDragOver 每跨一格触发一次 setLinks，磁贴墙动画最重的时刻里高频
 * 同步磁盘写（主线程阻塞），多开场景 GPU 预算紧张时掉帧被进一步放大。
 * 修法：写延迟 deferMs 合并（默认 800ms——连续让位只落最后一笔，拖拽
 * 结束后 ≤800ms 落盘），并三路兜底防丢：
 *   · pagehide / visibilitychange→hidden 立即 flush（关页/切走必落盘）；
 *   · 跨文档 storage 事件消费方（弹窗热跟随）读的是对方同步写，不受影响；
 *   · 云同步模块晚 ≤800ms 读到新值，语义不变。
 * 仅用于 start:links（写频与数组体积双高的键）；settings/todos/note 契约
 * 不动（仍走同步 useStored）。 */
export function useStoredDeferred<T>(key: string, initial: T, deferMs = 800) {
  const [value, setValue] = useState<T>(() => readLS(key, initial));
  const valueRef = useRef(value);
  valueRef.current = value;
  /* 脏标记：只有「状态已变、debounce 尚未落盘」时 flush 才允许写盘。
     页面 hide/unmount 时刻的内存值可能与磁盘一致（甚至比磁盘旧——
     弹窗直写后页面尚未消化 storage 事件），无条件 flush 会把外部写入
     冲掉（冒烟种入被默认值覆盖实锤：pagehide flush 把旧值刷回）。
     debounce 调度即置脏、落盘即清脏；storage 事件并入也走同一条
     debounce 链，flush 语义自洽。 */
  const dirtyRef = useRef(false);

  useEffect(() => {
    dirtyRef.current = true;
    const t = setTimeout(() => {
      dirtyRef.current = false;
      writeLS(key, valueRef.current);
    }, deferMs);
    return () => clearTimeout(t);
  }, [key, value, deferMs]);

  useEffect(() => {
    const flush = () => {
      if (!dirtyRef.current) return;
      dirtyRef.current = false;
      writeLS(key, valueRef.current);
    };
    const onVis = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVis);
      flush();
    };
  }, [key]);

  return [value, setValue] as const;
}

const noopSubscribe = () => () => {};

/** 客户端挂载完成（SSR/水合期为 false，无 setState 级联） */
export function useMounted() {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false
  );
}

/** 每秒滴答的当前时间 */
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function readLS<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeLS(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 隐私模式等场景下静默失败 */
  }
}

export function removeLS(keys: string[]) {
  if (typeof window === "undefined") return;
  for (const k of keys) {
    try {
      window.localStorage.removeItem(k);
    } catch {
      /* noop */
    }
  }
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

/* ---------- v8.7.171 useBgFreeze 退役 ----------
 * 「暂停背景动画」闸门随可见动画永动律退役（globals.css 背景动画永动律
 * 注释）：拖拽/纱罩/抽屉全场景动画照跑，性能由极光降分辨率栅格化承担。
 * document.hidden 后台仍由 AuroraBackground 视频闸与 globals cs-hidden 管。 */
