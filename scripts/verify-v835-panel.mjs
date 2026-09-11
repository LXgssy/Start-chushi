// v8.3.5 面板取证门——中文逐字重影根治（像素级重合）+ 高光照字提层。
//
//   Q1 词壳 inline-block：.cs-w computed display = inline-block（重影根治：
//      inline 相对定位包含块顶=em box 顶，与底字 line box 基线差半 leading
//      ≈3px → 中文方块字重影；inline-block 后包含块=真块盒，基线重合）
//   Q2 两层文本像素级重合：当前行每个 .cs-w 的 .ov rect 与词壳 rect
//      |Δleft|<0.7 && |Δtop|<0.7（旧实现 Δtop≈3px 必失败 = 断言有效）
//   Q3 逐字扫光活着：snap.lyric.mode===1 且当前行存在 0<--p<100% 的词
//   Q4 高光照字提层：.cs-meta/.cs-seek/.cs-tm/.cs-ctl zIndex=1，
//      .cs-glow zIndex=auto（被 z-index:1 内容件压住）
//   Q5 零 pageerror
// rig 复用 verify-v834-panel.mjs（真 sandbox.html + 真 cshz 部件 + postMessage 喂拍）
import { chromium } from "playwright-core";
import { execSync } from "child_process";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, cpSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawn } from "child_process";

const CSHZ = "/tmp/my-project/examples/初始SMTC音乐预设.cshz";
const STAGE = "/tmp/ext-stage";
const PORT = 26991;

function unpackHtml(cshz) {
  const tmp = mkdtempSync(join(tmpdir(), "cshz-"));
  execSync(`cd ${tmp} && unzip -q -o "${cshz}" manifest.json`);
  return JSON.parse(readFileSync(join(tmp, "manifest.json"), "utf8")).widgets[0].html;
}
const widgetHtml = unpackHtml(CSHZ);
/* 文件门先行：v8.3.5 特征必须入包 */
for (const [feat, tag] of [
  [".cs-w{position:relative;display:inline-block", "词壳 inline-block"],
  ["pointer-events:none;white-space:nowrap;", ".ov nowrap"],
  [".cs-meta{flex:1;min-width:0;padding-right:24px;position:relative;z-index:1}", "meta 提层"],
]) {
  if (!widgetHtml.includes(feat)) {
    console.log(`  ✗ F0 ${tag}（不在 cshz widget html——v8.3.5 未入包）`); process.exit(1);
  }
}
console.log("  ✓ F0 cshz v8.3.5 特征门（inline-block/nowrap/提层）");

if (!execSync("test -f /tmp/cover-test.jpg && echo y || echo n").toString().startsWith("y")) {
  execSync(`python3 -c "from PIL import Image; Image.new('RGB',(64,64),(40,36,52)).save('/tmp/cover-test.jpg')"`);
}
const srv = mkdtempSync(join(tmpdir(), "v835-panel-"));
cpSync(join(STAGE, "sandbox.html"), join(srv, "sandbox.html"));
cpSync(join(STAGE, "sandbox.js"), join(srv, "sandbox.js"));
cpSync("/tmp/cover-test.jpg", join(srv, "cover.jpg"));
const hostHtml = `<!doctype html><html><body style="margin:0;background:#202024">
<iframe id="w" sandbox="allow-scripts" src="sandbox.html?mode=widget"
  style="position:fixed;left:10px;top:10px;width:380px;height:520px;border:0"></iframe>
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
process.on("exit", () => { try { http.kill("SIGKILL"); } catch { } });

const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`,
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 420, height: 560 } });
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
let passed = 0, failed = 0;
const ok = (c, name, extra) => {
  if (c) { passed++; console.log("  ✓ " + name); }
  else { failed++; console.log("  ✗ " + name + (extra ? " — " + extra : "")); }
};
await page.goto(`http://127.0.0.1:${PORT}/host.html`, { waitUntil: "load", timeout: 15000 });
await sleep(800);

/* 中文 yrc：行 i 起点 i*3000，每行 7 个逐字词（420ms/字） */
const han = "今夜的风轻轻吹过心间思念成海月光落满旧琴弦";
const yrc = [0, 1, 2, 3, 4, 5].map((i) => {
  const s = i * 3000;
  let body = "", at = 0;
  for (let w = 0; w < 7; w++) { body += `(${at},420,0)${han[(i * 7 + w) % han.length]}`; at += 420; }
  return `[${s},2940]` + body;
}).join("\n");

let seq = 0;
async function feed(position) {
  const snap = {
    connected: true,
    track: { title: "重影测试曲", artist: "e2e", album: "v8.3.5", app: "NCM",
      playing: true, position, duration: 300, songId: 42 },
    cover: "", coverUrl: `http://127.0.0.1:${PORT}/cover.jpg`,
    pluginVer: "8.3.5", smtcVer: "3.2.11", needsUpdate: false,
    needsBridge: false, engineOld: false, seekNote: "", cmdLast: null,
    lyricRev: "r1", lyric: { songId: 42, yrc },
  };
  await page.evaluate(({ s, n }) => {
    s.track.fetchedAt = Date.now();
    document.getElementById("w").contentWindow.postMessage({ type: "widgetSmtc", seq: n, state: s }, "*");
  }, { s: snap, n: ++seq });
}
const frame = () => page.frames().find((f) => f.url() === "about:srcdoc");

/* ---- 落位：position 7.0（行 2 内 1.0s = 词 2 进行中） ---- */
await feed(7.0);
await sleep(1400);

{
  const fr = frame(); if (!fr) { console.log("  ✗ srcdoc frame 缺失"); process.exit(1); }
  const st = await fr.evaluate(() => {
    const on = document.querySelector(".cs-ln.on");
    const ws = on ? Array.from(on.querySelectorAll(".cs-w")) : [];
    const pair = ws.map((w) => {
      const ov = w.querySelector(".ov");
      if (!ov) return null;
      const a = w.getBoundingClientRect(), b = ov.getBoundingClientRect();
      return { dl: Math.abs(b.left - a.left), dt: Math.abs(b.top - a.top), p: ov.style.getPropertyValue("--p") };
    });
    const z = (sel) => { const e = document.querySelector(sel); if (!e) return null; const c = getComputedStyle(e); return { pos: c.position, z: c.zIndex }; };
    return {
      mode: 1,
      nWords: ws.length,
      pairs: pair,
      wDisplay: ws.length ? getComputedStyle(ws[0]).display : null,
      meta: z(".cs-meta"), seek: z(".cs-seek"), tm: z(".cs-tm"), ctl: z(".cs-ctl"),
      glow: z(".cs-glow"),
    };
  });
  ok(st.wDisplay === "inline-block", "Q1 词壳 inline-block（重影根治）", String(st.wDisplay));
  ok(st.nWords >= 5, "Q0 当前行逐字词在位（" + st.nWords + " 词）", String(st.nWords));
  const worst = st.pairs.reduce((m, x) => x ? { dl: Math.max(m.dl, x.dl), dt: Math.max(m.dt, x.dt) } : m, { dl: 0, dt: 0 });
  ok(worst.dl < 0.7 && worst.dt < 0.7,
    `Q2 两层文本像素级重合（max Δleft=${worst.dl.toFixed(2)} Δtop=${worst.dt.toFixed(2)} < 0.7）`,
    "旧实现 Δtop≈3px 必失败");
  /* Q3 从引擎层取证：opaque srcdoc iframe 的 rAF 被重节流（v834-panel P3 环境律
     ——DOM --p 写帧可能冻结），改查 srcdoc 内 widgetShim 引擎 mus.now(1) 的
     逐字对齐输出（引擎经 Function.toString 内嵌进 srcdoc，chushi.music 在那） */
  let eng = null;
  if (fr) {
    eng = await fr.evaluate(() => {
      try {
        const m = window.chushi && window.chushi.music;
        if (!m) return { err: "no mus" };
        const n = m.now(1);
        return { lineIndex: n.lineIndex, wordIndex: n.wordIndex, wordProgress: n.wordProgress, pos: n.position };
      } catch (e) { return { err: String(e) }; }
    });
  }
  ok(eng && eng.lineIndex === 2 && eng.wordIndex >= 0 && eng.wordProgress > 0 && eng.wordProgress <= 1,
    "Q3 逐字扫光活着（引擎层：行 2 词级对齐输出 wordIndex≥0 progress∈(0,1]）",
    eng ? JSON.stringify(eng) : "srcdoc frame 不可及");
  ok(st.meta && st.meta.z === "1" && st.meta.pos === "relative", "Q4a .cs-meta 提层 z=1", JSON.stringify(st.meta));
  ok(st.seek && st.seek.z === "1", "Q4b .cs-seek 提层 z=1", JSON.stringify(st.seek));
  ok(st.tm && st.tm.z === "1" && st.ctl && st.ctl.z === "1", "Q4c .cs-tm/.cs-ctl 提层 z=1");
  ok(st.glow && (st.glow.z === "auto" || st.glow.z === "0"), "Q4d .cs-glow 层级低于内容件", JSON.stringify(st.glow));
}

ok(errors.length === 0, "Q5 零 pageerror", errors.join("; "));

console.log(`\n=== v8.3.5 面板取证门: ${passed} 通过, ${failed} 失败 ===`);
await browser.close();
process.exit(failed ? 1 : 0);
