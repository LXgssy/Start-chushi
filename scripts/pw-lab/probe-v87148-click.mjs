/* 探针：磁贴内点击的事件落点（pointer capture 重定向实证）
 * 在 document 捕获段记录 pointerdown/pointerup/mousedown/mouseup/click
 * 的 target，然后分别点：①行级待办按钮 ②磁贴标题区 */
import { chromium } from "playwright-core";
import { execSync } from "child_process";
import { mkdtempSync, rmSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { createHash } from "crypto";

const ZIP = "/home/z/beta-wt/download/v8.7.148/ChuShi-NewTab-v8.7.148.zip";
const extDir = mkdtempSync(tmpdir() + "/ext-probe-");
execSync(`unzip -qo "${ZIP}" -d ${extDir}`);
const mf = JSON.parse(readFileSync(extDir + "/manifest.json", "utf8"));

rmSync("/tmp/ext-probe-profile", { recursive: true, force: true });
const browser = await chromium.launchPersistentContext("/tmp/ext-probe-profile", {
  headless: true,
  channel: "chromium",
  args: [`--headless=new`, `--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`],
  viewport: { width: 1280, height: 800 },
});
const extId = createHash("sha256").update(extDir).digest("hex").slice(0, 32)
  .split("").map((c) => "abcdefghijklmnop"[parseInt(c, 16)]).join("");

const page = await browser.newPage();
await page.goto(`chrome-extension://${extId}/index.html`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1000);
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem("start:settings") || "{}");
  s.todoTile = true;
  localStorage.setItem("start:settings", JSON.stringify(s));
  localStorage.setItem("start:todos", JSON.stringify([
    { id: "t1", text: "买牛奶", done: false, createdAt: 1 },
    { id: "t2", text: "回邮件", done: false, createdAt: 2 },
  ]));
});
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForSelector('[data-todo-row="open"]', { timeout: 15000 });
await page.waitForTimeout(1500);

await page.evaluate(() => {
  window.__evts = [];
  const tag = (el) => {
    if (!el || !el.tagName) return String(el);
    const cls = typeof el.className === "string" && el.className ? "." + el.className.split(" ").slice(0, 2).join(".") : "";
    const aria = el.getAttribute && el.getAttribute("aria-label");
    return el.tagName.toLowerCase() + cls + (aria ? `[${aria}]` : "");
  };
  for (const t of ["pointerdown", "pointerup", "mousedown", "mouseup", "click"]) {
    document.addEventListener(t, (e) =>
      window.__evts.push(`${t} -> ${tag(e.target)}`), true);
  }
});

const snap = async () => await page.evaluate(() => window.__evts.splice(0));

console.log("—— ①点行级待办按钮 ——");
await page.locator('[data-todo-row="open"]').first().click();
await page.waitForTimeout(300);
for (const l of await snap()) console.log("  " + l);

console.log("—— ②点磁贴标题区 ——");
await page.getByText("待办", { exact: true }).first().click();
await page.waitForTimeout(300);
for (const l of await snap()) console.log("  " + l);

console.log("—— ③面板是否被打开 ——");
const inputVisible = await page.getByPlaceholder("添加待办，回车确认").isVisible().catch(() => false);
console.log("  面板输入框可见:", inputVisible);

console.log("—— ④storage 状态 ——");
console.log(await page.evaluate(() => localStorage.getItem("start:todos")));

await browser.close();
