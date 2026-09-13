/* ============================================================================
 * 「初始」站点 Service Worker（v8.4.5）——本地直载壳的两根支柱
 *
 * 注册方：壳页 shell-bridge.js（navigator.serviceWorker.register("sw.js")，
 * 默认作用域 = 扩展根）。v8.4.5 架构律：新标签页壳只做「版本路由 + 地址栏
 * 收敛」，页面内容永远本地直载（扩展内嵌完整版，或云端更新快照），壳的
 * 启动路径零网络。
 *
 * 本 SW 三职责：
 *   1) 根路径导航兜底：壳加载后 history.replaceState("/") 把地址栏收敛到
 *      只剩扩展 ID（用户指令：地址栏不要写一串网址）。Chrome 对扩展根
 *      路径的裸导航是 ERR_FILE_NOT_FOUND（探针 E 实证）——本 SW 拦截根
 *      路径导航并服务壳页，F5 无感存活。
 *   2) /__cssnap/* 云端更新快照虚拟目录：更新器（ext-bg.js）发现云端新版
 *      时把文件集缓存进 IndexedDB（库 chushi-snap）；壳把 iframe 指向
 *      /__cssnap/index.html，本 SW 从 IDB 合成响应——快照离线可用，与
 *      内嵌版同源（chrome-extension://），页面自带 chrome API，面板与
 *      浮窗开关同步零桥接。
 *   3) 快照文档的根相对子资源改写：快照 index.html 内嵌脚本的运行时
 *      动态请求（Turbopack chunk / sandbox.js 等）按构建期习惯写成根绝
 *      对路径（/next/...）——受控文档的一切请求都流经本 SW，凡 referrer
 *      落在 /__cssnap/ 下的一律改从 IDB 取，与下载期的 HTML 文本改写
 *      （ext-bg.js）双保险。
 *   其余请求零打扰：不 respondWith，直通网络（扩展内文件请求微开销）。
 *
 * IDB 约定（与 ext-bg.js / shell-bridge.js 三份同构实现，勿单点改动）：
 *   库 "chushi-snap" v1
 *     store "kv"    : "meta" -> { v, files:[{p,s}], at }
 *     store "files" : "<v>::<path>" -> ArrayBuffer
 * 原子性：meta 是开关——文件未全量落库前 meta 不动，快照服务永远只见
 * 完整版本（探针 T8 旧版不降级同门）。
 * ==========================================================================*/

"use strict";

const SNAP_DB = "chushi-snap";
const SNAP_STORE_KV = "kv";
const SNAP_STORE_FILES = "files";
const SNAP_PREFIX = "/__cssnap/";

/* —— IDB 微助手（三份同构之一） —— */
let __snapDbProm = null;
function snapDb() {
  if (__snapDbProm) return __snapDbProm;
  __snapDbProm = new Promise((resolve, reject) => {
    const rq = indexedDB.open(SNAP_DB, 1);
    rq.onupgradeneeded = () => {
      const db = rq.result;
      if (!db.objectStoreNames.contains(SNAP_STORE_KV)) db.createObjectStore(SNAP_STORE_KV);
      if (!db.objectStoreNames.contains(SNAP_STORE_FILES)) db.createObjectStore(SNAP_STORE_FILES);
    };
    rq.onsuccess = () => resolve(rq.result);
    rq.onerror = () => reject(rq.error);
  });
  return __snapDbProm;
}
function snapGet(store, key) {
  return snapDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const rq = tx.objectStore(store).get(key);
    rq.onsuccess = () => resolve(rq.result);
    rq.onerror = () => reject(rq.error);
  }));
}
const snapMeta = () => snapGet(SNAP_STORE_KV, "meta").catch(() => null);
const snapFile = (v, path) => snapGet(SNAP_STORE_FILES, v + "::" + path).catch(() => null);

/* —— Content-Type（构建产物面足够） —— */
function contentTypeOf(path) {
  const m = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".mp3": "audio/mpeg",
    ".webm": "video/webm",
    ".mp4": "video/mp4",
  };
  const i = path.lastIndexOf(".");
  return i >= 0 ? (m[path.slice(i).toLowerCase()] || "application/octet-stream") : "application/octet-stream";
}

/* —— 快照合成响应 —— */
async function serveSnap(path) {
  const meta = await snapMeta();
  if (!meta || !meta.v) return new Response("「初始」快照未就绪", { status: 404 });
  const key = path || "index.html";
  const buf = await snapFile(meta.v, key);
  if (buf == null) return new Response("「初始」快照缺文件 " + key, { status: 404 });
  return new Response(buf, {
    headers: {
      "Content-Type": contentTypeOf(key),
      "Cache-Control": "no-store",
      "X-Chushi-Snap": meta.v,
    },
  });
}

self.addEventListener("install", (e) => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  let url;
  try { url = new URL(req.url); } catch (_) { return; }
  if (url.origin !== self.location.origin) return;

  /* 1) 根路径导航兜底（F5 存活：地址栏是根，内容是壳） */
  if (req.mode === "navigate" && url.pathname === "/") {
    e.respondWith(
      fetch("shell.html", { cache: "no-cache" }).catch(
        () => new Response("「初始」壳不可用", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } })
      )
    );
    return;
  }

  /* 2) 快照虚拟目录（iframe 导航 + 快照内相对资源） */
  if (url.pathname.startsWith(SNAP_PREFIX)) {
    e.respondWith(serveSnap(decodeURIComponent(url.pathname.slice(SNAP_PREFIX.length))));
    return;
  }

  /* 3) 快照文档发出的根相对子资源（referrer 判定改写） */
  if (req.referrer) {
    try {
      const ref = new URL(req.referrer);
      if (ref.origin === self.location.origin && ref.pathname.startsWith(SNAP_PREFIX)) {
        e.respondWith(serveSnap(decodeURIComponent(url.pathname.replace(/^\/+/, ""))));
        return;
      }
    } catch (_) { /* referrer 异常：直通 */ }
  }
  /* 其余：零打扰直通 */
});
