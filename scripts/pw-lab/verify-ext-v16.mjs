// v1.6.0 扩展冒烟：--load-extension 真浏览器加载 → 新标签页渲染 → 导入液态玻璃 → WebGL 引擎生效
import { chromium } from "playwright-core";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";

const STAGE = "/tmp/ext-smoke-v16";
fs.rmSync(STAGE, { recursive: true, force: true });
fs.mkdirSync(STAGE, { recursive: true });
execSync(`cd ${STAGE} && unzip -q /home/z/my-project/download/v1.6.0/ChuShi-NewTab-v1.6.0.zip`);

const userData = "/tmp/ext-profile-v16";
fs.rmSync(userData, { recursive: true, force: true });
const browser = await chromium.launchPersistentContext(userData, {
  executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`,
  args: [
    "--no-sandbox",
    `--disable-extensions-except=${STAGE}`,
    `--load-extension=${STAGE}`,
    "--use-gl=angle",
    "--enable-unsafe-swiftshader",
  ],
  viewport: { width: 1280, height: 800 },
});
let extId = [...createHash("sha256").update(STAGE).digest("hex").slice(0, 32)]
  .map((c) => String.fromCharCode(97 + parseInt(c, 16)))
  .join("");
console.log("extension id:", extId);
const page = browser.pages()[0] || (await browser.newPage());
const errors = [];
page.on("pageerror", (e) => errors.push(e.message.slice(0, 140)));
await page.goto(`chrome-extension://${extId}/index.html`, { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(1800);
const rendered = await page.evaluate(() => ({
  clock: !!document.querySelector(".cl-clock"),
  dock: !!document.querySelector(".cl-dock"),
  indicator: !!document.querySelector(".cl-dock-indicator"),
}));
if (!rendered.clock || !rendered.dock) {
  console.log("  ✗ 扩展新标签页渲染失败", JSON.stringify(rendered));
  process.exit(1);
} else console.log("  ✓ 扩展新标签页渲染（clock/dock/indicator 齐备）");

/* 导入液态玻璃预设 */
await page.keyboard.press("Control+k");
await page.waitForTimeout(700);
await page.getByText("导入预设", { exact: true }).click();
await page.waitForTimeout(600);
const presetJson = fs.readFileSync("/home/z/my-project/examples/液态玻璃预设.json", "utf8");
await page.locator("textarea").fill(presetJson);
await page.getByRole("button", { name: "导入", exact: true }).click();
await page.waitForTimeout(3000);

/* 扩展无壁纸（默认 glow）→ 引擎应降级 CSS 磨砂（data-lg-fb）—— 这是预期路径 */
const st = await page.evaluate(() => {
  const dock = document.querySelector(".cl-dock");
  const cv = dock?.querySelector(":scope > .lg-ov");
  return {
    lgRoot: !!document.getElementById("chushi-lg-root"),
    marked: !!dock?.dataset.lg,
    fb: dock?.dataset.lgFb || "(none)",
    canvas: !!cv,
    canvasPixels: cv && cv.width ? (() => {
      const d = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data;
      let a = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 8) a++;
      return a;
    })() : 0,
  };
});
console.log("  引擎态:", JSON.stringify(st));
if (!st.lgRoot) { console.log("  ✗ 引擎容器未创建"); process.exit(1); }
if (!st.marked) { console.log("  ✗ dock 未打标"); process.exit(1); }
console.log("  ✓ 引擎激活 + dock 打标（扩展 glow 模式 → " + (st.fb !== "(none)" ? "CSS 磨砂降级（预期）" : "WebGL 路径") + "）");

/* 种 photo 壁纸走 WebGL 路径再验一次 */
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem("start:settings") || "null");
  if (s) {
    s.background = "photo";
    s.photoId = "daily";
    localStorage.setItem("start:settings", JSON.stringify(s));
  }
});
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(2600);
const st2 = await page.evaluate(() => {
  const dock = document.querySelector(".cl-dock");
  const cv = dock?.querySelector(":scope > .lg-ov");
  return {
    fb: dock?.dataset.lgFb || "(none)",
    pixels: cv && cv.width ? (() => {
      const d = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data;
      let a = 0, sum = 0;
      for (let i = 0; i < d.length; i += 4) { if (d[i + 3] > 8) a++; sum += d[i] + d[i + 1] + d[i + 2]; }
      return { a, sum };
    })() : null,
    mid: cv && cv.width ? [...cv.getContext("2d").getImageData(Math.floor(cv.width / 2), Math.floor(cv.height / 2), 1, 1).data] : null,
  };
});
console.log("  photo 态:", JSON.stringify(st2));
if (st2.fb === "(none)" && st2.pixels && st2.pixels.a > 0 && st2.pixels.sum > 1000) {
  console.log("  ✓ 扩展 WebGL 玻璃有像素（非黑板）");
} else {
  console.log("  ✗ 扩展 WebGL 路径异常（fb=" + st2.fb + "）");
  process.exit(1);
}
if (errors.length) { console.log("  ✗ pageerror:", errors.join(" | ")); process.exit(1); }
console.log("  ✓ 0 pageerror");
await page.screenshot({ path: "/home/z/my-project/scripts/pw-lab/shots/ext-v16.png" });
await browser.close();
console.log("✓ v1.6.0 扩展冒烟通过");
