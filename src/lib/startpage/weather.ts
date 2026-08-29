/* 天气：Open-Meteo 免费接口 + 城市搜索 + 天气代码中文化 */

import type { Place, WeatherHour } from "./types";

export interface CityOption {
  name: string;
  label: string;
  lat: number;
  lon: number;
}

function describeCode(code: number): { text: string; group: WeatherGroup } {
  if (code === 0) return { text: "晴", group: "clear" };
  if (code === 1) return { text: "大致晴朗", group: "partly" };
  if (code === 2) return { text: "多云", group: "partly" };
  if (code === 3) return { text: "阴", group: "cloudy" };
  if (code === 45 || code === 48) return { text: "雾", group: "fog" };
  if (code >= 51 && code <= 57) return { text: "毛毛雨", group: "rain" };
  if (code >= 61 && code <= 65) return { text: "雨", group: "rain" };
  if (code === 66 || code === 67) return { text: "冻雨", group: "rain" };
  if (code >= 71 && code <= 77) return { text: "雪", group: "snow" };
  if (code === 80 || code === 81 || code === 82) return { text: "阵雨", group: "rain" };
  if (code === 85 || code === 86) return { text: "阵雪", group: "snow" };
  if (code >= 95) return { text: "雷阵雨", group: "thunder" };
  return { text: "未知", group: "cloudy" };
}

export type WeatherGroup =
  | "clear"
  | "partly"
  | "cloudy"
  | "fog"
  | "rain"
  | "snow"
  | "thunder";

export function weatherText(code: number | null): string {
  if (code == null) return "--";
  return describeCode(code).text;
}

export function weatherGroup(code: number | null): WeatherGroup {
  if (code == null) return "cloudy";
  return describeCode(code).group;
}

const FORECAST_URL =
  (lat: number, lon: number) =>
  `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
  `&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m` +
  `&hourly=temperature_2m,weather_code` +
  `&daily=temperature_2m_max,temperature_2m_min` +
  `&timezone=auto&forecast_days=2`;

export interface ForecastResult {
  temp: number;
  code: number;
  humidity: number;
  wind: number;
  hi: number;
  lo: number;
  hours: WeatherHour[];
}

export async function fetchForecast(place: Place): Promise<ForecastResult> {
  if (place.lat == null || place.lon == null) throw new Error("缺少位置信息");
  const res = await fetch(FORECAST_URL(place.lat, place.lon));
  if (!res.ok) throw new Error("天气服务暂不可用");
  const j = await res.json();

  const current = j.current ?? {};
  const daily = j.daily ?? {};
  const hourly = j.hourly ?? {};

  // 从当前时刻起取未来 24 小时
  const hours: WeatherHour[] = [];
  const times: string[] = hourly.time ?? [];
  const nowIso = new Date().toISOString().slice(0, 13); // YYYY-MM-DDTHH
  let startIdx = times.findIndex((t) => t.slice(0, 13) >= nowIso);
  if (startIdx < 0) startIdx = 0;
  for (let i = startIdx; i < Math.min(startIdx + 24, times.length); i++) {
    hours.push({
      time: times[i].slice(11, 16),
      temp: Math.round(hourly.temperature_2m?.[i] ?? 0),
      code: hourly.weather_code?.[i] ?? 0,
    });
  }

  return {
    temp: Math.round(current.temperature_2m ?? 0),
    code: current.weather_code ?? 0,
    humidity: Math.round(current.relative_humidity_2m ?? 0),
    wind: Math.round(current.wind_speed_10m ?? 0),
    hi: daily.temperature_2m_max?.[0] != null ? Math.round(daily.temperature_2m_max[0]) : 0,
    lo: daily.temperature_2m_min?.[0] != null ? Math.round(daily.temperature_2m_min[0]) : 0,
    hours,
  };
}

export async function searchCity(query: string): Promise<CityOption[]> {
  const url =
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}` +
    `&count=6&language=zh&format=json`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const j = await res.json();
  const list = j.results ?? [];
  return list.map((r: Record<string, unknown>) => {
    const admin = r.admin1 as string | undefined;
    const country = r.country as string | undefined;
    const parts = [admin, country].filter(Boolean).filter((p) => p !== r.name);
    return {
      name: r.name as string,
      label: [r.name as string, ...parts].join(" · "),
      lat: r.latitude as number,
      lon: r.longitude as number,
    };
  });
}

/** 浏览器定位 */
export function geolocate(): Promise<Place> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("浏览器不支持定位"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      (err) => reject(new Error(err.message || "定位失败")),
      { timeout: 10000, maximumAge: 600000 }
    );
  });
}

/** 通过逆地理编码获取城市名（BigDataCloud 客户端免费接口） */
export async function reverseCity(lat: number, lon: number): Promise<string> {
  try {
    const res = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=zh`
    );
    if (!res.ok) return "";
    const j = await res.json();
    return (j.city || j.locality || j.principalSubdivision || "").toString();
  } catch {
    return "";
  }
}
