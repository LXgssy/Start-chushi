/* verify-v5 part 2: plugin B whitebox — run the REAL index.js in a vm with a
 * mock NetEase environment, intercept its HTTP plane, and assert:
 *   truth hierarchy (element/native/store), seek single-write + readback ack,
 *   command routing, and the eapi params recipe (decrypt with node crypto).
 * Run: node scripts/verify-v5-whitebox.mjs   (exit 0 = all green) */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import vm from "node:vm";

const ROOT = path.resolve(import.meta.dirname, "..");
let pass = 0, failCount = 0;
function ok(name, cond, detail = "") {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { failCount++; console.log(`  FAIL ${name} ${detail}`); }
}

const apiJs = fs.readFileSync(path.join(ROOT, "bridge/ncm-plugin/index.js"), "utf8");

/* ---------------- mock environment ---------------- */
const el = {
  tagName: "audio", isConnected: true,
  currentTime: 0, duration: 269.3, paused: true,
  playCalls: 0, pauseCalls: 0,
  play() { this.paused = false; this.playCalls++; return Promise.resolve(); },
  pause() { this.paused = true; this.pauseCalls++; },
};
const nextBtn = { offsetParent: {}, clicked: 0, click() { this.clicked++; } };
const nativeCbs = {};
const legacyNativeCmder = {
  appendRegisterCall(name, channel, cb) { (nativeCbs[name] ||= []).push(cb); },
};
const neBodies = [];
let cmdQueue = [];
let lyricPush = null;
let eapiCaptured = null;

function cannedEapiResponse() {
  return {
    yrc: { lyric: '{"t":0,"c":[{"tx":"作词: X"}]}\n[1000,2000](1000,1000,0)测(2000,1000,0)试' },
    lrc: { lyric: "[00:01.00]测" },
  };
}

async function mockFetch(url, opts = {}) {
  if (url.startsWith("http://127.0.0.1:26801")) {
    const u = new URL(url);
    if (u.pathname === "/api/ne" && opts.method === "POST") {
      neBodies.push(JSON.parse(opts.body));
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    if (u.pathname === "/api/cmd" && (!opts.method || opts.method === "GET")) {
      const cmds = cmdQueue; cmdQueue = [];
      return new Response(JSON.stringify({ ok: true, cmds }), { status: 200 });
    }
    if (u.pathname === "/api/lyric" && opts.method === "POST") {
      lyricPush = JSON.parse(opts.body);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }
  if (url.startsWith("https://interface3.music.163.com/eapi/song/lyric/v1")) {
    eapiCaptured = { url, body: String(opts.body) };
    return new Response(JSON.stringify(cannedEapiResponse()), { status: 200 });
  }
  if (url.includes("music.163.com/api/song/lyric")) {
    return new Response(JSON.stringify({ lrc: { lyric: "[00:01.00]直连" } }), { status: 200 });
  }
  return new Response("{}", { status: 200 });
}

const timers = [];
const sandbox = {
  window: {},
  console: { log() { } },
  setTimeout: (fn, ms) => { const t = setTimeout(fn, Math.min(ms || 0, 25)); timers.push(t); return t; },
  clearTimeout: (t) => clearTimeout(t),
  setInterval: (fn, ms) => setInterval(fn, Math.min(ms || 0, 50)),
  clearInterval: (t) => clearInterval(t),
  fetch: mockFetch,
  Response,
  Promise, Date, JSON, Math, Number, String, Array, Object, isFinite, parseFloat, parseInt,
  URL, Buffer,
  require: (name) => {
    if (name === "crypto") return crypto;
    throw new Error("require not mocked: " + name);
  },
};
sandbox.window = sandbox;
sandbox.legacyNativeCmder = legacyNativeCmder;
sandbox.document = {
  querySelector(sel) {
    if (sel === "#btn-next") return nextBtn;
    return null;
  },
  querySelectorAll() { return [el]; },
};
sandbox.localStorage = {
  _d: {},
  getItem(k) { return this._d[k] ?? null; },
  setItem(k, v) { this._d[k] = v; },
};
sandbox.betterncm = {
  ncm: {
    getPlayingSong() {
      return { data: { name: "晴天", artists: [{ name: "周杰伦" }], album: { picUrl: "https://p1.example/a.jpg" }, duration: 269300 } };
    },
  },
};
sandbox.plugin = { getConfig: (_k, d) => d };
vm.createContext(sandbox);

/* run the real plugin code */
vm.runInContext(apiJs, sandbox, { filename: "chushi-music-api-v5.js" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------------- V1: initial truth (element + metadata fallback) ---------------- */
console.log("V1 truth: metadata fallback + idle element");
await sleep(120); // let the first truth pump fire (1500ms capped to 25ms)
ok("V1.1 ne pushed", neBodies.length >= 1, `count=${neBodies.length}`);
const b0 = neBodies[0] || {};
ok("V1.2 version field", b0.v === "5.0.0", JSON.stringify(b0.v));
ok("V1.3 title from betterncm fallback", b0.title === "晴天", JSON.stringify(b0.title));
ok("V1.4 artist", b0.artist === "周杰伦");
ok("V1.5 https-only cover", b0.pic === "https://p1.example/a.jpg");
ok("V1.6 duration from fallback", Math.abs(b0.duration - 269.3) < 0.1, String(b0.duration));
ok("V1.7 idle not playing", b0.playing === false);

/* ---------------- V2: native events drive truth ---------------- */
console.log("V2 truth: native events");
// element clock aligned with native progress: set element position first
el.paused = false;
el.currentTime = 42.5;
for (const cb of nativeCbs.PlayState || []) cb("PlayState", "186016", 1);
for (const cb of nativeCbs.PlayProgress || []) cb("PlayProgress", 42.5);
await sleep(80);
const bN = neBodies[neBodies.length - 1] || {};
ok("V2.1 playing true (native state 1)", bN.playing === true);
ok("V2.2 songId from native", bN.songId === 186016, String(bN.songId));
ok("V2.3 element clock wins when aligned", Math.abs(bN.position - 42.5) < 0.2, String(bN.position));

/* ---------------- V3: seek single-write + readback ack ---------------- */
console.log("V3 seek");
cmdQueue = [{ id: 1, cmd: "seek", at: Date.now(), position: 120 }];
await sleep(150); // poll cap 25ms + ack timers capped 25+25
const writes = el.currentTime;
ok("V3.1 currentTime written once to target", Math.abs(writes - 120) < 0.001, String(writes));
const bS = neBodies[neBodies.length - 1] || {};
ok("V3.2 seekAck reported", bS.seekAckId && /^s\d+t\d+$/.test(bS.seekAckId), JSON.stringify(bS.seekAckId));
ok("V3.3 seekAck honest true (element honored)", bS.seekAckOk === true, JSON.stringify(bS.seekAckOk));

/* ---------------- V4: play/pause/toggle routing ---------------- */
console.log("V4 controls");
el.paused = false;
cmdQueue = [{ id: 2, cmd: "pause", at: Date.now() }];
await sleep(100);
ok("V4.1 pause via element", el.paused === true && el.pauseCalls >= 1);
el.paused = true;
for (const cb of nativeCbs.PlayState || []) cb("PlayState", "186016", 2); /* fresh pause event -> toggle must resume */
cmdQueue = [{ id: 3, cmd: "toggle", at: Date.now() }];
await sleep(100);
ok("V4.2 toggle resumes (snapshot paused)", el.paused === false && el.playCalls >= 1);
cmdQueue = [{ id: 4, cmd: "next", at: Date.now() }];
await sleep(100);
ok("V4.3 next via visible button", nextBtn.clicked >= 1);

/* ---------------- V5: eapi params recipe verified by real decryption ---------------- */
console.log("V5 eapi chain");
// songId already known from native event; lyric pump should fetch + push
await sleep(200);
ok("V5.1 eapi endpoint hit", !!eapiCaptured, JSON.stringify(eapiCaptured && eapiCaptured.url));
if (eapiCaptured) {
  const m = /params=([0-9A-Fa-f]+)/.exec(eapiCaptured.body);
  ok("V5.2 params hex uppercase", !!m && m[1] === m[1].toUpperCase() && m[1].length >= 64);
  // decrypt with the eapi key and verify the recipe shape
  const decipher = crypto.createDecipheriv("aes-128-ecb", Buffer.from("e82ckenh8dichen8", "utf8"), Buffer.alloc(0));
  const plain = Buffer.concat([decipher.update(Buffer.from(m[1], "hex")), decipher.final()]).toString("utf8");
  ok("V5.3 plaintext carries /api/song/lyric/v1 path", plain.startsWith("/api/song/lyric/v1-36cd479b6b5-"), plain.slice(0, 60));
  ok("V5.4 plaintext ends with md5 digest", /[0-9a-f]{32}$/.test(plain), plain.slice(-40));
  const jsonPart = plain.split("-36cd479b6b5-")[1];
  const payload = JSON.parse(jsonPart);
  ok("V5.5 payload id + yv", payload.id === "186016" && payload.yv === 1, jsonPart.slice(0, 80));
}
ok("V5.6 lyric pushed to engine", !!lyricPush, lyricPush && JSON.stringify(lyricPush).slice(0, 80));
if (lyricPush) {
  ok("V5.7 yrc content forwarded", (lyricPush.yrc || "").includes("测") && lyricPush.source === "eapi-yrc",
    `${lyricPush.source}:${(lyricPush.yrc || "").slice(0, 40)}`);
  ok("V5.8 rev shape", /^186016-eapi-yrc-\d+$/.test(lyricPush.rev), lyricPush.rev);
}

console.log(`\nverify-v5[2]: ${pass} passed, ${failCount} failed`);
process.exit(failCount === 0 ? 0 : 1);
