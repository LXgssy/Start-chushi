// diag-drift168.mjs — ③号问题漂移专测：真实 img 图标（data-URI 自绘）下，
// 悬停放大过渡期间 img 相对迷你格（cell）中心的偏移随时间采样；含静息/终态对照。
// 图标图案 = 红底 + 几何中心黑点：黑点若偏离格心即可见。
import { chromium } from "playwright-core";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";

const ZIP = "/home/z/beta-wt/download/v8.7.167/ChuShi-NewTab-v8.7.167.zip";
const STAGE = "/tmp/ext-diag168c";
const PROFILE = "/tmp/ext-diag168c-profile";
const CHROME = "/home/z/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome";

fs.rmSync(STAGE, { recursive: true, force: true });
fs.mkdirSync(STAGE, { recursive: true });
execSync(`cd ${STAGE} && unzip -q ${ZIP}`);
fs.rmSync(PROFILE, { recursive: true, force: true });

const browser = await chromium.launchPersistentContext(PROFILE, {
  executablePath: CHROME,
  args: ["--no-sandbox", `--disable-extensions-except=${STAGE}`, `--load-extension=${STAGE}`],
  viewport: { width: 1280, height: 900 },
  deviceScaleFactor: 2, // 用户多为 HiDPI，2x 下贴图采样更敏感
});
const extId = [...createHash("sha256").update(STAGE).digest("hex").slice(0, 32)]
  .map((c) => String.fromCharCode(97 + parseInt(c, 16)))
  .join("");
const page = browser.pages()[0] || (await browser.newPage());
page.on("pageerror", (e) => console.log("PAGEERROR:", e.message.slice(0, 160)));

const mk = (n, pfx, nm) =>
  Array.from({ length: n }, (_, i) => ({ id: pfx + (i + 1), name: nm + (i + 1), url: `https://${pfx}${i + 1}.example.com` }));
const LINKS = JSON.stringify([
  { id: "fd1", name: "诊断夹", folder: true, children: mk(4, "a", "站") },
  { id: "t1", name: "甲站", url: "https://t1.example.com" },
]);

async function runForm(form) {
  await page.goto(`chrome-extension://${extId}/index.html`, { waitUntil: "load", timeout: 60000 });
  await page.waitForTimeout(2200);
  await page.evaluate((links) => {
    localStorage.setItem("start:links", links);
  }, LINKS);
  // 种自绘图标：红底 + 中心黑点（64x64）
  await page.evaluate((form) => {
    const c = document.createElement("canvas");
    c.width = 64; c.height = 64;
    const g = c.getContext("2d");
    g.fillStyle = "#e05050";
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = "#111111";
    g.beginPath();
    g.arc(32, 32, 7, 0, Math.PI * 2);
    g.fill();
    const url = c.toDataURL("image/png");
    const map = {};
    for (let i = 1; i <= 4; i++) map[`a${i}.example.com`] = url;
    localStorage.setItem("start:custom-icons", JSON.stringify(map));
    localStorage.setItem("start:settings", JSON.stringify({ iconStyle: "favicon", linksForm: form === "drawer" ? "drawer" : "docked" }));
  }, form);
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(2000);
  if (form === "drawer") {
    await page.keyboard.press("Alt+v");
    await page.waitForTimeout(1200);
  }
  const sel = `[data-entry-id="fd1"] .tile-shell.${form === "drawer" ? "h-16" : "h-14"}`;

  const sample = () =>
    page.evaluate((sel) => {
      const shell = document.querySelector(sel);
      if (!shell) return null;
      const cells = [...shell.querySelectorAll("[data-cl-folder-grid] > span")];
      return cells.map((cell) => {
        const cr = cell.getBoundingClientRect();
        const img = cell.querySelector("img");
        if (!img || !cr.width) return null;
        const ir = img.getBoundingClientRect();
        return {
          cx: +(ir.left + ir.width / 2 - (cr.left + cr.width / 2)).toFixed(2),
          cy: +(ir.top + ir.height / 2 - (cr.top + cr.height / 2)).toFixed(2),
          cw: +cr.width.toFixed(2),
          iw: +ir.width.toFixed(2),
        };
      });
    }, sel);

  const box = await page.locator(sel).first().boundingBox();
  const hx = box.x + box.width / 2;
  const hy = box.y + box.height / 2;
  console.log(`\n===== form=${form} (dpr=2) img中心-格心偏移 =====`);
  console.log("rest      :", JSON.stringify(await sample()));
  await page.mouse.move(hx, hy, { steps: 3 });
  // 精确时间点采样
  const times = [50, 100, 175, 250, 350, 600];
  let prev = 0;
  for (const t of times) {
    await page.waitForTimeout(t - prev);
    prev = t;
    console.log(`t=${String(t).padStart(3)}ms :`, JSON.stringify(await sample()));
  }
  await page.screenshot({ path: `/tmp/drift168-${form}.png` });
  await page.mouse.move(30, 850, { steps: 3 });
  await page.waitForTimeout(500);
  console.log("rest2(移开):", JSON.stringify(await sample()));
}

await runForm("drawer");
await runForm("docked");
await browser.close();
console.log("\nDRIFT DIAG DONE");
