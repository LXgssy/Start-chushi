// v8.7.9 D 组右键失败诊断：elementFromPoint + 指针状态机 + 事件流追踪
import { chromium } from "playwright-core";
import crypto from "crypto";

const ROOT = "/tmp/ext-beta";
const h = crypto.createHash("sha256").update(Buffer.from(ROOT)).digest("hex").slice(0, 32);
const EXT_ID = [...h].map((c) => String.fromCharCode(97 + (parseInt(c, 16) % 26))).join("");
const EXT_URL = (p) => `chrome-extension://${EXT_ID}/${p}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const WALLPAPER = "data:image/svg+xml;utf8," + encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='1280' height='800'><rect width='1280' height='800' fill='#1e3a5f'/></svg>`
);

const ctx = await chromium.launchPersistentContext("/tmp/v879-dbg-profile", {
  channel: "chromium", headless: true,
  args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`, "--no-first-run", "--no-sandbox"],
});
const page = await ctx.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto(EXT_URL("shell.html"), { waitUntil: "load", timeout: 20000 });
await page.waitForFunction(() => {
  const f = document.getElementById("csShellFrame");
  return f && f.src && f.src.endsWith("index.html");
}, { timeout: 8000 });
let af = page.frames().find((f) => f !== page.mainFrame() && /\/index\.html$/.test(f.url()));
await af.waitForFunction(() => document.body && document.body.children.length > 0, { timeout: 15000 });
await sleep(4000);

await af.evaluate((wp) => {
  const raw = localStorage.getItem("start:settings");
  const obj = raw ? JSON.parse(raw) : {};
  obj.background = "photo"; obj.photoId = "custom"; obj.wallpaperUrl = wp;
  obj.wallpaperRev = (obj.wallpaperRev || 0) + 1;
  localStorage.setItem("start:settings", JSON.stringify(obj));
}, WALLPAPER);
await page.reload({ waitUntil: "load" });
await page.waitForFunction(() => {
  const f = document.getElementById("csShellFrame");
  return f && f.src && f.src.endsWith("index.html");
}, { timeout: 8000 });
af = page.frames().find((f) => f !== page.mainFrame() && /\/index\.html$/.test(f.url()));
await af.waitForFunction(() => document.body && document.body.children.length > 0, { timeout: 15000 });
await sleep(4000);

/* 记录 edit-link 事件是否派发 */
await af.evaluate(() => {
  window.__editEvt = 0;
  window.addEventListener("start:edit-link", () => { window.__editEvt++; });
});

await page.mouse.click(90, 620, { button: "middle" });
await sleep(1400);

const probe1 = await af.evaluate(() => {
  const t = document.querySelector('[data-cl-tile="1"]');
  if (!t) return { tile: false };
  const r = t.getBoundingClientRect();
  const x = r.left + r.width / 2, y = r.top + r.height / 2;
  const el = document.elementFromPoint(x, y);
  const chain = [];
  let cur = el;
  while (cur && chain.length < 6) { chain.push(cur.tagName + "." + String(cur.className || "").split(" ").slice(0, 2).join(".")); cur = cur.parentElement; }
  return { tile: true, x, y, hit: el ? el.tagName + "." + String(el.className || "").slice(0, 40) : "null", chain, withinTile: t.contains(el) };
});
console.log("probe1 磁贴命中:", JSON.stringify(probe1));

if (probe1.tile) {
  await page.mouse.click(probe1.x, probe1.y, { button: "right" });
  await sleep(700);
  const after = await af.evaluate(() => ({
    evt: window.__editEvt,
    dlg: !!document.querySelector("[role='dialog']"),
    veil: !!document.querySelector(".cl-screen-veil"),
  }));
  console.log("真右键后:", JSON.stringify(after));

  if (!after.dlg) {
    /* 兜底：直接对磁贴 a 元素派发 contextmenu（handler 级见证） */
    await af.evaluate(() => {
      const t = document.querySelector('[data-cl-tile="1"]');
      const a = t?.querySelector("a") || t;
      a?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    });
    await sleep(700);
    const after2 = await af.evaluate(() => ({
      evt: window.__editEvt,
      dlg: !!document.querySelector("[role='dialog']"),
      veilCount: document.querySelectorAll(".cl-screen-veil").length,
      veilBg: (() => { const el = document.querySelector(".cl-screen-veil"); return el ? getComputedStyle(el).backgroundColor : "none"; })(),
      veilBf: (() => { const el = document.querySelector(".cl-screen-veil"); return el ? getComputedStyle(el).backdropFilter : "none"; })(),
      drawerBf: (() => { const el = document.querySelector(".cl-drawer-veil"); return el ? getComputedStyle(el).backdropFilter : "none"; })(),
    }));
    console.log("evaluate 派发 contextmenu 后:", JSON.stringify(after2));
    const shot = "/tmp/v879-dbg-dlg.png";
    await page.screenshot({ path: shot });
    console.log("截图:", shot);
  }
}
await ctx.close();
process.exit(0);
