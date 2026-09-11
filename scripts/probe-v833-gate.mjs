// 门行为探针：直接读 chushi.music.now(true) 的输出轨迹
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
const srv = mkdtempSync(join(tmpdir(), "v833-probe-"));
cpSync(join(STAGE, "sandbox.html"), join(srv, "sandbox.html"));
cpSync(join(STAGE, "sandbox.js"), join(srv, "sandbox.js"));
writeFileSync(join(srv, "host.html"), `<!doctype html><html><body style="margin:0">
<iframe id="w" sandbox="allow-scripts" src="sandbox.html?mode=widget" style="width:380px;height:460px;border:0"></iframe>
<script>window.__WIDGET_HTML = ${JSON.stringify(unpackHtml(CSHZ)).replace(/<\//g, "<\\/")};</script>
<script>window.addEventListener("message", function (ev) {
  var d = ev.data;
  if (d && d.type === "hello") document.getElementById("w").contentWindow.postMessage({
    type: "renderWidget", key: "t:widget", html: window.__WIDGET_HTML, theme: "light", accent: "#22d3ee" }, "*");
});</script></body></html>`);
const http = spawn("python3", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1"], { cwd: srv, stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
process.on("exit", () => { try { http.kill("SIGKILL"); } catch {} });

const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`,
  args: ["--no-sandbox"] });
const page = await browser.newPage();
page.on("console", (m) => { if (m.text().startsWith("[gate]")) console.log("  ", m.text()); });
await page.goto(`http://127.0.0.1:${PORT}/host.html`, { waitUntil: "load" });
await sleep(900);

const lrc = [0, 1, 2, 3, 4, 5].map((i) => {
  const s = i * 3; const mm = String(Math.floor(s / 60)).padStart(2, "0"); const ss = String(s % 60).padStart(2, "0");
  return `[${mm}:${ss}.000]第${i + 1}句歌词测试行`; }).join("\n");
let seq = 0;
async function feed(position) {
  await page.evaluate(({ position, n, lrc }) => {
    document.getElementById("w").contentWindow.postMessage({
      type: "widgetSmtc", seq: n,
      state: { connected: true, track: { title: "门探针曲", artist: "e", album: "a", app: "NCM",
        playing: true, position, duration: 300, songId: 42, fetchedAt: Date.now() },
        cover: "", coverUrl: "", pluginVer: "8.3.1", smtcVer: "3", needsUpdate: false,
        needsBridge: false, engineOld: false, seekNote: "", cmdLast: null,
        lyricRev: "r1", lyric: { songId: 42, lrc, tlyric: "" } } }, "*");
  }, { position, n: ++seq, lrc });
}
const probe = () => page.frames().find((f) => f.url() === "about:srcdoc").evaluate(() => {
  try {
    const n = window.chushi.music.now(true);
    let g = null;
    try { g = window.chushi.music.__gdbg(); } catch (e) { g = { err: String(e) }; }
    return { li: n.lineIndex, pos: +n.position.toFixed(2), g };
  } catch (e) { return { err: String(e) }; }
});

await feed(7.0);
await sleep(1300);
console.log("落位:", JSON.stringify(await probe()));
await feed(5.5); await sleep(140);
console.log("beat1(熔断拒收预期):", JSON.stringify(await probe()));
await feed(5.5);
for (let i = 0; i < 16; i++) {
  const r = await probe();
  console.log(`t+${i * 90}ms`, JSON.stringify(r));
  await sleep(90);
}
await browser.close();
