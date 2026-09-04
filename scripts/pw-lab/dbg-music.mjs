import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createMockBridge } from "./mock-bridge.mjs";

const ROOT = "/home/z/my-project/out";
const MIME = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".ico": "image/x-icon" };
const server = createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/^\/Start-chushi/, "") || "/";
  if (p.endsWith("/")) p += "index.html";
  let f = join(ROOT, p);
  if (!existsSync(f)) f = join(ROOT, "index.html");
  try { const body = readFileSync(f); res.writeHead(200, { "content-type": MIME[f.slice(f.lastIndexOf("."))] ?? "application/octet-stream" }); res.end(body); } catch { res.writeHead(404); res.end("nf"); }
});
await new Promise((r) => server.listen(4623, r));
const bridge = createMockBridge({ portA: 10954, portB: 10999 });
await bridge.ready;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 915 } });
const page = await ctx.newPage();
page.on("console", (m) => console.log("[console]", m.type(), m.text().slice(0, 200)));
page.on("requestfailed", (r) => console.log("[reqfail]", r.url(), r.failure()?.errorText));
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 200)));
await page.goto("http://localhost:4623/", { waitUntil: "networkidle" });
await page.waitForSelector(".clock-text", { timeout: 15000 });
await page.locator(".cl-dock button[aria-label='音乐']").click();
await page.waitForTimeout(2600);
const addr = page.locator("input[aria-label='桥接服务地址']");
console.log("addr value:", await addr.inputValue());
await addr.fill("127.0.0.1:10999");
await page.locator("[data-panel='music']").getByRole("button", { name: "重试" }).click();
await page.waitForTimeout(5000);
console.log("player visible:", await page.locator("[data-testid='music-player']").count());
console.log("guide visible:", await page.locator("[data-panel='music'] >> text=接入三步").count());
await browser.close();
await new Promise((r) => server.close(r));
process.exit(0);
