/* ============================================================
 * 「初始」沙箱 JS 运行时（唯一源隔离文档内执行）
 *
 * 职责：
 *  1. 接收宿主 boot 消息，在独立 realm 内执行预设脚本（支持顶层 await，
 *     经 async IIFE 包装；同步死循环由宿主侧看门狗冻结兜底）；
 *  2. 向脚本提供受控 API `chushi`——注册 ⌘K 命令、脚本入口、通知、
 *     打开网址、复制、fetchJSON、fx 视觉效果面（v1.1.3：挂载 style/svg
 *     白名单结构、订阅玻璃容器 resize 快照）、设置面（v1.2.0：define/get/
 *     onChange，预设向设置面板贡献调节项）、换材质（v1.7.0：material.apply/
 *     reset，通用材质作用面）。所有越界副作用仅以
 *     postMessage 上报宿主，由宿主复核白名单后代为执行；
 *     本文档自身拿不到主文档、localStorage、Cookie 与任何扩展 API；
 *  3. invoke 路由：命令复合键（"scriptKey:cmdId"）查命令表，
 *     纯 scriptKey 查脚本入口（chushi.run），统一入口便于宿主无差别调用。
 *
 * 协议（host → sandbox）：boot{scriptKey,code} / invoke{id} / fxResize{scriptKey,items}
 *                        / fxResult{scriptKey,fxId,ok,message?}
 *                        / settingsValues{scriptKey,values}（get 回执）
 *                        / settingsPush{scriptKey,values}（面板变更推送）
 * 协议（sandbox → host）：hello / ready{scriptKey} / bootError{scriptKey,message}
 *                        / api{op:cmd|notify|open|copy|fxMount|fxUnmount|fxSubscribe|fxUnsubscribe
 *                             |settingsDefine{schema}|settingsGet,...}
 *                        / invokeResult{id,ok,message?}
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
  var FX_HTML_MAX = 192 * 1024;
  /** fxResize 定向派发注册表：scriptKey → onResize 回调集（makeChushi 注册） */
  var fxTargets = new Map();
  /** fx 调用 pending 表（fxApi 登记，fxResult 消息兑现；必须与消息处理器同作用域） */
  var pendingFx = {};
  /** 设置面（v1.2.0）：get 回执 pending 表 + onChange 回调集（必须与消息处理器同作用域） */
  var pendingSettings = {};
  var settingsTargets = new Map();
  /** SMTC 媒体作用面（v1.8.0）：get/control 共用 pending 表（reqId 全局递增）
   *  + 定向推送回调集（scriptKey → cbs） */
  var pendingSmtc = {};
  var smtcTargets = new Map();
  /** 每脚本最近一份 SMTC 快照（smtcTick 锚点校正的落点，v1.9.0） */
  var smtcLast = new Map();
  var smtcSeq = 0;
  /** 音乐引擎核心实例（v2.0.0）：scriptKey → api（smtcPush/smtcTick 同源喂数） */
  var musicTargets = new Map();

  /** SMTC 控制请求（脚本通道共用）：smtc.control 与 music hooks 同一实现 */
  function smtcControlReq(scriptKey, cmd, position) {
    return new Promise(function (resolve) {
      var id = ++smtcSeq;
      var t = setTimeout(function () {
        delete pendingSmtc[id];
        resolve(false);
      }, 8000);
      pendingSmtc[id] = {
        f: function (v) {
          clearTimeout(t);
          resolve(v === true);
        },
      };
      post({
        type: "api",
        op: "smtcControl",
        scriptKey: scriptKey,
        cmd: str(cmd, 8),
        position: typeof position === "number" && isFinite(position) ? position : null,
        reqId: id,
      });
    });
  }

  /* ============================================================
   * 音乐引擎核心（v2.0.0）——「初始」内建的媒体数据面
   *
   * 用户指令：SMTC 检测/歌词解析/时间戳对齐/进度插值全部写在「初始」里面，
   * 预设（面板 UI）只消费预计算结果，零计算。本函数即那个"里面"：
   *   - 解析逐字歌词（yrc）/行级歌词（lrc）+ 双语翻译对齐（一次性）；
   *   - 以宿主广播的锚点（position/fetchedAt/playing/rate）做本地时钟插值；
   *   - now() 同步返回 {position, progress, lineIndex, wordIndex, wordProgress,
   *     lineText, lineTr, wordText…}——预设的 rAF 直接取用即可渲染卡拉 OK；
   *   - seek 成功后乐观重锚（拖完立即生效，不等下一拍）；
   *   - 快照只在离散变化（曲目/封面/歌词/连接态）时推送（feed 由通道桥接）。
   * 通道桥接：
   *   - 脚本通道（makeChushi）：smtcPush/smtcTick → feed/tick（宿主 sandbox.ts
   *     已有的推送，不新增消息类型）；
   *   - 部件通道（widgetShim 字符串）：经 Function.toString() 原文内嵌 srcdoc，
   *     widgetSmtc/widgetSmtcTick → feed/tick。两通道零漂移（同一份源码）。
   * 契约（chushi.music）：snapshot()/now()/lyrics()/subscribe(cb)/seek(sec)/
   *   play/pause/toggle/next/prev。旧 chushi.smtc 保持原样兼容。
   * ============================================================ */
  function __chushiMusicCore(hooks) {
    var st = { cbs: [], snap: null, anchor: null, lines: null, lmode: 0, lrev: "\u0000none", parsed: false };

    function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }

    /* yrc：[start,dur](s,d,0)词(s,d,0)词… （毫秒）→ 词级行（行文本 t = 词串连接，
       供 lineText / gap 行回退展示） */
    function parseYrc(text) {
      var out = [], lines = String(text).split(/\r?\n/);
      for (var i = 0; i < lines.length; i++) {
        var m = lines[i].match(/^\[(\d+),(\d+)\](.*)$/);
        if (!m) continue;
        var s0 = +m[1], dur = Math.max(1, +m[2]), rest = m[3] || "";
        var words = [], re = /\((\d+),(\d+),\d+\)([^(]*)/g, wm, all = "";
        while ((wm = re.exec(rest))) { if (wm[3] !== "") { words.push({ s: +wm[1], d: Math.max(1, +wm[2]), t: wm[3] }); all += wm[3]; } }
        out.push({ s: s0, e: s0 + dur, t: all, tr: "", w: words });
      }
      out.sort(function (a, b) { return a.s - b.s; });
      return out;
    }
    /* lrc：[mm:ss.xx]文本 → 行级（行尾 = 下一行起点） */
    function parseLrc(text) {
      var out = [], lines = String(text).split(/\r?\n/);
      for (var i = 0; i < lines.length; i++) {
        var ts = lines[i].match(/\[(\d+):(\d+)(?:[.:](\d+))?\]/g);
        if (!ts) continue;
        var t = lines[i].replace(/\[[^\]]*\]/g, "").trim();
        for (var j = 0; j < ts.length; j++) {
          var m = ts[j].match(/\[(\d+):(\d+)(?:[.:](\d+))?\]/);
          var sec = (+m[1]) * 60 + (+m[2]) + (m[3] ? +("0." + m[3]) : 0);
          out.push({ s: Math.round(sec * 1000), e: 0, t: t, tr: "" });
        }
      }
      out.sort(function (a, b) { return a.s - b.s; });
      for (var k = out.length - 1; k > 0; k--) if (out[k].s === out[k - 1].s && out[k].t === out[k - 1].t) out.splice(k, 1);
      for (var q = 0; q < out.length; q++) out[q].e = q + 1 < out.length ? out[q + 1].s : out[q].s + 8000;
      return out;
    }
    /* 翻译按行首时间就近贴（winMs 容差） */
    function attachTr(lines, trLines, winMs) {
      if (!trLines || !trLines.length || !lines) return;
      for (var i = 0; i < lines.length; i++) {
        var best = null, bd = winMs;
        for (var j = 0; j < trLines.length; j++) { var d = Math.abs(trLines[j].s - lines[i].s); if (d <= bd) { bd = d; best = trLines[j]; } }
        if (best) {
          var tt = best.t || "";
          if (best.w && best.w.length) { tt = ""; for (var x = 0; x < best.w.length; x++) tt += best.w[x].t; }
          lines[i].tr = String(tt).trim();
        }
      }
    }
    function parseAll(ly) {
      if (ly.yrc) {
        var p = parseYrc(ly.yrc);
        if (p.length) {
          attachTr(p, ly.ytlrc ? parseYrc(ly.ytlrc) : null, 800);
          return { mode: 1, lines: p };
        }
      }
      if (ly.lrc) {
        var q = parseLrc(ly.lrc);
        if (q.length) {
          attachTr(q, ly.tlyric ? parseLrc(ly.tlyric) : null, 600);
          return { mode: 2, lines: q };
        }
      }
      return null;
    }

    /* 快照到达（离散变化才到）：重锚 + 按需解析歌词 + 推送公开快照 */
    function feed(state) {
      var t = state && state.track ? state.track : null;
      st.anchor = t
        ? { position: +t.position || 0, duration: +t.duration || 0, playing: !!t.playing, rate: +t.rate > 0 ? +t.rate : 1, fetchedAt: +t.fetchedAt || Date.now() }
        : null;
      var rev = state ? String(state.lyricRev || "") : "";
      if (rev !== st.lrev) { st.lrev = rev; st.lines = null; st.lmode = 0; st.parsed = false; }
      var ly = state && state.lyric;
      if (ly && !st.parsed) {
        var p = (ly.yrc || ly.lrc) ? parseAll(ly) : null;
        st.lmode = p ? p.mode : 0;
        st.lines = p ? p.lines : null;
        st.parsed = true;
      }
      if (!ly && st.lines) { st.lines = null; st.lmode = 0; }
      var snap = {
        connected: !!(state && state.connected),
        app: t ? String(t.app || "") : "",
        title: t ? String(t.title || "") : "",
        artist: t ? String(t.artist || "") : "",
        album: t ? String(t.album || "") : "",
        cover: (state && state.cover) || null,
        coverUrl: (state && state.coverUrl) || null,
        playing: t ? !!t.playing : false,
        duration: t ? +t.duration || 0 : 0,
        lyricRev: rev,
        lyric: st.lines ? { mode: st.lmode, lines: st.lines } : null,
      };
      st.snap = snap;
      for (var i = st.cbs.length - 1; i >= 0; i--) { try { st.cbs[i](snap); } catch (e) { } }
    }

    /* 每拍锚点（每秒必达）：只动锚点字段，不触发订阅回调（离散快照已含可见变化） */
    function tick(tk) {
      var a = st.anchor;
      if (!tk || !a) return;
      if (typeof tk.position === "number") a.position = tk.position;
      if (typeof tk.duration === "number") a.duration = tk.duration;
      if (typeof tk.playing === "boolean") a.playing = tk.playing;
      if (typeof tk.rate === "number" && tk.rate > 0) a.rate = tk.rate;
      if (typeof tk.fetchedAt === "number") a.fetchedAt = tk.fetchedAt;
    }

    function posNow() {
      var a = st.anchor;
      if (!a) return 0;
      var p = a.position + (a.playing ? (Date.now() - a.fetchedAt) / 1000 * a.rate : 0);
      return a.duration > 0 ? Math.min(a.duration, Math.max(0, p)) : Math.max(0, p);
    }

    /* 时间戳对齐：二分定位当前行/词，词内进度线性（0-1）——预设零计算 */
    function align(ms) {
      var L = st.lines;
      if (!L || !L.length) return null;
      var lo = 0, hi = L.length - 1;
      while (lo <= hi) { var mid = (lo + hi) >> 1; if (L[mid].s <= ms) lo = mid + 1; else hi = mid - 1; }
      var li = hi;
      if (li < 0) return { lineIndex: -1, wordIndex: -1, wordProgress: 0, lineProgress: 0 };
      var ln = L[li];
      var lp = clamp01((ms - ln.s) / Math.max(1, ln.e - ln.s));
      if (!ln.w || !ln.w.length) return { lineIndex: li, wordIndex: -1, wordProgress: 0, lineProgress: lp };
      lo = 0; hi = ln.w.length - 1;
      while (lo <= hi) { var m2 = (lo + hi) >> 1; if (ln.w[m2].s <= ms) lo = m2 + 1; else hi = m2 - 1; }
      var wi = hi, wp = 0;
      if (wi >= 0) wp = clamp01((ms - ln.w[wi].s) / Math.max(1, ln.w[wi].d));
      return { lineIndex: li, wordIndex: wi, wordProgress: wp, lineProgress: lp };
    }

    /* 实时态（rAF 每帧调用）：插值 + 对齐一次算好，卡拉 OK 扫色直接用 wordProgress */
    function now() {
      var p = posNow(), a = st.anchor;
      var d = a ? a.duration : 0;
      var al = align(p * 1000);
      var ln = al && al.lineIndex >= 0 ? st.lines[al.lineIndex] : null;
      var w = ln && al.wordIndex >= 0 && ln.w && ln.w.length ? ln.w[al.wordIndex] : null;
      return {
        position: p,
        duration: d,
        progress: d > 0 ? clamp01(p / d) : 0,
        playing: a ? a.playing : false,
        lineIndex: al ? al.lineIndex : -1,
        wordIndex: al ? al.wordIndex : -1,
        wordProgress: al ? al.wordProgress : 0,
        lineProgress: al ? al.lineProgress : 0,
        lineText: ln ? String(ln.t || "") : "",
        lineTr: ln ? String(ln.tr || "") : "",
        wordText: w ? String(w.t || "") : "",
      };
    }

    function snapshot() { return st.snap; }
    function lyrics() { return st.lines ? { mode: st.lmode, lines: st.lines } : null; }

    function subscribe(cb) {
      if (typeof cb !== "function") return function () { };
      st.cbs.push(cb);
      hooks.requestSubscribe();
      if (st.snap) { try { cb(st.snap); } catch (e) { } }
      return function () { var i = st.cbs.indexOf(cb); if (i >= 0) st.cbs.splice(i, 1); };
    }

    /* seek：提交成功即乐观重锚（拖完立即生效，不等下一拍 tick） */
    function seek(sec) {
      var s = typeof sec === "number" && isFinite(sec) ? Math.max(0, sec) : 0;
      return Promise.resolve(hooks.control("seek", s)).then(function (ok) {
        if (ok && st.anchor) { st.anchor.position = s; st.anchor.fetchedAt = Date.now(); }
        return ok === true;
      });
    }
    function simple(cmd) { return function () { return Promise.resolve(hooks.control(cmd, null)).then(function (ok) { return ok === true; }); }; }

    return {
      feed: feed, tick: tick, now: now, snapshot: snapshot, lyrics: lyrics,
      subscribe: subscribe, seek: seek,
      play: simple("play"), pause: simple("pause"), toggle: simple("toggle"),
      next: simple("next"), prev: simple("prev"),
    };
  }

  /** 为指定脚本构造受控 API（每个脚本一份，命令/入口互不可见对方内部状态） */
  function makeChushi(scriptKey) {
    /* ---------- fx 视觉效果面（v1.1.3）----------
     * mount(id, html)：把 <style>/<svg> 白名单结构幂等挂进宿主 fx-root；
     *   高级材质（折射/高光等）的全部引擎代码住在预设脚本里，宿主只提供作用面。
     * unmount(id)：摘除单挂载。删除预设时宿主整组回收，无需脚本配合。
     * onResize(cb)：订阅宿主玻璃容器快照（[{fx,key,w,h,radius}]），
     *   订阅即推全量，后续尺寸/增减变化随推；返回退订函数。 */
    var fxResizeCbs = [];
    var settingsCbs = [];
    settingsTargets.set(scriptKey, settingsCbs);
    var smtcCbs = [];
    smtcTargets.set(scriptKey, smtcCbs);
    /* 音乐引擎核心实例（v2.0.0）：喂数由全局 smtcPush/smtcTick 处理器桥接 */
    var musicApi = __chushiMusicCore({
      control: function (cmd, position) { return smtcControlReq(scriptKey, cmd, position); },
      requestSubscribe: function () {
        post({ type: "api", op: "smtcSubscribe", scriptKey: scriptKey });
      },
    });
    musicTargets.set(scriptKey, musicApi);

    function fxApi(op, id, html) {
      post({ type: "api", op: op, scriptKey: scriptKey, fxId: id, html: html });
      return new Promise(function (resolve) {
        var t = setTimeout(function () {
          delete pendingFx[id];
          resolve({ ok: false, message: "fx 调用超时" });
        }, 8000);
        pendingFx[id] = {
          f: function (r) {
            clearTimeout(t);
            resolve(r);
          },
        };
      });
    }
    var fxResizeCbs = [];
    fxTargets.set(scriptKey, fxResizeCbs);
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
      fx: {
        mount: function (id, html) {
          var fid = str(id, 32);
          if (!ID_RE.test(fid)) return Promise.resolve({ ok: false, message: "fx id 不合法" });
          if (typeof html !== "string" || !html) return Promise.resolve({ ok: false, message: "fx mount 缺少 html" });
          if (html.length > FX_HTML_MAX) return Promise.resolve({ ok: false, message: "fx mount 超出体积上限" });
          return fxApi("fxMount", fid, html);
        },
        unmount: function (id) {
          var fid = str(id, 32);
          if (!ID_RE.test(fid)) return Promise.resolve({ ok: false, message: "fx id 不合法" });
          return fxApi("fxUnmount", fid, undefined);
        },
        onResize: function (cb) {
          if (typeof cb !== "function") return function () {};
          fxResizeCbs.push(cb);
          fxApi("fxSubscribe", "__sub", undefined); /* "__sub" 为保留 id */
          return function () {
            var i = fxResizeCbs.indexOf(cb);
            if (i >= 0) fxResizeCbs.splice(i, 1);
          };
        },
      },
      /* ---------- 换材质（v1.7.0）：通用材质作用面 ----------
       * apply(spec)：spec = { css?, svg? } —— css 包 <style>、svg 直传，组包后
       *   走 fx mount（挂载 id 固定 "material"，重复 apply 幂等替换不闪断）。
       *   材质 CSS 直接用公开元素钩子（.search-pill/.cl-dock/.cl-panel/.glass-card）；
       *   高级贴图材质（折射类）配合 fx.onResize 快照按 data-fx 标记动态构造。
       * reset()：摘除本脚本的材质挂载（删除预设时宿主也会整组回收）。 */
      material: {
        apply: function (spec) {
          spec = spec && typeof spec === "object" ? spec : {};
          var css = typeof spec.css === "string" ? spec.css : "";
          var svg = typeof spec.svg === "string" ? spec.svg : "";
          var chunks = [];
          if (css) chunks.push("<style>" + css.replace(/<\/style/gi, "") + "</style>");
          if (svg) chunks.push(svg);
          if (chunks.length === 0)
            return Promise.resolve({ ok: false, message: "material.apply 需要 css 或 svg 至少一项" });
          return fxApi("fxMount", "material", chunks.join("\n"));
        },
        reset: function () {
          return fxApi("fxUnmount", "material", undefined);
        },
      },
      /* ---------- 设置面（v1.2.0）：预设向设置面板贡献调节项 ----------
       * define(schema)：声明白名单控件（slider/toggle/select），宿主校验后
       *   渲染进设置面板（整组拒绝制）；启动期同步调用一次即可。
       * get()：Promise<values> —— 宿主按当前 schema 校验持久化值并补默认值；
       *   消息有序，define 先于 get 到达宿主，get 必然按本脚本 schema 合并。
       * onChange(cb)：用户在设置面板改动时回调（values 为整组），返回退订函数。 */
      settings: {
        define: function (schema) {
          post({ type: "api", op: "settingsDefine", scriptKey: scriptKey, schema: schema });
        },
        get: function () {
          return new Promise(function (resolve) {
            var t = setTimeout(function () {
              delete pendingSettings[scriptKey];
              resolve({});
            }, 8000);
            pendingSettings[scriptKey] = {
              f: function (v) {
                clearTimeout(t);
                resolve(v || {});
              },
            };
            post({ type: "api", op: "settingsGet", scriptKey: scriptKey });
          });
        },
        onChange: function (cb) {
          if (typeof cb !== "function") return function () {};
          settingsCbs.push(cb);
          return function () {
            var i = settingsCbs.indexOf(cb);
            if (i >= 0) settingsCbs.splice(i, 1);
          };
        },
      },
      /* ---------- SMTC 媒体作用面（v1.8.0）----------
       * get()：Promise<state|null> —— 当前系统媒体会话快照（含连接态/封面 data URL）。
       * control(cmd, position?)：play/pause/toggle/next/prev/seek（seek 附秒），
       *   Promise<boolean> 兑现执行结果；cmd 白名单在宿主复核。
       * subscribe(cb)：快照变化即回调（position 不推，消费方按 fetchedAt 插值），
       *   订阅即回推当前值；返回退订函数。删除/冻结预设时宿主回收订阅。 */
      smtc: {
        get: function () {
          return new Promise(function (resolve) {
            var id = ++smtcSeq;
            var t = setTimeout(function () {
              delete pendingSmtc[id];
              resolve(null);
            }, 8000);
            pendingSmtc[id] = {
              f: function (v) {
                clearTimeout(t);
                resolve(v);
              },
            };
            post({ type: "api", op: "smtcGet", scriptKey: scriptKey, reqId: id });
          });
        },
        control: function (cmd, position) {
          return smtcControlReq(scriptKey, cmd, position);
        },
        subscribe: function (cb) {
          if (typeof cb !== "function") return function () {};
          smtcCbs.push(cb);
          post({ type: "api", op: "smtcSubscribe", scriptKey: scriptKey });
          return function () {
            var i = smtcCbs.indexOf(cb);
            if (i >= 0) smtcCbs.splice(i, 1);
          };
        },
      },
      /* ---------- 音乐引擎作用面（v2.0.0）----------
       * 「初始」内建的数据面：解析/插值/时间戳对齐都在宿主侧完成，
       * 预设零计算。now() 同步返回实时态（rAF 每帧调用即可）；
       * snapshot()/subscribe() 返回离散快照（含解析好的歌词结构）；
       * seek(sec) 成功即本地乐观重锚。旧 chushi.smtc 保持兼容。 */
      music: {
        snapshot: function () { return musicApi.snapshot(); },
        now: function () { return musicApi.now(); },
        lyrics: function () { return musicApi.lyrics(); },
        subscribe: musicApi.subscribe,
        seek: musicApi.seek,
        play: musicApi.play,
        pause: musicApi.pause,
        toggle: musicApi.toggle,
        next: musicApi.next,
        prev: musicApi.prev,
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

/* ---------- 沙箱小部件模式（?mode=widget，v1.0.7 角落磁贴 / v1.8.2 dock 弹出面板）----------
 * 作为小部件的「沙箱宿主」：接收应用层 renderWidget（含主题/强调色/panelMode），
 * 把 HTML 写进嵌套的 srcdoc iframe（sandbox="allow-scripts"，不透明源），并把
 * 部件内 chushi API（notify/open/storage/resize/close）带上 widgetKey 中继回应用层；
 * 应用层回传的 storage 结果与主题变更反向下发进部件。
 * panelMode（v1.8.2）：dock 表面部件以面板形态渲染，置 dataset.panel=1
 * （部件据此直开展开卡），chushi.close() 上报 closePanel 由应用层关闭弹层。
 * 两层隔离：应用层 → 本页（唯一源）→ 部件（不透明源），部件拿不到
 * 主文档/localStorage/扩展 API；open/storage/close 均由应用层白名单复核。 */
function widgetShim(theme, accent, panelMode) {
  var accentSet = /^#[0-9a-fA-F]{3,8}$/.test(accent || "")
    ? "document.documentElement.style.setProperty('--w-accent','" + accent + "');"
    : "";
  /* 音乐引擎核心（v2.0.0）：与脚本通道同一份源码（Function.toString 原文内嵌，
   * public/ 资产不经打包器，无压缩改写风险）——解析/插值/对齐全在宿主侧完成 */
  var musicSrc =
    "var __music=(" + __chushiMusicCore.toString() + ")({" +
    "control:function(c,p){return new Promise(function(res){var id=++seq;pending[id]={f:res,op:'smtcControl'};" +
    "post({type:'widgetApi',op:'smtcControl',cmd:String(c||'').slice(0,8)," +
    "position:(typeof p==='number'&&isFinite(p))?p:null,reqId:id})})}," +
    "requestSubscribe:function(){post({type:'widgetApi',op:'smtcSubscribe'})}});";
  return (
    "<script>(function(){var seq=0,pending={};function post(m){try{parent.postMessage(m,'*')}catch(e){}}" +
    "document.documentElement.dataset.theme='" + (theme === "dark" ? "dark" : "light") + "';" +
    (panelMode ? "document.documentElement.dataset.panel='1';" : "") +
    accentSet +
    "var smtcCbs=[];var lastSmtc=null;" +
    musicSrc +
    "window.chushi={notify:function(o){o=o||{};post({type:'widgetApi',op:'notify'," +
    "title:String(o.title||'').slice(0,24),description:String(o.description||'').slice(0,60)})}," +
    "open:function(u){post({type:'widgetApi',op:'open',url:String(u||'').slice(0,500)})}," +
    "close:function(){post({type:'widgetApi',op:'closePanel'})}," +
    "resize:function(w,h){post({type:'widgetApi',op:'resize',width:+w||0,height:+h||0})}," +
    "storage:{get:function(k){return new Promise(function(res){var id=++seq;pending[id]={f:res,op:'storageGet'};" +
    "post({type:'widgetApi',op:'storageGet',key:String(k||'').slice(0,64),reqId:id})})}," +
    "set:function(k,v){return new Promise(function(res){var id=++seq;pending[id]={f:res,op:'storageSet'};var s='';" +
    "try{var j=JSON.stringify(v);s=j==null?'':j}catch(e){}" +
    "post({type:'widgetApi',op:'storageSet',key:String(k||'').slice(0,64),value:s.slice(0,4000),reqId:id})})}}," +
    /* SMTC 媒体作用面（v1.8.0）：与脚本通道同契约（get/control/subscribe） */
    "smtc:{get:function(){return new Promise(function(res){var id=++seq;pending[id]={f:res,op:'smtcGet'};" +
    "post({type:'widgetApi',op:'smtcGet',reqId:id})})}," +
    "control:function(c,p){return new Promise(function(res){var id=++seq;pending[id]={f:res,op:'smtcControl'};" +
    "post({type:'widgetApi',op:'smtcControl',cmd:String(c||'').slice(0,8)," +
    "position:(typeof p==='number'&&isFinite(p))?p:null,reqId:id})})}," +
    "subscribe:function(cb){if(typeof cb!=='function')return function(){};smtcCbs.push(cb);" +
    "post({type:'widgetApi',op:'smtcSubscribe'});return function(){var i=smtcCbs.indexOf(cb);" +
    "if(i>=0)smtcCbs.splice(i,1)}}}," +
    /* 音乐引擎作用面（v2.0.0）：snapshot/now/lyrics/subscribe/seek/播放控制 */
    "music:{snapshot:function(){return __music.snapshot()},now:function(){return __music.now()}," +
    "lyrics:function(){return __music.lyrics()},subscribe:__music.subscribe,seek:__music.seek," +
    "play:__music.play,pause:__music.pause,toggle:__music.toggle,next:__music.next,prev:__music.prev}};" +
    "window.addEventListener('message',function(ev){var d=ev.data;if(!d||typeof d!=='object')return;" +
    "if(d.type==='widgetStorage'){var p=pending[d.reqId];if(!p)return;delete pending[d.reqId];" +
    "if(p.op==='storageGet'){var v=null;if(typeof d.value==='string'&&d.value.length){try{v=JSON.parse(d.value)}catch(e){v=d.value}}p.f(v)}else{p.f(d.ok===true)}};" +
    "if(d.type==='widgetSmtcResult'){var pc=pending[d.reqId];if(!pc)return;delete pending[d.reqId];pc.f(d.ok===true)};" +
    "if(d.type==='widgetSmtc'){var s=d.state&&typeof d.state==='object'?d.state:null;" +
    "lastSmtc=s;__music.feed(s);" +
    "for(var i=smtcCbs.length-1;i>=0;i--){try{smtcCbs[i](s)}catch(e){}}};" +
    "if(d.type==='widgetSmtcTick'){var tk=d.tick&&typeof d.tick==='object'?d.tick:null;" +
    /* 每拍轻量锚点（v1.9.0）：只改锚点字段，不覆盖 cover/lyric；seek 后新位置靠它到达 */
    "if(tk&&lastSmtc&&lastSmtc.track){" +
    "if(typeof tk.position==='number')lastSmtc.track.position=tk.position;" +
    "if(typeof tk.duration==='number')lastSmtc.track.duration=tk.duration;" +
    "if(typeof tk.playing==='boolean')lastSmtc.track.playing=tk.playing;" +
    "if(typeof tk.rate==='number')lastSmtc.track.rate=tk.rate;" +
    "if(typeof tk.fetchedAt==='number')lastSmtc.track.fetchedAt=tk.fetchedAt;" +
    "__music.tick(tk);" +
    "for(var i=smtcCbs.length-1;i>=0;i--){try{smtcCbs[i](lastSmtc)}catch(e){}}}};" +
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
      /* v2.0.1：本文档画布底色随主题。合成器在子帧首次绘制前用画布底色填充
         iframe（默认白）——dock 部件开面板的白色矩形帧即此；color-scheme:dark
         让预绘制帧变暗色，与暗色部件卡融为一体（开面板闪白根治的组合拳之一，
         另两手是宿主侧 boot 罩与无 opacity 聚拢） */
      try { document.documentElement.style.colorScheme = theme; } catch (e) { }
      inner = document.createElement("iframe");
      inner.setAttribute("sandbox", "allow-scripts");
      inner.setAttribute("title", "初始自定义小部件");
      inner.style.cssText =
        "position:fixed;inset:0;width:100%;height:100%;border:0;background:transparent";
      inner.srcdoc = widgetShim(theme, accent, m.panelMode === true) + m.html;
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
            cmd: str(d.cmd, 8),
            position: typeof d.position === "number" ? d.position : null,
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
    if ((m.type === "widgetSmtc" || m.type === "widgetSmtcResult" || m.type === "widgetSmtcTick") && inner && inner.contentWindow) {
      /* SMTC 通道下行：快照推送/每拍锚点/控制回执原样透传进部件 */
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

    if (m.type === "fxResize" && typeof m.scriptKey === "string") {
      /* 快照按 scriptKey 定向：只派发给该脚本的回调 */
      var targets = fxTargets.get(m.scriptKey);
      if (!targets || targets.length === 0) return;
      var items = Array.isArray(m.items) ? m.items : [];
      for (var ci = 0; ci < targets.length; ci++) {
        try {
          targets[ci](items);
        } catch (err) {
          post({ type: "runtimeError", message: errMsg(err) });
        }
      }
      return;
    }

    if (m.type === "fxResult") {
      var fid = str(m.fxId, 32);
      var p = pendingFx[fid];
      if (p) {
        delete pendingFx[fid];
        p.f({ ok: m.ok === true, message: str(m.message, 100) });
      }
      return;
    }

    if (m.type === "settingsValues" && typeof m.scriptKey === "string") {
      /* get 回执：兑现 pending（宿主已按 schema 校验并补默认值） */
      var ps = pendingSettings[m.scriptKey];
      if (ps) {
        delete pendingSettings[m.scriptKey];
        var vals = m.values && typeof m.values === "object" ? m.values : {};
        ps.f(vals);
      }
      return;
    }

    if (m.type === "settingsPush" && typeof m.scriptKey === "string") {
      /* 设置面板变更推送：整组 values 派发给本脚本 onChange 回调 */
      var cbs = settingsTargets.get(m.scriptKey);
      if (!cbs || cbs.length === 0) return;
      var pv = m.values && typeof m.values === "object" ? m.values : {};
      for (var sj = 0; sj < cbs.length; sj++) {
        try {
          cbs[sj](pv);
        } catch (err) {
          post({ type: "runtimeError", message: errMsg(err) });
        }
      }
      return;
    }

    if (m.type === "smtcPush" && typeof m.scriptKey === "string") {
      /* SMTC 快照定向推送（签名变化才到）：state 整包透传（宿主已白名单构造） */
      var st = smtcTargets.get(m.scriptKey);
      var mst = m.state && typeof m.state === "object" ? m.state : null;
      smtcLast.set(m.scriptKey, mst);
      var mua = musicTargets.get(m.scriptKey);
      if (mua && mst) mua.feed(mst); /* 音乐引擎同源喂数（v2.0.0） */
      if (!st || st.length === 0) return;
      for (var si = 0; si < st.length; si++) {
        try {
          st[si](mst);
        } catch (err) {
          post({ type: "runtimeError", message: errMsg(err) });
        }
      }
      return;
    }

    if (m.type === "smtcTick" && typeof m.scriptKey === "string") {
      /* 每拍轻量锚点（v1.9.0）：seek 后的新位置/插值漂移校正。
         只改锚点字段（position/duration/playing/rate/fetchedAt），
         不覆盖 cover/lyric 等重载荷；未拿到过快照则丢弃（下一拍再试）。 */
      var tk = m.tick && typeof m.tick === "object" ? m.tick : null;
      var last = smtcLast.get(m.scriptKey);
      if (!tk || !last || !last.track) return;
      if (typeof tk.position === "number") last.track.position = tk.position;
      if (typeof tk.duration === "number") last.track.duration = tk.duration;
      if (typeof tk.playing === "boolean") last.track.playing = tk.playing;
      if (typeof tk.rate === "number") last.track.rate = tk.rate;
      if (typeof tk.fetchedAt === "number") last.track.fetchedAt = tk.fetchedAt;
      var mua2 = musicTargets.get(m.scriptKey);
      if (mua2) mua2.tick(tk); /* 音乐引擎锚点同步（v2.0.0） */
      var stt = smtcTargets.get(m.scriptKey);
      if (!stt || stt.length === 0) return;
      for (var sj = 0; sj < stt.length; sj++) {
        try {
          stt[sj](last);
        } catch (err) {
          post({ type: "runtimeError", message: errMsg(err) });
        }
      }
      return;
    }

    if (m.type === "smtcGetResult") {
      var pg = pendingSmtc[m.reqId];
      if (pg) {
        delete pendingSmtc[m.reqId];
        pg.f(m.state && typeof m.state === "object" ? m.state : null);
      }
      return;
    }

    if (m.type === "smtcControlResult") {
      var pc = pendingSmtc[m.reqId];
      if (pc) {
        delete pendingSmtc[m.reqId];
        pc.f(m.ok === true);
      }
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
