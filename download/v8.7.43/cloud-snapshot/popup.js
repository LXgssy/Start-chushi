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
 *   {id,name,url}[]，队尾追加与 LinkDialog 同律；URL 去重，4 行上限 =
 *   4×磁贴列数（layout.linksColumns，未设 6），到顶提示「快捷服务已到达
 *   限制数量」）；已开页面经 use-start-data storage 事件热跟随即时出现。
 * 主题：跟随 settings.themeMode（dark/light/system；system 回退
 * prefers-color-scheme），写入期间监听 storage 事件实时跟随。
 * 完整设置直达：写一次性意图标志 start:ui-intent 后新开 shell.html，
 * 新标签页挂载时消费（读后即焚，30s 时效）打开设置面板。
 * 一切 chrome.* 访问 try/catch（未来若网页版复用此页不崩）。 */

(function () {
  "use strict";

  var KEY = "start:settings";
  var INTENT_KEY = "start:ui-intent";
  var LINKS_KEY = "start:links";
  /* v8.7.41 磁贴 4 行上限律：与新标签页 QuickLinks/saveLink 同式——
     4 行 × 每行列数（layout.linksColumns，未设 6）。存量超限不删只拦新增。 */
  function linksCap() {
    var s = readSettings();
    var cols = s.layout && typeof s.layout.linksColumns === "number"
      ? s.layout.linksColumns
      : 6;
    return 4 * (cols > 0 ? Math.floor(cols) : 6);
  }

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


  /* ---------- 添加当前网页至快捷服务（v8.7.38，标签系统退役） ----------
     当前标签页直入 start:links 磁贴（队尾追加与 LinkDialog 新增位同律、
     URL 去重、FIFO 上限 200）；已开页面经 use-start-data storage
     事件热跟随即时出现。 */
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
      var cap = linksCap();
      if (list.length >= cap) {
        flash("快捷服务已到达限制数量");
        return;
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
      if (list.length > cap) list = list.slice(list.length - cap);
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

  /* ---------- 实时跟随（设置面板/其他标签页改主题） ---------- */
  try {
    window
      .matchMedia("(prefers-color-scheme: dark)")
      .addEventListener("change", applyTheme);
  } catch (e) {
    /* 旧引擎降级：不跟随 */
  }
  window.addEventListener("storage", function (e) {
    if (e.key === KEY || e.key === null) applyTheme();
  });

  applyTheme();
})();
