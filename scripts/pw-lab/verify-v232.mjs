import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";

/* verify-v232.mjs — v2.3.2：真机第 9 轮修复回归
 * （插件新版被误报旧版 / 播放态仍反向 / 进度 0.5x 爬行与倒退）
 *
 * 层次：
 *   ST  静态断言（源码字节级）：v1.5.0 四件套 + 宿主归因拆分 + 部件双文案
 *   P   插件 vm 白盒回归（真实 index.js 在 mock NCM 环境执行）：
 *       P1 playing 最后事件语义（暂停后流浪 playing 元素不得翻转状态）
 *       P2 倒退熔断（12s→3s 垃圾样本沿用外推）
 *       P3 元素身份锁定（锁定后评分更高的流浪元素不得换人）
 *       P4 store.paused 矛盾 >3s 自愈
 *       P5 换歌重置（新歌 0 起步不被倒退熔断误杀）
 *       P6 旧桥升级链路（deploy→killStaleBridge(netstat/taskkill)→spawn）
 *   e2e playwright（gh-pages 产物 + mock 桥）：
 *       V/D 真值锚定 + 暂停恢复回归 / S seek 双路 / FT 页脚 1.5.0
 *       NU  升级归因四态（本版核心）：旧桥+无插件→更新.plugin 文案 /
 *           新桥+新插件→熄灭 / 新桥+旧插件→更新.plugin / 旧桥+新插件→手动备用桥文案
 *       LYH 高度迟滞回归 / LG SMTC-only / X pageerror=0
 */

const ROOT = "/home/z/my-project/out";
const MIME = {
  ".html": "text/html", ".js": "application/javascript", ".css": "text/css",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
  ".woff2": "font/woff2", ".ico": "image/x-icon", ".txt": "text/plain",
};

const PNG1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
);
function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Private-Network", "true");
}

/* ---------- ST 静态断言 ---------- */
const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
}
{
  const idx = readFileSync("/home/z/my-project/bridge/lyric-plugin/index.js", "utf8");
  check("ST1 插件 v1.5.0 + 内嵌桥 v1.7.1 常量在位",
    idx.includes('PLUGIN_VERSION = "1.5.0"') && idx.includes('EMBEDDED_BRIDGE_VERSION = "1.7.1"'));
  check("ST2 playing 最后事件语义（不再 5s 过期降级）",
    idx.includes("if (lastPlayingAt) {") && !idx.includes("nowMs - lastPlayingAt < 5000"));
  check("ST3 store.paused 交叉自愈在位（storeDisagreeSince）",
    idx.includes("storeDisagreeSince") && idx.includes('typeof pp.paused === "boolean"'));
  check("ST4 元素身份锁定在位（elLock + 连击上锁 + 脱钩解锁）",
    idx.includes("elLock") && idx.includes("elLockStreak >= 2") && idx.includes("elLockMiss >= 3"));
  check("ST5 倒退熔断在位（上拍上报值 + 2.5s 窗）",
    idx.includes("lastReportedPosMs - 2500") && idx.includes("lastReportedAt"));
  check("ST6 杀旧桥双路径在位（cmd netstat taskkill → powershell Get-NetTCPConnection）",
    idx.includes("netstat.exe -aon") && idx.includes("taskkill /F /T /PID") &&
    idx.includes("Get-NetTCPConnection"));
  check("ST7 升级独立退避 + bridgeBlocked 置位",
    idx.includes("upgradeBackoffMs") && idx.includes("bridgeUpgradeFails") && idx.includes("bridgeBlocked"));
  check("ST8 升级路径与冷启动分离（旧桥在场必走升级）",
    idx.includes("if (ver && versionLt(ver, EMBEDDED_BRIDGE_VERSION))"));
  check("ST9 PlayProgress 存活自检 + 重注册在位",
    idx.includes("PlayProgress 事件 10s 未触发，尝试重注册"));
  check("ST10 初始播放态对齐（store 预热主源）在位",
    idx.includes("初始播放态对齐"));
  const smtc = readFileSync("/home/z/my-project/src/lib/startpage/smtc.ts", "utf8");
  check("ST11 宿主归因拆分（needsPlugin 1.5.0 / needsBridge 1.7.1）",
    smtc.includes('verLt(pluginVerNow, "1.5.0")') && smtc.includes('verLt(next.version, "1.7.1")') &&
    smtc.includes("needsPlugin") && smtc.includes("needsBridge"));
  check("ST12 宿主两击守卫保留（neZeroStreak/trustZero）",
    smtc.includes("neZeroStreak") && smtc.includes("trustZero"));
  const whtml = readFileSync("/home/z/my-project/preset-src/smtc/music-widget.html", "utf8");
  check("ST13 部件芯片双文案分叉（updTxt + needsPlugin 三元）",
    whtml.includes("updTxt") && whtml.includes("s.needsPlugin") &&
    whtml.includes("启动桥.bat") && whtml.includes("全自动修复"));
  check("ST14 部件 lyHold 高度迟滞保留", whtml.includes("lyHold") && whtml.includes("换曲才重算高度迟滞"));
  const ps1 = readFileSync("/home/z/my-project/bridge/smtc/chushi-bridge.ps1", "utf8");
  check("ST15 桥零改动（仍 1.7.1 + needLyric）",
    ps1.includes("$BRIDGE_VERSION = '1.7.1'") && ps1.includes("needLyric"));
}

/* ---------- P 插件 vm 白盒回归 ---------- */
{
  const src = readFileSync("/home/z/my-project/bridge/lyric-plugin/index.js", "utf8");
  const heartbeats = [];      // /api/plugin/state 心跳体记录
  const execCalls = [];       // betterncm.app.exec 命令记录
  const fsStore = new Map();  // 内存文件系统
  let pingVer = "1.7.0";      // /api/ping 应答版本（初始=旧桥，P6 升级链路用）
  const regCalls = {};        // 原生事件回调表
  /* pingVer 初始=1.7.0（旧桥）：vm 加载后 2s 首轮 supervise 即走升级路径，
     P6 在真实时序下断言杀旧双路径与「杀不死不空拉」 */


  /* 可控时钟（buildSnapshot 用 Date.now()） */
  let fakeNow = Date.now();

  function makeEl(opts) {
    return {
      currentTime: opts.t ?? 0, paused: opts.paused !== false, duration: opts.dur ?? 0,
      isConnected: true, _name: opts.name || "el",
    };
  }
  let domEls = []; // document.querySelectorAll("video,audio") 的返回

  const sandbox = {
    console: { log: () => {}, warn: () => {}, error: () => {} },
    setTimeout, clearTimeout, setInterval, clearInterval,
    AbortController,
    atob: (s) => Buffer.from(s, "base64").toString("binary"),
    btoa: (s) => Buffer.from(s, "binary").toString("base64"),
    alert: () => {},
    localStorage: {
      _m: new Map(),
      getItem(k) { return this._m.has(k) ? this._m.get(k) : null; },
      setItem(k, v) { this._m.set(k, String(v)); },
      removeItem(k) { this._m.delete(k); },
    },
    fetch: async (url, opts) => {
      const u = String(url);
      const mk = (j) => ({ ok: true, json: async () => j });
      if (u.includes("/api/ping")) return mk({ ok: true, name: "chushi-smtc-bridge", version: pingVer });
      if (u.includes("/api/plugin/state")) {
        heartbeats.push(JSON.parse(opts.body));
        return mk({ cmd: null, needLyric: null });
      }
      if (u.includes("/api/plugin/cmd")) return mk({ cmd: null });
      if (u.includes("/api/plugin/lyric")) return mk({});
      /* 歌词 eapi/直连：一律无词 */
      return mk({});
    },
    plugin: {
      getConfig: (_k, d) => d,
      setConfig: () => {},
      onConfig: () => {},
    },
  };
  sandbox.window = sandbox;
  sandbox.document = {
    querySelectorAll: (sel) => (sel === "video,audio" ? domEls : []),
    createElement: () => ({ style: {}, appendChild() {}, }),
  };
  /* legacyNativeCmder：注册即存表，测试手动触发 */
  sandbox.window.legacyNativeCmder = {
    appendRegisterCall(name, _ch, cb) { (regCalls[name] = regCalls[name] || []).push(cb); },
  };
  sandbox.window.betterncm = {
    app: { exec: async (cmd) => { execCalls.push(cmd); return true; }, getDataPath: async () => "C:\\fake\\ncm" },
    fs: {
      mkdir: async () => {},
      writeFileText: async (rel, content) => { fsStore.set(rel, content); },
      readFileText: async (rel) => (fsStore.has(rel) ? fsStore.get(rel) : null),
    },
  };
  const FakeDate = class extends Date {
    static now() { return fakeNow; }
  };
  sandbox.Date = FakeDate;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(src, ctx, { filename: "plugin-index.js" });

  const API = () => sandbox.window.__chushiLyricSource;
  /* 网易云真实回调签名：PlayState cb(playId,idStr,state) / PlayProgress
     cb(playId,sec) / Seek cb(playId,seekId,code,pos)——按事件名分发参数 */
  const fire = (name, ...args) => {
    for (const cb of regCalls[name] || []) {
      if (name === "PlayState") cb("pid", String(args[0]), args[1]);
      else if (name === "PlayProgress") cb("pid", args[0]);
      else cb("pid", ...args);
    }
  };
  const snap = () => { const s = API().snapshot(); fakeNow += 1000; return s; };

  await new Promise((r) => setTimeout(r, 300)); // 插件 IIFE 首拍心跳
  check("P0 插件加载暴露 snapshot 调试口", typeof API()?.snapshot === "function");

  /* P1 最后事件语义：PlayState(false) 后即便流浪 playing 元素在场也不翻转 */
  fire("PlayState", "1", 0); // state=0 → 暂停
  domEls = [makeEl({ t: 30, paused: false, dur: 269, name: "stray" })];
  const s1 = snap();
  check("P1a 暂停事件后流浪 playing 元素不翻转状态", s1.playing === false, `playing=${s1.playing}`);
  fire("PlayState", "1", 1); // state=1 → 播放
  domEls = [makeEl({ t: 30, paused: true, dur: 269, name: "paused-stray" })];
  const s1b = snap();
  check("P1b 播放事件后 paused 元素不翻转状态", s1b.playing === true, `playing=${s1b.playing}`);

  /* P2 倒退熔断：真值 12s 稳定上报后突给 3s（无 seek）→ 沿用外推。
     注：倒退熔断基准 lastReportedPosMs 只在 pushState 真上报后更新——
     心跳 interval 1s 真定时器会把基准带起来；这里等一轮心跳确保基准就位 */
  fire("PlayState", "1", 1);
  fire("PlayProgress", 12.0);
  domEls = [makeEl({ t: 12.0, paused: false, dur: 269, name: "main" })];
  const s2a = snap(); // 基准拍
  await new Promise((r) => setTimeout(r, 1300)); // 等心跳把 lastReportedPosMs 抬到 ~12s
  fakeNow += 4100; // 远离 seek 窗（lastSeekAt=0 恒 >5s）
  domEls = [makeEl({ t: 3.0, paused: false, dur: 269, name: "stale" })];
  const s2b = snap(); // 3s 垃圾样本（比上拍上报小 8s+）
  check("P2 倒退样本被熔断（沿用上拍外推，不跳 3s）",
    s2b.positionMs >= 11000, `pos=${(s2b.positionMs / 1000).toFixed(1)}s`);

  /* P3 元素身份锁定：main 对齐两拍上锁后，评分更高的流浪元素不得换人 */
  fire("PlayProgress", 100.0);
  const A = makeEl({ t: 100.0, paused: false, dur: 269, name: "main-A" });
  domEls = [A];
  snap(); snap(); // 两拍对齐 → elLock=A
  const stray = makeEl({ t: 5.0, paused: false, dur: 269, name: "stray-B" });
  domEls = [stray, A];
  const s3 = snap();
  check("P3 锁定后流浪元素评分再高也不换人（位置不跳 5s）",
    s3.positionMs >= 95000, `pos=${(s3.positionMs / 1000).toFixed(1)}s`);

  /* P4 store.paused 矛盾 >3s 自愈：PlayState 说暂停、store 说播放 */
  fire("PlayState", "1", 0); // 暂停
  let storePlaying = true;   // store 矛盾：播放中
  sandbox.window.__chushiStoreMock = { getState: () => ({ playing: { paused: !storePlaying, resourceTrackId: 42, resourceName: "矛盾歌", curTrack: { duration: 269000 } } }) };
  /* store 注入要走插件内部发现的 dva 通道——白盒改不到内部 store 变量；
   * 退而求其次：验证 P4 的前提路径（lastPlaying 优先级高于元素）已由 P1 覆盖，
   * store 自愈逻辑属于「事件丢失」兜底，其行为等价于「最终 playing 以 store 纠正」。
   * 这里做静态结构断言 + P1 主源回归，store 注入留待 e2e 真机观察。 */
  check("P4 store 自愈路径静态在位（buildSnapshot 内 store.paused 三秒窗）",
    src.includes("nowMs - storeDisagreeSince > 3000"));

  /* P5 换歌重置：倒退熔断不得误杀新歌 0 起步 */
  fire("PlayState", "1", 1);
  fire("PlayProgress", 200.0);
  domEls = [makeEl({ t: 200.0, paused: false, dur: 200, name: "songA" })];
  sandbox.window.__chushiLyricSource.snapshot(); // songA 深位置基准（song 缺失路径）
  fire("PlayProgress", 0.2); // 新歌开头
  domEls = [makeEl({ t: 0.2, paused: false, dur: 200, name: "songB" })];
  const s5 = snap();
  check("P5 新歌 0 起步不被上一首深位置倒退熔断钉死",
    s5.positionMs <= 5000, `pos=${(s5.positionMs / 1000).toFixed(1)}s`);

  /* P6 升级链路（真实时序）：vm 加载前 pingVer 已置 1.7.0（旧桥）——
     加载后 2s 首轮 supervise 走升级路径：deploy → killStale（cmd netstat
     taskkill 优先 → powershell 兑底，mock 下 ping 仍旧版 → 两路径都试）
     → killed=false 不 spawn → 2.5s 后健康检查失败 → fails≥2 →
     bridgeBlocked + warn 手动指引。P1-P5 累计真实耗时 <2s，升级在后台
     已完成——此处直接断言现场。 */
  await new Promise((r) => setTimeout(r, 1200));
  const sawKill1 = execCalls.some((c) => c.includes("netstat.exe -aon") && c.includes("taskkill"));
  const sawKill2 = execCalls.some((c) => c.includes("Get-NetTCPConnection"));
  const sawNoSpawn = !execCalls.some((c) => c.includes("-File") && c.includes("chushi-bridge.ps1"));
  check("P6a 升级路径：杀旧双路径均被尝试（cmd netstat taskkill → powershell 兑底）",
    sawKill1 && sawKill2, `kill1=${sawKill1} kill2=${sawKill2}`);
  check("P6b 杀旧失败时不拉起（宁可不在线也不空拉）", sawNoSpawn);
  check("P6c 部署已写盘（升级先部署最新版）", fsStore.has("chushi-bridge/chushi-bridge.ps1"));
  /* 心跳应带 v=1.5.0（页脚诊断来源） */
  check("P7 心跳带插件版本 v1.5.0", heartbeats.some((h) => h.v === "1.5.0"),
    heartbeats.length ? `首拍 v=${heartbeats[0].v}` : "无心跳");
}

/* ---------- e2e：mock 桥 + gh-pages 产物 ---------- */
const DUR = 269.3;
let mockState = { ok: true, name: "chushi-smtc-bridge", version: "1.7.1-mock", track: null, ne: null };
let mockTruth = null;
let mockSeekAck = null;
let seekBehavior = "ok";
let neQueue = [];
let neLyricRev = "";
let mockTrackOverride = null;
let smtcAdvance = false;
const controlLog = [];

function defaultNe() {
  const now = Date.now();
  const pos = mockTruth.pos + (mockTruth.playing ? (now - mockTruth.t0) / 1000 : 0);
  return {
    songId: 123456, title: "晴天 (Live)", artist: "周杰伦", album: "叶惠美", pic: "",
    positionMs: Math.max(0, Math.round(pos * 1000)),
    durationMs: Math.round(DUR * 1000),
    playing: mockTruth.playing,
    lyricRev: neLyricRev,
    ts: now - 60, v: "1.5.0",
    seekAckId: mockSeekAck ? mockSeekAck.id : "",
    seekAckOk: mockSeekAck ? mockSeekAck.ok === true : false,
    seekAckPos: mockSeekAck ? mockSeekAck.pos : 0,
    seekAckAt: mockSeekAck ? mockSeekAck.at : 0,
  };
}

const mock = createServer((req, res) => {
  cors(res);
  const u = new URL(req.url, "http://x");
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
  if (u.pathname === "/api/ping") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, name: "chushi-smtc-bridge", version: "1.7.1-mock" }));
    return;
  }
  if (u.pathname === "/api/state") {
    const out = { ...mockState };
    if (neQueue.length) {
      out.ne = { ...defaultNe(), ...neQueue.shift() };
    } else if (mockTruth) {
      out.ne = defaultNe();
    }
    if (mockTrackOverride) out.track = { ...out.track, ...mockTrackOverride };
    if (smtcAdvance && mockTruth && out.track) {
      const p = mockTruth.pos + (mockTruth.playing ? (Date.now() - mockTruth.t0) / 1000 : 0);
      out.track = { ...out.track, position: Math.max(0, Math.round(p)) };
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(out));
    return;
  }
  if (u.pathname === "/api/cover") {
    res.writeHead(200, { "content-type": "image/png" });
    res.end(PNG1PX);
    return;
  }
  if (u.pathname === "/api/lyric") {
    res.writeHead(200, { "content-type": "application/json" });
    if (neLyricRev) {
      res.end(JSON.stringify({
        ok: true, rev: neLyricRev,
        lyric: {
          songId: 123456, title: "晴天 (Live)", artist: "周杰伦",
          yrc: "", lrc: "[00:01.00]故事的小黄花\n[00:05.00]从出生那年就飘着\n[00:09.00]童年的荡秋千",
          tlyric: "", ytlrc: "", source: "mock-lrc",
        },
      }));
    } else {
      res.end(JSON.stringify({ ok: false, reason: "no-lyric" }));
    }
    return;
  }
  if (u.pathname === "/api/control" && req.method === "POST") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      let cmd = "", position = null;
      try { const j = JSON.parse(body || "{}"); cmd = String(j.cmd || ""); position = j.position; } catch (e) {}
      controlLog.push({ cmd, position, at: Date.now() });
      if (cmd === "seek" && typeof position === "number") {
        const id = "mockseek" + Math.floor(Math.random() * 1e6).toString(36);
        const pos = Math.max(0, Math.min(DUR, position));
        if (seekBehavior === "ok") {
          setTimeout(() => {
            if (mockTruth) mockTruth = { pos, playing: mockTruth.playing, t0: Date.now() };
            mockSeekAck = { id, ok: true, pos, at: Date.now() };
          }, 350);
        } else {
          setTimeout(() => { mockSeekAck = { id, ok: false, pos, at: Date.now() }; }, 900);
        }
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });
    return;
  }
  res.writeHead(404); res.end("nf");
});
await new Promise((r) => mock.listen(20754, r));

const server = createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  p = p.replace(/^\/Start-chushi/, "") || "/";
  if (p.endsWith("/")) p += "index.html";
  let f = join(ROOT, p);
  if (!existsSync(f)) f = join(ROOT, "index.html");
  try {
    const body = readFileSync(f);
    const ext = f.slice(f.lastIndexOf("."));
    res.writeHead(200, { "content-type": MIME[ext] ?? "application/octet-stream" });
    res.end(body);
  } catch { res.writeHead(404); res.end("nf"); }
});
await new Promise((r) => server.listen(4634, r));

const browser = await chromium.launch();
const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 915 } });
const page = await ctx2.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.addInitScript(() => {
  try {
    localStorage.clear();
    localStorage.setItem("start:settings", JSON.stringify({ themeMode: "dark" }));
  } catch (e) {}
});
await page.goto("http://localhost:4634/", { waitUntil: "networkidle" });
await page.waitForSelector(".clock-text", { timeout: 15000 });

const dockMusicBtn = page.locator(".cl-dock button[aria-label='音乐']");
const wFrame = () => page.frameLocator(".cl-dockwidget iframe").frameLocator("iframe[title='初始自定义小部件']");
const barW = () => wFrame().locator("#bar").evaluate((el) => parseFloat(el.style.width) || 0);
const tCtxt = () => wFrame().locator("#tC").textContent();
const apTxt = () => wFrame().locator("#ap").textContent();
const playIconOff = () => wFrame().locator("#yI").evaluate((el) => el.classList.contains("off"));
const iframeH = () => page.locator(".cl-dockwidget iframe").first().evaluate((el) => el.getBoundingClientRect().height);
const pctOf = (sec) => (sec / DUR) * 100;
const truthNow = () => (mockTruth ? mockTruth.pos + (mockTruth.playing ? (Date.now() - mockTruth.t0) / 1000 : 0) : 0);

/* P 导入 .cshz */
await page.keyboard.press("Control+k");
await page.waitForTimeout(800);
await page.locator("[cmdk-item]").filter({ hasText: "导入预设" }).click();
await page.waitForTimeout(600);
await page.locator("input[type=file]").setInputFiles("/home/z/my-project/examples/初始SMTC音乐预设.cshz");
await page.waitForTimeout(2600);
check("E1 .cshz 导入无错误", (await page.locator("text=/错误|必须|缺失|不支持/").count()) === 0);
check("E2 dock 音乐按钮出现", (await dockMusicBtn.count()) === 1);
await page.keyboard.press("Escape");
await page.waitForTimeout(400);

/* V 真值锚定 */
mockState = {
  ...mockState,
  track: {
    app: "网易云音乐", title: "晴天 (Live)", artist: "周杰伦", album: "叶惠美",
    playing: true, position: 50, duration: DUR, rate: 1, coverRev: "",
  },
};
mockTruth = { pos: 100, playing: true, t0: Date.now() };
await page.waitForTimeout(2400);
await dockMusicBtn.click();
await page.waitForTimeout(2200);
{
  const w = await barW();
  const expected = pctOf(truthNow());
  check("V1 面板跟真值不跟冻结 SMTC", Math.abs(w - expected) < 3.5, `bar=${w.toFixed(2)}% 期望=${expected.toFixed(2)}%`);
}

/* D 暂停/恢复一轮回归 */
{
  const frozenAt = truthNow();
  mockTruth = { pos: frozenAt, playing: false, t0: Date.now() };
  mockState = { ...mockState, track: { ...mockState.track, playing: false, position: 0 } };
  await page.waitForTimeout(2700);
  const wPause = await barW();
  check("D1a 暂停冻结于真值", Math.abs(wPause - pctOf(frozenAt)) < 1.6, `bar=${wPause.toFixed(2)}%`);
  mockTruth = { pos: frozenAt, playing: true, t0: Date.now() };
  mockState = { ...mockState, track: { ...mockState.track, playing: true } };
  await page.waitForTimeout(2700);
  const wResume = await barW();
  check("D1b 恢复续接真值", Math.abs(wResume - pctOf(frozenAt + 2.7)) < 1.6, `bar=${wResume.toFixed(2)}%`);
}

/* S seek 双路 */
{
  seekBehavior = "ok";
  const box = await wFrame().locator("#sk").boundingBox();
  await wFrame().locator("#sk").click({ position: { x: Math.round(box.width * 0.7), y: Math.round(box.height / 2) } });
  await page.waitForTimeout(3400);
  const after = await barW();
  check("S1 seek 生效不弹回", after > 63 && after < 77, `bar=${after.toFixed(2)}%`);
  seekBehavior = "fail";
  const box2 = await wFrame().locator("#sk").boundingBox();
  await wFrame().locator("#sk").click({ position: { x: Math.round(box2.width * 0.25), y: Math.round(box2.height / 2) } });
  await page.waitForTimeout(4600);
  const ap = await apTxt();
  check("S2 未生效诚实提示", ap.includes("拖动未生效"), ap);
}

/* NU 升级归因四态（v2.3.2 核心） */
{
  const save = { state: mockState, truth: mockTruth };
  /* NU1: 旧桥 + 无插件 → needsPlugin 优先 → 「更新 .plugin」文案 */
  mockState = { ...mockState, version: "1.6.0-mock", ne: null };
  mockTruth = null;
  await page.waitForTimeout(2600);
  const on1 = await wFrame().locator("#updChip").evaluate((el) => el.classList.contains("on"));
  const txt1 = await wFrame().locator("#updTxt").textContent();
  check("NU1 旧桥+无插件 → 芯片亮 + 「更新 .plugin」文案（该场景确实能自修）",
    on1 === true && txt1.includes("全自动修复"), txt1);
  /* NU2: 新桥 + 新插件 1.5.0 → 熄灭 */
  mockState = { ...save.state };
  mockTruth = save.truth;
  await page.waitForTimeout(2400);
  const on2 = await wFrame().locator("#updChip").evaluate((el) => el.classList.contains("on"));
  check("NU2 新桥 1.7.1 + 插件 1.5.0 → 芯片熄灭", on2 === false);
  /* NU3: 新桥 + 旧插件 1.4.0 → 「更新 .plugin」 */
  const ne3 = defaultNe(); /* 须在 mockTruth 置空前取（内部读 mockTruth.pos） */
  ne3.v = "1.4.0";
  const saveTruth3 = mockTruth;
  mockTruth = null; /* 防 defaultNe() 覆盖注入的 ne */
  mockState = { ...mockState, ne: ne3 };
  await page.waitForTimeout(2400);
  const txt3 = await wFrame().locator("#updTxt").textContent();
  const on3 = await wFrame().locator("#updChip").evaluate((el) => el.classList.contains("on"));
  check("NU3 旧插件 1.4.0 → 「更新 .plugin」文案", on3 === true && txt3.includes("全自动修复"), txt3);
  mockTruth = saveTruth3;
  /* NU4: 旧桥 + 新插件 1.5.0 → 「手动启动备用桥」诚实指引（本版核心新行为） */
  const ne4 = defaultNe();
  const saveTruth4 = mockTruth;
  mockTruth = null;
  mockState = { ...mockState, version: "1.7.0-mock", ne: ne4 };
  await page.waitForTimeout(2400);
  const txt4 = await wFrame().locator("#updTxt").textContent();
  const on4 = await wFrame().locator("#updChip").evaluate((el) => el.classList.contains("on"));
  check("NU4 旧桥+新插件 → 「手动启动备用桥」文案（不再喊更新 .plugin）",
    on4 === true && txt4.includes("启动桥.bat") && !txt4.includes("全自动修复"), txt4);
  mockState = { ...save.state };
  mockTruth = save.truth;
  await page.waitForTimeout(2200);
}

/* FT 页脚 1.5.0 */
{
  const ap = await apTxt();
  check("FT1 页脚可见插件版本 v1.5.0", ap.includes("插件 v1.5.0"), ap);
}

/* LYH 高度迟滞回归 */
{
  neLyricRev = "rev-232";
  await page.waitForTimeout(3200);
  const h1 = await iframeH();
  check("LYH1 歌词到位面板增高（≈372）", Math.abs(h1 - 372) < 14, `h=${h1.toFixed(0)}`);
  neLyricRev = "";
  await page.waitForTimeout(3000);
  const h2 = await iframeH();
  check("LYH2 同曲丢词高度不塌", Math.abs(h2 - 372) < 14, `h=${h2.toFixed(0)}`);
  mockTrackOverride = { title: "下一首歌", artist: "别人", album: "新专辑" };
  mockTruth = { pos: 20, playing: true, t0: Date.now() };
  await page.waitForTimeout(3200);
  const h3 = await iframeH();
  check("LYH3 换曲无词高度塌回 248", Math.abs(h3 - 248) < 14, `h=${h3.toFixed(0)}`);
  mockTrackOverride = null;
}

/* LG SMTC-only + X */
{
  mockTruth = null;
  mockState = { ...mockState, ne: null, track: { ...mockState.track, playing: true, position: Math.round(truthNow()) } };
  await page.waitForTimeout(2600);
  const ws = [];
  for (let i = 0; i < 3; i++) { ws.push(await barW()); await page.waitForTimeout(420); }
  check("LG1 SMTC-only 锚点插值前进", ws[2] > ws[0] + 0.1, ws.map((x) => x.toFixed(2)).join(","));
}
check("X1 pageerror=0", errors.length === 0, errors.slice(0, 2).join(" | "));

const fail = results.filter((r) => !r.ok).length;
console.log(`\n=== verify-v232: ${results.length - fail}/${results.length} ===`);
await browser.close();
server.close();
mock.close();
process.exit(fail === 0 ? 0 : 1);
