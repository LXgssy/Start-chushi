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
await new Promise((r) => server.listen(4635, r));

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 915 } });
const page = await ctx.newPage();
await page.addInitScript(() => {
  try {
    localStorage.clear();
    localStorage.setItem("start:settings", JSON.stringify({ themeMode: "dark" }));
  } catch (e) {}
});
await page.goto("http://localhost:4635/", { waitUntil: "networkidle" });
await page.waitForSelector(".clock-text", { timeout: 15000 });
await page.keyboard.press("Control+k");
await page.waitForTimeout(700);
await page.locator("[cmdk-item]").filter({ hasText: "导入预设" }).click();
await page.waitForTimeout(600);
await page.locator("input[type=file]").setInputFiles("/home/z/my-project/examples/初始SMTC音乐预设.cshz");
await page.waitForTimeout(1500);
await page.keyboard.press("Escape");
await page.waitForTimeout(400);

await page.locator(".cl-dock button[aria-label='音乐']").click();
await page.waitForTimeout(2600);

const box = await page.locator(".cl-dockwidget").boundingBox();
console.log("popup box:", JSON.stringify(box));

// 在白条区域（弹层顶部 +6px）与中部各取一次 elementFromPoint 链
const probe = await page.evaluate(({ x, y }) => {
  const hostFrame = document.querySelector(".cl-dockwidget iframe");
  const hostRect = hostFrame.getBoundingClientRect();
  return { hx: hostRect.left, hy: hostRect.top };
}, 0).then(async ({ hx, hy }) => {
  // 找 srcdoc 内层 frame（opaque origin，只能走 Playwright frame API）
  const srcdocFrames = page.frames().filter((f) => f.url() === "about:srcdoc");
  const inner = srcdocFrames[srcdocFrames.length - 1];
  const rel = { x: box.x + box.width / 2 - hx, y: box.y + 8 - hy };
  return await inner.evaluate(({ rel }) => {
    const el = document.elementFromPoint(rel.x, rel.y);
    const chain = [];
    let cur = el;
    while (cur && chain.length < 5) {
      const cs = getComputedStyle(cur);
      chain.push({
        tag: cur.tagName, id: cur.id, cls: String(cur.className).slice(0, 40),
        bg: cs.backgroundColor, color: cs.color,
        rect: (({ x, y, width, height }) => ({ x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) }))(cur.getBoundingClientRect()),
      });
      cur = cur.parentElement;
    }
    const card = document.getElementById("card");
    const em = document.getElementById("em");
    const cp = document.getElementById("cp");
    const fl = document.getElementById("fl");
    const info = (e) => e ? { display: getComputedStyle(e).display, opacity: getComputedStyle(e).opacity, h: Math.round(e.getBoundingClientRect().height) } : null;
    return {
      probe: chain,
      cardRect: card.getBoundingClientRect().toJSON(),
      bodyBg: getComputedStyle(document.body).backgroundColor,
      em: info(em), cp: info(cp), fl: info(fl),
      mode: card.className,
      panel: document.documentElement.dataset.panel,
      theme: document.documentElement.dataset.theme,
    };
  }, { rel });
});
console.log(JSON.stringify(probe, null, 1));

await browser.close();
server.close();
