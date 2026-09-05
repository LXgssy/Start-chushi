import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = "/home/z/my-project/out";
const MIME = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".ico": "image/x-icon", ".txt": "text/plain" };
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
page.on("pageerror", (e) => console.log("PAGEERROR:", String(e).slice(0, 120), "\n  stack:", (e.stack || "").split("\n").slice(0, 4).join(" | ").slice(0, 300)));
page.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE-ERR:", m.text().slice(0, 150)); });
await page.addInitScript(() => {
  try {
    localStorage.clear();
    localStorage.setItem("start:settings", JSON.stringify({ themeMode: "dark" }));
  } catch (e) {} // init script 会进 sandboxed iframe（无 allow-same-origin），必须吞掉
});
await page.goto("http://localhost:4631/", { waitUntil: "networkidle" });
await page.waitForSelector(".clock-text", { timeout: 15000 });

const presetJson = readFileSync("/home/z/my-project/examples/初始SMTC音乐预设.json", "utf8");
await page.keyboard.press("Control+k");
await page.waitForTimeout(700);
await page.locator("[cmdk-item]").filter({ hasText: "导入预设" }).click();
await page.waitForTimeout(600);
await page.locator("textarea").first().fill(presetJson);
await page.waitForTimeout(300);
// 找导入按钮：列出面板内全部按钮文本
const btns = await page.evaluate(() =>
  [...document.querySelectorAll("button")].map((b) => b.textContent?.trim()).filter(Boolean)
);
console.log("按钮：", btns.slice(0, 20));
await page.getByRole("button", { name: "导入", exact: true }).click();
await page.waitForTimeout(1500);
const panelText = await page.evaluate(() => document.body.innerText.slice(0, 1500));
console.log("面板文本：", panelText);
const st = await page.evaluate(() => ({
  presets: JSON.parse(localStorage.getItem("start:presets") || "[]").map((p) => ({ id: p.id, name: p.name, w: p.raw?.widgets?.length, s: p.raw?.scripts?.length })),
  widgets: document.querySelectorAll(".cl-widget").length,
  widgetHtml: document.querySelectorAll(".cl-widget[data-widget]").length,
}));
console.log("状态：", JSON.stringify(st, null, 2));
await page.waitForTimeout(3000);
const st2 = await page.evaluate(() => ({
  frozen: localStorage.getItem("start:sandbox-frozen"),
  iframes: [...document.querySelectorAll("iframe")].map((f) => f.src.slice(0, 80) || "(srcdoc)"),
}));
console.log("沙箱状态：", JSON.stringify(st2));
await page.keyboard.press("Control+k");
await page.waitForTimeout(900);
const cmds = await page.evaluate(() => [...document.querySelectorAll("[cmdk-item]")].map((e) => e.textContent?.trim()));
console.log("⌘K 命令：", JSON.stringify(cmds));
await page.screenshot({ path: "shots/dbg-v180-import.png" });
await browser.close();
server.close();
