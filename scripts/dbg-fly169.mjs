// dbg-fly169.mjs — v8.7.169 两处冒烟失败的时序取证
// ①幽灵落账后 t1 是否入夹（高频采样 localStorage 序列）
// ②夹内拖拽出面板 1.2s 拉回松手后 popover 何时消失
import { chromium } from "playwright-core";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";

const ZIP = "/home/z/beta-wt/download/v8.7.169/ChuShi-NewTab-v8.7.169.zip";
const STAGE = "/tmp/ext-dbg169";
const PROFILE = "/tmp/ext-dbg169-profile";
const CHROME = "/home/z/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome";

fs.rmSync(STAGE, { recursive: true, force: true });
fs.mkdirSync(STAGE, { recursive: true });
execSync(`cd ${STAGE} && unzip -q ${ZIP}`);
fs.rmSync(PROFILE, { recursive: true, force: true });

const browser = await chromium.launchPersistentContext(PROFILE, {
  executablePath: CHROME,
  args: ["--no-sandbox", `--disable-extensions-except=${STAGE}`, `--load-extension=${STAGE}`],
  viewport: { width: 1280, height: 900 },
});
const extId = [...createHash("sha256").update(STAGE).digest("hex").slice(0, 32)]
  .map((c) => String.fromCharCode(97 + parseInt(c, 16)))
  .join("");
const page = browser.pages()[0] || (await browser.newPage());
page.on("pageerror", (e) => console.log("PAGEERROR:", e.message.slice(0, 200)));
page.on("console", (m) => { if (m.text().includes("DBG169")) console.log("  [EXT]", m.text()); });

const linksState = () => page.evaluate(() => JSON.parse(localStorage.getItem("start:links")));
const popoverOpen = () => page.evaluate(() => !!document.querySelector("[data-cl-folder-popover]"));
const ghostInFlight = () => page.evaluate(() => !!document.querySelector('div[class*="z-[80]"]'));

const seedWall = async () => {
  await page.evaluate(() => {
    localStorage.setItem("start:links", JSON.stringify([
      { id: "t1", name: "甲站", url: "https://t1.example.com" },
      { id: "t2", name: "乙站", url: "https://t2.example.com" },
      { id: "fd1", name: "诊断夹", folder: true, children: [
        { id: "a1", name: "站1", url: "https://a1.example.com" },
        { id: "a2", name: "站2", url: "https://a2.example.com" },
        { id: "a3", name: "站3", url: "https://a3.example.com" },
        { id: "a4", name: "站4", url: "https://a4.example.com" },
      ] },
      { id: "fd2", name: "第二夹", folder: true, children: [
        { id: "b1", name: "乙1", url: "https://b1.example.com" },
        { id: "b2", name: "乙2", url: "https://b2.example.com" },
        { id: "b3", name: "乙3", url: "https://b3.example.com" },
      ] },
    ]));
  });
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(1800);
  await page.keyboard.press("Alt+v");
  await page.waitForTimeout(1000);
};

await page.goto(`chrome-extension://${extId}/index.html`, { waitUntil: "load", timeout: 60000 });
await page.waitForTimeout(2200);
await page.evaluate(() => {
  localStorage.setItem("start:settings", JSON.stringify({ iconStyle: "letter", linksForm: "drawer" }));
});
await seedWall();

console.log("=== 取证① 满驻留松手飞入，localStorage 高频采样 ===");
{
  const a = await page.locator('.cl-links-drawer [data-entry-id="t1"]').first().boundingBox();
  const b = await page.locator('.cl-links-drawer [data-entry-id="fd1"]').first().boundingBox();
  const ax = a.x + a.width / 2, ay = a.y + a.height / 2;
  const bx = b.x + b.width / 2, by = b.y + b.height / 2;
  await page.mouse.move(ax, ay);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) { await page.mouse.move(ax + ((bx - ax) * i) / 8, ay + ((by - ay) * i) / 8); await page.waitForTimeout(24); }
  await page.waitForTimeout(3600);
  const armed = await page.evaluate(() => {
    const el = document.querySelector('.cl-links-drawer [data-entry-id="fd1"] .tile-shell.h-16');
    return el ? getComputedStyle(el.parentElement).scale : "?";
  });
  console.log("  armed scale:", armed);
  await page.mouse.up();
  for (let t = 0; t <= 2200; t += 110) {
    const g = await ghostInFlight();
    const st = await linksState();
    const fd = st.find((e) => e.id === "fd1");
    const inFolder = fd.children.some((c) => c.id === "t1");
    const onWall = st.some((e) => e.id === "t1");
    if (g || inFolder || onWall !== true || t % 550 === 0)
      console.log(`  t+${String(t).padStart(4)}ms ghost=${g ? 1 : 0} t1夹内=${inFolder ? 1 : 0} t1墙上=${onWall ? 1 : 0} fd1=${fd.children.length}`);
    if (!g && t > 700) break;
    await page.waitForTimeout(110);
  }
  const st = await linksState();
  console.log("  FINAL:", JSON.stringify(st.map((e) => (e.folder ? `${e.id}[${e.children.map((c) => c.id).join(",")}]` : e.id))));
}

console.log("=== 取证② 夹内拖出 1.2s 拉回松手，popover 存在性高频采样 ===");
{
  await seedWall();
  await page.locator('.cl-links-drawer [data-entry-id="fd1"] [data-cl-tile]').first().click();
  await page.waitForTimeout(900);
  console.log("  popover open:", await popoverOpen());
  const pop = await page.locator("[data-cl-folder-popover]").boundingBox();
  const a1b = await page.locator('[data-cl-folder-popover] [data-entry-id="a1"]').boundingBox();
  const ax = a1b.x + a1b.width / 2, ay = a1b.y + a1b.height / 2;
  const ox = Math.max(30, pop.x - 240), oy = Math.min(860, pop.y + 330);
  await page.mouse.move(ax, ay);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) { await page.mouse.move(ax + ((ox - ax) * i) / 12, ay + ((oy - ay) * i) / 12); await page.waitForTimeout(26); }
  console.log("  出面板驻留 1200ms...", "t="+Math.round(performance.now()));
  await page.waitForTimeout(1200);
  console.log("  popover after hold:", await popoverOpen(), "t="+Math.round(performance.now()));
  for (let i = 1; i <= 12; i++) { await page.mouse.move(ox + ((ax - ox) * i) / 12, oy + ((ay - oy) * i) / 12); await page.waitForTimeout(26); }
  console.log("  已拉回面板内，popover:", await popoverOpen(), "t="+Math.round(performance.now()));
  await page.mouse.up();
  for (let t = 0; t <= 1200; t += 120) {
    const p = await popoverOpen();
    const st = await linksState();
    const fd = st.find((e) => e.id === "fd1");
    console.log(`  t+${String(t).padStart(4)}ms popover=${p ? 1 : 0} fd1.children=${fd.children.map((c) => c.id).join(",")} 墙=${st.filter((e) => !e.folder).map((e) => e.id).join(",")}`);
    if (!p) break;
    await page.waitForTimeout(120);
  }
}

await browser.close();
console.log("DBG-169 done");
