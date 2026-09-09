/* ============================================================================
 * 「初始」ext-card v8.2.0 —— 内容脚本：悬浮迷你音乐卡（置顶所有网页）
 *
 * 想法一落地件。架构律：
 *   1. closed Shadow DOM——样式零冲突、页面摸不进；宿主页零依赖零污染
 *      （vanilla JS，无框架，单挂载节点 all:initial）。
 *   2. 数据经 background SW（chrome.runtime Port "chushi-card"）——内容脚本
 *      不直连 127.0.0.1（私网访问策略）；SW 休眠由 10s ping 保活 + 断线重连。
 *   3. 位置真值本地插值（锚点 position@fetchedAt + rate×Δt，与页面端
 *      smtcPositionNow 同公式）——SW 1s 真值轮询也丝滑。
 *   4. 诚实降级：无真值（hub 不在/网易云不在）→ 卡片整体隐没，绝不伪造。
 *   5. 交互律：拖动（<5px 视为点击 → 打开面板）；收起成药丸（持久）；
 *      在本站隐藏（浏览器会话级，重启即回——绝不给用户死路）。
 *   6. 律动：封面辉光跟随 bass（与面板同一包络参数，快攻慢放）。
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

  var track = null;      /* 最近真值 {title,artist,album,playing,position,duration,rate,pic,fetchedAt} */
  var lastSpec = { on: false, bass: 0, t: 0 };
  var envBass = 0;
  var pill = false;      /* 收起态（持久） */
  var optP = false, optAt = 0; /* 播放/暂停乐观翻转窗口 */

  /* ---------- UI（closed Shadow DOM） ---------- */
  var host = document.createElement("div");
  host.id = HOST_ID;
  host.style.cssText = "all:initial;position:fixed;z-index:2147483647;left:0;top:0;width:0;height:0;display:none";
  var shadow = host.attachShadow({ mode: "closed" });
  shadow.innerHTML =
    '<style>' +
    ':host{all:initial}' +
    '*{margin:0;padding:0;box-sizing:border-box;font-family:ui-sans-serif,system-ui,"PingFang SC","Microsoft YaHei",sans-serif}' +
    '.card{position:fixed;width:264px;border-radius:16px;padding:10px 12px 9px;cursor:grab;' +
    'background:rgba(28,28,32,.92);color:#f4f4f5;border:1px solid rgba(255,255,255,.1);' +
    'box-shadow:0 12px 36px rgba(0,0,0,.35);user-select:none;touch-action:none}' +
    '.card:active{cursor:grabbing}' +
    '.row{display:flex;align-items:center;gap:10px}' +
    '.cov{position:relative;width:44px;height:44px;border-radius:10px;flex:none;overflow:hidden;' +
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
    '.x{position:absolute;right:8px;top:8px;width:20px;height:20px;border-radius:999px;border:0;' +
    'background:transparent;color:#71717a;display:flex;align-items:center;justify-content:center;' +
    'cursor:pointer;opacity:.7;transition:opacity .2s,color .2s}' +
    '.x:hover{opacity:1;color:#fff}' +
    '.x svg{width:11px;height:11px}' +
    '.rail{margin-top:9px;height:10px;display:flex;align-items:center;cursor:pointer}' +
    '.rin{width:100%;height:3px;border-radius:2px;background:rgba(255,255,255,.14);overflow:hidden}' +
    '.fill{display:block;height:100%;width:0%;border-radius:2px;background:var(--acc,#8b5cf6)}' +
    '.pill{position:fixed;width:44px;height:44px;border-radius:999px;overflow:hidden;cursor:pointer;' +
    'border:1px solid rgba(255,255,255,.14);box-shadow:0 8px 24px rgba(0,0,0,.4);' +
    'background:rgba(28,28,32,.92)}' +
    '.pill img{width:100%;height:100%;object-fit:cover;display:block}' +
    '.dot{position:absolute;right:3px;bottom:3px;width:7px;height:7px;border-radius:999px;' +
    'background:#34d399;box-shadow:0 0 5px #34d399;display:none}' +
    '.pill.on .dot{display:block}' +
    '.pill{display:none}' +
    '.card.hide,.pill.on.show{display:none}' +
    '</style>' +
    '<div class="card" id="card">' +
    '<div class="row">' +
    '<div class="cov"><span class="glow" id="glow"></span><img id="pic" alt=""></div>' +
    '<div class="meta"><div class="t1" id="t1">—</div><div class="t2" id="t2"></div></div>' +
    '<button class="b" id="prev" title="上一首"><svg viewBox="0 0 24 24"><path d="M19 20L9 12l10-8v16z"/><path d="M6 5.5v13"/></svg></button>' +
    '<button class="b main" id="play" title="播放 / 暂停"><svg id="icPlay" viewBox="0 0 24 24"><path d="M8 4l12 8-12 8V4z"/></svg><svg id="icPause" viewBox="0 0 24 24" style="display:none"><rect x="6.6" y="4.6" width="3.6" height="14.8" rx="1.3"/><rect x="13.8" y="4.6" width="3.6" height="14.8" rx="1.3"/></svg></button>' +
    '<button class="b" id="next" title="下一首"><svg viewBox="0 0 24 24"><path d="M5 4l10 8-10 8V4z"/><path d="M18 5.5v13"/></svg></button>' +
    '</div>' +
    '<div class="rail" id="rail"><span class="rin"><span class="fill" id="fill"></span></span></div>' +
    '<button class="x" id="hide" title="在本站隐藏（重启浏览器还原）"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>' +
    '</div>' +
    '<div class="pill" id="pill"><img id="ppic" alt=""><span class="dot" id="pdot"></span></div>';

  (document.body || document.documentElement).appendChild(host);

  var card = shadow.getElementById("card");
  var pillEl = shadow.getElementById("pill");
  var pic = shadow.getElementById("pic");
  var ppic = shadow.getElementById("ppic");
  var glow = shadow.getElementById("glow");
  var t1 = shadow.getElementById("t1");
  var t2 = shadow.getElementById("t2");
  var fill = shadow.getElementById("fill");
  var icPlay = shadow.getElementById("icPlay");
  var icPause = shadow.getElementById("icPause");

  /* ---------- 位置：拖动 + 持久 + 视口钳制 ---------- */
  var pos = { x: Math.max(12, (window.innerWidth || 1200) - 296), y: 76 };
  var posDirty = false;
  function loadPos() {
    try {
      chrome.storage.local.get(["cardPos", "cardPill"], function (o) {
        if (o && o.cardPos && typeof o.cardPos.x === "number") pos = o.cardPos;
        if (o && o.cardPill) pill = true;
        applyPos();
        applyPill();
      });
    } catch (e) { applyPos(); applyPill(); }
  }
  function savePos() {
    try { chrome.storage.local.set({ cardPos: pos, cardPill: pill }); } catch (e) { /* 隐私模式等 */ }
  }
  function clampPos() {
    var w = window.innerWidth || 1200, h = window.innerHeight || 800;
    pos.x = Math.min(Math.max(8, pos.x), w - 60);
    pos.y = Math.min(Math.max(8, pos.y), h - 60);
  }
  function applyPos() {
    clampPos();
    card.style.left = pos.x + "px";
    card.style.top = pos.y + "px";
    pillEl.style.left = pos.x + "px";
    pillEl.style.top = pos.y + "px";
  }

  /* ---------- 拖动 / 点击（<5px = 点击 → 打开面板） ---------- */
  var drag = { on: 0, moved: 0, px: 0, py: 0, ox: 0, oy: 0 };
  card.addEventListener("pointerdown", function (e) {
    if (e.target.closest && e.target.closest("button")) return;
    drag.on = 1; drag.moved = 0;
    drag.px = e.clientX; drag.py = e.clientY;
    drag.ox = pos.x; drag.oy = pos.y;
    try { card.setPointerCapture(e.pointerId); } catch (e1) { /* 已释放 */ }
  });
  card.addEventListener("pointermove", function (e) {
    if (!drag.on) return;
    var dx = e.clientX - drag.px, dy = e.clientY - drag.py;
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = 1;
    if (drag.moved) {
      pos.x = drag.ox + dx; pos.y = drag.oy + dy;
      applyPos();
    }
  });
  card.addEventListener("pointerup", function () {
    if (drag.on && !drag.moved) openPanel();
    if (drag.on && drag.moved) { posDirty = true; savePos(); }
    drag.on = 0;
  });
  card.addEventListener("pointercancel", function () { drag.on = 0; });

  /* ---------- SW 通道（断线重连 + 保活） ---------- */
  var port = null;
  var cmdSeq = 0;
  var cmdWait = {};   /* id → {resolve 超时兜底} */
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
      cmdWait[id] = setTimeout(function () { delete cmdWait[id]; resolve(false); }, 4000);
      try {
        port.postMessage({ type: "cmd", cmd: cmd, position: position, id: id });
        port.__cmdResolve = port.__cmdResolve || {};
        port.__cmdResolve[id] = function (ok) {
          if (cmdWait[id]) { clearTimeout(cmdWait[id]); delete cmdWait[id]; }
          resolve(ok === true);
        };
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
    } else if (m.type === "spec") {
      lastSpec = { on: m.on === true, bass: Number(m.bass) || 0, t: Date.now() };
    } else if (m.type === "cmdOk" && m.id) {
      var r = port && port.__cmdResolve && port.__cmdResolve[m.id];
      if (r) { delete port.__cmdResolve[m.id]; r(m.ok); }
    }
  }

  /* ---------- 渲染 ---------- */
  function renderStatic() {
    if (!track) return;
    t1.textContent = track.title || "—";
    t2.textContent = track.artist || "";
    var src = track.pic || "";
    if (src && pic.getAttribute("src") !== src) {
      pic.setAttribute("src", src);
      ppic.setAttribute("src", src);
    }
    applyVis();
  }

  function effPlaying() {
    if (optAt && Date.now() - optAt < 2500) return optP;
    return !!(track && track.playing);
  }

  function applyVis() {
    var has = !!track;
    card.classList.toggle("hide", !has || pill);
    pillEl.classList.toggle("show", has && pill);
    pillEl.classList.toggle("on", effPlaying());
    icPlay.style.display = effPlaying() ? "none" : "block";
    icPause.style.display = effPlaying() ? "block" : "none";
  }

  function posNow() {
    if (!track) return 0;
    var rate = track.rate > 0 ? track.rate : 1;
    var p = track.position + (track.playing ? ((Date.now() - track.fetchedAt) / 1000) * rate : 0);
    if (track.duration > 0) return Math.min(track.duration, Math.max(0, p));
    return Math.max(0, p);
  }

  /* ---------- 交互 ---------- */
  shadow.getElementById("play").addEventListener("click", function () {
    var cur = effPlaying();
    optP = !cur; optAt = Date.now();
    applyVis();
    send("toggle", undefined).then(function () { void 0; });
  });
  shadow.getElementById("prev").addEventListener("click", function () { send("prev", undefined); });
  shadow.getElementById("next").addEventListener("click", function () { send("next", undefined); });
  shadow.getElementById("hide").addEventListener("click", function (e) {
    e.stopPropagation();
    siteHidden = true;
    saveHide();
    host.style.display = "none";
  });
  pillEl.addEventListener("click", function () { openPanel(); });
  pillEl.addEventListener("dblclick", function () {
    pill = false; savePos(); applyPill(); applyVis();
  });
  window.addEventListener("resize", applyPos);

  function applyPill() { applyVis(); }

  /* ---------- rAF 主循环：进度插值 + 辉光律动（快攻慢放，与面板同参） ---------- */
  function loop() {
    if (track) {
      var dur = track.duration || 0;
      var pr = dur > 0 ? Math.min(1, posNow() / dur) : 0;
      fill.style.width = (pr * 100).toFixed(2) + "%";
    }
    var tgt = lastSpec.on && effPlaying() ? lastSpec.bass : 0;
    envBass += (tgt - envBass) * (tgt > envBass ? 0.55 : 0.14);
    if (envBass < 0.005) envBass = 0;
    if (envBass > 0.012) {
      glow.style.opacity = (0.2 + envBass * 0.3).toFixed(3);
    } else {
      glow.style.opacity = "0";
    }
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
    applyVis();
    requestAnimationFrame(loop);
  });
})();
