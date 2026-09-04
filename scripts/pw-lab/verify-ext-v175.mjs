import { chromium } from "playwright-core";
import { createHash } from "node:crypto";
import { createMockBridge } from "./mock-bridge.mjs";

/* verify-ext-v175.mjs — v1.7.5 扩展冒烟：
 * A 扩展新标签页 dock 有「音乐」按钮，面板打开=未连接指引
 * B 扩展页 → http://127.0.0.1 mock 桥接入（跨源 CORS：ACAO 回显 chrome-extension://）→ 播放器渲染
 * C 控制命令到达桥（toggle）
 * D pageerror = 0 */

const STAGE = "/tmp/ext-stage";
const bridge = createMockBridge({ portA: 10954, portB: 10999 });
await bridge.ready;

const browser = await chromium.launchPersistentContext("/tmp/ext-v175-profile", {
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
await page.waitForSelector(".clock-text", { timeout: 15000 });
await page.waitForTimeout(600);

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
}

const musicBtn = page.locator(".cl-dock button[aria-label='音乐']");
const panel = page.locator("[data-panel='music']");

check("A1 dock「音乐」按钮在位", (await musicBtn.count()) === 1);
await musicBtn.click();
await page.waitForSelector("[data-panel='music']", { timeout: 5000 });
await page.waitForTimeout(2600);
check("A2 未连接指引可见", (await panel.getByText("接入三步").count()) === 1);

const addr = panel.locator("input[aria-label='桥接服务地址']");
await addr.fill("http://127.0.0.1:10954");
await panel.getByRole("button", { name: "重试" }).click();
await page.waitForSelector("[data-testid='music-player']", { timeout: 8000 });
check("B1 扩展页接入 mock 桥（CORS 回显扩展源）", true);
check("B2 歌名渲染", (await panel.getByText("夜空中最亮的星").count()) === 1);
check("B3 已连接脚注", (await panel.getByText("已连接 · 网易云音乐").count()) === 1);

await panel.getByRole("button", { name: "暂停" }).click();
await page.waitForTimeout(900);
const ctrls = await (await fetch("http://127.0.0.1:10954/api/__controls")).json();
check("C1 toggle 命令到达桥", ctrls.some((c) => c.action === "toggle"), JSON.stringify(ctrls.map((c) => c.action)));

check("D1 pageerror = 0", errors.length === 0, errors.slice(0, 3).join(" | "));

await browser.close();
await Promise.all((await bridge.ready).map((s) => new Promise((r) => s.close(r))));
const pass = results.filter((r) => r.ok).length;
console.log(`\n${pass}/${results.length} 通过`);
process.exit(pass === results.length ? 0 : 1);
