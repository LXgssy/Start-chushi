/*
 * ChuShi Music API (cc.chushi.ncmapi) v3.0.0 -- REWRITTEN FROM SCRATCH.
 *
 * Single source of playback truth for the ChuShi SMTC stack. Runs inside the
 * NetEase Cloud Music renderer (BetterNCM). This generation is built around
 * three hard rules from the user:
 *
 *   RULE 1 -- OBSERVE, NEVER FIGHT. Reading truth is pure observation:
 *   native engine events (legacyNativeCmder) + dva store reads + audio
 *   element property reads. We never patch prototypes, never wrap channel
 *   calls, never dispatch store actions, never rewrite currentTime in a
 *   loop. (The previous generation fought the player and froze NetEase's
 *   own progress bar; that class of bug is structurally gone here.)
 *
 *   RULE 2 -- CONTROL AT THE ELEMENT. Every control command (from the
 *   Windows overlay via the engine, or from the ChuShi page) executes once,
 *   at the media element (play/pause/currentTime) or NetEase's own visible
 *   footer buttons (next/prev). If a seek did not take, we report the
 *   failure honestly (seekAck) instead of fighting the player.
 *
 *   RULE 3 -- NO NETEASE SMTC DEPENDENCY. Everything here works whether the
 *   NetEase SMTC switch in its settings is ON or OFF. We do not read any
 *   SMTC session anywhere.
 *
 * Push model (engine: chushi-smtc-engine.ps1 on 127.0.0.1:<port>):
 *   POST /api/ne    1 Hz playback truth
 *   POST /api/lyric full lyrics on song change (yrc word-level first)
 *   GET  /api/cmd   300 ms command poll
 *
 * Lyrics sources (first hit wins, cached 8 songs):
 *   A. eapi /api/song/lyric/v1 (yv=1, fallback yv=-1) -> yrc + ytlrc
 *      (self-contained fresh crypto: RFC 1321 MD5 + AES-128-ECB with a
 *      runtime-generated S-box; no external dependency)
 *   B. same response klyric (karaoke) -> converted to yrc-shaped text
 *   C. channel "track.lyric.getinfo" -> lrc/tlyric
 *   D. direct https://music.163.com/api/song/lyric -> lrc/tlyric
 *
 * Executed by BetterNCM as AsyncFunction("plugin", code). ASCII-only file.
 */
(async function () {
  if (window.__chushiMusicApiV4) return;
  window.__chushiMusicApiV4 = true;

  const PLUGIN_VERSION = "3.0.0";
  const ENGINE_VER_NEEDED = "4.0.0";
  const DEFAULT_PORT = 26801;

  const TAG = "[ChuShiMusicApi]";
  const log = (...a) => console.log(TAG, ...a);
  const warn = (...a) => console.warn(TAG, ...a);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

  const PORT = (parseInt(plugin.getConfig("port", DEFAULT_PORT), 10) || DEFAULT_PORT);
  const BASE = "http://127.0.0.1:" + PORT;

  /* ============================================================
   * 1) Native engine events (NetEase's own audio pipeline, direct)
   * ============================================================ */
  let evPlaying = false, evPlayingAt = 0;      // last PlayState (state===1 -> playing)
  let evProgSec = -1, evProgAt = 0;            // last PlayProgress (seconds)
  let evSongId = 0;                            // last PlayState idStr
  let disposed = false;

  (async function registerEvents() {
    for (let i = 0; i < 100 && !window.legacyNativeCmder && !disposed; i++) await sleep(200);
    const cmder = window.legacyNativeCmder;
    if (!cmder || typeof cmder.appendRegisterCall !== "function") {
      warn("legacyNativeCmder unavailable; running on store + element sources only");
      return;
    }
    cmder.appendRegisterCall("PlayState", "audioplayer", function (playId, idStr, state) {
      evPlaying = state === 1;
      evPlayingAt = Date.now();
      const idNum = parseInt(idStr, 10);
      if (idNum > 0) evSongId = idNum;
    });
    cmder.appendRegisterCall("PlayProgress", "audioplayer", function (playId, sec) {
      if (typeof sec === "number" && sec >= 0 && isFinite(sec)) {
        evProgSec = sec; evProgAt = Date.now();
      }
    });
    cmder.appendRegisterCall("Seek", "audioplayer", function (playId, seekId, code, pos) {
      if (typeof pos === "number" && pos >= 0 && isFinite(pos)) {
        evProgSec = pos; evProgAt = Date.now();
      }
    });
    log("native events registered (PlayState/PlayProgress/Seek)");
  })();

  /* ============================================================
   * 2) dva store discovery (read-only: getState() only, NEVER dispatch)
   * ============================================================ */
  let store = null;

  function captureWebpackRequire() {
    return new Promise((resolve) => {
      try {
        const gp = window.webpackJsonp;
        if (gp && typeof gp.push === "function") {
          const id = "__chushi_mapiv4_" + Date.now() + "_" + Math.floor(Math.random() * 1e6);
          const chunk = {};
          chunk[id] = function (module, exports, require) {
            resolve(typeof require === "function" ? require : null);
          };
          if (Array.isArray(gp[0])) gp.push([[id], chunk, [[id]]]);
          else gp.push([[id], chunk]);
          setTimeout(() => resolve(null), 3000);
          return;
        }
      } catch (e) { /* fall through to webpack5 shape */ }
      try {
        for (const k in window) {
          if (k.indexOf("webpackChunk") === 0 && window[k] && typeof window[k].push === "function") {
            let req = null;
            window[k].push([["__chushi_mapiv4_" + Date.now()], {}, function (a, b) {
              if (typeof a === "function") req = a;
              else if (typeof b === "function") req = b;
            }]);
            resolve(req);
            return;
          }
        }
      } catch (e) { /* ignore */ }
      resolve(null);
    });
  }

  (async function findStore() {
    for (let i = 0; i < 50 && !disposed && !store; i++) {
      const req = await captureWebpackRequire();
      if (req) {
        try {
          for (const key of Object.keys(req.m || req.c || {})) {
            let ex = null;
            try { ex = req(key); } catch (e) { continue; }
            const dva = ex && typeof ex === "object" && ex.a && typeof ex.a.getStore === "function" ? ex.a : null;
            if (dva && dva.inited && dva.app && dva.app._store) { store = dva.app._store; break; }
          }
        } catch (e) { /* keep scanning next round */ }
        if (store) { log("dva store acquired (read-only)"); break; }
      }
      await sleep(400);
    }
    if (!store) warn("dva store not found; element-only mode (lyrics still work via songId from events)");
  })();

  /* ============================================================
   * 3) Media element: one sticky, validated element. No scoring roulette.
   * ============================================================ */
  let mainEl = null;

  function expectedDurMs() {
    try {
      const p = store ? (store.getState().playing || {}) : {};
      if (p.curTrack && p.curTrack.duration > 0) return Math.floor(p.curTrack.duration);
    } catch (e) { }
    try {
      const d = (window.betterncm && window.betterncm.ncm && window.betterncm.ncm.getPlayingSong)
        ? (window.betterncm.ncm.getPlayingSong() || {}).data : null;
      if (d && d.duration > 0) return Math.floor(d.duration);
    } catch (e) { }
    return 0;
  }

  function elementValid(el) {
    if (!el || !el.tagName || !/^(audio|video)$/i.test(el.tagName)) return false;
    if (!el.isConnected) return false;
    if (!(el.currentTime >= 0) || !isFinite(el.currentTime)) return false;
    const dur = expectedDurMs();
    if (dur > 0 && el.duration > 0 && isFinite(el.duration)) {
      if (Math.abs(el.duration * 1000 - dur) > 1500) return false;
    }
    return true;
  }

  function getEl() {
    if (elementValid(mainEl)) return mainEl;
    mainEl = null;
    const list = document.querySelectorAll("audio, video");
    for (const el of list) {
      if (elementValid(el)) { mainEl = el; break; }
    }
    if (!mainEl) {
      // no duration-validated element yet: accept any audio with a live clock
      for (const el of document.querySelectorAll("audio")) {
        if (el.isConnected && isFinite(el.currentTime)) { mainEl = el; break; }
      }
    }
    return mainEl;
  }

  /* ============================================================
   * 4) Metadata (store first, BetterNCM API second). https-only cover.
   * ============================================================ */
  function httpsUp(u) {
    const s = String(u || "");
    if (s.indexOf("http://") === 0) return "https://" + s.slice(7);
    return s;
  }

  function getMeta() {
    try {
      const p = store ? (store.getState().playing || {}) : {};
      const id = p.resourceTrackId || p.onlineResourceId || evSongId || 0;
      if (id) {
        const artists = (p.resourceArtists || []).map((a) => a && a.name).filter(Boolean);
        return {
          id: Number(id) || 0,
          title: String(p.resourceName || ""),
          artist: artists.join("/"),
          album: (p.curTrack && p.curTrack.album && (p.curTrack.album.albumName || p.curTrack.album.name)) || "",
          pic: httpsUp(p.resourceCoverUrl || (p.curTrack && p.curTrack.album && p.curTrack.album.picUrl) || ""),
          durMs: (p.curTrack && p.curTrack.duration > 0) ? Math.floor(p.curTrack.duration) : 0,
        };
      }
    } catch (e) { }
    try {
      const d = (window.betterncm && window.betterncm.ncm && window.betterncm.ncm.getPlayingSong)
        ? (window.betterncm.ncm.getPlayingSong() || {}).data : null;
      if (d) {
        const artists = (d.artists || []).map((a) => a && a.name).filter(Boolean);
        return {
          id: evSongId || 0,
          title: String(d.name || ""),
          artist: artists.join("/"),
          album: (d.album && (d.album.name || d.album.albumName)) || "",
          pic: httpsUp((d.album && d.album.picUrl) || ""),
          durMs: (d.duration > 0) ? Math.floor(d.duration) : 0,
        };
      }
    } catch (e) { }
    return { id: evSongId || 0, title: "", artist: "", album: "", pic: "", durMs: 0 };
  }

  /* ============================================================
   * 5) Truth snapshot (pure read; reconciliation, zero mutation)
   * ============================================================ */
  let seekAck = { id: "", ok: true, at: 0 };
  let seekSeq = 0;

  function buildSnapshot() {
    const now = Date.now();
    const el = getEl();
    const meta = getMeta();

    // playing: last native event wins (fresh window), then store, then element
    let playing = null;
    if (evPlayingAt && now - evPlayingAt < 3000) playing = evPlaying;
    else {
      try {
        const p = store ? (store.getState().playing || {}) : {};
        if (typeof p.paused === "boolean") playing = !p.paused;
      } catch (e) { }
    }
    if (playing === null && el) playing = el.paused === false;
    if (playing === null) playing = false;

    // position: element fine clock when aligned with native progress;
    // native progress; store position; bare element; else keep last push
    const nativeFresh = evProgAt && now - evProgAt < 5000;
    const nativeSec = nativeFresh ? evProgSec : -1;
    let posSec = -1;
    if (el && isFinite(el.currentTime)) {
      const elSec = el.currentTime;
      if (nativeSec >= 0 && Math.abs(elSec - nativeSec) <= 1.5) posSec = elSec;
      else if (nativeSec < 0) posSec = elSec;
    }
    if (posSec < 0 && nativeSec >= 0) posSec = nativeSec;
    if (posSec < 0) {
      try {
        const sp = store ? Number(store.getState().playing && store.getState().playing.position) : 0;
        if (sp > 0 && isFinite(sp)) posSec = sp;
      } catch (e) { }
    }
    if (posSec < 0) posSec = 0;

    const durMs = meta.durMs > 0 ? meta.durMs
      : (el && el.duration > 0 && isFinite(el.duration) ? Math.floor(el.duration * 1000) : 0);
    if (durMs > 0 && posSec * 1000 > durMs) posSec = durMs / 1000;

    return {
      v: PLUGIN_VERSION,
      ts: now,
      songId: meta.id || 0,
      title: meta.title || "",
      artist: meta.artist || "",
      album: meta.album || "",
      pic: meta.pic || "",
      position: Math.round(posSec * 1000) / 1000,
      duration: Math.round(durMs / 1000 * 1000) / 1000,
      playing: playing === true,
      seekAckId: seekAck.id || "",
      seekAckOk: seekAck.ok === true,
      seekAckAt: seekAck.at || 0,
    };
  }

  /* ============================================================
   * 6) Control executor (one action per command; honest verification)
   * ============================================================ */
  function visibleBtn(ids) {
    for (const sel of ids) {
      try {
        const el = document.querySelector(sel);
        if (el && el.offsetParent !== null) { el.click(); return true; }
      } catch (e) { }
    }
    return false;
  }

  function ctrlPlayPause(target) {
    const el = getEl();
    if (el) {
      try {
        if (target === "play" && el.paused) { el.play(); return true; }
        if (target === "pause" && !el.paused) { el.pause(); return true; }
        return true; // already in the requested state
      } catch (e) { /* fall through to buttons */ }
    }
    if (target === "play") return visibleBtn(["#btn-play", ".btn-play", "#btn-pause", ".btn-pause"]);
    return visibleBtn(["#btn-pause", ".btn-pause", "#btn-play", ".btn-play"]);
  }

  function ctrlToggle() {
    const snap = buildSnapshot();
    return ctrlPlayPause(snap.playing ? "pause" : "play");
  }

  function ctrlSkip(dir) {
    return dir === "next"
      ? visibleBtn(["#btn-next", ".btn-next"])
      : visibleBtn(["#btn-previous", "#btn-prev", ".btn-previous", ".btn-prev"]);
  }

  /* Seek: set currentTime ONCE, verify by read-back, never rewrite.
     The seekAck travels to the host with the next pushes so the page can
     honestly say "drag did not take" instead of pretending. */
  function ctrlSeek(sec) {
    const id = "s" + (++seekSeq) + "t" + Date.now();
    const el = getEl();
    if (!el || !(sec >= 0)) {
      seekAck = { id, ok: false, at: Date.now() };
      return;
    }
    try {
      const dur = el.duration > 0 && isFinite(el.duration) ? el.duration : 0;
      const target = dur > 0 ? clamp(sec, 0, dur) : Math.max(0, sec);
      el.currentTime = target;
      const elTag = el;
      setTimeout(function () {
        try {
          if (elTag !== mainEl) { seekAck = { id, ok: false, at: Date.now() }; return; }
          const now2 = elTag.currentTime;
          seekAck = { id, ok: Math.abs(now2 - target) <= 0.9, at: Date.now() };
        } catch (e) { seekAck = { id, ok: false, at: Date.now() }; }
      }, 420);
      setTimeout(function () {
        try {
          if (seekAck.id === id && seekAck.ok === false) {
            // second chance: maybe the first read caught a buffering frame
            const now3 = elTag.currentTime;
            const drift = Math.abs(now3 - target);
            seekAck = { id, ok: drift <= 1.2, at: Date.now() };
          }
        } catch (e) { }
      }, 1000);
    } catch (e) {
      seekAck = { id, ok: false, at: Date.now() };
    }
  }

  function execCmd(c) {
    if (!c || !c.cmd) return;
    switch (c.cmd) {
      case "play": ctrlPlayPause("play"); break;
      case "pause": ctrlPlayPause("pause"); break;
      case "toggle": ctrlToggle(); break;
      case "next": ctrlSkip("next"); break;
      case "prev": ctrlSkip("prev"); break;
      case "seek": ctrlSeek(Number(c.position) || 0); break;
      default: break;
    }
  }

  /* ============================================================
   * 7) HTTP: push truth 1 Hz, poll commands 300 ms
   * ============================================================ */
  let lastSnap = null;

  async function httpJson(path, method, body, timeoutMs) {
    const ctl = new AbortController();
    const t = setTimeout(() => { try { ctl.abort(); } catch (e) { } }, timeoutMs || 2500);
    try {
      const r = await fetch(BASE + path, {
        method: method || "GET",
        signal: ctl.signal,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      return await r.json();
    } catch (e) {
      return null;
    } finally { clearTimeout(t); }
  }

  (async function pushLoop() {
    while (!disposed) {
      try {
        const snap = buildSnapshot();
        lastSnap = snap;
        await httpJson("/api/ne", "POST", snap, 1800);
      } catch (e) { }
      await sleep(1000);
    }
  })();

  (async function cmdLoop() {
    while (!disposed) {
      try {
        const j = await httpJson("/api/cmd", "GET", null, 1200);
        if (j && j.ok === true && Array.isArray(j.cmds)) {
          for (const c of j.cmds) {
            try { execCmd(c); } catch (e) { warn("cmd failed:", c && c.cmd, e && e.message); }
          }
        }
      } catch (e) { }
      await sleep(300);
    }
  })();

  /* ============================================================
   * 8) Lyrics: full word-level lyrics, fresh crypto, cached
   * ============================================================ */

  /* ---- MD5 (RFC 1321) over bytes -> lowercase hex ---- */
  function md5Hex(bytes) {
    const S = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
      5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
      4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
      6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
    const K = new Int32Array(64);
    for (let i = 0; i < 64; i++) K[i] = (Math.abs(Math.sin(i + 1)) * 4294967296) | 0;
    let a0 = 0x67452301 | 0, b0 = 0xefcdab89 | 0, c0 = 0x98badcfe | 0, d0 = 0x10325476 | 0;
    const len = bytes.length;
    const total = (((len + 8) >> 6) + 1) << 6;
    const m = new Uint8Array(total);
    m.set(bytes);
    m[len] = 0x80;
    const bitLen = len * 8;
    /* JS shifts mask the count mod 32 (bitLen >>> 32 === bitLen >>> 0), so
       high length bytes must be computed arithmetically, never via >>> 32+. */
    const bitLenLo = bitLen >>> 0;
    const bitLenHi = Math.floor(bitLen / 4294967296);
    const lenBytes = [
      bitLenLo & 0xff, (bitLenLo >>> 8) & 0xff, (bitLenLo >>> 16) & 0xff, (bitLenLo >>> 24) & 0xff,
      bitLenHi & 0xff, (bitLenHi >>> 8) & 0xff, (bitLenHi >>> 16) & 0xff, (bitLenHi >>> 24) & 0xff,
    ];
    for (let i = 0; i < 8; i++) m[total - 8 + i] = lenBytes[i];
    const M = new Int32Array(total / 4);
    for (let i = 0; i < M.length; i++) {
      M[i] = (m[i * 4] | (m[i * 4 + 1] << 8) | (m[i * 4 + 2] << 16) | (m[i * 4 + 3] << 24)) | 0;
    }
    const rotl = (x, c) => ((x << c) | (x >>> (32 - c))) | 0;
    for (let off = 0; off < M.length; off += 16) {
      const X = M.subarray(off, off + 16);
      let A = a0, B = b0, C = c0, D = d0;
      for (let i = 0; i < 64; i++) {
        let F, g;
        if (i < 16) { F = (B & C) | (~B & D); g = i; }
        else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
        else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
        else { F = C ^ (B | ~D); g = (7 * i) % 16; }
        F = (F + A + K[i] + X[g]) | 0;
        A = D; D = C; C = B;
        B = (B + rotl(F, S[i])) | 0;
      }
      a0 = (a0 + A) | 0; b0 = (b0 + B) | 0; c0 = (c0 + C) | 0; d0 = (d0 + D) | 0;
    }
    const out = new Uint8Array(16);
    const regs = [a0, b0, c0, d0];
    for (let r = 0; r < 4; r++) {
      for (let i = 0; i < 4; i++) out[r * 4 + i] = (regs[r] >>> (8 * i)) & 0xff;
    }
    let s = "";
    for (let i = 0; i < 16; i++) s += (out[i] >>> 4).toString(16) + (out[i] & 15).toString(16);
    return s;
  }

  /* ---- AES-128 ECB encrypt-only, S-box generated at runtime ---- */
  const AES = (function () {
    // S-box: multiplicative inverse in GF(2^8) + affine transform
    const sbox = new Uint8Array(256);
    const mul = (a, b) => {
      let p = 0;
      for (let i = 0; i < 8; i++) {
        if (b & 1) p ^= a;
        const hi = a & 0x80;
        a = (a << 1) & 0xff;
        if (hi) a ^= 0x1b;
        b >>= 1;
      }
      return p;
    };
    for (let i = 0, inv = 0; i < 256; i++) {
      // find inverse of i in GF(2^8) (0 maps to 0)
      inv = 0;
      if (i !== 0) { for (let j = 1; j < 256; j++) { if (mul(i, j) === 1) { inv = j; break; } } }
      let x = inv, s = x;
      for (let k = 0; k < 4; k++) { s = ((s << 1) | (s >>> 7)) & 0xff; x ^= s; }
      sbox[i] = x ^ 0x63;
    }
    const rcon = [0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36];
    function expandKey(key) {
      const w = new Uint8Array(176);
      w.set(key);
      for (let i = 16; i < 176; i += 4) {
        let t0 = w[i - 4], t1 = w[i - 3], t2 = w[i - 2], t3 = w[i - 1];
        if (i % 16 === 0) {
          const tmp = t0;
          t0 = sbox[t1] ^ rcon[i / 16 - 1];
          t1 = sbox[t2]; t2 = sbox[t3]; t3 = sbox[tmp];
        }
        w[i] = w[i - 16] ^ t0;
        w[i + 1] = w[i - 15] ^ t1;
        w[i + 2] = w[i - 14] ^ t2;
        w[i + 3] = w[i - 13] ^ t3;
      }
      return w;
    }
    function cryptBlock(w, inp, out) {
      const s = new Uint8Array(16);
      s.set(inp);
      for (let i = 0; i < 16; i++) s[i] ^= w[i];                 // AddRoundKey(0)
      for (let r = 1; r <= 10; r++) {
        for (let i = 0; i < 16; i++) s[i] = sbox[s[i]];              // SubBytes
        for (let r0 = 1; r0 < 4; r0++) {                             // ShiftRows (column-major state)
          const row = [s[r0], s[r0 + 4], s[r0 + 8], s[r0 + 12]];
          for (let c = 0; c < 4; c++) s[r0 + c * 4] = row[(c + r0) % 4];
        }
        if (r < 10) {
          for (let c = 0; c < 4; c++) {                              // MixColumns
            const a0 = s[c * 4], a1 = s[c * 4 + 1], a2 = s[c * 4 + 2], a3 = s[c * 4 + 3];
            s[c * 4] = mul(2, a0) ^ mul(3, a1) ^ a2 ^ a3;
            s[c * 4 + 1] = a0 ^ mul(2, a1) ^ mul(3, a2) ^ a3;
            s[c * 4 + 2] = a0 ^ a1 ^ mul(2, a2) ^ mul(3, a3);
            s[c * 4 + 3] = mul(3, a0) ^ a1 ^ a2 ^ mul(2, a3);
          }
        }
        for (let i = 0; i < 16; i++) s[i] ^= w[r * 16 + i];          // AddRoundKey(r)
      }
      out.set(s);
    }
    function ecbEncrypt(keyBytes, plain) {
      const w = expandKey(keyBytes);
      const pad = 16 - (plain.length % 16);
      const buf = new Uint8Array(plain.length + pad);
      buf.set(plain);
      for (let i = plain.length; i < buf.length; i++) buf[i] = pad;
      const out = new Uint8Array(buf.length);
      for (let off = 0; off < buf.length; off += 16) cryptBlock(w, buf.subarray(off, off + 16), out.subarray(off, off + 16));
      return out;
    }
    return { ecbEncrypt };
  })();

  function utf8Bytes(str) {
    const bin = unescape(encodeURIComponent(str));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i) & 0xff;
    return out;
  }
  function hexUpper(bytes) {
    let s = "";
    for (let i = 0; i < bytes.length; i++) s += (bytes[i] >> 4).toString(16) + (bytes[i] & 15).toString(16);
    return s.toUpperCase();
  }

  const EAPI_KEY = utf8Bytes("e82ckenh8dichen8");
  function eapiParams(apiPath, payload) {
    const text = JSON.stringify(payload);
    const secret = "nobody" + apiPath + "use" + text + "md5forencrypt";
    const digest = md5Hex(utf8Bytes(secret));
    const data = apiPath + "-36cd479b6b5-" + text + "-36cd479b6b5-" + digest;
    return hexUpper(AES.ecbEncrypt(EAPI_KEY, utf8Bytes(data)));
  }

  /* ---- klyric (JSON karaoke) -> yrc-shaped text (fallback) ---- */
  function klyricToYrcText(ktext) {
    try {
      const j = JSON.parse(ktext);
      const lines = Array.isArray(j) ? j : (j.lines || j.lrc || []);
      const out = [];
      for (const ln of lines) {
        if (!ln || !Array.isArray(ln.c) || !ln.c.length) continue;
        const start = ln.t || 0;
        let cur = 0;
        let body = "";
        const times = [];
        for (const w of ln.c) {
          times.push(w.t != null ? w.t : start + cur);
          const tx = String(w.tx || "");
          cur += tx.length * 90;
          body += tx;
        }
        if (!body.trim()) continue;
        let yrc = "";
        for (let i = 0; i < ln.c.length; i++) {
          const ws = times[i];
          const we = i + 1 < times.length ? times[i + 1] : start + Math.max(cur, 900);
          yrc += "(" + ws + "," + Math.max(60, we - ws) + ",0)" + String(ln.c[i].tx || "");
        }
        out.push("[" + start + "," + Math.max(cur, 900) + "]" + yrc);
      }
      return out.join("\n");
    } catch (e) { return ""; }
  }

  const lyricCache = new Map();
  const LYRIC_LS = "chushi-musicapi-lyric-v4";
  try {
    const saved = JSON.parse(localStorage.getItem(LYRIC_LS) || "[]");
    if (Array.isArray(saved)) for (const [k, v] of saved) lyricCache.set(k, v);
  } catch (e) { }
  function saveLyricCache() {
    try {
      while (lyricCache.size > 8) lyricCache.delete(lyricCache.keys().next().value);
      localStorage.setItem(LYRIC_LS, JSON.stringify(Array.from(lyricCache.entries()).slice(-8)));
    } catch (e) { }
  }

  async function fetchLyricEapi(songId) {
    const apiPath = "/api/song/lyric/v1";
    const attempt = async (yv) => {
      try {
        const r = await fetch("https://interface3.music.163.com/eapi" + apiPath, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: "params=" + eapiParams(apiPath, {
            id: String(songId), cp: false, radio: false,
            cv: 0, kv: 0, tv: 0, lv: 0, rv: 0, st: 0, yv: yv,
          }),
        });
        if (!r || !r.ok) return null;
        return await r.json();
      } catch (e) { return null; }
    };
    let j = await attempt(1);
    if (!j || !(j.yrc && j.yrc.lyric)) j = await attempt(-1);
    if (!j) return null;
    let yrc = (j.yrc && j.yrc.lyric) || "";
    let source = "";
    if (yrc) source = "eapi-yrc";
    else if (j.klyric && j.klyric.lyric) { yrc = klyricToYrcText(j.klyric.lyric); source = yrc ? "eapi-klyric" : ""; }
    const lrc = (j.lrc && j.lrc.lyric) || "";
    const tlyric = (j.tlyric && j.tlyric.lyric) || "";
    const ytlrc = (j.ytlrc && j.ytlrc.lyric) || "";
    if (!yrc && !lrc) return null;
    return { yrc, ytlrc, lrc, tlyric, source: source || "eapi-lrc" };
  }

  function channelLyric(songId) {
    return new Promise((resolve) => {
      try {
        if (!window.channel || typeof window.channel.call !== "function") return resolve(null);
        window.channel.call("track.lyric.getinfo", function (err, res) {
          try {
            if (err || !res || !res.lyric) return resolve(null);
            resolve({
              yrc: "", ytlrc: "",
              lrc: String((res.lyric && res.lyric.lyric) || ""),
              tlyric: String((res.transLyric && res.transLyric.lyric) || ""),
              source: "channel-lrc",
            });
          } catch (e) { resolve(null); }
        }, [String(songId)]);
      } catch (e) { resolve(null); }
    });
  }

  async function fetchLyricDirect(songId) {
    try {
      const r = await fetch(`https://music.163.com/api/song/lyric?os=pc&id=${songId}&lv=-1&kv=-1&tv=-1`);
      if (!r || !r.ok) return null;
      const j = await r.json();
      const lrc = (j.lrc && j.lrc.lyric) || "";
      const tlyric = (j.tlyric && j.tlyric.lyric) || "";
      if (!lrc) return null;
      return { yrc: "", ytlrc: "", lrc, tlyric, source: "direct-lrc" };
    } catch (e) { return null; }
  }

  function lyricRevOf(p) {
    return `${p.songId}-${p.source || "none"}-${(p.yrc || p.lrc || "").length}`;
  }

  async function pushLyric(entry) {
    const payload = {
      songId: entry.songId, title: entry.title || "", artist: entry.artist || "",
      rev: entry.rev, yrc: entry.yrc || "", ytlrc: entry.ytlrc || "",
      lrc: entry.lrc || "", tlyric: entry.tlyric || "", source: entry.source || "",
    };
    await httpJson("/api/lyric", "POST", payload, 4000);
  }

  let curLyricKey = "";
  (async function lyricLoop() {
    while (!disposed) {
      try {
        const meta = getMeta();
        const key = String(meta.id || 0);
        if (key && key !== curLyricKey && key !== "0") {
          curLyricKey = key;
          let entry = lyricCache.get(key) || null;
          if (!entry) {
            const got =
              await fetchLyricEapi(meta.id) ||
              (await channelLyric(meta.id)) ||
              (await fetchLyricDirect(meta.id)) ||
              null;
            if (got) {
              entry = {
                songId: meta.id, title: meta.title, artist: meta.artist,
                yrc: got.yrc || "", ytlrc: got.ytlrc || "",
                lrc: got.lrc || "", tlyric: got.tlyric || "",
                source: got.source || "",
              };
              entry.rev = lyricRevOf(entry);
              lyricCache.set(key, entry);
              saveLyricCache();
            }
          }
          if (entry) await pushLyric(entry);
        }
      } catch (e) { }
      await sleep(700);
    }
  })();

  /* ============================================================
   * 9) Config panel (English; honest status + port + conflict hint)
   * ============================================================ */
  try {
    plugin.onConfig(function (tools) {
      const wrap = document.createElement("div");
      wrap.style.cssText = "font-size:12px;line-height:1.8;";
      const info = document.createElement("div");
      info.innerText = `ChuShi Music API ${PLUGIN_VERSION} -- playback truth producer (exact progress, word-level lyrics, element-level control). The Windows SMTC card is handled by the ChuShi SMTC Manager plugin + engine. NetEase's built-in SMTC switch is NOT required. Same port as the manager plugin.`;
      try {
        if (window.__chushiLyricSourceActive || window.__chushiLyricSource) {
          const conflict = document.createElement("div");
          conflict.style.cssText = "color:#b91c1c;font-weight:600;margin-top:6px;";
          conflict.innerText = "Old all-in-one lyric plugin is still active: uninstall it in the BetterNCM plugin manager, keep only ChuShi SMTC Manager + ChuShi Music API, then restart NetEase.";
          wrap.appendChild(conflict);
        }
      } catch (e) { }
      const row = document.createElement("div");
      row.style.cssText = "margin-top:6px;";
      const label = document.createElement("span");
      label.innerText = "Engine port (must match ChuShi SMTC Manager; default 26801): ";
      const input = tools.makeInput(String(PORT), { type: "number" });
      const btn = tools.makeBtn("Save", function () {
        const p = parseInt(input.value, 10);
        if (!p || p < 1024 || p > 65535) { alert("Port must be 1024-65535"); return; }
        plugin.setConfig("port", p);
        alert("Saved. Restart NetEase Cloud Music to apply.");
      });
      row.appendChild(label); row.appendChild(input); row.appendChild(btn);
      wrap.appendChild(info); wrap.appendChild(row);
      return wrap;
    });
  } catch (e) { /* optional */ }

  log(`ChuShi Music API v${PLUGIN_VERSION} ready -> engine ${BASE}`);
})();
