/* v8.7.145 录制区 UI 截图：浅色待开始/捕获中 + 深色捕获中 + 抖音区块 */
import { chromium } from "playwright-core";
import { execSync } from "child_process";
import { mkdtempSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { createHash } from "crypto";

const ZIP = "/home/z/beta-wt/download/v8.7.145/ChuShi-NewTab-v8.7.145.zip";
const OUT = "/home/z/my-project/download/sniffer-ui-v87145/";
execSync(`mkdir -p ${OUT} && unzip -qo "${ZIP}" -d ${OUT}ext`);
const mf = JSON.parse(readFileSync(OUT + "ext/manifest.json", "utf8"));
if (mf.version !== "8.7.145") process.exit(1);

const browser = await chromium.launchPersistentContext("/tmp/ext-v145-shot", {
  headless: true, channel: "chromium",
  args: [`--headless=new`, `--disable-extensions-except=${OUT}ext`, `--load-extension=${OUT}ext`, "--force-device-scale-factor=2"],
});
const extId = createHash("sha256").update(OUT + "ext").digest("hex").slice(0, 32)
  .split("").map((c) => "abcdefghijklmnop"[parseInt(c, 16)]).join("");

const page = await browser.newPage();
await page.setViewportSize({ width: 1280, height: 800 });
await page.goto(`chrome-extension://${extId}/index.html`, { waitUntil: "domcontentloaded" });
await page.evaluate(() => new Promise((res) => chrome.storage.local.set({ snifferOn: true }, res)));
await page.close();
await new Promise((r) => setTimeout(r, 800));

const page2 = await browser.newPage();
await page2.setViewportSize({ width: 1280, height: 800 });
await page2.goto("https://example.com/", { waitUntil: "domcontentloaded" });
await page2.waitForSelector("#chushi-sniffer-host", { state: "attached" });
await page2.waitForFunction(() => {
  const r = document.querySelector("#chushi-sniffer-host")?.shadowRoot;
  return !!r && r.querySelector(".ball")?.style.display !== "none";
}, null, { timeout: 15000 });

const open = () => page2.evaluate(() => {
  const b = document.querySelector("#chushi-sniffer-host").shadowRoot.querySelector(".ball");
  b.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 1, button: 0, pointerType: "mouse", clientX: 100, clientY: 100 }));
  b.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 1, button: 0, pointerType: "mouse", clientX: 100, clientY: 100 }));
});
await open();
await page2.waitForFunction(() => {
  const r = document.querySelector("#chushi-sniffer-host")?.shadowRoot;
  return !!r && !!r.querySelector(".panel.open");
}, null, { timeout: 8000 });

/* 面板移到视口舒适位 + 注入几条假资源让列表有内容 */
await page2.evaluate(() => {
  const r = document.querySelector("#chushi-sniffer-host").shadowRoot;
  r.querySelector(".panel").style.left = "120px";
  r.querySelector(".panel").style.top = "120px";
});
await page2.waitForTimeout(300);
const shot = async (name) => {
  const el = await page2.$("#chushi-sniffer-host");
  await page2.evaluate(() => {
    const r = document.querySelector("#chushi-sniffer-host").shadowRoot;
    const p = r.querySelector(".panel");
    const rect = { l: parseFloat(p.style.left), t: parseFloat(p.style.top) };
    p.style.left = "120px"; p.style.top = "120px";
  });
  await page2.screenshot({ path: OUT + name, clip: { x: 100, y: 100, width: 320, height: 460 } });
};

await shot("catch-idle-light.png");

/* 切捕获中 */
await page2.evaluate(() => {
  const r = document.querySelector("#chushi-sniffer-host").shadowRoot;
  r.querySelector('.catch-btns button[data-act="catch-toggle"]').click();
});
await page2.waitForFunction(() => {
  const r = document.querySelector("#chushi-sniffer-host")?.shadowRoot;
  return !!r && !!r.querySelector(".catch-bar");
}, null, { timeout: 6000 });
await shot("catch-live-light.png");

/* 展开提示 */
await page2.evaluate(() => {
  const r = document.querySelector("#chushi-sniffer-host").shadowRoot;
  r.querySelector(".catch details.catch-tip summary").click();
});
await shot("catch-tip-open-light.png");

/* 深色：cardDark=1（须在扩展页上下文写 storage，MAIN world 无 chrome API） */
const setter = await browser.newPage();
await setter.goto(`chrome-extension://${extId}/index.html`, { waitUntil: "domcontentloaded" });
await setter.evaluate(() => new Promise((res) => chrome.storage.local.set({ cardDark: 1 }, res)));
await setter.close();
await page2.waitForTimeout(600);
await shot("catch-live-dark.png");

console.log("截图完成 → " + OUT);
await browser.close();
