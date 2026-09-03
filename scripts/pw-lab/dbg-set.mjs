import { chromium } from "playwright-core";
import fs from "node:fs";
const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`,
  args: ["--no-sandbox","--use-gl=angle","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("console", (m) => { const t = m.text(); if (t.includes("校验") || t.includes("schema") || t.includes("[lg]")) console.log("CONSOLE:", t.slice(0,200)); });
await page.goto("http://localhost:3000/", { waitUntil: "networkidle", timeout: 60000 });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(800);
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem("start:settings") || "null");
  if (s) { s.background = "photo"; s.photoId = "daily"; localStorage.setItem("start:settings", JSON.stringify(s)); }
});
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1500);
await page.keyboard.press("Control+k");
await page.waitForTimeout(600);
await page.getByText("导入预设", { exact: true }).click();
await page.waitForTimeout(500);
const presetJson = fs.readFileSync("/home/z/my-project/examples/液态玻璃预设.json", "utf8");
await page.locator("textarea").fill(presetJson);
await page.getByRole("button", { name: "导入", exact: true }).click();
await page.waitForTimeout(2500);
await page.keyboard.press("Escape");
await page.waitForTimeout(400);
await page.locator('nav[aria-label="快捷操作"] button[aria-label="设置"]').click();
await page.waitForTimeout(900);
const info = await page.evaluate(() => {
  const p = document.querySelector(".cl-panel");
  const txt = p ? p.innerText.slice(0, 400) : "(no panel)";
  const sliders = [...document.querySelectorAll(".cl-panel input[type=range]")].map((i) => i.getAttribute("aria-label"));
  const ls = localStorage.getItem("start:preset-settings");
  return { txt, sliders, ls: ls ? ls.slice(0, 200) : null };
});
console.log(JSON.stringify(info, null, 1));
await browser.close();
