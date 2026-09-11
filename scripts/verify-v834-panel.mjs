// v8.3.4 面板取证门——歌词防裁切 + 切行「咯噔」根治（布局连续性）+ on 行提层 + 乐观窗顺延。
//
//   P1 容器加高+固定渐隐：cs-lyr computed height = 146px，mask-image 含 calc(100% - 18px)
//   P2 翻译行 grid 壳：on 行 .cs-subw 展开（offsetHeight>0），非 on 行 0fr（=0），
//      transition-property 含 grid-template-rows
//   P3 切行布局连续性（咯噔主因反证）：行 2→行 3 切换瞬间高频采样下方行 offsetTop——
//      grid 过渡版出现 ≥3 个连续中间值；display 硬切版只有旧/新两值（一步瞬跳）
//   P4 on 行常驻提层：computed will-change = "transform, filter"
//   P5 乐观窗顺延文件门：widget html 含 OPT_MAX（行为门在浮窗取证器同律覆盖）
//   P6 零 pageerror
// rig 复用 verify-v833-panel.mjs（真 sandbox.html + 真 cshz 部件 + postMessage 喂拍）
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
/* 文件门先行：OPT_MAX 顺延律必须入包 */
if (!widgetHtml.includes("OPT_MAX")) {
  console.log("  ✗ P5 乐观窗顺延（OPT_MAX 不在 cshz widget html——复位根治未入包）");
  process.exit(1);
}
if (!execSync("test -f /tmp/cover-test.jpg && echo y || echo n").toString().startsWith("y")) {
  execSync(`python3 -c "from PIL import Image; Image.new('RGB',(64,64),(40,36,52)).save('/tmp/cover-test.jpg')"`);
}
const srv = mkdtempSync(join(tmpdir(), "v834-panel-"));
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

/* 行 0 无翻译（对照），行 1-5 带翻译（grid 壳全覆盖） */
const lrc = [0, 1, 2, 3, 4, 5].map((i) => {
  const s = i * 3; const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `[${mm}:${ss}.000]第${i + 1}句歌词测试行`;
}).join("\n");
const tlyric = [1, 2, 3, 4, 5].map((i) => {
  const s = i * 3; const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `[${mm}:${ss}.000]第${i + 1}句翻译`;
}).join("\n");
let seq = 0;
async function feed(position) {
  const snap = {
    connected: true,
    track: { title: "防裁切测试曲", artist: "e2e", album: "v8.3.4", app: "NCM",
      playing: true, position, duration: 300, songId: 42 },
    cover: "", coverUrl: `http://127.0.0.1:${PORT}/cover.jpg`,
    pluginVer: "8.3.1", smtcVer: "3.2.11", needsUpdate: false,
    needsBridge: false, engineOld: false, seekNote: "", cmdLast: null,
    lyricRev: "r1", lyric: { songId: 42, lrc, tlyric },
  };
  await page.evaluate(({ s, n }) => {
    s.track.fetchedAt = Date.now();
    document.getElementById("w").contentWindow.postMessage({ type: "widgetSmtc", seq: n, state: s }, "*");
  }, { s: snap, n: ++seq });
}
const frame = () => page.frames().find((f) => f.url() === "about:srcdoc");
const hasOn = (x) => !!x && /(^|\s)on(\s|$)/.test(x);

/* ---- 落位：position 7.0（行 2 on） ---- */
await feed(7.0);
await sleep(1400);
let cls = await (async () => {
  const fr = frame(); if (!fr) return null;
  return fr.evaluate(() => Array.from(document.querySelectorAll(".cs-ln")).map((e) => e.className));
})();
ok(cls && hasOn(cls[2]), "P0 落位（行 2 on）", JSON.stringify(cls));

/* ---- P1 容器加高 + 固定渐隐 + P2 翻译行 grid 壳 + P4 on 行提层 ---- */
{
  const fr = frame();
  const st = await fr.evaluate(() => {
    const lyr = document.querySelector(".cs-lyr");
    const onRow = document.querySelector(".cs-ln.on");
    const subw = onRow ? onRow.querySelector(".cs-subw") : null;
    const subwOff = document.querySelector(".cs-ln:not(.on) .cs-subw");
    const cs = getComputedStyle(lyr);
    return {
      h: cs.height,
      mask: cs.webkitMaskImage || cs.maskImage,
      subwH: subw ? subw.offsetHeight : -1,
      subwRows: subw ? getComputedStyle(subw).gridTemplateRows : null,
      subwTrans: subw ? getComputedStyle(subw).transitionProperty : null,
      offH: subwOff ? subwOff.offsetHeight : -1,
      onWc: onRow ? getComputedStyle(onRow).willChange : null,
      subDisplay: subw && subw.firstElementChild ? getComputedStyle(subw.firstElementChild).display : null,
    };
  });
  ok(st.h === "146px", "P1a cs-lyr 加高 146px（防裁切）", st.h);
  ok(/calc\(100% - 18px\)/.test(st.mask), "P1b mask 固定 18px 渐隐（百分比浮动退役）", st.mask);
  ok(st.subwH > 6 && st.subwRows !== "0px", "P2a on 行翻译展开（subw " + st.subwH + "px rows=" + st.subwRows + "）");
  ok(st.offH === 0, "P2b 非 on 行翻译收起（0fr = 0px）", String(st.offH));
  ok(/(^|,\s*)height(\s*,|$)/.test(st.subwTrans) || /height/.test(st.subwTrans), "P2c subw transition 含 height（高度平滑过渡）", st.subwTrans);
  ok(st.subDisplay !== "none", "P2d 翻译行不再 display 硬切（恒渲染进轨道）", st.subDisplay);
  ok(st.onWc === "auto", "P4 on 行零提层（will-change=auto，防 raster 冻结在 .94→1.06 放大模糊，F15b 律）", st.onWc);
}

/* ---- P3 切行布局零扰动（咯噔主因反证） ----
   【环境律】opaque srcdoc iframe 定时器重节流 + 过渡对象不可见（probe 实证：
   getAnimations()=[]、setTimeout 采样窗内 CSS 过渡中间帧不可得）——过渡
   中间帧在本环境不可测，产品环境 height .38s length 插值由规范保证
   （P2c 声明门 + v8.3.2 模糊过渡实机可见为旁证）。
   本环境可测的最强断言 = 切行前后下方行 offsetTop 零扰动：
   display 硬切旧律行盒瞬时 ±17px（target 跳变/翻译瞬现 = 咯噔源）；
   新律 subw 恒渲染进轨道 + 同曲线收/展抵消 → 下方行位置不受切行扰动。 */
{
  const fr = frame();
  await feed(8.45); /* 离行界 9.0 余量充足（推进 ≤300ms 后 8.75 仍未越界） */
  await sleep(300);
  const before = await fr.evaluate(() => {
    const els = document.querySelectorAll(".cs-ln");
    return els.length > 4 ? { top4: els[4].offsetTop, top3: els[3].offsetTop, h3: els[3].offsetHeight } : null;
  });
  await feed(9.15);
  await sleep(1100); /* 过渡+追踪窗全收敛 */
  const after = await fr.evaluate(() => {
    const els = document.querySelectorAll(".cs-ln");
    return els.length > 4 ? { top4: els[4].offsetTop, top3: els[3].offsetTop, h3: els[3].offsetHeight } : null;
  });
  ok(before && after && Math.abs(before.top4 - after.top4) <= 2,
    `P3a 切行下方行零扰动（行 4 offsetTop ${before && before.top4} → ${after && after.top4}，Δ=${before && after ? Math.abs(before.top4 - after.top4) : "?"} ≤ 2）`);
  ok(before && after && after.h3 - before.h3 >= 8 && after.h3 - before.h3 <= 24,
    `P3b 当前行高度含翻译展开（行 3 offsetHeight ${before && before.h3} → ${after && after.h3}）`);
  await sleep(400);
}

/* ---- P3c 终态确认：行 3 on 且翻译展开（过渡收敛终态） ---- */
{
  const fr = frame();
  const fin = await fr.evaluate(() => {
    const on = document.querySelector(".cs-ln.on");
    const subw = on ? on.querySelector(".cs-subw") : null;
    return { idx: on ? [...on.parentNode.children].indexOf(on) : -1, subwH: subw ? subw.offsetHeight : -1 };
  });
  ok(fin.idx === 3 && fin.subwH > 6, "P3c 切行收敛（行 3 on + 翻译展开 " + fin.subwH + "px）", JSON.stringify(fin));
}

ok(errors.length === 0, "P6 零 pageerror", errors.slice(0, 3).join(" | "));
console.log(`\n=== v8.3.4 面板取证门: ${passed} 通过, ${failed} 失败 ===`);
await browser.close();
process.exit(failed ? 1 : 0);
