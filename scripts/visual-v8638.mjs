// v8.6.38 像素目检：dock 面板关闭「材质恒定·原样收折」CSS 定格台（Task 138 定格台同思路）
//   A: 面板展开稳定态（对照材质基准）
//   B: 定格收折中段（手动 .panel-sink + 高度盒 64px）——应为与 A 同材质的矮板，无亮/暗带
//   C: 真实关闭完成后——面板区零残留（纯壁纸）
import { chromium } from "playwright-core";
import crypto from "crypto";
import { execSync, spawn } from "child_process";
import { mkdirSync, rmSync, writeFileSync, readFileSync, statSync } from "fs";

const ROOT = "/tmp/ext-v869";
const ZIP = "/tmp/my-project/download/v8.6.38/ChuShi-NewTab-v8.6.38.zip";
const MOCK = "/tmp/v869-mock";
const PORT = 26998;
const SHOTS = "/tmp/v8638-visual";

rmSync(ROOT, { recursive: true, force: true });
rmSync("/tmp/ext-v869-profile", { recursive: true, force: true });
mkdirSync(ROOT, { recursive: true });
mkdirSync(SHOTS, { recursive: true });
execSync(`cd ${ROOT} && unzip -o -q ${ZIP}`);
console.log("stage: 扩展解包 ->", ROOT);

const bgPath = ROOT + "/ext-bg.js";
writeFileSync(bgPath, readFileSync(bgPath, "utf-8").replace(
  'const SNAP_MIRRORS = ["https://lxgssy.github.io/Start-chushi"];',
  `const SNAP_MIRRORS = ["http://127.0.0.1:${PORT}"];`));
const appHits = execSync(`grep -rl "lxgssy.github.io/Start-chushi/version.json" ${ROOT} 2>/dev/null || true`)
  .toString().trim().split("\n").filter(Boolean);
for (const f of appHits) {
  writeFileSync(f, readFileSync(f, "utf-8").replaceAll(
    "https://lxgssy.github.io/Start-chushi/version.json", `http://127.0.0.1:${PORT}/version.json`));
}
writeFileSync(MOCK + "/index.html", `<!DOCTYPE html><html><body>ok</body></html>`);
writeFileSync(MOCK + "/version.json", JSON.stringify({
  v: "8.6.38", files: [{ p: "index.html", s: statSync(MOCK + "/index.html").size }],
}));
const httpSrv = spawn("python3", ["-m", "http.server", String(PORT)], { cwd: MOCK, stdio: "ignore" });
process.on("exit", () => { try { browser.close(); httpSrv.kill(); } catch { } });
console.log("stage: mock 镜像就绪");

const browser = await chromium.launchPersistentContext("/tmp/ext-v869-profile", {
  channel: "chromium", headless: true,
  args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`,
    "--no-first-run", "--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

const EXT_ID = (() => {
  const h = crypto.createHash("sha256").update(Buffer.from(ROOT)).digest("hex").slice(0, 32);
  return [...h].map((c) => String.fromCharCode(97 + (parseInt(c, 16) % 26))).join("");
})();
const EXT_URL = (p) => `chrome-extension://${EXT_ID}/${p}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function bootNewTab(pg) {
  await pg.goto(EXT_URL("shell.html"), { waitUntil: "load", timeout: 20000 });
  await pg.waitForFunction(() => {
    const f = document.getElementById("csShellFrame");
    return f && f.src && f.src.endsWith("index.html");
  }, { timeout: 8000 }).catch(() => null);
  const af = pg.frames().find((f) => f !== pg.mainFrame() && /\/index\.html$/.test(f.url()));
  const ok = af && await af.waitForFunction(() => document.body && document.body.children.length > 0,
    { timeout: 15000 }).then(() => true).catch(() => false);
  return ok ? af : null;
}

let af = await bootNewTab(page);
if (!af) throw new Error("boot 失败");
console.log("stage: 新标签页 boot");
await sleep(2500);

/* A: 展开稳定态 */
await af.evaluate(() => { document.querySelectorAll(".dock-btn")[0].click(); });
await sleep(900);
const geo = await af.evaluate(() => {
  const card = document.querySelector(".glass-card.cl-panel");
  const r = card.getBoundingClientRect();
  return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
});
console.log("A 面板几何:", JSON.stringify(geo));
await page.screenshot({ path: SHOTS + "/A-open.png" });

/* B: 定格收折中段——手动 .panel-sink + 高度盒 64px（材质冻结态=任意高度的真实收折样貌） */
await af.evaluate(() => {
  const shell = document.querySelector(".cl-stage");
  const card = document.querySelector(".glass-card.cl-panel");
  shell.classList.add("panel-sink");
  const box = card.parentElement; /* 高度盒（framer animate height 载体） */
  box.style.height = "64px";
  const cs = getComputedStyle(card);
  window.__v8638 = {
    shellCls: shell.className,
    boxH: box.style.height,
    op: cs.opacity, bg: cs.backgroundColor, bf: cs.backdropFilter,
    cardH: Math.round(card.getBoundingClientRect().height),
  };
});
await new Promise((r) => setTimeout(r, 350)); /* .panel-sink 0.22s forwards 走完定格末帧 */
const frozen = await af.evaluate(() => window.__v8638);
console.log("B 定格态:", JSON.stringify(frozen));
await page.screenshot({ path: SHOTS + "/B-frozen-64px.png" });

/* C: 真实关闭完成后——零残留 */
af = await bootNewTab(page);
if (!af) throw new Error("二次 boot 失败");
await sleep(2500);
await af.evaluate(() => { document.querySelectorAll(".dock-btn")[0].click(); });
await sleep(900);
await af.evaluate(() => { document.querySelectorAll(".dock-btn")[0].click(); });
await sleep(700); /* SINK_MS+margin */
const residue = await af.evaluate(() => !!document.querySelector(".glass-card.cl-panel"));
console.log("C 关闭后卡片残留:", residue);
await page.screenshot({ path: SHOTS + "/C-closed.png" });

console.log("done ->", SHOTS);
try { await browser.close(); } catch { }
httpSrv.kill();
process.exit(0);
