/* ============================================================================
 * 「初始」资源嗅探全局浮窗 sniffer-float v1（v8.7.52）
 * ----------------------------------------------------------------------------
 * 数据面：ext-bg.js（SW）注册 webRequest 监听 → 按标签页归集可下载资源
 *   （chrome.storage.session 持久，SW 复活后重建）→ tabs.sendMessage 推送
 *   到本内容脚本。本脚本只做三件事：圆形浮球、资源面板、发现提示（toast）。
 * 消息面（runtime/tabs sendMessage，type 判别，其它脚本的陌生消息静默忽略）：
 *   浮球 → SW：{type:"sniffer-ask"}                  初挂载拉全量状态
 *              {type:"sniffer-clear"}                清空本标签页资源
 *              {type:"sniffer-download",url,filename} SW 代理 chrome.downloads
 *   SW → 浮球：{type:"sniffer-new",items}             新资源（全量列表随行）
 *              {type:"sniffer-off"}                  开关已关 → 自毁
 * 兜底：chrome.storage.onChanged 直接盯 snifferOn（SW 短暂离线也不漏关）。
 * UI 律：
 *   · 全部进 closed ShadowRoot——页面 CSS/主题永远摸不到浮窗；
 *   · 浮球可拖拽（pointer 事件，>4px 算拖），落点持久化 localStorage
 *     （按 origin 天然分域）；点击展开面板；
 *   · 计数徽标 + 首次发现 toast（3.5s 自散）；
 *   · z-index 恒顶（2147483647），不注册任何全局点击拦截，页面零打扰。
 * 幂等律：isolated world 顶层守卫 __chushiSnifferMounted 防重复注入
 *   （manifest 注入 + SW 补针双路径同世界共存）。
 * ==========================================================================*/
(function () {
  "use strict";
  if (window.__chushiSnifferMounted) return;
  window.__chushiSnifferMounted = true;

  var POS_KEY = "chushi-sniffer-pos";
  var TYPE_META = {
    video:  { label: "V", color: "#ef4444", name: "视频" },
    audio:  { label: "A", color: "#f59e0b", name: "音频" },
    image:  { label: "I", color: "#10b981", name: "图片" },
    pdf:    { label: "P", color: "#8b5cf6", name: "PDF" },
    doc:    { label: "D", color: "#3b82f6", name: "文档" },
    archive:{ label: "Z", color: "#64748b", name: "压缩包" },
    stream: { label: "S", color: "#ec4899", name: "流" },
    file:   { label: "F", color: "#64748b", name: "文件" },
  };

  var state = {
    on: false,
    items: [],
    panelOpen: false,
    booted: false,   /* 首次拿到状态 */
    toastTimer: 0,
  };

  /* ---------- Shadow DOM 舞台 ---------- */
  var host = document.createElement("div");
  host.id = "chushi-sniffer-host";
  host.style.cssText =
    "position:fixed;inset:0 auto auto 0;width:0;height:0;z-index:2147483647;pointer-events:none;";
  var root = host.attachShadow({ mode: "open" });
  document.documentElement.appendChild(host);

  var css = [
    ".float-root{position:fixed;pointer-events:none;font-family:-apple-system,'PingFang SC','Microsoft YaHei UI','Microsoft YaHei',system-ui,sans-serif;}",
    ".ball{pointer-events:auto;position:fixed;width:44px;height:44px;border-radius:999px;",
    "display:flex;align-items:center;justify-content:center;cursor:grab;user-select:none;-webkit-user-select:none;",
    "background:rgba(255,255,255,.72);backdrop-filter:blur(12px) saturate(1.5);-webkit-backdrop-filter:blur(12px) saturate(1.5);",
    "border:1px solid rgba(24,22,36,.12);box-shadow:0 4px 18px rgba(0,0,0,.18);color:#3f3f46;",
    "transition:box-shadow .25s ease,transform .18s cubic-bezier(.22,1,.36,1);will-change:transform;touch-action:none;}",
    ".ball:hover{box-shadow:0 6px 24px rgba(0,0,0,.25);}",
    ".ball.drag{cursor:grabbing;transition:none;}",
    ".ball:active{transform:scale(.94);}",
    ".ball svg{width:19px;height:19px;pointer-events:none;}",
    ".badge{position:absolute;top:-4px;right:-4px;min-width:17px;height:17px;padding:0 4px;border-radius:999px;",
    "background:#8b5cf6;color:#fff;font-size:10px;font-weight:600;line-height:17px;text-align:center;",
    "box-shadow:0 1px 4px rgba(0,0,0,.25);display:none;}",
    ".badge.show{display:block;}",
    ".panel{pointer-events:auto;position:fixed;width:264px;max-height:380px;display:flex;flex-direction:column;",
    "border-radius:14px;background:rgba(255,255,255,.9);backdrop-filter:blur(20px) saturate(1.6);-webkit-backdrop-filter:blur(20px) saturate(1.6);",
    "border:1px solid rgba(24,22,36,.12);box-shadow:0 12px 40px rgba(0,0,0,.22);color:#27272a;",
    "opacity:0;visibility:hidden;transform:translateY(6px) scale(.98);transition:opacity .22s ease,transform .22s cubic-bezier(.22,1,.36,1),visibility 0s linear .22s;}",
    ".panel.open{opacity:1;visibility:visible;transform:none;transition:opacity .22s ease,transform .22s cubic-bezier(.22,1,.36,1);}",
    ".ph{display:flex;align-items:center;gap:6px;padding:10px 12px 8px;border-bottom:1px solid rgba(24,22,36,.07);}",
    ".ph .t{font-size:12px;font-weight:500;letter-spacing:.05em;}",
    ".ph .n{font-size:10px;color:#a1a1aa;}",
    ".ph .sp{flex:1;}",
    ".ph button{border:0;background:none;padding:2px 4px;border-radius:6px;font-size:10px;color:#71717a;cursor:pointer;}",
    ".ph button:hover{background:rgba(24,22,36,.06);color:#27272a;}",
    ".list{overflow-y:auto;padding:6px;scrollbar-width:thin;}",
    ".list::-webkit-scrollbar{width:5px;}.list::-webkit-scrollbar-thumb{background:rgba(24,22,36,.15);border-radius:999px;}",
    ".empty{padding:22px 0;text-align:center;font-size:11px;color:#a1a1aa;}",
    ".item{display:flex;align-items:center;gap:8px;padding:7px 6px;border-radius:9px;}",
    ".item:hover{background:rgba(24,22,36,.045);}",
    ".tag{flex-shrink:0;width:20px;height:20px;border-radius:6px;color:#fff;font-size:10px;font-weight:700;line-height:20px;text-align:center;}",
    ".meta{min-width:0;flex:1;}",
    ".meta .nm{font-size:11px;font-weight:400;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}",
    ".meta .sub{font-size:9.5px;font-weight:300;color:#a1a1aa;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}",
    ".act{flex-shrink:0;display:flex;gap:2px;}",
    ".act button{border:0;background:none;padding:3px;border-radius:6px;cursor:pointer;color:#71717a;}",
    ".act button:hover{background:rgba(24,22,36,.07);color:#27272a;}",
    ".act svg{width:13px;height:13px;display:block;}",
    ".act button.ok{color:#10b981;}",
    ".toast{pointer-events:none;position:fixed;padding:8px 14px;border-radius:999px;font-size:11.5px;font-weight:300;letter-spacing:.03em;",
    "background:rgba(39,39,42,.92);color:#fafafa;box-shadow:0 6px 24px rgba(0,0,0,.25);",
    "opacity:0;transform:translateY(6px);transition:opacity .3s ease,transform .3s cubic-bezier(.22,1,.36,1);}",
    ".toast.show{opacity:1;transform:none;}",
    "@media (prefers-color-scheme:dark){",
    ".ball{background:rgba(39,39,42,.72);border-color:rgba(255,255,255,.14);color:#e4e4e7;}",
    ".panel{background:rgba(24,24,27,.92);border-color:rgba(255,255,255,.12);color:#f4f4f5;}",
    ".ph{border-bottom-color:rgba(255,255,255,.08);}",
    ".ph .n{color:#71717a;}.ph button{color:#a1a1aa;}.ph button:hover{background:rgba(255,255,255,.08);color:#f4f4f5;}",
    ".list::-webkit-scrollbar-thumb{background:rgba(255,255,255,.15);}",
    ".item:hover{background:rgba(255,255,255,.06);}",
    ".meta .sub{color:#71717a;}",
    ".act button{color:#a1a1aa;}.act button:hover{background:rgba(255,255,255,.08);color:#f4f4f5;}",
    "}",
  ].join("");

  var style = document.createElement("style");
  style.textContent = css;
  root.appendChild(style);

  var ball = document.createElement("div");
  ball.className = "ball";
  ball.style.display = "none";
  ball.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M12 3.5v11"/><path d="m7.5 10.5 4.5 4.5 4.5-4.5"/><path d="M4.5 20h15"/>' +
    "</svg>" +
    '<span class="badge"></span>';
  root.appendChild(ball);
  var badge = ball.querySelector(".badge");

  var panel = document.createElement("div");
  panel.className = "panel";
  panel.style.display = "none";
  root.appendChild(panel);

  var toast = document.createElement("div");
  toast.className = "toast";
  toast.style.display = "none";
  root.appendChild(toast);

  /* ---------- 位置持久化 ---------- */
  function loadPos() {
    try {
      var raw = localStorage.getItem(POS_KEY);
      if (raw) {
        var p = JSON.parse(raw);
        if (p && typeof p.x === "number" && typeof p.y === "number") return p;
      }
    } catch (e) { /* noop */ }
    return null;
  }
  function clampPos(x, y) {
    var w = 44, m = 6;
    var maxX = window.innerWidth - w - m, maxY = window.innerHeight - w - m;
    return {
      x: Math.min(Math.max(m, x), Math.max(m, maxX)),
      y: Math.min(Math.max(m, y), Math.max(m, maxY)),
    };
  }
  function applyBallPos() {
    var p = loadPos();
    if (!p) {
      /* 缺省：右侧中部 */
      p = { x: window.innerWidth - 44 - 18, y: Math.round(window.innerHeight * 0.42) };
    }
    p = clampPos(p.x, p.y);
    ball.style.left = p.x + "px";
    ball.style.top = p.y + "px";
    placePanel();
  }
  function placePanel() {
    var bx = parseFloat(ball.style.left) || 0;
    var by = parseFloat(ball.style.top) || 0;
    var px = bx - 264 - 12;
    if (px < 8) px = Math.min(bx + 56, window.innerWidth - 264 - 8);
    var py = by - 6;
    py = Math.min(Math.max(8, py), Math.max(8, window.innerHeight - 380));
    panel.style.left = px + "px";
    panel.style.top = py + "px";
    toast.style.left = Math.max(8, px) + "px";
    toast.style.top = Math.max(8, by - 44) + "px";
  }
  window.addEventListener("resize", function () {
    if (state.on) applyBallPos();
  });

  /* ---------- 拖拽 + 点击（>4px 算拖拽，up 后 260ms 吞 click 防误开） ---------- */
  var drag = null;
  var swallowClick = 0;
  ball.addEventListener("pointerdown", function (e) {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    drag = { x0: e.clientX, y0: e.clientY, moved: false, lx: e.clientX, ly: e.clientY };
    ball.setPointerCapture(e.pointerId);
  });
  ball.addEventListener("pointermove", function (e) {
    if (!drag) return;
    var dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
    if (!drag.moved && Math.hypot(dx, dy) > 4) {
      drag.moved = true;
      ball.classList.add("drag");
    }
    if (drag.moved) {
      /* 增量 = 本次与上次事件的差（movementX 在触屏/某些指鼠下不可靠） */
      var p = clampPos(
        parseFloat(ball.style.left || "0") + (e.clientX - drag.lx),
        parseFloat(ball.style.top || "0") + (e.clientY - drag.ly)
      );
      ball.style.left = p.x + "px";
      ball.style.top = p.y + "px";
      placePanel();
    }
    drag.lx = e.clientX;
    drag.ly = e.clientY;
  });
  ball.addEventListener("pointerup", function (e) {
    if (!drag) return;
    var wasDrag = drag.moved;
    ball.classList.remove("drag");
    ball.releasePointerCapture(e.pointerId);
    drag = null;
    if (wasDrag) {
      try {
        localStorage.setItem(
          POS_KEY,
          JSON.stringify({ x: parseFloat(ball.style.left), y: parseFloat(ball.style.top) })
        );
      } catch (er) { /* noop */ }
      swallowClick = Date.now();
      /* 拖后落点防出屏（窗口缩小时 clamp 兜底在 applyBallPos） */
    } else {
      if (Date.now() - swallowClick < 260) return; /* 拖后误触吞 click */
      togglePanel();
    }
  });

  /* ---------- 面板渲染 ---------- */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fmtSize(n) {
    if (!Number.isFinite(n) || n <= 0) return "";
    if (n >= 1073741824) return (n / 1073741824).toFixed(2) + " GB";
    if (n >= 1048576) return (n / 1048576).toFixed(1) + " MB";
    if (n >= 1024) return Math.round(n / 1024) + " KB";
    return n + " B";
  }
  function guessName(it) {
    if (it.name) return it.name;
    try {
      var u = new URL(it.url);
      var seg = u.pathname.split("/").filter(Boolean).pop() || u.hostname;
      return decodeURIComponent(seg).slice(0, 80);
    } catch (e) {
      return it.url.slice(0, 60);
    }
  }
  function renderPanel() {
    var rows = state.items
      .map(function (it, i) {
        var meta = TYPE_META[it.type] || TYPE_META.file;
        var sub = [fmtSize(it.size), it.ext === "m3u8" ? "m3u8 流列表" : meta.name, it.host]
          .filter(Boolean)
          .join(" · ");
        return (
          '<div class="item" data-i="' + i + '">' +
          '<span class="tag" style="background:' + meta.color + '">' + meta.label + "</span>" +
          '<span class="meta"><span class="nm" title="' + esc(guessName(it)) + '">' + esc(guessName(it)) + "</span>" +
          '<span class="sub">' + esc(sub) + "</span></span>" +
          '<span class="act">' +
          (it.ext === "m3u8"
            ? ""
            : '<button data-act="dl" title="下载"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v10"/><path d="m8 10.5 4 4 4-4"/><path d="M5 20h14"/></svg></button>') +
          '<button data-act="cp" title="复制链接"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg></button>' +
          "</span></div>"
        );
      })
      .join("");
    panel.innerHTML =
      '<div class="ph"><span class="t">嗅探到的资源</span><span class="n">' +
      state.items.length +
      '</span><span class="sp"></span>' +
      '<button data-act="clear">清空</button><button data-act="hide">收起</button></div>' +
      '<div class="list">' +
      (rows || '<div class="empty">暂无可下载资源<br>继续浏览网页试试</div>') +
      "</div>";
  }
  function togglePanel(force) {
    var next = typeof force === "boolean" ? force : !state.panelOpen;
    state.panelOpen = next;
    if (next) {
      renderPanel();
      panel.style.display = "flex";
      /* 强制 reflow 后再挂 open，保证每次展开都走过渡 */
      void panel.offsetHeight;
      panel.classList.add("open");
    } else {
      panel.classList.remove("open");
      setTimeout(function () {
        if (!state.panelOpen) panel.style.display = "none";
      }, 240);
    }
  }
  panel.addEventListener("click", function (e) {
    var btn = e.target && e.target.closest ? e.target.closest("button") : null;
    if (!btn) return;
    var act = btn.getAttribute("data-act");
    if (act === "hide") return togglePanel(false);
    if (act === "clear") {
      send({ type: "sniffer-clear" });
      state.items = [];
      renderBadge();
      renderPanel();
      return;
    }
    var itemEl = btn.closest(".item");
    if (!itemEl) return;
    var it = state.items[Number(itemEl.getAttribute("data-i"))];
    if (!it) return;
    if (act === "cp") {
      copyText(it.url, btn);
    } else if (act === "dl") {
      btn.classList.add("ok");
      send({ type: "sniffer-download", url: it.url, filename: guessName(it) });
    }
  });
  function copyText(text, btn) {
    var done = function () {
      if (!btn) return;
      btn.classList.add("ok");
      setTimeout(function () { btn.classList.remove("ok"); }, 1200);
    };
    try {
      navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text, done); });
    } catch (e) {
      fallbackCopy(text, done);
    }
  }
  function fallbackCopy(text, done) {
    try {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.style.cssText = "position:fixed;opacity:0;";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      done();
    } catch (e) { /* noop */ }
  }

  /* ---------- 徽标 + toast ---------- */
  function renderBadge() {
    var n = state.items.length;
    badge.textContent = n > 99 ? "99+" : String(n);
    badge.classList.toggle("show", n > 0);
  }
  function showToast(msg) {
    toast.textContent = msg;
    toast.style.display = "block";
    void toast.offsetHeight;
    toast.classList.add("show");
    if (state.toastTimer) clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(function () {
      toast.classList.remove("show");
      setTimeout(function () { toast.style.display = "none"; }, 320);
    }, 3500);
  }

  /* ---------- 消息面 ---------- */
  function send(msg, cb) {
    try {
      if (cb) chrome.runtime.sendMessage(msg, function (resp) { void chrome.runtime.lastError; cb(resp); });
      else chrome.runtime.sendMessage(msg, function () { void chrome.runtime.lastError; });
    } catch (e) { /* 扩展上下文失效（更新中）：静默 */ }
  }

  function applyItems(items, opts) {
    var prev = state.items.length;
    state.items = Array.isArray(items) ? items.slice(0, 50) : [];
    renderBadge();
    if (opts && opts.notify && state.items.length > prev) {
      showToast("嗅探到 " + state.items.length + " 个可下载资源");
    }
    if (state.panelOpen) renderPanel();
  }

  function boot() {
    if (state.booted) return;
    state.booted = true;
    send({ type: "sniffer-ask" }, function (resp) {
      if (!resp || resp.type !== "sniffer-state") return;
      if (!resp.on) { destroy(); return; }
      state.on = true;
      ball.style.display = "flex";
      applyBallPos();
      /* v8.7.52 补拉也提示：SW 推送可能早于本脚本注入（资源在
         document_idle 前已完成），首次拉到存量资源同样弹 toast，
         避免「页面一开就有资源却零提示」的感知断链 */
      applyItems(resp.items || [], {
        notify: !!(resp.items && resp.items.length > 0),
      });
    });
  }

  function destroy() {
    state.on = false;
    state.panelOpen = false;
    ball.style.display = "none";
    panel.style.display = "none";
    toast.style.display = "none";
  }

  try {
    chrome.runtime.onMessage.addListener(function (msg) {
      if (!msg || typeof msg.type !== "string") return;
      if (msg.type === "sniffer-new") {
        if (!state.booted) boot();
        if (!state.on) return;
        ball.style.display = "flex";
        applyBallPos();
        applyItems(msg.items || [], { notify: true });
      } else if (msg.type === "sniffer-off") {
        destroy();
      } else if (msg.type === "sniffer-state") {
        /* SW 广播形态（开关切换后）：on → 显示/自毁 */
        if (msg.on) {
          state.on = true;
          ball.style.display = "flex";
          applyBallPos();
          applyItems(msg.items || [], {
            notify: !!(msg.items && msg.items.length > 0),
          });
        } else {
          destroy();
        }
      }
    });
  } catch (e) { /* 无 runtime 宿主 */ }

  /* storage 兜底：SW 离线期被关闭也能及时自毁 */
  try {
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area === "local" && changes && "snifferOn" in changes && changes.snifferOn.newValue !== true) {
        destroy();
      }
    });
  } catch (e) { /* noop */ }

  boot();
})();
