import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/* verify-v182.mjs — v1.8.2 预设 widget surface:"dock"：tab 栏音乐按钮 + 弹出面板
 * P  .cshz 导入 → dock 按钮（surface:dock）出现，角落磁贴消失
 * M  弹出面板：高度弹簧 92→248 / panel 形态直开展开卡 / 默认唱片 / 真封面
 * C  面板内控制（toggle/seek 上行）/ 收起键 chushi.close() 关面板
 * O  开关语义：再点按钮 / 外部点击 / Escape 关闭；dock 按钮 active 选框
 * X  与内建面板互斥（开 todo 关音乐弹层；开音乐弹层关 todo）
 * K  ⌘K 媒体命令（脚本通道）回归
 * S  scrollbar-gutter + 磁贴删除回归
 * E  pageerror = 0
 */

const ROOT = "/home/z/my-project/out";
const MIME = {
  ".html": "text/html", ".js": "application/javascript", ".css": "text/css",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
  ".woff2": "font/woff2", ".ico": "image/x-icon", ".txt": "text/plain",
};

let mockState = {
  ok: true, name: "chushi-smtc-bridge", version: "1.1.0-mock", track: null,
};
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
  if (u.pathname === "/api/ping") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, name: "chushi-smtc-bridge", version: "1.1.0-mock" }));
    return;
  }
  if (u.pathname === "/api/state") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(mockState));
    return;
  }
  if (u.pathname === "/api/cover") {
    res.writeHead(200, { "content-type": "image/png" });
    res.end(PNG1PX);
    return;
  }
  if (u.pathname === "/api/control" && req.method === "POST") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      try { controlLog.push(JSON.parse(body)); } catch { controlLog.push({ raw: body }); }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });
    return;
  }
  res.writeHead(404); res.end();
});
await new Promise((r) => mock.listen(20754, "127.0.0.1", r));

const server = createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  p = p.replace(/^\/Start-chushi/, "") || "/";
  if (p.endsWith("/")) p += "index.html";
  let f = join(ROOT, p);
  if (!existsSync(f)) f = join(ROOT, "index.html");
  try {
    const body = readFileSync(f);
    const ext = f.slice(f.lastIndexOf("."));
    res.writeHead(200, { "content-type": MIME[ext] ?? "application/octet-stream" });
    res.end(body);
  } catch { res.writeHead(404); res.end("nf"); }
});
await new Promise((r) => server.listen(4632, r));

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 915 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.addInitScript(() => {
  try {
    localStorage.clear();
    localStorage.setItem("start:settings", JSON.stringify({ themeMode: "dark" }));
  } catch (e) {}
});
await page.goto("http://localhost:4632/", { waitUntil: "networkidle" });
await page.waitForSelector(".clock-text", { timeout: 15000 });

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
}
const dockMusicBtn = page.locator(".cl-dock button[aria-label='音乐']");
const popup = page.locator(".cl-dockwidget");

/* ---------- P 导入与 dock 注册 ---------- */
await page.keyboard.press("Control+k");
await page.waitForTimeout(800);
await page.locator("[cmdk-item]").filter({ hasText: "导入预设" }).click();
await page.waitForTimeout(600);
await page.locator("input[type=file]").setInputFiles("/home/z/my-project/examples/初始SMTC音乐预设.cshz");
await page.waitForTimeout(1500);
check("P1 .cshz 导入无错误", (await page.locator("text=/错误|必须|缺失|不支持/").count()) === 0);
check("P2 dock 音乐按钮出现", (await dockMusicBtn.count()) === 1);
check("P3 角落磁贴不再渲染（surface=dock）", (await page.locator(".cl-widget[data-widget]").count()) === 0);
await page.keyboard.press("Escape");
await page.waitForTimeout(400);

/* ---------- M1 空态弹出（高度 ≈92）---------- */
await dockMusicBtn.click();
await popup.waitFor({ timeout: 4000 });
check("O1 点击按钮弹出面板", (await popup.count()) === 1);
check("O2 dock 按钮 active 选框", (await dockMusicBtn.getAttribute("data-active")) === "true");
const wFrame = page.frameLocator(".cl-dockwidget iframe").frameLocator("iframe[title='初始自定义小部件']");
await wFrame.locator("#card").waitFor({ timeout: 8000 });
await page.waitForTimeout(2200); // 等 smtc 首拍 + resize + 弹簧稳定
const h0 = await popup.evaluate((el) => el.getBoundingClientRect().height);
check("M1 空态面板高度 ≈92", Math.abs(h0 - 92) < 8, `h=${h0}`);
check("M1b 空态文案（已连接无会话）", (await wFrame.locator("#e1").textContent()) === "等待媒体会话");
check("M1c dataset.panel 已置（panel 形态）", await wFrame.locator("html[data-panel='1']").count() === 1);

/* ---------- O 关闭语义 ---------- */
await page.keyboard.press("Escape"); // Esc 关弹层
await page.waitForTimeout(900);
check("O3 Escape 关闭弹层", (await popup.count()) === 0);
check("O3b active 选框退场", (await dockMusicBtn.getAttribute("data-active")) == null);
await dockMusicBtn.click(); // 重开，测外部点击
await popup.waitFor({ timeout: 4000 });
await page.waitForTimeout(1500);
await page.mouse.click(640, 160); // 点击页面远端（弹层与 dock 之外）
await page.waitForTimeout(900);
check("O4 外部点击关闭弹层", (await popup.count()) === 0);

/* ---------- M2 播放态弹出（直开展开卡 248）---------- */
mockState = {
  ...mockState,
  track: {
    app: "网易云音乐", title: "晴天", artist: "周杰伦", album: "叶惠美",
    playing: true, position: 42.5, duration: 269.3, rate: 1,
    coverRev: "",
  },
};
await page.waitForTimeout(2400); // 等 smtc 推送
await dockMusicBtn.click();
await popup.waitFor({ timeout: 4000 });
const wFrame2 = page.frameLocator(".cl-dockwidget iframe").frameLocator("iframe[title='初始自定义小部件']");
await wFrame2.locator("#card").waitFor({ timeout: 8000 });
await page.waitForTimeout(2600); // resize(340,248) + 弹簧
const h1 = await popup.evaluate((el) => el.getBoundingClientRect().height);
check("M2 面板高度 ≈248（展开卡直开）", Math.abs(h1 - 248) < 8, `h=${h1}`);
check("M2b card 为 mode-fl（跳过紧凑条）", (await wFrame2.locator("#card").getAttribute("class")).includes("mode-fl"));
check("M2c 大卡歌名", (await wFrame2.locator("#t1f").textContent()) === "晴天");
check("M2d 大卡专辑行", (await wFrame2.locator("#t3f").textContent()) === "叶惠美");
check("M2e footer 来源", (await wFrame2.locator("#ap").textContent()) === "已连接 · 网易云音乐");
check("M2f 播放光晕在卡内", (await wFrame2.locator("#fl .glow").count()) === 1);
check("M2g 默认唱片资产(svg)", (await wFrame2.locator("#aF").getAttribute("src"))?.startsWith("data:image/svg+xml") === true);

/* ---------- C 面板内控制 + 封面 + 收起键 ---------- */
mockState = { ...mockState, track: { ...mockState.track, coverRev: "mock-rev-1" } };
await page.waitForTimeout(2600);
check("C1 真封面 data URL 到位", (await wFrame2.locator("#aF").getAttribute("src"))?.startsWith("data:image/png") === true);
const before = controlLog.length;
await wFrame2.locator("#pF0").click();
await page.waitForTimeout(700);
check("C2 面板播放/暂停 → toggle 到桥", controlLog.length > before && controlLog[controlLog.length - 1].cmd === "toggle");
const seekBox = await wFrame2.locator("#sk").boundingBox();
await page.mouse.move(seekBox.x + seekBox.width * 0.5, seekBox.y + seekBox.height / 2);
await page.mouse.down();
await page.mouse.up();
await page.waitForTimeout(500);
check("C3 seek 命令到桥", controlLog.some((c) => c.cmd === "seek" && typeof c.position === "number"));
await wFrame2.locator("#cxB").click(); // 收起键 = chushi.close() 关面板
await page.waitForTimeout(1000);
check("C4 收起键关闭弹出面板", (await popup.count()) === 0);

/* ---------- X 与内建面板互斥 ---------- */
await page.locator(".cl-dock button[aria-label='待办']").click();
await page.waitForTimeout(900);
check("X1 内建待办面板打开", (await page.locator("[data-panel='todo']").count()) === 1);
await dockMusicBtn.click();
await page.waitForTimeout(900);
check("X2 开音乐弹层收起内建面板", (await page.locator("[data-panel='todo']").count()) === 0 && (await popup.count()) === 1);
await page.locator(".cl-dock button[aria-label='待办']").click();
await page.waitForTimeout(900);
check("X3 开内建面板收起音乐弹层", (await page.locator("[data-panel='todo']").count()) === 1 && (await popup.count()) === 0);
await page.keyboard.press("Escape");
await page.waitForTimeout(500);

/* ---------- K ⌘K 媒体命令（脚本通道回归） ---------- */
await page.locator("button[aria-label='指令 ⌘K']").click();
await page.waitForTimeout(900);
const b2 = controlLog.length;
await page.locator("[cmdk-item]").filter({ hasText: "音乐：播放 / 暂停" }).click();
await page.waitForTimeout(900);
check("K1 ⌘K 命令触发 toggle", controlLog.length > b2 && controlLog[controlLog.length - 1].cmd === "toggle");
await page.keyboard.press("Escape");
await page.waitForTimeout(400);

/* ---------- S 抖动回归 ---------- */
const gutter = await page.evaluate(() => getComputedStyle(document.documentElement).scrollbarGutter);
check("S1 scrollbar-gutter stable", gutter === "stable");
await page.evaluate(() => window.dispatchEvent(new CustomEvent("start:links-manage")));
await page.waitForTimeout(400);
const n0 = await page.evaluate(() => document.querySelectorAll(".cl-links a").length);
await page.evaluate(() => document.querySelector("button[aria-label^='删除']")?.click());
await page.waitForTimeout(700);
const n1 = await page.evaluate(() => document.querySelectorAll(".cl-links a").length);
check("S2 磁贴删除生效", n1 === n0 - 1, `${n0}→${n1}`);

/* ---------- E ---------- */
check("E1 pageerror = 0", errors.length === 0, errors.join(" | ").slice(0, 200));

await browser.close();
mock.close();
server.close();
const fail = results.filter((r) => !r.ok).length;
console.log(fail === 0 ? `\n全部 ${results.length} 项通过 ✓` : `\n${fail}/${results.length} 项失败 ✗`);
process.exit(fail === 0 ? 0 : 1);
