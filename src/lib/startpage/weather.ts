/* 天气：中国气象局（扩展版首选）+ Open-Meteo 兜底 + 城市搜索 + 天气代码中文化
 *
 * 双源架构（2026-08 换源）：
 * - 扩展构建（NEXT_PUBLIC_CMA=1）优先请求中国气象局官方接口 weather.cma.cn
 *   （免密钥、国内直连快，避开 Open-Meteo 出口 IP 共享配额导致的 429）；
 *   就近站 250km 阈值外 / WAF 拦截 / 超时 / 空数据 → 无感回退 Open-Meteo。
 * - 网页版（GitHub Pages）构建不发 CMA 请求：CMA 接口无 CORS 头且 WAF 拒绝
 *   跨站 Origin，浏览器直连必败（2026-08-30 实测），保持 Open-Meteo。
 * - CMA 天气现象文本归一化为 WMO 风格 code，两种源统一产出 ForecastResult，
 *   图标/文案/快照/降级链路零改动。 */

import type { Place, WeatherHour } from "./types";
import { CMA_STATIONS } from "./cma-stations";

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

/* ---------- 中国气象局源（weather.cma.cn 官方接口，免密钥） ----------
 * 站号 = WMO 5 位编号；经纬度→就近站见 cma-stations.ts（716 站逐站实测存活）。
 * 扩展页带 host_permissions 可跨域读取；网页版因 WAF+CORS 不可用（见文件头）。 */

export const CMA_FIRST = process.env.NEXT_PUBLIC_CMA === "1";
const CMA_RADIUS_KM = 250;

/** 经纬度 → 就近国家站 id；250km 外视为无覆盖（海外/偏远自动回退 Open-Meteo） */
export function nearestCmaStation(lat: number, lon: number): string | null {
  let bestId: string | null = null;
  let bestD = Infinity;
  const cos = Math.cos((lat * Math.PI) / 180);
  for (const s of CMA_STATIONS) {
    const dx = (lon - s.lon) * 111.0 * cos;
    const dy = (lat - s.lat) * 111.0;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      bestId = s.id;
    }
  }
  return bestD <= CMA_RADIUS_KM * CMA_RADIUS_KM ? bestId : null;
}

/** CMA 天气现象文本 → WMO 风格代码（复用 describeCode 的分组/文案/图标）。
 *  关键词判定顺序不可换：雷阵雨含「雨」，雨夹雪含「雨/雪」，冻雨含「雨」。 */
export function cmaTextToCode(text: string): number {
  const t = text ?? "";
  if (t.includes("雷")) return 95; // 雷阵雨（伴冰雹同归雷电组）
  if (t.includes("沙") || t.includes("尘") || t.includes("霾") || t.includes("雾")) return 45;
  if (t.includes("雪")) return t.includes("阵") ? 85 : 73;
  if (t.includes("冻")) return 66;
  if (t.includes("雨")) return t.includes("阵") ? 80 : 61;
  if (t.includes("阴")) return 3;
  if (t.includes("云")) return 2;
  if (t.includes("晴")) return 0;
  return 3;
}

interface CmaViewData {
  now?: {
    temperature?: number;
    humidity?: number;
    windSpeed?: number; // m/s
  };
  daily?: Array<{
    high?: number;
    low?: number;
    dayText?: string;
    nightText?: string;
  }>;
}

/** 中国气象局实况+当日高低温（无逐小时；失败由 fetchForecast 回退 Open-Meteo） */
export async function fetchCma(lat: number, lon: number): Promise<ForecastResult> {
  const sid = nearestCmaStation(lat, lon);
  if (!sid) throw new Error("250km 内无国家气象站");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(
      `https://weather.cma.cn/api/weather/view?stationid=${sid}`,
      { signal: ctrl.signal }
    );
    if (!res.ok) throw new Error(`中国气象接口 HTTP ${res.status}`);
    const j = (await res.json()) as { code?: number; data?: CmaViewData | string };
    const d = j?.data;
    /* code:0 但 data 为空字符串 = 站点存在但无发布数据（实测存在此形态） */
    if (j?.code !== 0 || typeof d !== "object" || !d.now) {
      throw new Error("中国气象接口无该站点数据");
    }
    const now = d.now;
    const today = Array.isArray(d.daily) ? d.daily[0] : undefined;
    /* 当前天气现象：白天取今日白天，夜间取今日夜间（6/18 点为界） */
    const daytime = new Date().getHours() >= 6 && new Date().getHours() < 18;
    const text = (daytime ? today?.dayText : today?.nightText) || today?.dayText || "";
    return {
      temp: Math.round(now.temperature ?? 0),
      code: cmaTextToCode(text),
      humidity: Math.round(now.humidity ?? 0),
      wind: Math.round((now.windSpeed ?? 0) * 3.6), // m/s → km/h
      hi: today?.high != null ? Math.round(today.high) : 0,
      lo: today?.low != null ? Math.round(today.low) : 0,
      hours: [], // CMA 官方接口无逐小时预报，逐小时条自动隐藏
    };
  } finally {
    clearTimeout(timer);
  }
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

/** 双源编排：扩展版 CMA 优先（失败无感回退），网页版直达 Open-Meteo */
export async function fetchForecast(place: Place): Promise<ForecastResult> {
  if (place.lat == null || place.lon == null) throw new Error("缺少位置信息");
  if (CMA_FIRST) {
    try {
      const r = await fetchCma(place.lat, place.lon);
      console.info("[weather] source=cma");
      return r;
    } catch (e) {
      console.info(
        "[weather] source=open-meteo（CMA 不可用：",
        e instanceof Error ? e.message : e,
        "）"
      );
    }
  }
  return fetchOpenMeteo(place);
}

async function fetchOpenMeteo(place: Place): Promise<ForecastResult> {
  if (place.lat == null || place.lon == null) throw new Error("缺少位置信息");
  const res = await fetch(FORECAST_URL(place.lat, place.lon));
  if (!res.ok) {
    /* 429 = Open-Meteo 免费额度按出口 IP 共享，国内 CGNAT 下常见；
       文案与网络故障区分开（快照回退见 page.tsx） */
    if (res.status === 429) {
      throw new Error("天气服务今日额度已用尽，将于稍后自动重试");
    }
    throw new Error("天气服务暂不可用");
  }
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

/* 国家/地区显示归一化：Open-Meteo 把台湾/香港/澳门作为独立 country 字段
 * 返回（zh 下为「台湾」「香港」「澳门」），中文界面必须呈现为
 * 「中国台湾 / 中国香港 / 中国澳门」——原则问题，不能省。 */
const CN_REGION: Record<string, string> = {
  台湾: "中国台湾",
  香港: "中国香港",
  澳门: "中国澳门",
};

export async function searchCity(query: string): Promise<CityOption[]> {
  const url =
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}` +
    `&count=6&language=zh&format=json`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const j = await res.json();
  const list = j.results ?? [];
  return list.map((r: Record<string, unknown>) => {
    const countryRaw = r.country as string | undefined;
    const country = countryRaw ? (CN_REGION[countryRaw] ?? countryRaw) : undefined;
    const name = CN_REGION[r.name as string] ?? (r.name as string);
    /* admin1 有两类噪音：Open-Meteo 数据 bug「臺灣省 or 台灣省」（含 " or "）；
     * 台区条目省份与「中国台湾」前缀语义重复——归一化命中时一律不展示省份 */
    let admin = r.admin1 as string | undefined;
    if (admin?.includes(" or ")) admin = admin.split(" or ")[0];
    const isCnRegion = countryRaw != null && CN_REGION[countryRaw] != null;
    if (isCnRegion) admin = undefined;
    const parts = [admin, country].filter(Boolean).filter((p) => p !== name);
    return {
      name,
      label: [name, ...parts].join(" · "),
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

/* ---------- 本地天气快照（限流/断网回退） ----------
 * Open-Meteo 免费额度按出口 IP 共享计，国内网络下 429 常态化；
 * 每次成功拉取落一份 localStorage 快照，失败时回退展示并标注时间，
 * 配合 page.tsx 的 30 分钟轮询与 online 事件自动重试。 */

const SNAPSHOT_KEY = "start:weather-last";

export interface WeatherSnapshot {
  at: number;
  data: ForecastResult;
}

export function readWeatherSnapshot(): WeatherSnapshot | null {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as WeatherSnapshot;
    if (!s || typeof s.at !== "number" || !s.data || s.data.temp == null) {
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

export function writeWeatherSnapshot(data: ForecastResult): void {
  try {
    const snap: WeatherSnapshot = { at: Date.now(), data };
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snap));
  } catch {
    /* 存储不可用（隐私模式等）时静默，不影响实时数据展示 */
  }
}
