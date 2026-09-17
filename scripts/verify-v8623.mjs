// v8.6.23 像素级验证：磨砂写入底层——纱罩开合动画期间磨砂全程在线（不闪纯色底）
// 判据（blur-selftest 同源）：壁纸细节区相邻像素差分能量——清晰=高，磨砂=低。
// 旧病：纱罩自身 opacity 淡入淡出期间 backdrop-filter 死亡 → 中途帧能量≈清晰参照。
// 新律：blur 值通道 1px↔28px 全程在线 → 中途帧能量远低于清晰参照。
import { chromium } from "playwright-core";
import crypto from "crypto";
import { execSync, spawn } from "child_process";
import { mkdirSync, rmSync, writeFileSync, readFileSync, statSync } from "fs";

let sharp = null;
try { sharp = (await import("sharp")).default; } catch {}
if (!sharp) { console.log("NO_SHARP"); process.exit(2); }

const ROOT = "/tmp/v8623-verify-ext";
const ZIP = "/tmp/my-project/download/v8.6.23/ChuShi-NewTab-v8.6.23.zip";
const MOCK = "/tmp/v8623-verify-mock";
const PORT = 26998;
const FRAMES = "/tmp/v8623-frames";
const REGION = { x: 40, y: 60, width: 320, height: 220 }; // 左缘纯壁纸区（内容列 x∈[192,1088] 之外）

rmSync(ROOT, { recursive: true, force: true });
rmSync(MOCK, { recursive: true, force: true });
rmSync("/tmp/v8623-verify-profile", { recursive: true, force: true });
mkdirSync(ROOT, { recursive: true });
mkdirSync(MOCK, { recursive: true });
mkdirSync(FRAMES, { recursive: true });
execSync(`cd ${ROOT} && unzip -o -q ${ZIP}`);

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
  v: "8.6.23", files: [{ p: "index.html", s: statSync(MOCK + "/index.html").size }],
}));
const httpSrv = spawn("python3", ["-m", "http.server", String(PORT)], { cwd: MOCK, stdio: "ignore" });
process.on("exit", () => { try { httpSrv.kill(); } catch { } });

// 高频细节壁纸：16px 棋盘四色（清晰能量极高，blur28 后能量塌缩）
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800">
<defs><pattern id="c" width="32" height="32" patternUnits="userSpaceOnUse">
<rect width="16" height="16" fill="#2f6f3f"/><rect x="16" width="16" height="16" fill="#7fc46a"/>
<rect y="16" width="16" height="16" fill="#245c8a"/><rect x="16" y="16" width="16" height="16" fill="#1a3a1a"/>
</pattern></defs><rect width="1280" height="800" fill="url(#c)"/></svg>`;
const WALLPAPER = "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64");

const EXT_ID = (() => {
  const h = crypto.createHash("sha256").update(Buffer.from(ROOT)).digest("hex").slice(0, 32);
  return [...h].map((c) => String.fromCharCode(97 + (parseInt(c, 16) % 26))).join("");
})();
const EXT_URL = (p) => `chrome-extension://${EXT_ID}/${p}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launchPersistentContext("/tmp/v8623-verify-profile", {
  channel: "chromium", headless: true,
  args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`,
    "--no-first-run", "--no-sandbox"],
});
process.on("exit", () => { try { browser.close(); httpSrv.kill(); } catch { } });

let pass = 0, fail = 0;
const gate = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`  [PASS] ${name}${detail ? " — " + detail : ""}`); }
  else { fail++; console.log(`  [FAIL] ${name}${detail ? " — " + detail : ""}`); }
};

const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

/* 播种：掠影 + 高频壁纸 + 抽屉形态（幂等合并，缺失才补基线） */
await page.addInitScript((wp) => {
  const raw = JSON.parse(localStorage.getItem("start:settings") || "{}");
  raw.background = "photo";
  raw.photoId = "custom";
  raw.wallpaperUrl = wp;
  raw.wallpaperRev = 7;
  raw.linksForm = "drawer";
  localStorage.setItem("start:settings", JSON.stringify(raw));
}, WALLPAPER);

await page.goto(EXT_URL("shell.html"), { waitUntil: "load", timeout: 20000 });
await page.waitForFunction(() => {
  const f = document.getElementById("csShellFrame");
  return f && f.src && f.src.endsWith("index.html");
}, { timeout: 8000 }).catch(() => null);
const af = page.frames().find((f) => f !== page.mainFrame() && /\/index\.html$/.test(f.url()));
const booted = af && await af.waitForFunction(() => document.body && document.body.children.length > 0,
  { timeout: 15000 }).then(() => true).catch(() => false);
gate("T0 应用启动", !!booted, booted ? "app frame ready" : "app frame missing");
if (!booted) { console.log(`\n===== verify: ${pass} PASS / ${fail} FAIL =====`); process.exit(1); }

await sleep(2200); // 等壁纸 img 加载 + boot 幕布揭开 + 入场动画走完

async function energy(tag) {
  const buf = await page.screenshot({ clip: REGION });
  if (tag) writeFileSync(`${FRAMES}/${tag}.png`, buf);
  const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, C = info.channels;
  let sum = 0, n = 0;
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = (y * W + x) * C;
      const iR = (y * W + x + 1) * C, iD = ((y + 1) * W + x) * C;
      sum += Math.abs(data[i] - data[iR]) + Math.abs(data[i] - data[iD]); n++;
    }
  }
  return sum / n;
}

/* 参照：闭态清晰壁纸（连 3 张取中位） */
const closedShots = [];
for (let i = 0; i < 3; i++) { closedShots.push(await energy(`closed-${i}`)); await sleep(60); }
closedShots.sort((a, b) => a - b);
const eClosed = closedShots[1];
gate("T1 闭态参照为高频细节壁纸", eClosed > 4, `energy=${eClosed.toFixed(2)}`);

const midOpen = [], midClose = [];
let eSteady = null;
let struct = null;
for (let trial = 0; trial < 3; trial++) {
  await page.mouse.click(90, 620, { button: "middle" }); // 开
  for (let i = 0; i < 3; i++) midOpen.push(await energy(`open-t${trial}-f${i}`));
  await sleep(700);
  if (trial === 0) {
    eSteady = await energy("open-steady");
    /* 结构抽检须趁 portal 在场（latch 卸载前）：稳态开纱罩 computed blur=28px + data-veil=1 */
    struct = await af.evaluate(() => {
      const v = document.querySelector(".cl-drawer-veil");
      if (!v) return null;
      const cs = getComputedStyle(v);
      return { bf: cs.backdropFilter, veil: v.getAttribute("data-veil"), vis: cs.visibility };
    });
  }
  await page.mouse.click(90, 620, { button: "middle" }); // 关
  for (let i = 0; i < 3; i++) midClose.push(await energy(`close-t${trial}-f${i}`));
  await sleep(900);
}
const minOpen = Math.min(...midOpen);
const minClose = Math.min(...midClose);
const TH = eClosed * 0.55; // blur28 对 16px 棋盘的能量塌缩远超 45%（清晰≈磨砂 3 倍以上）
console.log(`[curve] closed=${eClosed.toFixed(2)} openMid(min)=${minOpen.toFixed(2)} steady=${eSteady?.toFixed(2)} closeMid(min)=${minClose.toFixed(2)} TH=${TH.toFixed(2)}`);
gate("T2 开抽屉中途帧磨砂在线（能量塌缩）", minOpen < TH,
  `minOpen=${minOpen.toFixed(2)} < ${TH.toFixed(2)} (closed×0.55)`);
gate("T3 开态稳态磨砂在线", eSteady !== null && eSteady < TH, `steady=${eSteady?.toFixed(2)}`);
gate("T4 关抽屉中途帧磨砂在线（blur 收拢通道）", minClose < TH,
  `minClose=${minClose.toFixed(2)} < ${TH.toFixed(2)}`);

gate("T5 稳态开纱罩结构（data-veil=1 + blur28 + visible）",
  !!struct && /blur\(28px\)/.test(struct.bf) && struct.veil === "1" && struct.vis === "visible",
  JSON.stringify(struct));
gate("T6 pageerror=0", errors.length === 0, errors.join(" | ").slice(0, 120));

console.log(`\n===== v8.6.23 verify: ${pass} PASS / ${fail} FAIL =====`);
console.log("帧留档:", FRAMES);
await browser.close();
process.exit(fail ? 1 : 0);
