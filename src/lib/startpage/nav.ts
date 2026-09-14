/* 「初始」外部导航提升（v8.4.8）
 *
 * 根因（v8.4.5 壳架构的副作用）：新标签页顶层是 shell.html，应用整体跑在
 * 它的全屏 iframe 里（本地直载 / cs-snap 快照同为扩展 origin）。应用内的
 * 外部链接与搜索跳转若不指定目标框架，默认只在 iframe 内导航——而主流
 * 站点几乎都携带 X-Frame-Options: DENY / SAMEORIGIN（或 CSP
 * frame-ancestors），Chrome 拒绝把这类站点嵌进 iframe，整页就呈现
 * 「xxx 拒绝了我们的连接请求」（REFUSED_TO_CONNECT）。v8.4.4 之前应用
 * 本身就是顶层文档，点击快捷服务是整页跳转，故无此问题。
 *
 * 修复：凡「扩展内 + 应用处于 iframe 中」，把外部导航提升到顶层框架
 * （window.top.location.href）——顶层标签页整页跳走、后退键回到新标签页，
 * 与 v8.4.4 之前的旧行为完全一致。网页版（无 chrome.runtime.id，也不在
 * iframe 里）保持原地 location.assign，行为不变。
 */

type CsRuntime = { runtime?: { id?: string } };

/** 应用是否运行在「扩展壳」的 iframe 中（网页版恒 false） */
export function inExtIframe(): boolean {
  if (typeof window === "undefined") return false;
  const ext = !!(window as unknown as { chrome?: CsRuntime }).chrome?.runtime?.id;
  if (!ext) return false;
  try {
    return window.self !== window.top;
  } catch {
    return true; /* 跨域父页访问即抛异常——必在 iframe 中 */
  }
}

/** 打开外部 URL：扩展壳 iframe 内提升到顶层框架；newTab 时新开标签页。
 *  注：window.open 在 iframe 内调用，开出的也是顶层新标签页（浏览器保证）。 */
export function openExternalUrl(url: string, newTab = false): void {
  if (!url) return;
  if (inExtIframe()) {
    if (newTab) {
      try {
        window.open(url, "_blank");
      } catch {
        /* 弹窗拦截等场景：静默 */
      }
      return;
    }
    try {
      const top = window.top;
      if (!top) throw new Error("no top");
      top.location.href = url; /* 壳 iframe 与应用同源（chrome-extension://）可直写 */
      return;
    } catch {
      /* 跨域父页等兜底：宁可新开标签页，也不能把站点嵌进 iframe */
      try {
        window.open(url, "_blank");
      } catch {
        /* noop */
      }
      return;
    }
  }
  window.location.assign(url);
}
