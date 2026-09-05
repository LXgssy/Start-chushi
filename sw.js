/* global clients */
/* ============================================================
 * 「初始 · Start」离线缓存 Service Worker
 * 目标：一次加载，长期使用——GitHub Pages 国内访问慢，
 *       首次加载后静态资源全部落缓存，后续打开近乎秒开。
 *
 * 策略：
 *  - 导航请求（HTML）→ stale-while-revalidate：缓存秒开 + 后台静默更新，
 *    离线/失败时兜底缓存的站点外壳
 *  - /_next/static/**（内容哈希文件名，永不变化）及其他同源静态资源
 *    → 缓存优先（cache-first），首次访问经 fetch 钩子自然入缓存
 *  - 安装时预缓存站点外壳（导航文档，绕过 HTTP 缓存强制拉取）
 *  - 激活时清理全部旧版本缓存桶
 *  - 跨域请求（天气 API / 百度联想 JSONP / 掠影图源）一律不拦截，
 *    交还浏览器；壁纸/天气离线时已有静默降级路径
 *
 * 版本：20260905114942-fd775b1（占位符）在 deploy-pages.sh 部署时替换为
 *       「UTC 时间戳-源码 SHA」，保证每次部署浏览器都能发现新字节
 *       并在后台换装（skipWaiting + clients.claim，不打断当前页面）。
 *       本地 standalone 构建保留占位符原样运行，互不干扰。
 * ============================================================ */

const BUILD = "20260905114942-fd775b1";
const CACHE = "start-chushi-" + BUILD;

/** 站点外壳（导航归一键）：由 registration.scope 推导，自动兼容
 *  Pages 项目站子路径（/Start-chushi/）与本地根路径部署（/） */
const ROOT = new URL(self.registration.scope);

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      try {
        /* 预缓存外壳文档；cache:"reload" 绕过 HTTP 缓存，确保拿到最新 HTML */
        const res = await fetch(ROOT.href, { cache: "reload" });
        if (res && res.ok) {
          await cache.put(ROOT.href, res.clone());
          /* 解析外壳引用的同源静态资源清单并主动预缓存——
             首次加载时页面尚未被 SW 接管，chunk 请求不经过 fetch 钩子，
             若不在此处补齐，缓存要等到第二次加载才能填满 */
          const html = await res.text();
          const urls = new Set();
          const re = /(?:src|href)="(\/[^"]+)"/g;
          let m;
          while ((m = re.exec(html))) {
            const u = m[1];
            if (/\/_next\//.test(u) || /\.(?:svg|png|ico|woff2?)$/.test(u)) {
              urls.add(u);
            }
          }
          /* 图形化预设开发工具（v1.3.0）：单文件离线应用，随外壳预缓存，
             保证离线状态下导入面板的下载按钮依然可用 */
          urls.add(new URL("preset-studio.html", ROOT).href);
          await Promise.all(
            [...urls].map(async (u) => {
              try {
                const r = await fetch(new URL(u, ROOT), { cache: "reload" });
                if (r && r.ok) await cache.put(new URL(u, ROOT), r.clone());
              } catch (_) {
                /* 单个资源失败不阻塞安装，运行时缓存会兜底补齐 */
              }
            })
          );
        }
      } catch (_) {
        /* 离线时安装不阻塞：外壳等首次访问经运行时缓存补齐 */
      }
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; /* 跨域不拦截 */
  if (url.pathname.endsWith("/sw.js")) return; /* SW 自身永不缓存 */

  if (req.mode === "navigate") {
    event.respondWith(staleWhileRevalidate(req, url, event));
    return;
  }
  event.respondWith(cacheFirst(req));
});

/** 单页应用：范围内任意导航（含 ?__sw 之类查询参数）统一归一到外壳，
 *  保证命中同一条缓存记录 */
function shellKey(url) {
  const bare = ROOT.pathname.replace(/\/$/, "");
  if (url.pathname === ROOT.pathname || url.pathname === bare) return ROOT.href;
  return url.href;
}

/** 导航：缓存秒开 + 后台静默更新；无缓存且网络失败 → 兜底外壳。
 *  【生死线】后台更新必须挂 event.waitUntil：respondWith 一旦兑现，
 *  浏览器可能立刻回收 SW——悬空的 fetch/cache.put 会被杀死，
 *  缓存永远得不到更新（本地仿真实测复现过） */
async function staleWhileRevalidate(req, url, event) {
  const cache = await caches.open(CACHE);
  const key = shellKey(url);
  const update = fetch(req)
    .then((res) => {
      if (res && res.ok) return cache.put(key, res.clone()).catch(() => {});
    })
    .catch(() => {});
  if (event && event.waitUntil) event.waitUntil(update);
  const cached = await cache.match(key, { ignoreSearch: true });
  if (cached) return cached;
  await update;
  return (
    (await cache.match(key, { ignoreSearch: true })) ||
    (await cache.match(ROOT.href, { ignoreSearch: true })) ||
    Response.error()
  );
}

/** 同源静态资源：缓存优先，未命中则取回并写入缓存 */
async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    /* 仅缓存同源 200（basic）；4xx/5xx/opaque 一律不落缓存 */
    if (res && res.status === 200 && res.type === "basic") {
      cache.put(req, res.clone()).catch(() => {});
    }
    return res;
  } catch (_) {
    return Response.error();
  }
}
