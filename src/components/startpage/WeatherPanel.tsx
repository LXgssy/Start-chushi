"use client";

import { memo, useEffect, useRef, useState } from "react";
import { Loader2, MapPin, Search } from "lucide-react";
import WeatherGlyph from "./WeatherGlyph";
import {
  CMA_FIRST,
  fetchForecast,
  geolocate,
  reverseCity,
  searchCity,
  weatherText,
  type CityOption,
} from "@/lib/startpage/weather";
import type { Place, WeatherState } from "@/lib/startpage/types";
import { uid } from "@/hooks/use-start";

function WeatherPanel({
  weather,
  place,
  onPlaceChange,
}: {
  weather: WeatherState;
  place: Place;
  onPlaceChange: (p: Place) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CityOption[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState(false);
  /* 竞态守卫必须用 ref：用 state 的话，setTimeout 闭包捕获的是旧渲染的
   * searchId，qid === searchId 恒为 false → setResults 永不执行，搜索
   * 结果永远不渲染（2026-08-30 修复的城市切换 bug 根因） */
  const searchIdRef = useRef("");
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function locate() {
    setLocating(true);
    setLocError(false);
    try {
      const p = await geolocate();
      const city = await reverseCity(p.lat!, p.lon!);
      onPlaceChange({ ...p, name: city || "我的位置" });
    } catch {
      setLocError(true); // 定位失败可手动搜索城市
    } finally {
      setLocating(false);
    }
  }

  function pickCity(c: CityOption) {
    setResults(null);
    setQuery("");
    onPlaceChange({ lat: c.lat, lon: c.lon, name: c.name });
  }

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    if (!query.trim()) {
      setResults(null);
      return;
    }
    const qid = uid();
    searchIdRef.current = qid;
    debounce.current = setTimeout(async () => {
      setSearching(true);
      const list = await searchCity(query.trim());
      if (qid === searchIdRef.current) setResults(list);
      setSearching(false);
    }, 350);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [query]);

  return (
    <div className="flex flex-col">
      {/* 当前天气 */}
      <div className="flex items-center justify-between px-1 pb-4 pt-1">
        <div className="flex items-baseline gap-2">
          <span className="text-5xl font-extralight tracking-tight text-zinc-900 dark:text-zinc-50 tabular-nums">
            {weather.temp ?? "--"}
            <span className="ml-0.5 text-lg align-top text-zinc-400">°</span>
          </span>
          {weather.temp == null && !weather.loading && (
            <span className="text-sm font-light text-zinc-500 dark:text-zinc-400">未获取数据</span>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 text-right">
          <WeatherGlyph
            code={weather.code}
            size={30}
            className="text-zinc-600 dark:text-zinc-300"
          />
          <span className="text-xs font-light tracking-wider text-zinc-500 dark:text-zinc-400">
            {weatherText(weather.code)}
            {weather.hi != null && (
              <>
                {" · "}
                {weather.lo}° / {weather.hi}°
              </>
            )}
          </span>
        </div>
      </div>

      {/* 详情行 */}
      {(weather.humidity != null ||
        weather.wind != null ||
        weather.staleAt != null) && (
        <div className="mb-3 flex flex-wrap gap-2 px-1 text-xs font-light tracking-wide text-zinc-500 dark:text-zinc-400">
          <span className="glass-chip rounded-full px-2.5 py-1">
            湿度 {weather.humidity ?? "--"}%
          </span>
          <span className="glass-chip rounded-full px-2.5 py-1">
            风速 {weather.wind ?? "--"} km/h
          </span>
          {weather.city && (
            <span className="glass-chip rounded-full px-2.5 py-1">{weather.city}</span>
          )}
          {weather.staleAt != null && (
            <span className="glass-chip rounded-full px-2.5 py-1">
              缓存 ·{" "}
              {new Date(weather.staleAt).toTimeString().slice(0, 5)} 采集
            </span>
          )}
        </div>
      )}

      {/* 加载 / 错误状态 */}
      {weather.loading && weather.temp == null && (
        <p className="flex items-center gap-2 px-1 py-2 text-xs font-light text-zinc-500 dark:text-zinc-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} /> 正在获取天气…
        </p>
      )}
      {weather.error && (
        <p className="px-1 py-2 text-xs font-light text-red-400/90">{weather.error}</p>
      )}

      {/* 逐小时 */}
      {weather.hours.length > 0 && (
        <div className="slim-scroll mb-3 overflow-x-auto pb-1 pt-1">
          <div className="flex min-w-max items-end gap-1 px-1">
            {weather.hours.slice(0, 12).map((h, i) => {
              const temps = weather.hours.slice(0, 12).map((x) => x.temp);
              const min = Math.min(...temps);
              const max = Math.max(...temps);
              const ratio = max === min ? 0.6 : 0.25 + ((h.temp - min) / (max - min)) * 0.75;
              const barH = Math.round(10 + ratio * 18);
              return (
                <div key={i} className="flex w-[38px] flex-col items-center gap-1.5">
                  <span className="text-[10px] font-light tracking-wide text-zinc-500 dark:text-zinc-400 tabular-nums">
                    {h.temp}°
                  </span>
                  <div
                    className={`w-1 rounded-full bg-gradient-to-t ${
                      i === 0
                        ? "accent-bar"
                        : "from-zinc-300/60 to-zinc-400/80 dark:from-white/5 dark:to-white/25"
                    }`}
                    style={{ height: barH }}
                  />
                  <WeatherGlyph
                    code={h.code}
                    size={13}
                    className="text-zinc-400 dark:text-zinc-500"
                  />
                  <span className="text-[10px] font-light text-zinc-400 dark:text-zinc-500 tabular-nums">
                    {i === 0 ? "现在" : h.time}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 位置操作 */}
      <div className="mt-1 border-t border-zinc-900/5 pt-3 dark:border-white/5">
        {!place.lat && (
          <button
            type="button"
            onClick={locate}
            disabled={locating}
            className="mb-2 flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-900/10 py-2.5 text-xs font-light tracking-wide text-zinc-600 transition-colors duration-300 hover:bg-zinc-900/5 disabled:opacity-50 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/10"
          >
            {locating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} />
            ) : (
              <MapPin className="h-3.5 w-3.5" strokeWidth={1.5} />
            )}
            使用当前位置
          </button>
        )}
        {locError && (
          <p className="mb-1 px-1 text-xs font-light text-red-400/90">
            定位未授权，可手动搜索城市
          </p>
        )}
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400 dark:text-zinc-500"
            strokeWidth={1.5}
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={place.name ? `切换城市（当前：${place.name}）` : "搜索城市，如 上海"}
            aria-label="搜索城市"
            className="h-9 w-full rounded-xl border border-transparent bg-zinc-900/[0.04] pl-8 pr-3 text-xs font-light text-zinc-700 outline-none transition-all duration-300 placeholder:text-zinc-400 accent-focus focus:bg-transparent dark:bg-white/5 dark:text-zinc-200 dark:placeholder:text-zinc-500"
          />
        </div>
        {results && results.length === 0 && !searching && (
          <p className="wresult-list px-1 pt-2 text-xs font-light text-zinc-400">没有找到相关城市</p>
        )}
        {results && results.length > 0 && (
          <ul className="wresult-list mt-1.5 space-y-0.5">
            {results.map((c, i) => (
              <li
                key={`${c.name}-${c.lat}`}
                className="wresult-item"
                style={{ "--i": i } as React.CSSProperties}
              >
                <button
                  type="button"
                  onClick={() => pickCity(c)}
                  className="w-full truncate rounded-lg px-3 py-1.5 text-left text-xs font-light text-zinc-600 transition-colors duration-150 hover:bg-zinc-900/5 dark:text-zinc-300 dark:hover:bg-white/10"
                >
                  {c.label}
                </button>
              </li>
            ))}
          </ul>
        )}
        {/* 数据源署名：Open-Meteo 免费条款（CC-BY 4.0）要求在应用内以链接形式归属 */}
        <p className="px-1 pt-2.5 text-[10px] font-light tracking-wide text-zinc-400 dark:text-zinc-500">
          天气数据 ·{" "}
          {CMA_FIRST && (
            <>
              <a
                href="https://weather.cma.cn"
                target="_blank"
                rel="noreferrer"
                className="transition-colors duration-300 hover:text-zinc-600 dark:hover:text-zinc-300"
              >
                中国气象局
              </a>
              {" / "}
            </>
          )}
          <a
            href="https://open-meteo.com"
            target="_blank"
            rel="noreferrer"
            className="transition-colors duration-300 hover:text-zinc-600 dark:hover:text-zinc-300"
          >
            Open-Meteo
          </a>
        </p>
      </div>
    </div>
  );
}

export default memo(WeatherPanel);
