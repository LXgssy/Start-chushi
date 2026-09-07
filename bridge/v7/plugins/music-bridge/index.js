/* ============================================================================
 * ChuShi Music Bridge 7.0.0 — 网易云 API 桥（第七代全新实现，纯 JS）
 *
 * 架构律（v7 宪法）：
 *   1. 零 Node——BetterNCM v2 是 CEF 渲染环境，没有 require/Node；
 *      本文件全部能力来自页面 JS（audio 元素、window 事件、fetch、localStorage）。
 *   2. 只读律——对网易云内部状态只读不写；唯一写点是 audio.currentTime
 *      的 seek 单次写入。绝不 dispatch 到 dva store，绝不干扰本体播放器。
 *   3. 单次执行律——每条控制命令只执行一次：play/pause=元素方法，
 *      next/prev=网易云自家可见按钮点击，seek=currentTime 单写+双读回校验，
 *      读回失败以 seekAck 诚实上报，绝不静默假装成功。
 *   4. 枢纽客户位——原生 DLL（ChuShi SMTC Manager）的 HTTP 枢纽
 *      （127.0.0.1:26901/26902/26903）是唯一对外通道：
 *        · 拉命令  GET  /api/cmd           （页面控制，排空）
 *        · 拉事件  GET  /api/smtc/events   （媒体键/系统拖动，排空）
 *        · 推状态  POST /api/state         （1Hz，页面唯一数据源）
 *        · 推SMTC  POST /api/smtc/update   （1Hz，表单编码，驱动系统卡片）
 *        · 推歌词  POST /api/lyric         （歌词源插件产物中继）
 *   5. 诚实降级——任一环节失败都在状态里如实标注，绝不假装在线。
 * ==========================================================================*/
(function () {
  'use strict';
  if (window.__chushiMusicBridge) return;

  var VER = '7.0.0';
  var HUB_NAME = 'chushi-smtc-hub';
  var HUB_PORTS = [26901, 26902, 26903];
  var BEAT_MS = 1000;
  var EVT_STALE_MS = 8000;

  window.__chushiMusicBridge = { ver: VER };

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
  /* 真值源二：dva store 只读探针（webpack 模块缓存扫描）                    */
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
      var store = findDvaStore(false);
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
      if (!el) return;
      var wantPlay = type === 'play' ? true : type === 'pause' ? false : !!el.paused;
      try {
        if (wantPlay && el.paused) el.play();
        else if (!wantPlay && !el.paused) el.pause();
      } catch (e) { /* 元素异常 */ }
    } else if (type === 'next' || type === 'prev') {
      clickTransport(type === 'next' ? 'next' : 'prev');
    } else if (type === 'seek') {
      var pos = clampNum(Number(cmd.position), 0, 86400);
      doSeek(pos);
    }
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
          try { if (b === 'play' && el.paused) el.play(); else if (b === 'pause' && !el.paused) el.pause(); } catch (e) { }
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

    /* 元数据：store 优先 */
    var song = store.song;
    var songId = song && song.songId ? song.songId : (truth.songId || 0);
    var title = song ? song.title : truth.title;
    var artist = song ? song.artist : truth.artist;
    var album = song ? song.album : truth.album;
    var pic = song && song.pic ? song.pic : truth.pic;
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
    truth.src = el ? (store.song ? 'element+store' : 'element') : (store.song ? 'store' : 'none');
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
