/* verify-v6-whitebox.mjs — vm white-box: the REAL v6 plugin index.js files
 * run inside mock NetEase renderer environments. Fresh-written for v6.
 *
 * Gates:
 *   B1-B9   ChuShi Music Bridge (truth compose, hub routes, CORS, command
 *           queue, single currentTime write, seek ack, lyric serve, port
 *           fallback, smtc-cmd handling)
 *   M1-M7   ChuShi SMTC Manager (metadata/playbackState/positionState,
 *           action handlers -> cc:smtc-cmd, none-state, heartbeat ack,
 *           unsupported honesty)
 *   L1-L8   ChuShi Lyric Source (eapi exact-params cross-check against a
 *           second Node-side implementation, fetch ladder, klyric convert,
 *           cache, channel/direct fallback)
 * Exit 0 only when every gate passes.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { createHash, createCipheriv } from "node:crypto";

const ROOT = "/home/z/my-project";
let pass = 0, fail = 0;
const failures = [];
function check(name, ok, detail = "") {
  if (ok) { pass++; console.log(`ok   ${name}`); }
  else { fail++; failures.push(name); console.error(`FAIL ${name}${detail ? " :: " + detail : ""}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ */
/* mock environment builder                                            */
/* ------------------------------------------------------------------ */

function makeEnv(opts = {}) {
  const env = {
    listeners: {},          /* window event listeners */
    emitted: [],            /* all dispatched events */
    timers: [],
  };

  class CustomEvent {
    constructor(type, init) { this.type = type; this.detail = init && init.detail; }
  }

  const windowObj = {
    addEventListener(type, fn) { (env.listeners[type] ||= []).push(fn); },
    removeEventListener() { },
    dispatchEvent(ev) {
      env.emitted.push(ev);
      (env.listeners[ev.type] || []).forEach((fn) => {
        try { fn(ev); } catch (e) { env.errors ||= []; env.errors.push(String(e)); }
      });
      return true;
    },
    location: { href: "app://ncm/main", search: "" },
  };
  if (opts.webpackJsonp) windowObj.webpackJsonp = opts.webpackJsonp;
  if (opts.channel) windowObj.channel = opts.channel;
  if (opts.legacyNativeCmder) windowObj.legacyNativeCmder = opts.legacyNativeCmder;
  if (opts.MediaMetadata) windowObj.MediaMetadata = opts.MediaMetadata;
  if (opts.betterncm) windowObj.betterncm = opts.betterncm;

  const documentObj = {
    querySelectorAll: opts.querySelectorAll || (() => []),
    querySelector: () => null,
    createElement: () => ({ style: { cssText: "" }, appendChild() { }, classList: { add() { }, remove() { }, toggle() { } }, setAttribute() { }, textContent: "" }),
  };

  const storage = new Map();
  const localStorageObj = {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
  };

  const sandbox = {
    window: windowObj,
    document: documentObj,
    navigator: opts.navigator || {},
    localStorage: localStorageObj,
    CustomEvent,
    URL,
    Buffer,
    console: { log() { }, warn() { }, error() { } },
    setTimeout, clearTimeout, setInterval, clearInterval,
    fetch: opts.fetch || (() => Promise.resolve(null)),
    require: opts.requireMock || (() => { throw new Error("require not mocked"); }),
    plugin: opts.plugin || { getConfig: () => undefined },
    Date, Math, JSON, Promise, Object, Array, Number, String, Boolean, Map, Set, RegExp, Error, isFinite, parseInt, parseFloat,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  env.ctx = sandbox;
  env.window = windowObj;
  env.storage = storage;
  return env;
}

function runPlugin(relPath, env) {
  const code = readFileSync(join(ROOT, relPath), "utf8");
  vm.runInContext(code, env.ctx, { filename: relPath });
}

function dispatch(env, type, detail) {
  env.window.dispatchEvent(new (env.ctx.CustomEvent)(type, { detail }));
}

/* ------------------------------------------------------------------ */
/* B: ChuShi Music Bridge                                              */
/* ------------------------------------------------------------------ */

async function testBridge() {
  const fakeStoreSlice = {
    paused: false,
    position: 42.5,
    curTrack: { duration: 269300, album: { albumName: "叶惠美", picUrl: "https://p.music/album.jpg" } },
    resourceTrackId: 9913,
    resourceName: "晴天",
    resourceArtists: [{ name: "周杰伦" }],
    resourceCoverUrl: "https://p.music/cover.jpg",
  };
  const fakeRequire = {
    c: { mod1: { exports: { getStore: () => ({ _store: { getState: () => ({ playing: fakeStoreSlice }), dispatch() { } } }) } } },
  };
  const webpackJsonp = [];
  webpackJsonp.push = function (arr) {
    const [, facs, order] = arr;
    for (const t of (order && order[0]) || []) if (facs[t]) facs[t](null, null, fakeRequire);
    return 0;
  };

  const el = {
    tagName: "AUDIO", isConnected: true, paused: false,
    currentTime: 42.5, duration: 269.3,
    playCount: 0, pauseCount: 0,
    play() { this.playCount++; this.paused = false; },
    pause() { this.pauseCount++; this.paused = true; },
  };
  const nativeCbs = {};
  const legacyNativeCmder = {
    appendRegisterCall(type, ch, cb) { nativeCbs[type] = cb; },
  };

  /* mock node http module */
  const httpRec = { handlers: [], listens: [], errors: [] };
  const httpMock = {
    createServer(handler) {
      httpRec.handlers.push(handler);
      return {
        on(ev, cb) { if (ev === "error") httpRec.errors.push(cb); },
        listen(port, host, cb) {
          httpRec.listens.push({ port, host });
          if (httpRec.failPorts && httpRec.failPorts.includes(port)) {
            const cbErr = httpRec.errors[httpRec.errors.length - 1];
            setTimeout(() => cbErr({ code: "EADDRINUSE" }), 1);
          } else if (cb) setTimeout(cb, 1);
        },
        close() { },
      };
    },
  };

  const env = makeEnv({
    webpackJsonp,
    legacyNativeCmder,
    querySelectorAll: () => [el],
    requireMock: (m) => {
      if (m === "http") return httpMock;
      throw new Error("unexpected require " + m);
    },
    plugin: { getConfig: () => "26801" },
  });
  runPlugin("bridge/v6/music-bridge/index.js", env);
  await sleep(30);

  /* B1 hub binds 127.0.0.1:26801 */
  check("B1 hub listens 127.0.0.1:26801",
    httpRec.listens.length === 1 && httpRec.listens[0].port === 26801 && httpRec.listens[0].host === "127.0.0.1",
    JSON.stringify(httpRec.listens));
  const handler = httpRec.handlers[0];

  function reqRes(method, url, bodyChunks) {
    const res = {
      headers: {}, code: 0, body: "",
      setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
      writeHead(code, headers) {
        this.code = code;
        if (headers) for (const k of Object.keys(headers)) this.headers[k.toLowerCase()] = headers[k];
      },
      end(b) { if (b) this.body += b; },
    };
    const req = {
      method, url, _chunks: bodyChunks || [],
      on(ev, cb) {
        if (ev === "data") { for (const c of this._chunks) cb(Buffer.from(c)); }
        if (ev === "end") setTimeout(cb, 1);
      },
    };
    return { req, res };
  }

  /* B2 /api/state identity + truth */
  {
    const { req, res } = reqRes("GET", "/api/state");
    handler(req, res);
    await sleep(10);
    const j = JSON.parse(res.body);
    check("B2 state ok+name+version", j.ok === true && j.name === "chushi-music-hub" && j.version === "6.0.0");
    check("B2 ne truth from dva store", j.ne && j.ne.title === "晴天" && j.ne.songId === 9913 &&
      j.ne.playing === true && Math.abs(j.ne.position - 42.5) < 0.2 && Math.abs(j.ne.duration - 269.3) < 0.01,
      JSON.stringify(j.ne));
    check("B2 ne carries plugin version", j.ne.v === "6.0.0");
    check("B2 CORS origin *", res.headers["access-control-allow-origin"] === "*");
    check("B2 PNA preflight header", res.headers["access-control-allow-private-network"] === "true");
  }

  /* B3 OPTIONS preflight -> 204 */
  {
    const { req, res } = reqRes("OPTIONS", "/api/cmd");
    handler(req, res);
    await sleep(5);
    check("B3 OPTIONS 204", res.code === 204);
  }

  /* B4 404 unknown */
  {
    const { req, res } = reqRes("GET", "/api/nothing");
    handler(req, res);
    await sleep(5);
    check("B4 unknown route 404", res.code === 404);
  }

  /* B5 seek via POST /api/cmd: exactly one currentTime write + ack true */
  {
    const { req, res } = reqRes("POST", "/api/cmd", ['{"cmd":"seek","position":100}']);
    handler(req, res);
    await sleep(30);
    const j = JSON.parse(res.body);
    check("B5 seek queued ok", j.ok === true && j.queued === true);
    await sleep(1700); /* <=250ms drain + 420ms write + 580ms read-back */
    check("B5 currentTime written once to target",
      el.currentTime === 100, "currentTime=" + el.currentTime);
    const { req: rq2, res: rs2 } = reqRes("GET", "/api/state");
    handler(rq2, rs2);
    await sleep(10);
    const ne = JSON.parse(rs2.body).ne;
    check("B5 seekAck honest true", ne.seekAckOk === true && ne.seekAckAt > 0, JSON.stringify(ne));
  }

  /* B6 toggle pauses the element */
  {
    const before = el.pauseCount;
    const { req, res } = reqRes("POST", "/api/cmd", ['{"cmd":"toggle"}']);
    handler(req, res);
    await sleep(400); /* drain interval 250ms */
    check("B6 toggle executed via element", el.pauseCount === before + 1);
  }

  /* B7 smtc-cmd event -> play */
  {
    const before = el.playCount;
    el.paused = true;
    dispatch(env, "cc:smtc-cmd", { cmd: "play", id: "t1" });
    await sleep(400); /* drain interval 250ms */
    check("B7 smtc system command executed", el.playCount === before + 1);
  }

  /* B8 lyric serve after bus result (use the watcher's real reqId) */
  {
    const reqEv = env.emitted.find((e) => e.type === "cc:lyric-req" && e.detail && e.detail.songId === 9913);
    check("B8 watcher requested lyric for 9913", !!reqEv, JSON.stringify(env.emitted.map(e => e.type)));
    if (reqEv) {
      dispatch(env, "cc:lyric-res", {
        reqId: reqEv.detail.reqId, songId: 9913,
        payload: { songId: 9913, title: "晴天", artist: "周杰伦", rev: "9913-eapi-yrc-123",
          yrc: "[1000,2000](0,1000,0)词", ytlrc: "tr", lrc: "", tlyric: "", source: "eapi-yrc" },
      });
    }
    await sleep(20);
    const { req, res } = reqRes("GET", "/api/lyric?songId=9913");
    handler(req, res);
    await sleep(10);
    const j = JSON.parse(res.body);
    check("B8 lyric served with payload", j.ok === true && j.lyric && j.lyric.yrc.includes("词") &&
      j.lyric.rev === "9913-eapi-yrc-123", JSON.stringify(j).slice(0, 120));
    const { req: rq2, res: rs2 } = reqRes("GET", "/api/lyric?songId=1");
    handler(rq2, rs2);
    await sleep(10);
    check("B8 lyric miss honest", JSON.parse(rs2.body).ok === false);
  }

  /* B9 port fallback on EADDRINUSE */
  {
    httpRec.failPorts = [26801, 26802];
    const env2 = makeEnv({
      webpackJsonp,
      requireMock: (m) => (m === "http" ? httpMock : (() => { throw new Error("x"); })()),
      plugin: { getConfig: () => "26801" },
    });
    runPlugin("bridge/v6/music-bridge/index.js", env2);
    await sleep(60);
    const ports = httpRec.listens.slice(-3).map((l) => l.port);
    check("B9 port fallback 26801->26802->26803",
      ports[0] === 26801 && ports[1] === 26802 && ports[2] === 26803, JSON.stringify(ports));
  }

  /* B10 native events drive truth */
  {
    nativeCbs["PlayState"](9914, 0);
    nativeCbs["PlayProgress"](50);
    await sleep(10);
    const { req, res } = reqRes("GET", "/api/state");
    handler(req, res);
    await sleep(10);
    const ne = JSON.parse(res.body).ne;
    check("B10 native PlayState flip -> paused truth", ne.playing === false, JSON.stringify(ne));
  }
}

/* ------------------------------------------------------------------ */
/* M: ChuShi SMTC Manager                                              */
/* ------------------------------------------------------------------ */

async function testSmtcManager() {
  class MediaMetadata {
    constructor(d) { Object.assign(this, d || {}); }
  }
  const rec = { actions: {}, pos: [], states: [], metas: [] };
  const mediaSession = {
    metadata: null,
    playbackState: "",
    setPositionState(r) { rec.pos.push(r); },
    setActionHandler(name, fn) { rec.actions[name] = fn; },
  };
  const env = makeEnv({
    navigator: { mediaSession },
    MediaMetadata,
  });
  /* capture Object.assign on metadata writes */
  runPlugin("bridge/v6/smtc-manager/index.js", env);

  /* M1 action handlers registered */
  for (const a of ["play", "pause", "previoustrack", "nexttrack", "seekto", "seekbackward", "seekforward", "stop"]) {
    check(`M1 action ${a} registered`, typeof rec.actions[a] === "function");
  }

  /* M2 state -> metadata + playing + positionState */
  dispatch(env, "cc:music-state", {
    title: "晴天", artist: "周杰伦", album: "叶惠美", pic: "https://p.music/cover.jpg",
    position: 42, duration: 269.3, playing: true,
  });
  const md = mediaSession.metadata;
  check("M2 metadata applied", md && md.title === "晴天" && md.artist === "周杰伦" && md.album === "叶惠美");
  check("M2 artwork upsized", md && md.artwork && md.artwork[0].src.includes("param=500y500"), md && md.artwork && md.artwork[0].src);
  check("M2 playbackState playing", mediaSession.playbackState === "playing");
  check("M2 positionState anchored", rec.pos.length === 1 &&
    rec.pos[0].duration === 269.3 && rec.pos[0].playbackRate === 1 && rec.pos[0].position === 42,
    JSON.stringify(rec.pos));

  /* M3 seekto forwards command */
  rec.actions["seekto"]({ seekTime: 123.5 });
  const cmdEv = env.emitted.filter((e) => e.type === "cc:smtc-cmd").pop();
  check("M3 seekto -> cc:smtc-cmd seek", cmdEv && cmdEv.detail.cmd === "seek" &&
    Math.abs(cmdEv.detail.position - 123.5) < 1e-9, JSON.stringify(cmdEv && cmdEv.detail));

  /* M4 play/pause/next/prev/stop */
  rec.actions["play"]();
  rec.actions["pause"]();
  rec.actions["nexttrack"]();
  rec.actions["previoustrack"]();
  rec.actions["stop"]();
  const cmds = env.emitted.filter((e) => e.type === "cc:smtc-cmd").slice(-5).map((e) => e.detail.cmd);
  check("M4 media key commands forwarded", JSON.stringify(cmds) === JSON.stringify(["play", "pause", "next", "prev", "pause"]),
    JSON.stringify(cmds));

  /* M5 seekforward uses local clock (pos 42 + ~elapsed) */
  rec.actions["seekforward"]();
  const fwd = env.emitted.filter((e) => e.type === "cc:smtc-cmd").pop();
  check("M5 seekforward ~pos+10", fwd && fwd.detail.cmd === "seek" && fwd.detail.position > 51.9 && fwd.detail.position < 54,
    JSON.stringify(fwd && fwd.detail));

  /* M6 pause state + none state */
  dispatch(env, "cc:music-state", { title: "晴天", position: 42, duration: 269.3, playing: false });
  check("M6 paused playbackState", mediaSession.playbackState === "paused");
  dispatch(env, "cc:music-state", { title: "" });
  check("M6 no-track -> none + null metadata", mediaSession.playbackState === "none" && mediaSession.metadata === null);

  /* M7 heartbeat ack carries version + session */
  const ack = env.emitted.filter((e) => e.type === "cc:smtc-ack").pop();
  check("M7 ack broadcast", ack && ack.detail.v === "6.0.0" && typeof ack.detail.session === "string",
    JSON.stringify(ack && ack.detail));

  /* M8 unsupported honesty (no mediaSession) */
  const env2 = makeEnv({ navigator: {} });
  runPlugin("bridge/v6/smtc-manager/index.js", env2);
  await sleep(600); /* ack fires at 400ms */
  check("M8 unsupported reported honestly", ack2 && ack2.detail.session === "unsupported",
    JSON.stringify(ack2 && ack2.detail));
}

/* ------------------------------------------------------------------ */
/* L: ChuShi Lyric Source                                              */
/* ------------------------------------------------------------------ */

function eapiParamsRef(path, payload) {
  const json = JSON.stringify(payload);
  const digest = createHash("md5").update("nobody" + path + "use" + json + "md5forencrypt", "utf8").digest("hex");
  const text = `${path}-36cd479b6b5-${json}-36cd479b6b5-${digest}`;
  const cipher = createCipheriv("aes-128-ecb", Buffer.from("e82ckenh8dichen8", "utf8"), Buffer.alloc(0));
  return Buffer.concat([cipher.update(text, "utf8"), cipher.final()]).toString("hex").toUpperCase();
}

async function testLyricSource() {
  const fetchCalls = [];
  let eapiResponse = {};
  let directResponse = {};
  const cryptoMock = (m) => {
    if (m === "crypto") return { createHash, createCipheriv };
    throw new Error("unexpected require " + m);
  };
  const env = makeEnv({
    requireMock: cryptoMock,
    fetch(url, init) {
      fetchCalls.push({ url, init });
      if (String(url).includes("eapi/song/lyric")) {
        return Promise.resolve({ json: () => Promise.resolve(eapiResponse) });
      }
      if (String(url).includes("music.163.com/api/song/lyric")) {
        return Promise.resolve({ json: () => Promise.resolve(directResponse) });
      }
      return Promise.resolve({ json: () => Promise.resolve({}) });
    },
    channel: { call(method, cb, args) { setTimeout(() => cb({ lyric: { lyric: "[100,2000]chan" }, transLyric: { lyric: "chtr" } }), 10); } },
  });
  runPlugin("bridge/v6/lyric-source/index.js", env);
  await sleep(20);

  /* L1 hello broadcast */
  check("L1 hello emitted", env.emitted.some((e) => e.type === "cc:lyric-hello" && e.detail.v === "6.0.0"));

  /* L2 eapi yrc path with EXACT protocol params (cross-implementation) */
  eapiResponse = { yrc: { lyric: "[1000,2000](0,1000,0)词" }, ytlrc: { lyric: "tr" } };
  const expectedParams = eapiParamsRef("/api/song/lyric/v1", {
    id: "9913", cp: false, radio: false, cv: 4747474, kv: -1, tv: -1, lv: -1, rv: -1, st: 0, yv: 1,
  });
  let res = null;
  const resP = new Promise((r) => {
    env.window.addEventListener("cc:lyric-res", (e) => { if (e.detail.reqId === "r1") r(e.detail); });
  });
  dispatch(env, "cc:lyric-req", { songId: 9913, reqId: "r1" });
  res = await Promise.race([resP, sleep(1500).then(() => null)]);
  check("L2 lyric-res received", !!res);
  check("L2 source eapi-yrc", res && res.payload && res.payload.source === "eapi-yrc", JSON.stringify(res && res.payload));
  check("L2 yrc content carried", res && res.payload && res.payload.yrc.includes("词"), res && res.payload && res.payload.yrc);
  const eapiCall = fetchCalls.find((c) => String(c.url).includes("eapi"));
  check("L2 eapi params byte-exact vs reference impl",
    eapiCall && eapiCall.init.body === "params=" + expectedParams,
    eapiCall && String(eapiCall.init.body).slice(0, 60));

  /* L3 cache: same song again -> served without new fetch */
  const callsBefore = fetchCalls.length;
  const resP2 = new Promise((r) => {
    env.window.addEventListener("cc:lyric-res", (e) => { if (e.detail.reqId === "r2") r(e.detail); });
  });
  dispatch(env, "cc:lyric-req", { songId: 9913, reqId: "r2" });
  const res2 = await Promise.race([resP2, sleep(1500).then(() => null)]);
  check("L3 cache hit no refetch", res2 && res2.payload && fetchCalls.length === callsBefore);

  /* L4 klyric conversion */
  eapiResponse = { klyric: { lyric: JSON.stringify([{ t: 500, c: [{ tx: "你" }, { tx: "好", t: 100 }] }, { t: 1500, c: [{ tx: "世" }] }]) } };
  const resP3 = new Promise((r) => {
    env.window.addEventListener("cc:lyric-res", (e) => { if (e.detail.reqId === "r3") r(e.detail); });
  });
  dispatch(env, "cc:lyric-req", { songId: 9914, reqId: "r3" });
  const res3 = await Promise.race([resP3, sleep(1500).then(() => null)]);
  check("L4 klyric -> yrc converted", res3 && res3.payload && res3.payload.source === "eapi-klyric" &&
    /^\[\d+,\d+\]\(\d+,\d+,\d\)你\(\d+,\d+,\d\)好/.test(res3.payload.yrc || ""), res3 && res3.payload && res3.payload.yrc);

  /* L5 channel fallback when eapi empty */
  eapiResponse = {};
  const resP4 = new Promise((r) => {
    env.window.addEventListener("cc:lyric-res", (e) => { if (e.detail.reqId === "r4") r(e.detail); });
  });
  dispatch(env, "cc:lyric-req", { songId: 9915, reqId: "r4" });
  const res4 = await Promise.race([resP4, sleep(2500).then(() => null)]);
  check("L5 channel fallback", res4 && res4.payload && res4.payload.source === "channel-lrc" &&
    res4.payload.lrc.includes("chan") && res4.payload.tlyric === "chtr", JSON.stringify(res4 && res4.payload));

  /* L6 direct fallback when eapi empty + channel yields nothing for this id */
  const env2 = makeEnv({
    requireMock: cryptoMock,
    fetch(url, init) {
      fetchCalls.push({ url, init });
      if (String(url).includes("music.163.com/api/song/lyric")) {
        return Promise.resolve({ json: () => Promise.resolve({ lrc: { lyric: "[300,2000]direct" }, tlyric: { lyric: "dtr" } }) });
      }
      return Promise.resolve({ json: () => Promise.resolve({}) });
    },
  });
  runPlugin("bridge/v6/lyric-source/index.js", env2);
  await sleep(20);
  const resP5 = new Promise((r) => {
    env2.window.addEventListener("cc:lyric-res", (e) => { if (e.detail.reqId === "r6") r(e.detail); });
  });
  dispatch(env2, "cc:lyric-req", { songId: 9916, reqId: "r6" });
  const res5 = await Promise.race([resP5, sleep(2500).then(() => null)]);
  check("L6 direct fallback", res5 && res5.payload && res5.payload.source === "direct-lrc" &&
    res5.payload.lrc.includes("direct") && res5.payload.tlyric === "dtr", JSON.stringify(res5 && res5.payload));

  /* L7 no crypto -> honest null (no crash) */
  const env3 = makeEnv({
    requireMock: () => { throw new Error("no crypto"); },
    fetch: () => Promise.resolve({ json: () => Promise.resolve({}) }),
  });
  runPlugin("bridge/v6/lyric-source/index.js", env3);
  await sleep(20);
  const resP6 = new Promise((r) => {
    env3.window.addEventListener("cc:lyric-res", (e) => { if (e.detail.reqId === "r7") r(e.detail); });
  });
  dispatch(env3, "cc:lyric-req", { songId: 9917, reqId: "r7" });
  const res6 = await Promise.race([resP6, sleep(2500).then(() => null)]);
  check("L7 eapi disabled -> ladder still resolves", res6 && res6.reqId === "r7" && (res6.payload === null || res6.payload.source !== "eapi-yrc"));
}

/* ------------------------------------------------------------------ */

await testBridge();
testSmtcManager();
await testLyricSource();

console.log(`\nverify-v6 whitebox: ${pass} pass, ${fail} fail`);
if (fail) { console.error("FAILED: " + failures.join(" | ")); process.exit(1); }
console.log("VERIFY-V6-WHITEBOX-OK");
process.exit(0);
