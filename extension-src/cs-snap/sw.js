/* ============================================================================
 * 「初始」快照服务 Service Worker（v8.4.5）——子路径作用域
 *
 * 注册方：壳页 shell-bridge.js（navigator.serviceWorker.register(
 * "cs-snap/sw.js", { scope: "cs-snap/" })）。脚本物理存在于包内 cs-snap/
 * 子目录（无下划线，过 Chromium 保留名规则），作用域仅覆盖 /cs-snap/。
 *
 * ⚠ 作用域铁律（探针实证）：MV3 扩展的 background service worker 以
 * scope=/ 占据扩展 origin 的 SW 注册表且【不参与 fetch 拦截】——
 *   · 根作用域 "/" 的页面 SW 注册会被拒（The user denied permission）；
 *   · background SW 自身的 fetch 监听也拦不住导航（X2 实验）；
 *   · 子路径作用域页面 SW 注册/拦截均正常（X1 实验）。
 * 因此快照虚拟目录必须是子路径 /cs-snap/，且根路径导航无 SW 兜底——
 * 壳的地址栏策略因此收敛为 replaceState("./index.html")（F5 落自足
 * 应用，见 shell-bridge.js）。
 *
 * 职责：
 *   1) /cs-snap/* 云端更新快照虚拟目录：更新器（ext-bg.js）发现云端新版
 *      时把文件集缓存进 IndexedDB（库 chushi-snap）；壳把 iframe 指向
 *      /cs-snap/index.html，本 SW 从 IDB 合成响应——快照离线可用，与
 *      内嵌版同源（chrome-extension://），页面自带 chrome API，面板与
 *      浮窗开关同步零桥接。
 *   2) 快照文档的根相对子资源改写：快照 index.html 内嵌脚本的运行时
 *      动态请求（Turbopack chunk / sandbox.js 等）按构建期习惯写成根绝
 *      对路径——受控文档（快照文档由本 SW 服务=被其控制）的一切请求都
 *      流经本 SW，凡 referrer 落在 /cs-snap/ 下的一律改从 IDB 取，与
 *      下载期的 HTML 文本改写（ext-bg.js）双保险。
 *   其余请求零打扰：不 respondWith，直通网络。
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
const SNAP_PREFIX = "/cs-snap/";

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

/* —— v8.4.8 免 referrer 子资源供数 ——
 * 受控 client（快照文档）发出的同源请求，凡路径命中快照文件即由 IDB
 * 供数；未命中返回 null（调用方穿透网络/包内真文件）。
 * 背景：Chromium（chromium-1234+ 探针实录）对扩展 origin 文档的子资源
 * 请求 referrer 为空——v8.4.5~8.4.7 的 referrer 判定分支永不命中，快照
 * 子资源穿透网络 ERR_FILE_NOT_FOUND（diag-swtrace: fe /mark.js ref=EMPTY）。
 * 嵌入版/壳页不在本 SW 作用域内（非受控 client），其请求不进本 handler，
 * 与包内真文件零冲突。 */
async function serveSnapIfAny(path) {
  const key = String(path || "").split("?")[0];
  if (!key) return null;
  const meta = await snapMeta();
  if (!meta || !meta.v) return null;
  const buf = await snapFile(meta.v, key);
  if (buf == null) return null;
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

  /* 1) 快照虚拟目录（iframe 导航 + 快照内相对资源） */
  if (url.pathname.startsWith(SNAP_PREFIX)) {
    const seg = decodeURIComponent(url.pathname.slice(SNAP_PREFIX.length));
    /* ⚠ 沙箱特权页绝不经 SW 合成（对照实验实证：同内容异路径，沙箱页
       挂死、普通页正常）——落网络取包内真实文件 cs-snap/sandbox.html */
    if (seg === "sandbox.html" || seg === "sandbox.js") return;
    e.respondWith(serveSnap(seg));
    return;
  }

  /* 2) 快照文档的根相对子资源（v8.4.8 免 referrer 硬化）：受控 client 的
     同源请求按路径查快照，命中即 IDB 供数，未命中穿透网络/包内真文件。
     沙箱特权页保持豁免（SW 合成挂死实证）；v8.4.5~8.4.7 的 referrer
     判定分支退役（新 Chromium referrer 恒空，见 serveSnapIfAny 注）。
     嵌入版/壳页非受控 client，请求不进本 handler，零冲突。 */
  let seg = "";
  try { seg = decodeURIComponent(url.pathname.replace(/^\/+/, "")).split("?")[0]; }
  catch (_) { return; }
  if (seg === "sandbox.html" || seg === "sandbox.js") return;
  e.respondWith((async () => {
    try {
      const hit = await serveSnapIfAny(seg);
      if (hit) return hit;
    } catch (_) { /* 快照读失败：穿透 */ }
    return fetch(req);
  })());
});
