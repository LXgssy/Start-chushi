/* 「初始」扩展弹窗快捷面板逻辑（v8.5.0）。
 *
 * 数据面：与新标签页共享同一 localStorage 键 start:settings（popup.html
 * 与 index.html 同扩展 origin，storage 天然互通）。开关即时写入：
 *   · perfLite：page.tsx 监听 storage 事件 → html.cs-lite 热切换；
 *   · noOmniboxFocus（本面板开关「新标签页不聚焦地址栏」正语义）：
 *     下一次新标签页生效（焦点/地址栏是启动行为，无需热切换）。
 * 主题：跟随 settings.themeMode（dark/light/system；system 回退
 * prefers-color-scheme），写入期间监听 storage 事件实时跟随。
 * 完整设置直达：写一次性意图标志 start:ui-intent 后新开 shell.html，
 * 新标签页挂载时消费（读后即焚，30s 时效）打开设置面板。
 * 一切 chrome.* 访问 try/catch（未来若网页版复用此页不崩）。 */

(function () {
  "use strict";

  var KEY = "start:settings";
  var INTENT_KEY = "start:ui-intent";

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
  setSw($("#sw-lite"), liteOn);
  setSw($("#sw-nofocus"), noFocusOn);

  $("#sw-lite").addEventListener("click", function () {
    var on = $("#sw-lite").getAttribute("aria-checked") !== "true";
    setSw($("#sw-lite"), on);
    writeSettings({ perfLite: on });
  });

  $("#sw-nofocus").addEventListener("click", function () {
    var on = $("#sw-nofocus").getAttribute("aria-checked") !== "true";
    setSw($("#sw-nofocus"), on);
    writeSettings({ noOmniboxFocus: on });
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
