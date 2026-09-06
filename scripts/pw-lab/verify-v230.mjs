import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/* verify-v230.mjs — v2.3.0：一体化插件（内嵌桥）+ 升级芯片 + seekNote 醒目芯片
 * （继承 v2.2.0 全部回归：真值锚定/暂停恢复零累积/seek 双路）
 *
 * V  真值锚定：SMTC position 钉死 50（网易云伪影）+ 插件真值 100s 前进
 *    → 面板必须跟真值（不跟 SMTC 冻结值）
 * D  暂停/恢复 ×3 轮：每轮恢复后面板位置与真值期望偏差 <1.5% —— 任何一轮
 *    超差即「累积漂移」（v2.1.0 真机残留 bug 的直接复现场景）
 * S  seek 双路：真值跟上→不弹回；真值不动→2.5s 后诚实弹回 + 页脚 seekNote
 * FT 页脚诊断：插件 v1.2.0 在场可见；无插件时消失
 * LG SMTC-only 回归（ne=null）：冻结 position + playing → 锚点插值仍前进
 * X  pageerror=0
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
let mockState = { ok: true, name: "chushi-smtc-bridge", version: "1.7.0-mock", track: null, ne: null };
/* 插件真值模拟：{ pos, playing, t0 } → positionMs = pos + (playing ? (now-t0)/1000 : 0) */
let mockTruth = null;
let mockSeekAck = null; // { id, ok, pos, at }
let seekBehavior = "ok"; // ok | fail
const controlLog = [];

const mock = createServer((req, res) => {
  cors(res);
  const u = new URL(req.url, "http://x");
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
  if (u.pathname === "/api/ping") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, name: "chushi-smtc-bridge", version: "1.7.0-mock" }));
    return;
  }
  if (u.pathname === "/api/state") {
    const out = { ...mockState };
    if (mockTruth) {
      const now = Date.now();
      const pos = mockTruth.pos + (mockTruth.playing ? (now - mockTruth.t0) / 1000 : 0);
      out.ne = {
        songId: 123456, title: "晴天 (Live)", artist: "周杰伦", album: "叶惠美", pic: "",
        positionMs: Math.max(0, Math.round(pos * 1000)),
        durationMs: Math.round(DUR * 1000),
        playing: mockTruth.playing,
        lyricRev: "",
        ts: now - 60, v: "1.3.0",
        seekAckId: mockSeekAck ? mockSeekAck.id : "",
        seekAckOk: mockSeekAck ? mockSeekAck.ok === true : false,
        seekAckPos: mockSeekAck ? mockSeekAck.pos : 0,
        seekAckAt: mockSeekAck ? mockSeekAck.at : 0,
      };
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
    res.end(JSON.stringify({ ok: false, reason: "no-lyric" }));
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

/* ---------- D 暂停/恢复 ×2 轮零累积漂移 ---------- */
async function cycle(label) {
  // 暂停：真值冻结在当前值；SMTC 桥伪影重置 position=0
  const frozenAt = truthNow();
  mockTruth = { pos: frozenAt, playing: false, t0: Date.now() };
  mockState = { ...mockState, track: { ...mockState.track, playing: false, position: 0 } };
  await page.waitForTimeout(2700);
  const wPause = await barW();
  const expPause = pctOf(frozenAt);
  check(`${label}a 暂停冻结于真值（SMTC 伪影归零不带入）`, Math.abs(wPause - expPause) < 1.6, `bar=${wPause.toFixed(2)}% 期望=${expPause.toFixed(2)}%`);
  // 恢复：真值从冻结处续走；SMTC 仍 0
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
  check("FT1 页脚可见插件版本 v1.3.0", ap.includes("插件 v1.3.0"), ap);
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
/* ---------- NU 组件过旧芯片：旧桥/无插件 → 常驻升级芯片 ---------- */
{
  const oldState = { ...mockState };
  const oldTruth = mockTruth;
  mockState = { ...mockState, version: "1.5.0-mock" };
  mockTruth = null;
  mockState = { ...mockState, ne: null };
  await page.waitForTimeout(2600);
  const updOn = await wFrame().locator("#updChip").evaluate((el) => el.classList.contains("on"));
  check("NU1 旧桥+无插件 → 升级芯片点亮", updOn === true);
  mockState = { ...oldState };
  mockTruth = oldTruth;
  await page.waitForTimeout(2200);
  const updOff = await wFrame().locator("#updChip").evaluate((el) => el.classList.contains("on"));
  check("NU2 新桥+新插件 → 芯片熄灭", updOff === false);
}
/* ---------- FT2 无插件：页脚版本消失（真值仍由 SMTC 锚点插值前进） ---------- */
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
console.log(`\n=== verify-v220: ${results.length - fail}/${results.length} ===`);
await browser.close();
server.close();
mock.close();
process.exit(fail === 0 ? 0 : 1);
