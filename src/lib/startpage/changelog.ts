/* 「初始」更新日志数据（设置面板 → 更新日志 弹窗数据源）。
 *
 * 维护约定：
 *   · 新版本往数组**头部**插一条（最新在最上面）；
 *   · title 一句话概括这一版；highlights 用与面板文案同风格的短句，每条一个要点；
 *   · channel 标记这一版的更新走哪条通道：
 *       "shell" = 需要换扩展包（.crx 自动更新）的基础部分；
 *       "page"  = 页面层，走云端热更（首次启动拉取，之后有更新才拉）。
 *   · 只写用户能感知的东西，不写内部重构细节。
 */

export type ChangelogChannel = "shell" | "page";

export interface ChangelogEntry {
  version: string;
  /** 形如 "2026-09-12"；不确定可留空 */
  date?: string;
  title: string;
  highlights: string[];
  channel: ChangelogChannel;
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "8.4.0",
    title: "云端更新通道 · 页面热更 + 更新日志",
    channel: "page",
    highlights: [
      "页面更新改为云端热更：首次启动拉取一次，之后只在有新版本时再拉",
      "扩展包体退化为「基础壳」：以后改页面不必再换扩展",
      "设置面板底部新增「更新日志」，可在这里回看全部历史版本",
    ],
  },
  {
    version: "8.3.6",
    title: "天气定位修复",
    channel: "shell",
    highlights: ["补齐 geolocation 权限，天气「定位」在扩展里可用"],
  },
  {
    version: "8.3.5",
    title: "面板无反应根治 · 中文逐字重影根治 · seek 歌词快速对齐 · 高光不再照亮文字",
    channel: "shell",
    highlights: [
      "面板没反应根治：桥心跳搬进 Web Worker，网易云在后台也照常响应",
      "中文歌逐字歌词重影根治：词壳 inline-block 化，两层文字像素级重合",
      "跳转进度条后歌词不再过快/过慢：收窗容差 ±0.8s + 平滑入轨",
      "律动辉光不再照亮歌名/歌词/按钮文字",
    ],
  },
  {
    version: "8.3.4",
    title: "歌词防裁切 · 高光防溢出 · 切行防咯噔 · 播放键防复位",
    channel: "shell",
    highlights: [
      "长行歌词不再被边框吃掉：歌词区加高 + 渐隐区改固定像素",
      "标准态/完全体律动高光不再溢出卡片圆角",
      "切换歌词行不再「咯噔」：翻译行改高度过渡，布局零跳变",
      "播放/暂停图标不再复位",
    ],
  },
  {
    version: "8.3.3",
    title: "高光归位 · 模糊防重置 · 新标签页焦点归位",
    channel: "shell",
    highlights: [
      "高光能量全部回到封面底下，封面本体不再被滤镜扰动",
      "已唱行的模糊不再「重置」",
      "新开新标签页时把焦点从地址栏收回页面",
    ],
  },
  {
    version: "8.3.2",
    title: "歌词高斯模糊景深 · 面板动效对齐浮窗",
    channel: "shell",
    highlights: ["未唱行 2px / 已唱行 1.1px / 当前行清晰，行切换时「聚焦」浮现", "面板补齐呼吸与模糊，和浮窗动效完全对齐"],
  },
  {
    version: "8.3.1",
    title: "封面一镜到底 · 弹簧克制化 · 高光渐入 · 律动 AGC",
    channel: "shell",
    highlights: ["三态切换封面全程连续，不再闪断", "灯光式高光渐入，不再突兀", "弱歌拉满、响歌保动态的自适应律动"],
  },
  {
    version: "8.3.0",
    title: "三态动画真弹簧 · 数据面休眠退役",
    channel: "shell",
    highlights: ["封面/标准/完全体三态改用真弹簧过渡", "数据面不再随标签页可见性休眠"],
  },
  {
    version: "8.2.1",
    title: "悬浮音乐卡三态 · 完全体逐字歌词",
    channel: "shell",
    highlights: ["悬浮卡三态：封面收起 / 标准卡 / 完全体歌词", "完全体支持逐字与逐行歌词"],
  },
  {
    version: "8.2.0",
    title: "悬浮音乐卡 · 封面高光律动",
    channel: "shell",
    highlights: ["置顶所有网页的迷你音乐卡", "封面辉光随音乐低频呼吸"],
  },
  {
    version: "8.0.0",
    title: "自研 SMTC 退役 · 适配 InfLink-rs",
    channel: "shell",
    highlights: ["系统媒体卡片交给 InfLink-rs 独占", "音乐桥以内置本地枢纽承接页面数据通道"],
  },
  {
    version: "7.0.0",
    title: "原生 SMTC · 纯 JS 三插件",
    channel: "shell",
    highlights: ["推翻「渲染进程有 Node」的误判，插件全部改纯 JS", "CEF 后台节流问题通过 Worker 心跳解决"],
  },
  {
    version: "6.0.0",
    title: "三插件纯插件架构",
    channel: "shell",
    highlights: ["音乐链路收敛为三个 BetterNCM 插件，零外部进程"],
  },
  {
    version: "5.0.0",
    title: "五层 0 复用重写",
    channel: "shell",
    highlights: ["预设包、音乐面板、引擎、宿主、插件全部从零重写"],
  },
  {
    version: "3.0.0",
    title: "双插件架构重写",
    channel: "shell",
    highlights: ["拆成职责单一的两个插件，根治「同一份进度真值被多层互相打架」"],
  },
  {
    version: "2.0.0",
    title: "统一面板舞台 · 内建音乐引擎",
    channel: "shell",
    highlights: ["dock 音乐面板并入统一舞台，开/关/互切同一套动画语言"],
  },
  {
    version: "1.8.0",
    title: "系统媒体会话接入",
    channel: "shell",
    highlights: ["音乐接入改为直连 Windows 系统媒体会话（SMTC），不再依赖网易云插件"],
  },
  {
    version: "1.7.0",
    title: "预设开发工具 · 四个焕新作用面",
    channel: "page",
    highlights: ["官方图形化预设开发工具导出 .cshz", "图标替换 / 主题令牌 / 动效语言 / 时钟格式"],
  },
  {
    version: "1.2.0",
    title: "设置面作用面",
    channel: "page",
    highlights: ["预设可向设置面板贡献滑杆/开关/分段控件，改动热生效"],
  },
  {
    version: "1.0.0",
    title: "首个版本",
    channel: "page",
    highlights: ["时钟 · 搜索 · 快捷链接 · 天气 · 待办 · 便签 · 番茄钟 · 指令面板"],
  },
];

/** 面板里给「云更通道」看的摘要：最新版本号与最近 3 条标题 */
export function latestChangelog(n = 3): ChangelogEntry[] {
  return CHANGELOG.slice(0, n);
}
