/* ============================================================
 * 「初始」沙箱 JS 运行时（唯一源隔离文档内执行）
 *
 * 职责：
 *  1. 接收宿主 boot 消息，在独立 realm 内执行预设脚本（支持顶层 await，
 *     经 async IIFE 包装；同步死循环由宿主侧看门狗冻结兜底）；
 *  2. 向脚本提供受控 API `chushi`——注册 ⌘K 命令、脚本入口、通知、
 *     打开网址、复制、fetchJSON。所有越界副作用（notify/open/copy/cmd）
 *     仅以 postMessage 上报宿主，由宿主复核白名单后代为执行；
 *     本文档自身拿不到主文档、localStorage、Cookie 与任何扩展 API；
 *  3. invoke 路由：命令复合键（"scriptKey:cmdId"）查命令表，
 *     纯 scriptKey 查脚本入口（chushi.run），统一入口便于宿主无差别调用。
 *
 * 协议（host → sandbox）：boot{scriptKey,code} / invoke{id}
 * 协议（sandbox → host）：hello / ready{scriptKey} / bootError{scriptKey,message}
 *                        / api{op:cmd|notify|open|copy,...} / invokeResult{id,ok,message?}
 *                        / runtimeError{message,scriptKey?}
 * ============================================================ */
(function () {
  "use strict";

  /* 命令表：键 = "scriptKey:cmdId" → run 函数；入口表：scriptKey → chushi.run */
  var handlers = new Map();
  var entries = new Map();
  var cmdCounts = new Map(); // scriptKey → 已注册命令数（上限 12/脚本）

  function post(msg) {
    try {
      parent.postMessage(msg, "*");
    } catch (e) {
      /* 宿主已销毁 iframe 等场景静默 */
    }
  }

  function errMsg(err) {
    if (err == null) return "未知错误";
    if (typeof err === "string") return err;
    var m = err && err.message;
    return m ? String(m) : String(err);
  }

  function str(v, max) {
    return typeof v === "string" ? v.slice(0, max) : "";
  }

  var CMD_LIMIT = 12;
  var ID_RE = /^[A-Za-z0-9_-]{1,32}$/;

  /** 为指定脚本构造受控 API（每个脚本一份，命令/入口互不可见对方内部状态） */
  function makeChushi(scriptKey) {
    function registerCommand(def) {
      try {
        if (!def || typeof def !== "object") throw new Error("registerCommand 参数必须是对象");
        var id = str(def.id, 32);
        if (!ID_RE.test(id)) throw new Error("命令 id 只允许字母/数字/下划线/连字符（≤32 字符）");
        var title = str(def.title, 24);
        if (!title) throw new Error("命令缺少 title");
        if (typeof def.run !== "function") throw new Error("命令缺少 run 函数");
        if (!handlers.has(scriptKey + ":" + id)) {
          var count = cmdCounts.get(scriptKey) || 0;
          if (count >= CMD_LIMIT) throw new Error("每个脚本最多注册 " + CMD_LIMIT + " 条命令");
          cmdCounts.set(scriptKey, count + 1);
        }
        handlers.set(scriptKey + ":" + id, def.run);
        post({ type: "api", op: "cmd", scriptKey: scriptKey, id: id, title: title });
      } catch (err) {
        post({ type: "runtimeError", scriptKey: scriptKey, message: errMsg(err) });
      }
    }

    return {
      registerCommand: registerCommand,
      /* 脚本入口：预设 commands/dock 的 {"type":"script","id":"<脚本id>"} 触发 */
      set run(fn) {
        if (typeof fn === "function") entries.set(scriptKey, fn);
      },
      get run() {
        return entries.get(scriptKey) || null;
      },
      notify: function (o) {
        var t = o && typeof o === "object" ? o : {};
        post({
          type: "api",
          op: "notify",
          title: str(t.title, 24) || "来自预设",
          description: str(t.description, 60),
        });
      },
      open: function (url) {
        post({ type: "api", op: "open", url: str(url, 500) });
      },
      copy: function (text) {
        post({ type: "api", op: "copy", text: str(text, 200) });
      },
      /* fetch + JSON 解析 + 10s 超时（沙箱内直连，受目标站 CORS 约束） */
      fetchJSON: function (url, init) {
        var ctrl = typeof AbortController === "function" ? new AbortController() : null;
        var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 10000) : null;
        var opts = init && typeof init === "object" ? Object.assign({}, init) : {};
        if (ctrl) opts.signal = ctrl.signal;
        return fetch(String(url), opts)
          .then(function (r) {
            if (!r.ok) throw new Error("HTTP " + r.status);
            return r.json();
          })
          .finally(function () {
            if (timer) clearTimeout(timer);
          });
      },
    };
  }

  /** 统一调用路由：命令与脚本入口共用同一结果回报通道 */
  function callRoute(id, fn) {
    try {
      var r = fn();
      if (r && typeof r.then === "function") {
        r.then(
          function () { post({ type: "invokeResult", id: id, ok: true }); },
          function (err) { post({ type: "invokeResult", id: id, ok: false, message: errMsg(err) }); }
        );
      } else {
        post({ type: "invokeResult", id: id, ok: true });
      }
    } catch (err) {
      post({ type: "invokeResult", id: id, ok: false, message: errMsg(err) });
    }
  }

  /* ---------- 沙箱页面模式（?mode=page）----------
 * 作为自定义页面的「沙箱宿主」：接收应用层 renderPage，把 HTML 写进嵌套的
 * srcdoc iframe（sandbox="allow-scripts"，不透明源），并把页面内 chushi API
 * 消息（notify/close/open）带上 pageKey 中继回应用层。
 * 两层隔离：应用层 → 本页（唯一源）→ 用户页面（不透明源），用户页面拿不到
 * 主文档/localStorage/扩展 API，open 走应用层白名单（仅 https）。 */
function pageMode() {
  var pageKey = "";
  var inner = null;
  window.addEventListener("message", function (e) {
    if (e.source !== parent) return; // 只接受应用层
    var m = e.data;
    if (!m || typeof m !== "object") return;
    if (m.type === "renderPage" && typeof m.html === "string") {
      if (inner) return; // 一次挂载只渲染一份
      pageKey = str(m.key, 80);
      /* 前置 shim：为用户页面提供极简 chushi API（消息中继到宿主白名单） */
      var shim =
        "<script>(function(){function post(m){try{parent.postMessage(m,'*')}catch(e){}}" +
        "window.chushi={notify:function(o){o=o||{};post({type:'pageApi',op:'notify'," +
        "title:String(o.title||'').slice(0,24),description:String(o.description||'').slice(0,60)})}," +
        "close:function(){post({type:'pageApi',op:'close'})}," +
        "open:function(u){post({type:'pageApi',op:'open',url:String(u||'').slice(0,500)})}};})();</script>";
      inner = document.createElement("iframe");
      inner.setAttribute("sandbox", "allow-scripts");
      inner.setAttribute("title", "初始自定义页面");
      inner.style.cssText =
        "position:fixed;inset:0;width:100vw;height:100vh;border:0;background:transparent";
      inner.srcdoc = shim + m.html;
      document.body.appendChild(inner);
      window.addEventListener("message", function (ev) {
        if (!inner || ev.source !== inner.contentWindow) return;
        var d = ev.data;
        if (d && typeof d === "object" && d.type === "pageApi") {
          post({
            type: "pageApi",
            pageKey: pageKey,
            op: d.op,
            title: str(d.title, 24),
            description: str(d.description, 60),
            url: str(d.url, 500),
          });
        }
      });
    }
  });
  post({ type: "hello" });
}

/* ---------- 沙箱小部件模式（?mode=widget，v1.0.7）----------
 * 作为角落小部件的「沙箱宿主」：接收应用层 renderWidget（含主题/强调色），
 * 把 HTML 写进嵌套的 srcdoc iframe（sandbox="allow-scripts"，不透明源），并把
 * 部件内 chushi API（notify/open/storage/resize）带上 widgetKey 中继回应用层；
 * 应用层回传的 storage 结果与主题变更反向下发进部件。
 * 两层隔离：应用层 → 本页（唯一源）→ 部件（不透明源），部件拿不到
 * 主文档/localStorage/扩展 API；open/storage 均由应用层白名单复核。 */
function widgetShim(theme, accent) {
  var accentSet = /^#[0-9a-fA-F]{3,8}$/.test(accent || "")
    ? "document.documentElement.style.setProperty('--w-accent','" + accent + "');"
    : "";
  return (
    "<script>(function(){var seq=0,pending={};function post(m){try{parent.postMessage(m,'*')}catch(e){}}" +
    "document.documentElement.dataset.theme='" + (theme === "dark" ? "dark" : "light") + "';" +
    accentSet +
    "window.chushi={notify:function(o){o=o||{};post({type:'widgetApi',op:'notify'," +
    "title:String(o.title||'').slice(0,24),description:String(o.description||'').slice(0,60)})}," +
    "open:function(u){post({type:'widgetApi',op:'open',url:String(u||'').slice(0,500)})}," +
    "resize:function(w,h){post({type:'widgetApi',op:'resize',width:+w||0,height:+h||0})}," +
    "storage:{get:function(k){return new Promise(function(res){var id=++seq;pending[id]={f:res,op:'storageGet'};" +
    "post({type:'widgetApi',op:'storageGet',key:String(k||'').slice(0,64),reqId:id})})}," +
    "set:function(k,v){return new Promise(function(res){var id=++seq;pending[id]={f:res,op:'storageSet'};var s='';" +
    "try{var j=JSON.stringify(v);s=j==null?'':j}catch(e){}" +
    "post({type:'widgetApi',op:'storageSet',key:String(k||'').slice(0,64),value:s.slice(0,4000),reqId:id})})}}};" +
    "window.addEventListener('message',function(ev){var d=ev.data;if(!d||typeof d!=='object')return;" +
    "if(d.type==='widgetStorage'){var p=pending[d.reqId];if(!p)return;delete pending[d.reqId];" +
    "if(p.op==='storageGet'){var v=null;if(typeof d.value==='string'&&d.value.length){try{v=JSON.parse(d.value)}catch(e){v=d.value}}p.f(v)}else{p.f(d.ok===true)}};" +
    "if(d.type==='widgetTheme'){document.documentElement.dataset.theme=d.theme==='dark'?'dark':'light';" +
    "if(d.accent)document.documentElement.style.setProperty('--w-accent',d.accent)}});" +
    "})();</script>"
  );
}

function widgetMode() {
  var widgetKey = "";
  var inner = null;
  var theme = "light";
  var accent = "";
  window.addEventListener("message", function (e) {
    if (e.source !== parent) return; // 只接受应用层
    var m = e.data;
    if (!m || typeof m !== "object") return;
    if (m.type === "renderWidget" && typeof m.html === "string") {
      if (inner) return; // 一次挂载只渲染一份
      widgetKey = str(m.key, 80);
      theme = m.theme === "dark" ? "dark" : "light";
      accent = typeof m.accent === "string" ? m.accent.slice(0, 9) : "";
      inner = document.createElement("iframe");
      inner.setAttribute("sandbox", "allow-scripts");
      inner.setAttribute("title", "初始自定义小部件");
      inner.style.cssText =
        "position:fixed;inset:0;width:100%;height:100%;border:0;background:transparent";
      inner.srcdoc = widgetShim(theme, accent) + m.html;
      document.body.appendChild(inner);
      window.addEventListener("message", function (ev) {
        if (!inner || ev.source !== inner.contentWindow) return;
        var d = ev.data;
        if (d && typeof d === "object" && d.type === "widgetApi") {
          post({
            type: "widgetApi",
            widgetKey: widgetKey,
            op: str(d.op, 16),
            key: str(d.key, 64),
            value: str(d.value, 4000),
            reqId: typeof d.reqId === "number" ? Math.min(1e9, Math.max(0, d.reqId | 0)) : 0,
            width: +d.width || 0,
            height: +d.height || 0,
            title: str(d.title, 24),
            description: str(d.description, 60),
            url: str(d.url, 500),
          });
        }
      });
      return;
    }
    if (m.type === "widgetTheme" && inner && inner.contentWindow) {
      theme = m.theme === "dark" ? "dark" : "light";
      accent = typeof m.accent === "string" ? m.accent.slice(0, 9) : "";
      try {
        inner.contentWindow.postMessage({ type: "widgetTheme", theme: theme, accent: accent }, "*");
      } catch (e) {
        /* noop */
      }
      return;
    }
    if (m.type === "widgetStorage" && inner && inner.contentWindow) {
      try {
        inner.contentWindow.postMessage(m, "*");
      } catch (e) {
        /* noop */
      }
    }
  });
  post({ type: "hello" });
}

window.addEventListener("message", function (e) {
    if (e.source !== parent) return; // 只接受直接宿主
    var m = e.data;
    if (!m || typeof m !== "object") return;

    if (m.type === "boot") {
      var scriptKey = str(m.scriptKey, 80);
      var code = typeof m.code === "string" ? m.code : "";
      /* async IIFE 包装：顶层 await 可用；同步前缀执行完即视为 ready，
         await 之后的异常走 unhandledrejection 上报 */
      try {
        var factory = new Function(
          "chushi",
          '"use strict";return (async () => {\n' + code + "\n})();"
        );
        var ret = factory(makeChushi(scriptKey));
        if (ret && typeof ret.catch === "function") {
          ret.catch(function (err) {
            post({ type: "runtimeError", scriptKey: scriptKey, message: errMsg(err) });
          });
        }
      } catch (err) {
        post({ type: "bootError", scriptKey: scriptKey, message: errMsg(err) });
      }
      post({ type: "ready", scriptKey: scriptKey });
      return;
    }

    if (m.type === "invoke") {
      var id = str(m.id, 120);
      var fn = handlers.get(id);
      if (fn) {
        callRoute(id, fn);
        return;
      }
      var entry = entries.get(id); // id 即 scriptKey（脚本入口）
      if (entry) {
        callRoute(id, entry);
        return;
      }
      post({ type: "invokeResult", id: id, ok: false, message: "命令或脚本入口不存在（预设可能已更新）" });
      return;
    }
  });

  /* 异步续体中的未捕获错误上报 */
  window.addEventListener("error", function (ev) {
    post({ type: "runtimeError", message: errMsg(ev && (ev.error || ev.message)) });
  });
  window.addEventListener("unhandledrejection", function (ev) {
    post({ type: "runtimeError", message: errMsg(ev && ev.reason) });
  });

  /* 模式分发：页面/小部件模式自带 hello 握手与独立监听；脚本模式走原协议 */
  if (typeof location !== "undefined" && location.search.indexOf("mode=page") !== -1) {
    pageMode();
  } else if (typeof location !== "undefined" && location.search.indexOf("mode=widget") !== -1) {
    widgetMode();
  } else {
    post({ type: "hello" });
  }
})();
