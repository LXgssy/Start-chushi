/* 「初始」扩展弹窗快捷面板逻辑（v8.5.0 / v8.7.36 扩容）。
 *
 * 数据面：与新标签页共享同一 localStorage 键 start:settings（popup.html
 * 与 index.html 同扩展 origin，storage 天然互通）。开关即时写入：
 *   · perfLite：page.tsx 监听 storage 事件 → html.cs-lite 热切换；
 *   · noOmniboxFocus（本面板开关「新标签页不聚焦地址栏」正语义）：
 *     下一次新标签页生效（焦点/地址栏是启动行为，无需热切换）；
 *   · photoDim / showDock（v8.7.36）：已开标签页经 settings storage
 *     事件热跟随（use-start-settings 统一消费）。
 * 添加至快捷服务（v8.7.38，标签系统退役）：当前标签页直写 start:links
 *   （快捷服务磁贴数据面，与新标签页 QuickLinks 同一 JSON 契约
 *   {id,name,url}[]，队尾追加与 LinkDialog 同律；URL 去重；
 *   v8.7.105 磁贴数量不限律：4 行上限判定退役，与新标签页同律）；
 *   已开页面经 use-start-data storage 事件热跟随即时出现。
 * 主题：跟随 settings.themeMode（dark/light/system；system 回退
 * prefers-color-scheme），写入期间监听 storage 事件实时跟随。
 * 强调色（v8.7.52）：跟随 settings.accent —— 启动读 start:settings 后把
 * hex 写入 --acc（CSS 变量，开关/滑杆/选中态全部引用），storage 事件
 * 热跟随（设置面板换色，面板开着也不落伍）。
 * 资源嗅探（v8.7.52）：开关值存 chrome.storage.local 的 snifferOn——
 * Service Worker 读不到 localStorage（扩展 origin 的 localStorage 只在
 * 页面进程），嗅探的监听器在 SW 里，故走 chrome.storage；本面板只负责
 * 写入，嗅探开关的状态渲染也以 chrome.storage.local 为准（非 start:settings）。
 * 免责声明门（v8.7.112）：首次开启前强制阅读并同意免责声明（引自猫抓
 * cat-catch 项目），同意态存 chrome.storage.local 的 snifferDisclaimerAgreed。
 * 完整设置直达：写一次性意图标志 start:ui-intent 后新开 shell.html，
 * 新标签页挂载时消费（读后即焚，30s 时效）打开设置面板。
 * 一切 chrome.* 访问 try/catch（未来若网页版复用此页不崩）。 */

(function () {
  "use strict";

  var KEY = "start:settings";
  var INTENT_KEY = "start:ui-intent";
  var LINKS_KEY = "start:links";
  /* v8.7.105 磁贴数量不限律：linksCap 判定退役（与新标签页 QuickLinks/saveLink
     同律），添加位恒可用。 */

  function $(s) {
    return document.querySelector(s);
  }

  function readSettings() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return {};
      var j = JSON.parse(raw);
      return j && typeof j === "object" ? j : {};
    } catch (e) {
      return {};
    }
  }

  function writeSettings(patch) {
    var next = Object.assign({}, readSettings(), patch);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch (e) {
      /* 隐私模式等场景静默失败 */
    }
  }

  /* ---------- 快捷服务磁贴 id（与新标签页磁贴同域命名空间） ---------- */
  function uid() {
    return "l" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  /* ---------- 主题跟随 ---------- */
  function applyTheme() {
    var mode = readSettings().themeMode;
    var dark;
    if (mode === "dark") dark = true;
    else if (mode === "light") dark = false;
    else {
      try {
        dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      } catch (e) {
        dark = true;
      }
    }
    document.documentElement.classList.toggle("dark", dark);
  }

  /* ---------- 强调色跟随（v8.7.52）----------
     settings.accent 是 hex（设置面板色板写入，缺省 #8b5cf6）。只认合法
     hex，其余静默回退——脏数据不进 CSS。 */
  function applyAccent() {
    var acc = readSettings().accent;
    if (typeof acc !== "string" || !/^#[0-9a-fA-F]{6}$/.test(acc)) return;
    document.documentElement.style.setProperty("--acc", acc);
  }

  /* ---------- 开关渲染 ---------- */
  function setSw(btn, on) {
    btn.setAttribute("aria-checked", on ? "true" : "false");
  }

  /* ---------- 版本号 ---------- */
  try {
    var m = chrome.runtime.getManifest();
    $("#ver").textContent = "v" + (m && m.version ? m.version : "");
  } catch (e) {
    /* 非 extension 宿主：留空 */
  }

  /* ---------- 初始化开关态 ---------- */
  var s0 = readSettings();
  var liteOn = !!s0.perfLite;
  var noFocusOn = s0.noOmniboxFocus === true;
  var dockOn = s0.showDock !== false; /* 旧数据缺省 = 显示 */
  var dimV = typeof s0.photoDim === "number" ? s0.photoDim : 100;
  setSw($("#sw-lite"), liteOn);
  setSw($("#sw-nofocus"), noFocusOn);
  setSw($("#sw-dock"), dockOn);
  $("#rg-dim").value = dimV;
  $("#dim-v").textContent = dimV + "%";

  $("#sw-lite").addEventListener("click", function () {
    var on = $("#sw-lite").getAttribute("aria-checked") !== "true";
    setSw($("#sw-lite"), on);
    if (on && readSettings().background === "glow") {
      /* v8.7.37 流畅模式禁用辉光：开启瞬间背景=辉光则一并切掠影
         （单次写入少竞态窗；页面侧 use-start-settings 互斥 effect 同律兜底） */
      writeSettings({ perfLite: true, background: "photo" });
    } else {
      writeSettings({ perfLite: on });
    }
  });

  $("#sw-nofocus").addEventListener("click", function () {
    var on = $("#sw-nofocus").getAttribute("aria-checked") !== "true";
    setSw($("#sw-nofocus"), on);
    writeSettings({ noOmniboxFocus: on });
  });

  /* v8.7.36：Dock 栏显隐 */
  $("#sw-dock").addEventListener("click", function () {
    var on = $("#sw-dock").getAttribute("aria-checked") !== "true";
    setSw($("#sw-dock"), on);
    writeSettings({ showDock: on });
  });

  /* v8.7.36：壁纸压暗程度（即时写入，已开页面 storage 热跟随） */
  $("#rg-dim").addEventListener("input", function () {
    var v = Number($("#rg-dim").value);
    $("#dim-v").textContent = v + "%";
    writeSettings({ photoDim: v });
  });

  /* ---------- 资源嗅探（v8.7.52；v8.7.112 免责声明门）----------
     状态源 = chrome.storage.local.snifferOn（SW 消费）；popup 初渲染与
     storage 变更都从 chrome.storage 读（不与 start:settings 混存）。
     v8.7.112 开启门：首次开启必须同意免责声明（文本引自猫抓 cat-catch
     项目）——同意态存 chrome.storage.local.snifferDisclaimerAgreed，
     同意一次后后续开启不再询问；不同意则开关回弹、嗅探保持关闭。
     仅拦「写入 true」的路径：关闭无门。 */
  function renderSniffer(on) {
    setSw($("#sw-sniffer"), !!on);
  }
  function sniffGateShow() { var g = $("#sniff-gate"); if (g) g.hidden = false; }
  function sniffGateHide() { var g = $("#sniff-gate"); if (g) g.hidden = true; }
  try {
    chrome.storage.local.get("snifferOn", function (o) {
      renderSniffer(o && o.snifferOn);
    });
  } catch (e) {
    /* 无 chrome.storage 宿主：保持缺省关 */
  }
  $("#sw-sniffer").addEventListener("click", function () {
    var cur = $("#sw-sniffer").getAttribute("aria-checked") === "true";
    if (cur) {
      /* 关闭：无门，直接落 */
      setSw($("#sw-sniffer"), false);
      try { chrome.storage.local.set({ snifferOn: false }); } catch (e) { /* noop */ }
      return;
    }
    /* 开启：先查同意态——已同意直开；未同意先弹声明（开关回弹，同意才落） */
    try {
      chrome.storage.local.get("snifferDisclaimerAgreed", function (o) {
        if (o && o.snifferDisclaimerAgreed) {
          setSw($("#sw-sniffer"), true);
          try { chrome.storage.local.set({ snifferOn: true }); } catch (e) { /* noop */ }
        } else {
          setSw($("#sw-sniffer"), false);
          sniffGateShow();
        }
      });
    } catch (e) {
      /* 无宿主（理论不可达）：维持旧行为直接开 */
      setSw($("#sw-sniffer"), true);
      try { chrome.storage.local.set({ snifferOn: true }); } catch (e2) { /* noop */ }
    }
  });
  try {
    $("#sniff-gate-yes").addEventListener("click", function () {
      try { chrome.storage.local.set({ snifferDisclaimerAgreed: true, snifferOn: true }); } catch (e) { /* noop */ }
      setSw($("#sw-sniffer"), true);
      sniffGateHide();
    });
    $("#sniff-gate-no").addEventListener("click", function () {
      /* 不同意：保持关闭（显式落 false，防存储里残留开态） */
      try { chrome.storage.local.set({ snifferOn: false }); } catch (e) { /* noop */ }
      setSw($("#sw-sniffer"), false);
      sniffGateHide();
    });
  } catch (e) { /* 门元素缺失：静默 */ }


  /* ---------- 添加当前网页至快捷服务（v8.7.38，标签系统退役） ----------
     当前标签页直入 start:links 磁贴（队尾追加与 LinkDialog 新增位同律、
     URL 去重、数量不限）；已开页面经 use-start-data storage
     事件热跟随即时出现。
     v8.7.108 修复（用户实测「点击弹窗添加按钮没有反应」）：v8.7.105 数量
     不限律删上限变量声明时漏删下方 slice 引用——点击后引用未定义标识符
     中断回调，磁贴永不写入、无任何反馈。残留引用拆除。 */
  var flashTimer = null;
  function flash(msg) {
    var el = $("#add-label");
    el.textContent = msg;
    if (flashTimer) clearTimeout(flashTimer);
    flashTimer = setTimeout(function () {
      el.textContent = "添加至快捷服务";
      $("#btn-add").classList.remove("ok");
    }, 1400);
  }

  $("#btn-add").addEventListener("click", function () {
    var q = function (tabs) {
      var t = tabs && tabs[0];
      if (!t || !t.url || !/^https?:/i.test(t.url)) {
        flash("无法添加此页");
        return;
      }
      var list;
      try {
        var raw = localStorage.getItem(LINKS_KEY);
        list = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(list)) list = [];
      } catch (e) {
        list = [];
      }
      for (var i = 0; i < list.length; i++) {
        if (list[i] && list[i].url === t.url) {
          flash("已在快捷服务");
          $("#btn-add").classList.add("ok");
          return;
        }
      }
      list.push({
        id: uid(),
        name: String(t.title || "").slice(0, 120) || String(t.url),
        url: String(t.url),
      });
      try {
        localStorage.setItem(LINKS_KEY, JSON.stringify(list));
      } catch (e2) {
        /* 隐私模式静默 */
        flash("无法添加此页");
        return;
      }
      flash("已添加 ✓");
      $("#btn-add").classList.add("ok");
    };
    try {
      chrome.tabs.query({ active: true, currentWindow: true }, q);
    } catch (e) {
      /* 无 tabs 宿主（网页复用） */
      flash("无法添加此页");
    }
  });

  /* ---------- 完整设置直达（新标签页 + 一次性意图标志） ---------- */
  $("#open-settings").addEventListener("click", function () {
    try {
      localStorage.setItem(
        INTENT_KEY,
        JSON.stringify({ panel: "settings", ts: Date.now() })
      );
    } catch (e) {
      /* noop */
    }
    try {
      chrome.tabs.create({ url: chrome.runtime.getURL("shell.html") });
    } catch (e) {
      /* 无 tabs 权限等异常：兜底当前动作不弹 */
    }
    window.close();
  });

  /* ---------- 实时跟随（设置面板/其他标签页改主题/强调色；
     chrome.storage 变化同步嗅探开关） ---------- */
  try {
    window
      .matchMedia("(prefers-color-scheme: dark)")
      .addEventListener("change", applyTheme);
  } catch (e) {
    /* 旧引擎降级：不跟随 */
  }
  window.addEventListener("storage", function (e) {
    if (e.key === KEY || e.key === null) {
      applyTheme();
      applyAccent();
    }
  });
  try {
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area === "local" && changes.snifferOn) {
        renderSniffer(changes.snifferOn.newValue);
      }
    });
  } catch (e) {
    /* 无 storage.onChanged 宿主 */
  }

  applyTheme();
  applyAccent();
})();
