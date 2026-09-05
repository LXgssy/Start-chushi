import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = "/home/z/my-project/out";
const MIME = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".ico": "image/x-icon" };
const server = createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  p = p.replace(/^\/Start-chushi/, "") || "/";
  if (p.endsWith("/")) p += "index.html";
  let f = join(ROOT, p);
  if (!existsSync(f)) f = join(ROOT, "index.html");
  try {
    const body = readFileSync(f);
    res.writeHead(200, { "content-type": MIME[f.slice(f.lastIndexOf("."))] ?? "application/octet-stream" });
    res.end(body);
  } catch { res.writeHead(404); res.end("nf"); }
});
await new Promise((r) => server.listen(4633, r));

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 915 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") console.log("[console.error]", m.text().slice(0, 300)); });
await page.addInitScript(() => {
  try {
    localStorage.clear();
    localStorage.setItem("start:settings", JSON.stringify({ themeMode: "dark" }));
  } catch (e) {}
});
await page.goto("http://localhost:4633/", { waitUntil: "networkidle" });
await page.waitForSelector(".clock-text", { timeout: 15000 });

await page.keyboard.press("Control+k");
await page.waitForTimeout(800);
await page.locator("[cmdk-item]").filter({ hasText: "导入预设" }).click();
await page.waitForTimeout(600);
await page.locator("input[type=file]").setInputFiles("/home/z/my-project/examples/初始SMTC音乐预设.cshz");
await page.waitForTimeout(2000);

// 面板里可见文本（错误列表？）
const panelText = await page.locator("[cmdk-root]").textContent().catch(() => "(no cmdk-root)");
console.log("== panel text snippet ==", panelText?.slice(0, 600));

const stored = await page.evaluate(() => localStorage.getItem("start:presets"));
console.log("== start:presets ==");
try {
  const arr = JSON.parse(stored || "[]");
  for (const p of arr) {
    console.log("preset:", p.id, p.name);
    console.log("widget w/o html:", JSON.stringify((p.raw?.widgets ?? []).map((w) => ({ ...w, html: (w.html || "").slice(0, 40) + "..." }))));
  }
} catch (e) { console.log("raw:", stored?.slice(0, 300)); }

const btns = await page.evaluate(() => Array.from(document.querySelectorAll(".cl-dock button")).map((b) => b.getAttribute("aria-label")));
console.log("== dock buttons ==", btns);
console.log("== cl-widget count ==", await page.locator(".cl-widget").count());
console.log("== pageerrors ==", errors);
await browser.close();
server.close();
