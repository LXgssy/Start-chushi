// diag-dwell172b.mjs — 军备振荡诊断（读 console.debug 序列）
import { chromium } from "playwright-core";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";

const ZIP = "/home/z/beta-wt/download/v8.7.172/ChuShi-NewTab-v8.7.172.zip";
const STAGE = "/tmp/ext-diag172b";
const PROFILE = "/tmp/ext-diag172b-profile";
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
const logs = [];
page.on("console", (m) => { if (m.text().startsWith("[") && m.text().includes("dwell") || m.text().startsWith("[over]")) logs.push(m.text()); });

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

async function tilePt(id, dx = 0) {
  const a = await page.locator(`[data-entry-id="${id}"]`).first().boundingBox();
  return { x: a.x + a.width / 2 + dx, y: a.y + Math.min(28, a.height / 2) };
}
const p0 = await tilePt("t2");
const pf = await tilePt("fd0", -20);
console.log("t2", p0, "→ fd0-20", pf);
await page.mouse.move(p0.x, p0.y);
await page.mouse.down();
for (let i = 1; i <= 10; i++) {
  await page.mouse.move(p0.x + ((pf.x - p0.x) * i) / 10, p0.y + ((pf.y - p0.y) * i) / 10);
  await page.waitForTimeout(28);
}
await page.waitForTimeout(1800);
console.log("--- log during hold (t>300ms) ---");
for (const l of logs.filter((x) => { const t = parseInt(x.match(/(\d+)\s*$/)?.[1] || "0", 10); return t > 300 && t < 2200; })) console.log(" ", l);
await page.mouse.up();
await page.waitForTimeout(800);
console.log("--- log release window ---");
for (const l of logs.slice(-14)) console.log(" ", l);
await browser.close();
