/*
 * 初始音乐桥 (ChuShi Music Bridge) — BetterNCMII / chromatic 插件
 *
 * 把网易云音乐「正在播放」暴露给「初始」起始页：
 *   状态出向：NCM 播放状态 → state.json（<datapath>/chushi-music/）
 *   命令入向：cmd/*.json（由 bridge.dll 落盘）→ NCM 播放控制
 *   （bridge.dll 由 manifest 的 native_plugin 声明，随插件加载；
 *     本 JS 与 DLL 之间以文件系统为契约，互不感知进程边界）
 *
 * 状态源（按可用性优先级）：
 *   ① NCM 3.x dva Redux store（webpack require 注入获取，字段与 InfLink-rs 适配器一致）
 *   ② legacyNativeCmder 原生事件：PlayState / PlayProgress / Seek（audioplayer 命名空间）
 *   ③ 兜底：betterncm.ncm.getPlayingSong() + 媒体元素轮询（只读降级）
 *
 * 控制命令（与初始 v1.7.5+ 音乐面板一一对应）：
 *   play / pause / toggle / next / prev / seek(positionMs) / volume(0-1) / mute
 *
 * 本文件由 BetterNCMII(js-framework) 以 AsyncFunction("plugin", code) 直接调用执行，
 * 顶层即为异步上下文，可直接 await。
 * 注入通道：manifest 的 injects.Main（v2 唯一消费链，loader.ts pageMap
 *   "/pub/app.html" → "Main"）；勿再声明 startup_script，否则会双重执行。
 */

/* eslint-disable */
(async function () {
  /* 幂等护栏：同一页面上下文被二次注入时直接退出 */
  if (window.__chushiMusicBridgeActive) return;
  window.__chushiMusicBridgeActive = true;

  const TAG = "[ChuShiMusicBridge]";
  const log = (...a) => console.log(TAG, ...a);
  const warn = (...a) => console.warn(TAG, ...a);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const clamp01 = (n) => Math.max(0, Math.min(1, n));

  const DIR = "chushi-music";
  const BRIDGE_VERSION = "1.2.0";

  /* ---------- 运行时句柄 ---------- */
  let store = null;              // dva Redux store（NCM 3.x）
  let getPlayingSong = null;     // betterncm.ncm.getPlayingSong（兜底）
  let lastPlaying = false;       // 最近一次已知播放态（toggle 用）
  let lastProgressMs = 0;        // 最近一次已知进度（PlayProgress 事件）
  let eventsOk = false;          // 原生事件注册成功
  let disposed = false;
  const installedAt = Date.now();
  log("加载中 v" + BRIDGE_VERSION + "…");

  /* ---------- 等待 NCM 世界就绪 ---------- */
  for (let i = 0; i < 100 && !window.legacyNativeCmder; i++) await sleep(200);
  if (!window.legacyNativeCmder) warn("legacyNativeCmder 未出现，事件源降级");

  try {
    if (window.betterncm && window.betterncm.ncm && window.betterncm.ncm.getPlayingSong) {
      getPlayingSong = window.betterncm.ncm.getPlayingSong.bind(window.betterncm.ncm);
    }
  } catch (e) { /* 兜底不可用则跳过 */ }

  /* ---------- 文件通道 ---------- */
  async function ensureDirs() {
    try { await window.betterncm.fs.mkdir(DIR + "/cmd"); } catch (e) {
      warn("mkdir 失败", e);
    }
  }

  const enc = encodeURIComponent;
  async function writeTextAtomic(file, json) {
    /* 原子写：tmp + /fs/rename；失败回落直写（DLL 对瞬时坏 JSON 有容错） */
    try {
      await window.betterncm.fs.writeFileText(DIR + "/" + file + ".tmp.json", json);
      await window.betterncm.betterncmFetch(
        `/fs/rename?path=${enc(DIR + "/" + file + ".tmp.json")}&dest=${enc(DIR + "/" + file)}`
      );
      return;
    } catch (e) { /* fallthrough */ }
    try { await window.betterncm.fs.writeFileText(DIR + "/" + file, json); } catch (e2) {
      warn(file + " 直写失败", e2);
    }
  }
  async function writeStateAtomic(json) { await writeTextAtomic("state.json", json); }

  /* ---------- 状态快照 ---------- */
  function httpsUp(u) {
    if (!u || typeof u !== "string") return "";
    let s = u.replace(/^http:\/\//i, "https://");
    if (s.indexOf("param=") === -1 && /music\.126\.net/.test(s)) {
      s += (s.indexOf("?") === -1 ? "?" : "&") + "param=500y500";
    }
    return s;
  }

  /* 媒体元素兜底（NCM 用页面内 media 元素出声） */
  function mediaEl() {
    return document.querySelector("video,audio");
  }

  function snapFromStore() {
    const p = (store && store.getState && store.getState().playing) || {};
    const playing = lastPlaying;
    const song = p.resourceTrackId || p.onlineResourceId
      ? {
          id: p.resourceTrackId || p.onlineResourceId,
          name: p.resourceName || "未知歌名",
          artists: (p.resourceArtists || []).map((a) => a && a.name).filter(Boolean),
          album:
            (p.curTrack && p.curTrack.album && (p.curTrack.album.albumName || p.curTrack.album.name)) || "",
          cover: httpsUp(p.resourceCoverUrl),
          durationMs: p.curTrack && p.curTrack.duration > 0 ? p.curTrack.duration : 0,
          local: p.trackFileType === "local",
        }
      : null;
    return {
      v: 1,
      ts: Date.now(),
      client: "netease-music",
      song,
      playing,
      positionMs: lastProgressMs,
      volume: typeof p.playingVolume === "number" ? p.playingVolume : null,
      mode: p.playingMode || "",
    };
  }

  function snapFromFallback() {
    const el = mediaEl();
    let playing = lastPlaying;
    let pos = lastProgressMs;
    if (el) {
      playing = el.paused === false;
      pos = Math.floor((el.currentTime || 0) * 1000);
    }
    let song = null;
    try {
      const gp = getPlayingSong && getPlayingSong();
      const d = gp && gp.data;
      if (d && d.id) {
        song = {
          id: d.id,
          name: d.name || "未知歌名",
          artists: (d.artists || []).map((a) => a && a.name).filter(Boolean),
          album: (d.album && (d.album.name || d.album.albumName)) || "",
          cover: httpsUp((d.album && d.album.picUrl) || ""),
          durationMs: (el && el.duration > 0) ? Math.floor(el.duration * 1000) : d.duration || 0,
          local: false,
        };
      }
    } catch (e) { /* 忽略 */ }
    return {
      v: 1,
      ts: Date.now(),
      client: "netease-music",
      song,
      playing,
      positionMs: pos,
      volume: el ? clamp01(el.volume) : null,
      mode: "",
    };
  }

  function buildSnapshot() {
    try {
      if (store) return snapFromStore();
    } catch (e) { warn("snapFromStore 异常", e); }
    return snapFromFallback();
  }

  /* ---------- 推送（信号量 + 节流） ---------- */
  let lastSig = "";
  let lastWriteAt = 0;
  let pendingWrite = false;

  async function pushState(force) {
    if (disposed) return;
    const snap = buildSnapshot();
    lastPlaying = snap.playing;
    if (snap.song && snap.song.durationMs > 0 && snap.positionMs > snap.song.durationMs) {
      snap.positionMs = snap.song.durationMs;
    }
    const sig = JSON.stringify(Object.assign({}, snap, { ts: 0 }));
    const now = Date.now();
    if (!force && sig === lastSig) return;
    if (!force && now - lastWriteAt < 300) {
      if (!pendingWrite) {
        pendingWrite = true;
        setTimeout(() => { pendingWrite = false; pushState(true); }, 320);
      }
      return;
    }
    lastSig = sig;
    lastWriteAt = now;
    await writeStateAtomic(JSON.stringify(snap));
  }

  /* 1s 心跳：播放中推动进度（暂停时快照不变不写盘） */
  setInterval(() => { pushState(false).catch(() => {}); }, 1000);

  /* ---------- 诊断落盘（diag.json → /api/debug 透传） ---------- */
  let lastDiagSig = "";
  function buildDiag() {
    return {
      v: BRIDGE_VERSION,
      ts: Date.now(),
      installedAt,
      storeReady: !!store,
      eventsHooked: eventsOk,
      getPlayingSong: !!getPlayingSong,
      media: !!mediaEl(),
      href: String((typeof location !== "undefined" && location.href) || "").slice(0, 80),
    };
  }
  async function pushDiag() {
    try {
      const d = JSON.stringify(buildDiag());
      if (d === lastDiagSig) return;
      lastDiagSig = d;
      await writeTextAtomic("diag.json", d);
    } catch (e) { /* 诊断非关键 */ }
  }
  /* 10s 心跳：三源状态变化即写（媒体元素/store 晚到也能反映） */
  setInterval(() => { pushDiag().catch(() => {}); }, 10000);

  /* ---------- NCM 原生事件 ---------- */
  try {
    const cmder = window.legacyNativeCmder;
    if (cmder && cmder.appendRegisterCall) {
      /* PlayState: (playId, idStr, state) —— 1=播放 2=暂停 */
      cmder.appendRegisterCall("PlayState", "audioplayer", function (playId, idStr, state) {
        lastPlaying = state === 1;
        pushState(true).catch(() => {});
      });
      /* PlayProgress: (playId, currentSeconds, cacheProgress, force) */
      cmder.appendRegisterCall("PlayProgress", "audioplayer", function (playId, sec) {
        if (typeof sec === "number" && sec >= 0) lastProgressMs = Math.floor(sec * 1000);
      });
      /* Seek: (playId, seekId, code, positionSeconds) */
      cmder.appendRegisterCall("Seek", "audioplayer", function (playId, seekId, code, pos) {
        if (typeof pos === "number" && pos >= 0) {
          lastProgressMs = Math.floor(pos * 1000);
          pushState(true).catch(() => {});
        }
      });
      log("原生事件已注册（PlayState/PlayProgress/Seek）");
      eventsOk = true;
      pushDiag().catch(() => {});
    }
  } catch (e) { warn("注册原生事件失败", e); }

  /* ---------- Redux store 发现（NCM 3.x dva；webpack4/5 双兼容） ---------- */

  function captureWebpackRequire() {
    return new Promise((resolve) => {
      /* webpack4：window.webpackJsonp.push 假模块捕获（push 时同步调用工厂） */
      try {
        const gp = window.webpackJsonp;
        if (gp && typeof gp.push === "function") {
          const id = "__chushi_req_" + Date.now() + "_" + Math.floor(Math.random() * 1e6);
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
      /* webpack5：全局名 webpackChunk<AppName>，push([chunkIds, modules, runtime]) */
      try {
        for (const k in window) {
          if (k.indexOf("webpackChunk") === 0 && window[k] && typeof window[k].push === "function") {
            let req = null;
            window[k].push([
              ["__chushi_" + Date.now()],
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
          pushDiag().catch(() => {});
          /* 订阅：切歌（resourceTrackId 变化）立即推送 */
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
                }
              } catch (e) { /* 忽略 */ }
            });
          } catch (e) { /* 忽略 */ }
          break;
        }
      }
      await sleep(400);
    }
    if (!store) warn("未找到 Redux store，运行于只读降级模式");
    /* store 到位后立即推一帧（无论是否降级） */
    pushState(true).catch(() => {});
  })();

  /* ---------- 控制命令 ---------- */
  function dispatchAction(a) {
    try { if (store) { store.dispatch(a); return true; } } catch (e) { warn("dispatch 失败", e); }
    return false;
  }

  /* 只读降级时的 DOM 控制兜底（尽力而为） */
  function domControl(act) {
    try {
      const sel = {
        toggle: ".btn-pas",
        next: ".btn-next, .btn-skip-next",
        prev: ".btn-prev, .btn-skip-previous",
      }[act];
      if (sel) {
        const el = document.querySelector(sel);
        if (el) { el.click(); return true; }
      }
    } catch (e) { /* 忽略 */ }
    return false;
  }

  function handleCommand(c) {
    if (!c || typeof c.action !== "string") return;
    const a = c.action;
    log("命令", a, c);
    const ok =
      a === "play" ? dispatchAction({ type: "playing/resume", payload: { triggerScene: "desktopLyric" } }) :
      a === "pause" ? dispatchAction({ type: "playing/pause", payload: { triggerScene: "desktopLyric" } }) :
      a === "toggle" ? (lastPlaying
        ? dispatchAction({ type: "playing/pause", payload: { triggerScene: "desktopLyric" } })
        : dispatchAction({ type: "playing/resume", payload: { triggerScene: "desktopLyric" } })) :
      a === "next" ? dispatchAction({ type: "playingList/jump2Track", payload: { flag: 1, type: "call", triggerScene: "hotKey" } }) :
      a === "prev" ? dispatchAction({ type: "playingList/jump2Track", payload: { flag: -1, type: "call", triggerScene: "hotKey" } }) :
      a === "seek" && typeof c.positionMs === "number"
        ? dispatchAction({ type: "playing/setPlayingPosition", payload: { duration: c.positionMs / 1000 } }) :
      a === "volume" && typeof c.volume === "number"
        ? dispatchAction({ type: "playing/setVolume", payload: { volume: clamp01(c.volume) } }) :
      a === "mute" ? dispatchAction({ type: "playing/switchMute" }) : false;
    if (!ok && (a === "toggle" || a === "next" || a === "prev" || a === "play" || a === "pause")) {
      domControl(a === "play" ? "toggle" : a === "pause" ? "toggle" : a);
    }
    setTimeout(() => pushState(true).catch(() => {}), 250);
  }

  /* ---------- 命令消费：watchDirectory 事件 + 轮询兜底 ---------- */
  const processedCmds = new Set();

  function baseName(p) { return String(p).split(/[\\/]/).pop(); }

  async function pollCmds() {
    try {
      const files = (await window.betterncm.fs.readDir(DIR + "/cmd")) || [];
      for (const f of files) {
        const name = baseName(f);
        if (!/^cmd-.+\.json$/.test(name) || processedCmds.has(name)) continue;
        processedCmds.add(name);
        if (processedCmds.size > 500) processedCmds.clear();
        try {
          const txt = await window.betterncm.fs.readFileText(DIR + "/cmd/" + name);
          let cmd = null;
          try { cmd = JSON.parse(txt); } catch (e) { /* 坏文件跳过 */ }
          if (cmd) handleCommand(cmd);
        } catch (e) { /* 忽略 */ }
        try { await window.betterncm.fs.remove(DIR + "/cmd/" + name); } catch (e) { /* 忽略 */ }
      }
    } catch (e) { /* 目录未就绪等瞬时错误静默 */ }
  }

  try {
    if (window.betterncm_native && window.betterncm_native.fs && window.betterncm_native.fs.watchDirectory) {
      window.betterncm_native.fs.watchDirectory(DIR + "/cmd", function () {
        setTimeout(pollCmds, 60);
      });
      log("watchDirectory 已挂载");
    }
  } catch (e) { warn("watchDirectory 不可用，仅轮询模式", e); }
  setInterval(pollCmds, 800);

  /* ---------- 配置面（NCM 插件管理器里显示） ---------- */
  try {
    plugin.onConfig(function (tools) {
      const wrap = document.createElement("div");
      wrap.style.cssText = "font-size:12px;line-height:1.8;";
      const info = document.createElement("div");
      info.innerText = "初始音乐桥 " + BRIDGE_VERSION + " — 把正在播放暴露给「初始」起始页";
      const row = document.createElement("div");
      const label = document.createElement("span");
      label.innerText = "服务端口（重启网易云生效，默认 10754）: ";
      const input = tools.makeInput(String(plugin.getConfig("port", 10754)), { type: "number" });
      const btn = tools.makeBtn("保存", function () {
        const p = parseInt(input.value, 10);
        if (!p || p < 1024 || p > 65535) { alert("端口需在 1024-65535 之间"); return; }
        plugin.setConfig("port", p);
        window.betterncm.fs.writeFileText(DIR + "/config.json", JSON.stringify({ port: p }));
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
  await ensureDirs();
  log("桥接就绪 v" + BRIDGE_VERSION + "（状态文件 → " + DIR + "/state.json，命令 ← " + DIR + "/cmd/）");
  await pushDiag().catch(() => {});

  /* 调试句柄 */
  try {
    window.__chushiMusicBridge = {
      version: BRIDGE_VERSION,
      hasStore: () => !!store,
      snapshot: buildSnapshot,
    };
  } catch (e) { /* 忽略 */ }
})();
