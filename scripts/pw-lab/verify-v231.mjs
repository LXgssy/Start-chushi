import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/* verify-v231.mjs — v2.3.1：真机第 8 轮四联修复回归
 * （弹窗根除 / 冻死 0:00 根治 / 播放态反转根治 / 按钮位移根治）
 *
 * Z   零值两击守卫（宿主侧新闸）：深位置真值在场时注入单拍「paused+0」垃圾样本
 *     → 面板不得冻到 0:00、不得翻成暂停；连续多拍零样本 → 采纳（真实重启场景）
 * ZR  反转守卫：单拍「playing+0」垃圾样本 → 播放态不得翻转、进度不得归零
 * LYH 歌词高度迟滞（部件 v6）：同曲歌词消失 → 面板高度保持 372；换曲无词 → 248
 * V   真值锚定回归：SMTC 钉死 50 + 插件真值 100s → 面板跟真值
 * D   暂停/恢复 ×2 轮零累积漂移
 * S   seek 双路：生效不弹回 / 未生效诚实弹回 + 醒目芯片
 * FT  页脚诊断：插件 v1.4.0 可见 / 无插件消失
 * NU  组件过旧芯片：旧桥+无插件点亮 / 新桥+新插件熄灭（阈值 1.7.1/1.4.0）
 * LG  SMTC-only 回归：锚点插值前进
 * ST  静态断言：内嵌 vbs On Error / ps1 needLyric+1.7.1 / spawnBridge 直启优先
 * X   pageerror=0
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

/* ---------- mock 桥状态 ---------- */
const DUR = 269.3; // 秒
let mockState = { ok: true, name: "chushi-smtc-bridge", version: "1.7.1-mock", track: null, ne: null };
let mockTruth = null; // { pos, playing, t0 }
let mockSeekAck = null;
let seekBehavior = "ok"; // ok | fail
let neQueue = [];        // 逐拍注入的 ne 覆盖（每拍消费一个）
let neLyricRev = "";     // 桥内存歌词 rev（空 = 无词，供 LYH 测试）
let mockTrackOverride = null; // LYH 换曲用
let smtcAdvance = false; // true=SMTC 位置跟真值前进（真机桥有时钟补偿；V 段关掉以测「真值胜冻结 SMTC」）
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
    ts: now - 60, v: "1.4.0",
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
      /* 宿主校验：j.rev 必须等于期望 rev（stale-lyric 拒收），载荷嵌在 j.lyric 下 */
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

/* ---------- ST 静态断言（交付物字节级） ---------- */
{
  const results0 = [];
  const check0 = (name, ok) => { results0.push({ name, ok }); console.log(`${ok ? "✓" : "✗"} ${name}`); };
  const idx = readFileSync("/home/z/my-project/bridge/lyric-plugin/index.js", "utf8");
  check0("ST1 spawnBridge 直启 powershell 优先于 wscript",
    idx.indexOf("powershell.exe -NoProfile") < idx.indexOf("wscript.exe") && idx.indexOf("lastSpawnAt = Date.now()") > 0);
  check0("ST2 部署读回校验在位（readFileText + 不一致不拉起）",
    idx.includes("readFileText") && idx.includes("读回校验失败，本轮不拉起"));
  check0("ST3 拉起退避在位（spawnBackoffMs 封顶 120s）",
    idx.includes("Math.min(120000, 20000 * Math.pow(2")) && check0("ST3b", true);
  check0("ST4 真值熔断在位（nativeExpectMs/pickMediaEl/lastSeekAt 熔断窗）",
    idx.includes("nativeExpectMs") && idx.includes("pickMediaEl") && idx.includes("nowMs - lastSeekAt > 5000"));
  check0("ST5 粘滞选择器已废除", !idx.includes("mediaElStrict") && !idx.includes("stickyEl"));
  check0("ST6 needLyric 自愈在位", idx.includes("resp.needLyric") && idx.includes("rePushLyric"));
  const vbs = readFileSync("/home/z/my-project/bridge/smtc/chushi-bridge-launch.vbs", "utf8");
  check0("ST7 VBS On Error Resume Next 首段在位", vbs.split(/\r?\n/).slice(0, 8).join("\n").includes("On Error Resume Next"));
  const ps1 = readFileSync("/home/z/my-project/bridge/smtc/chushi-bridge.ps1", "utf8");
  check0("ST8 桥 v1.7.1 + needLyric 自愈应答在位",
    ps1.includes("$BRIDGE_VERSION = '1.7.1'") && ps1.includes("needLyric"));
  const smtc = readFileSync("/home/z/my-project/src/lib/startpage/smtc.ts", "utf8");
  check0("ST9 宿主两击守卫在位（neZeroStreak + trustZero）",
    smtc.includes("neZeroStreak") && smtc.includes("trustZero") && smtc.includes('verLt(pluginVerNow, "1.4.0")'));
  const whtml = readFileSync("/home/z/my-project/preset-src/smtc/music-widget.html", "utf8");
  check0("ST10 部件歌词高度迟滞在位（lyHold）", whtml.includes("lyHold") && whtml.includes("换曲才重算高度迟滞"));
}

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
const ctx = await browser.newContext({ viewport: { width: 1280, height: 915 } });
const page = await ctx.newPage();
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

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
}
const dockMusicBtn = page.locator(".cl-dock button[aria-label='音乐']");
const wFrame = () => page.frameLocator(".cl-dockwidget iframe").frameLocator("iframe[title='初始自定义小部件']");
const barW = () => wFrame().locator("#bar").evaluate((el) => parseFloat(el.style.width) || 0);
const tCtxt = () => wFrame().locator("#tC").textContent();
const apTxt = () => wFrame().locator("#ap").textContent();
const playIconOff = () => wFrame().locator("#yI").evaluate((el) => el.classList.contains("off")); // true=暂停图标在场(已暂停态相反)
const iframeH = () => page.locator(".cl-dockwidget iframe").first().evaluate((el) => el.getBoundingClientRect().height);
const pctOf = (sec) => (sec / DUR) * 100;
const truthNow = () => (mockTruth ? mockTruth.pos + (mockTruth.playing ? (Date.now() - mockTruth.t0) / 1000 : 0) : 0);

/* ---------- P 导入 .cshz ---------- */
await page.keyboard.press("Control+k");
await page.waitForTimeout(800);
await page.locator("[cmdk-item]").filter({ hasText: "导入预设" }).click();
await page.waitForTimeout(600);
await page.locator("input[type=file]").setInputFiles("/home/z/my-project/examples/初始SMTC音乐预设.cshz");
await page.waitForTimeout(2600);
check("P1 .cshz 导入无错误", (await page.locator("text=/错误|必须|缺失|不支持/").count()) === 0);
check("P2 dock 音乐按钮出现", (await dockMusicBtn.count()) === 1);
await page.keyboard.press("Escape");
await page.waitForTimeout(400);

/* ---------- V 真值锚定：SMTC 钉死 50，真值 100s 前进 ---------- */
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
  const t = await tCtxt();
  const expected = pctOf(truthNow());
  check("V1 面板跟真值（≈100s→37%+，不跟 SMTC 冻结 50→18.6%）", Math.abs(w - expected) < 3.5, `bar=${w.toFixed(2)}% 期望=${expected.toFixed(2)}% t=${t}`);
  check("V2 时间标签为真值 ≈1:4x", /1:4[0-9]/.test(t), `tC=${t}`);
}

/* ---------- Z 零值两击守卫 + ZR 反转守卫（v2.3.1 核心） ---------- */
{
  smtcAdvance = true; /* 真机桥带时钟补偿：SMTC 位置跟真值前进（V 段的冻结 50 只为测「真值胜」） */
  /* Z1: 单拍 paused+0 垃圾样本（真机错误元素场景）→ 面板不冻 0 不翻暂停 */
  const frozenAt = truthNow();
  neQueue = [{ positionMs: 400, playing: false }];
  await page.waitForTimeout(1700);
  const w1 = await barW();
  const paused1 = await playIconOff();
  check("Z1a 单拍零样本后进度仍在真值区（不被钉 0）", w1 > pctOf(frozenAt) - 4, `bar=${w1.toFixed(2)}% 深位期望≈${pctOf(frozenAt).toFixed(2)}%`);
  check("Z1b 单拍零样本后播放态不翻转（仍是播放图标）", paused1 === true);
  /* ZR: 单拍 playing+0（流浪 playing 元素场景）→ 播放态不翻转、进度不归零 */
  neQueue = [{ positionMs: 0, playing: true }];
  await page.waitForTimeout(1700);
  const w2 = await barW();
  const paused2 = await playIconOff();
  check("Z2a playing+0 垃圾样本后进度仍前进不归零", w2 > pctOf(frozenAt) - 4, `bar=${w2.toFixed(2)}%`);
  check("Z2b playing+0 垃圾样本不引发状态反转（播放图标保持）", paused2 === true);
  /* Z3: 连续零样本（真实重启场景）→ 第二拍起采纳 0 + 暂停 */
  const tf = truthNow();
  mockTruth = { pos: tf, playing: false, t0: Date.now() };
  neQueue = [
    { positionMs: 300, playing: false },
    { positionMs: 300, playing: false },
    { positionMs: 300, playing: false },
    { positionMs: 300, playing: false },
  ];
  await page.waitForTimeout(3600);
  const w3 = await barW();
  const paused3 = await playIconOff();
  check("Z3a 连续零样本被采纳（真实重启/暂停归零场景）", w3 < 2.5, `bar=${w3.toFixed(2)}%`);
  check("Z3b 连续零样本采纳后播放态翻为暂停", paused3 === false);
  /* 恢复真值 → 面板跟回 */
  mockTruth = { pos: 120, playing: true, t0: Date.now() };
  await page.waitForTimeout(2600);
  const w4 = await barW();
  check("Z4 真值恢复后面板跟回（44%+）", Math.abs(w4 - pctOf(truthNow())) < 3.5, `bar=${w4.toFixed(2)}% 期望=${pctOf(truthNow()).toFixed(2)}%`);
}

/* ---------- D 暂停/恢复 ×2 轮零累积漂移 ---------- */
async function cycle(label) {
  const frozenAt = truthNow();
  mockTruth = { pos: frozenAt, playing: false, t0: Date.now() };
  mockState = { ...mockState, track: { ...mockState.track, playing: false, position: 0 } };
  await page.waitForTimeout(2700);
  const wPause = await barW();
  const expPause = pctOf(frozenAt);
  check(`${label}a 暂停冻结于真值（SMTC 伪影归零不带入）`, Math.abs(wPause - expPause) < 1.6, `bar=${wPause.toFixed(2)}% 期望=${expPause.toFixed(2)}%`);
  mockTruth = { pos: frozenAt, playing: true, t0: Date.now() };
  mockState = { ...mockState, track: { ...mockState.track, playing: true } };
  await page.waitForTimeout(2700);
  const wResume = await barW();
  const expResume = pctOf(frozenAt + 2.7);
  const drift = Math.abs(wResume - expResume);
  check(`${label}b 恢复续接真值（偏差 ${drift.toFixed(2)}% < 1.6%）`, drift < 1.6, `bar=${wResume.toFixed(2)}% 期望=${expResume.toFixed(2)}%`);
  return drift;
}
const d1 = await cycle("D1");
const d2 = await cycle("D2");
check("D3 两轮恢复偏差无累积趋势", Math.abs(d2 - d1) < 1.2, `d1=${d1.toFixed(2)}% d2=${d2.toFixed(2)}%`);

/* ---------- FT 页脚诊断 ---------- */
{
  const ap = await apTxt();
  check("FT1 页脚可见插件版本 v1.4.0", ap.includes("插件 v1.4.0"), ap);
}
/* ---------- S1 seek 生效：真值跟上 → 不弹回 ---------- */
{
  seekBehavior = "ok";
  const box = await wFrame().locator("#sk").boundingBox();
  const before = await barW();
  await wFrame().locator("#sk").click({ position: { x: Math.round(box.width * 0.7), y: Math.round(box.height / 2) } });
  await page.waitForTimeout(3400);
  const after = await barW();
  const ap = await apTxt();
  check("S1a seek 70% 生效不弹回", after > 63 && after < 77, `bar ${before.toFixed(2)}%→${after.toFixed(2)}%`);
  check("S1b 页脚无未生效提示", !ap.includes("拖动未生效"), ap);
}
/* ---------- S2 seek 未生效：诚实弹回 + 提示 ---------- */
{
  seekBehavior = "fail";
  const box = await wFrame().locator("#sk").boundingBox();
  await wFrame().locator("#sk").click({ position: { x: Math.round(box.width * 0.25), y: Math.round(box.height / 2) } });
  await page.waitForTimeout(4600);
  const after = await barW();
  const ap = await apTxt();
  const expected = pctOf(truthNow());
  check("S2a 未生效诚实弹回真值", Math.abs(after - expected) < 3.5, `bar=${after.toFixed(2)}% 真值=${expected.toFixed(2)}%`);
  check("S2b 页脚出现未生效提示", ap.includes("拖动未生效"), ap);
  const noteOn = await wFrame().locator("#noteChip").evaluate((el) => el.classList.contains("on"));
  check("S2c 进度条上方醒目芯片点亮", noteOn === true);
}
/* ---------- NU 组件过旧芯片：阈值 1.7.1/1.4.0 ---------- */
{
  const oldState = { ...mockState };
  const oldTruth = mockTruth;
  mockState = { ...mockState, version: "1.6.0-mock" };
  mockTruth = null;
  mockState = { ...mockState, ne: null };
  await page.waitForTimeout(2600);
  const updOn = await wFrame().locator("#updChip").evaluate((el) => el.classList.contains("on"));
  check("NU1 旧桥+无插件 → 升级芯片点亮", updOn === true);
  mockState = { ...oldState };
  mockTruth = oldTruth;
  await page.waitForTimeout(2200);
  const updOff = await wFrame().locator("#updChip").evaluate((el) => el.classList.contains("on"));
  check("NU2 新桥 1.7.1+新插件 1.4.0 → 芯片熄灭", updOff === false);
}
/* ---------- LYH 歌词高度迟滞（部件 v6）：同曲丢词不塌高度 ---------- */
{
  /* 先让歌词到位：同曲 + lyricRev 有值 */
  neLyricRev = "rev-lyh";
  await page.waitForTimeout(3200); /* 拉词 + 部件重建 + 高度弹簧 */
  const h1 = await iframeH();
  check("LYH1 歌词到位面板增高（≈372）", Math.abs(h1 - 372) < 14, `h=${h1.toFixed(0)}`);
  /* 同曲丢词（桥重启场景）：高度必须保持 */
  neLyricRev = "";
  await page.waitForTimeout(3000);
  const h2 = await iframeH();
  check("LYH2 同曲歌词消失高度不塌（迟滞保持 ≈372）", Math.abs(h2 - 372) < 14, `h=${h2.toFixed(0)}`);
  /* 换曲（无词）→ 高度重算塌回 248 */
  mockTrackOverride = { title: "下一首歌", artist: "别人", album: "新专辑" };
  mockTruth = { pos: 20, playing: true, t0: Date.now() };
  await page.waitForTimeout(3200);
  const h3 = await iframeH();
  check("LYH3 换曲无词高度塌回 248（迟滞只对同曲生效）", Math.abs(h3 - 248) < 14, `h=${h3.toFixed(0)}`);
  mockTrackOverride = null;
  neLyricRev = "";
}
/* ---------- FT2/LG SMTC-only 回归 ---------- */
{
  const t0 = truthNow();
  mockTruth = null;
  mockState = { ...mockState, ne: null, track: { ...mockState.track, playing: true, position: Math.round(t0) } };
  await page.waitForTimeout(2600);
  const ap = await apTxt();
  check("FT2 无插件页脚无插件版本", !ap.includes("插件 v"), ap);
  const ws = [];
  for (let i = 0; i < 3; i++) { ws.push(await barW()); await page.waitForTimeout(420); }
  check("LG1 SMTC-only 锚点插值仍单调前进", ws[2] > ws[0] + 0.1, ws.map((x) => x.toFixed(2)).join(",") + "%");
}

check("X1 pageerror=0", errors.length === 0, errors.slice(0, 2).join(" | "));
const fail = results.filter((r) => !r.ok).length;
console.log(`\n=== verify-v231: ${results.length - fail}/${results.length} ===`);
await browser.close();
server.close();
mock.close();
process.exit(fail === 0 ? 0 : 1);
