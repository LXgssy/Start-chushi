// 二分之二：直接向沙箱 postMessage settingsPush → 验证 patch → 画布
import { chromium } from "playwright-core";
import fs from "node:fs";

const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`,
  args: ["--no-sandbox", "--use-gl=angle", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("pageerror", (e) => console.log("PAGEERROR:", e.message.slice(0, 120)));
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning") console.log("CONSOLE:", m.text().slice(0, 140));
});

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

const checksum = () =>
  page.evaluate(() => {
    const cv = document.querySelector(".search-pill > .lg-ov");
    if (!cv) return null;
    const d = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data;
    let s = 0;
    for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2];
    return s;
  });

/* 拿到 scriptKey：先动一次滑杆触发持久化 */
await page.keyboard.press("Escape");
await page.waitForTimeout(400);
await page.locator('nav[aria-label="快捷操作"] button[aria-label="设置"]').click();
await page.waitForTimeout(900);
await page.locator('input[type="range"][aria-label="模糊半径"]').evaluate((el) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  setter.call(el, "10");
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
});
await page.waitForTimeout(600);
const key = await page.evaluate(() => {
  const raw = localStorage.getItem("start:preset-settings");
  if (!raw) return null;
  return Object.keys(JSON.parse(raw))[0] || null;
});
console.log("scriptKey:", key);

const c0 = await checksum();
/* 直接 postMessage 进沙箱（绕过 React 设置链，单测 patch 引擎段） */
await page.evaluate((k) => {
  const ifr = document.querySelector("iframe");
  ifr.contentWindow.postMessage(
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
await page.waitForTimeout(1500);
const c1 = await checksum();
console.log("direct push:", c0, "→", c1, "changed:", c0 !== c1);

/* 再单发 glassPatch 消息（绕过 settingsPush 回调，直接测 glassPatch 路由） */
const c2 = await checksum();
await page.evaluate((k) => {
  const ifr = document.querySelector("iframe");
  ifr.contentWindow.postMessage(
    { type: "api", op: "glassPatch", scriptKey: k, gid: "probe1", cfg: { blur: 4 } },
    "*"
  );
}, key);
await page.waitForTimeout(1500);
const c3 = await checksum();
console.log("glassPatch direct:", c2, "→", c3, "changed:", c2 !== c3);
await browser.close();
