/* 「初始」起始页 — 共享类型定义 */

export interface StartLink {
  id: string;
  name: string;
  url: string;
}

export interface TodoItem {
  id: string;
  text: string;
  done: boolean;
  createdAt: number;
}

export type ThemeMode = "light" | "dark" | "system";
export type BackgroundMode = "glow" | "pure" | "photo";
export type IconStyle = "letter" | "favicon";
export type PanelId = "weather" | "todo" | "note" | "pomodoro" | "settings" | null;

/** 番茄钟时长设置（分钟） */
export interface PomodoroDurations {
  focusMin: number;
  shortMin: number;
  longMin: number;
}

export const DEFAULT_DURATIONS: PomodoroDurations = {
  focusMin: 25,
  shortMin: 5,
  longMin: 15,
};

export interface Settings {
  themeMode: ThemeMode;
  background: BackgroundMode;
  hour12: boolean;
  showSeconds: boolean;
  userName: string;
  iconStyle: IconStyle;
  engineId: string;
  /** 强调色（hex），驱动 --ui-accent */
  accent: string;
  /** 掠影壁纸源："daily" | 图库 id | "custom" */
  photoId: string;
  /** 最近一次手动选择的壁纸 id（关闭「每日一图」时回退到此；旧数据可能缺失，读取时需兜底） */
  photoLast: string;
  /** 搜索建议：键入时搜索栏向下展开联想词下拉（含高度自适应动画） */
  searchSuggest: boolean;
  pomodoro: PomodoroDurations;
}

export const DEFAULT_SETTINGS: Settings = {
  themeMode: "dark",
  background: "glow",
  hour12: false,
  showSeconds: false,
  userName: "",
  iconStyle: "letter",
  engineId: "google",
  accent: "#8b5cf6",
  photoId: "daily",
  photoLast: "mist-lake",
  searchSuggest: true,
  pomodoro: DEFAULT_DURATIONS,
};

export interface WeatherHour {
  time: string; // HH:mm
  temp: number;
  code: number;
}

export interface WeatherState {
  loading: boolean;
  error: string | null;
  temp: number | null;
  code: number | null;
  hi: number | null;
  lo: number | null;
  humidity: number | null;
  wind: number | null;
  city: string;
  hours: WeatherHour[];
}

export const INITIAL_WEATHER: WeatherState = {
  loading: false,
  error: null,
  temp: null,
  code: null,
  hi: null,
  lo: null,
  humidity: null,
  wind: null,
  city: "",
  hours: [],
};

export interface Place {
  lat?: number;
  lon?: number;
  name?: string;
}
