/*! 初始 · HLS 下载任务（Stage 2，2026-10）
 *  在唯一 offscreen 文档里跑：解析播放列表 → 并发下片 → AES-128 解密 →
 *  mux.js 7.1.0 逐片 push → flush → Blob。落盘交给后台 SW（收 hls-done 后
 *  调 chrome.downloads）；offscreen 无可见 DOM，不自己点链接。
 *  消息：入 hls-start {url, filename} / hls-abort
 *        出 hls-progress {phase, done, total} / hls-done {ok, url, filename, size}。
 *  源码约束：不出现反斜杠转义（字符表用 String.fromCharCode 构造）。 */
(function () {
  "use strict";
  var MUX = window.muxjs, P = window.ChushiM3U8, THREAD = 6;
  var running = null, keyCache = {};
  var BAD = "<>:" + String.fromCharCode(34) + "|?*" + String.fromCharCode(92) + "/";
  function send(m) { try { chrome.runtime.sendMessage(m, function () { void chrome.runtime.lastError; }); } catch (e) {} }
  function fetchText(u) {
    return fetch(u, { credentials: "include" }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.text();
    });
  }
  function fetchBuf(u) {
    return fetch(u, { credentials: "include" }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.arrayBuffer();
    }).then(function (b) { return new Uint8Array(b); });
  }
  function hexToBytes(hex) {
    var h = String(hex || "").replace(/^0[xX]/, ""), n = h.length >> 1, out = new Uint8Array(n), i;
    for (i = 0; i < n; i++) out[i] = parseInt(h.substr(i * 2, 2), 16);
    return out;
  }
  function seqIV(n) {
    var iv = new Uint8Array(16), i;
    for (i = 15; i >= 0; i--) { iv[i] = n & 255; n = Math.floor(n / 256); }
    return iv;
  }
  function getKey(k) {
    if (keyCache[k.uri]) return Promise.resolve(keyCache[k.uri]);
    return fetchBuf(k.uri).then(function (raw) {
      if (raw.length === 16) return crypto.subtle.importKey("raw", raw, "AES-CBC", false, ["decrypt"]);
      return crypto.subtle.importKey("raw", hexToBytes(new TextDecoder().decode(raw).trim()), "AES-CBC", false, ["decrypt"]);
    }).then(function (key) { keyCache[k.uri] = key; return key; });
  }
  function decryptSeg(buf, k, idx) {
    if (!k || !k.uri) return Promise.resolve(buf);
    return getKey(k).then(function (key) {
      var iv = k.iv ? hexToBytes(k.iv) : seqIV(idx);
      return crypto.subtle.decrypt({ name: "AES-CBC", iv: iv }, key, buf).then(function (out) { return new Uint8Array(out); });
    });
  }
  function safeName(raw) {
    var s = String(raw || "").split("").map(function (c) { return BAD.indexOf(c) >= 0 ? "_" : c; }).join("");
    s = s.replace(/^[.]+/, "").trim().slice(0, 120);
    return s || "视频";
  }
  function run(opts) {
    if (running) return Promise.reject(new Error("busy"));
    running = { abort: false };
    var state = running, filename = safeName(opts.filename);
    send({ type: "hls-progress", phase: "parse", done: 0, total: 0 });
    return fetchText(opts.url).then(function (text) {
      var pl = P.parse(text, opts.url);
      if (pl.kind === "master" && pl.variants.length) {
        return fetchText(pl.variants[0].url).then(function (t2) { return P.parse(t2, pl.variants[0].url); });
      }
      return pl;
    }).then(function (list) {
      if (!list || list.kind !== "media" || !list.segments.length) throw new Error("no segments");
      var segs = list.segments, total = segs.length;
      var mux = new MUX.mp4.Transmuxer(), parts = [];
      mux.on("data", function (d) { parts.push(d.initSegment ? d.initSegment : d.data); });
      function step(i) {
        if (state.abort) return Promise.reject(new Error("aborted"));
        if (i >= total) return Promise.resolve();
        var batch = segs.slice(i, i + THREAD);
        return Promise.all(batch.map(function (s) {
          return fetchBuf(s.url)
            .then(function (b) { return decryptSeg(b, s.key, s.index); })
            .then(function (b) { return { i: s.index, b: b }; });
        })).then(function (arr) {
          arr.sort(function (a, b) { return a.i - b.i; });
          arr.forEach(function (x) { mux.push(x.b); });
          send({ type: "hls-progress", phase: "download", done: Math.min(i + THREAD, total), total: total });
          return step(i + THREAD);
        });
      }
      return step(0).then(function () {
        mux.flush();
        var blob = new Blob(parts, { type: "video/mp4" });
        var out = filename.slice(-4).toLowerCase() === ".mp4" ? filename : filename + ".mp4";
        send({ type: "hls-done", ok: true, url: URL.createObjectURL(blob), filename: out, size: blob.size });
      });
    }).then(function () { running = null; }, function (e) { running = null; send({ type: "hls-done", ok: false, error: String((e && e.message) || e) }); });
  }
  try {
    chrome.runtime.onMessage.addListener(function (msg, sender, reply) {
      if (!msg) return false;
      if (msg.type === "hls-start") {
        run(msg).then(function () { reply({ ok: true }); }, function (e) { reply({ ok: false, error: String((e && e.message) || e) }); });
        return true;
      }
      if (msg.type === "hls-abort") { if (running) running.abort = true; reply({ ok: true }); return true; }
      return false;
    });
  } catch (e) { /* noop */ }
  window.ChushiHls = { run: run };
})();
