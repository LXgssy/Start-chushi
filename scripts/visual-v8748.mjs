// v8.7.48 小组件行视觉目检：深色 / 浅色 / 移动端 2x2 / 倒数日编辑态
import { chromium } from "playwright-core";

const BASE = process.env.PROBE_BASE || "http://localhost:3111";
const OUT = "/home/z/my-project/assets/wg-v8748";
import fs from "fs";
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ channel: "chromium", headless: true, args: ["--no-sandbox", "--no-first-run"] });

async function shot(name, { theme, viewport, seed }) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate((s) => {
    localStorage.clear();
    localStorage.setItem("start:seen", "1");
    for (const [k, v] of Object.entries(s)) localStorage.setItem(k, JSON.stringify(v));
  }, seed);
  await page.goto(BASE, { waitUntil: "load" });
  await sleep(1800);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log("shot:", name);
  await ctx.close();
}

const today = new Date();
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T00:00`;
const tPlus10 = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 10);
const baseSeed = {
  "start:todos": [
    { id: "a", text: "写周报", done: false, createdAt: 1 },
    { id: "b", text: "回复邮件并整理会议纪要发出去", done: false, createdAt: 2 },
    { id: "c", text: "已完成的任务", done: true, createdAt: 3 },
  ],
  "start:settings": { countdownTitle: "下班", countdownTarget: "2020-01-01T18:30" },
};

await shot("dark-desktop", { theme: "dark", viewport: { width: 1440, height: 900 }, seed: baseSeed });
await shot("light-desktop", { theme: "light", viewport: { width: 1440, height: 900 }, seed: { ...baseSeed, "start:settings": { ...baseSeed["start:settings"], themeMode: "light" } } });
await shot("dark-mobile", { theme: "dark", viewport: { width: 420, height: 860 }, seed: baseSeed });
await shot("dark-countdown-days", { theme: "dark", viewport: { width: 1440, height: 900 }, seed: { ...baseSeed, "start:settings": { countdownTitle: "生日", countdownTarget: iso(tPlus10) } } });
await shot("dark-unset-place", { theme: "dark", viewport: { width: 1440, height: 900 }, seed: { "start:todos": [], "start:settings": {} } });

await browser.close();
console.log("done");
