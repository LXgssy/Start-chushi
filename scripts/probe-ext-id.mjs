// 直接访问确定性 id 的扩展页，判断扩展是否被浏览器接受
import { chromium } from "playwright";

const ROOT = "/tmp/ext-stage";
const EXT_ID = "jkanbbcimgoijfefaogihgeohbkhlekd"; // sha256(path) nibble 算法

const browser = await chromium.launchPersistentContext("/tmp/ext-profile", {
  channel: "chromium",
  headless: process.env.HEADLESS === "1",
  args: [
    `--disable-extensions-except=${ROOT}`,
    `--load-extension=${ROOT}`,
    "--no-first-run",
    "--disable-gpu",
  ],
});

const page = await browser.newPage();
let navErr = null;
await page.goto(`chrome-extension://${EXT_ID}/index.html`, { waitUntil: "domcontentloaded", timeout: 15000 })
  .catch(e => { navErr = e.message; });
await page.waitForTimeout(2000);

if (navErr) {
  console.log("导航失败:", navErr.split("\n")[0]);
} else {
  const title = await page.title();
  const next = await page.evaluate(() => document.querySelector("#__next")?.children.length ?? -1);
  const txt = (await page.evaluate(() => document.body.innerText).catch(() => "") || "").replace(/\s+/g, " ").slice(0, 100);
  console.log("title:", JSON.stringify(title));
  console.log("#__next 子节点:", next);
  console.log("正文:", JSON.stringify(txt));
  console.log(next > 0 ? "EXTENSION PAGE RENDERS ✓" : "EXTENSION PAGE EMPTY ✗");
}
await browser.close();
