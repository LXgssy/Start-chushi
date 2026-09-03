/* 「初始」预设设置面（v1.2.0）— 预设向设置面板贡献调节项的共享契约
 *
 * 架构律：宿主只提供「作用面」，不做任何具体视觉引擎。预设脚本经
 * chushi.settings.define(schema) 声明一组白名单控件（slider/toggle/select），
 * 宿主校验后渲染进设置面板；值变更经 chushi.settings.onChange 推回脚本
 * （液态玻璃预设的折射强度/霜化/色散等即由此热调）。本模块是三方共用的
 * 类型与校验/持久化工具：沙箱桥（sandbox.ts）用它校验 schema，
 * 页面（page.tsx）用它读写 localStorage，设置面板（SettingsPanel.tsx）
 * 用它合并默认值。
 *
 * 安全边界：schema 逐字段白名单校验（类型/上限/默认值合法），整体拒绝；
 * 持久化值按当前 schema 逐键夹紧（未知键/越界值/类型不符一律丢弃回退默认），
 * 脚本拿到的值永远合法。删除预设或重置数据时随 localStorage 一并回收。
 */

export interface PresetSettingControl {
  type: "slider" | "toggle" | "select";
  /** 控件键（脚本侧引用名），^[A-Za-z0-9_-]{1,32}$ */
  key: string;
  /** 展示名 ≤20 字 */
  label: string;
  /** slider 专用 */
  min?: number;
  max?: number;
  step?: number;
  /** 数值后缀 ≤6 字（如 % / px） */
  unit?: string;
  /** select 专用（2–6 项） */
  options?: { value: string; label: string }[];
  /** 默认值 */
  def: number | boolean | string;
}

export interface PresetSettingsSchema {
  /** 设置面板分区标题 ≤24 字 */
  title: string;
  /** 控件清单 1–12 个 */
  controls: PresetSettingControl[];
}

export type PresetSettingValue = number | boolean | string;
export type PresetSettingValues = Record<string, PresetSettingValue>;

const ID_RE = /^[A-Za-z0-9_-]{1,32}$/;
const MAX_CONTROLS = 12;
/** localStorage 键：scriptKey → values（页面、工具共用；重置数据随 KEYS 清理） */
export const PRESET_SETTINGS_KEY = "start:preset-settings";

/** schema 白名单校验：任一字段不合法即整体拒绝（返回 null） */
export function validateSettingSchema(raw: unknown): PresetSettingsSchema | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const title = typeof o.title === "string" ? o.title.trim().slice(0, 24) : "";
  if (!title) return null;
  if (!Array.isArray(o.controls) || o.controls.length === 0 || o.controls.length > MAX_CONTROLS) {
    return null;
  }
  const seen = new Set<string>();
  const controls: PresetSettingControl[] = [];
  for (const c of o.controls) {
    if (!c || typeof c !== "object") return null;
    const r = c as Record<string, unknown>;
    const key = typeof r.key === "string" ? r.key : "";
    const label = typeof r.label === "string" ? r.label.trim().slice(0, 20) : "";
    if (!ID_RE.test(key) || !label || seen.has(key)) return null;
    seen.add(key);
    if (r.type === "slider") {
      const min = Number(r.min);
      const max = Number(r.max);
      const step = Number(r.step) > 0 ? Number(r.step) : 1;
      const def = Number(r.def);
      if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(def)) return null;
      if (max <= min || max - min > 1000) return null;
      if (def < min || def > max) return null;
      controls.push({
        type: "slider",
        key,
        label,
        min,
        max,
        step,
        def,
        unit: typeof r.unit === "string" ? r.unit.slice(0, 6) : "",
      });
    } else if (r.type === "toggle") {
      controls.push({ type: "toggle", key, label, def: r.def === true });
    } else if (r.type === "select") {
      if (!Array.isArray(r.options) || r.options.length < 2 || r.options.length > 6) return null;
      const options = r.options
        .map((op) => {
          const x = (op ?? {}) as Record<string, unknown>;
          return {
            value: typeof x.value === "string" ? x.value.slice(0, 20) : "",
            label: typeof x.label === "string" ? x.label.trim().slice(0, 16) : "",
          };
        })
        .filter((op) => op.value && op.label);
      const def = typeof r.def === "string" ? r.def : "";
      if (options.length < 2 || !options.some((op) => op.value === def)) return null;
      controls.push({ type: "select", key, label, options, def });
    } else {
      return null;
    }
  }
  return { title, controls };
}

function readAll(): Record<string, PresetSettingValues> {
  try {
    const raw = localStorage.getItem(PRESET_SETTINGS_KEY);
    if (!raw) return {};
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? (v as Record<string, PresetSettingValues>) : {};
  } catch {
    return {};
  }
}

/** 按当前 schema 校验持久化值并补默认值：未知键丢弃、越界夹紧、类型不符回退 */
export function readPresetSettingValues(
  scriptKey: string,
  schema: PresetSettingsSchema | null
): PresetSettingValues {
  const raw = readAll()[scriptKey];
  if (!schema) return raw && typeof raw === "object" ? { ...raw } : {};
  const out: PresetSettingValues = {};
  for (const c of schema.controls) {
    const v = raw ? raw[c.key] : undefined;
    if (c.type === "slider") {
      const n = Number(v);
      out[c.key] =
        Number.isFinite(n) && v !== undefined && v !== null && typeof v !== "boolean"
          ? Math.min(c.max as number, Math.max(c.min as number, n))
          : (c.def as number);
    } else if (c.type === "toggle") {
      out[c.key] = typeof v === "boolean" ? v : (c.def as boolean);
    } else {
      out[c.key] =
        typeof v === "string" && (c.options ?? []).some((op) => op.value === v)
          ? v
          : (c.def as string);
    }
  }
  return out;
}

/** 持久化一个脚本的全部设置值（整组覆写） */
export function writePresetSettingValues(scriptKey: string, values: PresetSettingValues) {
  try {
    const all = readAll();
    all[scriptKey] = values;
    localStorage.setItem(PRESET_SETTINGS_KEY, JSON.stringify(all));
  } catch {
    /* 存储满/禁用：运行时值照常生效，仅不持久化 */
  }
}

/** 回收一个预设（按 `${presetId}:` 前缀）的全部脚本设置值——删除预设即一并清理 */
export function prunePresetSettings(scriptKeyPrefix: string) {
  try {
    const all = readAll();
    let changed = false;
    for (const k of Object.keys(all)) {
      if (k.startsWith(scriptKeyPrefix)) {
        delete all[k];
        changed = true;
      }
    }
    if (changed) localStorage.setItem(PRESET_SETTINGS_KEY, JSON.stringify(all));
  } catch {
    /* noop */
  }
}
