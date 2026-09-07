  /* ============================================================
   * 音乐引擎核心（v5.0.0，第五代全新实现）——「初始」内建媒体数据面
   *
   * 职责分工律：插件产真值，引擎只搬运，本层管呈现——
   *   - 解析逐字歌词（yrc 括号时间轴）/行级歌词（lrc）+ 双语翻译对齐；
   *   - 锚点 = {position, fetchedAt, playing, rate, duration}，本地时钟
   *     插值：任何时刻的显示位置 = 锚点 + 已流逝，绝无逐帧累加，
   *     从根上排除累积漂移；
   *   - slew 吸收：播放中真值抖动 < 0.35s 的拍只确认不重锚
   *     （1s 轮询的到达抖动是逐字扫色肉眼抖动的来源）；
   *   - 暂停淡入淡出：播放→暂停翻转的当拍，按「当前词剩余时长」
   *     计算一次 fadeMs（用户指定的防漂移管线的最后一环），恢复沿用；
   *   - now() 同步返回预计算实时态，面板 rAF 直接取用，零计算。
   * 通道桥接（两通道同一份源码，零漂移）：
   *   - 脚本通道：全局 smtcPush/smtcTick 处理器 → feed/tick；
   *   - 部件通道：本函数经 Function.toString() 原文内嵌 widgetShim。
   * 契约（chushi.music）：feed/tick/now/snapshot/lyrics/subscribe/seek/
   *   play/pause/toggle/next/prev。
   * ============================================================ */
  function __chushiMusicCoreV5(hooks) {
    "use strict";
    var SLEW_SEC = 0.35;
    var anchor = null;        /* {position, duration, playing, rate, fetchedAt} */
    var snapCbs = [];
    var lastSnap = null;
    var parsed = null;        /* {mode, lines:[{s,e,t,tr,w:[{s,d,t}]}]} */
    var parsedKey = "\u0000none";
    var parsedRef = null;
    var fadeMs = 0;

    function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
    function rateOf() { return anchor && anchor.rate > 0 ? anchor.rate : 1; }

    /* ---- 本地时钟插值：唯一位置公式，绝不逐帧累加 ---- */
    function posNow() {
      if (!anchor) return 0;
      var p = anchor.position +
        (anchor.playing ? ((Date.now() - anchor.fetchedAt) / 1000) * rateOf() : 0);
      if (anchor.duration > 0) return clamp(p, 0, anchor.duration);
      return Math.max(0, p);
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
        parsed = { mode: 1, lines: yrcLines };
        return parsed;
      }
      var lrcLines = parseLineText(ly.lrc);
      if (lrcLines.length) {
        joinTranslation(lrcLines, ly.tlyric, 600);
        parsed = { mode: 2, lines: lrcLines };
        return parsed;
      }
      parsed = null;
      return null;
    }

    /* ---- 逐行/逐词二分定位 ---- */
    function alignAt(ms) {
      var data = ensureParsed(lastSnap && lastSnap._lyricRaw);
      var none = { lineIndex: -1, wordIndex: -1, wordProgress: 0, lineProgress: 0, lineText: "", lineTr: "", wordText: "" };
      if (!data || !data.lines.length) return none;
      var lines = data.lines;
      var lo = 0, hi = lines.length - 1, idx = -1;
      while (lo <= hi) {
        var mid = (lo + hi) >> 1;
        if (lines[mid].s <= ms) { idx = mid; lo = mid + 1; } else { hi = mid - 1; }
      }
      if (idx < 0 || ms > lines[idx].e + 200) return none;
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
      var out = {
        connected: !!(s && s.connected),
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
        needsUpdate: !!(s && s.needsUpdate),
        needsPlugin: !!(s && s.needsPlugin),
        needsBridge: !!(s && s.needsBridge),
        engineOld: !!(s && s.engineOld),
      };
      if (ly) {
        var data = ensureParsed(ly);
        if (data) {
          out.lyric = { mode: data.mode, lines: data.lines };
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
      anchor = {
        position: t && typeof t.position === "number" && isFinite(t.position) ? Math.max(0, t.position) : 0,
        duration: t && typeof t.duration === "number" && isFinite(t.duration) ? Math.max(0, t.duration) : 0,
        playing: !!(t && t.playing),
        rate: t && typeof t.rate === "number" && t.rate > 0 ? t.rate : 1,
        fetchedAt: t && typeof t.fetchedAt === "number" ? t.fetchedAt : Date.now(),
      };
      push();
    }

    /* ---- 节拍：slew 吸收 + 播放态翻转时算 fadeMs ---- */
    function tick(tk) {
      if (!anchor) return;
      if (!tk || typeof tk !== "object") return;
      var prevPlaying = anchor.playing;
      if (typeof tk.position === "number" && isFinite(tk.position)) {
        var expected = posNow();
        var reanchor = prevPlaying !== !!tk.playing || !anchor.playing ||
          Math.abs(tk.position - expected) >= SLEW_SEC;
        if (reanchor) {
          anchor.position = Math.max(0, tk.position);
          anchor.fetchedAt = typeof tk.fetchedAt === "number" && tk.fetchedAt > 0 ? tk.fetchedAt : Date.now();
        }
      }
      if (typeof tk.duration === "number" && isFinite(tk.duration) && tk.duration >= 0) anchor.duration = tk.duration;
      if (typeof tk.playing === "boolean") anchor.playing = tk.playing;
      if (typeof tk.rate === "number" && tk.rate > 0) anchor.rate = tk.rate;
      if (typeof tk.fetchedAt === "number" && tk.fetchedAt > 0 && !anchor.playing) anchor.fetchedAt = tk.fetchedAt;
      if (prevPlaying === true && anchor.playing === false) fadeMs = computeFadeMs();
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
        wordIndex: a.wordIndex,
        wordProgress: a.wordProgress,
        lineProgress: a.lineProgress,
        lineText: a.lineText,
        lineTr: a.lineTr,
        wordText: a.wordText,
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

    /* ---- 控制面：seek 成功即乐观重锚（拖完立即生效，不等下一拍） ---- */
    function seek(sec) {
      var s = typeof sec === "number" && isFinite(sec) ? Math.max(0, sec) : 0;
      return Promise.resolve(hooks.control("seek", s)).then(function (ok) {
        if (ok === true && anchor) {
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
      play: simple("play"), pause: simple("pause"), toggle: simple("toggle"),
      next: simple("next"), prev: simple("prev"),
    };
  }
