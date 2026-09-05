/*
 * 初始音乐桥 · 独立版（ChuShiBridge Standalone）— 页内桥接核心
 *
 * 由 ChuShiBridge.exe 经 CEF 调试协议（CDP Runtime.evaluate）注入网易云音乐主页面。
 * 不依赖 BetterNCM / chromatic 任何框架；全局挂载 window.__chushiBridge 后
 * exe 以 800ms 周期调用 snapshot() 拉快照，controlText() 下发控制命令。
 *
 * 状态源优先级（与 v1.7.5 插件版同路数，逐项对齐 InfLink-rs 适配器）：
 *   ① NCM 3.x dva Redux store（webpackJsonp push 假模块捕获 require → 模块缓存扫描）
 *   ② legacyNativeCmder 原生事件：PlayState / PlayProgress / Seek（audioplayer 命名空间）
 *      Orpheus 回调 state：1=播放 2=暂停（与 redux playingState 语义相反，勿混用）
 *   ③ 兜底：页面内媒体元素（video/audio）paused / currentTime / volume（音频真源）
 *
 * 控制命令：play / pause / toggle / next / prev / seek(positionMs) / volume(0-1) / mute
 */
(function () {
  "use strict";
  if (window.__chushiBridge && window.__chushiBridge.__v === "2.0.4") return;

  var VERSION = "2.0.4";
  var B = {
    __v: VERSION,
    store: null,          // dva Redux store
    storeReady: false,
    cmderReady: false,
    eventsHooked: false,
    lastPlaying: false,   // 最近已知播放态（事件驱动，toggle 依据）
    lastProgressMs: 0,    // 最近已知进度 ms
    lastTrackId: null,
    installedAt: Date.now(),
  };

  function clamp01(n) { return Math.max(0, Math.min(1, n)); }

  function httpsUp(u) {
    if (!u || typeof u !== "string") return "";
    var s = u.replace(/^http:\/\//i, "https://");
    if (s.indexOf("param=") === -1 && /music\.126\.net/.test(s)) {
      s += (s.indexOf("?") === -1 ? "?" : "&") + "param=500y500";
    }
    return s;
  }

  /* ---------- ① webpack require 同步捕获 + dva store 发现 ----------
   * 兼容 webpack4（window.webpackJsonp.push）与 webpack5（webpackChunk* 前缀全局），
   * 两者均为 push 时同步调用模块工厂/runtime 函数，require 此刻即就绪。 */
  function captureRequireSync() {
    var req = null;
    try {
      var gp = window.webpackJsonp;
      if (gp && typeof gp.push === "function") {
        var id = "__chushi_req_" + Date.now() + "_" + Math.floor(Math.random() * 1e6);
        var chunk = {};
        chunk[id] = function (module, exports, require) {
          try { req = typeof require === "function" ? require : null; } catch (e) { req = null; }
        };
        if (Array.isArray(gp[0])) gp.push([[id], chunk, [[id]]]);
        else gp.push([[id], chunk]);
        return req;
      }
    } catch (e) { /* 落入 webpack5 尝试 */ }
    try {
      /* webpack5：全局名 webpackChunk<AppName>，push([chunkIds, modules, runtimeFn]) */
      for (var k in window) {
        if (k.indexOf("webpackChunk") === 0 && window[k] && typeof window[k].push === "function") {
          req = null;
          window[k].push([
            ["__chushi_" + Date.now()],
            {},
            function (r0, r1) {
              if (typeof r0 === "function") req = r0;
              else if (typeof r1 === "function") req = r1;
            },
          ]);
          if (req) return req;
        }
      }
    } catch (e) { /* 忽略 */ }
    return null;
  }

  function findDvaStore(req) {
    try {
      var cache = req && req.c;
      if (!cache) return null;
      for (var mid in cache) {
        try {
          var ex = cache[mid] && cache[mid].exports;
          if (!ex) continue;
          var target = ex && ex.default ? ex.default : ex;
          if (
            target && typeof target === "object" && target.a &&
            typeof target.a.getStore === "function" &&
            target.a.inited && target.a.app && target.a.app._store
          ) {
            return target.a.app._store;
          }
        } catch (e) { /* 扫描继续 */ }
      }
    } catch (e) { /* 忽略 */ }
    return null;
  }

  function ensureStore() {
    if (B.storeReady) return true;
    var req = captureRequireSync();
    if (req) {
      var st = findDvaStore(req);
      if (st) {
        B.store = st;
        B.storeReady = true;
        /* 订阅：切歌时清进度（让快照立刻反映新曲） */
        try {
          st.subscribe(function () {
            try {
              var p = st.getState().playing || {};
              var tid = p.resourceTrackId || p.onlineResourceId || null;
              if (tid !== B.lastTrackId) {
                B.lastTrackId = tid;
                B.lastProgressMs = 0;
              }
            } catch (e) { /* 忽略 */ }
          });
        } catch (e) { /* 忽略 */ }
      }
    }
    return B.storeReady;
  }

  /* ---------- ② 原生事件注册（一次性） ---------- */
  function hookEvents() {
    if (B.eventsHooked) return;
    var cmder = window.legacyNativeCmder;
    if (!cmder || !cmder.appendRegisterCall) return;
    try {
      cmder.appendRegisterCall("PlayState", "audioplayer", function (playId, idStr, state) {
        B.lastPlaying = state === 1;
      });
      cmder.appendRegisterCall("PlayProgress", "audioplayer", function (playId, sec) {
        if (typeof sec === "number" && sec >= 0) B.lastProgressMs = Math.floor(sec * 1000);
      });
      cmder.appendRegisterCall("Seek", "audioplayer", function (playId, seekId, code, pos) {
        if (typeof pos === "number" && pos >= 0) B.lastProgressMs = Math.floor(pos * 1000);
      });
      B.eventsHooked = true;
      B.cmderReady = true;
    } catch (e) { /* 事件不可用则降级 */ }
  }

  /* ---------- ③ 媒体元素兜底 ---------- */
  function mediaEl() {
    try { return document.querySelector("video,audio"); } catch (e) { return null; }
  }

  /* ---------- 快照 ---------- */
  function buildSong() {
    var p = (B.store && B.store.getState && B.store.getState().playing) || {};
    if (!(p.resourceTrackId || p.onlineResourceId)) return null;
    return {
      id: p.resourceTrackId || p.onlineResourceId,
      name: p.resourceName || "未知歌名",
      artists: (p.resourceArtists || []).map(function (a) { return a && a.name; }).filter(Boolean),
      album:
        (p.curTrack && p.curTrack.album && (p.curTrack.album.albumName || p.curTrack.album.name)) || "",
      cover: httpsUp(p.resourceCoverUrl),
      durationMs: p.curTrack && p.curTrack.duration > 0 ? p.curTrack.duration : 0,
      local: p.trackFileType === "local",
    };
  }

  function buildSnapshot() {
    var p = (B.store && B.store.getState && B.store.getState().playing) || {};
    var el = mediaEl();
    var song = buildSong();
    var playing = B.lastPlaying;
    var pos = B.lastProgressMs;
    var vol = typeof p.playingVolume === "number" ? p.playingVolume : null;
    var mode = p.playingMode || "";
    var dur = song ? song.durationMs : 0;

    if (el) {
      /* 媒体元素是音频输出真源：播放态/进度以其为准（store 提供元数据） */
      playing = el.paused === false;
      pos = Math.floor((el.currentTime || 0) * 1000);
      if (vol === null) vol = clamp01(el.volume);
      if (!dur && el.duration > 0) dur = Math.floor(el.duration * 1000);
    }
    if (dur > 0 && pos > dur) pos = dur;
    return {
      v: 1,
      ts: Date.now(),
      client: "netease-music",
      song: song,
      playing: playing,
      positionMs: pos,
      volume: vol,
      mode: mode,
    };
  }

  function snapshot() {
    var diag = {
      store: false, cmder: false, media: false, events: false,
      href: (typeof location !== "undefined" && location.href || "").slice(0, 80),
    };
    try {
      ensureStore();
      hookEvents();
      diag.store = B.storeReady;
      diag.events = B.eventsHooked;
      diag.cmder = B.cmderReady;
      diag.media = !!mediaEl();
      if (!B.storeReady && !B.eventsHooked && !diag.media) {
        return JSON.stringify({ ok: false, error: "no-source", diag: diag });
      }
      return JSON.stringify({ ok: true, snap: buildSnapshot(), diag: diag });
    } catch (e) {
      return JSON.stringify({ ok: false, error: String(e && e.message || e), diag: diag });
    }
  }

  /* ---------- 控制 ---------- */
  function dispatch(a) {
    try { if (B.store) { B.store.dispatch(a); return true; } } catch (e) { /* fallthrough */ }
    return false;
  }

  function domControl(act) {
    try {
      var sel = {
        toggle: ".btn-pas",
        next: ".btn-next, .btn-skip-next",
        prev: ".btn-prev, .btn-skip-previous",
      }[act];
      if (sel) {
        var el = document.querySelector(sel);
        if (el) { el.click(); return true; }
      }
    } catch (e) { /* 忽略 */ }
    return false;
  }

  function controlText(text) {
    var c = null;
    try { c = JSON.parse(text); } catch (e) { return JSON.stringify({ ok: false, error: "bad-json" }); }
    if (!c || typeof c.action !== "string") return JSON.stringify({ ok: false, error: "no-action" });
    try {
      ensureStore(); hookEvents();
      var a = c.action;
      var ok =
        a === "play" ? dispatch({ type: "playing/resume", payload: { triggerScene: "desktopLyric" } }) :
        a === "pause" ? dispatch({ type: "playing/pause", payload: { triggerScene: "desktopLyric" } }) :
        a === "toggle" ? (B.lastPlaying
          ? dispatch({ type: "playing/pause", payload: { triggerScene: "desktopLyric" } })
          : dispatch({ type: "playing/resume", payload: { triggerScene: "desktopLyric" } })) :
        a === "next" ? dispatch({ type: "playingList/jump2Track", payload: { flag: 1, type: "call", triggerScene: "hotKey" } }) :
        a === "prev" ? dispatch({ type: "playingList/jump2Track", payload: { flag: -1, type: "call", triggerScene: "hotKey" } }) :
        a === "seek" && typeof c.positionMs === "number"
          ? dispatch({ type: "playing/setPlayingPosition", payload: { duration: c.positionMs / 1000 } }) :
        a === "volume" && typeof c.volume === "number"
          ? dispatch({ type: "playing/setVolume", payload: { volume: clamp01(c.volume) } }) :
        a === "mute" ? dispatch({ type: "playing/switchMute" }) : false;
      if (!ok && (a === "toggle" || a === "next" || a === "prev" || a === "play" || a === "pause")) {
        ok = domControl(a === "play" || a === "pause" ? "toggle" : a);
      }
      return JSON.stringify({ ok: !!ok, action: a });
    } catch (e) {
      return JSON.stringify({ ok: false, error: String(e && e.message || e) });
    }
  }

  B.snapshot = snapshot;
  B.controlText = controlText;
  B.diag = function () {
    return JSON.stringify({
      v: VERSION, store: B.storeReady, cmder: B.cmderReady,
      events: B.eventsHooked, media: !!mediaEl(), installedAt: B.installedAt,
      href: (typeof location !== "undefined" && location.href || "").slice(0, 80),
    });
  };
  try { window.__chushiBridge = B; } catch (e) { /* 忽略 */ }
  /* 安装即接线：store 探测 + 事件注册立刻做一次（事件流从安装起就不断流） */
  try { ensureStore(); } catch (e) { /* 下轮 snapshot 重试 */ }
  try { hookEvents(); } catch (e) { /* 下轮 snapshot 重试 */ }
  return "chushi-bridge-installed";
})();
