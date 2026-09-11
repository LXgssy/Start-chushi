// 探针：面板 iframe 里 height 过渡是否插值（直查 computed duration + 手动 toggle 高频采样）
import { chromium } from "playwright-core";
import { execSync } from "child_process";
import { readFileSync, writeFileSync, mkdtempSync, cpSync } from "fs";
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
const srv = mkdtempSync(join(tmpdir(), "probe-"));
cpSync(join(STAGE, "sandbox.html"), join(srv, "sandbox.html"));
cpSync(join(STAGE, "sandbox.js"), join(srv, "sandbox.js"));
const hostHtml = `<!doctype html><html><body style="margin:0">
<iframe id="w" sandbox="allow-scripts" src="sandbox.html?mode=widget"
  style="position:fixed;left:10px;top:10px;width:380px;height:520px;border:0"></iframe>
<script>window.__WIDGET_HTML = ${JSON.stringify(widgetHtml).replace(/<\//g, "<\\/")};</script>
<script>
window.addEventListener("message", function (ev) {
  var d = ev.data;
  if (d && d.type === "hello") {
    document.getElementById("w").contentWindow.postMessage({
      type: "renderWidget", key: "t:widget",
      html: window.__WIDGET_HTML, theme: "light", accent: "#22d3ee"
    }, "*");
  }
});
</script></body></html>`;
writeFileSync(join(srv, "host.html"), hostHtml);
const http = spawn("python3", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1"], { cwd: srv, stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
process.on("exit", () => { try { http.kill("SIGKILL"); } catch { } });

const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`,
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 420, height: 560 } });
await page.goto(`http://127.0.0.1:${PORT}/host.html`, { waitUntil: "load" });
await sleep(900);
const fr = () => page.frames().find((f) => f.url() === "about:srcdoc");

/* 不走 sandbox 数据链——直接在部件 DOM 里造两行带 subw 的行，手动 toggle */
const r = await fr().evaluate(async () => {
  const lyInr = document.getElementById("csLyrIn");
  if (!lyInr) return { err: "no csLyrIn" };
  lyInr.innerHTML = "";
  const mk = (on) => {
    const row = document.createElement("div");
    row.className = "cs-ln" + (on ? " on" : "");
    row.textContent = "测试行";
    const subw = document.createElement("div");
    subw.className = "cs-subw";
    const sub = document.createElement("div");
    sub.className = "cs-sub";
    sub.textContent = "翻译文本";
    subw.appendChild(sub);
    row.appendChild(subw);
    lyInr.appendChild(row);
    return row;
  };
  const row = mk(false);
  /* 强制首帧 computed（旧值 0） */
  row.getBoundingClientRect();
  await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
  const cs0 = getComputedStyle(row.querySelector(".cs-subw"));
  const before = { h: cs0.height, dur: cs0.transitionDuration, prop: cs0.transitionProperty, timing: cs0.transitionTimingFunction };
  row.classList.add("on"); /* 触发 0→17 过渡 */
  const seq = [];
  const t0 = performance.now();
  while (performance.now() - t0 < 450) {
    seq.push(row.querySelector(".cs-subw").offsetHeight);
    await new Promise((res) => setTimeout(res, 16));
  }
  const cs1 = getComputedStyle(row.querySelector(".cs-subw"));
  const anims = row.querySelector(".cs-subw").getAnimations().map((a) => ({
    type: a.constructor.name, state: a.playState,
    t: a.currentTime, dur: a.effect ? a.effect.getTiming().duration : null,
  }));
  const sheetHit = [...document.styleSheets].some((s) => {
    try { return [...s.cssRules].some((r2) => r2.selectorText === ".cs-ln.on .cs-subw"); }
    catch (e) { return false; }
  });
  return { before, seq: [...new Set(seq)], after: { h: cs1.height, op: cs1.opacity }, anims, sheetHit };
});
console.log(JSON.stringify(r, null, 1));
await browser.close();
process.exit(0);
