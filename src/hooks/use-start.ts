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
