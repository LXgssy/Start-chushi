/* ============================================================================
 * ChuShi Music API v5.0.0  (generation 5, written from scratch)
 *
 * The only component that touches NetEase Music internals. Constitution:
 *
 *  RULE 1 - READ-ONLY. This plugin observes the player (native callbacks +
 *           dva store reads + the media element). It never dispatches to the
 *           store, never binds/overrides NCM's own UI handlers, never
 *           touches NetEase Music's SMTC. NetEase's own progress bar keeps
 *           working exactly as before.
 *  RULE 2 - SINGLE-EXECUTION CONTROLS. Every control command is executed
 *           exactly once at the element level (play()/pause() on the media
 *           element, a real click on NCM's own visible transport button,
 *           or ONE currentTime write for seek) followed by honest read-back
 *           verification reported as seekAck. currentTime is written at
 *           exactly ONE place in this file.
 *  RULE 3 - ZERO SMTC DEPENDENCY. Works with NetEase Music's built-in SMTC
 *           switch OFF. Truth comes from the element/store, never from any
 *           OS media session.
 *
 * Data plane: pushes truth to the ChuShi SMTC engine (127.0.0.1), polls its
 * command queue, and publishes full lyrics (word-level yrc first).
 * ASCII-only by constitution (build gate asserts every byte).
 * ==========================================================================*/
(function () {
  "use strict";
  if (window.__chushiMusicApiV5) return;
  window.__chushiMusicApiV5 = true;

  var PLUGIN_VERSION = "5.0.0";
  var DEFAULT_PORT = 26801;
  var POLL_MS = 1000;        /* truth push cadence */
  var CMD_POLL_MS = 300;     /* command queue poll */
  var LYRIC_CHECK_MS = 700;  /* song change watcher */
  var EV_PLAY_FRESH = 3000;  /* native PlayState freshness */
  var EV_POS_FRESH = 5000;   /* native PlayProgress freshness */

  function cfgPort() {
    try {
      var p = parseInt(plugin.getConfig("port", DEFAULT_PORT), 10);
      if (p >= 1024 && p <= 65535) return p;
    } catch (e) { }
    return DEFAULT_PORT;
  }
  var PORT = cfgPort();
  var BASE = "http://127.0.0.1:" + PORT;

  function log(m) {
    try { console.log("[ChuShi Music API " + PLUGIN_VERSION + "] " + m); } catch (e) { }
  }

  /* ======================================================================
   * Native player callbacks (NetEase platform surface, read-only)
   * ==================================================================== */
  var ev = { playing: false, playingAt: 0, songId: 0, songIdAt: 0, posMs: 0, posAt: 0 };
  try {
    var native = window.legacyNativeCmder;
    if (native && typeof native.appendRegisterCall === "function") {
      native.appendRegisterCall("PlayState", "audioplayer", function () {
        var id = 0, st = -1;
        for (var i = 1; i < arguments.length; i++) {
          var a = arguments[i];
          if (typeof a === "number" && st === -1 && id !== 0) { st = a; break; }
          if (typeof a === "number") id = a;
          if (typeof a === "string") { var ps = parseInt(a, 10); if (ps > 0) id = ps; }
        }
        if (st === -1) st = arguments[arguments.length - 1];
        ev.songId = id > 0 ? id : ev.songId;
        ev.songIdAt = Date.now();
        ev.playing = st === 1;
        ev.playingAt = Date.now();
      });
      native.appendRegisterCall("PlayProgress", "audioplayer", function () {
        var p = arguments[arguments.length - 1];
        var sec = typeof p === "number" ? p : parseFloat(p);
        if (isFinite(sec) && sec >= 0) { ev.posMs = sec * 1000; ev.posAt = Date.now(); }
      });
      native.appendRegisterCall("Seek", "audioplayer", function () {
        var p = arguments[arguments.length - 1];
        var sec = typeof p === "number" ? p : parseFloat(p);
        if (isFinite(sec) && sec >= 0) { ev.posMs = sec * 1000; ev.posAt = Date.now(); }
      });
      log("native callbacks registered");
    }
  } catch (e) {
    log("native callbacks unavailable: " + (e && e.message));
  }

  /* ======================================================================
   * dva store, read-only (webpack require capture -> module cache walk)
   * ==================================================================== */
  var storeRef = null;

  function hookRequire(cb) {
    try {
      if (Array.isArray(window.webpackJsonp)) {
        var k1 = "__chushi_probe_" + Date.now();
        var f1 = {};
        f1[k1] = function (m, e, r) { cb(r); };
        window.webpackJsonp.push([[k1], f1, [[k1]]]);
        return true;
      }
      for (var k in window) {
        if (k.indexOf("webpackChunk") === 0 && Array.isArray(window[k])) {
          var k2 = "__chushi_probe_" + Date.now();
          var f2 = {};
          f2[k2] = function (m, e, r) { cb(r); };
          window[k].push([[k2], f2]);
          return true;
        }
      }
    } catch (e) { }
    return false;
  }

  function looksLikeStore(s) {
    return !!(s && typeof s.getState === "function" && typeof s.dispatch === "function" &&
      s.getState() && typeof s.getState() === "object" && s.getState().playing);
  }

  hookRequire(function (req) {
    try {
      var cache = req && req.c;
      if (!cache) return;
      var keys = Object.keys(cache);
      for (var i = 0; i < keys.length; i++) {
        var ex = cache[keys[i]] && cache[keys[i]].exports;
        if (!ex) continue;
        var app = ex.a && typeof ex.a.getStore === "function" ? ex.a :
          (typeof ex.getStore === "function" ? ex : null);
        if (app) {
          try {
            var got = app.getStore();
            var st = got && got._store ? got._store : got;
            if (looksLikeStore(st)) { storeRef = st; return; }
          } catch (e) { }
        }
        if (looksLikeStore(ex)) { storeRef = ex; return; }
      }
    } catch (e) { }
  });
  if (!storeRef) {
    setTimeout(function () { if (!storeRef) log("store not found yet (element truth still works)"); }, 5000);
  }

  function storePlaying() {
    try {
      var s = storeRef && storeRef.getState ? storeRef.getState() : null;
      return s && s.playing ? s.playing : null;
    } catch (e) { return null; }
  }

  /* ======================================================================
   * Media element truth (sticky, duration-anchored validation)
   * ==================================================================== */
  var mainEl = null;

  function expectedDurMs() {
    var p = storePlaying();
    if (p && p.curTrack && p.curTrack.duration > 0) return Number(p.curTrack.duration);
    try {
      var g = betterncm && betterncm.ncm && betterncm.ncm.getPlayingSong ?
        betterncm.ncm.getPlayingSong() : null;
      if (g && g.data && g.data.duration > 0) return Number(g.data.duration);
    } catch (e) { }
    return 0;
  }

  function elAcceptable(el, durMs) {
    if (!el || !el.tagName) return false;
    var tag = String(el.tagName).toLowerCase();
    if (tag !== "audio" && tag !== "video") return false;
    if (!el.isConnected) return false;
    if (typeof el.currentTime !== "number" || !isFinite(el.currentTime)) return false;
    if (durMs > 0) {
      try {
        if (el.duration && isFinite(el.duration) &&
          Math.abs(el.duration * 1000 - durMs) > 1500) return false;
      } catch (e) { }
    }
    return true;
  }

  function activeEl() {
    var durMs = expectedDurMs();
    if (elAcceptable(mainEl, durMs)) return mainEl;
    var candidates = [];
    try { candidates = Array.prototype.slice.call(document.querySelectorAll("audio, video")); } catch (e) { }
    var fallback = null;
    for (var i = 0; i < candidates.length; i++) {
      var el = candidates[i];
      if (elAcceptable(el, durMs)) { mainEl = el; return el; }
      if (!fallback && el.isConnected && typeof el.currentTime === "number") fallback = el;
    }
    mainEl = fallback; /* may be null */
    return fallback;
  }

  /* ======================================================================
   * Metadata
   * ==================================================================== */
  function pickStr(v, max) {
    var s = typeof v === "string" ? v : (v == null ? "" : String(v));
    return s.slice(0, max || 200);
  }

  function readMeta() {
    var p = storePlaying();
    var out = { songId: 0, title: "", artist: "", album: "", pic: "", durMs: 0 };
    if (p) {
      out.songId = Number(p.resourceTrackId || p.onlineResourceId || 0) || 0;
      out.title = pickStr(p.resourceName, 200);
      try {
        if (p.resourceArtists && p.resourceArtists.length) {
          var names = [];
          for (var i = 0; i < p.resourceArtists.length && i < 5; i++) {
            if (p.resourceArtists[i] && p.resourceArtists[i].name) names.push(p.resourceArtists[i].name);
          }
          out.artist = pickStr(names.join("/"), 200);
        }
      } catch (e) { }
      out.pic = /^https:\/\//.test(String(p.resourceCoverUrl || "")) ? pickStr(p.resourceCoverUrl, 500) : "";
      if (p.curTrack) {
        var al = p.curTrack.album || {};
        out.album = pickStr(al.albumName || al.name || "", 200);
        if (!out.pic && /^https:\/\//.test(String(al.picUrl || ""))) out.pic = pickStr(al.picUrl, 500);
        if (p.curTrack.duration > 0) out.durMs = Number(p.curTrack.duration);
      }
    }
    if (!out.title) {
      try {
        var g = betterncm && betterncm.ncm && betterncm.ncm.getPlayingSong ?
          betterncm.ncm.getPlayingSong() : null;
        if (g && g.data) {
          out.title = out.title || pickStr(g.data.name, 200);
          if (!out.artist && g.data.artists && g.data.artists.length) {
            var ns = [];
            for (var j = 0; j < g.data.artists.length && j < 5; j++) {
              if (g.data.artists[j] && g.data.artists[j].name) ns.push(g.data.artists[j].name);
            }
            out.artist = pickStr(ns.join("/"), 200);
          }
          if (!out.pic && g.data.album && /^https:\/\//.test(String(g.data.album.picUrl || ""))) {
            out.pic = pickStr(g.data.album.picUrl, 500);
          }
          if (!out.durMs && g.data.duration > 0) out.durMs = Number(g.data.duration);
        }
      } catch (e) { }
    }
    return out;
  }

  /* ======================================================================
   * Truth composition (element clock -> native progress -> store position)
   * ==================================================================== */
  function composeSnapshot() {
    var meta = readMeta();
    var el = activeEl();
    var now = Date.now();

    var evPlayingFresh = (now - ev.playingAt) < EV_PLAY_FRESH;
    var evPosFresh = (now - ev.posAt) < EV_POS_FRESH;

    var playing = false;
    if (evPlayingFresh) playing = ev.playing;
    else {
      var p = storePlaying();
      if (p && typeof p.paused === "boolean") playing = p.paused === false;
      else if (el) playing = el.paused === false;
    }

    var durMs = meta.durMs;
    if (!durMs && el) {
      try { if (el.duration && isFinite(el.duration)) durMs = el.duration * 1000; } catch (e) { }
    }

    var posMs = 0;
    var elPosMs = 0;
    try { if (el) elPosMs = el.currentTime * 1000; } catch (e) { }
    var elAligned = el && (elPosMs > 0 || playing) &&
      (!evPosFresh || Math.abs(elPosMs - ev.posMs) <= 1500);
    if (elAligned) posMs = elPosMs;
    else if (evPosFresh) posMs = ev.posMs;
    else {
      var sp = storePlaying();
      if (sp && typeof sp.position === "number" && sp.position > 0 && sp.position < 36000) {
        posMs = sp.position * 1000;
      }
    }
    if (durMs > 0 && posMs > durMs) posMs = durMs;
    if (posMs < 0) posMs = 0;

    return {
      v: PLUGIN_VERSION,
      ts: now,
      songId: meta.songId || (evPlayingFresh ? ev.songId : 0) || 0,
      title: meta.title,
      artist: meta.artist,
      album: meta.album,
      pic: meta.pic,
      position: Math.round(posMs) / 1000,
      duration: Math.round(durMs) / 1000,
      playing: playing === true,
      seekAckId: seekAck.id,
      seekAckOk: seekAck.ok === true,
      seekAckAt: seekAck.at,
    };
  }

  /* ======================================================================
   * Controls: single execution + honest read-back
   * ==================================================================== */
  var seekAck = { id: "", ok: false, at: 0, pending: false, target: 0 };

  function visibleButton(selectors) {
    for (var i = 0; i < selectors.length; i++) {
      try {
        var b = document.querySelector(selectors[i]);
        if (b && b.offsetParent !== null) return b;
      } catch (e) { }
    }
    return null;
  }

  function applyPlayPause(wantPlaying) {
    var el = activeEl();
    try {
      if (el) {
        if (wantPlaying && el.paused) { el.play(); return true; }
        if (!wantPlaying && !el.paused) { el.pause(); return true; }
        return true; /* already in the target state */
      }
    } catch (e) { }
    var b = visibleButton(wantPlaying
      ? ["#btn-play", ".btn-play", "#btn-pause", ".btn-pause"]
      : ["#btn-pause", ".btn-pause", "#btn-play", ".btn-play"]);
    if (b) { b.click(); return true; }
    return false;
  }

  function ctrlToggle() {
    var snap = composeSnapshot();
    return applyPlayPause(!snap.playing);
  }

  function applyNextPrev(next) {
    var b = visibleButton(next
      ? ["#btn-next", ".btn-next"]
      : ["#btn-previous", "#btn-prev", ".btn-previous", ".btn-prev"]);
    if (b) { b.click(); return true; }
    return false;
  }

  function ctrlSeek(id, targetSec) {
    var el = activeEl(); /* identity captured BEFORE the single write */
    if (!el || typeof el.currentTime !== "number") {
      seekAck = { id: id, ok: false, at: Date.now(), pending: false, target: targetSec };
      return;
    }
    var dur = 0;
    try { if (el.duration && isFinite(el.duration)) dur = el.duration; } catch (e) { }
    if (!dur) dur = composeSnapshot().duration;
    var target = Math.max(0, Math.min(dur > 0 ? dur : 86400, targetSec));
    /* ================= THE ONLY currentTime WRITE IN THIS FILE ========= */
    el.currentTime = target;
    /* ================================================================== */
    var elAtWrite = el;
    setTimeout(function () {
      var ok1 = false;
      try {
        ok1 = elAtWrite.isConnected && isFinite(elAtWrite.currentTime) &&
          Math.abs(elAtWrite.currentTime - target) <= 0.9;
      } catch (e) { }
      if (!ok1) {
        seekAck = { id: id, ok: false, at: Date.now(), pending: false, target: target };
        log("seek ack false at 420ms (target " + target.toFixed(2) + ")");
        return;
      }
      setTimeout(function () {
        var ok2 = false;
        try {
          ok2 = elAtWrite.isConnected && isFinite(elAtWrite.currentTime) &&
            Math.abs(elAtWrite.currentTime - target) <= 1.2;
        } catch (e) { }
        seekAck = { id: id, ok: ok2 === true, at: Date.now(), pending: false, target: target };
        log("seek ack " + (ok2 ? "true" : "false at 1000ms"));
      }, 580);
    }, 420);
  }

  function applyCmd(c) {
    if (!c || typeof c.cmd !== "string") return;
    var cmd = c.cmd;
    if (cmd === "play") applyPlayPause(true);
    else if (cmd === "pause") applyPlayPause(false);
    else if (cmd === "toggle") ctrlToggle();
    else if (cmd === "next") applyNextPrev(true);
    else if (cmd === "prev") applyNextPrev(false);
    else if (cmd === "seek" && typeof c.position === "number" && isFinite(c.position)) {
      var id = "s" + (++seekSeq) + "t" + Date.now();
      seekAck = { id: id, ok: false, at: 0, pending: true, target: c.position };
      ctrlSeek(id, c.position);
    }
  }
  var seekSeq = 0;

  /* ======================================================================
   * Full lyrics: eapi (word-level yrc) -> channel -> direct
   * ==================================================================== */
  var LYR_CACHE_MAX = 8;
  var LYR_LS_KEY = "chushi-musicapi-lyric-v5";
  var lyricCache = new Map();

  function cachePut(songId, payload) {
    lyricCache.delete(songId);
    lyricCache.set(songId, payload);
    while (lyricCache.size > LYR_CACHE_MAX) {
      var oldest = lyricCache.keys().next().value;
      lyricCache.delete(oldest);
    }
    try {
      var arr = [];
      lyricCache.forEach(function (v, k) { arr.push([k, v]); });
      localStorage.setItem(LYR_LS_KEY, JSON.stringify(arr));
    } catch (e) { }
  }
  function cacheGet(songId) {
    if (lyricCache.has(songId)) {
      var v = lyricCache.get(songId);
      lyricCache.delete(songId);
      lyricCache.set(songId, v);
      return v;
    }
    try {
      var raw = localStorage.getItem(LYR_LS_KEY);
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

  function md5hex(text) {
    var c = require("crypto");
    return c.createHash("md5").update(text, "utf8").digest("hex");
  }

  function eapiParams(path, payload) {
    var c = require("crypto");
    var json = JSON.stringify(payload);
    var digest = md5hex("nobody" + path + "use" + json + "md5forencrypt");
    var text = path + "-36cd479b6b5-" + json + "-36cd479b6b5-" + digest;
    var cipher = c.createCipheriv("aes-128-ecb", Buffer.from("e82ckenh8dichen8", "utf8"), Buffer.alloc(0));
    var enc = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
    return enc.toString("hex").toUpperCase();
  }

  function postForm(url, formBody, timeoutMs) {
    return new Promise(function (resolve) {
      var done = false;
      var timer = setTimeout(function () { if (!done) { done = true; resolve(null); } }, timeoutMs);
      try {
        fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: formBody,
        }).then(function (r) { return r.json(); }).then(function (j) {
          if (!done) { done = true; clearTimeout(timer); resolve(j); }
        }).catch(function () { if (!done) { done = true; clearTimeout(timer); resolve(null); } });
      } catch (e) { if (!done) { done = true; clearTimeout(timer); resolve(null); } }
    });
  }

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
          var wd = nextOff != null ? (ln.t + nextOff - ws) : (tx.length * 90 + 60);
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

  function eapiLyric(songId) {
    /* Live-verified recipe: encrypt with the /api/... path, POST to the
     * /eapi/... URL, form field "params". Word-level content arrives in
     * yrc.lyric when the song has it; otherwise lrc/tlyric carry line-level. */
    var encPath = "/api/song/lyric/v1";
    var payload = {
      id: String(songId), cp: false, radio: false, cv: 4747474,
      kv: -1, tv: -1, lv: -1, rv: -1, st: 0, yv: 1,
    };
    return postForm("https://interface3.music.163.com/eapi/song/lyric/v1",
      "params=" + eapiParams(encPath, payload), 4000).then(function (j) {
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
      var done = false;
      var timer = setTimeout(function () { if (!done) { done = true; resolve(null); } }, 3500);
      try {
        fetch("https://music.163.com/api/song/lyric?os=pc&id=" + encodeURIComponent(String(songId)) +
          "&lv=-1&kv=-1&tv=-1").then(function (r) { return r.json(); }).then(function (j) {
            if (done) return;
            done = true; clearTimeout(timer);
            var lrc = j && j.lrc && j.lrc.lyric ? String(j.lrc.lyric) : "";
            if (!lrc) { resolve(null); return; }
            resolve({
              yrc: "", ytlrc: "",
              lrc: lrc,
              tlyric: j.tlyric && j.tlyric.lyric ? String(j.tlyric.lyric) : "",
              source: "direct-lrc",
            });
          }).catch(function () { if (!done) { done = true; clearTimeout(timer); resolve(null); } });
      } catch (e) { if (!done) { done = true; clearTimeout(timer); resolve(null); } }
    });
  }

  function fetchLyricPayload(songId) {
    var hit = cacheGet(songId);
    if (hit) return Promise.resolve(hit);
    return eapiLyric(songId)
      .then(function (a) { return a || channelLyric(songId); })
      .then(function (b) { return b || directLyric(songId); })
      .then(function (c) {
        if (!c) return null;
        var meta = readMeta();
        var payload = {
          songId: songId, title: meta.title, artist: meta.artist,
          rev: songId + "-" + c.source + "-" + (c.yrc || c.lrc || "").length,
          yrc: c.yrc, ytlrc: c.ytlrc, lrc: c.lrc, tlyric: c.tlyric, source: c.source,
        };
        cachePut(songId, payload);
        return payload;
      });
  }

  /* ======================================================================
   * HTTP data plane
   * ==================================================================== */
  function httpJson(method, path, body, timeoutMs) {
    return new Promise(function (resolve) {
      var done = false;
      var timer = setTimeout(function () { if (!done) { done = true; resolve(null); } }, timeoutMs);
      try {
        fetch(BASE + path, {
          method: method,
          headers: body ? { "Content-Type": "application/json" } : undefined,
          body: body ? JSON.stringify(body) : undefined,
        }).then(function (r) { return r.json(); }).then(function (j) {
          if (!done) { done = true; clearTimeout(timer); resolve(j); }
        }).catch(function () { if (!done) { done = true; clearTimeout(timer); resolve(null); } });
      } catch (e) { if (!done) { done = true; clearTimeout(timer); resolve(null); } }
    });
  }

  var pushedLyricKey = "";

  function truthPump() {
    try {
      var snap = composeSnapshot();
      httpJson("POST", "/api/ne", snap, 1800);
    } catch (e) { }
    setTimeout(truthPump, POLL_MS);
  }

  function cmdPump() {
    httpJson("GET", "/api/cmd", null, 1200).then(function (j) {
      if (j && j.ok === true && Array.isArray(j.cmds)) {
        for (var i = 0; i < j.cmds.length; i++) {
          try { applyCmd(j.cmds[i]); } catch (e) { }
        }
      }
      setTimeout(cmdPump, CMD_POLL_MS);
    }, function () { setTimeout(cmdPump, CMD_POLL_MS); });
  }

  function lyricPump() {
    try {
      var snap = composeSnapshot();
      var sid = snap.songId;
      if (sid > 0) {
        var key = sid + ":" + snap.title;
        var hit = cacheGet(sid);
        if (hit && pushedLyricKey !== hit.rev) {
          pushedLyricKey = hit.rev;
          httpJson("POST", "/api/lyric", hit, 4000);
        } else if (!hit && pushedLyricKey !== key) {
          pushedLyricKey = key;
          fetchLyricPayload(sid).then(function (pl) {
            if (pl) httpJson("POST", "/api/lyric", pl, 4000);
          });
        }
      }
    } catch (e) { }
    setTimeout(lyricPump, LYRIC_CHECK_MS);
  }

  setTimeout(truthPump, 1500);
  setTimeout(cmdPump, 3000);
  setTimeout(lyricPump, 4000);

  /* ======================================================================
   * Diagnostics panel (best effort, honest English only)
   * ==================================================================== */
  try {
    if (typeof plugin !== "undefined" && plugin && typeof plugin.onConfig === "function") {
      plugin.onConfig(function () {
        var wrap = document.createElement("div");
        wrap.style.cssText = "font-family:monospace;font-size:12px;line-height:1.7;padding:6px 2px";
        var line = document.createElement("div");
        wrap.appendChild(line);
        var conflict = (window.__chushiLyricSourceActive || window.__chushiLyricSource);
        if (conflict) {
          var warn = document.createElement("div");
          warn.style.cssText = "color:#e06c75;font-weight:bold";
          warn.textContent = "WARNING: an old all-in-one ChuShi lyric plugin is still " +
            "installed. Remove it from BetterNCM and restart NetEase Music.";
          wrap.appendChild(warn);
        }
        setInterval(function () {
          var snap = composeSnapshot();
          line.textContent = "truth: " + (snap.title ? "\"" + snap.title.slice(0, 30) + "\"" : "no track") +
            " | playing: " + snap.playing +
            " | pos: " + snap.position.toFixed(1) + "s / " + snap.duration.toFixed(1) + "s" +
            " | engine port: " + PORT;
        }, 2000);
        return wrap;
      });
    }
  } catch (e) { }

  log("plugin up, engine port " + PORT);
})();
