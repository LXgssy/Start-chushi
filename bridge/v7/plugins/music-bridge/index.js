/* ============================================================================
 * ChuShi Music Bridge 7.1.0 — 网易云 API 桥（第七代全新实现，纯 JS）
 *
 * 架构律（v7 宪法）：
 *   1. 零 Node——BetterNCM v2 是 CEF 渲染环境，没有 require/Node；
 *      本文件全部能力来自页面 JS（audio 元素、window 事件、fetch、localStorage）。
 *   2. 只读律——对网易云内部状态只读不写；唯一写点是 audio.currentTime
 *      的 seek 单次写入。绝不 dispatch 到 dva store，绝不干扰本体播放器。
 *   3. 单次执行律——每条控制命令只执行一次：play/pause=元素方法（被自动播放
 *      策略拒绝时降级点击本体播放/暂停按钮），next/prev=网易云自家可见按钮点击，
 *      seek=currentTime 单写+双读回校验，读回失败以 seekAck 诚实上报。
 *   4. 枢纽客户位——原生 DLL（ChuShi SMTC Manager）的 HTTP 枢纽
 *      （127.0.0.1:26901/26902/26903）是唯一对外通道：
 *        · 拉命令  GET  /api/cmd           （页面控制，排空）
 *        · 拉事件  GET  /api/smtc/events   （媒体键/系统拖动，排空）
 *        · 推状态  POST /api/state         （1Hz，页面唯一数据源）
 *        · 推SMTC  POST /api/smtc/update   （1Hz，表单编码，驱动系统卡片）
 *        · 推歌词  POST /api/lyric         （歌词源插件产物中继）
 *   5. 诚实降级——任一环节失败都在状态里如实标注，绝不假装在线。
 *
 * v7.1.0 元数据链根治（「未知曲目」终局修复）：
 *   v7.0.0 的 store 探针只在 webpack4 下可用（模块缓存挂 require.c，
 *   webpack5 已移除）→ store 永远找不到 → 歌名全空 → 系统卡片被 broker
 *   的 fallback 字符串「未知曲目」刷屏。本版真值源阶梯：
 *     ① React fiber 树查找（webpack5 可靠：任意元素 __reactFiber$ →
 *        根 fiber → BFS 找 react-redux Provider 的 props.store=dva store）
 *     ② webpack4 老探针（保留，老版本兼容）
 *     ③ window.g_app（dva 全局应用，若有）
 *     ④ navigator.mediaSession.metadata（本体若已开 SMTC，页面自己会设）
 *     ⑤ 播放条 DOM 刮削（封面/标题/歌手，最后兜底）
 * ==========================================================================*/
(function () {
  'use strict';
  if (window.__chushiMusicBridge) return;

  var VER = '7.1.0';
  var HUB_NAME = 'chushi-smtc-hub';
  var HUB_PORTS = [26901, 26902, 26903];
  var BEAT_MS = 1000;
  var EVT_STALE_MS = 8000;

  window.__chushiMusicBridge = { ver: VER };
  /* v7.1.0 诊断口：控制台 window.__chushiMusicBridge.debug() 一眼看全真值链 */
  window.__chushiMusicBridge.debug = function () {
    return {
      ver: VER,
      hubPort: hub.port,
      hubVer: (hub.smtc && hub.smtc.version) || '',
      truth: JSON.parse(JSON.stringify(truth)),
      sources: {
        webpackStore: !!(storeProbe.found),
        fiberStore: !!(fiberProbe.store),
        fiberTried: fiberProbe.tried,
        webpackTried: storeProbe.tried,
        mediaSession: !!(readMediaSession()),
        domScrape: !!(scrapeBar())
      },
      smtcReadyNow: smtcReadyNow,
      seekAck: JSON.parse(JSON.stringify(seekAck))
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

  function semverLt(a, b) {
    var pa = String(a || '0').split('.'), pb = String(b || '0').split('.');
    for (var i = 0; i < 3; i++) {
      var na = parseInt(pa[i], 10) || 0, nb = parseInt(pb[i], 10) || 0;
      if (na !== nb) return na < nb;
    }
    return false;
  }

  /* ------------------------------------------------------------------ */
  /* 真值源一：audio 元素（粘滞身份锁）                                     */
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
    if (elLock.el && elLock.el.isConnected) {
      /* 身份粘滞：元素仍在文档即复用；时长锚定防误切 */
      return elLock.el;
    }
    var el = pickAudio();
    if (el && el !== elLock.el) {
      elLock.el = el;
      elLock.dur = el.duration || 0;
      elLock.bad = 0;
    }
    return el;
  }

  /* ------------------------------------------------------------------ */
  /* 真值源二a：React fiber store 探针（webpack5 可靠路径，v7.1.0 新增）    */
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
    if (fiberProbe.tried > 8) return null; /* 有限重试，不无限扫描 */
    fiberProbe.lastScan = t;
    fiberProbe.tried++;
    var body = document.body;
    if (!body) return null;
    /* 找任意 fiber 入口（body + 前 4000 个后代） */
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
    /* 走到根 fiber */
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

  /* 真值源二b：dva 全局应用（若有） */
  function findStoreViaGApp() {
    try {
      var g = window.g_app;
      var s = g && (g._store || (typeof g.getStore === 'function' && g.getStore()));
      if (s && typeof s.getState === 'function' && storeOk(s)) return s;
    } catch (e) { /* 忽略 */ }
    return null;
  }

  /* 真值源三：navigator.mediaSession.metadata（本体开了 SMTC 时页面自会设置） */
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

  /* 真值源四：播放条 DOM 刮削（3 秒缓存） */
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
  /* 真值源二：dva store 只读探针（webpack4 老路径，保留兼容）                */
  /* ------------------------------------------------------------------ */
  var storeProbe = { tried: 0, found: null, lastScan: 0, song: null, playing: null, position: -1, failStreak: 0 };

  function captureWebpackRequire() {
    var req = null;
    function fakeModule() { return 1; }
    /* 旧式 webpackJsonp：数组或函数 */
    try {
      if (typeof window.webpackJsonp === 'object' && window.webpackJsonp && window.webpackJsonp.push) {
        var oldPush = window.webpackJsonp.push;
        window.webpackJsonp.push([
          ['__chushi_probe__'], { __chushi_probe__: function (m, e, r) { req = r; } },
          [['__chushi_probe__']]
        ]);
        if (!req) window.webpackJsonp.push = oldPush;
        if (req) return req;
      }
    } catch (e) { /* 探测失败继续下一种 */ }
    /* 新式 chunk 数组：webpackChunk*（含 cloudmusic_NCMS 等） */
    try {
      var keys = Object.keys(window);
      for (var k = 0; k < keys.length; k++) {
        if (keys[k].indexOf('webpackChunk') !== 0) continue;
        var arr = window[keys[k]];
        if (!arr || typeof arr.push !== 'function' || !Array.isArray(arr)) continue;
        arr.push([['__chushi_probe__'], { __chushi_probe__: function (m, e, r) { req = r; } }, [['__chushi_probe__']]]);
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
    if (storeProbe.tried > 12) return null; /* 有限重试，不无限扫描 */
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
      } catch (e2) { /* 单模块异常忽略 */ }
    }
    return null;
  }

  function readStore() {
    var out = { song: null, playing: null, position: -1, ok: false };
    try {
      /* v7.1.0：webpack4 老探针 → fiber 探针 → g_app，任一命中即用 */
      var store = findDvaStore(false) || findStoreViaFiber(false) || findStoreViaGApp();
      if (!store) return out;
      var st = store.getState();
      var pl = st && st.player ? st.player : null;
      if (!pl) return out;
      /* 播放态多键位兼容读取 */
      if (typeof pl.isPlaying === 'boolean') out.playing = pl.isPlaying;
      else if (typeof pl.playing === 'boolean') out.playing = pl.playing;
      /* 位置（秒）多键位兼容读取 */
      var posCands = [pl.position, pl.progress, pl.currentTime];
      for (var i = 0; i < posCands.length; i++) {
        var p = Number(posCands[i]);
        if (isFinite(p) && p > 0 && p < 86400) { out.position = p; break; }
      }
      /* 曲目元数据多键位兼容读取 */
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
      out.ok = !!(out.song || out.playing !== null);
    } catch (e) {
      storeProbe.failStreak++;
    }
    return out;
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
    var body = JSON.stringify({ ok: true, lyric: lyric.payload });
    try {
      fetch('http://127.0.0.1:' + hub.port + '/api/lyric', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body
      }).catch(function () { });
    } catch (e) { /* 枢纽不可达 */ }
  }

  /* ------------------------------------------------------------------ */
  /* SMTC Manager 信息（插件 A 探针广播 + 枢纽自检）                        */
  /* ------------------------------------------------------------------ */
  var smtcInfo = { ver: '', ready: null, nativeLoaded: null };

  window.addEventListener('cc:smtc-info', function (ev) {
    try {
      var d = ev.detail || {};
      smtcInfo.ver = d.ver || '';
      smtcInfo.ready = d.smtcReady === true;
      smtcInfo.nativeLoaded = d.nativeLoaded === true;
    } catch (e) { /* 忽略 */ }
  }, false);

  /* ------------------------------------------------------------------ */
  /* 枢纽客户端                                                            */
  /* ------------------------------------------------------------------ */
  var hub = { port: 0, failStreak: 0, lastPing: 0, smtc: null };

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
      try {
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(bodyObj)
        })
          .then(function (r) { return r.json(); })
          .then(function (j) { resolve(j); })
          .catch(function () { resolve(null); });
      } catch (e) { resolve(null); }
    });
  }

  function spost(url, bodyStr) {
    return new Promise(function (resolve) {
      try {
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: bodyStr
        })
          .then(function () { resolve(true); })
          .catch(function () { resolve(false); });
      } catch (e) { resolve(false); }
    });
  }

  function formEnc(kv) {
    var parts = [];
    for (var k in kv) {
      if (!Object.prototype.hasOwnProperty.call(kv, k)) continue;
      var v = kv[k];
      if (v === undefined || v === null) continue;
      var s = String(v);
      var out = '';
      try {
        out = encodeURIComponent(s);
      } catch (e) { out = ''; }
      parts.push(k + '=' + out);
    }
    return parts.join('&');
  }

  async function discoverHub() {
    for (var i = 0; i < HUB_PORTS.length; i++) {
      var p = HUB_PORTS[i];
      var j = await jget('http://127.0.0.1:' + p + '/api/ping', 1800);
      if (j && j.ok === true && j.name === HUB_NAME) {
        hub.port = p;
        hub.lastPing = nowMs();
        hub.smtc = j;
        return true;
      }
    }
    return false;
  }

  async function hubStatus() {
    if (!hub.port) return null;
    var j = await jget('http://127.0.0.1:' + hub.port + '/api/smtc/status', 2000);
    return j && j.ok === true ? j : null;
  }

  /* ------------------------------------------------------------------ */
  /* 控制执行（单次执行律）                                                */
  /* ------------------------------------------------------------------ */
  var seekAck = { id: '', ok: null, at: 0 };
  var lastCmdDone = {};

  function execCommand(cmd) {
    if (!cmd || typeof cmd !== 'object') return;
    var type = clip(cmd.cmd || cmd.type, 16);
    if (lastCmdDone[cmd._id]) return; /* 幂等闸：同一条命令只执行一次 */
    lastCmdDone[cmd._id] = true;

    if (type === 'play' || type === 'pause' || type === 'toggle') {
      var el = getAudio();
      if (!el) { toggleViaBarButton(type); return; }
      var wantPlay = type === 'play' ? true : type === 'pause' ? false : !!el.paused;
      try {
        if (wantPlay && el.paused) safePlay(el);
        else if (!wantPlay && !el.paused) el.pause();
      } catch (e) { toggleViaBarButton(type); /* 元素异常 → 本体按钮兑底 */ }
    } else if (type === 'next' || type === 'prev') {
      clickTransport(type === 'next' ? 'next' : 'prev');
    } else if (type === 'seek') {
      var pos = clampNum(Number(cmd.position), 0, 86400);
      doSeek(pos);
    }
  }

  /* v7.1.0：CEF 自动播放策略拒绝 el.play() 时，降级点击本体播放/暂停按钮 */
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

  function toggleViaBarButton(type) {
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
    var el = getAudio();
    seekAck.id = 's-' + nowMs() + '-' + Math.floor(Math.random() * 999);
    seekAck.ok = null;
    seekAck.at = nowMs();
    if (!el || el.readyState === 0) {
      seekAck.ok = false; seekAck.at = nowMs();
      return;
    }
    var dur = el.duration || 0;
    if (dur > 0 && pos > dur) pos = dur;
    var before = el.currentTime;
    try {
      el.currentTime = pos; /* 全文件唯一写点（单次执行律） */
    } catch (e) {
      seekAck.ok = false; seekAck.at = nowMs();
      return;
    }
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
        void before;
      }, 580);
    }, 420);
  }

  function execSmtcEvent(ev) {
    if (!ev || typeof ev !== 'object') return;
    if (ev.type === 'button') {
      var b = clip(ev.button, 12);
      if (b === 'play' || b === 'pause') {
        var el = getAudio();
        if (el) {
          try {
            if (b === 'play' && el.paused) safePlay(el);
            else if (b === 'pause' && !el.paused) el.pause();
          } catch (e) { toggleViaBarButton(b); }
        } else {
          toggleViaBarButton(b);
        }
      } else if (b === 'next') { clickTransport('next'); }
      else if (b === 'prev') { clickTransport('prev'); }
      else if (b === 'stop') {
        var el2 = getAudio();
        if (el2) { try { el2.pause(); } catch (e) { } }
      }
    } else if (ev.type === 'seek') {
      var pos = clampNum(Number(ev.pos), 0, 86400);
      if (pos > 0 || ev.pos === 0) doSeek(pos);
    }
  }

  /* ------------------------------------------------------------------ */
  /* 快照构建与心跳                                                        */
  /* ------------------------------------------------------------------ */
  var truth = {
    playing: false, position: 0, duration: 0,
    songId: 0, title: '', artist: '', album: '', pic: '',
    src: 'element', updatedAt: 0
  };

  function readTruth() {
    var el = getAudio();
    var store = readStore();
    var t = nowMs();

    /* 播放态：元素优先，store 兜底 */
    var playing = null;
    var position = -1;
    var duration = 0;
    if (el) {
      playing = !el.paused && !el.ended;
      position = Number(el.currentTime) || 0;
      duration = Number(el.duration) || 0;
      if (!isFinite(duration) || duration < 0) duration = 0;
    }
    if (playing === null && store.playing !== null) playing = store.playing;
    if (position < 0 && store.position >= 0) position = store.position;
    if (position < 0) position = 0;

    /* 物理自愈：进度在走 = 在播放（事件丢失的终极兜底；<1.2s 窗防暂停微抖） */
    if (playing === false && position - truth.position > 1.2 && t - truth.updatedAt < 4000 &&
      (!truth.songId || !store.song || Number(store.song.songId) === truth.songId)) {
      playing = true;
    }

    /* v7.1.0 元数据阶梯：store → mediaSession → DOM 刮削 → 保持上次真值；
     * 非空字段优先，低阶源只填空缺 */
    var song = store.song;
    var msMeta = song ? null : readMediaSession();
    var domMeta = (song || msMeta) ? null : scrapeBar();
    var metaSrc = song ? 'store' : (msMeta ? 'ms' : (domMeta ? 'dom' : ''));
    function pick(a, b, c) {
      if (a) return a;
      if (b) return b;
      if (c) return c;
      return '';
    }
    var songId = song && song.songId ? song.songId : (truth.songId || 0);
    var title = pick(song && song.title, msMeta && msMeta.title, domMeta && domMeta.title) || truth.title;
    var artist = pick(song && song.artist, msMeta && msMeta.artist, domMeta && domMeta.artist) || truth.artist;
    var album = pick(song && song.album, msMeta && msMeta.album, domMeta && domMeta.album) || truth.album;
    var pic = pick(song && song.pic, msMeta && msMeta.pic, domMeta && domMeta.pic) || truth.pic;
    if (pic && pic.indexOf('?param=') < 0) pic = pic + '?param=500y500';
    if (duration <= 0 && song && song.durationMs > 0) duration = song.durationMs / 1000;

    var changedSong = songId !== truth.songId && !!songId;
    truth.playing = playing === true;
    truth.position = position;
    truth.duration = duration;
    truth.songId = songId || 0;
    truth.title = title || '';
    truth.artist = artist || '';
    truth.album = album || '';
    truth.pic = pic || '';
    truth.src = el ? (metaSrc ? 'element+' + metaSrc : 'element') : (metaSrc || 'none');
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
      smtcVer: smtcInfo.ver || '',
      hubVer: (hub.smtc && hub.smtc.version) || '',
      smtc: {
        ready: smtcInfo.ready === true || (hub.smtc && hub.smtc.host === true && smtcReadyNow === true),
        nativeLoaded: smtcInfo.nativeLoaded === true,
        host: hub.smtc ? hub.smtc.host === true : false
      }
    };
  }

  var smtcReadyNow = false;

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

      /* 2) 拉系统侧事件（媒体键/系统悬浮窗拖动） */
      var evs = await jget('http://127.0.0.1:' + hub.port + '/api/smtc/events', 2000);
      if (Array.isArray(evs)) {
        for (var i = 0; i < evs.length; i++) execSmtcEvent(evs[i]);
      }

      /* 3) 拉页面命令 */
      var cmds = await jget('http://127.0.0.1:' + hub.port + '/api/cmd', 2000);
      if (Array.isArray(cmds)) {
        for (var c = 0; c < cmds.length; c++) execCommand(cmds[c]);
      }

      /* 4) 读真值 */
      readTruth();

      /* 5) 推 SMTC（驱动系统媒体卡片） */
      var st = truth.playing ? 3 : 4; /* MediaPlaybackStatus Playing/Paused */
      var upd = formEnc({
        title: truth.title,
        artist: truth.artist,
        album: truth.album,
        cover: truth.pic,
        status: st,
        pos: Math.round(truth.position * 100) / 100,
        dur: Math.round(truth.duration * 100) / 100
      });
      await spost('http://127.0.0.1:' + hub.port + '/api/smtc/update', upd);

      /* 6) 推状态（页面唯一数据源） */
      var status = await hubStatus();
      smtcReadyNow = !!(status && status.smtcReady === true);
      var blob = buildStateBlob();
      await jpost('http://127.0.0.1:' + hub.port + '/api/state', blob);
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
