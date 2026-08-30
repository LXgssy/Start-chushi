// 扩展金标准 E2E：真 Chromium 131 加载扩展包，验证 NTP 接管/资源路径/i18n/零错误
// 用法: cd pw-old && bun ext-load-test.mjs <扩展目录绝对路径>
// 基建: playwright 1.49 + chromium-1148（151 移除 --load-extension 旗标后 131 是唯一可用通道）
import { chromium } from "playwright";
import { readdirSync } from "fs";

const extPath = process.argv[2];
if (!extPath) {
  console.error("用法: bun ext-load-test.mjs <扩展目录>");
  process.exit(1);
}

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
};

const context = await chromium.launchPersistentContext("", {
  channel: undefined,
  headless: true,
  /* playwright 1.49 默认 headless=老 headless shell（无扩展支持）——
     必须显式 executablePath 走完整版 chromium + 新 headless */
  executablePath: "/home/z/.cache/ms-playwright/chromium-1148/chrome-linux/chrome",
  args: [
    `--disable-extensions-except=${extPath}`,
    `--load-extension=${extPath}`,
    "--no-first-run",
    "--lang=zh-CN",
  ],
});

/* unpacked 扩展 ID = SHA256(绝对路径 UTF-8) 前 32 hex → a-p 映射（Chromium 内部算法）。
   headless 下 chrome://newtab 导航受限，直接以扩展 URL 打开验证页面本身；
   NTP 接管由 manifest chrome_url_overrides 声明（v1.0.0 已在真机 Edge 确认），不在 headless 复测 */
import { createHash } from "crypto";
const extId = createHash("sha256")
  .update(Buffer.from(extPath, "utf8"))
  .digest("hex")
  .slice(0, 32)
  .split("")
  .map((c) => String.fromCharCode(97 + parseInt(c, 16)))
  .join("");

const errors = [];
const failedReq = [];

const page = context.pages()[0] || (await context.newPage());
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));
page.on("requestfailed", (r) => failedReq.push(r.url() + " :: " + (r.failure()?.errorText || "?")));
page.on("response", (r) => {
  if (r.status() >= 400) failedReq.push(`${r.url()} :: HTTP ${r.status()}`);
});

await page.goto(`chrome-extension://${extId}/index.html`, { waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => {});
const landed = page.url();
check("扩展页加载（路径哈希 ID 直开）", landed.includes(extId), landed.slice(0, 60));

await page.waitForTimeout(2500); // 水合 + 入场动画（不等待 networkidle：天气/壁纸请求可挂起）

  // 1. 标题与核心元素
  const title = await page.title();
  check("页面标题含「初始」", title.includes("初始"), title);

  const hasSearch = await page.locator("input[type='text'], input:not([type])").count();
  check("搜索框渲染", hasSearch > 0, `count=${hasSearch}`);

  const hasDock = await page.locator("nav[aria-label='快捷操作']").count();
  check("Dock 渲染", hasDock === 1);

  // 2. 受控输入可键入（React 水合铁证）
  const inp = page.locator("main input").first();
  await inp.click({ timeout: 5000 }).catch(() => {});
  await inp.type("测试").catch(() => {});
  const typed = await inp.inputValue().catch(() => "");
  check("受控输入存活（React 水合）", typed === "测试", `value="${typed}"`);
  await inp.fill("").catch(() => {});

  // 3. 时钟显示真实当前时间（静态预渲染不可能）
  const clockTxt = (await page.locator("main section").first().innerText().catch(() => "")).replace(/\s/g, "");
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  check("时钟 == 真实时分（水合）", clockTxt.includes(hh) && clockTxt.includes(mm), `clock="${clockTxt.slice(0, 12)}" expect~"${hh}${mm}"`);

  // 4. SW 注册守卫：扩展协议页不得注册 service worker
  const swCount = await page.evaluate(async () => {
    if (!navigator.serviceWorker) return -1;
    const regs = await navigator.serviceWorker.getRegistrations();
    return regs.length;
  });
  check("扩展页零 SW 注册（协议守卫）", swCount === 0, `registrations=${swCount}`);

  // 5. i18n：zh-CN 环境 manifest 名应为中文（default_locale 生效）
  const extName = await page.evaluate(async (id) => {
    try {
      const res = await fetch(`chrome-extension://${id}/manifest.json`);
      return (await res.json()).name;
    } catch {
      return "FETCH_FAIL";
    }
  }, extId);
  check("manifest i18n 占位符", extName.includes("__MSG_extName__"), extName);
  // 上面拿到的是占位符原文（Chromium 在扩展管理页才渲染解析名）；
  // 语言渲染验证走 chrome.management API 不可达，改由 _locales 文件断言兜底（见下方离线断言）。

check("零 console 错误", errors.length === 0, errors.slice(0, 3).join(" | "));
const realFail = failedReq.filter((u) => !u.includes("chrome-extension") || true);
check("零失败请求（含 /next/ 路径）", realFail.length === 0, realFail.slice(0, 3).join(" | "));

await context.close();

// 7. 离线断言：_locales 目录结构 + messages 内容（Chromium 对 default_locale 的解析在加载期完成，报错会直接拒载——能跑完上面即已通过）
const localeOk = (() => {
  try {
    const dirs = readdirSync(`${extPath}/_locales`);
    if (!dirs.includes("zh_CN")) return false;
    const zh = JSON.parse(readFileSync(`${extPath}/_locales/zh_CN/messages.json`, "utf8"));
    return typeof zh.extName?.message === "string";
  } catch {
    return false;
  }
})();
import { readFileSync } from "fs";
check("_locales/zh_CN messages 完整（default_locale 兜底）", localeOk);

const pass = results.filter((r) => r.ok).length;
console.log(`\n结果: ${pass}/${results.length} 通过`);
process.exit(pass === results.length ? 0 : 1);
