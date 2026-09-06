/* 「初始」部件帧共享注册表（v2.0.0 统一面板舞台配套）。
 *
 * 背景：dock 表面部件的 iframe 自 v2.0.0 起由 Dock 的统一面板舞台渲染
 * （与内建面板同一套切换动画/模糊语言/常驻预热），而部件 API 消息路由、
 * SMTC 快照/逐拍广播仍由 PresetWidgets 承担——两侧需要共享同一份
 * iframe 句柄表。这里提供模块级注册表与定向投递工具。
 *
 * 契约：iframe ref 回调挂载时 set、卸载时 delete；key = `${presetId}:${widgetId}`。
 */

const frames = new Map<string, HTMLIFrameElement>();

export function widgetFrameSet(key: string, el: HTMLIFrameElement | null): void {
  if (el) frames.set(key, el);
  else frames.delete(key);
}

export function widgetFrameGet(key: string): HTMLIFrameElement | undefined {
  return frames.get(key);
}

/** 向单个部件宿主帧（sandbox.html?mode=widget）投递消息（静默容错） */
export function postToWidget(key: string, msg: Record<string, unknown>): void {
  try {
    widgetFrameGet(key)?.contentWindow?.postMessage(msg, "*");
  } catch {
    /* noop */
  }
}

/** 主题/强调色变化 → 下发全部部件帧 */
export function widgetThemeBroadcast(
  widgets: { key: string }[],
  isDark: boolean,
  accent: string
): void {
  for (const w of widgets) {
    postToWidget(w.key, {
      type: "widgetTheme",
      theme: isDark ? "dark" : "light",
      accent,
    });
  }
}
