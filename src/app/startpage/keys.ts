/* 「初始」起始页 — localStorage 键位注册表（beta 重写架构）
 *
 * 全部持久化键在此集中登记：
 *  · 键名是历史契约（存量用户数据兼容），永远不改；
 *  · resetAll 逐键清理即遍历本表——新增持久化键必须同步登记，
 *    否则「恢复默认」会留下孤儿数据。
 */
export const KEYS = {
  settings: "start:settings",
  links: "start:links",
  todos: "start:todos",
  note: "start:note",
  place: "start:place",
  presets: "start:presets",
  /** 沙箱脚本冻结标记（key → true），启动超时自动停用后记忆 */
  sandboxFrozen: "start:sandbox-frozen",
  /** 预设设置面持久化值（PRESET_SETTINGS_KEY = "start:preset-settings"） */
  presetSettings: "start:preset-settings",
} as const;

/** 弹窗快捷面板「打开完整设置」意图（popup 写一次性标志后新开标签页） */
export const INTENT_KEY = "start:ui-intent";

/** 首次访问提示标记 */
export const SEEN_KEY = "start:seen";
