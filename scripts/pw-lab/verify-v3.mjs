import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";

/* verify-v3.mjs — v3.0.0 双插件架构重写回归
 * （SMTC 与网易云 API 多层真值互打的结构性根治 + 版本误报根治 + 预设包 v4）
 *
 * 层次：
 *   ST  静态断言（源码字节级）：
 *       桥 2.0.0 纯传输化（register/NeOwner/plugins −ne-anchoring）
 *       插件A 职责单一（只有桥管理，绝不推状态）+ 全套真机防线
 *       插件B 职责单一（role=ncm 真值生产，绝不碰桥进程）+ 真值熔断四件套
 *       宿主单主仲裁（judgeNcmOwns/app 身份 −零值守卫）+ 部件 v4 文案
 *   PB  插件B vm 白盒：role=ncm 心跳 / 真值快照 / 零桥管理调用
 *   PA  插件A vm 白盒：启动即注册 / 旧桥升级链路（杀旧双路径+blocked）/ 读回校验
 *   e2e playwright（out/ 产物 + mock 桥 2.0.0）：
 *       NCM 单主（ne 独占元数据/进度/播放态——反转根治实证）
 *       SMTC-only 兜底 / 版本芯片四态（全新熄灭·缺插件·旧一体化迁移·旧桥杀不死）
 *       页脚双版本 / pageerror=0
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
const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
}

/* ---------- ST 静态断言 ---------- */
{
  const ps1 = readFileSync("/home/z/my-project/bridge/smtc/chushi-bridge.ps1", "utf8");
  check("ST1 桥 v2.0.0 + /api/plugin/register + NeOwner 仲裁在位",
    ps1.includes("$BRIDGE_VERSION = '2.0.0'") && ps1.includes("/api/plugin/register") &&
    ps1.includes("$script:NeOwner") && ps1.includes("role -eq 'ncm'"));
  check("ST2 桥纯传输化：ne-anchoring 已删除（不再 $posSec = $neSec）",
    !ps1.includes("$posSec = $neSec") && !ps1.includes("plugin truth anchoring"),
    "三层互打的桥层已移除");
  check("ST3 桥 /api/state 暴露 plugins 注册表（90s 活体窗口）",
    ps1.includes("SmtcPluginVer") && ps1.includes("-le 90") && ps1.includes("plugins = $plugins"));
  check("ST4 桥保留 needLyric 自愈 + 时长钳制",
    ps1.includes("needLyric") && ps1.includes("posSec -gt $script:State.Duration"));

  const pa = readFileSync("/home/z/my-project/bridge/smtc-plugin/index.js", "utf8");
  check("ST5 插件A 职责单一：有全套桥管理，绝不推网易云状态",
    pa.includes("superviseBridge") && pa.includes("killStaleBridge") &&
    pa.includes("/api/plugin/register") && pa.includes("bridgeBlocked") &&
    pa.includes("upgradeBackoffMs") && !pa.includes("/api/plugin/state"));
  check("ST6 插件A 直启 powershell 优先 + 读回校验（WSH 弹窗/部署损坏双防线）",
    pa.includes("powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File") &&
    pa.includes("readFileText") && pa.includes("读回校验失败，本轮不拉起"));
  check("ST7 插件A 杀旧双路径（cmd netstat taskkill → powershell Get-NetTCPConnection）",
    pa.includes("netstat.exe -aon") && pa.includes("taskkill /F /T /PID") &&
    pa.includes("Get-NetTCPConnection"));

  const pb = readFileSync("/home/z/my-project/bridge/ncm-plugin/index.js", "utf8");
  check("ST8 插件B 职责单一：role=ncm 心跳，零桥管理代码",
    pb.includes('role: "ncm"') && !pb.includes("EMBEDDED_BRIDGE") &&
    !pb.includes("deployBridge") && !pb.includes("spawnBridge") &&
    !pb.includes("superviseBridge") && !pb.includes("killStaleBridge"));
  check("ST9 插件B 真值熔断四件套保留（身份锁/倒退熔断/零值熔断/channel 健康闸）",
    pb.includes("elLockStreak >= 2") && pb.includes("lastReportedPosMs - 2500") &&
    pb.includes("posMs < 800 && lastProgressMs > 3000") &&
    pb.includes("chushi-channel-seek-disabled"));
  check("ST10 插件B 旧插件冲突检测（配置面板提醒卸载旧「初始歌词源」）",
    pb.includes("__chushiLyricSourceActive") && pb.includes("卸载旧版"));

  const smtc = readFileSync("/home/z/my-project/src/lib/startpage/smtc.ts", "utf8");
  check("ST11 宿主单主仲裁：judgeNcmOwns + app 身份权威 + 一次性年龄补偿",
    smtc.includes("private judgeNcmOwns") && smtc.includes('t.app === "NetEase Music"') &&
    smtc.includes("(now - ne.ts) / 1000") && smtc.includes("t.fetchedAt = now"));
  check("ST12 宿主零值守卫已删除（单主律：宿主不猜插件真值）",
    !smtc.includes("neZeroStreak") && !smtc.includes("trustZero"));
  check("ST13 宿主版本诚实归因（2.0.0 阈值 + 注册表实锤旧桥杀不死）",
    smtc.includes('verLt(pluginVerNow, "2.0.0")') &&
    smtc.includes("!!smtcVerNow && verLt(next.version, \"2.0.0\")") &&
    smtc.includes("smtcVer"));
  check("ST14 宿主 harmonize 仅 SMTC-only（ncmOwns 反向门控）",
    smtc.includes("!ncmOwns) this.harmonize") && smtc.includes("!ncmOwns &&\n        track"));

  const whtml = readFileSync("/home/z/my-project/preset-src/smtc/music-widget.html", "utf8");
  check("ST15 部件防位移双保险保留（双SVG同圆心交叉淡切 + lyHold 高度迟滞）",
    whtml.includes(".bt.mi svg{position:absolute;left:50%;top:50%") &&
    whtml.includes(".off{opacity:0;transform:scale(.55)}") && whtml.includes("lyHold"));
  check("ST16 部件 v4 双插件文案（迁移/缺件/旧桥杀不死/手动桥页脚）",
    whtml.includes("双插件迁移") && whtml.includes("未装「初始网易云API」") &&
    whtml.includes("旧桥进程未被自动替换") && whtml.includes("手动桥") &&
    whtml.includes("初始SMTC桥」+「初始网易云API"));
}

/* ---------- vm 白盒公共设施 ---------- */
let fakeNow = Date.now();
function makeVmSandbox(globals) {
  return Object.assign({
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
    fetch: async () => { throw new Error("no-network"); },
    Date: { now: () => fakeNow },
  }, globals);
}
function runPlugin(src, sandbox) {
  const context = vm.createContext(sandbox);
  vm.runInContext(src, context, { timeout: 8000 });
  return context;
}

const src_smtc_plugin = readFileSync("/home/z/my-project/bridge/smtc-plugin/index.js", "utf8");

/* ---------- PB 插件B vm 白盒 ---------- */
{
  const src = readFileSync("/home/z/my-project/bridge/ncm-plugin/index.js", "utf8");
  const heartbeats = [];
  const execCalls = [];
  const regCalls = {};
  let domEls = [];
  const fire = (name, ...args) => {
    const cbs = regCalls[name] || [];
    for (const cb of cbs) cb(...args);
  };
  const sandbox = makeVmSandbox({
    window: {
      __chushiNcmApiActive: false,
      legacyNativeCmder: {
        appendRegisterCall: (name, _ch, cb) => { (regCalls[name] ||= []).push(cb); },
      },
      betterncm: {
        app: { exec: async (c) => { execCalls.push(c); return true; }, getDataPath: async () => "C:\\mock" },
        fs: {
          mkdir: async () => {}, readFileText: async () => null, writeFileText: async () => {},
        },
        ncm: {},
      },
      document: {
        querySelectorAll: () => domEls,
        createElement: () => ({ style: {}, classList: { toggle() {}, add() {} }, appendChild() {}, innerText: "" }),
      },
      channel: undefined,
    },
    plugin: {
      getConfig: (_k, d) => d,
      setConfig: () => {},
      onConfig: (_fn) => {},
    },
    fetch: async (url, opts) => {
      const u = String(url);
      if (u.includes("/api/plugin/state")) {
        heartbeats.push(JSON.parse(opts?.body || "{}"));
        return { ok: true, json: async () => ({ ok: true }) };
      }
      return { ok: false, json: async () => ({}) };
    },
    document: undefined,
  });
  // window.document 需与顶层 document 一致（AsyncFunction 顶层用 document.querySelectorAll）
  sandbox.document = sandbox.window.document;
  runPlugin(src, sandbox);

  // 等待原生事件等待循环结束（最多 100*200ms → 直接 fire）
  await new Promise((r) => setTimeout(r, 300));
  const akeEl = (o) => [{ currentTime: o.t, paused: o.paused !== false, duration: o.dur, isConnected: true }];
  fire("PlayState", "1", "1", 1);
  fire("PlayProgress", "1", 125.4);
  domEls = akeEl({ t: 125.4, paused: false, dur: 269 });
  await new Promise((r) => setTimeout(r, 1200)); // 等 1s 心跳拍

  check("PB1 心跳携带 role=ncm + v=2.0.0（桥 owner 仲裁依赖）",
    heartbeats.some((h) => h.role === "ncm" && h.v === "2.0.0"),
    heartbeats.length ? `${heartbeats.length} 拍` : "无心跳");
  const hb = heartbeats[heartbeats.length - 1];
  check("PB2 真值快照随心跳上报（原生事件主源 positionMs≈125400）",
    hb && Math.abs(hb.positionMs - 125400) < 2500 && hb.playing === true,
    hb ? `pos=${hb.positionMs} playing=${hb.playing}` : "无心跳");
  check("PB3 零桥管理调用（exec 一次都不触发——职责单一律）", execCalls.length === 0,
    `execCalls=${execCalls.length}`);
}

/* ---------- PA 插件A vm 白盒 ---------- */
function makePaEnv(pingVer) {
  const registrations = [];
  const execCalls = [];
  const fsStore = new Map();
  const sandbox = makeVmSandbox({
    window: {
      __chushiSmtcBridgePluginActive: false,
      betterncm: {
        app: {
          exec: async (c) => { execCalls.push(c); return true; },
          getDataPath: async () => "C:\\mock",
        },
        fs: {
          mkdir: async () => {},
          readFileText: async (rel) => fsStore.get(rel) ?? null,
          writeFileText: async (rel, content) => { fsStore.set(rel, content); },
        },
      },
    },
    plugin: { getConfig: (_k, d) => d, setConfig: () => {}, onConfig: (_fn) => {} },
    fetch: async (url, opts) => {
      const u = String(url);
      if (u.includes("/api/ping")) {
        if (!pingVer) throw new Error("unreachable");
        return { ok: true, json: async () => ({ ok: true, name: "chushi-smtc-bridge", version: pingVer }) };
      }
      if (u.includes("/api/plugin/register")) {
        registrations.push(JSON.parse(opts?.body || "{}"));
        return { ok: true, json: async () => ({ ok: true }) };
      }
      return { ok: false, json: async () => ({}) };
    },
    document: {
      createElement: () => ({ style: {}, classList: { toggle() {}, add() {} }, appendChild() {}, innerText: "" }),
    },
  });
  return { registrations, execCalls, fsStore, sandbox };
}

/* 场景1：桥在场且为新版（2.0.0）→ 只注册，绝不杀旧/拉起/部署（版本仲裁退让） */
{
  const env = makePaEnv("2.0.0");
  runPlugin(src_smtc_plugin, env.sandbox);
  await new Promise((r) => setTimeout(r, 3000));
  check("PA1 桥在场即注册（role=smtc v=2.0.0 活体上报）",
    env.registrations.some((r) => r.role === "smtc" && r.v === "2.0.0"),
    `${env.registrations.length} 次注册`);
  check("PA2 新桥在场零进程操作（不杀旧不拉起不部署）", env.execCalls.length === 0,
    `execCalls=${env.execCalls.length}`);
  check("PA3 注册载荷含 role=smtc（宿主 plugins.smtc 来源）",
    env.registrations.every((r) => r.role === "smtc"), "");
}
/* 场景2：桥不可达（冷启动）→ 部署写盘 + 直启 powershell 拉起 */
{
  const env = makePaEnv("");
  runPlugin(src_smtc_plugin, env.sandbox);
  await new Promise((r) => setTimeout(r, 3200));
  check("PA4 冷启动：部署写盘（ps1+vbs 落盘）",
    env.fsStore.has("chushi-bridge/chushi-bridge.ps1") &&
    env.fsStore.has("chushi-bridge/chushi-bridge-launch.vbs"));
  check("PA5 冷启动：直启 powershell -File 拉起（不经 wscript 零 WSH 弹窗）",
    env.execCalls.some((c) => c.includes("-File") && c.includes("chushi-bridge.ps1")));
}

/* ---------- e2e：mock 桥 2.0.0 + out/ 产物 ---------- */
const DUR = 269.3;
let mockState = { ok: true, name: "chushi-smtc-bridge", version: "2.0.0-mock", track: null, ne: null, plugins: null };
let mockTruth = null;         // { pos, playing, t0 }
let mockSeekAck = null;
let neLyricRev = "";
let smtcPluginVer = "2.0.0"; // plugins.smtc（N4 起即全新组件态）
let controlLog = [];

function defaultNe() {
  const now = Date.now();
  const pos = mockTruth.pos + (mockTruth.playing ? (now - mockTruth.t0) / 1000 : 0);
  return {
    songId: 123456, title: "晴天", artist: "周杰伦", album: "叶惠美", pic: "",
    positionMs: Math.max(0, Math.round(pos * 1000)),
    durationMs: Math.round(DUR * 1000),
    playing: mockTruth.playing,
    lyricRev: neLyricRev,
    ts: now - 60, v: "2.0.0",
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
    res.end(JSON.stringify({ ok: true, name: "chushi-smtc-bridge", version: "2.0.0-mock" }));
    return;
  }
  if (u.pathname === "/api/state") {
    const out = { ...mockState };
    if (mockTruth) out.ne = defaultNe();
    if (smtcPluginVer) out.plugins = { smtc: smtcPluginVer };
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
          songId: 123456, title: "晴天", artist: "周杰伦",
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
await new Promise((r) => server.listen(4635, r));

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
await page.goto("http://localhost:4635/", { waitUntil: "networkidle" });
await page.waitForSelector(".clock-text", { timeout: 15000 });

const dockMusicBtn = page.locator(".cl-dock button[aria-label='音乐']");
const wFrame = () => page.frameLocator(".cl-dockwidget iframe").frameLocator("iframe[title='初始自定义小部件']");
const apTxt = () => wFrame().locator("#ap").textContent();
const t1Txt = () => wFrame().locator("#t1").textContent();
const barW = () => wFrame().locator("#bar").evaluate((el) => parseFloat(el.style.width) || 0);
const playIconOff = () => wFrame().locator("#yI").evaluate((el) => el.classList.contains("off"));
const updTxt = () => wFrame().locator("#updTxt").textContent();
const updOn = () => wFrame().locator("#updChip").evaluate((el) => el.classList.contains("on"));

/* E 导入预设 */
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

/* N1 NCM 单主：SMTC 元数据带修饰且 playing 冻结为 false（模拟旧版反转源头），
   ne 真值 playing=true → 面板必须显示 ne 元数据 + 播放态（反转根治实证） */
mockState = {
  ...mockState,
  track: {
    app: "NetEase Music", title: "晴天 (Live)【超清】", artist: "周杰伦/蔡依林", album: "",
    playing: false, position: 7, duration: DUR, rate: 1, coverRev: "rev-a",
  },
};
mockTruth = { pos: 88.4, playing: true, t0: Date.now() };
await dockMusicBtn.click();
await page.waitForTimeout(2600);
check("N1 单主元数据：面板显示 ne 歌名（SMTC 修饰名被真值覆盖）",
  (await t1Txt()) === "晴天", await t1Txt());
const bw1 = await barW();
check("N2 单主进度：进度条按 ne 真值（≈88.4s→33%）而非 SMTC 冻结 7s",
  Math.abs(bw1 - (88.4 / DUR) * 100) < 6, `bar=${bw1.toFixed(1)}%`);
check("N3 单主播放态：面板为播放中（SMTC 说暂停、ne 说播放 → ne 赢）",
  (await playIconOff()) === true);
check("N4 页脚双版本：API v2.0.0 + 管理 v2.0.0（注册表活体）",
  (await apTxt()).includes("API v2.0.0") && (await apTxt()).includes("管理 v2.0.0"),
  await apTxt());

/* N5 芯片熄灭：全新组件（桥 2.0.0 + 管理插件注册 + API 插件 2.0.0）→ 升级芯片不亮 */
check("N5 全新组件升级芯片熄灭（版本误报根治）", (await updOn()) === false);

/* N6 SMTC 管理插件缺席（手动桥）：页脚标注手动桥，芯片仍熄灭 */
smtcPluginVer = null;
await page.waitForTimeout(2400);
check("N6 手动桥页脚如实标注（不喊升级）",
  (await apTxt()).includes("手动桥") && (await updOn()) === false, await apTxt());
smtcPluginVer = "2.0.0";

/* N7 版本芯片四态 a：管理插件注册但桥版本旧 = 旧桥杀不死实锤 → 手动指引 */
mockState = { ...mockState, version: "1.7.1-mock" };
await page.waitForTimeout(2400);
check("N7a 旧桥杀不死实锤：给手动指引而非「更新插件」",
  (await updOn()) === true && (await updTxt()).includes("旧桥进程未被自动替换"),
  await updTxt());
mockState = { ...mockState, version: "2.0.0-mock" };
await page.waitForTimeout(2400);

/* N8 版本芯片四态 b：旧一体化插件（v1.5.1 role-less）→ 迁移文案 */
mockState = { ...mockState, ne: null };
mockTruth = null;
await page.waitForTimeout(2400);
check("N8a 插件消失后升级芯片亮起", (await updOn()) === true);
check("N8b 缺件文案指向安装网易云API",
  (await updTxt()).includes("未装「初始网易云API」"), await updTxt());

// 旧一体化：ne 有心跳但 v=1.5.1（桥 role 仲裁后 legacy 心跳仍会出现在旧桥上）。
// mockTruth 必须置空，否则 mock 服务器会用 defaultNe()（v=2.0.0）覆盖注入的 ne。
mockTruth = null;
// defaultNe v 由 neVOverride 控制
let neVOverride = "1.5.1";
const origDefaultNe = defaultNe;
// 简化：直接改 mockState.ne
mockState = {
  ...mockState,
  ne: {
    songId: 123456, title: "晴天", artist: "周杰伦", album: "叶惠美", pic: "",
    positionMs: 30000, durationMs: Math.round(DUR * 1000), playing: false,
    lyricRev: "", ts: Date.now() - 100, v: neVOverride,
    seekAckId: "", seekAckOk: false, seekAckPos: 0, seekAckAt: 0,
  },
};
await page.waitForTimeout(2400);
check("N8c 旧一体化 1.5.1 → 双插件迁移文案（卸旧装新，操作真实可行）",
  (await updTxt()).includes("双插件迁移"), await updTxt());

/* N9 SMTC-only：ne 消失、SMTC 会话非网易云（Spotify）→ 显示 SMTC 元数据 */
mockState = {
  ...mockState, ne: null,
  track: {
    app: "Spotify", title: "Fake Love", artist: "Taylor Swift", album: "reputation",
    playing: true, position: 42, duration: 222, rate: 1, coverRev: "rev-b",
  },
};
mockTruth = null;
await page.waitForTimeout(2400);
check("N9 SMTC-only 兜底：显示 Spotify 曲目（NCM 不在场不抢面板）",
  (await t1Txt()) === "Fake Love" && (await apTxt()).includes("Spotify"),
  `${await t1Txt()} / ${await apTxt()}`);

check("X1 pageerror = 0", errors.length === 0, errors.slice(0, 2).join(" | "));

await browser.close();
mock.close();
server.close();

const pass = results.filter((r) => r.ok).length;
const fail = results.length - pass;
console.log(`\n=== verify-v3: ${pass}/${results.length} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
