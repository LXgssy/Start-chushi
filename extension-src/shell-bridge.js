/* 「初始」本地直载壳 · 壳运行时（v8.4.5）
 * v8.4.4 的壳是「云端优先」（iframe 载 GitHub Pages + 握手超时回退本地）；
 * v8.4.5 按用户指令反转为「本地直载」：
 *   —— 新标签页启动路径零网络：版本路由只读本地（IndexedDB 快照元数据 vs
 *      扩展自版本），iframe 指向二者中较新的本地内容；
 *   —— 加载完成后直接缓存在本地：云端新版由 ext-bg.js 更新器后台下载进
 *      IndexedDB（库 chushi-snap），本壳只消费其 meta，从不等下载；
 *   —— 新开标签页直接加载最新版本：路由结果 = max(内嵌版, 快照版)；
 *   —— 地址栏：永不跳转任何 http(s) 网址（壳始终是扩展自家页面），加载后
 *      replaceState 到 ./index.html —— 地址栏只剩扩展 ID + 文件名，且 F5
 *      落在自足的应用顶层（index.html 可独立运行，等于 v8.3.x 行为）；
 *      ⚠ Chrome 硬限制：扩展根路径 "/" 导航是 ERR_FILE_NOT_FOUND 且
 *      background SW 不参与 fetch 拦截（决胜实验 X2），根形态无法 F5
 *      兜底，故弃用。
 * 本文件同时保留 v8.4.4 云端桥三职责（对云端 iframe 模式仍生效）：
 *   1) 监听 iframe（云端 Pages 页）postMessage，校验 origin 白名单与来源
 *      窗口后代写 chrome.storage.local（云端页面自己没有 chrome API）；
 *   2) chrome.storage.onChanged 反向推送进 iframe——云端页面与扩展浮窗
 *      双向实时同步；
 *   3) 云端模式健康监测：握手超时回退本地完整版。
 * 本地 iframe（chrome-extension:// 同源）不需要也不触发桥——页面自带
 * chrome API，面板与浮窗开关经 chrome.storage 原生同步。
 * 协议（与 shim-page.js / cs-bridge.js 三方一致，原样保留）：
 *   页面 → host: { src:'chushi-bridge', role:'page', id, op:'hello'|'get'|'set'|'remove'|'getAll', ... }
 *   host → 页面: { src:'chushi-bridge', role:'host', reply:id, ok, data?, err? }
 *                { src:'chushi-bridge', role:'host', event:'changed', changes:{...} }
 * 安全面：origin 严格白名单（https://lxgssy.github.io）+ e.source 必须是
 * 本壳 iframe + 键名白名单 + 单值/单批尺寸上限。
 */
(() => {
        "use strict";
        const CLOUD_ORIGIN = "https://lxgssy.github.io"; // 唯一可信源（云端模式）
        const KEY_RE = /^[A-Za-z][A-Za-z0-9_:-]{0,127}$/; // 键白名单（128 字符内，可读首字符）
        const VAL_MAX = 512 * 1024; // 单值上限 512KB
        const BATCH_MAX = 1024 * 1024; // 单批上限 1MB
        const HANDSHAKE_TIMEOUT = 10000; // 云端模式握手超时（毫秒）
        const SNAP_PREFIX = "/cs-snap/";
        const SNAP_DB = "chushi-snap";
        const SNAP_WAIT_MS = 2500; // 快照模式等快照 SW 激活的时限

        const frame = document.getElementById("csShellFrame");
        const boot = document.getElementById("csShellBoot");
        if (!frame || !chrome?.storage?.local) return;
        const store = chrome.storage.local;
        let handshaken = false;

        const fadeBoot = () => {
                if (!boot) return;
                boot.style.opacity = "0";
                setTimeout(() => boot.remove(), 380);
        };

        /* ============ 快照 IDB 读（与 sw.js / ext-bg.js 三份同构） ============ */
        let __snapDbProm = null;
        function snapDb() {
                if (__snapDbProm) return __snapDbProm;
                __snapDbProm = new Promise((resolve, reject) => {
                        const rq = indexedDB.open(SNAP_DB, 1);
                        rq.onupgradeneeded = () => {
                                const db = rq.result;
                                if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
                                if (!db.objectStoreNames.contains("files")) db.createObjectStore("files");
                        };
                        rq.onsuccess = () => resolve(rq.result);
                        rq.onerror = () => reject(rq.error);
                });
                return __snapDbProm;
        }
        function snapGetMeta() {
                return snapDb().then((db) => new Promise((resolve, reject) => {
                        const tx = db.transaction("kv", "readonly");
                        const rq = tx.objectStore("kv").get("meta");
                        rq.onsuccess = () => resolve(rq.result || null);
                        rq.onerror = () => reject(rq.error);
                })).catch(() => null);
        }

        /* ============ 版本比较（"8.4.5" 逐段数值，缺段补 0） ============ */
        function cmpVer(a, b) {
                const pa = String(a || "").split(".").map((x) => parseInt(x, 10) || 0);
                const pb = String(b || "").split(".").map((x) => parseInt(x, 10) || 0);
                for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
                        const d = (pa[i] || 0) - (pb[i] || 0);
                        if (d) return d;
                }
                return 0;
        }

        /* ====== 快照 SW 确保在场（快照服务前提；子路径作用域不受
           background SW 占位影响——决胜实验 X1） ====== */
        function ensureSnapSW(wait) {
                if (!navigator.serviceWorker) return Promise.resolve(false);
                const regP = navigator.serviceWorker.register("cs-snap/sw.js", { scope: "cs-snap/" }).catch(() => null);
                if (!wait) return regP.then(() => true);
                const t0 = Date.now();
                return regP.then(() => new Promise((resolve) => {
                        (function poll() {
                                navigator.serviceWorker.getRegistrations().then((regs) => {
                                        const hit = regs.some((r) => {
                                                const st = r.active || r.waiting || r.installing;
                                                return st && (st.state === "activated" || st.state === "activating");
                                        });
                                        if (hit) return resolve(true);
                                        if (Date.now() - t0 > SNAP_WAIT_MS) return resolve(false);
                                        setTimeout(poll, 100);
                                }).catch(() => resolve(false));
                        })();
                }));
        }

        /* ============ 版本路由：本地直载，零网络 ============ */
        async function route() {
                const bundleVer = chrome.runtime.getManifest().version;
                let target = "index.html";
                try {
                        const meta = await snapGetMeta();
                        if (meta && meta.v && cmpVer(meta.v, bundleVer) > 0) {
                                const ready = await ensureSnapSW(true);
                                if (ready) target = SNAP_PREFIX + "index.html";
                        }
                } catch (_) { /* 读不到快照 = 内嵌版，最稳路径 */ }
                /* 快照同源页无 hello，也不该被云端回退逻辑踢走 */
                if (target.startsWith(SNAP_PREFIX)) handshaken = true;
                return target;
        }

        route().then((src) => {
                /* 路由完成后才设 src（无 src 的 iframe 不触发提前的 load，
                   boot 遮罩精确覆盖到真内容第一帧） */
                frame.src = src;
                /* SW 注册在 replaceState 之前（相对路径基于壳自身 URL）；
                   首次安装后的首个标签页即完成注册，幂等 */
                ensureSnapSW(false);
                /* 地址栏收敛（用户指令三）：永不跳转外部网址；replaceState
                   到 ./index.html —— 地址栏只剩扩展 ID + 文件名，F5 落在
                   自足应用顶层（Chrome 对扩展根路径 "/" 是硬豁免的 404
                   且 background SW 不拦 fetch——决胜实验 X2，根形态弃用） */
                try { history.replaceState(null, "", "index.html"); } catch (_) { /* 保留原地址 */ }
        });
        frame.addEventListener("load", fadeBoot);

        /* ============ 以下为 v8.4.4 云端桥原样保留（云端模式兼容） ============ */

        /* —— 尺寸/键名白名单（任一违规整批拒绝） —— */
        function sanitize(items) {
                if (!items || typeof items !== "object" || Array.isArray(items)) return null;
                let total = 0;
                const out = {};
                for (const k of Object.keys(items)) {
                        if (!KEY_RE.test(k)) return null;
                        let v = items[k];
                        if (v === undefined) v = null;
                        let n;
                        try { n = JSON.stringify(v); } catch (_) { return null; }
                        if (typeof n !== "string" || n.length > VAL_MAX) return null;
                        total += n.length;
                        out[k] = v;
                }
                if (total > BATCH_MAX) return null;
                return out;
        }
        function normKeys(keys) {
                if (keys === null || keys === undefined) return []; // 全量
                if (typeof keys === "string") keys = [keys];
                if (!Array.isArray(keys)) return null;
                const out = [];
                for (const k of keys) {
                        if (typeof k !== "string" || !KEY_RE.test(k)) return null;
                        out.push(k);
                }
                return out;
        }
        function reply(e, id, ok, data, err) {
                try {
                        e.source.postMessage(
                                { src: "chushi-bridge", role: "host", reply: id | 0, ok: !!ok, data: data, err: err ? String(err).slice(0, 200) : undefined },
                                e.origin
                        );
                } catch (_) { /* iframe 已销毁等 */ }
        }
        const nack = (e, id, err) => reply(e, id, false, undefined, err);

        /* —— 下行协议处理 —— */
        window.addEventListener("message", (e) => {
                if (e.origin !== CLOUD_ORIGIN) return; // origin 白名单，一字不差
                if (!frame.contentWindow || e.source !== frame.contentWindow) return; // 只认本壳 iframe
                const m = e.data;
                if (!m || typeof m !== "object" || m.src !== "chushi-bridge" || m.role !== "page") return;
                const id = m.id | 0;

                if (m.op === "hello") {
                        handshaken = true;
                        fadeBoot();
                        reply(e, id, true, { ver: 1, ext: chrome.runtime.getManifest().version });
                        return;
                }
                if (m.op === "get") {
                        const keys = normKeys(m.keys);
                        if (keys === null) return nack(e, id, "bad keys");
                        store.get(keys.length ? keys : null, (o) => {
                                if (chrome.runtime.lastError) return nack(e, id, chrome.runtime.lastError.message);
                                reply(e, id, true, o);
                        });
                        return;
                }
                if (m.op === "set") {
                        const items = sanitize(m.items);
                        if (!items) return nack(e, id, "bad items");
                        store.set(items, () => {
                                if (chrome.runtime.lastError) return nack(e, id, chrome.runtime.lastError.message);
                                reply(e, id, true);
                        });
                        return;
                }
                if (m.op === "remove") {
                        const keys = normKeys(m.keys);
                        if (keys === null || !keys.length) return nack(e, id, "bad keys");
                        store.remove(keys, () => {
                                if (chrome.runtime.lastError) return nack(e, id, chrome.runtime.lastError.message);
                                reply(e, id, true);
                        });
                        return;
                }
                if (m.op === "getAll") {
                        store.get(null, (o) => {
                                if (chrome.runtime.lastError) return nack(e, id, chrome.runtime.lastError.message);
                                reply(e, id, true, o);
                        });
                        return;
                }
                /* 未知 op：静默（协议向后兼容——新 op 由新壳处理） */
        });

        /* —— chrome.storage.onChanged → 云端页面（反向实时同步） —— */
        chrome.storage.onChanged.addListener((ch, area) => {
                if (area !== "local" || !handshaken || !frame.contentWindow) return;
                /* 只对云端 iframe 推送：本地直载页是真 chrome.storage 原生 onChanged，
                   不需要壳转发（转发反而双响） */
                if (!/^https:/i.test(frame.src || "")) return;
                try {
                        frame.contentWindow.postMessage(
                                { src: "chushi-bridge", role: "host", event: "changed", changes: ch },
                                CLOUD_ORIGIN
                        );
                } catch (_) { /* noop */ }
        });

        /* —— 云端模式健康监测：仅当 iframe 指向云端时启用（本地直载永不回退） —— */
        setTimeout(() => {
                if (!handshaken && /^https:/i.test(frame.src || "")) {
                        try { location.replace("index.html"); } catch (_) { location.href = "index.html"; }
                }
        }, HANDSHAKE_TIMEOUT);
})();
