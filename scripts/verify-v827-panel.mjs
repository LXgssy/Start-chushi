// v8.2.7 面板律动「真转发链」e2e —— 用户实机 bug（浮窗有律动、面板没有）的回归门。
//
// 链路全景（全部真代码，无桩）：
//   测试宿主页 ─postMessage→ sandbox.html?mode=widget（真 sandbox.js widgetMode）
//     └ inner srcdoc iframe（真 music-widget.html + widgetShim）
//        ├ renderWidget → 部件挂载
//        ├ widgetSmtc   → 快照 feed（播放态）
//        └ widgetSmtcSpectrum → __music.setSpectrum → now().bass → beatFrame
//
// v8.2.6 及更早：宿主下行透传白名单漏 widgetSmtcSpectrum → 频谱帧永远到不了
// 部件 → glow 恒静态 → 本测试 P2/P3 必挂；v8.2.7 透传补齐后全绿。
//
// 像素取证（iframe 是 opaque origin，DOM 不可达，走截图采样律）：
//   P1 挂载+播放态渲染（封面占位渐变在位）
//   P2 频谱脉冲帧 vs 静态基线：环带区（封面外圈）亮度显著抬升（辉光增强）
//      且封面中心亮度抬升（变亮律 brightness filter）
//   P3 静默衰减帧回落（不冻结在峰值）
//   P4 零 pageerror / P5 部件通道 smtcSubscribe 确实到达宿主（链路活性）
import { chromium } from "playwright-core";
import { execSync } from "child_process";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, cpSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawn } from "child_process";

const CSHZ = process.env.CSHZ_PATH || "/tmp/my-project/examples/初始SMTC音乐预设.cshz";
const STAGE = process.env.STAGE_DIR || "/tmp/ext-stage";           // build-extension.py 产物（真 sandbox.js）
const PORT = Number(process.env.FWD_PORT || 26989);

function unpackHtml(cshz) {
  const tmp = mkdtempSync(join(tmpdir(), "cshz-"));
  execSync(`cd ${tmp} && unzip -q -o "${cshz}" manifest.json`);
  const m = JSON.parse(readFileSync(join(tmp, "manifest.json"), "utf8"));
  return m.widgets[0].html;
}
const widgetHtml = unpackHtml(CSHZ);

/* 服务目录：sandbox.html + sandbox.js（真产物）+ 宿主测试页 */
const srv = mkdtempSync(join(tmpdir(), "panel-fwd-"));
cpSync(join(STAGE, "sandbox.html"), join(srv, "sandbox.html"));
cpSync(join(STAGE, "sandbox.js"), join(srv, "sandbox.js"));
cpSync("/tmp/cover-test.jpg", join(srv, "cover.jpg"));   // 暗色真图：亮度滤镜的可见靶
const hostHtml = `<!doctype html><html><body style="margin:0;background:#202024">
<iframe id="w" sandbox="allow-scripts" src="sandbox.html?mode=widget"
  style="position:fixed;left:10px;top:10px;width:380px;height:460px;border:0"></iframe>
<script>window.__WIDGET_HTML = ${JSON.stringify(widgetHtml).replace(/<\//g, "<\\/")};</script>
<script>
window.__errs = []; window.__subscribed = false; window.__rendered = false;
window.addEventListener("message", function (ev) {
  var d = ev.data;
  if (!d || typeof d !== "object") return;
  if (d.type === "hello") {
    window.__rendered = false;
    document.getElementById("w").contentWindow.postMessage({
      type: "renderWidget", key: "t:widget",
      html: window.__WIDGET_HTML, theme: "light", accent: "#22d3ee"
    }, "*");
  }
  if (d.type === "widgetApi" && d.op === "smtcSubscribe") window.__subscribed = true;
});
window.addEventListener("error", function (e) { window.__errs.push(String(e.message)); });
</script></body></html>`;
writeFileSync(join(srv, "host.html"), hostHtml);

const http = spawn("python3", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1"],
  { cwd: srv, stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
process.on("exit", () => { try { http.kill("SIGKILL"); } catch {} });

const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`,
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 420, height: 500 } });
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

let passed = 0, failed = 0;
const ok = (c, name, extra) => {
  if (c) { passed++; console.log("  ✓ " + name); }
  else { failed++; console.log("  ✗ " + name + (extra ? " — " + extra : "")); }
};

await page.goto(`http://127.0.0.1:${PORT}/host.html`, { waitUntil: "load", timeout: 15000 });

/* P5 前置：hello→renderWidget→部件 smtcSubscribe 到达宿主（链路活性） */
let subscribed = false;
for (let i = 0; i < 20 && !subscribed; i++) {
  subscribed = await page.evaluate(() => window.__subscribed);
  if (!subscribed) await sleep(300);
}
ok(subscribed, "P5 部件 smtcSubscribe 到达宿主（renderWidget→widgetShim 链路活）");
await page.waitForTimeout(200);

/* 快照 feed：播放态（与 v820-glow 桩同构） */
/* 快照 feed：宿主真形状（smtc.getSnapshot() = {connected, track:{...}, coverUrl,...}，
   shim whitelist 从 state.track 归一化 —— v820-glow 单测桩形状是直连桩专用，勿混） */
const snap = {
  connected: true,
  track: {
    title: "转发链测试曲", artist: "e2e", album: "v8.2.7", app: "NCM",
    playing: true, position: 3, duration: 300, songId: 42,
  },
  cover: "",
  coverUrl: `http://127.0.0.1:${PORT}/cover.jpg`,
  pluginVer: "8.2.7", smtcVer: "3.2.11", needsUpdate: false,
  needsBridge: false, engineOld: false, seekNote: "", cmdLast: null,
  lyricRev: "r1",
};
await page.evaluate((s) => {
  document.getElementById("w").contentWindow.postMessage({ type: "widgetSmtc", state: s }, "*");
}, snap);
await page.waitForTimeout(900);

/* P0 播放态在位（cs-playing 类 = effPlaying 真值，beatFrame 激活前提）——
   跨源帧直查（Playwright CDP 可达 opaque origin） */
const cls = await page
  .frames().find((f) => f.url() === "about:srcdoc")
  .evaluate(() => document.querySelector(".cs-card").className);
ok(/cs-playing/.test(cls), `P0 播放态类在位（${cls}）`);

/* 像素采样器：截图 → 页内 canvas → 点位 RGB（headless dpr=1） */
async function sample(pts) {
  const clip = { x: 10, y: 10, width: 380, height: 460 };
  const buf = await page.screenshot({ clip });
  const b64 = buf.toString("base64");
  return page.evaluate(({ b64, pts }) => new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.width; c.height = img.height;
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0);
      res(pts.map(([x, y]) => {
        const d = ctx.getImageData(x, y, 1, 1).data;
        return [d[0], d[1], d[2]];
      }));
    };
    img.onerror = () => rej(new Error("decode fail"));
    img.src = "data:image/png;base64," + b64;
  }), { b64, pts });
}

/* 点位（iframe 内局部坐标）：部件 .cs-live padding 14/16 → 96px 封面中心≈(64,62)；
   环带 = 封面外圈（左缘外 6px / 上缘外 6px）；.cs-glow inset:-7px blur12px 晕出 */
const PTS = {
  ringL: [10, 62], ringT: [64, 8], ringR: [118, 62],
  center: [64, 62], center2: [80, 78],
};
const lum = (px) => px[0] + px[1] + px[2];

/* P1 播放态渲染：真封面图在位（暗色图中心亮度远低于白卡 ≈620）
   基线稳定门：连续两拍亮度漂移 ≤10 才开测（隔离封面淡入/懒加载伪差，
   否则旧版阴性对照会因图片后到而假性“中心提亮”） */
let base = null, prevLum = -1;
for (let i = 0; i < 10; i++) {
  base = await sample([PTS.center, PTS.ringL, PTS.ringT, PTS.ringR, PTS.center2]);
  const l0 = lum(base[0]);
  if (prevLum >= 0 && Math.abs(l0 - prevLum) <= 10) break;
  prevLum = l0;
  await sleep(450);
}
ok(lum(base[0]) < 500, `P1 播放态渲染（暗色封面中心亮度 ${lum(base[0])} < 500 = .cs-mode-fl + 真图在位）`);

/* P2 频谱脉冲：20Hz 推 1.2s（bass 0.85 + 中频 0.55）→ 环带与中心显著抬升 */
await page.evaluate(() => {
  window.__specTimer = setInterval(() => {
    const bands = new Array(16).fill(0.12);
    bands[4] = 0.55; bands[5] = 0.6; bands[6] = 0.5; bands[13] = 0.4;
    document.getElementById("w").contentWindow.postMessage({
      type: "widgetSmtcSpectrum",
      sp: { on: true, bass: 0.85, bands, t: Date.now() },
    }, "*");
  }, 50);
});
await sleep(1200);
const pulse = await sample([PTS.center, PTS.ringL, PTS.ringT, PTS.ringR, PTS.center2]);
clearInterval(await page.evaluate(() => { clearInterval(window.__specTimer); return 1; }));

/* 环带指标 = 青色调 g-r（浅色卡上辉光亮度被白底钳位，色调位移才是真信号；
   accent #22d3ee: g=211 r=34 → 染色时 g-r 大幅抬升） */
const cyan = (px) => px[1] - px[0];
const ringBase = Math.min(cyan(base[1]), cyan(base[2]), cyan(base[3]));
const ringPulse = Math.max(cyan(pulse[1]), cyan(pulse[2]), cyan(pulse[3]));
ok(ringPulse > ringBase + 40,
   `P2a 辉光环带抬升（青色调 g-r：基线 ${ringBase} → 脉冲 ${ringPulse}，Δ=${ringPulse - ringBase} > 40）`);
const cBase = Math.min(lum(base[0]), lum(base[4]));
const cPulse = Math.max(lum(pulse[0]), lum(pulse[4]));
ok(cPulse > cBase + 30,
   `P2b 封面中心提亮（变亮律 brightness filter：基线 ${cBase} → 脉冲 ${cPulse}，Δ=${cPulse - cBase} > 30）`);

/* P3 静默衰减：停推 + 归零帧 → 回落（不冻结峰值） */
await page.evaluate(() => {
  document.getElementById("w").contentWindow.postMessage({
    type: "widgetSmtcSpectrum", sp: { on: false, bass: 0, bands: [], t: Date.now() },
  }, "*");
});
await sleep(1100);
const settled = await sample([PTS.center, PTS.ringL, PTS.ringT, PTS.ringR, PTS.center2]);
const ringSettled = Math.max(cyan(settled[1]), cyan(settled[2]), cyan(settled[3]));
ok(ringSettled < ringPulse - 25,
   `P3 静默回落（脉冲 g-r ${ringPulse} → 静默 ${ringSettled}，回落 > 25 = 不冻峰值）`);

/* P4 零致命报错 */
const fatal = errors.filter((e) => !/CONNECTION_REFUSED|ERR_ABORTED/i.test(e));
ok(fatal.length === 0, "P4 零 pageerror", fatal.slice(0, 3).join(" | "));

console.log(`\n=== v8.2.7 面板律动真转发链: ${passed} 通过, ${failed} 失败 ===`);
await browser.close();
process.exit(failed ? 1 : 0);
