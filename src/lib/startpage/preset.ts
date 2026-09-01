/* 「初始」预设系统 — 声明式预设（v1）
 *
 * 设计原则：
 * 1. 零代码执行：预设是纯声明式 JSON，所有能力走白名单 action（open/copy/search/panel/theme），
 *    不存在 eval、不存在任意函数——安全边界由「类型 + 白名单 + 长度上限」三重护栏构成；
 * 2. 装了即生效：预设安装后，命令 → ⌘K 指令面板，dock 项 → 底部 tab 栏，磁贴 → 快捷链接区，
 *    全部从已安装列表派生（删除预设即全部失效，无隐藏状态）；
 * 3. 可分享：一段 JSON 复制给朋友，导入即用（与备份导出同一交互语言）。
 *
 * 沙箱 JS（高阶模式）为路线图第三步，届时以受控宿主 API + 沙箱解释器接入，
 * 本文件的类型边界（PresetAction）已为其预留演化空间。 */

import type { Settings } from "./types";
import { ENGINES } from "./engines";

/* ---------- 白名单 action ---------- */

export type PresetAction =
  | { type: "open"; url: string }
  | { type: "copy"; text: string }
  | { type: "search"; engine: string; q: string }
  | { type: "panel"; id: "weather" | "todo" | "note" | "pomodoro" | "settings" }
  | { type: "theme"; mode: "light" | "dark" };

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
export type PresetSettings = Partial<Pick<Settings, "accent" | "hour12" | "showSeconds">>;

export interface PresetPayload {
  name: string;
  author?: string;
  description?: string;
  commands: PresetCommand[];
  links: PresetLink[];
  dock: PresetDockItem[];
  settings?: PresetSettings;
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
} as const;

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

function parseAction(v: unknown, errors: string[], where: string): PresetAction | null {
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
    default:
      errors.push(
        `${where}：未知 action 类型「${cleanStr(a.type, 16) || "(空)"}」，可用：open / copy / search / panel / theme`
      );
      return null;
  }
}

function parseArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
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
    const action = parseAction((c as Record<string, unknown>).action, errors, where);
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
    const action = parseAction(dobj.action, errors, where);
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
    if (Object.keys(patch).length > 0) settings = patch;
  }

  if (errors.length > 0) return { ok: false, errors };
  if (
    commands.length === 0 &&
    links.length === 0 &&
    dock.length === 0 &&
    settings == null
  ) {
    return { ok: false, errors: ["预设里没有任何内容（commands / links / dock / settings 至少写一项）"] };
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
  "description": "示例预设：演示命令、磁贴与 tab 栏按钮的写法",
  "commands": [
    { "title": "打开 GitHub", "action": { "type": "open", "url": "https://github.com" } },
    { "title": "搜索 MDN", "action": { "type": "search", "engine": "bing", "q": "MDN web docs" } },
    { "title": "打开待办", "action": { "type": "panel", "id": "todo" } }
  ],
  "links": [
    { "name": "MDN", "url": "https://developer.mozilla.org" },
    { "name": "V2EX", "url": "https://www.v2ex.com" }
  ],
  "dock": [
    { "title": "GitHub", "icon": "github", "action": { "type": "open", "url": "https://github.com" } }
  ],
  "settings": { "hour12": false }
}`;
