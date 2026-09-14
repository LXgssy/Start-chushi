// 拖拽激活取证：down 后事件流里谁在作祟
import { chromium } from "playwright-core";
import { spawn } from "child_process";

const PORT = 26993;
const server = spawn("python3", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1", "-d", "/tmp/my-project/out"], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 1200));

const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`,
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "load" });
await page.waitForTimeout(2200);

await page.evaluate(() => {
  window.__ev = [];
  for (const t of ["mousedown", "mousemove", "pointerdown", "pointermove", "dragstart", "pointercancel", "dragend", "mouseup"]) {
    document.addEventListener(t, (e) => {
      window.__ev.push(t + (e.defaultPrevented ? "(prevented)" : "") + "@" + (e.target.tagName || "?") + "." + String(e.target.className || "").slice(0, 30));
      if (t === "dragstart") e.preventDefault(); // 观察后拦下，看拖拽是否就能活
    }, true);
  }
});

const tile = page.locator(".cl-links .group.relative").nth(0);
const b = await tile.boundingBox();
const sx = b.x + b.width / 2, sy = b.y + b.height / 2;
const hit = await page.evaluate(([x, y]) => {
  const el = document.elementFromPoint(x, y);
  return el ? el.tagName + "." + String(el.className).slice(0, 50) : "null";
}, [sx, sy]);
console.log("elementFromPoint:", hit);

await page.mouse.move(sx, sy);
await page.mouse.down();
for (let i = 1; i <= 6; i++) {
  await page.mouse.move(sx + i * 12, sy);
  await page.waitForTimeout(30);
}
const mid = await page.evaluate(() => ({
  ev: window.__ev.slice(0, 40),
  overlay: !!Array.from(document.querySelectorAll("body > *")).find((el) => el.querySelector?.(".will-change-transform")),
}));
await page.mouse.up();
console.log("dragstart fired?", mid.ev.filter((e) => e.startsWith("dragstart")).length > 0);
console.log("overlay alive?", mid.overlay);
console.log("event log (first 40):");
for (const l of mid.ev) console.log("  ", l);
await browser.close();
server.kill();
