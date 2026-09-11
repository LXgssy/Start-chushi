// v8.3.3 面板取证门——行界滞回门（宿主 sandbox.js）+ done 提层 + 高光归位。
//
//   G1 门压制：行 2 激活后喂两拍 backward（-1.5s，熔断第 2 拍放行=硬跳后退）
//      ——600ms 内行 1 不得重亮（.on 不回）；1.2s 内恰好一次干净切换（无振荡）
//   G2 门前进即时：位置前推 → 300ms 内新行点亮（零延迟律不破）
//   G3 原生大步后退（-6s 级）：650ms-1.2s 内单次收敛（无振荡闪烁）
//   G4 done 行常驻提层：computed will-change = "transform, filter"
//   G5 高光归位：beat 期 csCoverImg 内联 filter 恒空 + .cs-glow opacity 响应
//   G6 零 pageerror
// rig 复用 verify-v832-panel.mjs（真 sandbox.html + 真 cshz 部件 + postMessage 喂拍）
import { chromium } from "playwright-core";
import { execSync } from "child_process";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, cpSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawn } from "child_process";

const CSHZ = "/tmp/my-project/examples/初始SMTC音乐预设.cshz";
const STAGE = "/tmp/ext-stage";
const PORT = 26990;

function unpackHtml(cshz) {
  const tmp = mkdtempSync(join(tmpdir(), "cshz-"));
  execSync(`cd ${tmp} && unzip -q -o "${cshz}" manifest.json`);
  return JSON.parse(readFileSync(join(tmp, "manifest.json"), "utf8")).widgets[0].html;
}
const widgetHtml = unpackHtml(CSHZ);
if (!execSync("test -f /tmp/cover-test.jpg && echo y || echo n").toString().startsWith("y")) {
  execSync(`python3 -c "from PIL import Image; Image.new('RGB',(64,64),(40,36,52)).save('/tmp/cover-test.jpg')"`);
}
const srv = mkdtempSync(join(tmpdir(), "v833-panel-"));
cpSync(join(STAGE, "sandbox.html"), join(srv, "sandbox.html"));
cpSync(join(STAGE, "sandbox.js"), join(srv, "sandbox.js"));
cpSync("/tmp/cover-test.jpg", join(srv, "cover.jpg"));
const hostHtml = `<!doctype html><html><body style="margin:0;background:#202024">
<iframe id="w" sandbox="allow-scripts" src="sandbox.html?mode=widget"
  style="position:fixed;left:10px;top:10px;width:380px;height:460px;border:0"></iframe>
<script>window.__WIDGET_HTML = ${JSON.stringify(widgetHtml).replace(/<\//g, "<\\/")};</script>
<script>
window.__errs = [];
window.addEventListener("message", function (ev) {
  var d = ev.data;
  if (d && d.type === "hello") {
    document.getElementById("w").contentWindow.postMessage({
      type: "renderWidget", key: "t:widget",
      html: window.__WIDGET_HTML, theme: "light", accent: "#22d3ee"
    }, "*");
  }
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
await sleep(800);

const lrc = [0, 1, 2, 3, 4, 5].map((i) => {
  const s = i * 3; const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `[${mm}:${ss}.000]第${i + 1}句歌词测试行`;
}).join("\n");
let seq = 0;
async function feed(position) {
  const snap = {
    connected: true,
    track: { title: "滞回门测试曲", artist: "e2e", album: "v8.3.3", app: "NCM",
      playing: true, position, duration: 300, songId: 42 },
    cover: "", coverUrl: `http://127.0.0.1:${PORT}/cover.jpg`,
    pluginVer: "8.3.1", smtcVer: "3.2.11", needsUpdate: false,
    needsBridge: false, engineOld: false, seekNote: "", cmdLast: null,
    lyricRev: "r1", lyric: { songId: 42, lrc, tlyric: "" },
  };
  await page.evaluate(({ s, n }) => {
    s.track.fetchedAt = Date.now();
    document.getElementById("w").contentWindow.postMessage({ type: "widgetSmtc", seq: n, state: s }, "*");
  }, { s: snap, n: ++seq });
}
const frame = () => page.frames().find((f) => f.url() === "about:srcdoc");
const lineCls = async () => {
  const fr = frame();
  if (!fr) return null;
  return fr.evaluate(() => {
    const els = document.querySelectorAll(".cs-ln");
    return Array.from(els).map((e) => e.className);
  });
};

/* ---- 初始落位：position 7.0（行 2 on，0-indexed） ---- */
await feed(7.0);
await sleep(1300);
const hasOn = (x) => !!x && /(^|\s)on(\s|$)/.test(x);
let cls = await lineCls();
ok(cls && hasOn(cls[2]) && !hasOn(cls[1]),
  "G0 落位（行 2 on / 行 1 非 on）", JSON.stringify(cls));

/* ---- G1 门压制：两拍 backward（-1.5s → 熔断带，第 2 拍放行=硬跳后退） ---- */
await feed(5.5); await sleep(140);
await feed(5.5);
let reflash = 0, samples = 0;
const t0 = Date.now();
while (Date.now() - t0 < 600) {
  const c = await lineCls();
  samples++;
  if (c && c[1] && /(^|\s)on(\s|$)/.test(c[1])) reflash++;
  await sleep(45);
}
ok(reflash === 0, `G1a 门压制（backward 硬跳后 600ms 内行 1 重亮帧 ${reflash}/${samples} = 0）`);
/* G1b：显示轨迹 5.5→6.05 只需 ~550ms——backward 候选在 650ms 门到期前
   已因位置回到行 2 区间而自然消亡 = 全程零翻转（比「延迟切换」更优）。
   断言：随后 1.2s 内行 1 依旧不得亮起、终态行 2。 */
await sleep(1200);
cls = await lineCls();
ok(cls && !hasOn(cls[1]) && hasOn(cls[2]),
  "G1b backward 候选自然消亡（1.8s 全程行 1 零亮起，终态行 2）", JSON.stringify(cls));

/* ---- G2 前进即时 ---- */
await feed(9.4);
let fwdMs = -1;
const t2 = Date.now();
while (Date.now() - t2 < 900) {
  const c = await lineCls();
  if (c && hasOn(c[3])) { fwdMs = Date.now() - t2; break; }
  await sleep(30);
}
ok(fwdMs >= 0 && fwdMs <= 320, `G2 前进即时（行 3 点亮耗时 ${fwdMs}ms ≤ 320）`);
await sleep(900);

/* ---- G3 原生大步后退（-6s 外=真 seek 级，单次收敛） ---- */
await feed(2.2);
let flips = 0, lastOn = -1;
const t3 = Date.now();
while (Date.now() - t3 < 1400) {
  const c = await lineCls();
  if (c) {
    const on = c.findIndex((x) => hasOn(x));
    if (lastOn >= 0 && on !== lastOn) flips++;
    if (on >= 0) lastOn = on;
  }
  await sleep(45);
}
/* 播放继续推进：2.2s + 1.4s 采样窗 ≈ 3.6s → 终态应为行 0 或行 1，
   关键断言 = 翻转次数 ≤ 2（单次干净收敛，无振荡闪烁） */
ok(lastOn >= 0 && lastOn <= 1 && flips <= 2, `G3 大步后退单次收敛（终态行 ${lastOn}，类翻转 ${flips} ≤ 2）`);
await sleep(400);

/* ---- G4 done 行常驻提层 + G5 高光归位 ---- */
await feed(7.0);
await sleep(600);
/* 频谱脉冲（widgetSmtcSpectrum 透传 → setSpectrum → now().bass → beatFrame） */
await page.evaluate(() => {
  window.__specTimer = setInterval(() => {
    const bands = new Array(16).fill(0.12);
    bands[4] = 0.55; bands[5] = 0.6;
    document.getElementById("w").contentWindow.postMessage({
      type: "widgetSmtcSpectrum",
      sp: { on: true, bass: 0.85, bands, t: Date.now() },
    }, "*");
  }, 50);
});
await sleep(700);
const st = await (async () => {
  const fr = frame();
  if (!fr) return null;
  return fr.evaluate(() => {
    const done = document.querySelector(".cs-ln.done");
    const img = document.getElementById("csCoverImg");
    const glow = document.querySelector(".cs-glow");
    return {
      doneWc: done ? getComputedStyle(done).willChange : null,
      imgFilter: img ? img.style.filter : "no-img",
      glowOp: glow ? glow.style.opacity : "no-glow",
      glowComputed: glow ? getComputedStyle(glow).opacity : null,
    };
  });
})();
ok(st && st.doneWc === "transform, filter", "G4 done 行常驻提层（will-change = transform, filter）", JSON.stringify(st));
ok(st && (st.imgFilter === "" || st.imgFilter === "none"), "G5a beat 期封面零内联滤镜（高光归位）", st && st.imgFilter);
ok(st && st.glowOp !== "" && parseFloat(st.glowComputed) > 0.25,
  "G5b 辉光本体响应（inline opacity=" + (st && st.glowOp) + " computed=" + (st && st.glowComputed) + "）");

await page.evaluate(() => clearInterval(window.__specTimer));
ok(errors.length === 0, "G6 零 pageerror", errors.slice(0, 3).join(" | "));
console.log(`\n=== v8.3.3 面板取证门: ${passed} 通过, ${failed} 失败 ===`);
await browser.close();
process.exit(failed ? 1 : 0);
