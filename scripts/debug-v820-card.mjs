// 卡片可见性聚焦调试：elementFromPoint / 区域截图 / 内容脚本错误收集
import { chromium } from "playwright";
import crypto from "crypto";
import { spawn, execSync } from "child_process";
import { writeFileSync, mkdtempSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const ROOT = "/tmp/ext-stage";
const EXT_ID = (() => {
  const h = crypto.createHash("sha256").update(Buffer.from(ROOT)).digest("hex").slice(0, 32);
  return [...h].map(c => String.fromCharCode(97 + (parseInt(c, 16) % 26))).join("");
})();

const PROJ = "/home/z/my-project";
const hub = spawn(`${PROJ}/scripts/hubsim`, ["26901"], { stdio: "ignore" });
const spec = spawn(`${PROJ}/scripts/spectrumsim`, ["26911"], { stdio: "ignore" });
const pageDir = mkdtempSync(join(tmpdir(), "cardpage-"));
writeFileSync(join(pageDir, "index.html"),
  "<!doctype html><html><head><title>CardTestPage</title></head><body style='height:2000px'><h1>ABC test</h1></body></html>");
const http = spawn("python3", ["-m", "http.server", "26988", "--bind", "127.0.0.1"], { cwd: pageDir, stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
process.on("exit", () => { for (const p of [hub, spec, http]) { try { p.kill("SIGKILL"); } catch {} } });

mkdirSync("/tmp/ext-profile-dbg", { recursive: true });
const browser = await chromium.launchPersistentContext("/tmp/ext-profile-dbg", {
  channel: "chromium",
  headless: false,
  args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`, "--no-first-run", "--disable-gpu"],
});
const p2 = await browser.newPage();
const errs = [];
p2.on("pageerror", e => errs.push("pe: " + e.message));
p2.on("console", m => { if (m.type() === "error" || m.type() === "warning") errs.push(m.type() + ": " + m.text()); });

setInterval(() => {
  const body = JSON.stringify({ ne: { title: "Debug Song", artist: "dbg", album: "A", songId: 7, playing: true, position: (Date.now() / 1000) % 200, duration: 300, ts: Date.now(), v: "8.1.3", pic: "" }, ts: Date.now(), who: "dbg", lease: "holder" });
  try { execSync(`curl -s -X POST http://127.0.0.1:26901/api/state -d '${body}' >/dev/null 2>&1`, { timeout: 2000 }); } catch {}
}, 1000);

await p2.goto("http://127.0.0.1:26988/index.html", { waitUntil: "load" });
await sleep(3500);

const probe = await p2.evaluate(() => {
  const h = document.getElementById("chushi-card-host");
  const out = { hostExists: !!h, display: h ? getComputedStyle(h).display : "", html: document.body.innerHTML.slice(0, 200) };
  if (h) {
    const r = h.getBoundingClientRect();
    out.rect = { x: r.x, y: r.y, w: r.width, h: r.height };
    // 命中测试：卡片默认位置（innerWidth-296+130, 76+22）
    const cx = Math.max(12, window.innerWidth - 296) + 130, cy = 98;
    const hit = document.elementFromPoint(cx, cy);
    out.hitAt = { cx, cy, tag: hit ? hit.tagName + "#" + (hit.id || "") : "null", isHost: hit === h };
  }
  return out;
});
console.log("PROBE:", JSON.stringify(probe, null, 2));
const cw = 1280, ch = 720;
await p2.screenshot({ path: `${PROJ}/scripts/pw-lab/shots/v820-card-dbg-full.png` });
console.log("ERRORS:", errs.slice(0, 10));
await browser.close();
process.exit(0);
