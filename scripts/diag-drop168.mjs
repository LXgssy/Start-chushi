// diag-drop168.mjs — 对照实验：v8.7.167 vs 当前构建，同一"拖链接悬停文件夹后松手"场景
import { chromium } from "playwright-core";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";

const CHROME = "/home/z/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome";
const CASES = [
  { name: "167", zip: "/tmp/ext-diag167b", },
  { name: "168", zip: "/tmp/ext-diag168b" },
];

const mk = (n, pfx, nm) =>
  Array.from({ length: n }, (_, i) => ({ id: pfx + (i + 1), name: nm + (i + 1), url: `https://${pfx}${i + 1}.example.com` }));
const LINKS = JSON.stringify([
  { id: "t1", name: "甲站", url: "https://t1.example.com" },
  { id: "t2", name: "乙站", url: "https://t2.example.com" },
  { id: "fd1", name: "诊断夹", folder: true, children: mk(4, "a", "站") },
  { id: "fd2", name: "第二夹", folder: true, children: mk(3, "b", "乙") },
]);

for (const c of CASES) {
  fs.rmSync(c.zip, { recursive: true, force: true });
  fs.mkdirSync(c.zip, { recursive: true });
  const src = c.name === "167"
    ? "/home/z/beta-wt/download/v8.7.167/ChuShi-NewTab-v8.7.167.zip"
    : "/home/z/beta-wt/download/v8.7.168/ChuShi-NewTab-v8.7.168.zip";
  execSync(`cd ${c.zip} && unzip -q ${src}`);
  const PROFILE = `/tmp/drop168-${c.name}-profile`;
  fs.rmSync(PROFILE, { recursive: true, force: true });
  const browser = await chromium.launchPersistentContext(PROFILE, {
    executablePath: CHROME,
    args: ["--no-sandbox", `--disable-extensions-except=${c.zip}`, `--load-extension=${c.zip}`],
    viewport: { width: 1280, height: 900 },
  });
  const extId = [...createHash("sha256").update(c.zip).digest("hex").slice(0, 32)]
    .map((ch) => String.fromCharCode(97 + parseInt(ch, 16)))
    .join("");
  const page = browser.pages()[0] || (await browser.newPage());

  for (const hoverMs of [250, 420, 800]) {
    await page.goto(`chrome-extension://${extId}/index.html`, { waitUntil: "load", timeout: 60000 });
    await page.waitForTimeout(2200);
    await page.evaluate((l) => localStorage.setItem("start:links", l), LINKS);
    await page.evaluate(() => localStorage.setItem("start:settings", JSON.stringify({ iconStyle: "letter", linksForm: "drawer" })));
    await page.reload({ waitUntil: "load" });
    await page.waitForTimeout(2000);
    await page.keyboard.press("Alt+v");
    await page.waitForTimeout(1000);
    const a = await page.locator('.cl-links-drawer [data-entry-id="t1"]').first().boundingBox();
    const b = await page.locator('.cl-links-drawer [data-entry-id="fd1"] .tile-shell.h-16').first().boundingBox();
    const ax = a.x + a.width / 2, ay = a.y + a.height / 2;
    const bx = b.x + b.width / 2, by = b.y + b.height / 2;
    await page.mouse.move(ax, ay);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) {
      await page.mouse.move(ax + ((bx - ax) * i) / 8, ay + ((by - ay) * i) / 8);
      await page.waitForTimeout(24);
    }
    await page.waitForTimeout(hoverMs);
    // 松手前瞬时 over 状态
    await page.mouse.up();
    await page.waitForTimeout(900);
    const st = await page.evaluate(() => JSON.parse(localStorage.getItem("start:links")).map((e) => (e.folder ? `${e.id}(${e.children.length})` : e.id)));
    console.log(`[${c.name}] hover=${hoverMs}ms →`, JSON.stringify(st));
  }
  await browser.close();
}
console.log("DROP DIAG DONE");
