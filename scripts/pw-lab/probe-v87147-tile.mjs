import { chromium } from "playwright-core";
import { execSync } from "child_process";
import { mkdtempSync, rmSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { createHash } from "crypto";
const ZIP = "/home/z/beta-wt/download/v8.7.147/ChuShi-NewTab-v8.7.147.zip";
const extDir = mkdtempSync(tmpdir() + "/ext-p147-");
execSync(`unzip -qo "${ZIP}" -d ${extDir}`);
rmSync("/tmp/ext-p147-profile", { recursive: true, force: true });
const browser = await chromium.launchPersistentContext("/tmp/ext-p147-profile", {
  headless: true, channel: "chromium",
  args: [`--headless=new`, `--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`],
  viewport: { width: 1280, height: 800 },
});
const extId = createHash("sha256").update(extDir).digest("hex").slice(0, 32).split("").map((c) => "abcdefghijklmnop"[parseInt(c, 16)]).join("");
const page = await browser.newPage();
await page.goto(`chrome-extension://${extId}/index.html`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1000);
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem("start:settings") || "{}");
  s.todoTile = true;
  localStorage.setItem("start:settings", JSON.stringify(s));
  localStorage.setItem("start:todos", JSON.stringify([{ id: "t1", text: "买牛奶", done: false, createdAt: 1 }]));
});
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForSelector('[aria-label="打开待办面板"]', { timeout: 15000 });
await page.waitForTimeout(1600);
await page.evaluate(() => {
  window.__evts = [];
  const tag = (el) => el && el.tagName ? el.tagName.toLowerCase() + (el.getAttribute && el.getAttribute("aria-label") ? `[${el.getAttribute("aria-label")}]` : "") : String(el);
  for (const t of ["pointerdown", "pointerup", "click"])
    document.addEventListener(t, (e) => window.__evts.push(`${t} -> ${tag(e.target)}`), true);
});
console.log("—— v8.7.147 生产包：点磁贴本体（打开待办面板按钮）——");
await page.locator('[aria-label="打开待办面板"]').click({ position: { x: 112, y: 30 } });
await page.waitForTimeout(400);
console.log((await page.evaluate(() => window.__evts.splice(0))).join("\n"));
const opened = await page.getByPlaceholder("添加待办，回车确认").isVisible().catch(() => false);
console.log("面板是否打开:", opened);
await browser.close();
