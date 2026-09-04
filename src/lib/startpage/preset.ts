/* 「初始」预设系统 — 声明式预设 + 沙箱 JS 高阶模式
 *
 * 设计原则：
 * 1. 声明式部分零代码执行：commands/dock/links/settings/layout 走白名单 action
 *    （open/copy/search/panel/theme/script/page）——安全边界由「类型 + 白名单 + 长度上限」三重护栏构成；
 * 2. 沙箱 JS（scripts 字段，高阶模式）：脚本代码运行在唯一源沙箱 iframe 中
 *    （网页版 = 不透明源 iframe；扩展版 = manifest sandbox 页，无扩展 API），
 *    只能通过受控 chushi API（见 sandbox.js）产生副作用，宿主侧复核白名单；
 *    script action 引用本预设内的脚本 id（导入期引用完整性校验），
 *    运行时展开为 `${presetId}:${scriptId}` 复合键（见 page.tsx resolvePresetAction）；
 * 3. 装了即生效：预设安装后，命令 → ⌘K 指令面板，dock 项 → 底部 tab 栏，磁贴 → 快捷链接区，
 *    全部从已安装列表派生（删除预设即全部失效，无隐藏状态）；
 * 4. 可分享：一段 JSON 复制给朋友，导入即用（与备份导出同一交互语言）；
 * 5. 高阶自定义（v1.0.6）：animations（CSS 动画/面板样式，注入前净化）、
 *    pages（整页自定义，跑在沙箱 iframe 里，拿不到页面数据）、
 *    layout（声明式布局覆写，删除预设即还原）；
 *    本地导入支持 .json 与 .cshz 包（zip 结构，见 parsePack）。 */

import type { Settings } from "./types";
import { ENGINES } from "./engines";

/* ---------- 白名单 action ---------- */

export type PresetAction =
  | { type: "open"; url: string }
  | { type: "copy"; text: string }
  | { type: "search"; engine: string; q: string }
  | { type: "panel"; id: "weather" | "todo" | "note" | "pomodoro" | "settings" }
  | { type: "theme"; mode: "light" | "dark" }
  /** 触发本预设内脚本的入口（chushi.run）或由导入期校验引用完整性 */
  | { type: "script"; id: string }
  /** 打开本预设内定义的沙箱页面（导入期校验引用完整性） */
  | { type: "page"; id: string };

export interface PresetCommand {
  title: string;
  action: PresetAction;
}

export interface PresetDockItem {
  title: string;
  /** lucide 图标名（白名单，见 DOCK_ICONS），未知名回退首字母圆形图标 */
  icon?: string;
  action: PresetAction;
}

export interface PresetLink {
  name: string;
  url: string;
}

/** 预设可携带的设置字段（白名单子集，导入时一次性合并，用户可再修改） */
export type PresetSettings = Partial<
  Pick<
    Settings,
    | "accent"
    | "hour12"
    | "showSeconds"
    | "themeMode"
    | "background"
    | "iconStyle"
    | "engineId"
    | "searchSuggest"
    | "userName"
  >
>;

/** 沙箱脚本（高阶模式）：在唯一源沙箱中执行，通过受控 chushi API 产生副作用 */
export interface PresetScript {
  /** 预设内唯一，^[A-Za-z0-9_-]{1,32}$；运行时复合键 = `${presetId}:${id}` */
  id: string;
  /** 展示名（缺省用 id） */
  name?: string;
  /** 脚本源码（沙箱内以 async IIFE 执行，支持顶层 await） */
  code: string;
}

/** 自定义动画/样式（高阶模式）：净化后注入宿主 <style>，作用于 .cl-* 元素钩子
 *  （见 README「自定义动画与面板样式」；CSS 无法执行脚本，最坏情况只是弄乱自己的页面） */
export interface PresetAnimation {
  id: string;
  name?: string;
  css: string;
}

/** 自定义页面（高阶模式）：完整 HTML 文档片段，运行在沙箱 iframe（不透明源），
 *  页面内可用极简 window.chushi（notify/close/open），拿不到主文档与扩展 API */
export interface PresetPage {
  id: string;
  name?: string;
  html: string;
}

/** 角落小部件（高阶模式，v1.0.7）：常驻页面角落的沙箱卡片（倒数日、快捷信息等），
 *  结构与 pages 同源隔离（唯一源宿主 → 嵌套 srcdoc），提供 notify/open/storage/resize
 *  受控 API；storage 由宿主持久化到 localStorage（数据不离开设备） */
export interface PresetWidget {
  id: string;
  name?: string;
  /** 停靠角（缺省 top-left） */
  corner?: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  /** 卡片宽度 px（120–420，缺省 216） */
  width?: number;
  /** 卡片初始高度 px（40–320，缺省 88；可用 chushi.resize 在沙箱内调整） */
  height?: number;
  /** 文档片段（与 pages 同规则，可用 window.chushi 受控 API） */
  html: string;
}

/** 图标替换（v1.7.0 图标作用面）：把 tab 栏内建按钮的图标换成预设指定的图标。
 *  icon 值两种形态：① DOCK_ICONS 白名单内的 lucide 名（跟随主题色 currentColor）；
 *  ② data:image/ URL（base64，≤8KB；<img> 渲染，SVG 脚本不执行天然安全）。 */
export type PresetIconTarget =
  | "weather"
  | "todo"
  | "note"
  | "pomodoro"
  | "settings"
  | "command";

export interface PresetIcon {
  target: PresetIconTarget;
  icon: string;
}

/** 动效语言（v1.7.0 动效作用面）：profile 切换面板/选框弹簧参数组，
 *  speed 为 CSS 入退场动画时长倍率（0.5–2，经 --mo-speed 变量驱动）。 */
export interface PresetMotion {
  profile?: "standard" | "playful" | "calm" | "instant";
  /** CSS 动画时长倍率：0.5（快一倍）– 2（慢一倍），缺省 1 */
  speed?: number;
}

/** 时钟格式（v1.7.0 时钟作用面；v1.7.1 语义修正）：
 *  - hour12 / showSeconds：安装时**一次性合入**用户设置（与 settings 字段同律），
 *    之后由设置面板管辖，预设本身不再持续覆写（否则面板永远调不回——实证反馈）；
 *  - showDate / greeting：无面板控件，保持声明式覆写，删除预设即还原。
 *  greeting 模板支持 {greet}（时段问候）与 {name}（用户名）占位，
 *  空字符串表示隐藏问候语。 */
export interface PresetClock {
  hour12?: boolean;
  showSeconds?: boolean;
  /** 「日期 · 农历 · 问候」行整体显隐（声明式，删除预设即还原） */
  showDate?: boolean;
  /** 问候语模板：{greet} = 时段问候词，{name} = 用户名；空串 = 隐藏问候（声明式） */
  greeting?: string;
}

/** 主题令牌白名单（v1.7.0 主题令牌作用面）：可被预设覆写的 CSS 变量清单。
 *  与 README 同步维护；不在清单内的键导入即拒绝。 */
export const PRESET_TOKEN_KEYS: Record<string, string> = {
  "--ui-accent": "全局强调色",
  "--pill-seg": "tab 栏选框底色",
  "--pill-seg-ring": "tab 栏选框描边",
  "--pill-line": "tab 栏分隔线",
};

/** 声明式布局覆写：装了即生效，删除预设即还原（不写入用户设置） */
export interface PresetLayout {
  hideClock?: boolean;
  hideSearch?: boolean;
  hideLinks?: boolean;
  /** 时钟整体缩放 0.5–2 */
  clockScale?: number;
  /** 快捷磁贴列数 3–12 */
  linksColumns?: number;
  /** 主内容垂直对齐：默认居中，top = 靠上 */
  verticalAlign?: "center" | "top";
}

export interface PresetPayload {
  name: string;
  author?: string;
  description?: string;
  commands: PresetCommand[];
  links: PresetLink[];
  dock: PresetDockItem[];
  settings?: PresetSettings;
  scripts?: PresetScript[];
  animations?: PresetAnimation[];
  pages?: PresetPage[];
  widgets?: PresetWidget[];
  layout?: PresetLayout;
  icons?: PresetIcon[];
  tokens?: Record<string, string>;
  motion?: PresetMotion;
  clock?: PresetClock;
}

export interface InstalledPreset {
  id: string;
  name: string;
  author?: string;
  installedAt: number;
  raw: PresetPayload;
}

/* ---------- 容量上限（防滥用 + 布局保护：dock 项过多会挤爆移动端 pill） ---------- */

export const PRESET_LIMITS = {
  commands: 12,
  links: 12,
  dock: 3,
  titleLen: 24,
  nameLen: 20,
  authorLen: 20,
  descLen: 60,
  urlLen: 500,
  copyLen: 200,
  queryLen: 100,
  scripts: 3,
  scriptIdLen: 32,
  scriptNameLen: 24,
  codeLen: 16000,
  animations: 4,
  cssLen: 6000,
  cssTotalLen: 12000,
  pages: 3,
  htmlLen: 24000,
  widgets: 3,
  widgetHtmlLen: 12000,
  icons: 6,
  iconLen: 8192,
  tokenValLen: 120,
  greetingLen: 40,
} as const;

export const SCRIPT_ID_RE = /^[A-Za-z0-9_-]{1,32}$/;

/* ---------- 校验 ---------- */

export type ParseResult =
  | { ok: true; preset: PresetPayload }
  | { ok: false; errors: string[] };

const ENGINE_IDS = new Set(ENGINES.map((e) => e.id));
const PANEL_IDS = new Set<string>(["weather", "todo", "note", "pomodoro", "settings"]);

function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function cleanStr(v: unknown, max: number): string {
  const s = asString(v);
  return s ? s.trim().slice(0, max) : "";
}

/** url 白名单校验：仅 http(s)，杜绝 javascript:/data: 等注入面 */
function safeUrl(v: unknown, errors: string[], where: string): string | null {
  const s = cleanStr(v, PRESET_LIMITS.urlLen);
  if (!s) {
    errors.push(`${where}：url 缺失或不是字符串`);
    return null;
  }
  if (!/^https:\/\//i.test(s)) {
    errors.push(`${where}：url 必须以 https:// 开头（不允许其他协议）`);
    return null;
  }
  try {
    new URL(s);
  } catch {
    errors.push(`${where}：url 格式无效`);
    return null;
  }
  return s;
}

function parseAction(
  v: unknown,
  errors: string[],
  where: string,
  scriptIds: Set<string>,
  pageIds: Set<string>
): PresetAction | null {
  if (typeof v !== "object" || v == null) {
    errors.push(`${where}：action 缺失`);
    return null;
  }
  const a = v as Record<string, unknown>;
  switch (a.type) {
    case "open": {
      const url = safeUrl(a.url, errors, where);
      return url ? { type: "open", url } : null;
    }
    case "copy": {
      const text = cleanStr(a.text, PRESET_LIMITS.copyLen);
      if (!text) {
        errors.push(`${where}：copy action 的 text 缺失`);
        return null;
      }
      return { type: "copy", text };
    }
    case "search": {
      const engine = cleanStr(a.engine, 20);
      const q = cleanStr(a.q, PRESET_LIMITS.queryLen);
      if (!q) {
        errors.push(`${where}：search action 的 q 缺失`);
        return null;
      }
      if (!ENGINE_IDS.has(engine)) {
        errors.push(`${where}：engine 必须是 ${ENGINES.map((e) => e.id).join(" / ")} 之一`);
        return null;
      }
      return { type: "search", engine, q };
    }
    case "panel": {
      const id = cleanStr(a.id, 20);
      if (!PANEL_IDS.has(id)) {
        errors.push(`${where}：panel id 必须是 weather / todo / note / pomodoro / settings 之一`);
        return null;
      }
      return { type: "panel", id } as PresetAction;
    }
    case "theme": {
      if (a.mode !== "light" && a.mode !== "dark") {
        errors.push(`${where}：theme mode 必须是 light 或 dark`);
        return null;
      }
      return { type: "theme", mode: a.mode };
    }
    case "script": {
      const sid = cleanStr(a.id, PRESET_LIMITS.scriptIdLen);
      if (!SCRIPT_ID_RE.test(sid)) {
        errors.push(`${where}：script id 只允许字母/数字/下划线/连字符（≤32 字符）`);
        return null;
      }
      if (!scriptIds.has(sid)) {
        errors.push(`${where}：引用了本预设中不存在的脚本 id「${sid}」（需先在 scripts 里定义）`);
        return null;
      }
      return { type: "script", id: sid };
    }
    case "page": {
      const pid = cleanStr(a.id, PRESET_LIMITS.scriptIdLen);
      if (!SCRIPT_ID_RE.test(pid)) {
        errors.push(`${where}：page id 只允许字母/数字/下划线/连字符（≤32 字符）`);
        return null;
      }
      if (!pageIds.has(pid)) {
        errors.push(`${where}：引用了本预设中不存在的页面 id「${pid}」（需先在 pages 里定义）`);
        return null;
      }
      return { type: "page", id: pid };
    }
    default:
      errors.push(
        `${where}：未知 action 类型「${cleanStr(a.type, 16) || "(空)"}」，可用：open / copy / search / panel / theme / script / page`
      );
      return null;
  }
}

function parseArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

/** CSS 净化：去掉 @import（外链注入面）与 javascript: url。
 *  CSS 无法执行脚本，最坏情况是弄乱用户自己的页面视觉，不做更激进裁剪；
 *  长度上限由 PRESET_LIMITS 控制，存储前净化一次（存量干净） */
export function sanitizeCss(css: string): string {
  return css.replace(/@import[^;]*;?/gi, "").replace(/javascript:/gi, "");
}

/**
 * 解析并校验预设 JSON（unknown → PresetPayload）。
 * 有任何错误即整体拒绝（返回 errors 列表），不做部分导入——半装不装的预设最难排查。
 */
export function parsePreset(raw: unknown): ParseResult {
  const errors: string[] = [];
  if (typeof raw !== "object" || raw == null) {
    return { ok: false, errors: ["预设内容必须是 JSON 对象"] };
  }
  const o = raw as Record<string, unknown>;

  if (o.chushi !== 1) {
    return {
      ok: false,
      errors: ['这不是「初始」预设文件（缺少 "chushi": 1 版本标记）'],
    };
  }

  const name = cleanStr(o.name, PRESET_LIMITS.nameLen);
  if (!name) errors.push("缺少预设名称 name");

  /* 先解析 scripts 与 pages（script/page action 的引用完整性需要先拿到全部 id） */
  const scripts: PresetScript[] = [];
  const scriptIds = new Set<string>();
  const scriptArr = parseArray(o.scripts).slice(0, PRESET_LIMITS.scripts);
  if (parseArray(o.scripts).length > PRESET_LIMITS.scripts) {
    errors.push(`scripts 超过上限（最多 ${PRESET_LIMITS.scripts} 个，已截断校验前 ${PRESET_LIMITS.scripts} 个）`);
  }
  scriptArr.forEach((item, i) => {
    const where = `scripts[${i}]`;
    if (typeof item !== "object" || item == null) {
      errors.push(`${where}：必须是对象`);
      return;
    }
    const so = item as Record<string, unknown>;
    const sid = cleanStr(so.id, PRESET_LIMITS.scriptIdLen);
    if (!SCRIPT_ID_RE.test(sid)) {
      errors.push(`${where}：id 只允许字母/数字/下划线/连字符（≤32 字符）`);
      return;
    }
    if (scriptIds.has(sid)) {
      errors.push(`${where}：脚本 id「${sid}」重复`);
      return;
    }
    const code = asString(so.code) ?? "";
    if (!code.trim()) {
      errors.push(`${where}：缺少 code（脚本代码）`);
      return;
    }
    if (code.length > PRESET_LIMITS.codeLen) {
      errors.push(`${where}：code 超过 ${PRESET_LIMITS.codeLen} 字符上限（当前 ${code.length}）`);
      return;
    }
    scriptIds.add(sid);
    scripts.push({ id: sid, name: cleanStr(so.name, PRESET_LIMITS.scriptNameLen) || sid, code });
  });

  /* 自定义动画/样式（高阶模式）：净化后存储，注入见 page.tsx */
  const animations: PresetAnimation[] = [];
  let cssTotal = 0;
  const animArr = parseArray(o.animations).slice(0, PRESET_LIMITS.animations);
  if (parseArray(o.animations).length > PRESET_LIMITS.animations) {
    errors.push(`animations 超过上限（最多 ${PRESET_LIMITS.animations} 条）`);
  }
  animArr.forEach((item, i) => {
    const where = `animations[${i}]`;
    if (typeof item !== "object" || item == null) {
      errors.push(`${where}：必须是对象`);
      return;
    }
    const ao = item as Record<string, unknown>;
    const aid = cleanStr(ao.id, PRESET_LIMITS.scriptIdLen);
    if (!SCRIPT_ID_RE.test(aid)) {
      errors.push(`${where}：id 只允许字母/数字/下划线/连字符（≤32 字符）`);
      return;
    }
    if (scriptIds.has(aid)) {
      errors.push(`${where}：id「${aid}」与脚本或其他动画重复`);
      return;
    }
    const css = asString(ao.css) ?? "";
    if (!css.trim()) {
      errors.push(`${where}：缺少 css`);
      return;
    }
    if (css.length > PRESET_LIMITS.cssLen) {
      errors.push(`${where}：css 超过 ${PRESET_LIMITS.cssLen} 字符上限（当前 ${css.length}）`);
      return;
    }
    cssTotal += css.length;
    if (cssTotal > PRESET_LIMITS.cssTotalLen) {
      errors.push(`animations：全部 CSS 合计超过 ${PRESET_LIMITS.cssTotalLen} 字符上限`);
      return;
    }
    scriptIds.add(aid); // 与脚本共享 id 空间（同为动画钩子命名空间，避免混淆）
    animations.push({ id: aid, name: cleanStr(ao.name, PRESET_LIMITS.scriptNameLen) || aid, css: sanitizeCss(css) });
  });

  /* 自定义页面（高阶模式）：沙箱 iframe 运行，见 SandboxPage 组件 */
  const pages: PresetPage[] = [];
  const pageIds = new Set<string>();
  const pageArr = parseArray(o.pages).slice(0, PRESET_LIMITS.pages);
  if (parseArray(o.pages).length > PRESET_LIMITS.pages) {
    errors.push(`pages 超过上限（最多 ${PRESET_LIMITS.pages} 页）`);
  }
  pageArr.forEach((item, i) => {
    const where = `pages[${i}]`;
    if (typeof item !== "object" || item == null) {
      errors.push(`${where}：必须是对象`);
      return;
    }
    const po = item as Record<string, unknown>;
    const pid = cleanStr(po.id, PRESET_LIMITS.scriptIdLen);
    if (!SCRIPT_ID_RE.test(pid)) {
      errors.push(`${where}：id 只允许字母/数字/下划线/连字符（≤32 字符）`);
      return;
    }
    if (pageIds.has(pid)) {
      errors.push(`${where}：页面 id「${pid}」重复`);
      return;
    }
    const html = asString(po.html) ?? "";
    if (!html.trim()) {
      errors.push(`${where}：缺少 html`);
      return;
    }
    if (html.length > PRESET_LIMITS.htmlLen) {
      errors.push(`${where}：html 超过 ${PRESET_LIMITS.htmlLen} 字符上限（当前 ${html.length}）`);
      return;
    }
    pageIds.add(pid);
    pages.push({ id: pid, name: cleanStr(po.name, PRESET_LIMITS.scriptNameLen) || pid, html });
  });

  /* 角落小部件（高阶模式，v1.0.7）：与 pages 同源隔离，见 PresetWidgets 组件 */
  const WIDGET_CORNERS = new Set(["top-left", "top-right", "bottom-left", "bottom-right"]);
  const widgets: PresetWidget[] = [];
  const widgetArr = parseArray(o.widgets).slice(0, PRESET_LIMITS.widgets);
  if (parseArray(o.widgets).length > PRESET_LIMITS.widgets) {
    errors.push(`widgets 超过上限（最多 ${PRESET_LIMITS.widgets} 个）`);
  }
  widgetArr.forEach((item, i) => {
    const where = `widgets[${i}]`;
    if (typeof item !== "object" || item == null) {
      errors.push(`${where}：必须是对象`);
      return;
    }
    const wo = item as Record<string, unknown>;
    const wid = cleanStr(wo.id, PRESET_LIMITS.scriptIdLen);
    if (!SCRIPT_ID_RE.test(wid)) {
      errors.push(`${where}：id 只允许字母/数字/下划线/连字符（≤32 字符）`);
      return;
    }
    if (scriptIds.has(wid)) {
      errors.push(`${where}：id「${wid}」与脚本/动画/页面重复`);
      return;
    }
    const html = asString(wo.html) ?? "";
    if (!html.trim()) {
      errors.push(`${where}：缺少 html`);
      return;
    }
    if (html.length > PRESET_LIMITS.widgetHtmlLen) {
      errors.push(`${where}：html 超过 ${PRESET_LIMITS.widgetHtmlLen} 字符上限（当前 ${html.length}）`);
      return;
    }
    const corner = cleanStr(wo.corner, 16);
    if (corner && !WIDGET_CORNERS.has(corner)) {
      errors.push(`${where}：corner 必须是 top-left / top-right / bottom-left / bottom-right 之一`);
      return;
    }
    const width =
      typeof wo.width === "number" && Number.isFinite(wo.width)
        ? Math.round(Math.min(420, Math.max(120, wo.width)))
        : undefined;
    const height =
      typeof wo.height === "number" && Number.isFinite(wo.height)
        ? Math.round(Math.min(320, Math.max(40, wo.height)))
        : undefined;
    scriptIds.add(wid); // 共享 id 命名空间（脚本/动画/页面/小部件互不重名）
    widgets.push({
      id: wid,
      name: cleanStr(wo.name, PRESET_LIMITS.scriptNameLen) || wid,
      corner: (corner as PresetWidget["corner"]) || "top-left",
      width,
      height,
      html,
    });
  });

  /* 声明式布局覆写（高阶模式）：数值全部夹紧到安全区间 */
  let layout: PresetLayout | undefined;
  if (typeof o.layout === "object" && o.layout != null) {
    const l = o.layout as Record<string, unknown>;
    const patch: PresetLayout = {};
    if (typeof l.hideClock === "boolean") patch.hideClock = l.hideClock;
    if (typeof l.hideSearch === "boolean") patch.hideSearch = l.hideSearch;
    if (typeof l.hideLinks === "boolean") patch.hideLinks = l.hideLinks;
    if (typeof l.clockScale === "number" && Number.isFinite(l.clockScale)) {
      patch.clockScale = Math.min(2, Math.max(0.5, l.clockScale));
    }
    if (typeof l.linksColumns === "number" && Number.isFinite(l.linksColumns)) {
      patch.linksColumns = Math.round(Math.min(12, Math.max(3, l.linksColumns)));
    }
    if (l.verticalAlign === "center" || l.verticalAlign === "top") patch.verticalAlign = l.verticalAlign;
    if (Object.keys(patch).length > 0) layout = patch;
  }

  /* 图标替换（v1.7.0）：target 白名单 + icon 两种形态校验（lucide 名 / data:image URL） */
  const ICON_TARGETS = new Set<string>([
    "weather", "todo", "note", "pomodoro", "settings", "command",
  ]);
  const icons: PresetIcon[] = [];
  const iconTargets = new Set<string>();
  const iconArr = parseArray(o.icons).slice(0, PRESET_LIMITS.icons);
  if (parseArray(o.icons).length > PRESET_LIMITS.icons) {
    errors.push(`icons 超过上限（最多 ${PRESET_LIMITS.icons} 条）`);
  }
  iconArr.forEach((item, i) => {
    const where = `icons[${i}]`;
    if (typeof item !== "object" || item == null) {
      errors.push(`${where}：必须是对象`);
      return;
    }
    const io = item as Record<string, unknown>;
    const target = cleanStr(io.target, 16);
    if (!ICON_TARGETS.has(target)) {
      errors.push(
        `${where}：target 必须是 ${[...ICON_TARGETS].join(" / ")} 之一`
      );
      return;
    }
    if (iconTargets.has(target)) {
      errors.push(`${where}：target「${target}」重复（同一按钮只接受一个图标覆写）`);
      return;
    }
    const icon = asString(io.icon) ?? "";
    if (!icon) {
      errors.push(`${where}：缺少 icon`);
      return;
    }
    if (icon.startsWith("data:image/")) {
      /* data URL 形态：仅 base64 图片（png/jpeg/webp/gif/svg+xml）；<img> 渲染
         时 SVG 处于静态模式（脚本不执行、外链不加载），无需再净化 */
      if (icon.length > PRESET_LIMITS.iconLen) {
        errors.push(
          `${where}：data URL 图标超过 ${PRESET_LIMITS.iconLen} 字符上限（当前 ${icon.length}）`
        );
        return;
      }
      if (!/^data:image\/(?:png|jpeg|webp|gif|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(icon)) {
        errors.push(`${where}：data URL 图标必须是 base64 编码的 png/jpeg/webp/gif/svg+xml`);
        return;
      }
    } else if (!(icon in DOCK_ICONS)) {
      errors.push(
        `${where}：icon 必须是内置图标名（${Object.keys(DOCK_ICONS).join(" / ")}）或 data:image/ base64 URL`
      );
      return;
    }
    iconTargets.add(target);
    icons.push({ target: target as PresetIconTarget, icon });
  });

  /* 主题令牌覆写（v1.7.0）：键白名单整体拒绝制，值去掉 CSS 逃逸字符 */
  let tokens: Record<string, string> | undefined;
  if (typeof o.tokens === "object" && o.tokens != null) {
    const to = o.tokens as Record<string, unknown>;
    const patch: Record<string, string> = {};
    for (const [k, v] of Object.entries(to)) {
      if (!Object.prototype.hasOwnProperty.call(PRESET_TOKEN_KEYS, k)) {
        errors.push(`tokens：键「${k}」不在可覆写清单内（允许：${Object.keys(PRESET_TOKEN_KEYS).join(" / ")}）`);
        continue;
      }
      if (typeof v !== "string" || !v.trim()) {
        errors.push(`tokens.${k}：值必须是彩色/尺寸等非空字符串`);
        continue;
      }
      const val = v.replace(/[;{}<>]/g, "").trim();
      if (!val) {
        errors.push(`tokens.${k}：值净化后为空（不允许 ;{}<> 字符）`);
        continue;
      }
      if (val.length > PRESET_LIMITS.tokenValLen) {
        errors.push(`tokens.${k}：值超过 ${PRESET_LIMITS.tokenValLen} 字符上限`);
        continue;
      }
      patch[k] = val;
    }
    if (Object.keys(patch).length > 0) tokens = patch;
  }

  /* 动效语言（v1.7.0）：profile 枚举 + speed 夹紧 0.5–2 */
  let motion: PresetMotion | undefined;
  if (typeof o.motion === "object" && o.motion != null) {
    const mo = o.motion as Record<string, unknown>;
    const patch: PresetMotion = {};
    if (
      mo.profile === "standard" || mo.profile === "playful" ||
      mo.profile === "calm" || mo.profile === "instant"
    ) {
      patch.profile = mo.profile;
    } else if (mo.profile != null) {
      errors.push("motion.profile 必须是 standard / playful / calm / instant 之一");
    }
    if (typeof mo.speed === "number" && Number.isFinite(mo.speed)) {
      patch.speed = Math.min(2, Math.max(0.5, mo.speed));
    } else if (mo.speed != null) {
      errors.push("motion.speed 必须是 0.5–2 之间的数字");
    }
    if (Object.keys(patch).length > 0) motion = patch;
  }

  /* 时钟格式（v1.7.0）：布尔直取 + greeting 模板净化 */
  let clock: PresetClock | undefined;
  if (typeof o.clock === "object" && o.clock != null) {
    const co = o.clock as Record<string, unknown>;
    const patch: PresetClock = {};
    if (typeof co.hour12 === "boolean") patch.hour12 = co.hour12;
    if (typeof co.showSeconds === "boolean") patch.showSeconds = co.showSeconds;
    if (typeof co.showDate === "boolean") patch.showDate = co.showDate;
    if (typeof co.greeting === "string") {
      const g = co.greeting.replace(/[<>]/g, "").slice(0, PRESET_LIMITS.greetingLen);
      patch.greeting = g; /* 空串合法 = 隐藏问候 */
    }
    if (Object.keys(patch).length > 0) clock = patch;
  }

  const commands: PresetCommand[] = [];
  const cmdArr = parseArray(o.commands).slice(0, PRESET_LIMITS.commands);
  cmdArr.forEach((c, i) => {
    const where = `commands[${i}]`;
    if (typeof c !== "object" || c == null) {
      errors.push(`${where}：必须是对象`);
      return;
    }
    const title = cleanStr((c as Record<string, unknown>).title, PRESET_LIMITS.titleLen);
    if (!title) {
      errors.push(`${where}：缺少 title`);
      return;
    }
    const action = parseAction((c as Record<string, unknown>).action, errors, where, scriptIds, pageIds);
    if (action) commands.push({ title, action });
  });

  const links: PresetLink[] = [];
  const linkArr = parseArray(o.links).slice(0, PRESET_LIMITS.links);
  linkArr.forEach((l, i) => {
    const where = `links[${i}]`;
    if (typeof l !== "object" || l == null) {
      errors.push(`${where}：必须是对象`);
      return;
    }
    const lo = l as Record<string, unknown>;
    const lname = cleanStr(lo.name, 20);
    const url = safeUrl(lo.url, errors, where);
    if (!lname) errors.push(`${where}：缺少 name`);
    if (lname && url) links.push({ name: lname, url });
  });

  const dock: PresetDockItem[] = [];
  const dockArr = parseArray(o.dock).slice(0, PRESET_LIMITS.dock);
  dockArr.forEach((d, i) => {
    const where = `dock[${i}]`;
    if (typeof d !== "object" || d == null) {
      errors.push(`${where}：必须是对象`);
      return;
    }
    const dobj = d as Record<string, unknown>;
    const title = cleanStr(dobj.title, PRESET_LIMITS.titleLen);
    if (!title) {
      errors.push(`${where}：缺少 title`);
      return;
    }
    const action = parseAction(dobj.action, errors, where, scriptIds, pageIds);
    const icon = cleanStr(dobj.icon, 24) || undefined;
    if (action) dock.push({ title, icon, action });
  });

  let settings: PresetSettings | undefined;
  if (typeof o.settings === "object" && o.settings != null) {
    const s = o.settings as Record<string, unknown>;
    const patch: PresetSettings = {};
    if (typeof s.accent === "string" && /^#[0-9a-fA-F]{6}$/.test(s.accent)) {
      patch.accent = s.accent;
    }
    if (typeof s.hour12 === "boolean") patch.hour12 = s.hour12;
    if (typeof s.showSeconds === "boolean") patch.showSeconds = s.showSeconds;
    if (s.themeMode === "light" || s.themeMode === "dark" || s.themeMode === "system") {
      patch.themeMode = s.themeMode;
    }
    if (s.background === "glow" || s.background === "pure" || s.background === "photo") {
      patch.background = s.background;
    }
    if (s.iconStyle === "letter" || s.iconStyle === "favicon") patch.iconStyle = s.iconStyle;
    if (typeof s.engineId === "string" && ENGINE_IDS.has(s.engineId)) patch.engineId = s.engineId;
    if (typeof s.searchSuggest === "boolean") patch.searchSuggest = s.searchSuggest;
    const uname = cleanStr(s.userName, 20);
    if (uname) patch.userName = uname;
    if (Object.keys(patch).length > 0) settings = patch;
  }

  if (errors.length > 0) return { ok: false, errors };
  if (
    commands.length === 0 &&
    links.length === 0 &&
    dock.length === 0 &&
    settings == null &&
    scripts.length === 0 &&
    animations.length === 0 &&
    pages.length === 0 &&
    widgets.length === 0 &&
    layout == null &&
    icons.length === 0 &&
    tokens == null &&
    motion == null &&
    clock == null
  ) {
    return {
      ok: false,
      errors: [
        "预设里没有任何内容（commands / links / dock / settings / scripts / animations / pages / widgets / layout / icons / tokens / motion / clock 至少写一项）",
      ],
    };
  }

  return {
    ok: true,
    preset: {
      name,
      author: cleanStr(o.author, PRESET_LIMITS.authorLen) || undefined,
      description: cleanStr(o.description, PRESET_LIMITS.descLen) || undefined,
      commands,
      links,
      dock,
      settings,
      scripts: scripts.length > 0 ? scripts : undefined,
      animations: animations.length > 0 ? animations : undefined,
      pages: pages.length > 0 ? pages : undefined,
      widgets: widgets.length > 0 ? widgets : undefined,
      layout,
      icons: icons.length > 0 ? icons : undefined,
      tokens,
      motion,
      clock,
    },
  };
}

/* ---------- dock 图标白名单（lucide 名 → 组件，控制包体积与视觉一致性） ---------- */

import {
  Bookmark,
  BookOpen,
  Briefcase,
  Calendar,
  Camera,
  Cloud,
  Coffee,
  Compass,
  Gamepad2,
  Github,
  Globe,
  Heart,
  Home,
  Link2,
  Mail,
  Music2,
  Star,
  Terminal,
  Video,
  Zap,
  type LucideIcon,
} from "lucide-react";

export const DOCK_ICONS: Record<string, LucideIcon> = {
  bookmark: Bookmark,
  book: BookOpen,
  briefcase: Briefcase,
  calendar: Calendar,
  camera: Camera,
  cloud: Cloud,
  coffee: Coffee,
  compass: Compass,
  game: Gamepad2,
  github: Github,
  globe: Globe,
  heart: Heart,
  home: Home,
  link: Link2,
  mail: Mail,
  music: Music2,
  star: Star,
  terminal: Terminal,
  video: Video,
  zap: Zap,
};

export function dockIcon(name: string | undefined): LucideIcon | null {
  if (!name) return null;
  return DOCK_ICONS[name] ?? null;
}

/* ---------- 示例预设（导入对话框「填入示例」用） ---------- */

export const SAMPLE_PRESET = `{
  "chushi": 1,
  "name": "开发者工具箱",
  "author": "初始",
  "description": "示例预设：命令、磁贴、动画、沙箱页面与脚本",
  "commands": [
    { "title": "打开 GitHub", "action": { "type": "open", "url": "https://github.com" } },
    { "title": "搜索 MDN", "action": { "type": "search", "engine": "bing", "q": "MDN web docs" } },
    { "title": "打开待办", "action": { "type": "panel", "id": "todo" } },
    { "title": "每日一言", "action": { "type": "script", "id": "hitokoto" } },
    { "title": "打开专注页", "action": { "type": "page", "id": "focus" } }
  ],
  "links": [
    { "name": "MDN", "url": "https://developer.mozilla.org" },
    { "name": "V2EX", "url": "https://www.v2ex.com" }
  ],
  "dock": [
    { "title": "GitHub", "icon": "github", "action": { "type": "open", "url": "https://github.com" } },
    { "title": "一言", "icon": "heart", "action": { "type": "script", "id": "hitokoto" } }
  ],
  "layout": { "clockScale": 1.1, "linksColumns": 6 },
  "settings": { "hour12": false },
  "animations": [
    {
      "id": "breathe",
      "name": "时钟呼吸",
      "css": "@keyframes cl-breathe { 0%,100% { opacity: 1 } 50% { opacity: 0.55 } } .cl-clock { animation: cl-breathe 5s ease-in-out infinite }"
    }
  ],
  "pages": [
    {
      "id": "focus",
      "name": "专注页",
      "html": "<style>html,body{margin:0;height:100%;display:flex;align-items:center;justify-content:center;background:rgba(8,8,12,.82);backdrop-filter:blur(18px);color:#e4e4e7;font-family:system-ui,sans-serif}main{text-align:center}h1{font-size:44px;font-weight:200;letter-spacing:.12em;margin:0 0 8px}p{font-size:13px;font-weight:300;opacity:.55;margin:0 0 28px}button{all:unset;cursor:pointer;border:1px solid rgba(255,255,255,.22);border-radius:999px;padding:8px 26px;font-size:12px;letter-spacing:.2em}</style><main><h1>深呼吸</h1><p>吸气 4 秒 · 停留 4 秒 · 呼气 4 秒</p><button onclick=\\"chushi.close()\\">回到起始页</button></main>"
    }
  ],
  "scripts": [
    {
      "id": "hitokoto",
      "name": "每日一言",
      "code": "chushi.run = async () => { try { const r = await chushi.fetchJSON('https://v1.hitokoto.cn/'); chushi.notify({ title: r.hitokoto, description: '—— ' + (r.from || '佚名') }); } catch (e) { chushi.notify({ title: '一言获取失败', description: String(e && e.message || e) }); } }; chushi.registerCommand({ id: 'quote', title: '来一句每日一言', run: () => chushi.run() });"
    }
  ]
}`;
