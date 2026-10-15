"use client";

/* 自定义图标的 React 响应式绑定（v8.7.105）。
 * custom-icons.ts 是纯存储模块；这里提供组件树内的响应式读取：
 *   · 同页：LinkDialog 上传/恢复后 dispatch start:custom-icons-changed
 *     （storage 事件不触发同页监听，必须显式广播）；
 *   · 跨页：原生 storage 事件（同源其他标签页的改动热跟随）。
 */

import { useEffect, useState } from "react";
import { readCustomIcons, type CustomIconMap } from "./custom-icons";

export const CUSTOM_ICONS_EVENT = "start:custom-icons-changed";

export function useCustomIcons(): CustomIconMap {
  const [map, setMap] = useState<CustomIconMap>(() => readCustomIcons());

  useEffect(() => {
    const refresh = () => setMap(readCustomIcons());
    const onStorage = (e: StorageEvent) => {
      if (!e.key || e.key === "start:custom-icons") refresh();
    };
    window.addEventListener(CUSTOM_ICONS_EVENT, refresh);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(CUSTOM_ICONS_EVENT, refresh);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return map;
}
