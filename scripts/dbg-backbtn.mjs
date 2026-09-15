// dbg-backbtn.mjs — 「返回设置」点击失效取证
import { chromium } from "playwright-core";
import crypto from "crypto";
import { mkdirSync, rmSync } from "fs";

const ROOT = "/tmp/ext-v849";
const PROFILE = "/tmp/ext-dbg-profile";
rmSync(PROFILE, { recursive: true, force: true });

const EXT_ID = (() => {
  const h = crypto.createHash("sha256").update(Buffer.from(ROOT)).digest("hex").slice(0, 32);
  return [...h].map((c) => String.fromCharCode(97 + (parseInt(c, 16) % 26))).join("");
})();
const EXT_URL = (p) => `chrome-extension://${EXT_ID}/${p}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launchPersistentContext(PROFILE, {
  channel: "chromium", headless: true,
  args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`,
    "--no-first-run", "--disable-gpu", "--no-sandbox"],
});
process.on("exit", () => { try { browser.close(); } catch { } });

const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("console", (m) => { if (m.type() === "error") console.log("[console.error]", m.text().slice(0, 120)); });
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 160)));

await page.goto(EXT_URL("shell.html"), { waitUntil: "load", timeout: 20000 });
await page.waitForFunction(() => {
  const f = document.getElementById("csShellFrame");
  return f && f.src && f.src.endsWith("index.html");
}, { timeout: 10000 }).catch(() => null);
const app = page.frames().find((f) => f !== page.mainFrame() && /\/index\.html$/.test(f.url()));
await app.waitForFunction(() => !!document.querySelector("a[data-cl-tile]"), { timeout: 15000 });

const settingsBtn = app.locator('nav[aria-label="快捷操作"] button[aria-label*="设置"]').first();
await settingsBtn.click({ timeout: 8000 });
await sleep(700);
await app.getByText("更新日志", { exact: true }).first().click();
await sleep(1100);
await page.screenshot({ path: "/tmp/shots/dbg-dialog.png" });

const dlg = app.locator('[role="dialog"][aria-label="更新日志"]');
const btn = dlg.getByText("返回设置", { exact: true });

/* 命中测试：按钮几何中心处 elementFromPoint 是谁 */
const hit = await btn.evaluate((el) => {
  const r = el.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const top = document.elementFromPoint(cx, cy);
  return {
    rect: { x: r.x, y: r.y, w: r.width, h: r.height },
    hit: top ? `${top.tagName}.${(top.className && top.className.baseVal !== undefined ? top.className.baseVal : top.className || "").toString().slice(0, 60)}` : "null",
    hitIsInside: top ? el.contains(top) || top === el : false,
    disabled: el.disabled,
  };
});
console.log("hit test:", JSON.stringify(hit, null, 2));

/* 真实 Playwright 点击（不吞错） */
try {
  await btn.click({ timeout: 5000 });
  console.log("pw click: OK");
} catch (e) {
  console.log("pw click FAIL:", String(e).split("\n").slice(0, 6).join(" | "));
}

await sleep(900);
const open = await dlg.isVisible().catch(() => false);
console.log("after pw click, dialog visible =", open);

if (open) {
  /* 兜底：JS 原生 click */
  await btn.evaluate((el) => el.click());
  await sleep(900);
  console.log("after js click, dialog visible =", await dlg.isVisible().catch(() => false));
}
await page.screenshot({ path: "/tmp/shots/dbg-after.png" });
process.exit(0);
