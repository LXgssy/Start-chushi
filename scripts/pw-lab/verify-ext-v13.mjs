import { chromium } from "playwright-core";

/* verify-ext-v13.mjs — v1.3.0 扩展冒烟：加载扩展 → 新标签页渲染 →
 * 导入八维预设 → tokens/clock/material 生效 → 无报错 */

const browser = await chromium.launchPersistentContext("/tmp/ext-v13-profile", {
  headless: true,
  channel: "chromium",
  args: [
    `--headless=new`,
    `--disable-extensions-except=/tmp/ext-stage-v13`,
    `--load-extension=/tmp/ext-stage-v13`,
  ],
});
/* unpacked 扩展 ID = 安装路径 SHA256 前 32 位 hex → a-p 字母表（headless=new 下 SW 探测不稳，直接推导） */
const { createHash } = await import("node:crypto");
const extId = createHash("sha256").update("/tmp/ext-stage-v13").digest("hex").slice(0, 32)
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

check("扩展渲染：时钟出现", (await page.locator(".cl-clock").count()) > 0);

/* 直注 localStorage 安装八维预设（与 worklog 律：按 parsePreset 归一化补 links/dock/commands 空数组） */
const presetJson = (await import("node:fs")).readFileSync(
  "/home/z/my-project/examples/焕新示例预设.json",
  "utf-8"
);
const raw = JSON.parse(presetJson);
const normalized = {
  id: "ext-smoke-v13",
  name: raw.name,
  author: raw.author ?? "",
  installedAt: Date.now(),
  raw: { commands: raw.commands ?? [], links: raw.links ?? [], dock: raw.dock ?? [], ...raw },
};
await page.evaluate((v) => {
  localStorage.setItem("start:presets", JSON.stringify([v]));
}, normalized);
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1500);

const accent = await page.evaluate(() =>
  getComputedStyle(document.documentElement).getPropertyValue("--ui-accent").trim()
);
check("tokens：强调色 Fluent 蓝", accent === "#0078d4", accent);
const clockText = await page.locator(".cl-clock time").textContent();
check("clock：12h AM/PM", /AM|PM/.test(clockText), clockText.slice(0, 20));
const mat = await page.evaluate(() =>
  Boolean(document.querySelector('#chushi-fx-root [data-fx-mount="material"]'))
);
check("material：挂载就位", mat);
const speed = await page.evaluate(() =>
  document.documentElement.style.getPropertyValue("--mo-speed").trim()
);
check("motion：--mo-speed=1.1", speed === "1.1", speed);

check("扩展 pageerror=0", errors.length === 0, errors.join("|").slice(0, 120));

const pass = results.filter((r) => r.ok).length;
console.log(`\n==== ${pass}/${results.length} passed ====`);
await browser.close();
process.exit(pass === results.length ? 0 : 1);
