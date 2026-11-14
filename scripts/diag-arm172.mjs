// diag-arm172.mjs — 军备期 DOM 类名 dump（定位 dropHintScale 读数盲区）
import { chromium } from "playwright-core";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";

const ZIP = "/home/z/beta-wt/download/v8.7.172/ChuShi-NewTab-v8.7.172.zip";
const STAGE = "/tmp/ext-diagarm";
const PROFILE = "/tmp/ext-diagarm-profile";
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
page.on("pageerror", (e) => console.log("PAGEERROR:", e.message.slice(0, 160)));

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
const dump = () => page.evaluate(() => {
  const els = [...document.querySelectorAll('[data-entry-id="fd0"]')];
  return els.map((el) => ({
    n: el.querySelectorAll("span").length,
    wc: [...el.querySelectorAll("span")]
      .filter((s) => String(s.className).includes("will-change-transform"))
      .map((s) => ({ cls: String(s.className).slice(0, 160), m: getComputedStyle(s).transform.slice(0, 30) })),
    inDrawer: !!el.closest(".cl-links-drawer"),
  }));
});
const scalePoll = () => page.evaluate(() => {
  const el = document.querySelector('[data-entry-id="fd0"]');
  if (!el) return -1;
  const inner = [...el.querySelectorAll("span")].find((s) => String(s.className).includes("will-change-transform"));
  if (!inner) return -2;
  const m = getComputedStyle(inner).transform;
  return m === "none" ? 1 : parseFloat(m.slice(7));
});

const p0 = await tilePt("t2");
const pf = await tilePt("fd0", -20);
await page.mouse.move(p0.x, p0.y);
await page.mouse.down();
for (let i = 1; i <= 10; i++) {
  await page.mouse.move(p0.x + ((pf.x - p0.x) * i) / 10, p0.y + ((pf.y - p0.y) * i) / 10);
  await page.waitForTimeout(28);
}
let lit = -1;
const t0 = Date.now();
let i = 0;
while (Date.now() - t0 < 3000) {
  const v = await scalePoll();
  i++;
  if (v > 1.1) { lit = Date.now() - t0; console.log(`LIT at +${lit}ms (poll #${i}) v=${v}`); break; }
  if (i % 8 === 0) console.log(`poll#${i} v=${v}`);
  await page.waitForTimeout(100);
}
if (lit < 0) {
  console.log("NEVER LIT in 3s. DOM dump:");
  console.log(JSON.stringify(await dump(), null, 1).slice(0, 2200));
}
await page.mouse.up();
await page.waitForTimeout(1500);
const ls = await page.evaluate(() => JSON.parse(localStorage.getItem("start:links")));
console.log("commit:", ls.find((e) => e.id === "fd0").children.map((c) => c.id).join(","));
await browser.close();
