import { chromium } from "playwright-core";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:http";

/* verify-ext-v180.mjs — v1.8.0 扩展冒烟：
 * 加载扩展 → 渲染 → dock 无音乐按钮 → 导入 SMTC 预设 → 磁贴显示歌曲 →
 * chushi.smtc.control 上行到桥 + 按钮 DOM click → toggle 到桥 → pageerror=0
 * 注：Playwright 鼠标事件在嵌套 srcdoc frame 有丢失先例，控制验证用 DOM click。 */

let mockState = { ok: true, name: "chushi-smtc-bridge", version: "1.0.0-mock", track: null };
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
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
  if (u.pathname === "/api/state") { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(mockState)); return; }
  if (u.pathname === "/api/cover") { res.writeHead(200, { "content-type": "image/png" }); res.end(PNG1PX); return; }
  if (u.pathname === "/api/control" && req.method === "POST") {
    let b = ""; req.on("data", (c) => (b += c));
    req.on("end", () => { try { controlLog.push(JSON.parse(b)); } catch {} res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ ok: true })); });
    return;
  }
  res.writeHead(404); res.end();
});
await new Promise((r) => mock.listen(20754, "127.0.0.1", r));

/* 解包扩展 */
const extDir = mkdtempSync(tmpdir() + "/ext-v180-");
execSync(`unzip -qo /home/z/my-project/download/v1.8.0/ChuShi-NewTab-v1.8.0.zip -d ${extDir}`);
rmSync("/tmp/ext-v180-profile", { recursive: true, force: true }); // profile 先清律

const browser = await chromium.launchPersistentContext("/tmp/ext-v180-profile", {
  headless: true,
  channel: "chromium",
  args: [`--headless=new`, `--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`],
});
/* 未打包扩展 ID = sha256(路径) hex → a-p 字母映射（Chromium 规则） */
const extId = createHash("sha256").update(extDir).digest("hex").slice(0, 32)
  .split("").map((c) => "abcdefghijklmnop"[parseInt(c, 16)]).join("");
const page0 = await browser.newPage();
const errors = [];
page0.on("pageerror", (e) => errors.push(String(e).slice(0, 120)));
await page0.goto(`chrome-extension://${extId}/index.html`, { waitUntil: "networkidle" });
await page0.waitForSelector(".clock-text", { timeout: 20000 });

const results = [];
const check = (n, ok, d = "") => { results.push(ok); console.log(`${ok ? "✓" : "✗"} ${n}${d ? " — " + d : ""}`); };

check("X1 渲染（时钟出现）", true);
check("X2 dock 无音乐按钮", (await page0.locator(".cl-dock button[aria-label='音乐']").count()) === 0);

/* 导入 SMTC 预设 */
const presetJson = readFileSync("/home/z/my-project/examples/初始SMTC音乐预设.json", "utf8");
await page0.keyboard.press("Control+k");
await page0.waitForTimeout(800);
await page0.locator("[cmdk-item]").filter({ hasText: "导入预设" }).click();
await page0.waitForTimeout(500);
await page0.locator("textarea").first().fill(presetJson);
await page0.getByRole("button", { name: "导入", exact: true }).click();
await page0.waitForTimeout(2500);
check("X3 widget 挂载", (await page0.locator(".cl-widget").count()) === 1);

const wFrame = page0.frameLocator(".cl-widget iframe").frameLocator("iframe[title='初始自定义小部件']");
mockState = { ...mockState, track: { app: "网易云音乐", title: "扩展冒烟曲", artist: "测试", album: "", playing: true, position: 10, duration: 200, rate: 1, coverRev: "r1" } };
await page0.waitForTimeout(3000);
check("X4 磁贴显示歌曲（订阅/推送链路）", (await wFrame.locator("#t1s").textContent()) === "扩展冒烟曲");

/* 控制链：srcdoc 内 chushi.smtc.control + 按钮 DOM click */
const srcdoc = page0.frames().find((f) => f.url() === "about:srcdoc" && f.parentFrame()?.url().includes("mode=widget"));
check("X5a srcdoc frame 可达", Boolean(srcdoc));
if (srcdoc) {
  const probe = await srcdoc.evaluate(() => {
    const out = { hasSmtc: typeof window.chushi?.smtc?.control === "function" };
    try { window.chushi.smtc.control("toggle"); out.called = true; } catch (e) { out.err = String(e).slice(0, 80); }
    return out;
  });
  await page0.waitForTimeout(800);
  check("X5b chushi.smtc.control 上行→桥", probe.called === true && controlLog.some((c) => c.cmd === "toggle"), JSON.stringify(probe));
  await srcdoc.evaluate(() => document.getElementById("pS0").click());
  await page0.waitForTimeout(800);
  check("X5c 按钮点击 → toggle 到桥", controlLog.filter((c) => c.cmd === "toggle").length >= 2);
}
check("X6 pageerror = 0", errors.length === 0, errors.join("|"));

await browser.close();
mock.close();
rmSync(extDir, { recursive: true, force: true });
const fail = results.filter((x) => !x).length;
console.log(fail === 0 ? `\n扩展冒烟 ${results.length} 项全过 ✓` : `\n${fail} 项失败 ✗`);
process.exit(fail ? 1 : 0);
