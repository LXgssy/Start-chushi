import { chromium } from "playwright-core";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

/* verify-ext-v171.mjs — v1.7.1 扩展冒烟：加载扩展 → 新标签页渲染 →
 * studio .cshz 导出可用 → 右键菜单批量管理 → 无报错 */

const STAGE = "/tmp/ext-stage";
const browser = await chromium.launchPersistentContext("/tmp/ext-v171-profile", {
  headless: true,
  channel: "chromium",
  args: [
    `--headless=new`,
    `--disable-extensions-except=${STAGE}`,
    `--load-extension=${STAGE}`,
  ],
});
const extId = createHash("sha256").update(STAGE).digest("hex").slice(0, 32)
  .split("").map((c) => "abcdefghijklmnop"[parseInt(c, 16)]).join("");
console.log("extId:", extId);

const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(`chrome-extension://${extId}/index.html`, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
}

/* 基线 */
check("扩展新标签页渲染（时钟）", await page.locator(".cl-clock").count() > 0);
check("扩展 dock 渲染", await page.locator(".cl-dock").count() > 0);

/* 右键菜单：批量管理磁贴（扩展 CSP 环境下派发 contextmenu） */
await page.locator("body").dispatchEvent("contextmenu", { button: 2, clientX: 400, clientY: 300, bubbles: true, cancelable: true });
await page.waitForTimeout(400);
const manageItem = page.locator("[role='menuitem']", { hasText: "批量管理磁贴" });
check("扩展右键菜单含「批量管理磁贴」", (await manageItem.count()) === 1);
if ((await manageItem.count()) === 1) {
  await manageItem.click();
  await page.waitForTimeout(400);
  check("扩展批量管理模式进入（jiggle）", (await page.locator(".jiggle").count()) > 0);
  await page.mouse.click(400, 80);
  await page.waitForTimeout(300);
  check("扩展批量管理模式退出", (await page.locator(".jiggle").count()) === 0);
}

/* studio 内嵌可用（下载按钮存在） */
const studioStatus = await page.evaluate(async () => {
  const r = await fetch("preset-studio.html");
  const t = await r.text();
  return { ok: r.ok, hasPack: t.includes("btn-download-pack") };
});
check("扩展内嵌 studio 可访问且含 .cshz 导出", studioStatus.ok === true && studioStatus.hasPack === true, JSON.stringify(studioStatus));

check("pageerror 全程为 0", errors.length === 0, errors.join(" | ").slice(0, 200));
const fails = results.filter((r) => !r.ok);
console.log(`\n===== 扩展冒烟 ${results.length - fails.length}/${results.length} 通过 =====`);
await browser.close();
process.exit(fails.length > 0 ? 1 : 0);
