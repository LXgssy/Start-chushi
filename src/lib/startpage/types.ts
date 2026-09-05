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
  /** 掠影自定义壁纸的 URL 导入源（v1.7.2）：非空 = 使用远程图片/视频 URL；
   *  空串 = 使用 IndexedDB 里上传的本地壁纸。两种来源互斥，导入其一即清另一 */
  wallpaperUrl: string;
  /** 自定义壁纸导入版本号（v1.7.3）：每次导入（本地文件或 URL）自增。
   *  渲染端以它为依赖重读壁纸源——否则 custom 模式下重复导入（photoId/wallpaperUrl
   *  均不变）effect 不重跑，壁纸停在旧画面（导入后不刷新的根因） */
  wallpaperRev: number;
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
  wallpaperUrl: "",
  wallpaperRev: 0,
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
  /** 非空 = 当前展示的是本地快照（限流/断网回退），值为快照时间戳 */
  staleAt: number | null;
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
  staleAt: null,
};

export interface Place {
  lat?: number;
  lon?: number;
  name?: string;
}
