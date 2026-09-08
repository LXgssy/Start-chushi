/* ============================================================================
 * ChuShi Music Bridge 8.0.2 — 网易云 InfLink-rs 适配桥（v8.0.2 实机对症版）
 *   v8.0.1：①命令解析兼容 hub 实物协议 {"_id",raw:{...}}；②jpost 2.5s 超时；
 *   ③toggle 方向判定取 InfLink 真值。
 *   v8.0.2 实机三联修（用户视频/log 取证）：
 *   ① 控制验证+三级备路——InfLink 控制面是纯 redux dispatch（play/pause/next/
 *      prev/seek 全部 this.reduxStore?.dispatch），在部分 NCM 3.x 版本上 action 被
 *      reducer 静默忽略（数据读取同 store 却正常，故现场呈「数据活、按钮全死」）；
 *      本版改为「下发 → 延时验证（歌曲号/播放态真翻转）→ 不动则直发 dva action
 *      （动词逐字抄 InfLink 3.2.11）→ 再不动则 audio 元素/可见按钮」，绝不假装成功；
 *   ② 播放态时间线自愈——InfLink playState 冻结为 Paused 但时间线仍在推进
 *      （≥1.2s/拍）时按播放处理（面板▶/进度走同屏矛盾的根因）；
 *   ③ 封面 http→https 升级——页面端 https 源丢弃 http 图导致恒显默认底。
 *
 * v8 架构律（本代宪法）：
 *   1. 零自写 SMTC——系统媒体卡片（元数据/封面/时间线/媒体键/拖动）完全由
 *      InfLink-rs（Rust 原生插件）持有；本插件零 SMTC 代码，绝不与 WinRT
 *      发生任何关系（v7.0.x 四代崩溃永久终结）。
 *   2. InfLink-rs 主真值——window.InfLinkApi（InfLink-rs 设置页挂载的全局
 *      API）是歌曲/状态/时间线的第一真值源：
 *        getCurrentSong() → {songName, authorName, albumName, cover:{url}, ncmId, duration(ms)}
 *        getPlaybackStatus() → "Playing" | "Paused" | "Loading" | "Error"
 *        getTimeline() → {currentTime(ms), totalTime(ms)} | null
 *      单位律：InfLink 时间线一律毫秒，本插件统一 /1000 折算秒。
 *   3. 五层阶梯备源——InfLink 缺席（未装/禁用）或字段缺失时，旧真值阶梯
 *      只填空缺（audio 粘滞锁 → React fiber store → g_app → mediaSession →
 *      播放条 DOM 刮削）；非空字段优先，低阶源绝不覆盖高阶源。
 *   4. 控制主路走 InfLinkApi——play/pause/next/prev=InfLink 官方控制面
 *      （redux 派发，与系统卡片按钮同路），seek=seekTo(毫秒)；备路沿用
 *      audio 元素方法 + 可见按钮 + currentTime 单次直写 + 双读回校验。
 *   5. 枢纽客户位——本插件内置的 hub.dll（零 WinRT 纯 winsock 中继，
 *      127.0.0.1:26901/26902/26903）是唯一对外通道：
 *        拉命令  GET  /api/cmd    （页面控制，排空）
 *        推状态  POST /api/state  （1Hz，页面唯一数据源）
 *        推歌词  POST /api/lyric  （歌词源插件产物中继）
 *   6. 诚实降级——任一环节失败都在状态里如实标注，绝不假装在线。
 * ==========================================================================*/
(function () {
  'use strict';
  if (window.__chushiMusicBridge) return;

  var VER = '8.0.2';
  var HUB_NAME = 'chushi-music-hub';
  var HUB_PORTS = [26901, 26902, 26903];
  var BEAT_MS = 1000;

  window.__chushiMusicBridge = { ver: VER };
  /* v8 诊断口：控制台 window.__chushiMusicBridge.debug() 一眼看全真值链 */
  window.__chushiMusicBridge.debug = function () {
    return {
      ver: VER,
      hubPort: hub.port,
      hubVer: hub.version,
      inflink: { ver: inflink.ver, present: !!inflink.api },
      truth: JSON.parse(JSON.stringify(truth)),
      sources: {
        inflink: !!inflink.api && inflink.hit,
        element: !!getAudio(),
        webpackStore: !!(storeProbe.found),
        fiberStore: !!(fiberProbe.store),
        mediaSession: !!(readMediaSession()),
        domScrape: !!(scrapeBar())
      },
      seekAck: JSON.parse(JSON.stringify(seekAck)),
      cmdTrace: cmdTrace.slice()
    };
  };

  /* ------------------------------------------------------------------ */
  /* 小工具                                                              */
  /* ------------------------------------------------------------------ */
  function nowMs() { return Date.now(); }
  function clampNum(v, lo, hi) {
    v = Number(v);
    if (!isFinite(v)) return lo;
    return Math.min(hi, Math.max(lo, v));
  }
  function clip(v, n) { return typeof v === 'string' ? v.slice(0, n) : ''; }

  /* ------------------------------------------------------------------ */
  /* 真值源一：InfLink-rs（v8 主源）                                        */
  /* ------------------------------------------------------------------ */
  var inflink = { ver: '', api: null, hit: false, failStreak: 0 };

  function probeInflight() {
    try {
      var api = window.InfLinkApi;
      if (api && typeof api.getCurrentSong === 'function' && typeof api.play === 'function') {
        if (inflink.api !== api) {
          inflink.api = api;
          inflink.ver = clip(String(api.version || ''), 16);
          inflink.failStreak = 0;
        }
        return true;
      }
    } catch (e) { /* 探测异常按缺席 */ }
    if (inflink.api) { inflink.api = null; inflink.ver = ''; }
    return false;
  }

  /* 读 InfLink 三件套；任何一件命中即记 hit；播客同步 throw 当作无歌 */
  function readViaInflight(out) {
    var api = inflink.api;
    if (!api) return false;
    var got = false;
    try {
      var st = api.getPlaybackStatus ? api.getPlaybackStatus() : null;
      if (typeof st === 'string' && st) {
        out.playing = (st === 'Playing' || st === 'Loading');
        got = true;
      }
    } catch (e1) { /* 状态缺席 */ }
    try {
      var tl = api.getTimeline ? api.getTimeline() : null;
      if (tl && typeof tl === 'object') {
        var curMs = Number(tl.currentTime);
        var totMs = Number(tl.totalTime);
        if (isFinite(curMs) && curMs >= 0) { out.position = curMs / 1000; got = true; }
        if (isFinite(totMs) && totMs > 0) out.duration = totMs / 1000;
      }
    } catch (e2) { /* 时间线缺席 */ }
    try {
      var song = api.getCurrentSong ? api.getCurrentSong() : null;
      if (song && typeof song === 'object') {
        var id = Number(song.ncmId);
        var name = song.songName || song.name || '';
        if (name || (isFinite(id) && id > 0)) {
          var pic = '';
          try {
            if (song.cover && song.cover.url) pic = String(song.cover.url).slice(0, 500);
          } catch (e4) { /* 封面缺席 */ }
          out.song = {
            songId: isFinite(id) && id > 0 ? id : 0,
            title: String(name).slice(0, 200),
            artist: String(song.authorName || song.artist || '').slice(0, 200),
            album: String(song.albumName || song.album || '').slice(0, 200),
            pic: pic,
            durationMs: Number(song.duration) > 0 ? Number(song.duration) : 0
          };
          got = true;
        }
      }
    } catch (e3) { /* 播客信息尚未同步（InfLink throw）→ 当作无歌 */ }
    inflink.hit = got;
    return got;
  }

  /* ------------------------------------------------------------------ */
  /* 真值源二：audio 元素（粘滞身份锁，备源）                                */
  /* ------------------------------------------------------------------ */
  var elLock = { el: null, dur: 0, bad: 0 };

  function pickAudio() {
    var list = document.querySelectorAll('audio');
    var best = null;
    for (var i = 0; i < list.length; i++) {
      var a = list[i];
      if (a.duration > 0 || a.currentTime > 0) { best = a; break; }
      if (!best) best = a;
    }
    return best;
  }

  function getAudio() {
    if (elLock.el && elLock.el.isConnected) return elLock.el;
    var el = pickAudio();
    if (el && el !== elLock.el) {
      elLock.el = el;
      elLock.dur = el.duration || 0;
      elLock.bad = 0;
    }
    return el;
  }

  /* ------------------------------------------------------------------ */
  /* 真值源三a：React fiber store 探针（webpack5 可靠路径）                  */
  /* ------------------------------------------------------------------ */
  var fiberProbe = { tried: 0, lastScan: 0, store: null };

  function fiberKeyOf(el) {
    var keys;
    try { keys = Object.keys(el); } catch (e) { return null; }
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (k.indexOf('__reactFiber$') === 0 || k.indexOf('__reactContainer$') === 0) return k;
    }
    return null;
  }

  function storeOk(s) {
    try {
      var st = s.getState();
      return !!(st && st.player && typeof st.player === 'object');
    } catch (e) { return false; }
  }

  function findStoreViaFiber(force) {
    if (fiberProbe.store) {
      if (storeOk(fiberProbe.store)) return fiberProbe.store;
      fiberProbe.store = null;
    }
    var t = nowMs();
    if (!force && t - fiberProbe.lastScan < 15000) return null;
    if (fiberProbe.tried > 8) return null;
    fiberProbe.lastScan = t;
    fiberProbe.tried++;
    var body = document.body;
    if (!body) return null;
    var entry = null;
    var nodes = [body];
    try {
      var list = body.querySelectorAll('*');
      for (var i = 0; i < list.length && i < 4000; i++) nodes.push(list[i]);
    } catch (e) { /* DOM 异常跳过 */ }
    for (var j = 0; j < nodes.length; j++) {
      var k = fiberKeyOf(nodes[j]);
      if (k) { entry = nodes[j][k]; break; }
    }
    if (!entry) return null;
    var root = entry, guard = 0;
    while (root && root.return && guard++ < 500) root = root.return;
    if (!root) return null;
    /* BFS：react-redux Provider 把 dva store 放在 props.store */
    var queue = [root], seen = 0;
    while (queue.length && seen < 4000) {
      var f = queue.shift();
      seen++;
      try {
        var p = f.memoizedProps;
        if (p && p.store && typeof p.store.getState === 'function' && storeOk(p.store)) {
          fiberProbe.store = p.store;
          return fiberProbe.store;
        }
        if (f.stateNode && f.stateNode.props && f.stateNode.props.store &&
            typeof f.stateNode.props.store.getState === 'function' &&
            storeOk(f.stateNode.props.store)) {
          fiberProbe.store = f.stateNode.props.store;
          return fiberProbe.store;
        }
      } catch (e2) { /* 单节点异常忽略 */ }
      if (f.child) queue.push(f.child);
      if (f.sibling) queue.push(f.sibling);
    }
    return null;
  }

  /* 真值源三b：dva 全局应用（若有） */
  function findStoreViaGApp() {
    try {
      var g = window.g_app;
      var s = g && (g._store || (typeof g.getStore === 'function' && g.getStore()));
      if (s && typeof s.getState === 'function' && storeOk(s)) return s;
    } catch (e) { /* 忽略 */ }
    return null;
  }

  /* 真值源四：navigator.mediaSession.metadata（本体开了 SMTC 时页面自会设置） */
  function readMediaSession() {
    try {
      var md = navigator.mediaSession && navigator.mediaSession.metadata;
      if (md && (md.title || md.artist || md.album)) {
        var pic = '';
        try {
          if (md.artwork && md.artwork.length) {
            var a = md.artwork[md.artwork.length - 1];
            pic = (a && a.src) || '';
          }
        } catch (e1) { /* artwork 异常忽略 */ }
        return {
          title: typeof md.title === 'string' ? md.title : '',
          artist: typeof md.artist === 'string' ? md.artist : '',
          album: typeof md.album === 'string' ? md.album : '',
          pic: pic
        };
      }
    } catch (e) { /* mediaSession 缺席 */ }
    return null;
  }

  /* 真值源五：播放条 DOM 刮削（3 秒缓存） */
  var barProbe = { lastAt: 0, cache: null };

  function scrapeBar() {
    var t = nowMs();
    if (barProbe.cache && t - barProbe.lastAt < 3000) return barProbe.cache;
    barProbe.lastAt = t;
    var out = null;
    try {
      var bar = document.querySelector('#main-player')
        || document.querySelector('.j-play-bar')
        || document.querySelector('[class*="playBar"]')
        || document.querySelector('[class*="play-bar"]');
      if (bar) {
        var scope = bar.parentElement && bar.parentElement !== document.body ? bar.parentElement : bar;
        var img = scope.querySelector('img[src*="music.126.net"]');
        var title = '', artist = '';
        var tEls = scope.querySelectorAll('.j-title, [class*="title"] a, [class*="title"] span, [class*="title"]');
        for (var i = 0; i < tEls.length && i < 8; i++) {
          var tx = String(tEls[i].textContent || '').trim();
          if (tx && tx.length <= 60) { title = tx; break; }
        }
        var aEls = scope.querySelectorAll('.j-artist, [class*="artist"], [class*="singer"]');
        for (var j2 = 0; j2 < aEls.length && j2 < 8; j2++) {
          var ax = String(aEls[j2].textContent || '').trim();
          if (ax && ax.length <= 80) { artist = ax; break; }
        }
        var pic = img ? (img.getAttribute('src') || '') : '';
        if (title || artist || pic) out = { title: title, artist: artist, album: '', pic: pic };
      }
    } catch (e) { /* 刮削异常按无处理 */ }
    barProbe.cache = out;
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* 真值源六：dva store 只读探针（webpack4 老路径，保留兼容）                */
  /* ------------------------------------------------------------------ */
  var storeProbe = { tried: 0, found: null, lastScan: 0 };

  function captureWebpackRequire() {
    var req = null;
    function fakeModule() { return 1; }
    try {
      if (typeof window.webpackJsonp === 'object' && window.webpackJsonp && window.webpackJsonp.push) {
        var oldPush = window.webpackJsonp.push;
        window.webpackJsonp.push([
          ['__cs8_probe__'], { __cs8_probe__: function (m, e, r) { req = r; } },
          [['__cs8_probe__']]
        ]);
        if (!req) window.webpackJsonp.push = oldPush;
        if (req) return req;
      }
    } catch (e) { /* 探测失败继续下一种 */ }
    try {
      var keys = Object.keys(window);
      for (var k = 0; k < keys.length; k++) {
        if (keys[k].indexOf('webpackChunk') !== 0) continue;
        var arr = window[keys[k]];
        if (!arr || typeof arr.push !== 'function' || !Array.isArray(arr)) continue;
        arr.push([['__cs8_probe__'], { __cs8_probe__: function (m2, e2, r2) { req = r2; } }, [['__cs8_probe__']]]);
        if (req) return req;
      }
    } catch (e2) { /* 放弃 */ }
    return req;
  }

  function findDvaStore(force) {
    if (storeProbe.found) {
      try {
        var st = storeProbe.found.getState ? storeProbe.found.getState() : null;
        if (st && st.player) return storeProbe.found;
      } catch (e) { /* 缓存失效重扫 */ }
      storeProbe.found = null;
    }
    var t = nowMs();
    if (!force && t - storeProbe.lastScan < 30000) return null;
    storeProbe.lastScan = t;
    if (storeProbe.tried > 12) return null;
    storeProbe.tried++;
    var req = captureWebpackRequire();
    if (!req || !req.c) return null;
    var ids = Object.keys(req.c);
    for (var i = 0; i < ids.length && i < 1500; i++) {
      var mod = req.c[ids[i]];
      if (!mod || !mod.exports) continue;
      try {
        var ex = mod.exports;
        var cand = null;
        if (ex && typeof ex.getState === 'function') cand = ex;
        else if (ex.default && typeof ex.default.getState === 'function') cand = ex.default;
        if (!cand) continue;
        var st2 = cand.getState();
        if (st2 && st2.player && typeof st2.player === 'object') { storeProbe.found = cand; return cand; }
      } catch (e3) { /* 单模块异常忽略 */ }
    }
    return null;
  }

  function readStore() {
    var out = { song: null, playing: null, position: -1 };
    try {
      var store = findDvaStore(false) || findStoreViaFiber(false) || findStoreViaGApp();
      if (!store) return out;
      var st = store.getState();
      var pl = st && st.player ? st.player : null;
      if (!pl) return out;
      if (typeof pl.isPlaying === 'boolean') out.playing = pl.isPlaying;
      else if (typeof pl.playing === 'boolean') out.playing = pl.playing;
      var posCands = [pl.position, pl.progress, pl.currentTime];
      for (var i = 0; i < posCands.length; i++) {
        var p = Number(posCands[i]);
        if (isFinite(p) && p > 0 && p < 86400) { out.position = p; break; }
      }
      var songCands = [
        pl.meta && pl.meta.currentSong, pl.currentSong, pl.meta && pl.meta.song,
        pl.song, pl.musicInfo, pl.currentMusic
      ];
      for (var j = 0; j < songCands.length; j++) {
        var s = songCands[j];
        if (s && typeof s === 'object') {
          var name = s.name || s.title || '';
          var pic = s.picUrl || (s.album && s.album.picUrl) || '';
          var id = Number(s.id || s.songId || 0);
          if ((name || id) && !out.song) {
            var artists = [];
            if (Array.isArray(s.artists)) artists = s.artists;
            else if (Array.isArray(s.ar)) artists = s.ar;
            else if (s.artist) artists = [s.artist];
            var artNames = artists.map(function (a) { return (a && (a.name || a.nickname)) || ''; })
              .filter(function (x) { return !!x; });
            out.song = {
              songId: id,
              title: String(name).slice(0, 200),
              artist: artNames.slice(0, 5).join('/').slice(0, 200),
              album: String((s.album && s.album.name) || s.album || '').slice(0, 200),
              pic: pic ? String(pic).slice(0, 500) : '',
              durationMs: Number(s.duration || (s.album && s.album.duration) || 0) || 0
            };
            break;
          }
        }
      }
    } catch (e) { /* store 读取异常按无处理 */ }
    return out;
  }

  /* 阶梯合成：store → mediaSession → DOM（低阶只补前级空缺） */
  function readLadderMeta() {
    var store = readStore();
    var song = store.song;
    var msMeta = song ? null : readMediaSession();
    var domMeta = (song || msMeta) ? null : scrapeBar();
    var src = song ? 'store' : (msMeta ? 'ms' : (domMeta ? 'dom' : ''));
    var songOut = null;
    if (song || msMeta || domMeta) {
      var base = song || { title: '', artist: '', album: '', pic: '', songId: 0, durationMs: 0 };
      var fill = song ? null : (msMeta || domMeta);
      songOut = {
        songId: base.songId || 0,
        title: base.title || (fill && fill.title) || '',
        artist: base.artist || (fill && fill.artist) || '',
        album: base.album || (fill && fill.album) || '',
        pic: base.pic || (fill && fill.pic) || '',
        durationMs: base.durationMs || 0
      };
    }
    return { song: songOut, src: src };
  }

  /* ------------------------------------------------------------------ */
  /* 歌词（与歌词源插件协作：cc:lyric-req → cc:lyric-res）                  */
  /* ------------------------------------------------------------------ */
  var lyric = { songId: 0, payload: null, pendingId: 0, pendingAt: 0, done: {} };

  window.addEventListener('cc:lyric-res', function (ev) {
    try {
      var d = ev.detail || {};
      if (d.reqId !== lyric.pendingId) return;
      if (d.songId !== lyric.songId) return;
      if (d.payload && (d.payload.yrc || d.payload.lrc)) {
        lyric.payload = d.payload;
        pushLyric();
      }
      lyric.pendingAt = 0;
    } catch (e) { /* 忽略坏应答 */ }
  }, false);

  function requestLyric(songId) {
    lyric.songId = songId;
    lyric.payload = null;
    if (lyric.done[songId]) { lyric.payload = lyric.done[songId]; pushLyric(); return; }
    if (!songId) return;
    lyric.pendingId++;
    lyric.pendingAt = nowMs();
    try {
      window.dispatchEvent(new CustomEvent('cc:lyric-req', {
        detail: { songId: songId, reqId: lyric.pendingId, want: ['yrc', 'ytlrc', 'lrc', 'tlyric'] }
      }));
    } catch (e) { /* 歌词源缺席 */ }
  }

  function pushLyric() {
    if (!hub.port || !lyric.payload) return;
    if (lyric.payload.songId) lyric.done[lyric.payload.songId] = lyric.payload;
    var keys = Object.keys(lyric.done);
    if (keys.length > 4) delete lyric.done[keys[0]]; /* LRU 4 首 */
    jpost(hub.url('/api/lyric'), { ok: true, lyric: lyric.payload });
  }

  /* ------------------------------------------------------------------ */
  /* 枢纽客户端                                                            */
  /* ------------------------------------------------------------------ */
  var hub = { port: 0, version: '', failStreak: 0, lastPing: 0 };

  function jget(url, timeoutMs) {
    return new Promise(function (resolve) {
      var done = false;
      var ctl = null;
      try { ctl = new AbortController(); } catch (e) { ctl = null; }
      var timer = setTimeout(function () {
        if (done) return; done = true; resolve(null);
        try { if (ctl) ctl.abort(); } catch (e) { }
      }, timeoutMs || 2600);
      try {
        fetch(url, { signal: ctl ? ctl.signal : undefined })
          .then(function (r) { return r.json(); })
          .then(function (j) {
            if (done) return; done = true; clearTimeout(timer); resolve(j);
          })
          .catch(function () {
            if (done) return; done = true; clearTimeout(timer); resolve(null);
          });
      } catch (e) { if (!done) { done = true; clearTimeout(timer); resolve(null); } }
    });
  }

  function jpost(url, bodyObj) {
    return new Promise(function (resolve) {
      var done = false;
      var ctl = null;
      try { ctl = new AbortController(); } catch (e) { ctl = null; }
      var timer = setTimeout(function () {
        if (done) return; done = true; resolve(null);
        try { if (ctl) ctl.abort(); } catch (e) { }
      }, 2500);
      try {
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(bodyObj),
          signal: ctl ? ctl.signal : undefined
        })
          .then(function (r) { return r.json(); })
          .then(function (j) {
            if (done) return; done = true; clearTimeout(timer); resolve(j);
          })
          .catch(function () {
            if (done) return; done = true; clearTimeout(timer); resolve(null);
          });
      } catch (e) {
        if (!done) { done = true; clearTimeout(timer); resolve(null); }
      }
    });
  }

  hub.url = function (path) { return 'http://127.0.0.1:' + hub.port + path; };

  async function discoverHub() {
    for (var i = 0; i < HUB_PORTS.length; i++) {
      var p = HUB_PORTS[i];
      var j = await jget('http://127.0.0.1:' + p + '/api/ping', 1800);
      if (j && j.ok === true && j.name === HUB_NAME) {
        hub.port = p;
        hub.version = clip(String(j.version || ''), 16);
        hub.lastPing = nowMs();
        return true;
      }
    }
    return false;
  }

  /* ------------------------------------------------------------------ */
  /* 控制执行（主路 InfLinkApi → 延时验证 → 直发 dva → 元素/按钮，单次执行律） */
  /* v8.0.2 实机对症：InfLink 控制面 = this.reduxStore?.dispatch（play/pause/
   * next/prev/seek 全是），在部分 NCM 3.x 版本上这些 action 被 reducer 静默忽略
   * （同一 store 的读取却正常——现场即「数据活、按钮全死」）。故每次下发后
   * 延时验证「真翻转」，不动则降级：①直发 dva action（动词逐字抄 InfLink 3.2.11）
   * ②audio 元素 ③可见按钮。命令代数号闸：新命令到达即作废旧验证链。      */
  /* ------------------------------------------------------------------ */
  var seekAck = { id: '', ok: null, at: 0 };
  var lastCmdDone = {};
  var cmdSeq = 0;
  var cmdTrace = [];

  function traceCmd(kind, detail) {
    cmdTrace.push({ at: nowMs(), k: clip(String(kind || ''), 12), d: clip(String(detail || ''), 80) });
    if (cmdTrace.length > 12) cmdTrace.shift();
  }

  function controlStore() {
    var st = null;
    try { st = findDvaStore(false) || findStoreViaFiber(false) || findStoreViaGApp(); } catch (e0) { st = null; }
    if (st && typeof st.dispatch === 'function') return st;
    return null;
  }

  function reduxDispatch(type, payload) {
    var st = controlStore();
    if (!st) { traceCmd('redux', 'no-store:' + type); return false; }
    try {
      var act = { type: type };
      if (payload) act.payload = payload;
      st.dispatch(act);
      traceCmd('redux', type);
      return true;
    } catch (e) { traceCmd('redux', 'throw:' + type); return false; }
  }

  function linkStatus() {
    if (inflink.api && typeof inflink.api.getPlaybackStatus === 'function') {
      try {
        var s = inflink.api.getPlaybackStatus();
        if (typeof s === 'string' && s) return s;
      } catch (e) { /* 状态缺席 */ }
    }
    return '';
  }

  function songKey() { return truth.songId + '|' + truth.title; }

  /* 方向真值：优先本桥真值快照（readTruth 已含时间线自愈，1Hz 新鲜）；
     InfLink playState 冻结时盲信它会把方向/验证全部带偏。 */
  function playingNowCalc() {
    if (truth.updatedAt && nowMs() - truth.updatedAt < 3500) return truth.playing;
    var st = linkStatus();
    if (st) return (st === 'Playing' || st === 'Loading');
    var el = getAudio();
    if (el) return !el.paused && !el.ended;
    return truth.playing;
  }

  function apiToggle(playing) {
    var api = inflink.api;
    if (!api) return false;
    try {
      if (playing) { if (typeof api.pause === 'function') { api.pause(); return true; } }
      else { if (typeof api.play === 'function') { api.play(); return true; } }
    } catch (e) { /* InfLink 控制异常 → 备路 */ }
    return false;
  }

  function apiSeek(posSec) {
    var api = inflink.api;
    if (!api || typeof api.seekTo !== 'function') return false;
    try {
      api.seekTo(Math.round(posSec * 1000)); /* InfLink 律：毫秒 */
      return true;
    } catch (e) { return false; }
  }

  function execCommand(cmd) {
    if (!cmd || typeof cmd !== 'object') return;
    var type = clip(cmd.cmd || cmd.type, 16);
    if (!type) return; /* 坏命令（raw 解析失败等）直接丢 */
    if (lastCmdDone[cmd._id]) return; /* 幂等闸：同一条命令只执行一次 */
    lastCmdDone[cmd._id] = true;
    var keys = Object.keys(lastCmdDone);
    if (keys.length > 64) delete lastCmdDone[keys[0]];

    probeInflight(); /* 双保险：执行前刷新 InfLinkApi 在场状态 */
    var seq = ++cmdSeq;
    traceCmd('cmd', type + '#' + (cmd._id != null ? cmd._id : '?'));

    if (type === 'play' || type === 'pause' || type === 'toggle') {
      var before = playingNowCalc();
      var wantPlay = type === 'play' ? true : type === 'pause' ? false : !before;
      if (wantPlay === before) { traceCmd('skip', 'already'); return; } /* 已处目标态 */
      apiToggle(before); /* 主路：InfLink（与系统卡片按钮同路的 redux 派发） */
      /* +900ms 验证：播放态真翻转则收工；未翻转 → 直发 dva → 元素 → 按钮 */
      setTimeout(function () {
        if (seq !== cmdSeq) return;
        if (playingNowCalc() === wantPlay) { traceCmd('ok', 'link'); return; }
        reduxDispatch(wantPlay ? 'playing/resume' : 'playing/pause', { triggerScene: 'desktopLyric' });
        setTimeout(function () {
          if (seq !== cmdSeq) return;
          if (playingNowCalc() === wantPlay) { traceCmd('ok', 'redux'); return; }
          var el = getAudio();
          if (el) {
            try {
              if (wantPlay) safePlay(el); else el.pause();
              traceCmd('fb', 'element');
              return;
            } catch (e) { /* 元素失败 → 按钮 */ }
          }
          toggleViaButton();
          traceCmd('fb', 'button');
        }, 800);
      }, 900);
    } else if (type === 'next' || type === 'prev') {
      var dir = type === 'next' ? 'next' : 'prev';
      var flag = dir === 'next' ? 1 : -1;
      var key0 = songKey();
      var done = false;
      try {
        var api2 = inflink.api;
        if (api2 && (dir === 'next' ? typeof api2.next === 'function' : typeof api2.previous === 'function')) {
          if (dir === 'next') api2.next(); else api2.previous();
          done = true;
        }
      } catch (e2) { done = false; }
      if (!done) {
        /* InfLink 缺席：直接 redux（同动词）→ 末端按钮 */
        var ok1 = reduxDispatch('playingList/jump2Track', { flag: flag, type: 'call', triggerScene: 'hotKey' });
        if (!ok1) clickTransport(dir);
        return;
      }
      /* +1200ms 验证：曲未变（单循环曲也极少原地）→ 直发 dva；再 +1100ms 仍原曲 → 按钮 */
      setTimeout(function () {
        if (seq !== cmdSeq) return;
        if (songKey() !== key0) { traceCmd('ok', 'link'); return; }
        reduxDispatch('playingList/jump2Track', { flag: flag, type: 'call', triggerScene: 'hotKey' });
        setTimeout(function () {
          if (seq !== cmdSeq) return;
          if (songKey() !== key0) { traceCmd('ok', 'redux'); return; }
          clickTransport(dir);
          traceCmd('fb', 'button');
        }, 1100);
      }, 1200);
    } else if (type === 'seek') {
      var pos = clampNum(Number(cmd.position), 0, 86400);
      doSeek(pos);
    }
  }

  /* 备路：CEF 自动播放策略拒绝 el.play() 时，降级点击本体播放/暂停按钮 */
  function safePlay(el) {
    try {
      var pr = el.play();
      if (pr && typeof pr.catch === 'function') {
        pr.catch(function () {
          var b = visibleBtn(['.btn-p-play', '#btn-play', '.j-play', '[data-action="play"]',
            '[aria-label*="播放"]', '[aria-label*="暂停"]']);
          if (b) { try { b.click(); } catch (e2) { } }
        });
      }
    } catch (e) {
      var b2 = visibleBtn(['.btn-p-play', '#btn-play', '.j-play', '[data-action="play"]']);
      if (b2) { try { b2.click(); } catch (e3) { } }
    }
  }

  function toggleViaButton() {
    var b = visibleBtn(['.btn-p-play', '#btn-play', '.j-play', '[data-action="play"]']);
    if (b) { try { b.click(); } catch (e) { /* 点击异常 */ } }
  }

  function visibleBtn(cands) {
    for (var i = 0; i < cands.length; i++) {
      var list = document.querySelectorAll(cands[i]);
      for (var j = 0; j < list.length; j++) {
        var b = list[j];
        if (b && b.offsetParent !== null && typeof b.click === 'function') return b;
      }
    }
    return null;
  }

  function clickTransport(dir) {
    var cands = dir === 'next'
      ? ['.btn-p-next', '#btn-next', '.j-next', '[data-action="next"]', '.next-btn']
      : ['.btn-p-previous', '#btn-previous', '.j-prev', '[data-action="previous"]', '.prev-btn'];
    var b = visibleBtn(cands);
    if (b) { try { b.click(); } catch (e) { /* 点击异常 */ } }
  }

  function doSeek(pos) {
    seekAck.id = 's-' + nowMs() + '-' + Math.floor(Math.random() * 999);
    seekAck.ok = null;
    seekAck.at = nowMs();
    var doneLink = apiSeek(pos);
    var el = getAudio();
    if (!doneLink && el && el.readyState !== 0) {
      var dur = el.duration || 0;
      if (dur > 0 && pos > dur) pos = dur;
      try {
        el.currentTime = pos; /* 备路唯一写点（单次执行律） */
      } catch (e) {
        seekAck.ok = false; seekAck.at = nowMs();
        return;
      }
    }
    if (!doneLink && !el) {
      /* v8.0.2：无元素可写时直发 dva 动词（InfLink 同款载荷，秒制） */
      reduxDispatch('playing/setPlayingPosition', { duration: Math.round(pos) });
      seekAck.ok = null; seekAck.at = nowMs(); /* 诚实未知，不假装成功 */
      return;
    }
    /* 读回校验：元素在就双读回（主路 InfLink seek 最终也落到元素） */
    if (!el) return; /* 无元素且主路已执行 → ok=null（诚实未知，不假装成功） */
    setTimeout(function () {
      try {
        var r1 = el.currentTime;
        if (Math.abs(r1 - pos) < 2.5) { seekAck.ok = true; seekAck.at = nowMs(); return; }
      } catch (e) { /* 读回失败 */ }
      setTimeout(function () {
        try {
          var r2 = el.currentTime;
          seekAck.ok = Math.abs(r2 - pos) < 2.5;
        } catch (e2) { seekAck.ok = false; }
        seekAck.at = nowMs();
      }, 580);
    }, 420);
  }

  /* ------------------------------------------------------------------ */
  /* 快照构建与心跳                                                        */
  /* ------------------------------------------------------------------ */
  var truth = {
    playing: false, position: 0, duration: 0,
    songId: 0, title: '', artist: '', album: '', pic: '',
    src: 'none', updatedAt: 0
  };

  function readTruth() {
    var t = nowMs();
    var hasLink = !!inflink.api; /* 探针已在 beat 顶部刷新，此处只读缓存 */

    /* 主源：InfLink-rs 三件套 */
    var linkOut = { playing: null, position: -1, duration: 0, song: null };
    var linkGot = hasLink ? readViaInflight(linkOut) : false;

    /* 备源：元素 + 阶梯（InfLink 缺席时全量，在场时只补空缺） */
    var playing = linkOut.playing;
    var position = linkOut.position;
    var duration = linkOut.duration;
    var metaSrc = '';

    var el = getAudio();
    if (!linkGot) {
      if (el) {
        if (playing === null) playing = !el.paused && !el.ended;
        if (position < 0) position = Number(el.currentTime) || 0;
        if (duration <= 0) {
          var d = Number(el.duration) || 0;
          if (isFinite(d) && d > 0) duration = d;
        }
        metaSrc = 'element';
      }
      var store = readStore();
      if (playing === null && store.playing !== null) { playing = store.playing; metaSrc += (metaSrc ? '+' : '') + 'store'; }
      if (position < 0 && store.position >= 0) { position = store.position; }
      /* 物理自愈：进度在走 = 在播放（阶梯路径专属；<1.2s 窗防暂停微抖） */
      if (playing === false && position - truth.position > 1.2 && t - truth.updatedAt < 4000 &&
        (!truth.songId || !store.song || Number(store.song.songId) === truth.songId)) {
        playing = true;
      }
      var lad = readLadderMeta();
      metaSrc += lad.src ? (metaSrc ? '+' : '') + lad.src : '';
      var song = linkOut.song || lad.song;
      if (duration <= 0 && song && song.durationMs > 0) duration = song.durationMs / 1000;
      if (!linkOut.song && song) linkOut.song = song; /* 供下方统一取值 */
    } else {
      /* InfLink 在场：时间线/状态缺失的空缺由元素补（时间线 1Hz 节流间隙） */
      if (el) {
        if (position < 0) position = Number(el.currentTime) || 0;
        if (duration <= 0) {
          var d2 = Number(el.duration) || 0;
          if (isFinite(d2) && d2 > 0) duration = d2;
        }
      }
      if (duration <= 0 && linkOut.song && linkOut.song.durationMs > 0) duration = linkOut.song.durationMs / 1000;
      /* v8.0.2 状态自愈：InfLink playState 冻结为 Paused 但时间线仍在推进
         （≥1.2s/拍、同曲、拍间陈旧 <4s）→ 按播放处理。只治假暂停，
         绝不反向伪造（缓冲/加载中交由 'Loading' 原义承载）。 */
      if (playing === false && position - truth.position > 1.2 &&
          t - truth.updatedAt < 4000 &&
          (!truth.songId || !linkOut.song || Number(linkOut.song.songId) === truth.songId)) {
        playing = true;
        metaSrc = 'inflink+heal';
      }
      metaSrc = metaSrc || 'inflink';
    }

    var song = linkOut.song;
    var songId = song && song.songId ? song.songId : (truth.songId || 0);
    var title = (song && song.title) || truth.title;
    var artist = (song && song.artist) || truth.artist;
    var album = (song && song.album) || truth.album;
    var pic = (song && song.pic) || truth.pic;
    /* v8.0.2：协议相对与 http 封面升级 https（页面端 https 源按 CSP/混合内容策略
       会丢弃 http 图 → 恒显默认底；126 CDN 双协议均可用） */
    if (pic && pic.indexOf('//') === 0) pic = 'https:' + pic;
    if (pic && /^http:\/\/[^\/]*music\.126\.net/i.test(pic)) pic = 'https://' + pic.slice(7);
    if (pic && pic.indexOf('?param=') < 0 && pic.indexOf('http') === 0) pic = pic + '?param=500y500';
    if (position < 0) position = 0;
    if (playing === null) playing = truth.playing;

    var changedSong = songId !== truth.songId && !!songId;
    truth.playing = playing === true;
    truth.position = position;
    truth.duration = duration;
    truth.songId = songId || 0;
    truth.title = title || '';
    truth.artist = artist || '';
    truth.album = album || '';
    truth.pic = pic || '';
    truth.src = clip(metaSrc || (hasLink ? 'inflink' : 'none'), 32);
    truth.updatedAt = t;

    if (changedSong) requestLyric(truth.songId);
    return truth;
  }

  function buildStateBlob() {
    return {
      ok: true,
      name: 'chushi-music-state',
      v: VER,
      ts: nowMs(),
      ne: {
        songId: truth.songId,
        title: truth.title,
        artist: truth.artist,
        album: truth.album,
        pic: truth.pic,
        position: Math.round(truth.position * 100) / 100,
        duration: Math.round(truth.duration * 100) / 100,
        playing: truth.playing,
        ts: truth.updatedAt,
        v: VER,
        src: truth.src,
        seekAckId: seekAck.id,
        seekAckOk: seekAck.ok === true,
        seekAckAt: seekAck.at
      },
      /* smtcVer v8 语义 = InfLink-rs 版本（系统卡片提供方）；空 = 未装/未启用 */
      smtcVer: inflink.ver,
      inflinkVer: inflink.ver,
      version: hub.version,
      hubVer: hub.version
    };
  }

  var beatBusy = false;
  async function beat() {
    if (beatBusy) return;
    beatBusy = true;
    try {
      /* 1) 枢纽保活 */
      if (!hub.port || nowMs() - hub.lastPing > 20000) {
        var ok = await discoverHub();
        if (!ok) { hub.failStreak++; return; }
      }
      hub.failStreak = 0;

      /* 2) 探针先行：命令执行前必须刷新 InfLinkApi 在场状态
         （首拍/InfLink 重载后，命令执行不得落在空探针上） */
      probeInflight();

      /* 3) 拉页面命令（v8：无系统侧事件——媒体键全由 InfLink 直达网易云）
         v8.0.1 协议律：hub 实物返回 [{"_id":N,"raw":{...}}]，raw 是对象；
         旧代码 JSON.parse(item.raw) 把对象转 "[object Object]" 必抛 →
         全部命令被静默丢弃（e2e mock 与实物协议分叉漏网）。双形兼容： */
      var cmds = await jget(hub.url('/api/cmd'), 2000);
      if (Array.isArray(cmds)) {
        for (var c = 0; c < cmds.length; c++) {
          var item = cmds[c];
          try {
            var obj = item;
            if (item && item.raw != null) {
              obj = (typeof item.raw === 'string') ? JSON.parse(item.raw) : item.raw;
            }
            if (obj && obj._id == null && item && item._id != null) obj._id = item._id;
            execCommand(obj);
          } catch (e) { /* 坏命令跳过 */ }
        }
      }

      /* 4) 读真值 → 5) 推状态（页面唯一数据源） */
      readTruth();
      var blob = buildStateBlob();
      await jpost(hub.url('/api/state'), blob);
    } catch (e) {
      hub.failStreak++;
    } finally {
      beatBusy = false;
    }
  }

  /* ------------------------------------------------------------------ */
  /* 启动                                                                  */
  /* ------------------------------------------------------------------ */
  function start() {
    readTruth();
    beat().finally(function () { });
    setInterval(function () { beat(); }, BEAT_MS);
    /* 歌词请求超时重试 */
    setInterval(function () {
      if (lyric.pendingAt && nowMs() - lyric.pendingAt > 4000) {
        lyric.pendingAt = 0;
        requestLyric(lyric.songId);
      }
    }, 5000);
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(start, 1500);
  } else {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(start, 1500); });
  }
})();
