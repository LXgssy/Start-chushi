/* ============================================================================
 * ChuShi SMTC Manager v6.0.0  (generation 6, written from scratch)
 *
 * What this plugin is:
 *   The Windows System Media Transport Controls (SMTC) owner for the
 *   ChuShi music panel, implemented 100% inside the renderer with the
 *   standard navigator.mediaSession API. Chromium turns mediaSession
 *   metadata / playbackState / positionState / action handlers into a
 *   full native SMTC session of this renderer, independent from
 *   NetEase Music's own SMTC switch:
 *     - NetEase SMTC switch OFF  -> our session is the only one (recommended)
 *     - NetEase SMTC switch ON   -> we refresh the session continuously,
 *                                   our updates win (last writer wins)
 *   There is NO external engine, NO helper program, NO background process, NO
 *   filesystem writes. If this plugin is uninstalled the session simply
 *   disappears with it.
 *
 * Bus contract (window CustomEvents, same renderer):
 *   listens "cc:music-state"  detail = snapshot broadcast by ChuShi Music
 *                             Bridge (v6 field set, see bridge index.js)
 *   emits  "cc:smtc-cmd"      detail = { cmd, position?, id } system-side
 *                             commands (media keys / flyout) forwarded to
 *                             the bridge for single-execution playback
 *   emits  "cc:smtc-ack"      detail = { v, session, at } heartbeat so the
 *                             bridge can honestly report SMTC health
 *
 * Panel language rule (user mandate): plugin NAME is English, all user
 * facing copy (descriptions, panel text) is Chinese.
 * ==========================================================================*/
(function () {
  "use strict";
  if (window.__chushiSmtcManagerV6) return;
  window.__chushiSmtcManagerV6 = true;

  var PLUGIN_VERSION = "6.0.0";

  var EV_STATE = "cc:music-state";
  var EV_CMD = "cc:smtc-cmd";
  var EV_ACK = "cc:smtc-ack";
  var HEARTBEAT_MS = 5000;

  function log(m) {
    try { console.log("[ChuShi SMTC Manager " + PLUGIN_VERSION + "] " + m); } catch (e) { }
  }
  function emit(name, detail) {
    try { window.dispatchEvent(new CustomEvent(name, { detail: detail })); } catch (e) { }
  }

  /* --------------------------------------------------------------------
   * Feature detection - honest, never fake a session we cannot own
   * ------------------------------------------------------------------ */
  var ms = (typeof navigator !== "undefined" && navigator.mediaSession) ? navigator.mediaSession : null;
  var canMeta = false, canPos = false;
  if (ms) {
    canMeta = typeof window.MediaMetadata === "function";
    canPos = typeof ms.setPositionState === "function";
  }
  /* session: "active" (owning a real session) | "idle" (waiting for truth)
             | "unsupported" (mediaSession missing in this renderer) */
  var sessionState = ms ? "idle" : "unsupported";

  /* --------------------------------------------------------------------
   * Local playback clock - powers seekbackward/seekforward and guards
   * position freshness between bridge snapshots
   * ------------------------------------------------------------------ */
  var clock = { pos: 0, dur: 0, playing: false, at: 0 };

  function clockNow() {
    if (!clock.playing) return clock.pos;
    return clock.pos + (Date.now() - clock.at) / 1000;
  }

  function clockReset(posSec, durSec, playing) {
    clock.pos = isFinite(posSec) && posSec > 0 ? posSec : 0;
    clock.dur = isFinite(durSec) && durSec > 0 ? durSec : 0;
    clock.playing = playing === true;
    clock.at = Date.now();
  }

  /* --------------------------------------------------------------------
   * Command forwarding (id makes the bridge dedupe honestly)
   * ------------------------------------------------------------------ */
  var cmdSeq = 0;
  var lastCmd = "";

  function sendCmd(cmd, positionSec) {
    var id = "smtc-" + (++cmdSeq) + "-" + Date.now();
    lastCmd = cmd + (typeof positionSec === "number" ? "@" + Math.round(positionSec) + "s" : "");
    emit(EV_CMD, { cmd: cmd, position: positionSec, id: id, v: PLUGIN_VERSION });
    log("command -> " + lastCmd);
  }

  /* --------------------------------------------------------------------
   * Action handlers - registered once, they only forward commands
   * ------------------------------------------------------------------ */
  function registerActions() {
    if (!ms) return;
    var def = [
      ["play", function () { sendCmd("play"); }],
      ["pause", function () { sendCmd("pause"); }],
      ["previoustrack", function () { sendCmd("prev"); }],
      ["nexttrack", function () { sendCmd("next"); }],
      ["stop", function () { sendCmd("pause"); }],
      ["seekbackward", function () { var p = Math.max(0, clockNow() - 10); sendCmd("seek", p); }],
      ["seekforward", function () {
        var p = clockNow() + 10;
        if (clock.dur > 0 && p > clock.dur) p = clock.dur;
        sendCmd("seek", p);
      }],
      ["seekto", function (d) {
        var t = d && typeof d.seekTime === "number" && isFinite(d.seekTime) ? d.seekTime : null;
        if (t === null) return;
        if (clock.dur > 0 && t > clock.dur) t = clock.dur;
        if (t < 0) t = 0;
        sendCmd("seek", t);
      }],
    ];
    for (var i = 0; i < def.length; i++) {
      try { ms.setActionHandler(def[i][0], def[i][1]); } catch (e) { /* optional action */ }
    }
  }

  /* --------------------------------------------------------------------
   * Session application - metadata / playbackState / positionState
   * All writes guarded; a failure degrades the session, never the page.
   * ------------------------------------------------------------------ */
  function clip(v, n) {
    var s = typeof v === "string" ? v : (v == null ? "" : String(v));
    return s.slice(0, n);
  }

  function artworkUrl(pic) {
    if (!pic || !/^https?:\/\//.test(pic)) return [];
    var src = pic;
    if (src.indexOf("?") < 0) src = src + "?param=500y500";
    return [{ src: src, sizes: "500x500", type: "image/jpeg" }];
  }

  function applySnapshot(s) {
    if (!ms) { sessionState = "unsupported"; return; }
    var hasTrack = !!(s && typeof s.title === "string" && s.title.length > 0);
    if (!hasTrack) {
      try { ms.metadata = null; } catch (e) { }
      try { ms.playbackState = "none"; } catch (e) { }
      clockReset(0, 0, false);
      sessionState = "idle";
      ack();
      return;
    }
    var dur = typeof s.duration === "number" && isFinite(s.duration) ? Math.max(0, s.duration) : 0;
    var pos = typeof s.position === "number" && isFinite(s.position) ? Math.max(0, s.position) : 0;
    if (dur > 0 && pos > dur) pos = dur;

    if (canMeta) {
      try {
        ms.metadata = new window.MediaMetadata({
          title: clip(s.title, 120),
          artist: clip(s.artist, 120),
          album: clip(s.album, 120),
          artwork: artworkUrl(s.pic),
        });
      } catch (e) { log("metadata failed: " + (e && e.message)); }
    }
    try { ms.playbackState = s.playing === true ? "playing" : "paused"; } catch (e) { }

    if (canPos && dur > 0) {
      try { ms.setPositionState({ duration: dur, playbackRate: 1, position: pos }); } catch (e) { }
    }
    clockReset(pos, dur, s.playing === true);
    sessionState = "active";
    ack();
  }

  /* --------------------------------------------------------------------
   * Heartbeat - the bridge reports our health to the page truthfully
   * ------------------------------------------------------------------ */
  var lastAckAt = 0;
  function ack() {
    lastAckAt = Date.now();
    emit(EV_ACK, { v: PLUGIN_VERSION, session: sessionState, at: lastAckAt });
  }
  setInterval(function () {
    ack();
  }, HEARTBEAT_MS);

  /* --------------------------------------------------------------------
   * Bus wiring
   * ------------------------------------------------------------------ */
  window.addEventListener(EV_STATE, function (ev) {
    try { applySnapshot(ev && ev.detail); } catch (e) { log("apply failed: " + (e && e.message)); }
  });

  registerActions();
  setTimeout(ack, 400);
  log("ready (mediaSession " + (ms ? "available" : "MISSING") + ", session=" + sessionState + ")");

  /* --------------------------------------------------------------------
   * Config panel (BetterNCM settings page) - Chinese copy per user rule
   * ------------------------------------------------------------------ */
  try {
    if (typeof plugin !== "undefined" && plugin && typeof plugin.onConfig === "function") {
      plugin.onConfig(function () {
        var box = document.createElement("div");
        box.style.cssText = "font-size:13px;line-height:1.9;padding:4px 2px;color:var(--text1,#333)";
        var head = document.createElement("div");
        head.style.cssText = "font-weight:bold;margin-bottom:6px";
        head.textContent = "初始 · 满血 SMTC 管理器 v" + PLUGIN_VERSION;
        box.appendChild(head);
        var lines = {};
        var order = ["session", "track", "cmd", "note"];
        for (var i = 0; i < order.length; i++) {
          var d = document.createElement("div");
          d.style.cssText = "font-family:monospace";
          box.appendChild(d);
          lines[order[i]] = d;
        }
        var note = document.createElement("div");
        note.style.cssText = "margin-top:6px;color:var(--text2,#888);font-size:12px";
        note.textContent = "本插件不需要开启网易云自带的 SMTC 开关，保持关闭即可；" +
          "系统悬浮窗/锁屏/媒体键由本插件直接提供。播放真值由「ChuShi Music Bridge」提供，" +
          "歌词由「ChuShi Lyric Source」提供。";
        box.appendChild(note);

        var sessionName = {
          active: "正常 · 系统媒体会话由本插件持有",
          idle: "等待播放数据（未在播放，或桥插件未运行）",
          unsupported: "当前网易云内核不支持 mediaSession（本插件无法提供系统会话）",
        };

        function render() {
          lines.session.textContent = "会话：" + (sessionName[sessionState] || sessionState);
          var t = "";
          if (clock.dur > 0 || clock.pos > 0) {
            t = "曲目位置：" + Math.floor(clockNow()) + "s / " + Math.floor(clock.dur) + "s" +
              (clock.playing ? "（播放中）" : "（已暂停）");
          } else {
            t = "曲目位置：暂无曲目";
          }
          lines.track.textContent = t;
          lines.cmd.textContent = "最近系统指令：" + (lastCmd || "无");
          lines.note.textContent = lastAckAt ? "心跳：" + new Date(lastAckAt).toLocaleTimeString() : "心跳：未发出";
        }
        render();
        setInterval(render, 2000);
        return box;
      });
    }
  } catch (e) { /* panel optional */ }
})();
