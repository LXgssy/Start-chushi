// 扩展冒烟测试（单路径）：加载扩展 → 渲染 → localStorage 直注液态玻璃预设 → 重载 → 验证 fx 链路
import { chromium } from "playwright-core";
import fs from "node:fs";
import { createHash } from "node:crypto";

const stage = "/tmp/ext-load";
fs.rmSync(stage, { recursive: true, force: true });
fs.mkdirSync(stage, { recursive: true });
fs.cpSync("/tmp/ext-stage", stage, { recursive: true });

const context = await chromium.launchPersistentContext("/tmp/ext-profile", {
  executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`,
  args: ["--no-sandbox", `--disable-extensions-except=${stage}`, `--load-extension=${stage}`],
  viewport: { width: 1280, height: 800 },
});
const extId = [...createHash("sha256").update(stage).digest("hex").slice(0, 32)]
  .map((c) => String.fromCharCode(97 + parseInt(c, 16)))
  .join("");
const page = context.pages()[0] || (await context.newPage());
const errors = [];
page.on("pageerror", (e) => errors.push(e.message.slice(0, 120)));
await page.goto(`chrome-extension://${extId}/index.html`, { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(1500);
console.log("[1] 渲染:", await page.locator(".cl-clock").count(), await page.locator(".search-pill").count());

// 直注预设（与导入面板同一存储形态）
const json = fs.readFileSync("/home/z/my-project/examples/液态玻璃预设.json", "utf8");
await page.evaluate((j) => {
  const obj = JSON.parse(j);
  // 与 parsePreset 归一化对齐：commands/links/dock 恒为数组
  obj.commands = obj.commands || []; obj.links = obj.links || []; obj.dock = obj.dock || [];
  const presets = JSON.parse(localStorage.getItem("start:presets") || "[]");
  presets.push({ id: "exttest1", name: obj.name, author: obj.author, installedAt: Date.now(), raw: obj });
  localStorage.setItem("start:presets", JSON.stringify(presets));
}, json);
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(2500);
console.log("[1b] 重载后 presets:", await page.evaluate(() => {
  const arr = JSON.parse(localStorage.getItem("start:presets") || "[]");
  return arr.map((p) => ({ id: p.id, name: p.name, hasRaw: !!p.raw, cmds: Array.isArray(p.raw?.commands) ? p.raw.commands.length : String(p.raw?.commands), dock: Array.isArray(p.raw?.dock) ? p.raw.dock.length : String(p.raw?.dock) }));
}));

const glass = await page.evaluate(() => {
  const el = document.querySelector(".search-pill[data-fx]");
  const root = document.getElementById("chushi-fx-root");
  return {
    marked: !!el,
    bf: el ? getComputedStyle(el).backdropFilter.slice(0, 60) : "(none)",
    mounts: root ? root.querySelectorAll("[data-fx-mount]").length : 0,
    hasStyle: !!(root && root.querySelector("style")),
  };
});
console.log("[2] 扩展内液态玻璃:", JSON.stringify(glass));
await page.screenshot({ path: "/home/z/my-project/scripts/pw-lab/shots/ext-smoke.png" });
console.log("[3] pageerror:", errors.length === 0 ? "无" : errors.slice(0, 3).join(" | "));
await context.close();
