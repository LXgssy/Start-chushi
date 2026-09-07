  function __chushiMusicCore(hooks) {
    /* ============================================================
     * ChuShi music core (v4 generation, rewritten from scratch).
     * Data plane of the built-in music engine. The plugin produces the
     * truth; the engine relays it; THIS layer renders it:
     *   - parse word-level (yrc) / line-level (lrc) lyrics + translations;
     *   - anchor = {position, fetchedAt, playing, rate, duration}: local
     *     clock interpolation between 1 Hz engine snapshots;
     *   - slew window: while playing, re-anchor only when the fresh truth
     *     drifted >= LY_SLEW_SEC from the interpolated clock (kills the
     *     per-poll arrival jitter that made karaoke sweep visibly twitch);
     *   - pause fade: on playing->paused compute fadeMs from the CURRENT
     *     word's remaining time (user pipeline: full lyrics -> truth
     *     timestamps -> pause-time fade -> zero cumulative drift);
     *   - now(): precomputed realtime state {position, progress,
     *     lineIndex, wordIndex, wordProgress, fadeMs...} for rAF renderers.
     * Contract (unchanged): feed/tick bridged by both channels;
     * snapshot()/now()/lyrics()/subscribe(cb)/seek(sec)/play/pause/
     * toggle/next/prev.
     * ============================================================ */
    var st = { cbs: [], snap: null, anchor: null, lines: null, lmode: 0, lrev: "\u0000none", parsedRef: null, fadeMs: 0 };
    var LY_SLEW_SEC = 0.35;

    function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
    function bisectLine(ms) {
      var L = st.lines, lo = 0, hi = L.length - 1;
      while (lo <= hi) { var mid = (lo + hi) >> 1; if (L[mid].s <= ms) lo = mid + 1; else hi = mid - 1; }
      return hi;
    }

    /* yrc: "[start,dur](s,d,0)word(s,d,0)word..." (ms) -> line objects */
    function parseYrc(text) {
      var out = [], rows = String(text).split(/\r?\n/);
      for (var i = 0; i < rows.length; i++) {
        var m = rows[i].match(/^\[(\d+),(\d+)\](.*)$/);
        if (!m) continue;
        var s0 = +m[1], dur = Math.max(1, +m[2]), rest = m[3] || "";
        var words = [], re = /\((\d+),(\d+),\d+\)([^(]*)/g, wm, joined = "";
        while ((wm = re.exec(rest))) {
          if (wm[3] !== "") { words.push({ s: +wm[1], d: Math.max(1, +wm[2]), t: wm[3] }); joined += wm[3]; }
        }
        out.push({ s: s0, e: s0 + dur, t: joined, tr: "", w: words });
      }
      out.sort(function (a, b) { return a.s - b.s; });
      return out;
    }

    /* lrc: "[mm:ss.xx]text" -> line objects (line end = next line start) */
    function parseLrc(text) {
      var out = [], rows = String(text).split(/\r?\n/);
      for (var i = 0; i < rows.length; i++) {
        var stamps = rows[i].match(/\[(\d+):(\d+)(?:[.:](\d+))?\]/g);
        if (!stamps) continue;
        var body = rows[i].replace(/\[[^\]]*\]/g, "").trim();
        for (var j = 0; j < stamps.length; j++) {
          var m = stamps[j].match(/\[(\d+):(\d+)(?:[.:](\d+))?\]/);
          var sec = (+m[1]) * 60 + (+m[2]) + (m[3] ? +("0." + m[3]) : 0);
          out.push({ s: Math.round(sec * 1000), e: 0, t: body, tr: "", w: null });
        }
      }
      out.sort(function (a, b) { return a.s - b.s; });
      for (var k = out.length - 1; k > 0; k--) if (out[k].s === out[k - 1].s && out[k].t === out[k - 1].t) out.splice(k, 1);
      for (var q = 0; q < out.length; q++) out[q].e = q + 1 < out.length ? out[q + 1].s : out[q].s + 8000;
      return out;
    }

    /* snap translations onto lines by nearest line start (winMs tolerance) */
    function attachTr(lines, trLines, winMs) {
      if (!trLines || !trLines.length || !lines) return;
      for (var i = 0; i < lines.length; i++) {
        var best = null, bd = winMs;
        for (var j = 0; j < trLines.length; j++) {
          var d = Math.abs(trLines[j].s - lines[i].s);
          if (d <= bd) { bd = d; best = trLines[j]; }
        }
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
        if (p.length) { attachTr(p, ly.ytlrc ? parseYrc(ly.ytlrc) : null, 800); return { mode: 1, lines: p }; }
      }
      if (ly.lrc) {
        var q = parseLrc(ly.lrc);
        if (q.length) { attachTr(q, ly.tlyric ? parseLrc(ly.tlyric) : null, 600); return { mode: 2, lines: q }; }
      }
      return null;
    }

    /* Discrete snapshot arrival: re-anchor + parse lyrics on demand */
    function feed(state) {
      var t = state && state.track ? state.track : null;
      st.anchor = t
        ? { position: +t.position || 0, duration: +t.duration || 0, playing: !!t.playing, rate: +t.rate > 0 ? +t.rate : 1, fetchedAt: +t.fetchedAt || Date.now() }
        : null;
      var rev = state ? String(state.lyricRev || "") : "";
      if (rev !== st.lrev) { st.lrev = rev; st.lines = null; st.lmode = 0; st.parsedRef = null; }
      var ly = state && state.lyric;
      /* re-parse only when the payload object reference changed (a stale
         payload riding along a song-change snapshot must never mark the
         NEW payload as already-parsed) */
      if (ly && st.parsedRef !== ly) {
        var p = (ly.yrc || ly.lrc) ? parseAll(ly) : null;
        st.lmode = p ? p.mode : 0;
        st.lines = p ? p.lines : null;
        st.parsedRef = ly;
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
        pluginVer: state && typeof state.pluginVer === "string" ? state.pluginVer.slice(0, 16) : "",
        smtcVer: state && typeof state.smtcVer === "string" ? state.smtcVer.slice(0, 16) : "",
        seekNote: state && typeof state.seekNote === "string" ? state.seekNote.slice(0, 40) : "",
        needsUpdate: !!(state && state.needsUpdate === true),
        needsPlugin: !!(state && state.needsPlugin === true),
        needsBridge: !!(state && state.needsBridge === true),
      };
      st.snap = snap;
      for (var i = st.cbs.length - 1; i >= 0; i--) { try { st.cbs[i](snap); } catch (e) { } }
    }

    function posNow() {
      var a = st.anchor;
      if (!a) return 0;
      var p = a.position + (a.playing ? (Date.now() - a.fetchedAt) / 1000 * a.rate : 0);
      return a.duration > 0 ? Math.min(a.duration, Math.max(0, p)) : Math.max(0, p);
    }

    /* fade duration = clamp(120..420ms, remaining time of the word in
       progress at the pause instant); fallback: line tail, then 260ms. */
    function calcFadeMs(ms) {
      var L = st.lines;
      if (!L || !L.length) return 260;
      var li = bisectLine(ms);
      if (li < 0) return 260;
      var ln = L[li];
      if (ln.w && ln.w.length) {
        var lo = 0, hi = ln.w.length - 1, wi = -1;
        while (lo <= hi) { var m2 = (lo + hi) >> 1; if (ln.w[m2].s <= ms) { wi = m2; lo = m2 + 1; } else hi = m2 - 1; }
        if (wi >= 0) return Math.max(120, Math.min(420, (ln.w[wi].s + ln.w[wi].d) - ms));
      }
      return Math.max(120, Math.min(420, ln.e - ms));
    }

    /* Per-second anchor tick. Slew: while playing, absorb truth drifts
       < LY_SLEW_SEC (display smoothing; the truth itself is untouched);
       big jumps / playing flips / seeks re-anchor immediately. Pause fade:
       compute once on the playing->paused edge, reuse for the fade-in. */
    function tick(tk) {
      var a = st.anchor;
      if (!tk || !a) return;
      var prevPlaying = a.playing;
      var expected = posNow();
      if (typeof tk.position === "number") {
        var reanchor = prevPlaying !== !!tk.playing || !a.playing || Math.abs(tk.position - expected) >= LY_SLEW_SEC;
        if (reanchor) {
          a.position = tk.position;
          a.fetchedAt = typeof tk.fetchedAt === "number" ? tk.fetchedAt : Date.now();
        }
      } else if (typeof tk.fetchedAt === "number") {
        a.fetchedAt = tk.fetchedAt;
      }
      if (typeof tk.duration === "number") a.duration = tk.duration;
      if (typeof tk.playing === "boolean") a.playing = tk.playing;
      if (typeof tk.rate === "number" && tk.rate > 0) a.rate = tk.rate;
      if (prevPlaying === true && a.playing === false) st.fadeMs = calcFadeMs(posNow());
    }

    /* Timestamp alignment: binary search current line/word (0-1 progress) */
    function align(ms) {
      var L = st.lines;
      if (!L || !L.length) return null;
      var li = bisectLine(ms);
      if (li < 0) return { lineIndex: -1, wordIndex: -1, wordProgress: 0, lineProgress: 0 };
      var ln = L[li];
      var lp = clamp01((ms - ln.s) / Math.max(1, ln.e - ln.s));
      if (!ln.w || !ln.w.length) return { lineIndex: li, wordIndex: -1, wordProgress: 0, lineProgress: lp };
      var lo = 0, hi = ln.w.length - 1, wi = -1;
      while (lo <= hi) { var m2 = (lo + hi) >> 1; if (ln.w[m2].s <= ms) { wi = m2; lo = m2 + 1; } else hi = m2 - 1; }
      var wp = wi >= 0 ? clamp01((ms - ln.w[wi].s) / Math.max(1, ln.w[wi].d)) : 0;
      return { lineIndex: li, wordIndex: wi, wordProgress: wp, lineProgress: lp };
    }

    /* Realtime state (called every rAF frame by renderers) */
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
        fadeMs: st.fadeMs || 0,
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

    /* seek: optimistic re-anchor on success (instant feedback; the next
       truth tick corrects or confirms) */
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
