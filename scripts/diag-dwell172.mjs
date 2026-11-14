// diag-dwell172.mjs — v8.7.172 军备 scale 读数 + 幽灵几何逐点诊断
import { chromium } from "playwright-core";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";

const ZIP = "/home/z/beta-wt/download/v8.7.172/ChuShi-NewTab-v8.7.172.zip";
const STAGE = "/tmp/ext-diag172";
const PROFILE = "/tmp/ext-diag172-profile";
const CHROME = "/home/z/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome";

fs.rmSync(STAGE, { recursive: true, force: true });
fs.mkdirSync(STAGE, { recursive: true });
execSync(`cd ${STAGE} && unzip -q ${ZIP}`);
fs.rmSync(PROFILE, { recursive: true, force: true });

const browser = await chromium.launchPersistentContext(PROFILE, {
  executablePath: CHROME,
  args: ["--no-sandbox", `--disable-extensions-except=${STAGE}`, `--load-extension=${STAGE}`],
  viewport: { width: 1280, height: 900 },
});
const extId = [...createHash("sha256").update(STAGE).digest("hex").slice(0, 32)]
  .map((c) => String.fromCharCode(97 + parseInt(c, 16)))
  .join("");
const page = browser.pages()[0] || (await browser.newPage());
page.on("pageerror", (e) => console.log("PAGEERROR:", e.message.slice(0, 200)));
page.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE-ERR:", m.text().slice(0, 200)); });

const mk = (n, pfx, nm) => Array.from({ length: n }, (_, i) => ({ id: pfx + (i + 1), name: nm + (i + 1), url: `https://${pfx}${i + 1}.example.com` }));
const LINKS = JSON.stringify([
  { id: "t1", name: "甲站", url: "https://t1.example.com" },
  { id: "t2", name: "乙站", url: "https://t2.example.com" },
  { id: "fd0", name: "夹甲", folder: true, children: mk(5, "a", "站") },
  { id: "fd9", name: "夹乙", folder: true, children: mk(4, "b", "乙") },
]);

await page.goto(`chrome-extension://${extId}/index.html`, { waitUntil: "load", timeout: 60000 });
await page.waitForTimeout(1500);
await page.evaluate(([l]) => { localStorage.setItem("start:links", l); localStorage.setItem("start:settings", JSON.stringify({ iconStyle: "favicon", linksForm: "docked" })); }, [LINKS]);
await page.reload({ waitUntil: "load" });
await page.waitForTimeout(2000);

// DOM 结构检查：fd0 磁贴的 span 层级
const struct = await page.evaluate(() => {
  const el = document.querySelector('[data-entry-id="fd0"]');
  if (!el) return { el: false };
  const spans = [...el.querySelectorAll("span")].map((s) => String(s.className).slice(0, 80));
  return { el: true, n: spans.length, spans: spans.slice(0, 8), rect: el.getBoundingClientRect().toJSON() };
});
console.log("STRUCT fd0:", JSON.stringify(struct, null, 1).slice(0, 1200));

async function tilePt(id, dx = 0) {
  const a = await page.locator(`[data-entry-id="${id}"]`).first().boundingBox();
  return { x: a.x + a.width / 2 + dx, y: a.y + Math.min(28, a.height / 2) };
}
const scaleRead = () => page.evaluate(() => {
  const el = document.querySelector('[data-entry-id="fd0"]');
  if (!el) return { v: -1, why: "no el" };
  const inner = [...el.querySelectorAll("span")].find((s) => String(s.className).includes("will-change-transform"));
  if (!inner) return { v: -2, why: "no wc span" };
  const m = getComputedStyle(inner).transform;
  const cls = String(inner.className);
  return { v: m === "none" ? 1 : parseFloat(m.slice(7)), cls: cls.slice(0, 120), m: m.slice(0, 40) };
});
const ghostRead = () => page.evaluate(() => {
  const g = [...document.querySelectorAll("body > div")].filter((d) => String(d.className).includes("z-[80]"));
  return g.map((d) => { const r = d.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y), style: (d.getAttribute("style") || "").slice(0, 140) }; });
});

// A 流程重放：t2 → fd0 左半，驻留逐点读 scale
const p0 = await tilePt("t2");
const pf = await tilePt("fd0", -20);
console.log("P0", p0, "PF", pf);
await page.mouse.move(p0.x, p0.y);
await page.mouse.down();
for (let i = 1; i <= 10; i++) {
  await page.mouse.move(p0.x + ((pf.x - p0.x) * i) / 10, p0.y + ((pf.y - p0.y) * i) / 10);
  await page.waitForTimeout(28);
}
for (const t of [300, 600, 900, 1200, 1500]) {
  await page.waitForTimeout(t === 300 ? 300 : 300);
  const s = await scaleRead();
  console.log(`t+${t}ms scale:`, JSON.stringify(s).slice(0, 180));
}
// 松手 → 幽灵逐帧几何
await page.mouse.up();
for (const t of [80, 200, 350, 500, 650, 900]) {
  await page.waitForTimeout(t === 80 ? 80 : 120);
  const g = await ghostRead();
  console.log(`fly+${t}ms ghost:`, JSON.stringify(g).slice(0, 300));
}
await page.waitForTimeout(1500);
const ls = await page.evaluate(() => JSON.parse(localStorage.getItem("start:links")));
console.log("final fd0 children:", ls.find((e) => e.id === "fd0").children.map((c) => c.id).join(","));
await browser.close();
