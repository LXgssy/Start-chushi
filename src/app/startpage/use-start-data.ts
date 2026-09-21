"use client";

/* 「初始」— 数据域：快捷链接 / 待办 / 便签 / 定位与天气 / 备份导入导出
 *
 * 天气策略：定位就绪后拉取预报，30 分钟轮询 + 网络恢复即刻重试；
 * 成功落快照，失败回退最近快照（面板标注缓存时间），无快照才报错。
 */

import { useCallback, useEffect, useState } from "react";
import { useStored } from "@/hooks/use-start";
import {
  DEFAULT_SETTINGS,
  INITIAL_WEATHER,
  type Place,
  type Settings,
  type StartLink,
  type TodoItem,
  type WeatherState,
} from "@/lib/startpage/types";
import { fetchForecast, readWeatherSnapshot, writeWeatherSnapshot } from "@/lib/startpage/weather";
import type { ToastFn } from "./toast-types";
import { KEYS } from "./keys";

const DEFAULT_LINKS: StartLink[] = [
  { id: "gh", name: "GitHub", url: "https://github.com" },
  { id: "bili", name: "哔哩哔哩", url: "https://www.bilibili.com" },
  { id: "zhihu", name: "知乎", url: "https://www.zhihu.com" },
  { id: "yt", name: "YouTube", url: "https://www.youtube.com" },
  { id: "weibo", name: "微博", url: "https://weibo.com" },
  { id: "163music", name: "网易云音乐", url: "https://music.163.com" },
];

/** 天气刷新周期（30 分钟） */
const WEATHER_INTERVAL_MS = 30 * 60 * 1000;

export function useStartData(
  mounted: boolean,
  toast: ToastFn,
  /** 备份导入的设置恢复用（整组替换，非 patch）——来自 settings 域 */
  replaceSettings: (s: Settings) => void,
  /** 备份导出内容（引用最新 settings 值） */
  settings: Settings
) {
  const [links, setLinks] = useStored<StartLink[]>(KEYS.links, DEFAULT_LINKS);
  const [todos, setTodos] = useStored<TodoItem[]>(KEYS.todos, []);
  const [note, setNote] = useStored<string>(KEYS.note, "");
  const [place, setPlace] = useStored<Place>(KEYS.place, {});
  const [weather, setWeather] = useState<WeatherState>(INITIAL_WEATHER);

  const commitNote = useCallback((v: string) => setNote(v), [setNote]);

  /* ---------- 天气获取（成功落快照，失败回退快照 + 自动重试） ---------- */
  useEffect(() => {
    if (!mounted) return;
    if (place.lat == null || place.lon == null) return;
    let cancelled = false;

    async function load() {
      setWeather((w) => ({ ...w, loading: true }));
      try {
        const r = await fetchForecast(place);
        if (!cancelled) {
          writeWeatherSnapshot(r);
          setWeather({
            ...r,
            loading: false,
            error: null,
            city: place.name ?? "",
            staleAt: null,
          });
        }
      } catch (e) {
        if (cancelled) return;
        /* 限流/断网回退：展示最近一次成功快照（面板标注缓存时间） */
        const snap = readWeatherSnapshot();
        if (snap) {
          setWeather({
            ...snap.data,
            loading: false,
            error: null,
            city: place.name ?? "",
            staleAt: snap.at,
          });
        } else {
          setWeather((w) => ({
            ...w,
            loading: false,
            error: e instanceof Error ? e.message : "天气获取失败，请检查网络后重试",
          }));
        }
      }
    }

    load();
    const t = setInterval(load, WEATHER_INTERVAL_MS);
    /* 网络恢复即刻重试（限流回退态最常见的恢复路径） */
    const onOnline = () => {
      if (!cancelled) load();
    };
    window.addEventListener("online", onOnline);
    return () => {
      cancelled = true;
      clearInterval(t);
      window.removeEventListener("online", onOnline);
    };
  }, [mounted, place]);

  /* ---------- 备份导出（JSON 下载） ---------- */
  const exportData = useCallback(() => {
    const data = {
      version: 1,
      exportedAt: new Date().toISOString(),
      settings,
      links,
      todos,
      note,
      place,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `初始-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast({ title: "已导出备份文件" });
  },
    [settings, links, todos, note, place, toast]
  );

  /* ---------- 备份导入（JSON 校验后按段恢复） ---------- */
  const importData = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const d = JSON.parse(String(reader.result));
          if (typeof d !== "object" || d == null) throw new Error("bad file");
          if (d.settings && typeof d.settings === "object") {
            replaceSettings({ ...DEFAULT_SETTINGS, ...d.settings });
          }
          if (Array.isArray(d.links)) setLinks(d.links as StartLink[]);
          if (Array.isArray(d.todos)) setTodos(d.todos as TodoItem[]);
          if (typeof d.note === "string") setNote(d.note);
          if (d.place && typeof d.place === "object") setPlace(d.place as Place);
          toast({ title: "导入完成", description: "数据已恢复" });
        } catch {
          toast({ title: "导入失败", description: "文件格式不正确" });
        }
      };
      reader.readAsText(file);
    },
    [replaceSettings, setLinks, setTodos, setNote, setPlace, toast]
  );

  /* ---------- 恢复默认：清空全部持久化键并整页重载 ----------
     键位表遍历保证无孤儿数据（新增键必须登记 keys.ts）。 */
  const resetAll = useCallback(() => {
    for (const key of Object.values(KEYS)) {
      try {
        localStorage.removeItem(key);
      } catch {
        /* noop */
      }
    }
    window.location.reload();
  }, []);

  return {
    links,
    setLinks,
    todos,
    setTodos,
    note,
    commitNote,
    place,
    setPlace,
    weather,
    exportData,
    importData,
    resetAll,
  };
}
