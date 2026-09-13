/* 「初始」壳桥 · 顶层内容脚本（isolated world，v8.4.4）
 * 用户直接在浏览器访问云端 Pages 版「初始」（无壳）时，shim-page.js
 * （MAIN world）把 chrome.storage 调用发到自身 window；本脚本（isolated
 * world，有完整 chrome API）接收并代写 chrome.storage.local，onChanged
 * 反向转发 —— 网页版与扩展版共享同一份 chrome.storage，面板与浮窗开关
 * 全局同步（这是青柠 1.4.0「内容脚本做桥」思路的完整实现）。
 * 与壳内场景互斥且无冲突：壳内 iframe 本脚本不注入（all_frames 缺省
 * false，仅顶层），由壳桥（shell-bridge.js）负责；此处仅顶层生效。
 */
(() => {
	"use strict";
	if (location.host !== "lxgssy.github.io") return; // 仅「初始」云端域
	if (window.top !== window) return; // 双保险：壳内 iframe 交给壳桥

	const SELF_ORIGIN = location.origin;
	const KEY_RE = /^[A-Za-z][A-Za-z0-9_:-]{0,127}$/;
	const VAL_MAX = 512 * 1024;
	const BATCH_MAX = 1024 * 1024;
	if (!chrome?.storage?.local) return;
	const store = chrome.storage.local;

	function normKeys(keys) {
		if (keys === null || keys === undefined) return [];
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

	window.addEventListener("message", (e) => {
		if (e.origin !== SELF_ORIGIN || e.source !== window) return; // 同窗同源
		const m = e.data;
		if (!m || typeof m !== "object" || m.src !== "chushi-bridge" || m.role !== "page") return;
		const id = m.id | 0;
		const reply = (ok, data, err) => {
			try {
				window.postMessage(
					{ src: "chushi-bridge", role: "host", reply: id, ok: !!ok, data: data, err: err ? String(err).slice(0, 200) : undefined },
					SELF_ORIGIN
				);
			} catch (_) { /* noop */ }
		};

		if (m.op === "hello") return reply(true, { ver: 1, cs: true });
		if (m.op === "get") {
			const keys = normKeys(m.keys);
			if (keys === null) return reply(false, undefined, "bad keys");
			store.get(keys.length ? keys : null, (o) => {
				const le = chrome.runtime.lastError;
				reply(!le, o, le && le.message);
			});
			return;
		}
		if (m.op === "set") {
			const items = sanitize(m.items);
			if (!items) return reply(false, undefined, "bad items");
			store.set(items, () => {
				const le = chrome.runtime.lastError;
				reply(!le, undefined, le && le.message);
			});
			return;
		}
		if (m.op === "remove") {
			const keys = normKeys(m.keys);
			if (keys === null || !keys.length) return reply(false, undefined, "bad keys");
			store.remove(keys, () => {
				const le = chrome.runtime.lastError;
				reply(!le, undefined, le && le.message);
			});
			return;
		}
		if (m.op === "getAll") {
			store.get(null, (o) => {
				const le = chrome.runtime.lastError;
				reply(!le, o, le && le.message);
			});
			return;
		}
	});

	/* onChanged → 页面 shim（反向实时） */
	chrome.storage.onChanged.addListener((ch, area) => {
		if (area !== "local") return;
		try {
			window.postMessage({ src: "chushi-bridge", role: "host", event: "changed", changes: ch }, SELF_ORIGIN);
		} catch (_) { /* noop */ }
	});
})();
