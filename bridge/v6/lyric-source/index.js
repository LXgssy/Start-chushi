/* ============================================================================
 * ChuShi Lyric Source v6.0.0  (generation 6, written from scratch)
 *
 * Standalone lyric provider for the ChuShi music stack. Own goal: FULL
 * lyrics for the playing song, word-level (yrc) preferred, delivered to
 * whoever asks over the window event bus. Knows nothing about playback
 * truth, controls, SMTC, or HTTP - purely a lyric service.
 *
 * Fetch ladder (first hit wins, failures fall through):
 *   1. eapi /api/song/lyric/v1 (word-level yrc + ytlrc; klyric converted)
 *      - built with the renderer's built-in Node crypto module
 *   2. channel.call("track.lyric.getinfo") - line-level lrc + translation
 *   3. direct https://music.163.com/api/song/lyric - line-level lrc
 *
 * Bus contract (window CustomEvents, same renderer):
 *   listens "cc:lyric-req"   detail = { songId, reqId }   (from the bridge)
 *   emits  "cc:lyric-res"    detail = { reqId, songId, payload|null, v }
 *   emits  "cc:lyric-hello"  detail = { v }                (heartbeat)
 *
 * Payload shape (stable, consumers depend on it):
 *   { songId, title, artist, rev, yrc, ytlrc, lrc, tlyric, source }
 *
 * Panel language rule (user mandate): plugin NAME is English, all user
 * facing copy is Chinese.
 * ==========================================================================*/
(function () {
  "use strict";
  if (window.__chushiLyricSourceV6) return;
  window.__chushiLyricSourceV6 = true;

  var PLUGIN_VERSION = "6.0.0";
  var CACHE_MAX = 8;
  var LS_KEY = "cc-lyric-source-cache-v6";
  var FETCH_TIMEOUT_MS = 4500;

  function log(m) {
    try { console.log("[ChuShi Lyric Source " + PLUGIN_VERSION + "] " + m); } catch (e) { }
  }
  function emit(name, detail) {
    try { window.dispatchEvent(new CustomEvent(name, { detail: detail })); } catch (e) { }
  }

  /* ======================================================================
   * Cache (LRU in memory + best-effort localStorage persistence)
   * ==================================================================== */
  var cache = new Map();

  function cachePut(songId, payload) {
    try {
      cache.delete(songId);
      cache.set(songId, payload);
      while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
      var arr = [];
      cache.forEach(function (v, k) { arr.push([k, v]); });
      localStorage.setItem(LS_KEY, JSON.stringify(arr));
    } catch (e) { }
  }

  function cacheGet(songId) {
    if (cache.has(songId)) {
      var v = cache.get(songId);
      cache.delete(songId);
      cache.set(songId, v);
      return v;
    }
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (!raw) return null;
      var arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return null;
      for (var i = 0; i < arr.length; i++) {
        if (String(arr[i][0]) === String(songId)) {
          var pl = arr[i][1];
          cachePut(songId, pl);
          return pl;
        }
      }
    } catch (e) { }
    return null;
  }

  /* ======================================================================
   * eapi request building (public protocol constants, Node crypto)
   * ==================================================================== */
  function nodeCrypto() {
    try {
      var c = require("crypto");
      if (c && typeof c.createHash === "function" && typeof c.createCipheriv === "function") return c;
    } catch (e) { }
    return null;
  }

  function eapiParams(path, payload) {
    var c = nodeCrypto();
    if (!c) return null;
    try {
      var json = JSON.stringify(payload);
      var digest = c.createHash("md5")
        .update("nobody" + path + "use" + json + "md5forencrypt", "utf8")
        .digest("hex");
      var text = path + "-36cd479b6b5-" + json + "-36cd479b6b5-" + digest;
      var cipher = c.createCipheriv("aes-128-ecb", Buffer.from("e82ckenh8dichen8", "utf8"), Buffer.alloc(0));
      var enc = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
      return enc.toString("hex").toUpperCase();
    } catch (e) {
      log("eapi params failed: " + (e && e.message));
      return null;
    }
  }

  function postForm(url, formBody, timeoutMs) {
    return new Promise(function (resolve) {
      var settled = false;
      var timer = setTimeout(function () { if (!settled) { settled = true; resolve(null); } }, timeoutMs);
      try {
        fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: formBody,
        }).then(function (r) { return r.json(); }).then(function (j) {
          if (!settled) { settled = true; clearTimeout(timer); resolve(j); }
        }).catch(function () { if (!settled) { settled = true; clearTimeout(timer); resolve(null); } });
      } catch (e) { if (!settled) { settled = true; clearTimeout(timer); resolve(null); } }
    });
  }

  /* ======================================================================
   * klyric -> yrc conversion (klyric is JSON: [{t, c:[{tx, t?}]}])
   * ==================================================================== */
  function klyricToYrc(ktext) {
    var lines = [];
    try {
      var arr = JSON.parse(ktext);
      if (!Array.isArray(arr)) return "";
      for (var i = 0; i < arr.length; i++) {
        var ln = arr[i];
        if (!ln || typeof ln.t !== "number") continue;
        var cs = Array.isArray(ln.c) ? ln.c : [];
        var parts = [];
        var lineEnd = ln.t;
        for (var w = 0; w < cs.length; w++) {
          var item = cs[w];
          var tx = item && item.tx != null ? String(item.tx) : "";
          if (!tx) continue;
          var ws = ln.t + (typeof item.t === "number" ? item.t : 0);
          var nextOff = (w + 1 < cs.length && typeof cs[w + 1].t === "number") ? cs[w + 1].t : null;
          var wd = nextOff !== null ? (ln.t + nextOff - ws) : (tx.length * 90 + 60);
          if (wd < 60) wd = 60;
          parts.push("(" + Math.max(0, Math.round(ws - ln.t)) + "," + Math.round(wd) + ",0)" + tx);
          lineEnd = ws + wd;
        }
        if (!parts.length) continue;
        var endAbs = (i + 1 < arr.length && typeof arr[i + 1].t === "number") ? arr[i + 1].t : lineEnd;
        if (endAbs <= ln.t) endAbs = lineEnd;
        lines.push("[" + Math.round(ln.t) + "," + Math.round(endAbs - ln.t) + "]" + parts.join(""));
      }
    } catch (e) { return ""; }
    return lines.join("\n");
  }

  /* ======================================================================
   * Fetch ladder
   * ==================================================================== */
  function eapiLyric(songId) {
    var encPath = "/api/song/lyric/v1";
    var params = eapiParams(encPath, {
      id: String(songId), cp: false, radio: false, cv: 4747474,
      kv: -1, tv: -1, lv: -1, rv: -1, st: 0, yv: 1,
    });
    if (!params) return Promise.resolve(null);
    return postForm("https://interface3.music.163.com/eapi/song/lyric/v1",
      "params=" + params, FETCH_TIMEOUT_MS).then(function (j) {
        if (!j || (!j.yrc && !j.klyric && !j.lrc)) return null;
        var out = { yrc: "", ytlrc: "", lrc: "", tlyric: "", source: "" };
        if (j.yrc && j.yrc.lyric) {
          out.yrc = String(j.yrc.lyric);
          out.ytlrc = j.ytlrc && j.ytlrc.lyric ? String(j.ytlrc.lyric) : "";
          out.source = "eapi-yrc";
        } else if (j.klyric && j.klyric.lyric) {
          out.yrc = klyricToYrc(String(j.klyric.lyric));
          out.source = "eapi-klyric";
        } else {
          out.lrc = j.lrc && j.lrc.lyric ? String(j.lrc.lyric) : "";
          out.tlyric = j.tlyric && j.tlyric.lyric ? String(j.tlyric.lyric) : "";
          out.ytlrc = j.ytlrc && j.ytlrc.lyric ? String(j.ytlrc.lyric) : "";
          out.source = "eapi-lrc";
        }
        if (!out.yrc && !out.lrc) return null;
        return out;
      });
  }

  function channelLyric(songId) {
    return new Promise(function (resolve) {
      try {
        var ch = window.channel;
        if (!ch || typeof ch.call !== "function") { resolve(null); return; }
        var settled = false;
        var timer = setTimeout(function () { if (!settled) { settled = true; resolve(null); } }, 3500);
        ch.call("track.lyric.getinfo", function (res) {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          try {
            var lrc = res && res.lyric && res.lyric.lyric ? String(res.lyric.lyric) : "";
            var tr = res && res.transLyric && res.transLyric.lyric ? String(res.transLyric.lyric) : "";
            if (!lrc) { resolve(null); return; }
            resolve({ yrc: "", ytlrc: "", lrc: lrc, tlyric: tr, source: "channel-lrc" });
          } catch (e) { resolve(null); }
        }, [String(songId)]);
      } catch (e) { resolve(null); }
    });
  }

  function directLyric(songId) {
    return new Promise(function (resolve) {
      var settled = false;
      var timer = setTimeout(function () { if (!settled) { settled = true; resolve(null); } }, 3500);
      try {
        fetch("https://music.163.com/api/song/lyric?os=pc&id=" + encodeURIComponent(String(songId)) +
          "&lv=-1&kv=-1&tv=-1").then(function (r) { return r.json(); }).then(function (j) {
            if (settled) return;
            settled = true; clearTimeout(timer);
            var lrc = j && j.lrc && j.lrc.lyric ? String(j.lrc.lyric) : "";
            if (!lrc) { resolve(null); return; }
            resolve({
              yrc: "", ytlrc: "",
              lrc: lrc,
              tlyric: j.tlyric && j.tlyric.lyric ? String(j.tlyric.lyric) : "",
              source: "direct-lrc",
            });
          }).catch(function () { if (!settled) { settled = true; clearTimeout(timer); resolve(null); } });
      } catch (e) { if (!settled) { settled = true; clearTimeout(timer); resolve(null); } }
    });
  }

  /* ======================================================================
   * Request handling
   * ==================================================================== */
  var inflight = {}; /* songId -> true */

  function fetchPayload(songId) {
    var hit = cacheGet(songId);
    if (hit) return Promise.resolve(hit);
    if (inflight[songId]) return Promise.resolve(null);
    inflight[songId] = true;
    return eapiLyric(songId)
      .then(function (a) { return a || channelLyric(songId); })
      .then(function (b) { return b || directLyric(songId); })
      .then(function (c) {
        delete inflight[songId];
        if (!c) return null;
        var payload = {
          songId: songId,
          title: "",
          artist: "",
          rev: songId + "-" + c.source + "-" + (c.yrc || c.lrc || "").length,
          yrc: c.yrc, ytlrc: c.ytlrc, lrc: c.lrc, tlyric: c.tlyric, source: c.source,
        };
        cachePut(songId, payload);
        log("payload ready: " + songId + " src=" + c.source);
        return payload;
      })
      .catch(function () { delete inflight[songId]; return null; });
  }

  window.addEventListener("cc:lyric-req", function (ev) {
    var d = ev && ev.detail;
    if (!d || !(d.songId > 0) || !d.reqId) return;
    fetchPayload(d.songId).then(function (pl) {
      emit("cc:lyric-res", {
        reqId: d.reqId,
        songId: d.songId,
        payload: pl,
        v: PLUGIN_VERSION,
      });
    });
  });

  function hello() {
    emit("cc:lyric-hello", { v: PLUGIN_VERSION });
  }
  hello();
  setInterval(hello, 20000);

  log("ready (node crypto " + (nodeCrypto() ? "available" : "UNAVAILABLE - eapi disabled") + ")");

  /* ======================================================================
   * Config panel (BetterNCM settings page) - Chinese copy per user rule
   * ==================================================================== */
  try {
    if (typeof plugin !== "undefined" && plugin && typeof plugin.onConfig === "function") {
      plugin.onConfig(function () {
        var box = document.createElement("div");
        box.style.cssText = "font-size:13px;line-height:1.9;padding:4px 2px;color:var(--text1,#333)";
        var head = document.createElement("div");
        head.style.cssText = "font-weight:bold;margin-bottom:6px";
        head.textContent = "初始 · 歌词源 v" + PLUGIN_VERSION;
        box.appendChild(head);
        var info = document.createElement("div");
        info.style.cssText = "font-family:monospace";
        info.textContent = "请求计数：" + "（按需响应音乐桥的歌词请求）";
        box.appendChild(info);
        var note = document.createElement("div");
        note.style.cssText = "margin-top:6px;color:var(--text2,#888);font-size:12px";
        note.textContent = "本插件只负责歌词：优先抓取逐字歌词（yrc），其次卡拉OK 歌词（klyric 转换），" +
          "最后回退行级歌词。与「ChuShi Music Bridge」插件配合使用；单独安装时处于待命状态。";
        box.appendChild(note);

        var served = 0;
        window.addEventListener("cc:lyric-req", function () { served++; });
        setInterval(function () {
          info.textContent = "已响应歌词请求：" + served + " 次 | 缓存：" + cache.size + " 首" +
            "（逐字可用：" + (nodeCrypto() ? "是" : "否") + "）";
        }, 2000);
        return box;
      });
    }
  } catch (e) { /* panel optional */ }
})();
