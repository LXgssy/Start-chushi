// v8.3.2 面板歌词动效 e2e——「新动效要覆盖浮窗和『初始』面板」的面板侧取证门。
//
// 背景：v8.3.1 呼吸动效只落了浮窗，面板（music-widget.html）仍是旧时序
//（.55s/.5s）且无呼吸无模糊——用户「新加的歌词动效我没有看到」的直接原因。
// 本门在真 sandbox.html?mode=widget + 真 cshz 部件里断言 computed style：
//   L1 歌词行 DOM 全量构建（6 行）
//   L2 当前行：filter=blur(0px)（sharp）+ scale(1.06) 呼吸放大
//   L3 已唱行：filter=blur(1.1px)（浅模糊景深）
//   L4 未唱行：filter=blur(2px)（深模糊景深）+ scale(0.94)
//   L5 滚动时序对齐 .45s（v8.3.1 浮窗同参，面板旧值 .55s）
//   L6 行色 .35s + filter .45s 同曲线过渡在位
//   P9 零 pageerror
// 取证律：iframe 是 opaque origin，但 Playwright CDP 可跨源直查
// about:srcdoc 帧（v8.2.7 面板律动门先例）——computed style 精确断言。
import { chromium } from "playwright-core";
import { execSync } from "child_process";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, cpSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawn } from "child_process";

const CSHZ = process.env.CSHZ_PATH || "/tmp/my-project/examples/初始SMTC音乐预设.cshz";
const STAGE = process.env.STAGE_DIR || "/tmp/ext-stage";
const PORT = Number(process.env.FWD_PORT || 26989);

function unpackHtml(cshz) {
  const tmp = mkdtempSync(join(tmpdir(), "cshz-"));
  execSync(`cd ${tmp} && unzip -q -o "${cshz}" manifest.json`);
  const m = JSON.parse(readFileSync(join(tmp, "manifest.json"), "utf8"));
  return m.widgets[0].html;
}
const widgetHtml = unpackHtml(CSHZ);

/* 封面暗色真图（v8.2.7 同款）：缺则生成 64x64 纯色 jpg */
if (!existsSync("/tmp/cover-test.jpg")) {
  execSync(`python3 -c "from PIL import Image; Image.new('RGB',(64,64),(40,36,52)).save('/tmp/cover-test.jpg')"`);
}

const srv = mkdtempSync(join(tmpdir(), "panel-lyr-"));
cpSync(join(STAGE, "sandbox.html"), join(srv, "sandbox.html"));
cpSync(join(STAGE, "sandbox.js"), join(srv, "sandbox.js"));
cpSync("/tmp/cover-test.jpg", join(srv, "cover.jpg"));
const hostHtml = `<!doctype html><html><body style="margin:0;background:#202024">
<iframe id="w" sandbox="allow-scripts" src="sandbox.html?mode=widget"
  style="position:fixed;left:10px;top:10px;width:380px;height:460px;border:0"></iframe>
<script>window.__WIDGET_HTML = ${JSON.stringify(widgetHtml).replace(/<\//g, "<\\/")};</script>
<script>
window.__errs = []; window.__subscribed = false;
window.addEventListener("message", function (ev) {
  var d = ev.data;
  if (!d || typeof d !== "object") return;
  if (d.type === "hello") {
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

let subscribed = false;
for (let i = 0; i < 20 && !subscribed; i++) {
  subscribed = await page.evaluate(() => window.__subscribed);
  if (!subscribed) await sleep(300);
}
ok(subscribed, "P5 部件 smtcSubscribe 到达宿主（renderWidget→widgetShim 链路活）");

/* 快照 feed：播放态 + 原始 lrc 歌词 6 行（0/3/6/9/12/15s，行距 3s）——
   whitelist 走 ensureParsed（只认原始 yrc/lrc 文本，v6.1 同律）；
   position 6.2 起：line0/1 done、line2 on、line3/4/5 未唱 */
const lrc = [0, 1, 2, 3, 4, 5]
  .map((i) => { const s = i * 3; const mm = String(Math.floor(s / 60)).padStart(2, "0"); const ss = String(s % 60).padStart(2, "0"); return `[${mm}:${ss}.000]第${i + 1}句歌词测试行`; })
  .join("\n");
const snap = {
  connected: true,
  track: {
    title: "歌词景深测试曲", artist: "e2e", album: "v8.3.2", app: "NCM",
    playing: true, position: 6.2, duration: 300, songId: 42,
  },
  cover: "",
  coverUrl: `http://127.0.0.1:${PORT}/cover.jpg`,
  pluginVer: "8.3.1", smtcVer: "3.2.11", needsUpdate: false,
  needsBridge: false, engineOld: false, seekNote: "", cmdLast: null,
  lyricRev: "r1",
  lyric: { songId: 42, lrc, tlyric: "" },
};
await page.evaluate((s) => {
  document.getElementById("w").contentWindow.postMessage({ type: "widgetSmtc", state: s }, "*");
}, snap);
await sleep(1100); /* build + 行切换 + 滚动/模糊过渡稳定（.45s×2 余量） */

const frame = page.frames().find((f) => f.url() === "about:srcdoc");
ok(!!frame, "F0 部件 srcdoc 帧可达（CDP 跨源直查）");
if (frame) {
  const cls = await frame.evaluate(() => document.querySelector(".cs-card").className);
  ok(/cs-playing/.test(cls), "P0 播放态类在位");

  const st = await frame.evaluate(() => {
    const rows = [...document.querySelectorAll(".cs-ln")];
    const pick = (el) => {
      const cs = getComputedStyle(el);
      return { filter: cs.filter, transform: cs.transform,
               color: cs.color, transition: cs.transitionDuration + "|" + cs.transitionProperty };
    };
    const onEl = document.querySelector(".cs-ln.on");
    const doneEl = document.querySelector(".cs-ln.done");
    const futureEl = rows.find((r) => !r.classList.contains("on") && !r.classList.contains("done"));
    const inEl = document.querySelector(".cs-lyr-in");
    return {
      count: rows.length,
      on: onEl ? pick(onEl) : null,
      done: doneEl ? pick(doneEl) : null,
      future: futureEl ? pick(futureEl) : null,
      inTransition: inEl ? getComputedStyle(inEl).transitionDuration : null,
      scrollTf: inEl ? getComputedStyle(inEl).transform : null,
    };
  });

  ok(st.count === 6, `L1 歌词行全量构建（${st.count}/6）`);
  ok(st.on && /blur\(0px\)/.test(st.on.filter),
     `L2 当前行 sharp（filter=${st.on && st.on.filter}）`);
  ok(st.on && /matrix\(1\.06/.test(st.on.transform),
     `L2b 当前行呼吸放大 scale 1.06（${st.on && st.on.transform}）`);
  ok(st.done && /blur\(1\.1px\)/.test(st.done.filter),
     `L3 已唱行浅模糊 1.1px（filter=${st.done && st.done.filter}）`);
  ok(st.future && /blur\(2px\)/.test(st.future.filter),
     `L4 未唱行深模糊 2px（filter=${st.future && st.future.filter}）`);
  ok(st.future && /matrix\(0\.94/.test(st.future.transform),
     `L4b 未唱行缩小 scale 0.94（${st.future && st.future.transform}）`);
  ok(st.inTransition && st.inTransition.split(",").some((d) => d.trim() === "0.45s"),
     `L5 滚动时序 .45s（durations=${st.inTransition}）`);
  ok(st.on && /0\.35s/.test(st.on.transition) && /0\.45s/.test(st.on.transition),
     `L6 行色 .35s + filter .45s 过渡在位（${st.on && st.on.transition}）`);
  /* 滚动真的发生了（当前行居中 = 容器有位移） */
  ok(st.scrollTf && st.scrollTf !== "none" && !/matrix\(1, 0, 0, 1, 0, 0\)/.test(st.scrollTf),
     `L7 歌词滚动在位（transform=${st.scrollTf}）`);
}

ok(errors.length === 0, "P9 零 pageerror", errors.join(" | "));

console.log(`\n结果: ${passed} 通过 / ${failed} 失败`);
await browser.close();
process.exit(failed ? 1 : 0);
