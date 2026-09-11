/* ============================================================================
 * 「初始」ext-lyric v8.2.8 —— 悬浮卡完全体歌词引擎（纯函数，零 DOM 依赖）
 *
 * v8.2.8 用户实机反馈两连：
 *   ① 歌词延迟补偿（LYR_LAG_MS=100）——「有些逐字歌词明显比唱出来的词
 *      更快」= SMTC position 领先音频输出的系统性差（Windows 共享模式音频
 *      引擎缓冲 + 设备缓冲 ≈ 60-100ms；v8.2.4 高光链路稳定后此差才显形）。
 *      align 入口统一 ms-LYR_LAG_MS：扫光等唱声到位。只影响歌词对齐——
 *      进度条/时间显示走 posNow 不受影响。
 *   ② 末词行尾硬终点律——部分歌曲末词 d 覆盖行内长伴奏（拖尾写进词
 *      时长），唱完后扫光仍缓慢爬（用户观感「非常糟糕」）。末词时长对
 *      行内其他词均长离群（>2.2 倍）时，有效时长压缩到均长 1.8 倍——
 *      伴奏段扫光提前定格挂住；正常歌（含真拖腔 1.5s 内）不触发。
 *
 * 为什么存在：悬浮音乐卡完全体没有「初始」宿主（sandbox.js 核心）在场，
 * 逐字/逐行歌词的解析与对齐必须自带。本文件与 public/sandbox.js 的歌词
 * 解析层 1:1 同语义（parseWordLine/parseWordText/parseLineText/
 * joinTranslation/unitizeLine/alignAt），含 v8.1.4 三律：
 *   ① 伪逐字时长估算律——lrc 行内按显示单元权重估演唱时长
 *      （CJK 字 ~260ms、拉丁词 ~130ms，下限 1.2s、上限行距），不铺满行距；
 *   ② 间奏 lastLine 律——align 落在行间间奏时返回 lastLine（已唱界），
 *      渲染层用它作「已唱界」防回退残留；
 *   ③ 翻译吸附律——ytlrc/tlyric 按最近行起点匹配（逐字窗 800ms/行级 600ms）。
 * 装配律：build-extension.py 把本文件拼在 ext-card.js 之前（内容脚本不支持
 * importScripts）；node 侧经 module.exports 直接单测同一份源码。
 * ==========================================================================*/
(function (root, factory) {
  var api = factory();
  if (root && typeof root === "object") root.ChuShiLyric = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  /* ---- 逐字行（yrc）：[start,dur](wStart,wDur,0)词(wStart,wDur,0)词… ---- */
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

  /* ---- 行级（lrc）：[mm:ss.xx]文本（多时间戳共享一行文本） ---- */
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

  /* ---- 翻译吸附：按最近行起点匹配（逐字窗 800ms / 行级窗 600ms） ---- */
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

  /* ---- 行内伪逐字：显示单元切分 + 权重均分（CJK 字×2/拉丁单词×1/空格×0.4） ---- */
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
    /* v8.1.4 伪逐字时长估算律：不铺满行距（行距含呼吸/间奏）——按显示单元
       权重估演唱时长（CJK ~260ms/字、拉丁 ~130ms/词），下限 1.2s、上限行距 */
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

  /* ---- 解析入口：yrc 优先（真逐字），lrc 兜底（伪逐字/逐行） ----
     返回 {mode:1, lines, src:"yrc"|"lrc"} | null
     渲染层判定：src==="yrc" 恒逐字；src==="lrc" 逐行（浮窗无强行逐字开关） */
  function parse(ly) {
    if (!ly || typeof ly !== "object") return null;
    var yrcLines = parseWordText(ly.yrc);
    if (yrcLines.length) {
      joinTranslation(yrcLines, ly.ytlrc, 800);
      return { mode: 1, lines: yrcLines, src: "yrc" };
    }
    var lrcLines = parseLineText(ly.lrc);
    if (lrcLines.length) {
      joinTranslation(lrcLines, ly.tlyric, 600);
      for (var u = 0; u < lrcLines.length; u++) unitizeLine(lrcLines[u]);
      return { mode: 1, lines: lrcLines, src: "lrc" };
    }
    return null;
  }

  /* ---- 逐行/逐词二分对齐（sandbox.js alignAt 纯函数版） ----
     返回 {lineIndex, lastLine, wordIndex, wordProgress, lineProgress}
     v8.2.9 行级时钟分离（用户实机反馈「逐行歌词慢了一点，就快一点点」）：
     v8.2.8 的 LYR_LAG_MS=100 是给逐字扫光的（SMTC 领先唱声 ~100ms）——
     但它把行级高亮/滚动也延后了 100ms，逐行模式显慢。现 align 增加第三参
     lineMode：逐行渲染时用原始时基（0ms 补偿，回到行界时序快一拍），
     逐字渲染仍用 -100ms（扫光等唱声）。调用方：ext-card lyricFrame 按
     lyMode 传参；面板走 sandbox.js alignAt 同律。 */
  var LYR_LAG_MS = 100; /* v8.2.8 逐字扫光延迟补偿（SMTC 领先音频输出的固定差） */
  var NONE = { lineIndex: -1, lastLine: -1, wordIndex: -1, wordProgress: 0, lineProgress: 0 };
  function align(data, msRaw, lineMode) {
    if (!data || !data.lines || !data.lines.length) return NONE;
    var ms = lineMode === true ? msRaw : msRaw - LYR_LAG_MS; /* 逐行 0ms / 逐字 -100ms */
    var lines = data.lines;
    var lo = 0, hi = lines.length - 1, idx = -1;
    while (lo <= hi) {
      var mid = (lo + hi) >> 1;
      if (lines[mid].s <= ms) { idx = mid; lo = mid + 1; } else { hi = mid - 1; }
    }
    if (idx < 0) {
      /* 首行预备律：前奏期即定位首行（未唱态），不再等到唱到才跳 */
      return { lineIndex: 0, lastLine: -1, wordIndex: -1, wordProgress: 0, lineProgress: 0 };
    }
    if (ms > lines[idx].e + 200) {
      /* 间奏：携带 lastLine（已唱界）——渲染层防回退残留的真相源 */
      var none = { lineIndex: -1, lastLine: idx, wordIndex: -1, wordProgress: 0, lineProgress: 0 };
      return none;
    }
    var ln = lines[idx];
    var lp = clamp((ms - ln.s) / Math.max(1, ln.e - ln.s), 0, 1);
    if (!ln.w) {
      return { lineIndex: idx, lastLine: -1, wordIndex: -1, wordProgress: 0, lineProgress: lp };
    }
    var ws = ln.w, wi = -1;
    lo = 0; hi = ws.length - 1;
    while (lo <= hi) {
      var mid2 = (lo + hi) >> 1;
      if (ws[mid2].s <= ms) { wi = mid2; lo = mid2 + 1; } else { hi = mid2 - 1; }
    }
    if (wi < 0) {
      return { lineIndex: idx, lastLine: -1, wordIndex: -1, wordProgress: 0, lineProgress: lp };
    }
    var wd = ws[wi];
    var wp = clamp((ms - wd.s) / Math.max(1, wd.d), 0, 1);
    /* v8.2.8 末词行尾硬终点律：末词 d 对行内其他词均长离群（>2.2 倍）=
     * 拖尾被写进词时长（行内长伴奏），压缩有效时长到均长 1.8 倍——
     * 伴奏段扫光提前定格；均长不可得（单词行）或非离群不触发。 */
    if (wi === ws.length - 1 && wp < 1) {
      var avgD = 0, cnt = 0;
      for (var q = 0; q < ws.length - 1; q++) { avgD += ws[q].d; cnt++; }
      avgD = cnt > 0 ? avgD / cnt : 0;
      if (avgD > 0 && wd.d > avgD * 2.2) {
        var wp2 = clamp((ms - wd.s) / Math.max(300, avgD * 1.8), 0, 1);
        if (wp2 > wp) wp = wp2;
      }
    }
    return { lineIndex: idx, lastLine: -1, wordIndex: wi, wordProgress: wp, lineProgress: lp };
  }

  /* ---- 暂停淡入淡出：按当前词剩余时长算一次（部件同管线） ---- */
  function fadeMs(data, ms) {
    if (!data || !data.lines || !data.lines.length) return 260;
    var a = align(data, ms);
    if (a.wordIndex >= 0) {
      var wd = data.lines[a.lineIndex].w[a.wordIndex];
      return clamp(Math.round(wd.s + wd.d - ms), 120, 420);
    }
    if (a.lineIndex >= 0) {
      var ln = data.lines[a.lineIndex];
      return clamp(Math.round(ln.e - ms), 120, 420);
    }
    return 260;
  }

  return {
    clamp: clamp,
    parseWordLine: parseWordLine,
    parseWordText: parseWordText,
    parseLineText: parseLineText,
    joinTranslation: joinTranslation,
    unitizeLine: unitizeLine,
    parse: parse,
    align: align,
    fadeMs: fadeMs,
  };
});
