/* ============================================================================
 * 「初始」ext-card v8.2.1 —— 内容脚本：悬浮音乐卡（置顶所有网页，三态）
 *
 * v8.2.1 三态律（用户实机反馈重构）：
 *   ① 封面收起态——整个卡片只显示封面；单击 → 标准态；不可拖（拖动窗口
 *      时易误触的封面一律禁拖）；播放中右下角绿点。
 *   ② 标准态——v8.2.0 迷你卡。右上角「×」退役：改为 [收起成封面][放大到
 *      完全体] 按钮组（放大钮在原 × 位，收起钮在其左）；点卡片主体回面板；
 *      点进度条 → 完全体（不再跳转回「初始」）。
 *   ③ 完全体——与「初始」页面音乐卡片同级：逐字/逐行歌词（句尾渐隐/回退
 *      还原/间奏/翻译/暂停淡出全律随行）、时间显示、可 seek 进度条。
 *      歌词数据 = SW 代理 hub /api/lyric（songId 归属强校验，单槽缓存切歌
 *      窗口律与 smtc.ts 同款）。引擎在 ext-lyric.js（build 时拼接在本文件前）。
 *   v8.2.0 既有律保留：closed Shadow DOM / 数据经 SW / 本地插值 / 诚实降级
 *   / 位置持久 / 按站会话级隐藏（入口改为右键卡片）/ 辉光律动。
 * ==========================================================================*/

"use strict";

(function () {
  if (window.__chushiCardMounted) return;
  window.__chushiCardMounted = true;

  var HOST_ID = "chushi-card-host";
  if (document.getElementById(HOST_ID)) return;

  /* ---------- 会话级站点隐藏（storage.session：浏览器重启即还原） ---------- */
  var siteHidden = false;
  function hideKey(hostname) { return "cardHide:" + hostname; }
  function loadHide(done) {
    try {
      chrome.storage.session.get([hideKey(location.hostname)], function (o) {
        siteHidden = !!(o && o[hideKey(location.hostname)]);
        done();
      });
    } catch (e) { done(); }
  }
  function saveHide() {
    try {
      var o = {};
      o[hideKey(location.hostname)] = true;
      chrome.storage.session.set(o);
    } catch (e) { /* 无会话存储则忽略（本次内存态也生效） */ }
  }

  var track = null;      /* 最近真值 {title,artist,album,playing,position,duration,rate,pic,songId,fetchedAt} */
  var lastSpec = { on: false, bass: 0, t: 0 };
  var envBass = 0;
  var mode = "mini";     /* 三态：cover | mini | full（持久） */
  var optP = false, optAt = 0; /* 播放/暂停乐观翻转窗口 */

  /* ---------- UI（closed Shadow DOM：封面态/标准态/完全体三兄弟） ---------- */
  var host = document.createElement("div");
  host.id = HOST_ID;
  host.style.cssText = "all:initial;position:fixed;z-index:2147483647;left:0;top:0;width:0;height:0;display:none";
  var shadow = host.attachShadow({ mode: "closed" });
  shadow.innerHTML =
    '<style>' +
    ':host{all:initial}' +
    '*{margin:0;padding:0;box-sizing:border-box;font-family:ui-sans-serif,system-ui,"PingFang SC","Microsoft YaHei",sans-serif}' +
    '@keyframes cscardin{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:scale(1)}}' +
    '.surf{position:fixed;border-radius:16px;color:#f4f4f5;user-select:none;touch-action:none;' +
    'background:rgba(28,28,32,.92);border:1px solid rgba(255,255,255,.1);' +
    'box-shadow:0 12px 36px rgba(0,0,0,.35);animation:cscardin .24s ease}' +
    '.surf.draggable{cursor:grab}.surf.draggable:active{cursor:grabbing}' +
    'button{font-family:inherit}' +
    /* ---- 封面态 ---- */
    '.cover{width:48px;height:48px;border-radius:13px;overflow:hidden;padding:0;cursor:pointer;' +
    'display:none;position:fixed;border:1px solid rgba(255,255,255,.14);' +
    'background:linear-gradient(135deg,#8b5cf655,#8b5cf622)}' +
    '.cover img{width:100%;height:100%;object-fit:cover;display:block}' +
    '.cdot{position:absolute;right:4px;bottom:4px;width:7px;height:7px;border-radius:999px;' +
    'background:#34d399;box-shadow:0 0 5px #34d399;display:none}' +
    '.cover.on .cdot{display:block}' +
    /* ---- 通用件 ---- */
    '.row{display:flex;align-items:center;gap:10px}' +
    '.cov{position:relative;flex:none;overflow:hidden;border-radius:10px;' +
    'background:linear-gradient(135deg,#8b5cf655,#8b5cf622)}' +
    '.cov img{width:100%;height:100%;object-fit:cover;display:block}' +
    '.glow{position:absolute;inset:-5px;border-radius:14px;background:var(--acc,#8b5cf6);opacity:0;' +
    'filter:blur(9px);pointer-events:none}' +
    '.meta{flex:1;min-width:0}' +
    '.t1{font-size:12.5px;font-weight:560;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.t2{font-size:10.5px;color:#a1a1aa;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.b{appearance:none;border:0;background:transparent;color:#a1a1aa;width:30px;height:30px;flex:none;' +
    'display:flex;align-items:center;justify-content:center;border-radius:999px;cursor:pointer;' +
    'transition:color .25s,background-color .25s}' +
    '.b:hover{background:rgba(255,255,255,.1);color:#fff}' +
    '.b.main{width:34px;height:34px;color:#fff;background:var(--acc,#8b5cf6)}' +
    '.b.main:hover{filter:brightness(1.12);background:var(--acc,#8b5cf6)}' +
    '.b svg,.x svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:2;' +
    'stroke-linecap:round;stroke-linejoin:round}' +
    '.b.main svg{width:16px;height:16px;fill:currentColor;stroke:none}' +
    '.x{appearance:none;position:relative;width:22px;height:22px;border-radius:999px;border:0;flex:none;' +
    'background:transparent;color:#8e8e96;display:flex;align-items:center;justify-content:center;' +
    'cursor:pointer;opacity:.8;transition:opacity .2s,color .2s,background-color .2s}' +
    '.x:hover{opacity:1;color:#fff;background:rgba(255,255,255,.1)}' +
    '.x svg{width:12px;height:12px}' +
    '.cap{position:absolute;right:8px;top:8px;display:flex;gap:2px}' +
    '.rail{height:10px;display:flex;align-items:center;cursor:pointer}' +
    '.rin{width:100%;height:3px;border-radius:2px;background:rgba(255,255,255,.14);overflow:hidden}' +
    '.fill{display:block;height:100%;width:0%;border-radius:2px;background:var(--acc,#8b5cf6)}' +
    /* ---- 标准态 ---- */
    '.card{width:264px;padding:10px 12px 9px;display:none}' +
    '.card .cov{width:44px;height:44px}' +
    '.card .rail{margin-top:9px}' +
    /* ---- 完全体 ---- */
    '.fcard{width:324px;padding:14px 16px 12px;border-radius:18px;display:none}' +
    '.fcard .cov{width:52px;height:52px;border-radius:12px}' +
    '.fcard .t1{font-size:13.5px}.fcard .t2{font-size:11px}' +
    '.ftm{display:flex;justify-content:space-between;font-size:10px;color:#8e8e96;margin-top:5px;font-variant-numeric:tabular-nums}' +
    '.fcard .rail{margin-top:2px}' +
    '.fctl{display:flex;align-items:center;justify-content:center;gap:22px;margin-top:4px}' +
    /* ---- 歌词（与「初始」部件同渲染律：双层实体色 + clip-path 扫光） ---- */
    '.flyr{position:relative;height:118px;margin-top:10px;overflow:hidden;flex:none;' +
    '-webkit-mask-image:linear-gradient(180deg,transparent,#000 16%,#000 84%,transparent)}' +
    '.flyr-in{position:absolute;left:0;right:0;top:0;transition:transform .55s cubic-bezier(.22,1,.36,1),opacity .3s ease;will-change:transform}' +
    '.fln{padding:3px 2px;text-align:center;font-size:13.5px;font-weight:560;line-height:1.45;' +
    'color:#71717a;transition:color .5s ease}' +
    '.fln.on{color:#f4f4f5}' +
    '.fln.done{color:#8e8e96}' +
    '.fln.done .fw{color:#8e8e96}' +
    '.fln.done .fw .ov{opacity:0;transition:opacity .6s ease}' +
    '.fln.gap{font-size:11px;letter-spacing:7px;color:#71717a}' +
    '.fw{position:relative;color:#71717a}' +
    '.fw .ov{position:absolute;left:0;top:0;color:#f4f4f5;pointer-events:none;' +
    'clip-path:inset(-8% calc(100% - var(--p,0%)) -8% 0)}' +
    '.fsub{font-size:10.5px;font-weight:400;color:#a1a1aa;margin-top:2px;display:none;' +
    'white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.fln.on .fsub{display:block}' +
    '.fempty{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;' +
    'font-size:12px;color:#5b5b63;letter-spacing:2px}' +
    '</style>' +
    /* 封面态 */
    '<button class="cover" id="cover" title="单击展开音乐卡"><img id="cpic" alt=""><span class="cdot" id="cdot"></span></button>' +
    /* 标准态 */
    '<div class="surf card" id="card">' +
    '<div class="cap">' +
    '<button class="x" id="miniCover" title="收起成封面"><svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg></button>' +
    '<button class="x" id="miniFull" title="放大到完全体（歌词）"><svg viewBox="0 0 24 24"><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3"/></svg></button>' +
    '</div>' +
    '<div class="row">' +
    '<div class="cov"><span class="glow" id="glow"></span><img id="pic" alt=""></div>' +
    '<div class="meta"><div class="t1" id="t1">—</div><div class="t2" id="t2"></div></div>' +
    '<button class="b" id="prev" title="上一首"><svg viewBox="0 0 24 24"><path d="M19 20L9 12l10-8v16z"/><path d="M6 5.5v13"/></svg></button>' +
    '<button class="b main" id="play" title="播放 / 暂停"><svg id="icPlay" viewBox="0 0 24 24"><path d="M8 4l12 8-12 8V4z"/></svg><svg id="icPause" viewBox="0 0 24 24" style="display:none"><rect x="6.6" y="4.6" width="3.6" height="14.8" rx="1.3"/><rect x="13.8" y="4.6" width="3.6" height="14.8" rx="1.3"/></svg></button>' +
    '<button class="b" id="next" title="下一首"><svg viewBox="0 0 24 24"><path d="M5 4l10 8-10 8V4z"/><path d="M18 5.5v13"/></svg></button>' +
    '</div>' +
    '<div class="rail" id="rail" title="点按查看歌词（完全体）"><span class="rin"><span class="fill" id="fill"></span></span></div>' +
    '</div>' +
    /* 完全体 */
    '<div class="surf fcard" id="fcard">' +
    '<div class="cap">' +
    '<button class="x" id="fullCover" title="收起成封面"><svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg></button>' +
    '<button class="x" id="fullMini" title="缩回标准卡"><svg viewBox="0 0 24 24"><path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3"/></svg></button>' +
    '</div>' +
    '<div class="row">' +
    '<div class="cov"><span class="glow" id="glow2"></span><img id="fpic" alt=""></div>' +
    '<div class="meta"><div class="t1" id="ft1">—</div><div class="t2" id="ft2"></div></div>' +
    '</div>' +
    '<div class="flyr" id="flyr"><div class="fempty" id="fempty">暂无歌词</div><div class="flyr-in" id="flyrIn"></div></div>' +
    '<div class="ftm"><span id="tcur">0:00</span><span id="tdur">--:--</span></div>' +
    '<div class="rail" id="frail" title="点按跳转播放位置"><span class="rin"><span class="fill" id="ffill"></span></span></div>' +
    '<div class="fctl">' +
    '<button class="b" id="fprev" title="上一首"><svg viewBox="0 0 24 24"><path d="M19 20L9 12l10-8v16z"/><path d="M6 5.5v13"/></svg></button>' +
    '<button class="b main" id="fplay" title="播放 / 暂停"><svg id="ficPlay" viewBox="0 0 24 24"><path d="M8 4l12 8-12 8V4z"/></svg><svg id="ficPause" viewBox="0 0 24 24" style="display:none"><rect x="6.6" y="4.6" width="3.6" height="14.8" rx="1.3"/><rect x="13.8" y="4.6" width="3.6" height="14.8" rx="1.3"/></svg></button>' +
    '<button class="b" id="fnext" title="下一首"><svg viewBox="0 0 24 24"><path d="M5 4l10 8-10 8V4z"/><path d="M18 5.5v13"/></svg></button>' +
    '</div>' +
    '</div>';

  (document.body || document.documentElement).appendChild(host);

  function el(id) { return shadow.getElementById(id); }
  var coverEl = el("cover"), cpic = el("cpic"), cdot = el("cdot");
  var card = el("card"), pic = el("pic"), glow = el("glow");
  var fcard = el("fcard"), fpic = el("fpic"), glow2 = el("glow2");
  var t1 = el("t1"), t2 = el("t2"), ft1 = el("ft1"), ft2 = el("ft2");
  var fill = el("fill"), ffill = el("ffill");
  var icPlay = el("icPlay"), icPause = el("icPause");
  var ficPlay = el("ficPlay"), ficPause = el("ficPause");
  var flyrIn = el("flyrIn"), fempty = el("fempty"), tcur = el("tcur"), tdur = el("tdur");

  var SURFS = { cover: coverEl, mini: card, full: fcard };
  var WIDTH = { cover: 48, mini: 264, full: 324 };

  /* ---------- 位置：三态共用，拖动 + 持久 + 按当前态宽度钳制 ---------- */
  var pos = { x: Math.max(12, (window.innerWidth || 1200) - 296), y: 76 };
  function loadPos() {
    try {
      chrome.storage.local.get(["cardPos", "cardMode", "cardPill"], function (o) {
        if (o && o.cardPos && typeof o.cardPos.x === "number") pos = o.cardPos;
        /* v8.2.1 迁移：旧「药丸收起」用户 → 封面态（药丸已退役） */
        if (o && o.cardMode && SURFS[o.cardMode]) mode = o.cardMode;
        else if (o && o.cardPill) mode = "cover";
        applyPos(); applyMode();
      });
    } catch (e) { applyPos(); applyMode(); }
  }
  function savePos() {
    try { chrome.storage.local.set({ cardPos: pos, cardMode: mode }); } catch (e) { /* 隐私模式等 */ }
  }
  function clampPos() {
    var w = window.innerWidth || 1200, h = window.innerHeight || 800;
    var mw = WIDTH[mode] || 264;
    pos.x = Math.min(Math.max(8, pos.x), Math.max(8, w - mw - 8));
    pos.y = Math.min(Math.max(8, pos.y), h - 56);
  }
  function applyPos() {
    clampPos();
    for (var k in SURFS) {
      SURFS[k].style.left = pos.x + "px";
      SURFS[k].style.top = pos.y + "px";
    }
  }

  /* ---------- 三态切换 ---------- */
  function applyMode() {
    for (var k in SURFS) SURFS[k].style.display = k === mode ? "block" : "none";
    applyPos(); applyVis(); applyDraggable();
  }
  function setMode(m) {
    if (!SURFS[m] || m === mode) return;
    mode = m; savePos(); applyMode();
  }
  function applyDraggable() {
    card.classList.toggle("draggable", mode === "mini");
    fcard.classList.toggle("draggable", mode === "full");
  }

  /* ---------- 拖动 / 点击 ----------
     把手 = 卡片主体空白（meta 区 + padding）；封面、按钮、进度条、歌词区
     一律不启动拖动（用户律：拖动窗口时封面易误触——封面纯点击目标）。 */
  var drag = { on: 0, moved: 0, px: 0, py: 0, ox: 0, oy: 0, surf: null };
  function dragHandleOK(e) {
    if (e.button !== undefined && e.button !== 0) return false;
    if (mode === "cover") return false; /* 封面态整卡=封面，不可拖 */
    var t = e.target;
    if (t.closest && t.closest("button, .cov, .rail, .flyr")) return false;
    return true;
  }
  function onDown(e) {
    if (!dragHandleOK(e)) return;
    drag.on = 1; drag.moved = 0;
    drag.px = e.clientX; drag.py = e.clientY;
    drag.ox = pos.x; drag.oy = pos.y;
    drag.surf = e.currentTarget;
    try { drag.surf.setPointerCapture(e.pointerId); } catch (e1) { /* 已释放 */ }
  }
  function onMove(e) {
    if (!drag.on) return;
    var dx = e.clientX - drag.px, dy = e.clientY - drag.py;
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = 1;
    if (drag.moved) {
      pos.x = drag.ox + dx; pos.y = drag.oy + dy;
      applyPos();
    }
  }
  function onUp() {
    if (drag.on && drag.moved) savePos();
    drag.on = 0;
  }
  card.addEventListener("pointerdown", onDown);
  card.addEventListener("pointermove", onMove);
  card.addEventListener("pointerup", onUp);
  card.addEventListener("pointercancel", function () { drag.on = 0; });
  fcard.addEventListener("pointerdown", onDown);
  fcard.addEventListener("pointermove", onMove);
  fcard.addEventListener("pointerup", onUp);
  fcard.addEventListener("pointercancel", function () { drag.on = 0; });
  /* 标准态点主体（非按钮）回面板；完全体点主体无操作（面板级本身） */
  card.addEventListener("click", function (e) {
    if (e.target.closest && e.target.closest("button, .rail")) return;
    openPanel();
  });

  /* ---------- SW 通道（断线重连 + 保活） ---------- */
  var port = null;
  var cmdSeq = 0;
  var pingTimer = null;

  function connect() {
    if (port) return;
    try {
      port = chrome.runtime.connect({ name: "chushi-card" });
    } catch (e) {
      port = null; /* 扩展上下文失效（更新中） */
      return;
    }
    port.onMessage.addListener(onMsg);
    port.onDisconnect.addListener(function () {
      port = null;
      setTimeout(function () { if (!port) connect(); }, 1200);
    });
    if (!pingTimer) {
      pingTimer = setInterval(function () {
        if (document.visibilityState !== "visible") return;
        try { if (port) port.postMessage({ type: "ping" }); } catch (e) { /* 断线事件接管 */ }
      }, 10000);
    }
    /* 订阅频谱（卡片辉光律动） */
    try { port.postMessage({ type: "spec", on: true }); } catch (e) { /* 同上 */ }
  }

  function send(cmd, position) {
    return new Promise(function (resolve) {
      if (!port) { resolve(false); return; }
      var id = ++cmdSeq;
      try {
        port.postMessage({ type: "cmd", cmd: cmd, position: position, id: id });
        port.__cmdResolve = port.__cmdResolve || {};
        port.__cmdResolve[id] = function (ok) { resolve(ok === true); };
        setTimeout(function () {
          if (port && port.__cmdResolve && port.__cmdResolve[id]) {
            delete port.__cmdResolve[id]; resolve(false);
          }
        }, 4000);
      } catch (e) { resolve(false); }
    });
  }

  function openPanel() {
    try { if (port) port.postMessage({ type: "openPanel" }); } catch (e) { /* 断线 */ }
  }

  function onMsg(m) {
    if (!m || typeof m !== "object") return;
    if (m.type === "state") {
      track = m.track && typeof m.track === "object" ? m.track : null;
      if (track) track.fetchedAt = m.at || Date.now();
      renderStatic();
      host.style.display = "block";
      applyVis();
      lyricTick(); /* 切歌检测（want 变化时内部自重建） */
    } else if (m.type === "spec") {
      lastSpec = { on: m.on === true, bass: Number(m.bass) || 0, t: Date.now() };
    } else if (m.type === "cmdOk" && m.id) {
      var r = port && port.__cmdResolve && port.__cmdResolve[m.id];
      if (r) { delete port.__cmdResolve[m.id]; r(m.ok); }
    } else if (m.type === "lyric") {
      onLyricMsg(m);
    }
  }

  /* ---------- 渲染 ---------- */
  function renderStatic() {
    if (!track) return;
    t1.textContent = track.title || "—";
    t2.textContent = track.artist || "";
    ft1.textContent = track.title || "—";
    ft2.textContent = track.artist || "";
    var src = track.pic || "";
    if (src) {
      if (pic.getAttribute("src") !== src) pic.setAttribute("src", src);
      if (fpic.getAttribute("src") !== src) fpic.setAttribute("src", src);
      if (cpic.getAttribute("src") !== src) cpic.setAttribute("src", src);
    }
    applyVis();
  }

  function effPlaying() {
    if (optAt && Date.now() - optAt < 2500) return optP;
    return !!(track && track.playing);
  }

  function applyVis() {
    var has = !!track;
    coverEl.classList.toggle("on", effPlaying());
    icPlay.style.display = effPlaying() ? "none" : "block";
    icPause.style.display = effPlaying() ? "block" : "none";
    ficPlay.style.display = effPlaying() ? "none" : "block";
    ficPause.style.display = effPlaying() ? "block" : "none";
    if (has && host.style.display !== "block") host.style.display = "block";
  }

  function posNow() {
    if (!track) return 0;
    var rate = track.rate > 0 ? track.rate : 1;
    var p = track.position + (track.playing ? ((Date.now() - track.fetchedAt) / 1000) * rate : 0);
    if (track.duration > 0) return Math.min(track.duration, Math.max(0, p));
    return Math.max(0, p);
  }

  function fmt(s) {
    s = Math.floor(s || 0);
    var m = Math.floor(s / 60), r = s % 60;
    return m + ":" + (r < 10 ? "0" : "") + r;
  }

  /* ---------- 歌词：请求（SW 代理）+ 归属强校验 + 有限重试 ---------- */
  var ly = { want: "", tries: 0, done: "", busy: false, raw: null, parsed: null };
  function lyricTick() {
    if (!track) return;
    var want = track.songId ? String(track.songId) : (track.title ? "t:" + track.title : "");
    if (want !== ly.want) {
      ly.want = want; ly.tries = 0; ly.done = ""; ly.busy = false;
      ly.raw = null; ly.parsed = null;
      buildLyricDom();
    }
    if (!want || ly.busy || ly.done === want) return;
    ly.busy = true;
    try {
      port.postMessage({ type: "lyric", songId: track.songId ? String(track.songId) : "", title: track.title || "", key: want });
    } catch (e) { ly.busy = false; return; }
    /* 4s 无回包：释放 BUSY 位 + 走统一重试律（2.5s 间隔，防打爆） */
    setTimeout(function () { if (ly.busy) { ly.busy = false; lyRetry(); } }, 4000);
  }
  function onLyricMsg(m) {
    ly.busy = false;
    var want = ly.want;
    if (!want || m.key !== want) return; /* 曲目已切走（latest-wins） */
    if (m.ok && m.lyric && typeof m.lyric === "object" &&
        (String(m.lyric.yrc || "").trim() || String(m.lyric.lrc || "").trim())) {
      /* 归属强校验：hub /api/lyric 是单槽缓存，切歌窗口内返回的必然是
         上一首歌词——songId 不符一律视为未就绪（smtc.ts 同款最终防线） */
      var wantId = /^(\d+)$/.test(want) ? Number(want) : 0;
      var gotId = Number(m.lyric.songId) || 0;
      if (wantId && gotId && gotId !== wantId) { lyRetry(); return; }
      ly.done = want;
      ly.tries = 0;
      ly.raw = m.lyric;
      ly.parsed = ChuShiLyric.parse(m.lyric);
      buildLyricDom();
    } else {
      lyRetry();
    }
  }
  function lyRetry() {
    ly.tries++;
    if (ly.tries <= 5) {
      setTimeout(function () { if (ly.want && ly.done !== ly.want) lyricTick(); }, 2500);
    } else {
      ly.done = ly.want; /* 有限重试耗尽：本轮放弃（切歌重来） */
      buildLyricDom();
    }
  }

  /* ---------- 歌词 DOM 构建（歌词键 + 解析对象双判定才重建） ---------- */
  var lineEls = [];      /* [{el, words, sung, clean}] */
  var activeLine = -2;
  var sungAt = 0;        /* 扫光到 100% 的时刻（句尾渐隐宽限起点） */
  var lyMode = 0;        /* 1=逐字扫光（真 yrc）；0=逐行高亮 */
  var prevLyrPlaying = null;
  function buildLyricDom() {
    var p = ly.parsed;
    lineEls = []; activeLine = -2; sungAt = 0; prevLyrPlaying = null;
    flyrIn.innerHTML = "";
    if (!p || !p.lines || !p.lines.length) {
      fempty.style.display = "flex";
      lyMode = 0;
      return;
    }
    fempty.style.display = "none";
    /* 浮窗判定律：真逐字（yrc）恒逐字；lrc 逐行（强行逐字是面板专属开关，
       浮窗不设——用户定义的完全体功能集 = 逐字 + 逐行两种都要在） */
    lyMode = p.src === "yrc" ? 1 : 0;
    for (var i = 0; i < p.lines.length; i++) {
      var ln = p.lines[i];
      var row = document.createElement("div");
      row.className = "fln";
      var words = [];
      if (lyMode === 1 && ln.w && ln.w.length) {
        for (var w = 0; w < ln.w.length; w++) {
          var sp = document.createElement("span");
          sp.className = "fw";
          sp.appendChild(document.createTextNode(ln.w[w].t));
          var ov = document.createElement("span");
          ov.className = "ov";
          ov.appendChild(document.createTextNode(ln.w[w].t));
          sp.appendChild(ov);
          row.appendChild(sp);
          words.push({ ov: ov });
        }
      } else {
        row.textContent = ln.t || "·";
      }
      if (!ln.t) row.classList.add("gap");
      if (ln.tr) {
        var sub = document.createElement("div");
        sub.className = "fsub";
        sub.textContent = ln.tr;
        row.appendChild(sub);
      }
      flyrIn.appendChild(row);
      lineEls.push({ el: row, words: words, sung: false, clean: true });
    }
  }

  /* ---------- 逐帧歌词渲染：行切换 + 当前词扫色 + 句尾渐隐 + 暂停淡出 ----------
     与「初始」部件 lyricFrame 同律：
     · 行离场渐隐（done 定格 100%，.ov opacity .6s 渐隐 + 行色渐灰）
     · 回退/间奏 ref 修正（宿主 lastLine 已唱界）+ 未来行无条件还原未唱态
     · 句尾渐隐 250ms 宽限；行内回退重扫撤销 done */
  function lyricFrame() {
    if (!lineEls.length || !ly.parsed) return;
    var ms = posNow() * 1000;
    var n = ChuShiLyric.align(ly.parsed, ms);
    if (n.lineIndex !== activeLine) {
      var prev = activeLine;
      activeLine = n.lineIndex;
      sungAt = 0;
      var ref = activeLine >= 0 ? activeLine
        : (typeof n.lastLine === "number" && n.lastLine >= 0 ? n.lastLine : (prev >= 0 ? prev : -1));
      for (var i = 0; i < lineEls.length; i++) {
        var on = i === activeLine;
        var was = lineEls[i].el.classList.contains("done");
        var done = ref >= 0 && i <= ref && !on;
        lineEls[i].el.classList.toggle("on", on);
        lineEls[i].el.classList.toggle("done", done);
        if (on) {
          lineEls[i].sung = true;
          lineEls[i].clean = false; /* 重新扫光：清定格标记 */
          continue;
        }
        if (done) {
          if (!was) {
            if (lineEls[i].sung) { finalizeLine(i); lineEls[i].clean = true; }
            else { restoreLine(i); lineEls[i].clean = true; }
          }
        } else {
          /* 未来行无条件还原未唱态（扫光残留/间奏误标一并清除） */
          if (!lineEls[i].clean) { restoreLine(i); lineEls[i].clean = true; }
          lineEls[i].sung = false;
        }
      }
      if (activeLine >= 0 && activeLine < lineEls.length) {
        var elc = lineEls[activeLine].el;
        var target = (flyrIn.parentNode.clientHeight - elc.offsetHeight) / 2 - elc.offsetTop;
        flyrIn.style.transform = "translateY(" + target + "px)";
      }
    }
    if (lyMode === 1 && activeLine >= 0 && activeLine < lineEls.length) {
      var ws = lineEls[activeLine].words;
      var last = n.wordIndex >= 0 && n.wordIndex >= ws.length - 1 && n.wordProgress >= 1;
      if (last && !sungAt) {
        sungAt = Date.now();
      } else if (last && sungAt && Date.now() - sungAt >= 250 &&
        !lineEls[activeLine].el.classList.contains("done")) {
        lineEls[activeLine].el.classList.add("done");
        finalizeLine(activeLine);
        lineEls[activeLine].clean = true;
      } else if (!last) {
        sungAt = 0;
        var cel = lineEls[activeLine].el;
        if (cel.classList.contains("done")) {
          cel.classList.remove("done");
          restoreLine(activeLine);
          lineEls[activeLine].clean = false;
        }
      }
      for (var j = 0; j < ws.length; j++) {
        var pp = j < n.wordIndex ? 1 : j > n.wordIndex ? 0 : (n.wordIndex >= 0 ? n.wordProgress : 0);
        ws[j].ov.style.setProperty("--p", (pp * 100).toFixed(1) + "%");
      }
    }
    var playing = effPlaying();
    if (prevLyrPlaying !== playing) {
      prevLyrPlaying = playing;
      flyrIn.style.opacity = playing ? "1" : "0.38";
    }
  }
  function finalizeLine(idx) {
    var ws = lineEls[idx].words;
    for (var j = 0; j < ws.length; j++) ws[j].ov.style.setProperty("--p", "100%");
  }
  function restoreLine(idx) {
    var ws = lineEls[idx].words;
    for (var j = 0; j < ws.length; j++) ws[j].ov.style.setProperty("--p", "0%");
  }

  /* ---------- 交互绑定 ---------- */
  function bindPlay(btn) {
    el(btn).addEventListener("click", function () {
      var cur = effPlaying();
      optP = !cur; optAt = Date.now();
      applyVis();
      send("toggle", undefined);
    });
  }
  bindPlay("play"); bindPlay("fplay");
  el("prev").addEventListener("click", function () { send("prev", undefined); });
  el("next").addEventListener("click", function () { send("next", undefined); });
  el("fprev").addEventListener("click", function () { send("prev", undefined); });
  el("fnext").addEventListener("click", function () { send("next", undefined); });
  el("miniCover").addEventListener("click", function () { setMode("cover"); });
  el("miniFull").addEventListener("click", function () { setMode("full"); });
  el("fullCover").addEventListener("click", function () { setMode("cover"); });
  el("fullMini").addEventListener("click", function () { setMode("mini"); });
  coverEl.addEventListener("click", function () { setMode("mini"); });
  /* 标准态进度条：点按 → 完全体（不跳回「初始」）；完全体进度条：点按 → seek */
  el("rail").addEventListener("click", function (e) {
    e.stopPropagation();
    setMode("full");
  });
  el("frail").addEventListener("click", function (e) {
    e.stopPropagation();
    if (!track || !(track.duration > 0)) return;
    var rect = el("frail").getBoundingClientRect();
    var r = (e.clientX - rect.left) / Math.max(1, rect.width);
    r = Math.min(1, Math.max(0, r));
    send("seek", Math.round(r * track.duration));
  });
  /* 右键 = 在本站隐藏（浏览器会话级，重启还原；v8.2.0 × 按钮位让位放大钮） */
  host.addEventListener("contextmenu", function (e) {
    e.preventDefault(); e.stopPropagation();
    siteHidden = true; saveHide();
    host.style.display = "none";
  });
  window.addEventListener("resize", applyPos);

  /* ---------- rAF 主循环：进度插值 + 完全体歌词帧 + 辉光律动 ---------- */
  var lastFillW = "";
  function loop() {
    if (track) {
      var dur = track.duration || 0;
      var pr = dur > 0 ? Math.min(1, posNow() / dur) : 0;
      var w = (pr * 100).toFixed(2) + "%";
      if (w !== lastFillW) {
        lastFillW = w;
        fill.style.width = w;
        ffill.style.width = w;
      }
      if (mode === "full") {
        tcur.textContent = fmt(posNow());
        tdur.textContent = dur > 0 ? fmt(dur) : "--:--";
        lyricFrame();
      }
    }
    var tgt = lastSpec.on && effPlaying() ? lastSpec.bass : 0;
    envBass += (tgt - envBass) * (tgt > envBass ? 0.55 : 0.14);
    if (envBass < 0.005) envBass = 0;
    var gOp = envBass > 0.012 ? (0.2 + envBass * 0.3).toFixed(3) : "0";
    if (glow.style.opacity !== gOp) { glow.style.opacity = gOp; glow2.style.opacity = gOp; }
    /* 播放态图标真值回收（乐观窗口到期后与真值对齐） */
    if (optAt && Date.now() - optAt >= 2500) { optAt = 0; applyVis(); }
    requestAnimationFrame(loop);
  }

  /* ---------- 启动 ---------- */
  loadHide(function () {
    if (siteHidden) return; /* 本站隐藏：不挂载 UI（SW 连接也省了） */
    loadPos();
    connect();
    applyPos();
    applyMode();
    requestAnimationFrame(loop);
  });
})();
