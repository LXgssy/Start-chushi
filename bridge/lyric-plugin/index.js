/*
 * 初始歌词源 (ChuShi Lyric Source) — BetterNCMII / chromatic 插件（纯 API，无 UI）
 *
 * 「初始」SMTC 音乐面板的网易云增强数据源：
 *   ① 精确播放状态（songId/positionMs/durationMs/playing/封面 URL）——
 *      SMTC 时间轴缺失或停滞时的时钟兜底（帧级精度，取自媒体元素）
 *   ② 逐字歌词（yrc）——网易云客户端内部才有，SMTC 不提供
 *   数据主动 POST 推送到「初始 SMTC 桥」(http://127.0.0.1:20754，见本文件末尾配置)：
 *      /api/plugin/state  1s 心跳（暂停 3.5s）
 *      /api/plugin/lyric  切歌时推送 + 启动时补推缓存
 *
 * 歌词获取策略（按优先级，先到先用）：
 *   A. eapi /api/song/lyric/v1（yv=1）→ yrc 逐字 + ytlrc 逐字翻译（主流曲库均有）
 *   B. 同接口返回的 klyric（卡拉 OK 字级，覆盖较少）→ 自行转 yrc 同构文本
 *   C. channel.call("track.lyric.getinfo") → lrc/tlyric 行级
 *   D. 直连 music.163.com/api/song/lyric → lrc/tlyric 行级
 * 歌词按 songId 缓存（内存 + localStorage，上限 8 首），切回最近曲目不重拉。
 *
 * 状态源（与旧「初始音乐桥」同技术，三源择优）：
 *   ① NCM 3.x dva Redux store（webpack4/5 双兼容捕获）
 *   ② legacyNativeCmder 原生事件（PlayState/PlayProgress/Seek）
 *   ③ 兜底：betterncm.ncm.getPlayingSong() + 媒体元素轮询（帧级进度主源）
 *
 * 本文件由 BetterNCMII(js-framework) 以 AsyncFunction("plugin", code) 调用执行，
 * 顶层即异步上下文。注入通道：manifest 的 injects.Main。
 */
/* eslint-disable */
(async function () {
  if (window.__chushiLyricSourceActive) return;
  window.__chushiLyricSourceActive = true;

  const TAG = "[ChuShiLyricSource]";
  const log = (...a) => console.log(TAG, ...a);
  const warn = (...a) => console.warn(TAG, ...a);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const PLUGIN_VERSION = "1.0.0";

  /*__EAPI_CRYPTO_START__*/
  // —— eapi 加密（与 NetEaseCloudMusicApi 同构：nobody{url}use{text}md5forencrypt
  //    + AES-128-ECB(key=e82ckenh8dichen8) → 大写 hex）。自包含实现，运行时
  //    生成 S-box（GF(2^8) 逆元 + 仿射变换），避免手抄 256 魔数出错。
  function utf8Bytes(str) {
    const bin = unescape(encodeURIComponent(str));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i) & 0xff;
    return out;
  }
  function bytesToHexUpper(bytes) {
    let s = "";
    for (let i = 0; i < bytes.length; i++) s += (bytes[i] >> 4).toString(16) + (bytes[i] & 15).toString(16);
    return s.toUpperCase();
  }
  // ---------- MD5（RFC 1321，输入 Uint8Array，输出小写 hex） ----------
  function md5Bytes(bytes) {
    const s = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
      5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
      4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
      6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
    // 64 个常量：floor(abs(sin(i+1)) * 2^32)
    const K = new Int32Array(64);
    for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) | 0;
    let a0 = 0x67452301 | 0, b0 = 0xefcdab89 | 0, c0 = 0x98badcfe | 0, d0 = 0x10325476 | 0;
    const origLen = bytes.length;
    const bitLen = origLen * 8;
    // padding: msg + 0x80 + zeros + 8-byte little-endian bitLen
    const padded = (((origLen + 8) >> 6) + 1) << 6;
    const msg = new Uint8Array(padded);
    msg.set(bytes);
    msg[origLen] = 0x80;
    /* ⚠ JS 移位计数取模 32：8*i ≥ 32 时 x>>>(8*i) 等于不移位，会把低位字节重复写进
       高位长度字（md5('a') 首次跑错就是它）——i≥4 的长度字节直接置 0（消息 < 512MB 恒成立） */
    for (let i = 0; i < 8; i++) msg[padded - 8 + i] = i < 4 ? (bitLen >>> (8 * i)) & 0xff : 0;
    const M = new Int32Array(16);
    const rl = (x, c) => (x << c) | (x >>> (32 - c));
    for (let off = 0; off < padded; off += 64) {
      for (let i = 0; i < 16; i++) {
        const j = off + i * 4;
        M[i] = (msg[j] | (msg[j + 1] << 8) | (msg[j + 2] << 16) | (msg[j + 3] << 24)) | 0;
      }
      let A = a0, B = b0, C = c0, D = d0;
      for (let i = 0; i < 64; i++) {
        let F, g;
        if (i < 16) { F = (B & C) | (~B & D); g = i; }
        else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) & 15; }
        else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) & 15; }
        else { F = C ^ (B | ~D); g = (7 * i) & 15; }
        F = (F + A + K[i] + M[g]) | 0;
        A = D; D = C; C = B;
        B = (B + rl(F, s[i])) | 0;
      }
      a0 = (a0 + A) | 0; b0 = (b0 + B) | 0; c0 = (c0 + C) | 0; d0 = (d0 + D) | 0;
    }
    const out = new Uint8Array(16);
    const words = [a0, b0, c0, d0];
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 4; j++) out[i * 4 + j] = (words[i] >>> (8 * j)) & 0xff;
    let hex = "";
    for (let i = 0; i < 16; i++) hex += (out[i] >> 4).toString(16) + (out[i] & 15).toString(16);
    return hex;
  }
  // ---------- AES-128 ECB 加密 ----------
  const AES = (() => {
    // GF(2^8) 乘法
    const gmul = (a, b) => {
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
    // S-box：乘法逆元 + 仿射变换（运行时构造）
    const SBOX = new Uint8Array(256);
    {
      const inv = new Uint8Array(256);
      // 求逆元：枚举（256 元素小表，O(256^2) 可接受）
      for (let i = 1; i < 256; i++)
        for (let j = 1; j < 256; j++)
          if (gmul(i, j) === 1) { inv[i] = j; break; }
      inv[0] = 0;
      for (let i = 0; i < 256; i++) {
        let x = inv[i], s = x;
        for (let b = 0; b < 4; b++) {
          // 循环左移 1 位
          const hi = (x >> 7) & 1;
          x = ((x << 1) | hi) & 0xff;
          s ^= x;
        }
        SBOX[i] = (s ^ 0x63) & 0xff;
      }
    }
    const RCON = [0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36];
    function expandKey(key) {
      const w = new Uint8Array(176);
      w.set(key);
      for (let i = 16; i < 176; i += 4) {
        let t0 = w[i - 4], t1 = w[i - 3], t2 = w[i - 2], t3 = w[i - 1];
        if (i % 16 === 0) {
          const tmp = t0;
          t0 = SBOX[t1] ^ RCON[i / 16 - 1];
          t1 = SBOX[t2];
          t2 = SBOX[t3];
          t3 = SBOX[tmp];
        }
        w[i] = w[i - 16] ^ t0;
        w[i + 1] = w[i - 15] ^ t1;
        w[i + 2] = w[i - 14] ^ t2;
        w[i + 3] = w[i - 13] ^ t3;
      }
      return w;
    }
    function encryptBlock(w, input) {
      const st = new Uint8Array(16);
      for (let i = 0; i < 16; i++) st[i] = input[i] ^ w[i];
      for (let round = 1; round <= 10; round++) {
        // SubBytes + ShiftRows（⚠ 四行都要从 t 回写——只写 1..3 行会让第 0 行
        // 跳过 SubBytes，整轮密文全错）
        const t = new Uint8Array(16);
        for (let i = 0; i < 16; i++) t[i] = SBOX[st[i]];
        for (let c = 0; c < 4; c++)
          for (let r = 0; r < 4; r++) st[r + 4 * c] = t[r + 4 * ((c + r) & 3)];
        if (round !== 10) {
          // MixColumns（列主序 st[4c+r]，标准矩阵 2/3/1/1）
          for (let c = 0; c < 4; c++) {
            const a0 = st[4 * c], a1 = st[4 * c + 1], a2 = st[4 * c + 2], a3 = st[4 * c + 3];
            st[4 * c] = gmul(a0, 2) ^ gmul(a1, 3) ^ a2 ^ a3;
            st[4 * c + 1] = a0 ^ gmul(a1, 2) ^ gmul(a2, 3) ^ a3;
            st[4 * c + 2] = a0 ^ a1 ^ gmul(a2, 2) ^ gmul(a3, 3);
            st[4 * c + 3] = gmul(a0, 3) ^ a1 ^ a2 ^ gmul(a3, 2);
          }
        }
        // AddRoundKey（在 MixColumns 之后——FIPS-197 轮序：Sub/Shift → Mix → AddKey）
        for (let i = 0; i < 16; i++) st[i] ^= w[16 * round + i];
      }
      return st;
    }
    return {
      ecbEncrypt(bytes, key) {
        /* PKCS#7 填充（node crypto aes-128-ecb 默认，eapi 服务端要求） */
        const pad = 16 - (bytes.length % 16);
        const buf = new Uint8Array(bytes.length + pad);
        buf.set(bytes);
        buf.fill(pad, bytes.length);
        const w = expandKey(key);
        const out = new Uint8Array(buf.length);
        for (let off = 0; off < buf.length; off += 16) {
          out.set(encryptBlock(w, buf.subarray(off, off + 16)), off);
        }
        return out;
      },
    };
  })();
  const EAPI_KEY = utf8Bytes("e82ckenh8dichen8");
  function eapiParams(apiPath, payloadObj) {
    const text = JSON.stringify(payloadObj);
    const digest = md5Bytes(utf8Bytes(`nobody${apiPath}use${text}md5forencrypt`));
    const data = `${apiPath}-36cd479b6b5-${text}-36cd479b6b5-${digest}`;
    return bytesToHexUpper(AES.ecbEncrypt(utf8Bytes(data), EAPI_KEY));
  }
  /*__EAPI_CRYPTO_END__*/

  /* ---------- 配置 ---------- */
  let bridgePort = 20754;
  try {
    const p = parseInt(plugin.getConfig("port", 20754), 10);
    if (p >= 1024 && p <= 65535) bridgePort = p;
  } catch (e) { /* 默认端口 */ }
  const BRIDGE = `http://127.0.0.1:${bridgePort}`;

  /* ---------- 运行时句柄 ---------- */
  let store = null;
  let getPlayingSong = null;
  let lastPlaying = false;
  let lastProgressMs = 0;
  let disposed = false;
  const installedAt = Date.now();
  log("加载中 v" + PLUGIN_VERSION, "→ 桥", BRIDGE);

  for (let i = 0; i < 100 && !window.legacyNativeCmder; i++) await sleep(200);
  if (!window.legacyNativeCmder) warn("legacyNativeCmder 未出现，事件源降级");

  try {
    if (window.betterncm && window.betterncm.ncm && window.betterncm.ncm.getPlayingSong) {
      getPlayingSong = window.betterncm.ncm.getPlayingSong.bind(window.betterncm.ncm);
    }
  } catch (e) { /* 兜底不可用则跳过 */ }

  /* ---------- 歌曲状态 ---------- */
  function mediaEl() { return document.querySelector("video,audio"); }
  function mediaElStrict() {
    try {
      const els = Array.from(document.querySelectorAll("video,audio"));
      return els.find((e) => e && (e.duration > 0 || e.paused === false)) || els[0] || null;
    } catch (e) { return null; }
  }
  function httpsUp(u) {
    if (!u || typeof u !== "string") return "";
    let s = u.replace(/^http:\/\//i, "https://");
    if (s.indexOf("param=") === -1 && /music\.126\.net/.test(s)) {
      s += (s.indexOf("?") === -1 ? "?" : "&") + "param=500y500";
    }
    return s;
  }
  /* 状态快照：媒体元素进度为帧级主源（逐字歌词对时需要），事件与 store 补充元信息 */
  function buildSnapshot() {
    const el = mediaElStrict();
    let playing = lastPlaying;
    let posMs = lastProgressMs;
    let durMs = 0;
    if (el) {
      playing = el.paused === false;
      posMs = Math.floor((el.currentTime || 0) * 1000);
      durMs = el.duration > 0 ? Math.floor(el.duration * 1000) : 0;
    }
    let song = null;
    try {
      if (store) {
        const p = store.getState().playing || {};
        const id = p.resourceTrackId || p.onlineResourceId || null;
        if (id) {
          song = {
            id: Number(id) || id,
            name: p.resourceName || "未知歌名",
            artists: (p.resourceArtists || []).map((a) => a && a.name).filter(Boolean),
            album: (p.curTrack && p.curTrack.album && (p.curTrack.album.albumName || p.curTrack.album.name)) || "",
            cover: httpsUp(p.resourceCoverUrl || (p.curTrack && p.curTrack.album && p.curTrack.album.picUrl) || ""),
          };
          if (durMs <= 0 && p.curTrack && p.curTrack.duration > 0) durMs = p.curTrack.duration;
          if (p.playingState === 2) playing = true;
          else if (p.playingState === 1) playing = false;
        }
      }
      if (!song && getPlayingSong) {
        const d = (getPlayingSong() || {}).data;
        if (d && d.id) {
          song = {
            id: Number(d.id) || d.id,
            name: d.name || "未知歌名",
            artists: (d.artists || []).map((a) => a && a.name).filter(Boolean),
            album: (d.album && (d.album.name || d.album.albumName)) || "",
            cover: httpsUp((d.album && d.album.picUrl) || ""),
          };
          if (durMs <= 0 && d.duration > 0) durMs = d.duration;
        }
      }
    } catch (e) { /* 状态降级 */ }
    return {
      song,
      playing,
      positionMs: Math.max(0, posMs),
      durationMs: Math.max(0, durMs),
      ts: Date.now(),
    };
  }

  /* ---------- 推送到桥 ---------- */
  let bridgeAlive = false;
  async function post(path, body) {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 2500);
      const r = await fetch(BRIDGE + path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: ctl.signal,
      });
      clearTimeout(t);
      return r && r.ok;
    } catch (e) { return false; }
  }
  let lastStateSig = "";
  async function pushState(force) {
    if (disposed) return;
    const snap = buildSnapshot();
    lastPlaying = snap.playing;
    if (snap.durationMs > 0 && snap.positionMs > snap.durationMs) snap.positionMs = snap.durationMs;
    const sig = JSON.stringify([snap.song && snap.song.id, snap.playing, snap.positionMs, snap.durationMs]);
    if (!force && sig === lastStateSig) return;
    lastStateSig = sig;
    const ok = await post("/api/plugin/state", snap);
    if (ok && !bridgeAlive) { bridgeAlive = true; log("桥已连通"); }
  }
  /* 心跳：播放 1s / 暂停 3.5s（桥侧 5s 新鲜度窗口，暂停也必须保活） */
  setInterval(() => { pushState(true).catch(() => {}); }, 1000);
  setInterval(() => { if (!lastPlaying) pushState(true).catch(() => {}); }, 3500);

  /* ---------- NCM 原生事件（播放态/进度兜底） ---------- */
  try {
    const cmder = window.legacyNativeCmder;
    if (cmder && cmder.appendRegisterCall) {
      cmder.appendRegisterCall("PlayState", "audioplayer", function (playId, idStr, state) {
        lastPlaying = state === 1;
        pushState(true).catch(() => {});
      });
      cmder.appendRegisterCall("PlayProgress", "audioplayer", function (playId, sec) {
        if (typeof sec === "number" && sec >= 0) lastProgressMs = Math.floor(sec * 1000);
      });
      cmder.appendRegisterCall("Seek", "audioplayer", function (playId, seekId, code, pos) {
        if (typeof pos === "number" && pos >= 0) {
          lastProgressMs = Math.floor(pos * 1000);
          pushState(true).catch(() => {});
        }
      });
      log("原生事件已注册（PlayState/PlayProgress/Seek）");
    }
  } catch (e) { warn("注册原生事件失败", e); }

  /* ---------- Redux store 发现（NCM 3.x dva；webpack4/5 双兼容） ---------- */
  function captureWebpackRequire() {
    return new Promise((resolve) => {
      try {
        const gp = window.webpackJsonp;
        if (gp && typeof gp.push === "function") {
          const id = "__chushi_lyric_" + Date.now() + "_" + Math.floor(Math.random() * 1e6);
          const chunk = {};
          chunk[id] = function (module, exports, require) {
            try { resolve(typeof require === "function" ? require : null); } catch (e) { resolve(null); }
          };
          if (Array.isArray(gp[0])) gp.push([[id], chunk, [[id]]]);
          else gp.push([[id], chunk]);
          setTimeout(() => resolve(null), 3000);
          return;
        }
      } catch (e) { /* 落入 webpack5 尝试 */ }
      try {
        for (const k in window) {
          if (k.indexOf("webpackChunk") === 0 && window[k] && typeof window[k].push === "function") {
            let req = null;
            window[k].push([
              ["__chushi_lyric_" + Date.now()],
              {},
              function (r0, r1) {
                if (typeof r0 === "function") req = r0;
                else if (typeof r1 === "function") req = r1;
              },
            ]);
            resolve(req);
            return;
          }
        }
      } catch (e) { /* 忽略 */ }
      resolve(null);
    });
  }
  function findModule(req, filter) {
    try {
      const cache = req && req.c;
      if (!cache) return null;
      for (const id in cache) {
        const mod = cache[id];
        const ex = mod && mod.exports;
        if (!ex) continue;
        const target = ex && ex.default ? ex.default : ex;
        try { if (filter(target)) return target; } catch (e) { /* 继续 */ }
      }
    } catch (e) { /* 忽略 */ }
    return null;
  }
  (async function findStore() {
    for (let i = 0; i < 50 && !disposed; i++) {
      const req = await captureWebpackRequire();
      if (req) {
        const dva = findModule(req, (ex) =>
          ex && typeof ex === "object" && ex.a && typeof ex.a.getStore === "function"
        );
        if (dva && dva.a && dva.a.inited && dva.a.app && dva.a.app._store) {
          store = dva.a.app._store;
          log("dva Redux store 已获取");
          /* 切歌即触发歌词流程 */
          try {
            let lastTrackId = null;
            store.subscribe(function () {
              try {
                const p = store.getState().playing || {};
                const tid = p.resourceTrackId || p.onlineResourceId || null;
                if (tid !== lastTrackId) {
                  lastTrackId = tid;
                  lastProgressMs = 0;
                  pushState(true).catch(() => {});
                  ensureLyric();
                }
              } catch (e) { /* 忽略 */ }
            });
          } catch (e) { /* 忽略 */ }
          break;
        }
      }
      await sleep(400);
    }
    if (!store) warn("未找到 Redux store，运行于媒体元素降级模式（无 songId 时歌词不可用）");
  })();

  /* ---------- 歌词 ---------- */
  const lyricCache = new Map();   // songId -> payload
  let curLyricSongId = 0;
  let lyricInflight = false;
  const CACHE_LS_KEY = "chushi-lyric-cache";
  try {
    const saved = JSON.parse(localStorage.getItem(CACHE_LS_KEY) || "[]");
    if (Array.isArray(saved)) for (const [k, v] of saved) lyricCache.set(k, v);
  } catch (e) { /* 缓存坏则重建 */ }
  function saveCache() {
    try {
      while (lyricCache.size > 8) lyricCache.delete(lyricCache.keys().next().value);
      localStorage.setItem(CACHE_LS_KEY, JSON.stringify(Array.from(lyricCache.entries()).slice(-8)));
    } catch (e) { /* 忽略 */ }
  }

  /* klyric JSON → yrc 同构文本：[start,dur](s,d,0)字(s,d,0)字… */
  function klyricToYrcText(klyricStr) {
    try {
      const k = JSON.parse(klyricStr);
      const lines = (k && k.lyric) || [];
      return lines.map((ln) => {
        const parts = (ln.c || []).map((w) => {
          const tx = String(w.tx || "");
          const ws = Math.round((ln.t || 0));
          return tx ? `(${ws},${Math.max(1, ln.d || 1)},0)${tx}` : "";
        }).join("");
        return `[${Math.round(ln.t || 0)},${Math.max(1, ln.d || 1)}]` + parts;
      }).join("\n");
    } catch (e) { return ""; }
  }

  async function fetchLyricEapi(songId) {
    const apiPath = "/api/song/lyric/v1";
    const attempt = async (yv) => {
      const params = eapiParams(apiPath, {
        id: String(songId), cp: false, radio: false,
        cv: 0, kv: 0, tv: 0, lv: 0, rv: 0, st: 0, yv: yv,
      });
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 6000);
      try {
        const r = await fetch("https://interface3.music.163.com/eapi" + apiPath, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: "params=" + params,
          signal: ctl.signal,
        });
        clearTimeout(t);
        if (!r || !r.ok) return null;
        return await r.json();
      } catch (e) { clearTimeout(t); return null; }
    };
    let j = await attempt(1);
    if (!j || !(j.yrc && j.yrc.lyric)) j = await attempt(-1);
    if (!j) return null;
    const yrc = (j.yrc && j.yrc.lyric) || "";
    const ytlrc = (j.ytlrc && j.ytlrc.lyric) || "";
    let krc = "";
    if (!yrc && j.klyric && j.klyric.lyric) krc = klyricToYrcText(j.klyric.lyric);
    return {
      yrc, ytlrc,
      lrc: (j.lrc && j.lrc.lyric) || "",
      tlyric: (j.tlyric && j.tlyric.lyric) || "",
      source: yrc ? "eapi-yrc" : krc ? "eapi-klyric" : "eapi-lrc",
      _krcText: krc,
    };
  }

  function channelCallLyric(songId) {
    return new Promise((resolve) => {
      try {
        if (!window.channel || typeof window.channel.call !== "function") return resolve(null);
        window.channel.call("track.lyric.getinfo", function (err, res) {
          try {
            if (err || !res) return resolve(null);
            resolve({
              yrc: "", ytlrc: "",
              lrc: (res.lrc && res.lrc.lyric) || "",
              tlyric: (res.tlyric && res.tlyric.lyric) || "",
              source: "channel-lrc",
              _krcText: "",
            });
          } catch (e) { resolve(null); }
        }, { id: String(songId), tv: -1, lv: -1, rv: -1, kv: -1 });
        setTimeout(() => resolve(null), 6000);
      } catch (e) { resolve(null); }
    });
  }

  async function fetchLyricPlain(songId) {
    try {
      const r = await fetch(`https://music.163.com/api/song/lyric?os=pc&id=${songId}&lv=-1&kv=-1&tv=-1`, { method: "GET" });
      if (!r || !r.ok) return null;
      const j = await r.json();
      if (!j) return null;
      return {
        yrc: "", ytlrc: "",
        lrc: (j.lrc && j.lrc.lyric) || "",
        tlyric: (j.tlyric && j.tlyric.lyric) || "",
        source: "plain-lrc",
        _krcText: "",
      };
    } catch (e) { return null; }
  }

  async function ensureLyric() {
    if (lyricInflight || disposed) return;
    const snap = buildSnapshot();
    const song = snap.song;
    if (!song || !song.id) return;
    const songId = song.id;
    if (songId === curLyricSongId) return;
    lyricInflight = true;
    curLyricSongId = songId;
    try {
      let payload = lyricCache.get(songId) || null;
      if (!payload) {
        payload = await fetchLyricEapi(songId);
        const wordOk = payload && (payload.yrc || payload._krcText);
        if (!wordOk) {
          const c2 = await channelCallLyric(songId);
          if (c2 && (c2.lrc || c2.tlyric)) payload = c2;
          else {
            const c3 = await fetchLyricPlain(songId);
            if (c3 && (c3.lrc || c3.tlyric)) payload = c3;
            else if (payload && (payload.lrc || payload.tlyric)) payload = payload;
            else payload = null;
          }
        }
      }
      if (!payload) { warn("歌词获取失败 songId=", songId); return; }
      const finalPayload = {
        songId, title: song.name || "", artist: (song.artists || []).join("/"),
        yrc: payload.yrc || payload._krcText || "",
        ytlrc: payload.ytlrc || "",
        lrc: payload.lrc || "",
        tlyric: payload.tlyric || "",
        source: payload.source || "",
      };
      if (!finalPayload.yrc && !finalPayload.lrc) { log("该曲目无歌词", songId); return; }
      lyricCache.set(songId, finalPayload);
      saveCache();
      const ok = await post("/api/plugin/lyric", finalPayload);
      log("歌词已推送", songId, finalPayload.source, ok ? "" : "(桥不可达，稍后随心跳重试)");
      if (!ok) lyricRetryPayload = finalPayload;
    } finally {
      lyricInflight = false;
    }
  }
  /* 桥暂时不可达时暂存，心跳恢复后补推 */
  let lyricRetryPayload = null;
  setInterval(async () => {
    if (lyricRetryPayload && !disposed) {
      const ok = await post("/api/plugin/lyric", lyricRetryPayload);
      if (ok) { lyricRetryPayload = null; }
    }
  }, 5000);

  /* ---------- 配置面（NCM 插件管理器） ---------- */
  try {
    plugin.onConfig(function (tools) {
      const wrap = document.createElement("div");
      wrap.style.cssText = "font-size:12px;line-height:1.8;";
      const info = document.createElement("div");
      info.innerText = `初始歌词源 ${PLUGIN_VERSION} — 给「初始」SMTC 音乐面板提供逐字歌词与精确进度（桥端口须与 SMTC 桥一致）`;
      const row = document.createElement("div");
      const label = document.createElement("span");
      label.innerText = "桥端口（重启网易云生效，默认 20754）: ";
      const input = tools.makeInput(String(plugin.getConfig("port", 20754)), { type: "number" });
      const btn = tools.makeBtn("保存", function () {
        const p = parseInt(input.value, 10);
        if (!p || p < 1024 || p > 65535) { alert("端口需在 1024-65535 之间"); return; }
        plugin.setConfig("port", p);
        alert("已保存，重启网易云音乐后生效");
      });
      row.appendChild(label);
      row.appendChild(input);
      row.appendChild(btn);
      wrap.appendChild(info);
      wrap.appendChild(row);
      return wrap;
    });
  } catch (e) { /* 配置面非关键 */ }

  /* ---------- 启动 ---------- */
  log("歌词源就绪 v" + PLUGIN_VERSION + "（→ " + BRIDGE + "）");
  await pushState(true).catch(() => {});
  await ensureLyric().catch(() => {});
  setInterval(() => { ensureLyric().catch(() => {}); }, 4000);

  try {
    window.__chushiLyricSource = {
      version: PLUGIN_VERSION,
      hasStore: () => !!store,
      snapshot: buildSnapshot,
      currentLyricSongId: () => curLyricSongId,
    };
  } catch (e) { /* 忽略 */ }
})();
