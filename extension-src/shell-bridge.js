/* 「初始」云端更新壳 · 桥（v8.4.4）
 * 学习青柠起始页 1.4.0 的壳机制并增强。本脚本运行在壳页（扩展页上下文，
 * 有完整 chrome API），职责：
 *   1) 监听 iframe（云端 Pages 页）的 postMessage，校验 origin 白名单与
 *      来源窗口后，代写 chrome.storage.local（云端页面自己没有 chrome API）；
 *   2) chrome.storage.onChanged 反向推送进 iframe —— 云端页面 ↔ 扩展
 *      （浮窗内容脚本 / 其他标签页）双向实时同步，面板与浮窗开关一致；
 *   3) 健康监测：云端不可达 / 握手超时 → location.replace 回退本地完整版
 *      index.html（扩展内嵌全功能版，离线可用兜底）。
 * 协议（与 shim-page.js / cs-bridge.js 三方一致）：
 *   页面 → host: { src:'chushi-bridge', role:'page', id, op:'hello'|'get'|'set'|'remove'|'getAll', ... }
 *   host → 页面: { src:'chushi-bridge', role:'host', reply:id, ok, data?, err? }
 *                { src:'chushi-bridge', role:'host', event:'changed', changes:{...} }
 * 安全面：origin 严格白名单（https://lxgssy.github.io）+ e.source 必须是
 * 本壳 iframe + 键名白名单 + 单值/单批尺寸上限。
 */
(() => {
	"use strict";
	const CLOUD_ORIGIN = "https://lxgssy.github.io"; // 唯一可信源（页面在 /Start-chushi/ 子路径）
	const KEY_RE = /^[A-Za-z][A-Za-z0-9_:-]{0,127}$/; // 键白名单（128 字符内，可读首字符）
	const VAL_MAX = 512 * 1024; // 单值上限 512KB
	const BATCH_MAX = 1024 * 1024; // 单批上限 1MB
	const HANDSHAKE_TIMEOUT = 10000; // 握手超时（毫秒）——超时回退本地版

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
	frame.addEventListener("load", fadeBoot);

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
		try {
			frame.contentWindow.postMessage(
				{ src: "chushi-bridge", role: "host", event: "changed", changes: ch },
				CLOUD_ORIGIN
			);
		} catch (_) { /* noop */ }
	});

	/* —— 健康监测：握手超时 → 回退本地完整版（离线/云端故障兜底） —— */
	setTimeout(() => {
		if (!handshaken) {
			try { location.replace("index.html"); } catch (_) { location.href = "index.html"; }
		}
	}, HANDSHAKE_TIMEOUT);
})();
