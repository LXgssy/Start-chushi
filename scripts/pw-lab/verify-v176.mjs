import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createMockBridge } from "./mock-bridge.mjs";

/* verify-v176.mjs — v1.7.6 桥接独立版批 专项验证
 * A 新指引：接入三步（新版客户端推荐）/ 一键安装包下载直链（Release latest 资产固定名）
 * B 旧路线回落：chromatic 插件路线链接指向 v1.7.5 Release
 * C 新失败文案：网易云没开，或初始音乐桥未运行
 * D 协议兼容快速回归：mock 桥接入 → 快照渲染 → toggle 命令到达
 * E pageerror = 0 */

const ROOT = "/home/z/my-project/out";
const MIME = {
  ".html": "text/html", ".js": "application/javascript", ".css": "text/css",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
  ".woff2": "font/woff2", ".ico": "image/x-icon", ".txt": "text/plain",
};
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
await new Promise((r) => server.listen(4623, r));

const bridge = createMockBridge({ portA: 10954, portB: 10999 });
await bridge.ready;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 915 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.addInitScript(() => {
  localStorage.clear();
  localStorage.setItem("start:settings", JSON.stringify({ themeMode: "dark" }));
});
await page.goto("http://localhost:4623/", { waitUntil: "networkidle" });
await page.waitForSelector(".clock-text", { timeout: 15000 });

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
}

const panel = page.locator("[data-panel='music']");
await page.locator(".cl-dock button[aria-label='音乐']").click();
await page.waitForSelector("[data-panel='music']", { timeout: 5000 });
await page.waitForTimeout(2600); // 探测超时 → error 态

/* ---------- A 新指引 ---------- */
check("A1 接入三步（新版客户端推荐）", (await panel.getByText("接入三步（新版客户端推荐）").count()) === 1);
const dl = panel.locator("a", { hasText: "初始音乐桥·独立版" });
check("A2 下载链接存在", (await dl.count()) === 1);
if ((await dl.count()) === 1) {
  const href = await dl.getAttribute("href");
  const target = await dl.getAttribute("target");
  check("A3 直链指向 Release latest 固定资产", href === "https://github.com/LXgssy/Start-chushi/releases/latest/download/ChuShiBridge-2.0.0-Setup.zip", href);
  check("A4 新窗口打开", target === "_blank");
}
check("A5 安装步骤含 bat 双击指引", (await panel.getByText("解压后双击「安装初始音乐桥.bat」，网易云会自动重启").count()) === 1);
check("A6 独立版说明文案", (await panel.getByText(/不依赖 BetterNCM\/chromatic，支持最新版网易云客户端/).count()) >= 1);

/* ---------- B 旧路线回落 ---------- */
const legacy = panel.locator("a", { hasText: "chromatic 插件路线" });
check("B1 chromatic 插件路线链接在位", (await legacy.count()) === 1);
if ((await legacy.count()) === 1) {
  const href = await legacy.getAttribute("href");
  check("B2 指向 v1.7.5 Release", href === "https://github.com/LXgssy/Start-chushi/releases/tag/v1.7.5", href);
}

/* ---------- C 新失败文案 ---------- */
check("C1 失败文案含「初始音乐桥未运行」", (await panel.getByText("网易云没开，或初始音乐桥未运行").count()) === 1);

/* ---------- D 协议兼容快速回归（对端 = mock 双胞胎，契约与 ChuShiBridge.exe 相同） ---------- */
const addr = panel.locator("input[aria-label='桥接服务地址']");
await addr.fill("127.0.0.1:10954");
await panel.getByRole("button", { name: "重试" }).click();
await page.waitForSelector("[data-testid='music-player']", { timeout: 8000 });
check("D1 接入成功（协议兼容）", true);
check("D2 快照渲染歌名", (await panel.getByText("夜空中最亮的星").count()) >= 1);
await panel.getByRole("button", { name: "下一首" }).click();
await page.waitForTimeout(900);
const ctrls = await (await fetch("http://127.0.0.1:10954/api/__controls")).json();
check("D3 控制命令到达桥", ctrls.some((c) => c.action === "next"), JSON.stringify(ctrls.map((c) => c.action)));

/* ---------- E pageerror ---------- */
check("E1 pageerror = 0", errors.length === 0, errors.slice(0, 3).join(" | "));

await browser.close();
await new Promise((r) => server.close(r));

const pass = results.filter((r) => r.ok).length;
console.log(`\n${pass}/${results.length} 通过`);
process.exit(pass === results.length ? 0 : 1);
