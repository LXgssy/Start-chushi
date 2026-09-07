/* ============================================================================
 * ChuShi Music Bridge v6.0.0  (generation 6, written from scratch)
 *
 * This is THE bridge of the ChuShi music stack - a standalone plugin.
 * Generation 6 retires the external engine process forever: everything
 * below runs inside the NetEase Music renderer, as a plugin.
 *
 * Constitution:
 *   RULE 1 - READ-ONLY TRUTH. Observes the player (native callbacks, dva
 *            store reads, the media element). Never dispatches to the
 *            store, never binds NetEase's own UI, never touches NetEase's
 *            own SMTC session. NetEase's own progress bar is untouched.
 *   RULE 2 - SINGLE-EXECUTION CONTROLS. play/pause via the media element,
 *            next/prev via NetEase's own visible transport buttons, seek
 *            via exactly ONE currentTime write plus honest read-back
 *            acknowledgement (seekAck). currentTime is written at exactly
 *            ONE place in this file.
 *   RULE 3 - PLUGGABLE NEIGHBOURS. ChuShi SMTC Manager and ChuShi Lyric
 *            Source join via window events; every neighbour is optional
 *            and its absence is reported honestly, never faked.
 *
 * Local hub (the reason this plugin exists): a tiny HTTP server bound to
 * 127.0.0.1 only, created with the renderer's built-in Node module. The
 * ChuShi new tab page (web or extension build) polls:
 *   GET  /api/ping          -> identity + plugin versions
 *   GET  /api/state         -> player truth snapshot + neighbour health
 *   GET  /api/lyric?songId= -> full lyric payload (word-level when exists)
 *   POST /api/cmd           -> {cmd, position?} into the command queue
 * All responses carry permissive CORS headers (plus private-network
 * preflight answers) so both the web build and the extension build work.
 *
 * Bus contract (window CustomEvents, same renderer):
 *   emits  "cc:music-state"  detail = { v, ts, songId, title, artist,
 *            album, pic, position, duration, playing, seekAckId,
 *            seekAckOk, seekAckAt, lyricVer, smtcVer, smtcSession,
 *            hubPort } - broadcast every second and on every significant
 *            change (play state flip / song change / seek)
 *   emits  "cc:lyric-req"    detail = { songId, reqId }
 *   listens "cc:lyric-res"   detail = { reqId, songId, payload, v }
 *   listens "cc:lyric-hello" detail = { v }
 *   listens "cc:smtc-cmd"    detail = { cmd, position?, id, v }
 *   listens "cc:smtc-ack"    detail = { v, session, at }
 * ==========================================================================*/
(function () {
  "use strict";
  if (window.__chushiMusicBridgeV6) return;
  window.__chushiMusicBridgeV6 = true;

  var PLUGIN_VERSION = "6.0.0";
  var HUB_NAME = "chushi-music-hub";

  var POLL_MS = 1000;        /* truth cadence */
  var CMD_POLL_MS = 250;     /* command queue drain */
  var SONG_CHECK_MS = 600;   /* song change watcher */
  var EV_PLAY_FRESH = 3000;  /* native PlayState freshness window */
  var EV_POS_FRESH = 5000;   /* native PlayProgress freshness window */
  var CMD_TTL_MS = 5000;
  var CMD_CAP = 8;
  var LYRIC_RETRY_MAX = 6;

  function log(m) {
    try { console.log("[ChuShi Music Bridge " + PLUGIN_VERSION + "] " + m); } catch (e) { }
  }
  function emit(name, detail) {
    try { window.dispatchEvent(new CustomEvent(name, { detail: detail })); } catch (e) { }
  }

  /* ======================================================================
   * Config (BetterNCM settings page, optional)
   * ==================================================================== */
  function cfgPort() {
    var def = 26801;
    try {
      if (typeof plugin !== "undefined" && plugin && typeof plugin.getConfig === "function") {
        var p = parseInt(plugin.getConfig("port", String(def)), 10);
        if (p >= 1024 && p <= 65535) return p;
      }
    } catch (e) { }
    return def;
  }

  /* ======================================================================
   * Native player callbacks (platform surface, read-only)
   * ==================================================================== */
  var nativeEv = { playing: null, playingAt: 0, songId: 0, songIdAt: 0, posMs: 0, posAt: 0 };

  function numArg(args) {
    for (var i = 0; i < args.length; i++) {
      if (typeof args[i] === "number" && isFinite(args[i])) return args[i];
      if (typeof args[i] === "string" && args[i] !== "" && isFinite(Number(args[i]))) return Number(args[i]);
    }
    return null;
  }
  function lastNumArg(args) {
    for (var i = args.length - 1; i >= 0; i--) {
      if (typeof args[i] === "number" && isFinite(args[i])) return args[i];
    }
    return null;
  }

  var significantChange = false; /* set by native events / seeks, debounced broadcast */
  function poke() { significantChange = true; }

  try {
    var native = window.legacyNativeCmder;
    if (native && typeof native.appendRegisterCall === "function") {
      native.appendRegisterCall("PlayState", "audioplayer", function () {
        var args = Array.prototype.slice.call(arguments);
        var st = lastNumArg(args);
        var id = numArg(args);
        if (id !== null && id >= 10000) { nativeEv.songId = id; nativeEv.songIdAt = Date.now(); }
        if (st !== null) {
          nativeEv.playing = st === 1;
          nativeEv.playingAt = Date.now();
          poke();
        }
      });
      native.appendRegisterCall("PlayProgress", "audioplayer", function () {
        var sec = lastNumArg(Array.prototype.slice.call(arguments));
        if (sec !== null && isFinite(sec) && sec >= 0) { nativeEv.posMs = sec * 1000; nativeEv.posAt = Date.now(); }
      });
      native.appendRegisterCall("Seek", "audioplayer", function () {
        var sec = lastNumArg(Array.prototype.slice.call(arguments));
        if (sec !== null && isFinite(sec) && sec >= 0) {
          nativeEv.posMs = sec * 1000;
          nativeEv.posAt = Date.now();
          poke();
        }
      });
      log("native callbacks registered");
    } else {
      log("legacyNativeCmder unavailable - store/element truth only");
    }
  } catch (e) {
    log("native callbacks failed: " + (e && e.message));
  }

  /* ======================================================================
   * dva store, read-only (webpack require capture -> module cache walk)
   * ==================================================================== */
  var storeRef = null;

  function looksLikePlayerStore(s) {
    try {
      return !!(s && typeof s.getState === "function" && typeof s.dispatch === "function" &&
        s.getState() && typeof s.getState() === "object" && s.getState().playing);
    } catch (e) { return false; }
  }

  function captureRequire(cb) {
    try {
      if (Array.isArray(window.webpackJsonp)) {
        var tag1 = "ccprobe" + Date.now();
        var f1 = {};
        f1[tag1] = function (m, e, r) { cb(r); };
        window.webpackJsonp.push([[tag1], f1, [[tag1]]]);
        return true;
      }
      for (var k in window) {
        if (k.indexOf("webpackChunk") === 0 && Array.isArray(window[k])) {
          var tag2 = "ccprobe" + Date.now();
          var f2 = {};
          f2[tag2] = function (m, e, r) { cb(r); };
          window[k].push([[tag2], f2]);
          return true;
        }
      }
    } catch (e) { }
    return false;
  }

  captureRequire(function (req) {
    try {
      var cache = req && req.c;
      if (!cache) return;
      var keys = Object.keys(cache);
      for (var i = 0; i < keys.length; i++) {
        var ex = cache[keys[i]] && cache[keys[i]].exports;
        if (!ex) continue;
        var holder = null;
        if (ex.a && typeof ex.a.getStore === "function") holder = ex.a;
        else if (typeof ex.getStore === "function") holder = ex;
        if (holder) {
          try {
            var got = holder.getStore();
            var st = got && got._store ? got._store : got;
            if (looksLikePlayerStore(st)) { storeRef = st; return; }
          } catch (e) { }
        }
        if (looksLikePlayerStore(ex)) { storeRef = ex; return; }
      }
    } catch (e) { }
  });

  function storeSlice() {
    try {
      if (storeRef && typeof storeRef.getState === "function") {
        var s = storeRef.getState();
        return s && s.playing ? s.playing : null;
      }
    } catch (e) { }
    return null;
  }

  /* ======================================================================
   * Media element truth (sticky identity, duration-anchored validation)
   * ==================================================================== */
  var heldEl = null;

  function anchorDurMs() {
    var p = storeSlice();
    if (p && p.curTrack && Number(p.curTrack.duration) > 0) return Number(p.curTrack.duration);
    try {
      if (typeof betterncm !== "undefined" && betterncm && betterncm.ncm &&
        typeof betterncm.ncm.getPlayingSong === "function") {
        var g = betterncm.ncm.getPlayingSong();
        if (g && g.data && Number(g.data.duration) > 0) return Number(g.data.duration);
      }
    } catch (e) { }
    return 0;
  }

  function elementOk(el, durMs) {
    try {
      if (!el || !el.tagName) return false;
      var tag = String(el.tagName).toLowerCase();
      if (tag !== "audio" && tag !== "video") return false;
      if (!el.isConnected) return false;
      if (typeof el.currentTime !== "number" || !isFinite(el.currentTime)) return false;
      if (durMs > 0 && el.duration && isFinite(el.duration) &&
        Math.abs(el.duration * 1000 - durMs) > 1500) return false;
      return true;
    } catch (e) { return false; }
  }

  function mediaElement() {
    var durMs = anchorDurMs();
    if (elementOk(heldEl, durMs)) return heldEl;
    var fallback = null;
    var list;
    try { list = document.querySelectorAll("audio, video"); } catch (e) { list = []; }
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      if (elementOk(el, durMs)) { heldEl = el; return el; }
      if (!fallback && el.isConnected && typeof el.currentTime === "number") fallback = el;
    }
    heldEl = fallback;
    return fallback;
  }

  /* ======================================================================
   * Metadata (store first, getPlayingSong fallback)
   * ==================================================================== */
  function clipStr(v, max) {
    var s = typeof v === "string" ? v : (v == null ? "" : String(v));
    return s.slice(0, max || 200);
  }

  function readMeta() {
    var p = storeSlice();
    var out = { songId: 0, title: "", artist: "", album: "", pic: "", durMs: 0 };
    if (p) {
      out.songId = Number(p.resourceTrackId || p.onlineResourceId || 0) || 0;
      out.title = clipStr(p.resourceName, 200);
      try {
        var arts = p.resourceArtists;
        if (Array.isArray(arts) && arts.length) {
          var names = [];
          for (var i = 0; i < arts.length && i < 5; i++) {
            if (arts[i] && arts[i].name) names.push(arts[i].name);
          }
          out.artist = clipStr(names.join("/"), 200);
        }
      } catch (e) { }
      if (/^https:\/\//.test(String(p.resourceCoverUrl || ""))) out.pic = clipStr(p.resourceCoverUrl, 500);
      try {
        var ct = p.curTrack;
        if (ct) {
          var al = ct.album || {};
          out.album = clipStr(al.albumName || al.name || "", 200);
          if (!out.pic && /^https:\/\//.test(String(al.picUrl || ""))) out.pic = clipStr(al.picUrl, 500);
          if (Number(ct.duration) > 0) out.durMs = Number(ct.duration);
        }
      } catch (e) { }
    }
    if (!out.title) {
      try {
        if (typeof betterncm !== "undefined" && betterncm && betterncm.ncm &&
          typeof betterncm.ncm.getPlayingSong === "function") {
          var g = betterncm.ncm.getPlayingSong();
          if (g && g.data) {
            out.title = out.title || clipStr(g.data.name, 200);
            if (!out.artist && Array.isArray(g.data.artists)) {
              var ns = [];
              for (var j = 0; j < g.data.artists.length && j < 5; j++) {
                if (g.data.artists[j] && g.data.artists[j].name) ns.push(g.data.artists[j].name);
              }
              out.artist = clipStr(ns.join("/"), 200);
            }
            if (!out.pic && g.data.album && /^https:\/\//.test(String(g.data.album.picUrl || ""))) {
              out.pic = clipStr(g.data.album.picUrl, 500);
            }
            if (!out.durMs && Number(g.data.duration) > 0) out.durMs = Number(g.data.duration);
          }
        }
      } catch (e) { }
    }
    return out;
  }

  /* ======================================================================
   * Truth composition
   * element (aligned) -> native progress -> store position
   * ==================================================================== */
  function composeSnapshot() {
    var meta = readMeta();
    var el = mediaElement();
    var now = Date.now();

    var playFresh = nativeEv.playing !== null && (now - nativeEv.playingAt) < EV_PLAY_FRESH;
    var posFresh = nativeEv.posAt > 0 && (now - nativeEv.posAt) < EV_POS_FRESH;

    var playing;
    if (playFresh) playing = nativeEv.playing === true;
    else {
      var p = storeSlice();
      if (p && typeof p.paused === "boolean") playing = p.paused === false;
      else if (el) { try { playing = el.paused === false; } catch (e) { playing = false; } }
      else playing = false;
    }

    var durMs = meta.durMs;
    if (!durMs && el) {
      try { if (el.duration && isFinite(el.duration)) durMs = el.duration * 1000; } catch (e) { }
    }

    var posMs = 0, elPosMs = 0;
    try { if (el) elPosMs = el.currentTime * 1000; } catch (e) { }
    var elAligned = !!el && (elPosMs > 0 || playing) &&
      (!posFresh || Math.abs(elPosMs - nativeEv.posMs) <= 1500);
    if (elAligned) posMs = elPosMs;
    else if (posFresh) posMs = nativeEv.posMs;
    else {
      var sp = storeSlice();
      if (sp && typeof sp.position === "number" && sp.position > 0 && sp.position < 36000) {
        posMs = sp.position * 1000;
      }
    }
    if (durMs > 0 && posMs > durMs) posMs = durMs;
    if (posMs < 0) posMs = 0;

    var songId = meta.songId;
    if (!songId && playFresh && nativeEv.songId > 0) songId = nativeEv.songId;

    return {
      v: PLUGIN_VERSION,
      ts: now,
      songId: songId || 0,
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
  var seekSeq = 0;

  function visibleButton(selectors) {
    for (var i = 0; i < selectors.length; i++) {
      try {
        var b = document.querySelector(selectors[i]);
        if (b && b.offsetParent !== null) return b;
      } catch (e) { }
    }
    return null;
  }

  function doPlayPause(wantPlaying) {
    var el = mediaElement();
    try {
      if (el) {
        if (wantPlaying && el.paused) { el.play(); return true; }
        if (!wantPlaying && !el.paused) { el.pause(); return true; }
        return true; /* already at target state */
      }
    } catch (e) { }
    var b = visibleButton(wantPlaying
      ? ["#btn-play", ".btn-play", "#btn-pause", ".btn-pause"]
      : ["#btn-pause", ".btn-pause", "#btn-play", ".btn-play"]);
    if (b) { b.click(); return true; }
    return false;
  }

  function doNextPrev(next) {
    var b = visibleButton(next
      ? ["#btn-next", ".btn-next"]
      : ["#btn-previous", "#btn-prev", ".btn-previous", ".btn-prev"]);
    if (b) { b.click(); return true; }
    return false;
  }

  function doSeek(targetSec) {
    var el = mediaElement(); /* identity captured BEFORE the single write */
    var id = "sk" + (++seekSeq) + "t" + Date.now();
    seekAck = { id: id, ok: false, at: 0, pending: true, target: targetSec };
    if (!el || typeof el.currentTime !== "number") {
      seekAck = { id: id, ok: false, at: Date.now(), pending: false, target: targetSec };
      log("seek ack false (no media element)");
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
        poke();
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
        poke();
      }, 580);
    }, 420);
  }

  /* ======================================================================
   * Command queue (fed by HTTP POST and SMTC system commands)
   * ==================================================================== */
  var cmdQueue = [];

  function enqueue(cmd, positionSec) {
    if (typeof cmd !== "string") return false;
    if (["play", "pause", "toggle", "next", "prev", "seek"].indexOf(cmd) < 0) return false;
    var item = { cmd: cmd, at: Date.now() };
    if (cmd === "seek") {
      if (typeof positionSec !== "number" || !isFinite(positionSec)) return false;
      item.position = Math.max(0, Math.min(86400, positionSec));
    }
    cmdQueue.push(item);
    while (cmdQueue.length > CMD_CAP) cmdQueue.shift();
    poke();
    return true;
  }

  function drainQueue() {
    var now = Date.now();
    while (cmdQueue.length) {
      var c = cmdQueue[0];
      if (now - c.at > CMD_TTL_MS) { cmdQueue.shift(); continue; }
      cmdQueue.shift();
      try {
        if (c.cmd === "play") doPlayPause(true);
        else if (c.cmd === "pause") doPlayPause(false);
        else if (c.cmd === "toggle") {
          var want = !(composeSnapshot().playing === true);
          doPlayPause(want);
        }
        else if (c.cmd === "next") doNextPrev(true);
        else if (c.cmd === "prev") doNextPrev(false);
        else if (c.cmd === "seek") doSeek(c.position);
        log("command executed: " + c.cmd + (c.cmd === "seek" ? "@" + c.position.toFixed(1) : ""));
      } catch (e) {
        log("command failed: " + (e && e.message));
      }
    }
  }

  setInterval(drainQueue, CMD_POLL_MS);

  window.addEventListener("cc:smtc-cmd", function (ev) {
    var d = ev && ev.detail;
    if (!d) return;
    enqueue(d.cmd, d.position);
  });

  /* ======================================================================
   * Neighbour health (SMTC Manager / Lyric Source)
   * ==================================================================== */
  var smtcHealth = { ver: "", session: "unknown", at: 0 };
  var lyricHealth = { ver: "", at: 0 };

  window.addEventListener("cc:smtc-ack", function (ev) {
    var d = ev && ev.detail;
    if (!d) return;
    smtcHealth = { ver: typeof d.v === "string" ? d.v : smtcHealth.ver, session: d.session || "unknown", at: Date.now() };
  });
  window.addEventListener("cc:lyric-hello", function (ev) {
    var d = ev && ev.detail;
    if (!d) return;
    lyricHealth = { ver: typeof d.v === "string" ? d.v : lyricHealth.ver, at: Date.now() };
  });

  /* ======================================================================
   * Lyric orchestration (ask ChuShi Lyric Source over the bus)
   * ==================================================================== */
  var lyricCache = new Map(); /* songId -> payload */
  var LYR_CACHE_MAX = 8;
  var pendingLyric = {}; /* reqId -> { songId, at } */
  var lyricReqSeq = 0;
  var lyricTries = 0;
  var lyricLastSong = 0;
  var lyricVer = "";

  function cacheLyric(songId, payload) {
    lyricCache.delete(songId);
    lyricCache.set(songId, payload);
    while (lyricCache.size > LYR_CACHE_MAX) {
      lyricCache.delete(lyricCache.keys().next().value);
    }
    if (payload && payload.rev) lyricVer = String(payload.rev);
  }

  function lyricFor(songId) {
    return lyricCache.get(songId) || null;
  }

  window.addEventListener("cc:lyric-res", function (ev) {
    var d = ev && ev.detail;
    if (!d || !d.reqId) return;
    var job = pendingLyric[d.reqId];
    if (!job) return;
    delete pendingLyric[d.reqId];
    if (d.payload && (d.payload.yrc || d.payload.lrc)) {
      cacheLyric(d.songId || job.songId, d.payload);
      log("lyric cached: " + (d.songId || job.songId) + " src=" + (d.payload.source || "?"));
    } else {
      lyricTries++;
    }
    poke();
  });

  function lyricWatcher() {
    var snap = composeSnapshot();
    var sid = snap.songId;
    if (sid > 0 && sid !== lyricLastSong) {
      lyricLastSong = sid;
      lyricTries = 0;
    }
    if (sid > 0 && !lyricFor(sid) && lyricTries < LYRIC_RETRY_MAX) {
      /* pace requests: one in flight per song, spaced out on failures */
      var inFlight = false;
      for (var k in pendingLyric) { inFlight = true; break; }
      if (!inFlight) {
        lyricTries++;
        var reqId = "ly" + (++lyricReqSeq);
        pendingLyric[reqId] = { songId: sid, at: Date.now() };
        emit("cc:lyric-req", { songId: sid, reqId: reqId });
        /* stale job sweep */
        setTimeout(function () { delete pendingLyric[reqId]; }, 4000);
      }
    }
    setTimeout(lyricWatcher, SONG_CHECK_MS);
  }

  /* ======================================================================
   * Broadcast pump
   * ==================================================================== */
  var lastBroadcast = { title: "", playing: null, seekAckAt: 0 };

  function broadcast(force) {
    var snap = composeSnapshot();
    snap.lyricVer = lyricVer;
    snap.smtcVer = smtcHealth.ver;
    snap.smtcSession = smtcHealth.session;
    snap.hubPort = hub.port;
    emit("cc:music-state", snap);
    lastBroadcast.title = snap.title;
    lastBroadcast.playing = snap.playing;
    lastBroadcast.seekAckAt = snap.seekAckAt;
    return snap;
  }

  setInterval(function () {
    var snap = composeSnapshot();
    var changed = snap.title !== lastBroadcast.title ||
      snap.playing !== lastBroadcast.playing ||
      snap.seekAckAt !== lastBroadcast.seekAckAt;
    if (significantChange || changed) {
      significantChange = false;
      broadcast(true);
    } else {
      broadcast(false); /* steady 1s cadence for position clocks */
    }
  }, POLL_MS);

  /* ======================================================================
   * Local HTTP hub (renderer Node module, 127.0.0.1 only)
   * ==================================================================== */
  var hub = { server: null, port: 0, status: "off", detail: "" };

  function cors(res, extra) {
    try {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      res.setHeader("Access-Control-Allow-Private-Network", "true");
      if (extra) { for (var k in extra) res.setHeader(k, extra[k]); }
    } catch (e) { }
  }

  function sendJson(res, code, obj) {
    try {
      var body = JSON.stringify(obj);
      cors(res);
      res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
      res.end(body);
    } catch (e) { }
  }

  function hubHandler(req, res) {
    try {
      if (req.method === "OPTIONS") {
        cors(res);
        res.writeHead(204);
        res.end();
        return;
      }
      var u = null;
      try { u = new URL(req.url, "http://127.0.0.1"); } catch (e) { }
      var path = u ? u.pathname : (req.url || "/");

      if (path === "/api/ping" && req.method === "GET") {
        sendJson(res, 200, {
          ok: true, name: HUB_NAME, version: PLUGIN_VERSION,
          plugins: { bridge: PLUGIN_VERSION, smtc: smtcHealth.ver, lyric: lyricHealth.ver },
        });
        return;
      }
      if (path === "/api/state" && req.method === "GET") {
        var snap = composeSnapshot();
        sendJson(res, 200, {
          ok: true, name: HUB_NAME, version: PLUGIN_VERSION,
          ne: snap,
          smtcVer: smtcHealth.ver,
          smtcSession: smtcHealth.session,
          lyricVer: lyricVer,
          hubPort: hub.port,
        });
        return;
      }
      if (path === "/api/lyric" && req.method === "GET") {
        var sid = u ? parseInt(u.searchParams.get("songId") || "0", 10) : 0;
        var pl = sid > 0 ? lyricFor(sid) : null;
        if (pl) sendJson(res, 200, { ok: true, lyric: pl });
        else sendJson(res, 200, { ok: false, reason: sid > 0 ? "lyric-not-ready" : "bad-songId" });
        return;
      }
      if (path === "/api/cmd" && req.method === "POST") {
        var chunks = [];
        var size = 0;
        req.on("data", function (c) {
          size += c.length;
          if (size <= 4096) chunks.push(c);
        });
        req.on("end", function () {
          var ok = false;
          try {
            var body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
            ok = enqueue(String(body.cmd || ""), typeof body.position === "number" ? body.position : undefined);
          } catch (e) { ok = false; }
          sendJson(res, 200, { ok: ok, queued: ok });
        });
        return;
      }
      sendJson(res, 404, { ok: false, reason: "not-found" });
    } catch (e) {
      try { sendJson(res, 500, { ok: false, reason: "hub-error" }); } catch (e2) { }
    }
  }

  function startHub() {
    var http = null;
    try { http = require("http"); } catch (e) {
      hub.status = "failed";
      hub.detail = "renderer Node http module unavailable";
      log(hub.detail);
      return;
    }
    if (!http || typeof http.createServer !== "function") {
      hub.status = "failed";
      hub.detail = "renderer Node http module unavailable";
      log(hub.detail);
      return;
    }
    tryBind(http, cfgPort(), 0);
  }

  function tryBind(http, port, attempts) {
    var srv;
    try { srv = http.createServer(hubHandler); } catch (e) {
      hub.status = "failed";
      hub.detail = e && e.message;
      return;
    }
    srv.on("error", function (err) {
      var code = err && (err.code || "");
      if (code === "EADDRINUSE" && attempts < 3) {
        var nextPort = port + 1;
        log("port " + port + " busy, trying " + nextPort);
        try { srv.close(); } catch (e) { }
        tryBind(http, nextPort, attempts + 1);
      } else {
        hub.status = "failed";
        hub.detail = code || (err && err.message) || "bind-error";
        log("hub bind failed: " + hub.detail);
      }
    });
    srv.listen(port, "127.0.0.1", function () {
      hub.server = srv;
      hub.port = port;
      hub.status = "listening";
      hub.detail = "";
      log("hub listening on 127.0.0.1:" + port);
      poke();
    });
  }

  startHub();

  /* ======================================================================
   * Kick off
   * ==================================================================== */
  setTimeout(function () { broadcast(true); }, 800);
  setTimeout(lyricWatcher, 1200);

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
        head.textContent = "初始 · 音乐桥 v" + PLUGIN_VERSION;
        box.appendChild(head);
        var order = ["truth", "hub", "neigh", "cmd"];
        var lines = {};
        for (var i = 0; i < order.length; i++) {
          var d = document.createElement("div");
          d.style.cssText = "font-family:monospace";
          box.appendChild(d);
          lines[order[i]] = d;
        }
        var note = document.createElement("div");
        note.style.cssText = "margin-top:6px;color:var(--text2,#888);font-size:12px";
        note.textContent = "本插件是「初始」音乐面板的桥：把网易云的真实播放状态提供给页面、" +
          "SMTC 管理器和歌词源，并单次执行页面下发的控制指令。严格只读，不改动网易云自身界面。" +
          "请勿与旧版「ChuShi Music API」插件同时安装。";
        box.appendChild(note);

        function render() {
          var snap = composeSnapshot();
          lines.truth.textContent = "真值：" + (snap.title ? "\"" + snap.title.slice(0, 26) + "\"" : "暂无曲目") +
            " | " + (snap.playing ? "播放中" : "已暂停") +
            " | " + snap.position.toFixed(1) + "s / " + snap.duration.toFixed(1) + "s";
          if (hub.status === "listening") {
            lines.hub.textContent = "枢纽：127.0.0.1:" + hub.port + "（运行中）";
          } else if (hub.status === "failed") {
            lines.hub.textContent = "枢纽：不可用（" + hub.detail + "）";
          } else {
            lines.hub.textContent = "枢纽：" + hub.status;
          }
          lines.neigh.textContent = "SMTC 管理器：" + (smtcHealth.ver ? "v" + smtcHealth.ver + "（" + smtcHealth.session + "）" : "未检测到") +
            " | 歌词源：" + (lyricHealth.ver ? "v" + lyricHealth.ver : "未检测到");
          lines.cmd.textContent = "待执行指令：" + cmdQueue.length + " 条";
        }
        render();
        setInterval(render, 2000);
        return box;
      });
    }
  } catch (e) { /* panel optional */ }
})();
