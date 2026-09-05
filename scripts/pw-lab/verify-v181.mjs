import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/* verify-v181.mjs — v1.8.1 SMTC 预设包 .cshz 化 + dock 面板复刻 UI + 桥脚本编码修复
 * P  .cshz 包导入（manifest + assets/cover.svg 内联）→ dock 风格磁贴
 * W  播放态 / 默认封面资产 / 真封面 / 暂停 / 控制上行 / 展开(248) / seek / 收起
 * K  ⌘K 媒体命令（脚本通道）
 * D  dock/⌘K 音乐面板退役回归
 * S  scrollbar-gutter + 磁贴删除不跳
 * E  pageerror = 0
 */

const ROOT = "/home/z/my-project/out";
const MIME = {
  ".html": "text/html", ".js": "application/javascript", ".css": "text/css",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
  ".woff2": "font/woff2", ".ico": "image/x-icon", ".txt": "text/plain",
};

/* ---------- mock SMTC 桥（同 ChuShi-SMTC-Bridge.ps1 契约） ---------- */
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

/* ---------- 静态服务（out/，Pages 路径剥离） ---------- */
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
await new Promise((r) => server.listen(4631, r));

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 915 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.addInitScript(() => {
  try {
    localStorage.clear();
    localStorage.setItem("start:settings", JSON.stringify({ themeMode: "dark" }));
  } catch (e) {} // init script 会进 sandboxed iframe（无 allow-same-origin），必须吞掉
});
await page.goto("http://localhost:4631/", { waitUntil: "networkidle" });
await page.waitForSelector(".clock-text", { timeout: 15000 });

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
}

/* ---------- D 退役回归 ---------- */
check("D1 dock 无「音乐」按钮", (await page.locator(".cl-dock button[aria-label='音乐']").count()) === 0);
await page.keyboard.press("Control+k");
await page.waitForTimeout(900);
check("D2 ⌘K 无「音乐」面板入口", (await page.locator("[cmdk-item]").filter({ hasText: /^音乐$/ }).count()) === 0);
await page.keyboard.press("Escape");
await page.waitForTimeout(500);

/* ---------- P1 导入 .cshz 预设包 ---------- */
await page.keyboard.press("Control+k");
await page.waitForTimeout(700);
await page.locator("[cmdk-item]").filter({ hasText: "导入预设" }).click();
await page.waitForTimeout(600);
const fileInput = page.locator("input[type=file]");
await fileInput.setInputFiles("/home/z/my-project/examples/初始SMTC音乐预设.cshz");
await page.waitForTimeout(1500);
const errList = await page.locator("text=/错误|必须|缺失|不支持/").count();
check("P1 .cshz 导入无错误", errList === 0, `错误项=${errList}`);

/* ---------- P2 widget 挂载（dock 风格结构） ---------- */
const widgetBox = page.locator(".cl-widget[data-widget]");
check("P2 widget 盒挂载", (await widgetBox.count()) === 1);
const wFrame = page.frameLocator(".cl-widget iframe").frameLocator("iframe[title='初始自定义小部件']");
await wFrame.locator("#card").waitFor({ timeout: 8000 });
check("P2b 图标 defs+use 就位", (await wFrame.locator("use[href='#i-pl']").count()) >= 2);

/* ---------- W3 空态 → 播放态（无封面 → 默认唱片资产） ---------- */
await page.waitForTimeout(1600); // 等 smtc 轮询首拍
check("W3a 空态文案（无会话）", (await wFrame.locator("#e1").textContent()) === "等待媒体会话");
mockState = {
  ...mockState,
  track: {
    app: "网易云音乐", title: "晴天", artist: "周杰伦", album: "叶惠美",
    playing: true, position: 42.5, duration: 269.3, rate: 1,
    coverRev: "",
  },
};
await page.waitForTimeout(2600); // 等订阅推送
check("W3b 紧凑条歌名", (await wFrame.locator("#t1s").textContent()) === "晴天");
check("W3c 紧凑条歌手", (await wFrame.locator("#t2s").textContent()) === "周杰伦");
check("W3e 播放态（暂停图标可见）", await wFrame.locator("#nS").isVisible());
check("W3f 播放态呼吸类", (await wFrame.locator("#card").getAttribute("class")).includes("pl"));

/* ---------- W4 封面：默认资产 → 真封面 ---------- */
check("W4a 无封面走包内默认唱片(svg)", (await wFrame.locator("#aS").getAttribute("src"))?.startsWith("data:image/svg+xml") === true);
mockState = { ...mockState, track: { ...mockState.track, coverRev: "mock-rev-1" } };
await page.waitForTimeout(2600);
check("W4b 真封面 data URL 到位", (await wFrame.locator("#aS").getAttribute("src"))?.startsWith("data:image/png") === true);

/* ---------- W5 状态推送：暂停 ---------- */
mockState = { ...mockState, track: { ...mockState.track, playing: false } };
await page.waitForTimeout(2600);
check("W5 暂停态（播放图标回位）", await wFrame.locator("#yS").isVisible());
check("W5b 封面降饱和类", (await wFrame.locator("#aS").getAttribute("class"))?.includes("pz") === true);

/* ---------- W6 控制命令（widget 通道） ---------- */
mockState = { ...mockState, track: { ...mockState.track, playing: true } };
await page.waitForTimeout(2600);
await wFrame.locator("#pS0").click();
await page.waitForTimeout(600);
check("W6 点击播放/暂停 → toggle 到桥", controlLog.some((c) => c.cmd === "toggle"));

/* ---------- W7 展开（dock 面板复刻） ---------- */
await wFrame.locator("#cp").click(position(170, 34)); // 点条中部 meta 区（避开按钮）
await page.waitForTimeout(900);
const h = await widgetBox.evaluate((el) => el.getBoundingClientRect().height);
check("W7 展开卡高度 ~248", Math.abs(h - 248) < 8, `h=${h}`);
check("W7b 大卡歌名", (await wFrame.locator("#t1f").textContent()) === "晴天");
check("W7c 大卡专辑行", (await wFrame.locator("#t3f").textContent()) === "叶惠美");
check("W7d footer 来源", (await wFrame.locator("#ap").textContent()) === "已连接 · 网易云音乐");
check("W7e 播放光晕元素在卡内", (await wFrame.locator("#fl .glow").count()) === 1);
/* seek 点击（pointerdown→up 同点提交） */
const seekBox = await wFrame.locator("#sk").boundingBox();
await page.mouse.move(seekBox.x + seekBox.width * 0.5, seekBox.y + seekBox.height / 2);
await page.mouse.down();
await page.mouse.up();
await page.waitForTimeout(500);
check("W7f seek 命令到桥", controlLog.some((c) => c.cmd === "seek" && typeof c.position === "number"));
/* 收起 */
await wFrame.locator("#cxB").click();
await page.waitForTimeout(900);
const h2 = await widgetBox.evaluate((el) => el.getBoundingClientRect().height);
check("W7g 收起回紧凑条", Math.abs(h2 - 64) < 8, `h=${h2}`);

/* ---------- K ⌘K 媒体命令（脚本通道） ---------- */
await page.locator("button[aria-label='指令 ⌘K']").click(); // 点击主文档按钮：焦点同时归还宿主
await page.waitForTimeout(900);
const before = controlLog.length;
await page.locator("[cmdk-item]").filter({ hasText: "音乐：播放 / 暂停" }).click();
await page.waitForTimeout(900);
check("K1 ⌘K 命令触发 toggle", controlLog.length > before && controlLog[controlLog.length - 1].cmd === "toggle");
await page.keyboard.press("Escape");

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

/* 辅助：容器内相对坐标 */
function position(x, y) {
  return { position: { x, y } };
}
