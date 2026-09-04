/* test-bridge-js.mjs — bridge-core.js 的 Node 假 NCM 世界对拍
 * 模拟 NCM 3.x 页面：webpack 4 jsonp / dva Redux store / legacyNativeCmder / 媒体元素，
 * 把 bridge-core.js 当作 CDP 注入体执行，断言快照与控制全路径。 */
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const JS_PATH = path.join(ROOT, "bridge/standalone/bridge-js/bridge-core.js");

/* ---------- 假 NCM 世界 ---------- */
function makeWorld({ withStore = true, withCmder = true, withMedia = true } = {}) {
  const dispatchLog = [];
  const regCalls = {}; // name -> [fn]
  const storeState = {
    playing: {
      resourceTrackId: 347230,
      resourceName: "夜空中最亮的星",
      resourceArtists: [{ name: "逃跑计划" }, { name: "" }],
      resourceCoverUrl: "http://p1.music.126.net/abc.jpg",
      curTrack: { album: { albumName: "世界" }, duration: 251000 },
      trackFileType: "online",
      playingVolume: 0.5,
      playingMode: "playOrder",
    },
  };
  const subscribers = [];
  const store = {
    getState: () => storeState,
    dispatch: (a) => { dispatchLog.push(a); },
    subscribe: (fn) => subscribers.push(fn),
  };
  const dvaModule = { exports: { a: { getStore: () => store, inited: true, app: { _store: store } } } };
  const cache = { "1": { exports: { foo: 1 } }, "2": dvaModule };
  function __webpack_require__(id) { return cache[id].exports; }
  __webpack_require__.c = cache;

  const webpackJsonp = [];
  webpackJsonp.push = function (data) {
    const chunkIds = data[0];
    const modules = data[1];
    const entries = data[2];
    for (const cid of chunkIds) {
      const factory = modules[cid];
      if (typeof factory === "function") {
        const m = { exports: {} };
        factory(m, m.exports, __webpack_require__);
        if (entries) for (const e of entries) { /* 同步执行入口（假） */ void e; }
      }
    }
    return webpackJsonp;
  };

  const media = {
    paused: false, currentTime: 30.5, volume: 0.8, duration: 251,
  };
  const document = {
    querySelector: (sel) => (withMedia && /video|audio/.test(sel) ? media : null),
  };

  const cmder = {
    appendRegisterCall: (name, ns, fn) => {
      (regCalls[name] = regCalls[name] || []).push(fn);
    },
  };

  const window = {
    webpackJsonp: withStore ? webpackJsonp : [],
    legacyNativeCmder: withCmder ? cmder : undefined,
  };
  const ctx = { window, document, JSON, Math, Date, console, String, Number, Boolean, Array, Object };
  ctx.globalThis = ctx;
  const sandbox = vm.createContext(ctx);
  return { sandbox, window, document, media, dispatchLog, regCalls, storeState, subscribers };
}

function install(world) {
  const code = readFileSync(JS_PATH, "utf8");
  const ret = vm.runInContext(code, world.sandbox, { filename: "bridge-core.js" });
  return ret;
}

let pass = 0, fail = 0;
function assert(cond, name) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ ${name}`); }
}

/* ---------- 用例 ---------- */
console.log("A. 完整世界（store+cmder+media）");
{
  const w = makeWorld();
  const ret = install(w);
  assert(ret === "chushi-bridge-installed", "安装返回标记");
  assert(!!w.window.__chushiBridge, "全局 __chushiBridge 挂载");

  const s1 = JSON.parse(w.window.__chushiBridge.snapshot());
  assert(s1.ok === true, "快照 ok");
  assert(s1.diag.store === true, "diag.store=true（dva 捕获成功）");
  assert(s1.diag.events === true, "diag.events=true（原生事件注册成功）");
  const snap = s1.snap;
  assert(snap.song && snap.song.id === 347230 && snap.song.name === "夜空中最亮的星", "歌曲元数据");
  assert(snap.song.artists.length === 1 && snap.song.artists[0] === "逃跑计划", "歌手过滤空名");
  assert(snap.song.album === "世界" && snap.song.durationMs === 251000, "专辑/曲长");
  assert(snap.song.cover.startsWith("https://p1.music.126.net/abc.jpg?param=500y500"), "封面 https 升级+裁切参数");
  assert(snap.song.local === false, "local 标记");
  assert(snap.playing === true && snap.positionMs === 30500, "媒体元素真源：playing/position");
  assert(snap.volume === 0.5, "volume 优先 store");
  assert(snap.client === "netease-music" && typeof snap.ts === "number", "契约字段");

  /* 控制 */
  const r1 = JSON.parse(w.window.__chushiBridge.controlText(JSON.stringify({ action: "toggle" })));
  assert(r1.ok === true && r1.action === "toggle", "toggle dispatch");
  const types = w.dispatchLog.map((a) => a.type);
  assert(types.includes("playing/resume") || types.includes("playing/pause"), "toggle 走 resume/pause");
  JSON.parse(w.window.__chushiBridge.controlText(JSON.stringify({ action: "next" })));
  JSON.parse(w.window.__chushiBridge.controlText(JSON.stringify({ action: "prev" })));
  JSON.parse(w.window.__chushiBridge.controlText(JSON.stringify({ action: "seek", positionMs: 120000 })));
  JSON.parse(w.window.__chushiBridge.controlText(JSON.stringify({ action: "volume", volume: 0.33 })));
  JSON.parse(w.window.__chushiBridge.controlText(JSON.stringify({ action: "mute" })));
  const t2 = w.dispatchLog.map((a) => a.type);
  assert(t2.includes("playingList/jump2Track") && w.dispatchLog.some((a) => a.type === "playingList/jump2Track" && a.payload.flag === 1), "next=jump2Track(1)");
  assert(w.dispatchLog.some((a) => a.type === "playingList/jump2Track" && a.payload.flag === -1), "prev=jump2Track(-1)");
  assert(w.dispatchLog.some((a) => a.type === "playing/setPlayingPosition" && a.payload.duration === 120), "seek 秒换算");
  assert(w.dispatchLog.some((a) => a.type === "playing/setVolume" && a.payload.volume === 0.33), "volume dispatch");
  assert(t2.includes("playing/switchMute"), "mute dispatch");
  assert(JSON.parse(w.window.__chushiBridge.controlText("not-json")).ok === false, "坏 JSON 拒绝");
  assert(JSON.parse(w.window.__chushiBridge.controlText(JSON.stringify({ action: 1 }))).ok === false, "非 string action 拒绝");

  /* 双安装幂等 */
  const ref1 = w.window.__chushiBridge;
  install(w);
  assert(w.window.__chushiBridge === ref1, "重复安装幂等（同一实例）");
}

console.log("B. 无媒体元素（事件驱动路径）");
{
  const w = makeWorld({ withMedia: false });
  install(w);
  const b = w.window.__chushiBridge;
  /* 初始事件：播放中 */
  w.regCalls["PlayState"][0](0, "1", 1);
  w.regCalls["PlayProgress"][0](0, 88.4);
  const s = JSON.parse(b.snapshot()).snap;
  assert(s.playing === true && s.positionMs === 88400, "事件驱动 playing/progress");
  assert(s.volume === 0.5, "无媒体时 volume 来自 store");
  /* 暂停事件 */
  w.regCalls["PlayState"][0](0, "1", 2);
  assert(JSON.parse(b.snapshot()).snap.playing === false, "PlayState=2 → 暂停");
  /* Seek 事件 */
  w.regCalls["Seek"][0](0, "x", 0, 200.5);
  assert(JSON.parse(b.snapshot()).snap.positionMs === 200500, "Seek 事件更新进度");
  /* toggle 语义跟随 lastPlaying */
  b.controlText(JSON.stringify({ action: "toggle" }));
  assert(w.dispatchLog[w.dispatchLog.length - 1].type === "playing/resume", "暂停态 toggle → resume");
}

console.log("C. 无 store（媒体+事件兜底）");
{
  const w = makeWorld({ withStore: false });
  install(w);
  const s = JSON.parse(w.window.__chushiBridge.snapshot());
  assert(s.ok === true && s.diag.store === false, "store 缺席仍可快照");
  const snap = s.snap;
  assert(snap.song === null, "song 为 null（元数据源缺席）");
  assert(snap.playing === true && snap.positionMs === 30500, "媒体兜底 playing/position");
  assert(snap.volume === 0.8, "媒体兜底 volume");
  assert(snap.durationMs === undefined || snap.durationMs === undefined, "无多余字段");
  const r = JSON.parse(w.window.__chushiBridge.controlText(JSON.stringify({ action: "next" })));
  assert(r.ok === false, "无 store 时 dispatch 失败");
}

console.log("D. 全空世界（no-source）");
{
  const w = makeWorld({ withStore: false, withCmder: false, withMedia: false });
  install(w);
  const s = JSON.parse(w.window.__chushiBridge.snapshot());
  assert(s.ok === false && s.error === "no-source", "no-source 明确报错");
  assert(s.diag && typeof s.diag.store === "boolean", "diag 仍返回");
}

console.log("E. 切歌订阅清进度");
{
  const w = makeWorld();
  install(w);
  w.regCalls["PlayProgress"][0](0, 100);
  w.storeState.playing.resourceTrackId = 999999;
  for (const fn of w.subscribers) fn();
  assert(w.window.__chushiBridge && JSON.parse(w.window.__chushiBridge.snapshot()).snap.song.id === 999999, "切歌后 song 更新");
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
