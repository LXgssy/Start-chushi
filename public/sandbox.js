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
  /** 媒体通道状态（v5 全新命名）：get/control 共用 pending 表 + 定向快照回调集 */
  var pendingMedia = {};
  var mediaSnapCbs = new Map();
  /** 每脚本最近一份快照（smtcTick 锚点校正的落点） */
  var mediaLastSnap = new Map();
  var mediaReqSeq = 0;
  /** 音乐引擎核心实例：scriptKey → api（smtcPush/smtcTick 同源喂数） */
  var musicCores = new Map();

  /** 媒体控制请求（脚本通道共用实现）：8s 超时 Promise，白名单由宿主复核 */
  function mediaControlRequest(scriptKey, cmd, position) {
    return new Promise(function (resolve) {
      var id = ++mediaReqSeq;
      var t = setTimeout(function () {
        delete pendingMedia[id];
        resolve(false);
      }, 8000);
      pendingMedia[id] = {
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
   * 音乐引擎核心（v6.1 基座 + v8.1.0 乱跳根治，第七代语义）——「初始」内建媒体数据面
   * v8.1.0 三加固（用户实机录屏：歌曲正常播放但歌词 1:05↔1:06 秒级锯齿、
   * seek 后时间与歌词脱节）：
   *   ① 回退熔断——护航窗外播放中位置倒退 >1.2s 的拍先拒收，连续 2 拍
   *     才放行（上游 InfLink/元素双源交替与快照滞后的锯齿到不了显示层）；
   *   ② 护航窗翻转保窗——窗内播放态翻转只采纳状态，位置继续走目标轨迹
   *     （NCM seek 应用中 playing 瞬变不再废窗回锚陈旧值）；
   *   ③ 中间态保位 + 判歌容错——feed 陈旧/中间态快照一律保位到窗口过期；
   *     歌名比较去标点容错，SMTC 标题修饰差异不再误判换歌弃窗。
   *
   * 职责分工律：插件产真值，引擎只搬运，本层管呈现——
   *   - 解析逐字歌词（yrc 括号时间轴）/行级歌词（lrc）+ 双语翻译对齐；
   *   - v6.1 逐字全曲律（用户指定架构）：yrc 不覆盖所有歌曲——纯 lrc 歌
   *     在行内按显示单元（CJK 字符/拉丁单词，权重均分）生成伪逐字
   *     时间轴，时间基准完全取 SMTC 锚点（对表律），全曲都有逐字效果；
   *   - 锚点 = {position, fetchedAt, playing, rate, duration}，本地时钟
   *     插值：任何时刻的显示位置 = 锚点 + 已流逝，绝无逐帧累加，
   *     从根上排除累积漂移；
   *   - slew 吸收：播放中真值抖动 < 0.35s 的拍只确认不重锚
   *     （1s 轮询的到达抖动是逐字扫色肉眼抖动的来源）；
   *   - 暂停淡入淡出：播放→暂停翻转的当拍，按「当前词剩余时长」
   *     计算一次 fadeMs；恢复→播放翻转时的淡入期位置偏差（网易云
   *     淡入使 SMTC 恢复瞬间位置跳变）做 600ms 软重锚缓动入轨——
   *     防跳变，也防淡入期偏差被 slew 误吸收成永久漂移（用户指定
   *     「暂停时计算淡入淡出时间防累积漂移」管线）；
   *   - 首行预备律：曲目前奏（早于首行起点）即定位首行，不再等到
   *     唱到才跳（用户指定「播放时歌词立即跳到第一行」）；
   *   - 曲目一致性律：歌词 payload 的 songId 与曲目 songId 均在场且
   *     不同 → 歌词视为上一首残留，不渲染（切歌歌词滞留最后一道防线）；
   *   - now() 同步返回预计算实时态，面板 rAF 直接取用，零计算。
   * 通道桥接（两通道同一份源码，零漂移）：
   *   - 脚本通道：全局 smtcPush/smtcTick 处理器 → feed/tick；
   *   - 部件通道：本函数经 Function.toString() 原文内嵌 widgetShim。
   * 契约（chushi.music）：feed/tick/now/snapshot/lyrics/subscribe/seek/
   *   play/pause/toggle/next/prev。
   * ============================================================ */
  function __chushiMusicCoreV6(hooks) {
    "use strict";
    var SLEW_SEC = 0.35;
    var SOFT_MS = 600;        /* 恢复淡入期软重锚窗口（缓动入轨） */
    var anchor = null;        /* {position, duration, playing, rate, fetchedAt} */
    var snapCbs = [];
    var lastSnap = null;
    var parsed = null;        /* {mode, lines:[{s,e,t,tr,w:[{s,d,t}]}]} */
    var parsedKey = "\u0000none";
    var parsedRef = null;
    var fadeMs = 0;
    var soft = null;          /* {from,at,dur} 恢复期软重锚（淡入期防漂移） */
    var guard = null;         /* v8.0.9 seek 护航窗 {from,to,at,dur,song} */
    var guardGraceAt = 0;     /* v8.1.0 护航窗收窗豁免期起点（真值跟随回退不算锯齿） */
    /* v8.1.0 回退熔断：上游源交替/快照滞后的回退拍拒收（乱跳防线纵深） */
    var backStreak = 0;
    /* v8.1.3 恒源钉守：8s 窗口内重现近似拒收值 = 上游停滞（桥停推/hub 半死
       /SMTC 时间线冻结，真机录屏 18:28：页面把陈旧真值 +6s 封顶后每拍喂
       恒定值，熔断「拒 1 拍→第 2 拍硬锚回跳」循环成 1:06↔1:08 两秒闪烁；
       age 锯齿源则两值交替重现——重现本身才是停滞的铁证，单次拒收不触发）。
       rejHist=近期拒收值史(≤4条/8s)；capPos/capAt=显示上限（拒收值+0.75，
       仍在拒收带内）与刷新时刻——显示最多超前真值 0.75s，不再向前虚构再拽回。 */
    var rejHist = [];
    var capPos = 0, capAt = 0;
    /* v8.2.0 频谱（律动高光数据面）：最近一帧 {on,bass,bands,t}；
       setSpectrum 由沙箱通道（smtcSpectrum）与部件通道（widgetSmtcSpectrum）
       双通道同源喂数，now() 随帧携带 bass/bands —— 部件零计算取用 */
    var spec = null;

    function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
    function rateOf() { return anchor && anchor.rate > 0 ? anchor.rate : 1; }
    /* v8.1.0 歌名容错比较（去空白/全半角标点）——SMTC 与插件源的标题修饰
       差异不再误判成「换歌」而误弃护航窗（误弃 = 拖后第一记回弹） */
    function normTitle(s) {
      return String(s || "").toLowerCase()
        .replace(/[\s\-_·・()（）\[\]【】「」『』,，。、!！?？~～'\"＂]+/g, "");
    }
    function sameSong(a, b) {
      var x = normTitle(a), y = normTitle(b);
      if (!x || !y) return x === y;
      return x === y || x.indexOf(y) >= 0 || y.indexOf(x) >= 0;
    }

    /* ---- 本地时钟插值：唯一位置公式，绝不逐帧累加 ----
       baseNow = 锚点轨迹（SMTC 真值）；posNow = 软重锚混合后的显示位置 */
    function baseNow() {
      if (!anchor) return 0;
      var p = anchor.position +
        (anchor.playing ? ((Date.now() - anchor.fetchedAt) / 1000) * rateOf() : 0);
      if (anchor.duration > 0) return clamp(p, 0, anchor.duration);
      return Math.max(0, p);
    }
    function posNow() {
      var p = baseNow();
      /* v8.1.3 恒源钉守：封顶 3s 内显示不得超前钉守值+0.75（软重锚出轨道
         同样受束）——上游恢复/封顶过期后自然释放 */
      if (capPos > 0 && Date.now() - capAt < 3000) {
        if (p > capPos) p = capPos;
        if (soft) { /* 软窗混合输出同样受束（防淡入期越过钉守值） */
          var el0 = Date.now() - soft.at;
          if (el0 < soft.dur) {
            var fromP0 = soft.from + (el0 / 1000) * rateOf();
            var t0 = el0 / soft.dur;
            var k0 = t0 * t0 * (3 - 2 * t0);
            var out0 = fromP0 + (p - fromP0) * k0;
            if (out0 > capPos) p = capPos;
          }
        }
      }
      if (soft) {
        var el = Date.now() - soft.at;
        if (el >= soft.dur) { soft = null; return p; }
        /* 旧轨迹继续走 + smoothstep 入轨到新锚轨迹：淡入期位置偏差
           平滑吸收（既不跳变，也不残留为永久漂移） */
        var fromP = soft.from + (el / 1000) * rateOf();
        var t = el / soft.dur;
        var k = t * t * (3 - 2 * t);
        var out = fromP + (p - fromP) * k;
        if (anchor.duration > 0) return clamp(out, 0, anchor.duration);
        return Math.max(0, out);
      }
      return p;
    }

    /* ---- 歌词解析（一次性，缓存按 rev + 对象引用双重失效） ---- */
    function parseWordLine(line) {
      var head = /^\s*\[(\d+),(\d+)\]/.exec(line);
      if (!head) return null; /* JSON 版权头行等非时间轴内容一律跳过 */
      var s = +head[1], d = +head[2];
      var marks = [], m;
      var re = /\((\d+),(\d+),\d+\)/g;
      while ((m = re.exec(line))) marks.push({ at: m.index, len: m[0].length, s: +m[1], d: +m[2] });
      if (!marks.length) return null;
      var words = [];
      for (var i = 0; i < marks.length; i++) {
        var from = marks[i].at + marks[i].len;
        var to = i + 1 < marks.length ? marks[i + 1].at : line.length;
        var txt = line.slice(from, to);
        if (txt) words.push({ s: marks[i].s, d: marks[i].d, t: txt });
      }
      if (!words.length) return null;
      return { s: s, e: s + d, t: words.map(function (w) { return w.t; }).join(""), tr: "", w: words };
    }

    function parseWordText(text) {
      var lines = [];
      var rows = String(text || "").split("\n");
      for (var i = 0; i < rows.length; i++) {
        var ln = parseWordLine(rows[i]);
        if (ln) lines.push(ln);
      }
      lines.sort(function (a, b) { return a.s - b.s; });
      return lines;
    }

    function parseLineText(text) {
      var out = [];
      var rows = String(text || "").split("\n");
      for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        if (!row) continue;
        var times = [], m;
        var re = /\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
        while ((m = re.exec(row))) {
          times.push(+m[1] * 60 + +m[2] + (m[3] ? +(m[3] + "000").slice(0, 3) / 1000 : 0));
        }
        if (!times.length) continue;
        var txt = row.slice(row.lastIndexOf("]") + 1).trim();
        for (var t = 0; t < times.length; t++) {
          out.push({ s: Math.round(times[t] * 1000), e: 0, t: txt, tr: "", w: null });
        }
      }
      out.sort(function (a, b) { return a.s - b.s; });
      for (var k = 0; k < out.length; k++) {
        out[k].e = k + 1 < out.length ? out[k + 1].s : out[k].s + 8000;
      }
      /* 去重：同刻同文只留一条 */
      var dedup = [];
      for (var j = 0; j < out.length; j++) {
        var prev = dedup[dedup.length - 1];
        if (prev && prev.s === out[j].s && prev.t === out[j].t) continue;
        dedup.push(out[j]);
      }
      return dedup;
    }

    /* 翻译吸附：按最近行起点匹配（逐字窗 800ms / 行级窗 600ms） */
    function joinTranslation(lines, trText, windowMs) {
      var trs = parseLineText(trText);
      if (!trs.length || !lines.length) return;
      var j = 0;
      for (var i = 0; i < lines.length; i++) {
        while (j + 1 < trs.length && trs[j + 1].s <= lines[i].s) j++;
        var best = -1, bestGap = windowMs;
        for (var k = Math.max(0, j - 2); k < Math.min(trs.length, j + 3); k++) {
          var gap = Math.abs(trs[k].s - lines[i].s);
          if (gap <= bestGap) { bestGap = gap; best = k; }
        }
        if (best >= 0 && trs[best].t) lines[i].tr = trs[best].t;
      }
    }

    function ensureParsed(ly) {
      if (!ly || typeof ly !== "object") return null;
      var key = String(ly.yrc || "").length + ":" + String(ly.lrc || "").length;
      if (parsedRef === ly && parsedKey === key) return parsed;
      parsedRef = ly;
      parsedKey = key;
      var yrcLines = parseWordText(ly.yrc);
      if (yrcLines.length) {
        joinTranslation(yrcLines, ly.ytlrc, 800);
        /* v8.1.4 src 标记：真逐字（yrc 词级时间轴）/伪逐字（lrc 估算）
           可区分——部件「强行逐字」开关只降级伪逐字，真逐字永不降级 */
        parsed = { mode: 1, lines: yrcLines, src: "yrc" };
        return parsed;
      }
      var lrcLines = parseLineText(ly.lrc);
      if (lrcLines.length) {
        joinTranslation(lrcLines, ly.tlyric, 600);
        /* v6.1 逐字全曲律（用户指定架构）：yrc 不覆盖所有歌曲，纯 lrc 歌
           行内按显示单元加权均分生成伪逐字时间轴，时间基准取 SMTC 锚点
           （暂停态可用桥侧 yrc 校准重查升级真逐字）。mode 置 1 走逐字渲染。 */
        for (var u = 0; u < lrcLines.length; u++) unitizeLine(lrcLines[u]);
        parsed = { mode: 1, lines: lrcLines, src: "lrc" };
        return parsed;
      }
      parsed = null;
      return null;
    }

    /* ---- 行内伪逐字：显示单元切分 + 权重均分（CJK 字符×2/拉丁单词×1/空格×0.4） ---- */
    function unitizeLine(ln) {
      if (!ln.t || ln.w) return;
      var toks = [], buf = "", bw = 0;
      function flush() { if (buf) { toks.push({ t: buf, w: bw }); buf = ""; bw = 0; } }
      for (var i = 0; i < ln.t.length; ) {
        var code = ln.t.codePointAt(i) || 0;
        var adv = code > 0xFFFF ? 2 : 1;
        var ch = String.fromCodePoint(code);
        var isCJK = (code >= 0x2E80 && code <= 0x9FFF) || (code >= 0xF900 && code <= 0xFAFF) ||
          (code >= 0x3000 && code <= 0x30FF) || (code >= 0xFF00 && code <= 0xFFEF);
        if (isCJK) { flush(); toks.push({ t: ch, w: 2 }); }
        else if (/\s/.test(ch)) { flush(); toks.push({ t: ch, w: 0.4 }); }
        else { buf += ch; bw += 1; }
        i += adv;
      }
      flush();
      if (!toks.length) return;
      /* v8.1.4 伪逐字时长估算律：不再铺满行距——行距含行间呼吸/间奏
         （lrc 行 e = 下一行 s、末行 s+8000），铺满 = 唱完后扫光仍爬行、
         句尾持续高亮直到下一句。改按显示单元权重估实际演唱时长
         （CJK 字 w=2→~260ms/字、拉丁词 w=1→~130ms/词），下限 1.2s，
         上限仍为行距；扫完即被部件渐隐律收尾，间奏段干净。 */
      var span = Math.max(400, ln.e - ln.s), sum = 0, j;
      for (j = 0; j < toks.length; j++) sum += toks[j].w;
      var dur = Math.min(span, Math.max(1200, Math.round(sum * 130)));
      var at = ln.s;
      ln.w = [];
      for (j = 0; j < toks.length; j++) {
        var d = dur * toks[j].w / sum;
        ln.w.push({ s: Math.round(at), d: Math.round(d), t: toks[j].t });
        at += d;
      }
    }

    /* ---- 逐行/逐词二分定位 ---- */
    function alignAt(ms) {
      var data = ensureParsed(lastSnap && lastSnap._lyricRaw);
      var none = { lineIndex: -1, lastLine: -1, wordIndex: -1, wordProgress: 0, lineProgress: 0, lineText: "", lineTr: "", wordText: "" };
      if (!data || !data.lines.length) return none;
      var lines = data.lines;
      var lo = 0, hi = lines.length - 1, idx = -1;
      while (lo <= hi) {
        var mid = (lo + hi) >> 1;
        if (lines[mid].s <= ms) { idx = mid; lo = mid + 1; } else { hi = mid - 1; }
      }
      if (idx < 0) {
        /* v6.1 首行预备律：前奏期（早于首行起点）即定位首行（未唱态），
           不再等到唱到才跳（用户指定）；尾声（末行已过）维持间奏灰。 */
        var l0 = lines[0];
        return { lineIndex: 0, wordIndex: -1, wordProgress: 0, lineProgress: 0, lineText: l0.t, lineTr: l0.tr, wordText: "" };
      }
      if (ms > lines[idx].e + 200) {
        /* v8.1.4 间奏携带 lastLine（已唱到哪一行）：回退落在间奏时，部件
           用它作「已唱界」替代回退前行号——回退后未唱行不再被误标已唱 */
        none.lastLine = idx;
        return none;
      }
      var ln = lines[idx];
      var lp = clamp((ms - ln.s) / Math.max(1, ln.e - ln.s), 0, 1);
      if (!ln.w) {
        return { lineIndex: idx, wordIndex: -1, wordProgress: 0, lineProgress: lp, lineText: ln.t, lineTr: ln.tr, wordText: "" };
      }
      var ws = ln.w, wi = -1;
      lo = 0; hi = ws.length - 1;
      while (lo <= hi) {
        var mid2 = (lo + hi) >> 1;
        if (ws[mid2].s <= ms) { wi = mid2; lo = mid2 + 1; } else { hi = mid2 - 1; }
      }
      if (wi < 0) {
        return { lineIndex: idx, wordIndex: -1, wordProgress: 0, lineProgress: lp, lineText: ln.t, lineTr: ln.tr, wordText: "" };
      }
      var wd = ws[wi];
      var wp = clamp((ms - wd.s) / Math.max(1, wd.d), 0, 1);
      return {
        lineIndex: idx, wordIndex: wi, wordProgress: wp, lineProgress: lp,
        lineText: ln.t, lineTr: ln.tr, wordText: wd.t,
      };
    }

    /* ---- 暂停淡入淡出：按当前词剩余时长算一次（用户指定管线） ---- */
    function computeFadeMs() {
      var ms = posNow() * 1000;
      var a = alignAt(ms);
      var data = ensureParsed(lastSnap && lastSnap._lyricRaw);
      if (a.wordIndex >= 0 && data) {
        var wd = data.lines[a.lineIndex].w[a.wordIndex];
        return clamp(Math.round(wd.s + wd.d - ms), 120, 420);
      }
      if (a.lineIndex >= 0 && data) {
        var ln = data.lines[a.lineIndex];
        return clamp(Math.round(ln.e - ms), 120, 420);
      }
      return 260;
    }

    /* ---- 离散快照：宿主状态 → 白名单快照（歌词就地解析） ----
     * 宿主 SmtcState 形态：track.{app,title,artist,album,playing,duration}
     * 嵌套；coverUrl/lyric/版本/提示在顶层。快照输出为拍平后的消费形态。 */
    function whitelist(s) {
      var t = s && s.track && typeof s.track === "object" ? s.track : null;
      var ly = s && s.lyric && typeof s.lyric === "object" ? s.lyric : null;
      var songId = t && typeof t.songId === "number" && isFinite(t.songId) ? Math.max(0, t.songId) : 0;
      var out = {
        connected: !!(s && s.connected),
        songId: songId,
        app: t ? String(t.app || "").slice(0, 40) : "",
        title: t ? String(t.title || "").slice(0, 200) : "",
        artist: t ? String(t.artist || "").slice(0, 200) : "",
        album: t ? String(t.album || "").slice(0, 200) : "",
        cover: s && typeof s.cover === "string" ? s.cover.slice(0, 500000) : "",
        coverUrl: s && typeof s.coverUrl === "string" ? s.coverUrl.slice(0, 500) : "",
        playing: !!(t && t.playing),
        duration: t && typeof t.duration === "number" && isFinite(t.duration) ? Math.max(0, t.duration) : 0,
        lyricRev: s ? String(s.lyricRev || "").slice(0, 80) : "",
        lyric: null,
        pluginVer: s ? String(s.pluginVer || "").slice(0, 16) : "",
        smtcVer: s ? String(s.smtcVer || "").slice(0, 16) : "",
        seekNote: s ? String(s.seekNote || "").slice(0, 40) : "",
        cmdLast: s && s.cmdLast && typeof s.cmdLast === "object" ? {
          id: Number(s.cmdLast.id) || 0,
          type: String(s.cmdLast.type || "").slice(0, 16),
          ok: typeof s.cmdLast.ok === "boolean" ? s.cmdLast.ok : null,
          path: String(s.cmdLast.path || "").slice(0, 16),
          at: Number(s.cmdLast.at) || 0,
        } : null,
        needsUpdate: !!(s && s.needsUpdate),
        needsPlugin: !!(s && s.needsPlugin),
        needsBridge: !!(s && s.needsBridge),
        engineOld: !!(s && s.engineOld),
      };
      if (ly) {
        /* v6.1 曲目一致性律：歌词 payload 归属另一曲目（songId 双方在场且
           不同）= 上一首残留，一律不渲染——切歌歌词滞留的最后一道防线 */
        var lyId = Number(ly.songId) || 0;
        var stale = songId > 0 && lyId > 0 && lyId !== songId;
        var data = stale ? null : ensureParsed(ly);
        if (data) {
          out.lyric = { mode: data.mode, lines: data.lines, songId: lyId, src: data.src || "" };
          out._lyricRaw = ly; /* 内部字段：定位/淡入淡出用 */
        }
      }
      return out;
    }

    function push() {
      for (var i = snapCbs.length - 1; i >= 0; i--) {
        try { snapCbs[i](lastSnap); } catch (e) { /* 单订阅方异常互不干扰 */ }
      }
    }

    function feed(state) {
      lastSnap = whitelist(state && typeof state === "object" ? state : null);
      var t = state && state.track && typeof state.track === "object" ? state.track : null;
      /* v8.0.9 护航窗内的快照喂入：换歌（title 变）即弃窗；同曲陈旧快照
         （位置仍在拖动前轨迹上、距目标 >2s）保位不回锚——seekNote 清空等
         签名变化会立即触发 feed，不保位就是拖动后的第一记回弹。
         v8.1.0 两处补洞：①判歌用容错比较（SMTC/插件标题修饰差异不再
         误弃窗）；②「既不在旧轨迹也不在目标」的中间态快照改保位而非
         弃窗——NCM seek 应用中会短暂上报过渡值，旧实现弃窗即回锚过渡
         值（录屏 17s：时间 2:02 歌词却显示拖前段落 = 中间态回锚实锤），
         保位到窗口过期再诚实仲裁（真失败多等 ≤4.5s，绝不乱跳）。 */
      var keepPos = null;
      if (guard && t && typeof t.position === "number" && isFinite(t.position)) {
        if (!sameSong(lastSnap ? String(lastSnap.title || "") : "", guard.song)) {
          guard = null;
        } else if (Math.abs(t.position - guard.to) > 2) {
          /* 旧轨迹上的陈旧快照或 NCM seek 应用中的中间态快照：一律保位
             （posNow 沿目标轨迹），窗口过期再诚实仲裁——中间态弃窗就是
             拖动后歌词跳回拖前段落的那一跳（v8.1.0） */
          keepPos = posNow();
        } else {
          guard = null; /* 真值已到目标附近，护航完成 */
        }
      }
      /* v8.1.3：全量重锚即解除恒源钉守（新快照自带最新真值） */
      rejHist = []; capPos = 0;
      anchor = {
        position: keepPos != null ? Math.max(0, keepPos)
          : t && typeof t.position === "number" && isFinite(t.position) ? Math.max(0, t.position) : 0,
        duration: t && typeof t.duration === "number" && isFinite(t.duration) ? Math.max(0, t.duration) : 0,
        playing: !!(t && t.playing),
        rate: t && typeof t.rate === "number" && t.rate > 0 ? t.rate : 1,
        fetchedAt: keepPos != null ? Date.now()
          : t && typeof t.fetchedAt === "number" ? t.fetchedAt : Date.now(),
      };
      soft = null; /* 新快照全量重锚：软窗口作废 */
      push();
    }

    /* ---- 节拍：slew 吸收 + 播放态翻转算 fadeMs + 恢复期软重锚 ----
       v6.1 防漂移管线（用户指定）：暂停→恢复翻转时 SMTC 位置常带淡入期
       偏差（±0.2~0.5s 瞬跳）。偏差 ≤2s 时启动 600ms 软重锚：显示位置从
       旧轨迹 smoothstep 入轨到新锚轨迹——不跳变，窗口结束锚定真值，
       淡入期偏差不会成为永久漂移；>2s（seek/切歌）仍硬锚。
       v8.0.9 seek 护航窗（拖动回弹 + 歌词乱跳同根治）：拖动成功即乐观
       重锚到目标，而桥真值要 1~3 拍才收敛——期间每拍都携带拖动前的旧
       位置，旧版 |Δ|≥SLEW 就硬锚回旧值 = 进度条回弹几秒才跳真。
       护航窗（4.5s）内：仍在旧轨迹/中间态（距目标 >2s）的同态陈旧拍
       直接忽略；真值到目标 ±2s 即确认放行；窗口过期还没等到确认就
       放行正常仲裁（拖动真失败时诚实回锚）；播放态翻转一律放行——
       暂停/播放时的逐字歌词校准管线原样保留（用户指定「校准方法
       不变」，收窗时记 grace 豁免期防真值跟随被熔断误拦）。
       v8.1.0 回退熔断：稳态跟踪期（无窗且离上次收窗 >6s）播放中
       位置倒退 0.6~6s 的拍先拒收，连续 2 拍才放行——上游双源交替/
       快照滞后的秒级锯齿到不了显示层。 */
    function tick(tk) {
      if (!anchor) return;
      if (!tk || typeof tk !== "object") return;
      var prevPlaying = anchor.playing;
      if (typeof tk.position === "number" && isFinite(tk.position)) {
        /* v8.1.3 恒源钉守：播放态翻转即解除钉守（暂停/恢复校准管线优先） */
        if (prevPlaying !== !!tk.playing) { rejHist = []; capPos = 0; }
        var expected = posNow();
        var delta = tk.position - expected;
        if (guard) {
          var gEl = Date.now() - guard.at;
          var gTo = Math.abs(tk.position - guard.to);
          if (gEl < guard.dur && gTo > 2 && prevPlaying === !!tk.playing) {
            return; /* 同态陈旧拍/中间态：忽略，目标轨迹继续走 */
          }
          guard = null; /* 真值到达 / 翻转放行 / 窗口过期 → 正常仲裁 */
          guardGraceAt = Date.now(); /* 收窗豁免期：真值跟随的回退不算锯齿 */
        }
        /* v8.1.0 回退熔断（仅稳态跟踪期，grace 6s 豁免）：播放中位置比
           插值显示位置倒退 0.6~6s 的拍先拒收——上游 InfLink/元素双源
           交替（录屏 1:05↔1:06 锯齿）的回跳幅面 ~1s 正落在带内；真值
           收窗跟随（grace 内）与大幅回退（≤-6s，真 seek 回退）放行；
           连续 2 拍回退 = 恒定回退源，第 2 拍放行诚实跟随。暂停/播放
           翻转拍不熔断（校准管线不变——用户指定）。 */
        if (prevPlaying === !!tk.playing && anchor.playing &&
            delta < -0.6 && delta > -6 &&
            Date.now() - guardGraceAt > 6000) {
          backStreak++;
          /* v8.1.3 恒源钉守：本次拒收值与 8s 内历史拒收值重现（|Δ|<0.15）
             = 上游停滞铁证 → 显示封顶在拒收值+0.75（仍在拒收带内），不重锚
             不回跳；每次拒收都刷新封顶时效（否则过期瞬间 baseNow 冲高、
             下拍 delta 出带硬锚重置，4 拍周期循环——首版实测）。 */
          var matched = -1;
          for (var rh = 0; rh < rejHist.length; rh++) {
            if (Date.now() - rejHist[rh].at < 8000 &&
                Math.abs(tk.position - rejHist[rh].v) < 0.15) { matched = rh; break; }
          }
          if (matched >= 0) {
            capPos = tk.position + 0.75;
            capAt = Date.now();
            rejHist[matched].at = Date.now();
          } else {
            rejHist.push({ v: tk.position, at: Date.now() });
            if (rejHist.length > 4) rejHist.shift();
          }
          if (backStreak < 2) return; /* v8.1.0 语义：首记拒收只记史不重锚 */
          /* 连续 2 拍回退且值在变 = 真值慢爬：第 2 拍诚实放行（下方重锚） */
        } else if (prevPlaying === !!tk.playing || !anchor.playing) {
          /* 非熔断拍到达（前进/翻转/暂停）：历史过期不清理也无碍——
             钉守保持/解除交由下方 capFresh 仲裁 */
        }
        backStreak = 0;
        var capFresh = capPos > 0 && Date.now() - capAt < 3000;
        var reanchor = prevPlaying !== !!tk.playing || !anchor.playing ||
          Math.abs(delta) >= SLEW_SEC;
        /* v8.1.3 钉守保持：封顶新鲜时，非前进拍（delta < +0.35）一律不重锚
           ——age 锯齿源的边界拍（-0.55/+0.35）不再把显示拽回 0.5s；
           真前进（≥+0.35）照常重锚并解除钉守 */
        if (reanchor && capFresh && prevPlaying === !!tk.playing &&
            anchor.playing && delta < 0.35) {
          reanchor = false;
        }
        if (reanchor) {
          capPos = 0; /* 重锚即解除钉守；rejHist 保留——重现证据靠 8s 窗口自然过期 */
          if (prevPlaying === false && tk.playing === true &&
              Math.abs(delta) > 0.05 && Math.abs(delta) <= 2) {
            soft = { from: posNow(), at: Date.now(), dur: SOFT_MS };
          } else if (Math.abs(delta) > 2 || prevPlaying !== !!tk.playing) {
            soft = null;
          }
          anchor.position = Math.max(0, tk.position);
          anchor.fetchedAt = typeof tk.fetchedAt === "number" && tk.fetchedAt > 0 ? tk.fetchedAt : Date.now();
        }
      }
      if (typeof tk.duration === "number" && isFinite(tk.duration) && tk.duration >= 0) anchor.duration = tk.duration;
      if (typeof tk.playing === "boolean") anchor.playing = tk.playing;
      if (typeof tk.rate === "number" && tk.rate > 0) anchor.rate = tk.rate;
      if (typeof tk.fetchedAt === "number" && tk.fetchedAt > 0 && !anchor.playing) anchor.fetchedAt = tk.fetchedAt;
      if (prevPlaying === true && anchor.playing === false) { fadeMs = computeFadeMs(); soft = null; }
    }

    /* ---- 实时态（面板 rAF 每帧取用） ---- */
    function now() {
      var ms = posNow() * 1000;
      var a = alignAt(ms);
      var dur = anchor ? anchor.duration : 0;
      return {
        position: ms / 1000,
        duration: dur,
        progress: dur > 0 ? clamp(ms / (dur * 1000), 0, 1) : 0,
        playing: anchor ? anchor.playing : false,
        fadeMs: fadeMs,
        lineIndex: a.lineIndex,
        lastLine: a.lastLine,
        wordIndex: a.wordIndex,
        wordProgress: a.wordProgress,
        lineProgress: a.lineProgress,
        lineText: a.lineText,
        lineTr: a.lineTr,
        wordText: a.wordText,
        /* v8.2.0 律动数据：旧宿主无此字段 → 部件守卫降级静态高光 */
        bass: spec && typeof spec.bass === "number" && isFinite(spec.bass)
          ? clamp(spec.bass, 0, 1) : 0,
        bands: spec && spec.on && Array.isArray(spec.bands) ? spec.bands : null,
      };
    }

    function snapshot() { return lastSnap; }
    function lyrics() { return ensureParsed(lastSnap && lastSnap._lyricRaw); }

    function subscribe(cb) {
      if (typeof cb !== "function") return function () { };
      snapCbs.push(cb);
      if (hooks && typeof hooks.requestSubscribe === "function") hooks.requestSubscribe();
      if (lastSnap) { try { cb(lastSnap); } catch (e) { } }
      return function () {
        var i = snapCbs.indexOf(cb);
        if (i >= 0) snapCbs.splice(i, 1);
      };
    }

    /* ---- 控制面：seek 成功即乐观重锚（拖完立即生效，不等下一拍） ----
       v8.0.9：重锚同时开启护航窗（4.5s）——窗内忽略拖动前旧轨迹的
       陈旧拍，真值到目标±2s 提前收窗；拖动真失败时窗口过期诚实回锚。 */
    function seek(sec) {
      var s = typeof sec === "number" && isFinite(sec) ? Math.max(0, sec) : 0;
      return Promise.resolve(hooks.control("seek", s)).then(function (ok) {
        if (ok === true && anchor) {
          rejHist = []; capPos = 0; /* v8.1.3：拖动即解除钉守 */
          guard = {
            from: posNow(),
            to: s,
            at: Date.now(),
            dur: 4500,
            song: lastSnap ? String(lastSnap.title || "") : "",
          };
          anchor.position = s;
          anchor.fetchedAt = Date.now();
        }
        return ok === true;
      });
    }

    function simple(cmd) {
      return function () {
        return Promise.resolve(hooks.control(cmd, null)).then(function (ok) { return ok === true; });
      };
    }

    return {
      feed: feed, tick: tick, now: now, snapshot: snapshot, lyrics: lyrics,
      subscribe: subscribe, seek: seek,
      setSpectrum: function (sp) { spec = sp && typeof sp === "object" ? sp : null; },
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
    var coreCbs = [];
    mediaSnapCbs.set(scriptKey, coreCbs);
    /* 音乐引擎核心实例（v5）：喂数由全局 smtcPush/smtcTick 处理器桥接 */
    var coreApi = __chushiMusicCoreV6({
      control: function (cmd, position) { return mediaControlRequest(scriptKey, cmd, position); },
      requestSubscribe: function () {
        post({ type: "api", op: "smtcSubscribe", scriptKey: scriptKey });
      },
    });
    musicCores.set(scriptKey, coreApi);

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
      /* ---------- SMTC 媒体作用面（v5 全新实现）----------
       * get()：Promise<state|null> 当前媒体快照（宿主白名单产物）；
       * control(cmd, position?)：play/pause/toggle/next/prev/seek（seek 附秒），
       *   Promise<boolean> 兑现执行结果；subscribe(cb)：快照变化即回调。 */
      smtc: {
        get: function () {
          return new Promise(function (resolve) {
            var id = ++mediaReqSeq;
            var t = setTimeout(function () {
              delete pendingMedia[id];
              resolve(null);
            }, 8000);
            pendingMedia[id] = {
              f: function (v) {
                clearTimeout(t);
                resolve(v);
              },
            };
            post({ type: "api", op: "smtcGet", scriptKey: scriptKey, reqId: id });
          });
        },
        control: function (cmd, position) {
          return mediaControlRequest(scriptKey, cmd, position);
        },
        subscribe: function (cb) {
          if (typeof cb !== "function") return function () {};
          coreCbs.push(cb);
          post({ type: "api", op: "smtcSubscribe", scriptKey: scriptKey });
          return function () {
            var i = coreCbs.indexOf(cb);
            if (i >= 0) coreCbs.splice(i, 1);
          };
        },
      },
      /* ---------- 音乐引擎作用面（v5 全新实现）----------
       * 解析/插值/时间戳对齐全在宿主侧完成，预设零计算；
       * now() 同步返回实时态（rAF 每帧取用）；seek 成功即乐观重锚。 */
      music: {
        snapshot: function () { return coreApi.snapshot(); },
        now: function () { return coreApi.now(); },
        lyrics: function () { return coreApi.lyrics(); },
        subscribe: coreApi.subscribe,
        seek: coreApi.seek,
        play: coreApi.play,
        pause: coreApi.pause,
        toggle: coreApi.toggle,
        next: coreApi.next,
        prev: coreApi.prev,
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
      inner.srcdoc = withShimAfterDoctype(shim, m.html);
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

/* v8.0.1 标准模式律：shim 必须插在 doctype 之后——srcdoc 里任何先于
 * <!doctype> 的元素都会让 doctype 失效 → 文档落入 quirks 模式（百分比
 * 高度/图片尺寸解析全变，曾致部件封面 img width:100% 铺满整面板）。
 * 无 doctype 的裸 HTML 保持旧拼接（本来就没标准模式可言）。 */
function withShimAfterDoctype(shim, html) {
  if (typeof html !== "string") return shim;
  var m = html.match(/^(\s*<!--[\s\S]*?-->\s*|<!doctype[^>]*>\s*)/i);
  if (m && m[1]) return m[1] + shim + html.slice(m[1].length);
  var lt = html.match(/<html[^>]*>/i);
  if (lt && lt.index !== undefined) {
    var at = lt.index + lt[0].length;
    return html.slice(0, at) + shim + html.slice(at);
  }
  return shim + html;
}

/* ---------- 沙箱小部件模式（?mode=widget，v1.0.7 角落磁贴 / v1.8.2 dock 弹出面板）----------
 * 作为小部件的「沙箱宿主」：接收应用层 renderWidget（含主题/强调色/panelMode），
 * 把 HTML 写进嵌套的 srcdoc iframe（sandbox="allow-scripts"，不透明源），并把
 * 部件内 chushi API（notify/open/storage/resize/close）带上 widgetKey 中继回应用层；
 * 应用层回传的 storage 结果与主题变更反向下发进部件。
 * panelMode（v1.8.2）：dock 表面部件以面板形态渲染，置 dataset.panel=1。
 * v5：音乐引擎核心经 Function.toString() 原文内嵌（同一份源码，两通道零漂移）。 */
function widgetShim(theme, accent, panelMode) {
  var accentSet = /^#[0-9a-fA-F]{3,8}$/.test(accent || "")
    ? "document.documentElement.style.setProperty('--w-accent','" + accent + "');"
    : "";
  var musicSrc =
    "var __music=(" + __chushiMusicCoreV6.toString() + ")({" +
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
    "smtc:{get:function(){return new Promise(function(res){var id=++seq;pending[id]={f:res,op:'smtcGet'};" +
    "post({type:'widgetApi',op:'smtcGet',reqId:id})})}," +
    "control:function(c,p){return new Promise(function(res){var id=++seq;pending[id]={f:res,op:'smtcControl'};" +
    "post({type:'widgetApi',op:'smtcControl',cmd:String(c||'').slice(0,8)," +
    "position:(typeof p==='number'&&isFinite(p))?p:null,reqId:id})})}," +
    "subscribe:function(cb){if(typeof cb!=='function')return function(){};smtcCbs.push(cb);" +
    "post({type:'widgetApi',op:'smtcSubscribe'});return function(){var i=smtcCbs.indexOf(cb);" +
    "if(i>=0)smtcCbs.splice(i,1)}}}," +
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
    "if(tk&&lastSmtc&&lastSmtc.track){" +
    "if(typeof tk.position==='number')lastSmtc.track.position=tk.position;" +
    "if(typeof tk.duration==='number')lastSmtc.track.duration=tk.duration;" +
    "if(typeof tk.playing==='boolean')lastSmtc.track.playing=tk.playing;" +
    "if(typeof tk.rate==='number')lastSmtc.track.rate=tk.rate;" +
    "if(typeof tk.fetchedAt==='number')lastSmtc.track.fetchedAt=tk.fetchedAt;" +
    "__music.tick(tk);" +
    "for(var i=smtcCbs.length-1;i>=0;i--){try{smtcCbs[i](lastSmtc)}catch(e){}}}};" +
    "if(d.type==='widgetTheme'){document.documentElement.dataset.theme=d.theme==='dark'?'dark':'light';" +
    "if(d.accent)document.documentElement.style.setProperty('--w-accent',d.accent)};" +
    /* v8.2.0 频谱帧：部件通道同源喂数（setSpectrum 与沙箱通道同一核心实例） */
    "if(d.type==='widgetSmtcSpectrum'){__music.setSpectrum(d.sp&&typeof d.sp==='object'?d.sp:null)}});" +
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
      inner.srcdoc = withShimAfterDoctype(widgetShim(theme, accent, m.panelMode === true), m.html);
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
    if ((m.type === "widgetSmtc" || m.type === "widgetSmtcResult" || m.type === "widgetSmtcTick" || m.type === "widgetSmtcSpectrum") && inner && inner.contentWindow) {
      /* SMTC 通道下行：快照推送/每拍锚点/控制回执/频谱帧原样透传进部件
         v8.2.7 根修：widgetSmtcSpectrum 此前漏在透传白名单外——宿主
         SpectrumClient 频谱帧永远到不了部件 iframe，now().bass 恒 0，
         「初始」面板律动恒静态（浮窗有、面板没有的分叉点即此）。 */
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
      /* 快照定向推送（签名变化才到）：state 整包透传，音乐核心同源喂数 */
      var snapCbs = mediaSnapCbs.get(m.scriptKey);
      var snapMsg = m.state && typeof m.state === "object" ? m.state : null;
      mediaLastSnap.set(m.scriptKey, snapMsg);
      var coreA = musicCores.get(m.scriptKey);
      if (coreA && snapMsg) coreA.feed(snapMsg);
      if (!snapCbs || snapCbs.length === 0) return;
      for (var ai = 0; ai < snapCbs.length; ai++) {
        try {
          snapCbs[ai](snapMsg);
        } catch (err) {
          post({ type: "runtimeError", message: errMsg(err) });
        }
      }
      return;
    }

    if (m.type === "smtcTick" && typeof m.scriptKey === "string") {
      /* 每拍锚点：只改锚点字段，不覆盖重载荷；未拿到过快照则丢弃 */
      var tk = m.tick && typeof m.tick === "object" ? m.tick : null;
      var lastSnapMsg = mediaLastSnap.get(m.scriptKey);
      if (!tk || !lastSnapMsg || !lastSnapMsg.track) return;
      if (typeof tk.position === "number") lastSnapMsg.track.position = tk.position;
      if (typeof tk.duration === "number") lastSnapMsg.track.duration = tk.duration;
      if (typeof tk.playing === "boolean") lastSnapMsg.track.playing = tk.playing;
      if (typeof tk.rate === "number") lastSnapMsg.track.rate = tk.rate;
      if (typeof tk.fetchedAt === "number") lastSnapMsg.track.fetchedAt = tk.fetchedAt;
      var coreB = musicCores.get(m.scriptKey);
      if (coreB) coreB.tick(tk);
      var tickCbs = mediaSnapCbs.get(m.scriptKey);
      if (!tickCbs || tickCbs.length === 0) return;
      for (var bi = 0; bi < tickCbs.length; bi++) {
        try {
          tickCbs[bi](lastSnapMsg);
        } catch (err) {
          post({ type: "runtimeError", message: errMsg(err) });
        }
      }
      return;
    }

    if (m.type === "smtcSpectrum" && typeof m.scriptKey === "string") {
      /* v8.2.0 频谱帧（30Hz）：定向喂数音乐核心，now() 随帧携带 */
      var coreS = musicCores.get(m.scriptKey);
      if (coreS && typeof coreS.setSpectrum === "function") {
        coreS.setSpectrum(m.sp && typeof m.sp === "object" ? m.sp : null);
      }
      return;
    }

    if (m.type === "smtcGetResult") {
      var getWaiter = pendingMedia[m.reqId];
      if (getWaiter) {
        delete pendingMedia[m.reqId];
        getWaiter.f(m.state && typeof m.state === "object" ? m.state : null);
      }
      return;
    }

    if (m.type === "smtcControlResult") {
      var ctlWaiter = pendingMedia[m.reqId];
      if (ctlWaiter) {
        delete pendingMedia[m.reqId];
        ctlWaiter.f(m.ok === true);
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
