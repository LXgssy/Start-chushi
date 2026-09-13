/* 「初始」壳桥 · 页面端 shim（MAIN world，v8.4.4）
 * 云端页面（GitHub Pages 部署的「初始」，可能落后于扩展版本）没有 chrome
 * API，其 chrome.storage 调用（如 PresetWidgets.mirrorExtCard 的面板开关
 * 镜像）会静默失效。本 shim 在页面任何脚本运行前（document_start）伪造
 * window.chrome.storage.local（get/set/remove/onChanged.addListener）——
 * 页面既有调用自动经 postMessage 桥落库，零页面改动：
 *   - 壳内（parent 是扩展壳页）：消息发 parent → shell-bridge.js 代写
 *   - 顶层直访 Pages：消息发自身 window → cs-bridge.js（isolated world）代写
 * 安全面（两段式信任）：
 *   1) 跨域 parent.origin 不可读（SecurityError）→ 无法同步白名单；改用
 *      握手确认：hello（零敏感）以 "*" 投递 → 回复 event.origin 由浏览器
 *      按发送者真实 origin 填充、不可伪造 → 校验 chrome-extension:// 前缀
 *      通过后，数据消息才以该精确 origin 投递；
 *   2) host 侧（壳桥/cs-bridge）独立校验 origin 白名单 + e.source + 键名
 *      白名单 + 尺寸上限——两段独立把关，任一失守即断链。
 */
(() => {
	"use strict";
	if (window.__chushiBridgeShim) return; // 幂等
	if (location.host !== "lxgssy.github.io") return; // 仅「初始」云端域

	const inShell = window.parent !== window;
	/* 壳内 → parent（chrome-extension 壳页）；顶层 → self（cs-bridge 所在
	   window；Pages 自身部件 iframe 的父页为同域页面，无人监听 → 空等超时，
	   与信任无关——父页同域时 origin 恒读得到，不进握手路径） */
	const hostWin = inShell ? window.parent : window;
	let targetOrigin = inShell ? "*" : location.origin;
	let handshaked = !inShell; // 顶层无需握手（同窗 postMessage，origin 恒自域）
	const bootQueue = []; // 握手完成前排队的数据消息

	window.addEventListener("message", (e) => {
		if (e.source !== hostWin) return; // 只认自己的投递目标
		const m = e.data;
		if (!m || typeof m !== "object" || m.src !== "chushi-bridge" || m.role !== "host") return;
		if (!handshaked) {
			/* 握手确认：回复 id=0 + origin 必为 chrome-extension://（浏览器保证） */
			if (m.reply === 0 && inShell && String(e.origin).indexOf("chrome-extension://") === 0) {
				targetOrigin = e.origin; // 精确化：此后数据不再向第三方泄露
				handshaked = true;
				const q = bootQueue.splice(0);
				for (const msg of q) {
					try { hostWin.postMessage(msg, targetOrigin); } catch (_) { /* noop */ }
				}
			}
			return;
		}
		if (m.event === "changed" && m.changes && typeof m.changes === "object") {
			listeners.forEach((fn) => {
				try { fn(m.changes, "local"); } catch (_) { /* 用户回调异常隔离 */ }
			});
			return;
		}
		if (m.reply != null) {
			const p = pending.get(m.reply);
			if (!p) return;
			pending.delete(m.reply);
			if (m.ok) p.resolve(m.data);
			else p.reject(new Error(m.err || "bridge error"));
		}
	});

	const KEY_RE = /^[A-Za-z][A-Za-z0-9_:-]{0,127}$/;
	const VAL_MAX = 512 * 1024;
	let seq = 0;
	const pending = new Map(); // id → {resolve, reject}
	const listeners = new Set(); // onChanged 回调集合

	function send(msg) {
		if (handshaked) {
			hostWin.postMessage(msg, targetOrigin);
		} else {
			bootQueue.push(msg); // 握手成功后按序 flush
		}
	}

	function call(op, extra) {
		return new Promise((resolve, reject) => {
			const id = ++seq;
			pending.set(id, { resolve: resolve, reject: reject });
			const msg = Object.assign({ src: "chushi-bridge", role: "page", id: id, op: op }, extra || {});
			try {
				send(msg);
			} catch (err) {
				pending.delete(id);
				reject(err);
				return;
			}
			setTimeout(() => {
				if (pending.has(id)) {
					pending.delete(id);
					reject(new Error("bridge timeout"));
				}
			}, 5000);
		});
	}

	/* chrome 风格适配：回调可选，同时返回 Promise（新 Chrome 原生同款） */
	function promisify(p, cb) {
		if (typeof cb === "function") p.then((v) => cb(v), () => cb(undefined));
		return p;
	}
	function normalizeKeys(keys) {
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
	function sanitize(items) {
		if (!items || typeof items !== "object") return Promise.reject(new Error("bad items"));
		const out = {};
		for (const k of Object.keys(items)) {
			if (!KEY_RE.test(k)) return Promise.reject(new Error("bad key"));
			let v = items[k];
			if (v === undefined) v = null;
			try { if (JSON.stringify(v).length > VAL_MAX) return Promise.reject(new Error("value too large")); } catch (_) { return Promise.reject(new Error("bad value")); }
			out[k] = v;
		}
		return Promise.resolve(out);
	}

	const fakeLocal = {
		get: function (keys, cb) {
			const norm = normalizeKeys(keys);
			if (norm === null) return promisify(Promise.reject(new Error("bad keys")), cb);
			return promisify(call("get", { keys: norm }), cb);
		},
		set: function (items, cb) {
			return promisify(
				sanitize(items).then((clean) => call("set", { items: clean })).then(() => undefined),
				cb
			);
		},
		remove: function (keys, cb) {
			const norm = normalizeKeys(keys);
			if (norm === null) return promisify(Promise.reject(new Error("bad keys")), cb);
			return promisify(call("remove", { keys: norm }).then(() => undefined), cb);
		},
		clear: function (cb) {
			/* 页面从不使用；getAll 后逐键 remove 实现完整语义 */
			return promisify(
				call("getAll", {})
					.then((o) => call("remove", { keys: Object.keys(o || {}) }))
					.then(() => undefined),
				cb
			);
		},
	};

	const fakeOnChanged = {
		addListener: function (fn) { if (typeof fn === "function") listeners.add(fn); },
		removeListener: function (fn) { listeners.delete(fn); },
		hasListener: function (fn) { return listeners.has(fn); },
	};

	/* 挂载：绝不覆盖真 API（扩展内回退页有真 chrome.storage） */
	if (!window.chrome) window.chrome = {};
	if (!window.chrome.storage) {
		window.chrome.storage = {
			local: fakeLocal,
			sync: undefined,
			session: undefined,
			onChanged: fakeOnChanged,
		};
	}
	window.__chushiBridgeShim = true; // 探针/SDK 检测标记

	/* 启动握手（仅壳内）：hello 零敏感（op 名+id），"*" 投递；
	   250ms 重试 ×20 = 覆盖壳桥脚本就绪窗口，5s 后由 pending 超时兜底 */
	if (inShell) {
		let tries = 0;
		const hello = () => {
			if (handshaked) return;
			try { hostWin.postMessage({ src: "chushi-bridge", role: "page", id: 0, op: "hello" }, "*"); } catch (_) { /* noop */ }
		};
		hello();
		const t = setInterval(() => {
			if (handshaked || ++tries > 20) {
				clearInterval(t);
				return;
			}
			hello();
		}, 250);
	}
})();
