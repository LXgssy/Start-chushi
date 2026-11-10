/* 「初始」起始页 — 共享类型定义 */

export interface StartLink {
  id: string;
  name: string;
  url: string;
}

/* ---------- v8.7.156 文件夹磁贴 ----------
 * start:links 数组内与 StartLink 平级混存（同键同构，云同步六键契约零改动）：
 *   · 判别字段 folder:true 恒真——StartLink 无此字段（undefined），旧数据
 *     零迁移天然兼容；sanitizeEntries 读入期兜底（children 非数组/残缺条目
 *     修剪，孤儿散点直接按链接保留）。
 *   · 只允许一层嵌套：children 恒为 StartLink[]（文件夹不可套文件夹），
 *     iOS 桌面同构，拖拽/排序/散落的状态机保持单层简单。
 *   · StartEntry = 两种磁贴的联合类型；消费端一律经 isFolder 收窄后分支。 */
export interface StartFolder {
  id: string;
  name: string;
  folder: true;
  children: StartLink[];
}

/** start:links 数组条目：链接磁贴 或 文件夹磁贴（v8.7.156） */
export type StartEntry = StartLink | StartFolder;

export interface TodoItem {
  id: string;
  text: string;
  done: boolean;
  createdAt: number;
}

export type ThemeMode = "light" | "dark" | "system";
export type BackgroundMode = "glow" | "pure" | "photo";
/** 图标风格（v8.7.44 新增自绘）：字母磁贴 / 站点图标 / 自绘图标（187 站内联 SVG，未收录站走 favicon 链兜底） */
export type IconStyle = "letter" | "favicon" | "selfdraw";
/** 快捷服务样式（v8.6.2）：常驻 / 抽屉（v8.5.x 曾以 linksStyle 短暂存在，见 Settings.linksForm） */
export type LinksForm = "docked" | "drawer";

export type PanelId = "weather" | "todo" | "note" | "pomodoro" | "settings" | null;

/* ---------- 壁纸历史条目（v8.7.105 引入，v8.7.123 收纳入 Settings 云同步随行） ----------
 * v8.7.105~121 存 chrome.storage.sync（wh:/whIndex 键）——但账号云同步
 * （闭源模块）只同步六键（settings/links/todos/note/presets/preset-settings），
 * 历史从未上云。v8.7.123 起历史作为 settings.wallHistory 随六键全量云同步，
 * chrome.storage.sync 旧数据一次性迁移（readLegacySyncHistory）。
 * 类型定义收纳于此（Settings 同域），wall-history.ts 转发导出保持旧引用不破。 */
export type WallHistoryKind = "gallery" | "daily" | "url" | "file";

export interface WallHistoryItem {
  /** 稳定 id：gallery=图库 id；url/url 类=直链；file=name:size；daily="daily" */
  id: string;
  kind: WallHistoryKind;
  /** 图库 id（gallery/daily） */
  photoId?: string;
  /** 直链（url 类） */
  url?: string;
  /** 展示名（文件名 / 图库名 / host） */
  name: string;
  /** 64px JPEG 缩略 dataURL（file 类）；gallery/url 类直接用远程缩略地址 */
  thumb?: string;
  ts: number;
}

/** v8.7.123 待办/便签常驻磁贴钉位（云同步随行）：拖拽合法落点，
 *  跨设备恢复时按目标视口 clamp（PinnedTiles 应用侧） */
export interface PinTilePos {
  todo?: { x: number; y: number } | null;
  note?: { x: number; y: number } | null;
}

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

/* ---------- 文件夹展开方式（v8.7.158，用户选型三选一）----------
 * morph  = 形变绽放（默认）：白卡从磁贴原位长大（iOS 文件夹同款，九宫格
 *          迷你格交叉淡入成品网格）；
 * modal  = 居中模态：整墙压暗虚化，白卡飞入屏幕中央放大，点遮罩即收起；
 * inline = 原位内嵌：不用浮层——磁贴原地膨胀成大卡，邻居磁贴自动让位
 *          （Windows 11 同款）。
 * 三形态共享同一套面板内容（改名/拆散/夹内排序/拖入拖出），仅「怎么出现」
 * 不同；缺省 morph，老数据零迁移。 */
export type FolderOpenStyle = "morph" | "modal" | "inline";

/** 文件夹磁贴图标形态（v8.7.161，用户在 11 式探索页选型 A+B 全做）：
 *  grid2 = 双排迷你格（2×2，iOS 经典款；1~4 站逐格 / >4 站前 3 格 + 「+N」计数格，
 *          即 v8.7.157 起的现状）；
 *  grid3 = 三排微缩墙（3×3；未满 9 格时空位画淡占位格，>8 站第 9 格让位
 *          「+N」计数格——一眼读出收藏规模与剩余容量的「微缩墙」感）。
 *  与 folderOpenStyle 自由组合；缺省 grid2，老数据零迁移。 */
export type FolderIconStyle = "grid2" | "grid3";

export interface Settings {
  themeMode: ThemeMode;
  background: BackgroundMode;
  hour12: boolean;
  showSeconds: boolean;
  /** 时钟显隐（v8.7.35）：false = 隐藏时间主体（日期/问候行不受此键控制） */
  showClock: boolean;
  /** 日期行显隐（v8.7.35）：false = 隐藏日期·农历·问候整行；预设 clock.showDate
   *  声明在装着期仍优先（装了即生效、删除预设即还原到本设置） */
  showDate: boolean;
  userName: string;
  iconStyle: IconStyle;
  engineId: string;
  /** 强调色（hex），驱动 --ui-accent */
  accent: string;
  /** 掠影壁纸源："daily" | 图库 id | "custom" */
  photoId: string;
  /** 最近一次手动选择的壁纸 id（关闭「每日一图」时回退到此；旧数据可能缺失，读取时需兜底） */
  photoLast: string;
  /** 掠影壁纸压暗程度（v8.7.35）：photo-scrim 全部压暗层 α 的倍率，百分数
   *  0–200（默认 100=原设计值）——0=不压暗，200=双倍压暗；rgba α 自动夹紧 ≤1 */
  photoDim: number;
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
  /** 流畅模式（v8.5.0，低配电脑优化）：开启后页面降级渲染——磨砂玻璃换
   *  纯色底、装饰动画/长驻合成层停用，牺牲质感换帧率。入口：扩展弹窗
   *  快捷面板与设置面板；跨文档实时生效靠 storage 事件（见 page.tsx） */
  perfLite: boolean;
  /** 新标签页不聚焦地址栏（v8.5.8；取代 v8.5.0 的焦点字段 focusOmnibox）：
   *  false（默认）= 浏览器默认——焦点落在地址栏、地址栏不显示扩展地址；
   *  true = 壳页自发导航一次（shell.html?csfocus=1），让出地址栏焦点并把扩展地址
   *  显示在地址栏里（v8.3.7 实测唯一可靠手段）。
   *  用独立的正语义字段而非取反：老数据没有这个键 = false = 天然落到「默认关闭」，
   *  不必做一次性迁移；旧的 focusOmnibox 键直接忽略。 */
  noOmniboxFocus: boolean;
  /** 快捷服务样式（v8.6.2）：docked = 常驻（v8.5.9 原样式，磁贴一直铺在页面搜索区下方）；
   *  drawer = 抽屉（v8.6.x 现状，页面空白处中键单击唤出全屏磁贴墙）。
   *  默认 drawer 与 8.6.x 延续；刻意用新字段名 linksForm 而非复用 v8.5.x 的
   *  linksStyle —— 老用户存量数据里残留的 linksStyle（多为 8.5.x 默认值 docked）
   *  若被直接恢复，会让 8.6.x 起一直用抽屉的用户升级后突變回常驻；新字段从零开始，
   *  缺省即抽屉，想要原样式去设置面板显式切换。 */
  linksForm: LinksForm;
  /** 文件夹展开方式（v8.7.158）：morph = 磁贴形变绽放（默认）/ modal = 居中模态
   *  （背景压暗虚化）/ inline = 原位内嵌（磁贴膨胀成大卡，邻居让位）。
   *  三形态交互行为完全一致（点击展开/外点收起/拖拽 dwell/拖入拖出），
   *  仅视觉表现不同；入口：设置 → 链接 →「文件夹展开方式」 */
  folderOpenStyle: FolderOpenStyle;
  /** 文件夹磁贴图标形态（v8.7.161）：grid2 = 双排迷你格（默认，现状 2×2）/
   *  grid3 = 三排微缩墙（3×3，空位淡占位 + 「+N」计数格）。
   *  入口：设置 → 链接 →「文件夹图标」；morph 皮层迷你格同步跟随本设置 */
  folderIconStyle: FolderIconStyle;
  /** v8.7.36 Dock 栏显隐（v8.5.0 起常驻底部）：false = 整条 Dock 不渲染。
   *  入口：扩展弹窗快捷面板开关；跨文档热跟随走 settings storage 事件 */
  showDock: boolean;
  /** v8.7.105 待办常驻磁贴：开启后待办内容以磨砂磁贴常驻主页面
   *  （开关 = 待办面板右上角的全局浮窗胶囊，可拖拽钉位） */
  todoTile: boolean;
  /** v8.7.105 便签常驻磁贴：语义同 todoTile，作用于便签 */
  noteTile: boolean;
  /** v8.7.123 壁纸历史（云同步随行）：随 settings 六键上云，跨设备/重装
   *  经「从云端恢复」整包回来；7 条滚动淘汰（applyWallHistoryPush） */
  wallHistory?: WallHistoryItem[];
  /** v8.7.123 待办/便签常驻磁贴钉位（云同步随行）：键缺失/null = 默认锚位 */
  pinTile?: PinTilePos;
}

export const DEFAULT_SETTINGS: Settings = {
  themeMode: "dark",
  background: "glow",
  hour12: false,
  showSeconds: false,
  showClock: true,
  showDate: true,
  userName: "",
  iconStyle: "letter",
  engineId: "google",
  accent: "#8b5cf6",
  photoId: "daily",
  photoLast: "mist-lake",
  photoDim: 100,
  searchSuggest: true,
  wallpaperUrl: "",
  wallpaperRev: 0,
  pomodoro: DEFAULT_DURATIONS,
  perfLite: false,
  noOmniboxFocus: false,
  linksForm: "drawer",
  folderOpenStyle: "morph",
  folderIconStyle: "grid2",
  showDock: true,
  todoTile: false,
  noteTile: false,
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
