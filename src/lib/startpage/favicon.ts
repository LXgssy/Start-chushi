/* 快捷服务磁贴的站点图标：免梯子多源回退 + 记住命中的源。
 *
 * 背景：原实现只有一个源（DuckDuckGo 图标服务），写死在 QuickLinks.tsx 里
 * （https://icons.duckduckgo.com/ip3/<host>.ico）—— 国内直连不到，
 * 磁贴就恒落在「域名首字母」兜底上，用户观感是「图标刷不出来」。
 *
 * v8.7.105 清晰源律（用户实测「站点图标都太糊了」）：
 *   旧链两处糊源根因——① favicon.zhusl.com 实测恒返回 16×16（铺满/居中显示
 *   都必糊）；② 站点 /favicon.ico 与 cccyun/xinac/ddg 拿到的多为 32~64px。
 *   实测五站十源（scripts/favicon-source-test.py）后重排源链：
 *     1. favicon.im（larger=true）—— 实测 114~180px 高清，国内直连可达；
 *        对部分站 404（github/baidu），onError 即时降级无感；
 *     2. 站点自己的 /favicon.ico —— 无第三方，国内直连最稳，ico 内多帧
 *        （32~64px 起步），大站普遍 64px+；
 *     3. cccyun / xinac —— 站点没放 favicon 时兜底（内部多为抓站点图标）；
 *     4. DuckDuckGo —— 海外用户与历史命中；
 *     5. Google s2 sz=128 —— 压轴高清兜底（128px 恒定）：国内直连不可达
 *        会长时间挂起，绝不能排在前位（首屏磁贴会空面等超时），排末位后
 *        只有前面全部失败的站才轮到（国内站前面必然命中，零额外等待），
 *        海外/梯子用户从此拿到 128px 高清。
 *   同时源记忆键前缀升级 favicon-src2:——老用户的 favicon-src: 记忆里
 *   存着 16px 的 zhusl 命中，直接沿用会永久锁死糊源；前缀换代让全部磁贴
 *   按新链重试一轮（旧键一次性清理，不留孤儿）。
 *
 * 策略（按序尝试，任一成功即记住这个 host 用哪个源）。
 * 全失败则磁贴回落到域名首字母（原有逻辑，不动）。
 *
 * 只记住「源 URL」，不做二进制缓存：图标是跨源图片，fetch 会被 CORS 拒绝、
 * canvas 也会被污染取不到 Blob；浏览器自身的 HTTP 缓存已足够避免重复下载。
 * 记住源的价值是「下次不再逐个试错」，不是省掉那一次网络往返。
 */

const KEY_PREFIX = "favicon-src2:";
/** 上一代记忆键前缀：模块首读时一次性清理（16px 糊源时代遗留） */
const LEGACY_PREFIX = "favicon-src:";
let legacySwept = false;

function sweepLegacyKeys() {
  if (legacySwept || typeof window === "undefined") return;
  legacySwept = true;
  try {
    const dead: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(LEGACY_PREFIX)) dead.push(k);
    }
    dead.forEach((k) => window.localStorage.removeItem(k));
  } catch {
    /* 隐私模式等场景：清理失败无害，legacySwept 已置位不再重试 */
  }
}

/** 图标源优先级（顺序即尝试顺序；v8.7.105 清晰源律，见文件头） */
export function iconSources(host: string): string[] {
  return [
    "https://favicon.im/" + host + "?larger=true",
    "https://" + host + "/favicon.ico",
    "https://favicon.cccyun.cc/" + host,
    "https://api.xinac.net/icon/?url=" + host,
    "https://icons.duckduckgo.com/ip3/" + host + ".ico",
    "https://www.google.com/s2/favicons?domain=" + host + "&sz=128",
  ];
}

function key(host: string) {
  return KEY_PREFIX + host;
}

export function readIconSource(host: string): string | null {
  sweepLegacyKeys();
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
