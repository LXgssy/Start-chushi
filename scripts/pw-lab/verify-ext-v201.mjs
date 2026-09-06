import { chromium } from "playwright-core";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:http";

/* verify-ext-v201.mjs — v2.0.1 扩展冒烟：
 * 加载扩展 → 渲染 → manifest v2.0.1 + host_permissions（127.0.0.1:20754）→
 * 导入 .cshz → dock 音乐按钮 → 统一舞台弹出面板（预热+歌词态直开）→
 * 歌词/封面/进度（核心音乐引擎）→ 控制上行（DOM click）→ 收起键关面板 → pageerror=0 */

let mockState = { ok: true, name: "chushi-smtc-bridge", version: "1.3.0-mock", track: null };
let mockLyric = null;
const controlLog = [];
const PNG1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
);
function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Private-Network", "true");
}
const mock = createServer((req, res) => {
  cors(res);
  const u = new URL(req.url, "http://x");
  if (u.pathname === "/api/state") { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(mockState)); return; }
  if (u.pathname === "/api/cover") { res.writeHead(200, { "content-type": "image/png" }); res.end(PNG1PX); return; }
  if (u.pathname === "/api/lyric") {
    res.writeHead(200, { "content-type": "application/json" });
    if (mockLyric) res.end(JSON.stringify({ ok: true, rev: mockLyric.rev, lyric: mockLyric }));
    else res.end(JSON.stringify({ ok: false }));
    return;
  }
  if (u.pathname === "/api/control" && req.method === "POST") {
    let b = ""; req.on("data", (c) => (b += c));
    req.on("end", () => { try { controlLog.push(JSON.parse(b)); } catch {} res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ ok: true })); });
    return;
  }
  res.writeHead(404); res.end();
});
await new Promise((r) => mock.listen(20754, "127.0.0.1", r));

const extDir = mkdtempSync(tmpdir() + "/ext-v200-");
execSync(`unzip -qo /home/z/my-project/download/v2.0.1/ChuShi-NewTab-v2.0.1.zip -d ${extDir}`);
const mf = JSON.parse(readFileSync(extDir + "/manifest.json", "utf8"));
const m0ok = mf.version === "2.0.1" && mf.host_permissions.includes("http://127.0.0.1:20754/*");
console.log(m0ok ? "✓ M0 manifest v2.0.1 + host_permissions 含 127.0.0.1:20754" : "✗ M0 manifest 缺陷：" + JSON.stringify(mf.host_permissions));
rmSync("/tmp/ext-v200-profile", { recursive: true, force: true });

const browser = await chromium.launchPersistentContext("/tmp/ext-v200-profile", {
  headless: true,
  channel: "chromium",
  args: [`--headless=new`, `--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`],
});
const extId = createHash("sha256").update(extDir).digest("hex").slice(0, 32)
  .split("").map((c) => "abcdefghijklmnop"[parseInt(c, 16)]).join("");
const page0 = await browser.newPage();
const errors = [];
page0.on("pageerror", (e) => errors.push(String(e).slice(0, 120)));
await page0.goto(`chrome-extension://${extId}/index.html`, { waitUntil: "networkidle" });
await page0.waitForSelector(".clock-text", { timeout: 20000 });

const results = [m0ok];
const check = (n, ok, d = "") => { results.push(ok); console.log(`${ok ? "✓" : "✗"} ${n}${d ? " — " + d : ""}`); };
check("X1 渲染（时钟出现）", true);
check("X2 未导入前 dock 无音乐按钮", (await page0.locator(".cl-dock button[aria-label='音乐']").count()) === 0);

await page0.keyboard.press("Control+k");
await page0.waitForTimeout(800);
await page0.locator("[cmdk-item]").filter({ hasText: "导入预设" }).click();
await page0.waitForTimeout(500);
await page0.locator("input[type=file]").setInputFiles("/home/z/my-project/examples/初始SMTC音乐预设.cshz");
await page0.waitForTimeout(2600);
check("X3 .cshz 导入 + dock 音乐按钮", (await page0.locator(".cl-dock button[aria-label='音乐']").count()) === 1);
check("X4 统一舞台部件视图常驻预热", (await page0.locator(".cl-dockwidget").count()) === 1);
await page0.keyboard.press("Escape");
await page0.waitForTimeout(400);

mockLyric = {
  rev: "mock-lyr-1", songId: 186016, title: "晴天", artist: "周杰伦",
  yrc: "[41000,12000](41000,3000,0)刮(44000,3000,0)风(47000,3000,0)这(50000,3000,0)天\n[53000,12000](53000,3000,0)等(56000,3000,0)一(59000,3000,0)等(62000,3000,0)天\n",
  ytlrc: "[41000,12000](41000,12000,0)The wind blows today", lrc: "", tlyric: "", source: "mock",
};
mockState = {
  ok: true, name: "chushi-smtc-bridge", version: "1.3.0-mock",
  track: { app: "网易云音乐", title: "晴天", artist: "周杰伦", album: "叶惠美", playing: true, position: 0, duration: 0, rate: 1, coverRev: "rev-1" },
  ne: { songId: 186016, title: "晴天", artist: "周杰伦", album: "叶惠美", pic: "", positionMs: 42500, durationMs: 200000, playing: true, lyricRev: "mock-lyr-1" },
};
await page0.waitForTimeout(3400);
await page0.locator(".cl-dock button[aria-label='音乐']").click();
await page0.waitForTimeout(2800);
const wf = page0.frameLocator(".cl-dockwidget iframe").frameLocator("iframe[title='初始自定义小部件']");
const stageH = () => page0.locator(".cl-stage").evaluate((el) => el.getBoundingClientRect().height);
check("X5 面板高度 ≈372（歌词态直开）", Math.abs(await stageH() - 372) < 12, `h=${await stageH()}`);
check("X6 歌名", (await wf.locator("#t1").textContent()) === "晴天");
{
  const w = await wf.locator("#bar").evaluate((el) => parseFloat(el.style.width) || 0);
  check("X7 进度条 ≈21%（插件时钟兜底）", w > 19 && w < 24, `w=${w.toFixed(2)}%`);
}
check("X8 歌词行高亮", (await wf.locator("#ly .lyline.on").count()) === 1);
check("X9 逐字扫色（双层 clip-path，--p 已写）", (await wf.locator("#ly .lyw .ov").count()) >= 1 && (await wf.locator("#ly .lyline.on .lyw").first().evaluate((el) => el.style.getPropertyValue("--p"))).length > 0);
check("X10 SMTC 封面 dataURL", ((await wf.locator("#aF").getAttribute("src")) || "").startsWith("data:image/png"));
const b0 = controlLog.length;
await wf.locator("#pB").evaluate((el) => el.click());
await page0.waitForTimeout(700);
check("X11 toggle 到桥", controlLog.length > b0 && controlLog[controlLog.length - 1].cmd === "toggle");
await wf.locator("#cxB").evaluate((el) => el.click());
await page0.waitForTimeout(900);
check("X12 收起键关闭面板（舞台高度归零）", (await stageH()) < 2, `h=${await stageH()}`);
check("X13 pageerror = 0", errors.length === 0, errors.join(" | "));

await browser.close();
mock.close();
console.log(results.every(Boolean) ? `\n扩展冒烟 ${results.length} 项全过 ✓` : `\n${results.filter((x) => !x).length} 项失败 ✗`);
process.exit(results.every(Boolean) ? 0 : 1);
