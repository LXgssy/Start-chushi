// 探针四：settingsPush（owner key）→ 读 __chushiLG 判断 cfg 是否变
import { chromium } from "playwright-core";
import fs from "node:fs";

const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`,
  args: ["--no-sandbox", "--use-gl=angle", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("pageerror", (e) => console.log("PAGEERROR:", e.message.slice(0, 150)));

await page.goto("http://localhost:3000/", { waitUntil: "networkidle", timeout: 120000 });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1000);
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem("start:settings") || "null");
  if (s) {
    s.background = "photo";
    s.photoId = "daily";
    localStorage.setItem("start:settings", JSON.stringify(s));
  }
});
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1600);

await page.keyboard.press("Control+k");
await page.waitForTimeout(600);
await page.getByText("导入预设", { exact: true }).click();
await page.waitForTimeout(500);
const presetJson = fs.readFileSync("/home/z/my-project/examples/液态玻璃预设.json", "utf8");
await page.locator("textarea").fill(presetJson);
await page.getByRole("button", { name: "导入", exact: true }).click();
await page.waitForTimeout(2500);

const dbg1 = await page.evaluate(() => window.__chushiLG?.() ?? null);
const key = dbg1?.owner;
console.log("owner key:", key, "cfg.blur:", dbg1?.cfg.blur);

const checksum = () =>
  page.evaluate(() => {
    const cv = document.querySelector(".search-pill > .lg-ov");
    if (!cv) return null;
    const d = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data;
    let s = 0;
    for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2];
    return s;
  });

const c0 = await checksum();
await page.evaluate((k) => {
  document.querySelector("iframe").contentWindow.postMessage(
    {
      type: "settingsPush",
      scriptKey: k,
      values: {
        refractionHeight: 24,
        refractionAmount: 24,
        blur: 28,
        chromaticPct: 0,
        saturation: 150,
        brightness: 100,
        highlight: true,
        coverage: "full",
      },
    },
    "*"
  );
}, key);
await page.waitForTimeout(1000);
const dbg2 = await page.evaluate(() => window.__chushiLG?.() ?? null);
const c1 = await checksum();
console.log("after push cfg.blur:", dbg2?.cfg.blur, "checksum:", c0, "→", c1, "changed:", c0 !== c1);
await browser.close();
