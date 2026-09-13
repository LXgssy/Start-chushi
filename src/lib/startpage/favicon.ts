/* 快捷服务磁贴的站点图标：免梯子多源回退 + 记住命中的源。
 *
 * 背景：原实现只有一个源（DuckDuckGo 图标服务），写死在 QuickLinks.tsx 里
 * （https://icons.duckduckgo.com/ip3/<host>.ico）—— 国内直连不到，
 * 磁贴就恒落在「域名首字母」兜底上，用户观感是「图标刷不出来」。
 *
 * 策略（按序尝试，任一成功即记住这个 host 用哪个源）：
 *   1. 站点自己的 /favicon.ico —— 无第三方，国内直连最稳，也不泄露访问清单；
 *   2. 国内可直连的图标 API（zhusl / cccyun / xinac）—— 站点没放 favicon 时兜底；
 *   3. DuckDuckGo —— 保留给海外用户与历史命中。
 * 全失败则磁贴回落到域名首字母（原有逻辑，不动）。
 *
 * 只记住「源 URL」，不做二进制缓存：图标是跨源图片，fetch 会被 CORS 拒绝、
 * canvas 也会被污染取不到 Blob；浏览器自身的 HTTP 缓存已足够避免重复下载。
 * 记住源的价值是「下次不再逐个试错」，不是省掉那一次网络往返。
 */

const KEY_PREFIX = "favicon-src:";

/** 图标源优先级（顺序即尝试顺序） */
export function iconSources(host: string): string[] {
  return [
    "https://" + host + "/favicon.ico",
    "https://favicon.zhusl.com/ico?url=" + host,
    "https://favicon.cccyun.cc/" + host,
    "https://api.xinac.net/icon/?url=" + host,
    "https://icons.duckduckgo.com/ip3/" + host + ".ico",
  ];
}

function key(host: string) {
  return KEY_PREFIX + host;
}

export function readIconSource(host: string): string | null {
  try {
    return window.localStorage.getItem(key(host));
  } catch {
    return null;
  }
}

export function saveIconSource(host: string, url: string) {
  try {
    window.localStorage.setItem(key(host), url);
  } catch {
    /* 隐私模式 / 配额满：忽略，退化为每次按序试 */
  }
}

export function clearIconSource(host: string) {
  try {
    window.localStorage.removeItem(key(host));
  } catch {
    /* noop */
  }
}

/** 实际尝试顺序：命中过的源排到最前，其余保持原序（命中源失效时仍能逐级兜底） */
export function orderedIconSources(host: string): string[] {
  const all = iconSources(host);
  const saved = readIconSource(host);
  if (!saved) return all;
  const i = all.indexOf(saved);
  if (i <= 0) return all;
  return [all[i]].concat(all.slice(0, i), all.slice(i + 1));
}
