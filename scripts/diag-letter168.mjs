// diag-letter168.mjs — 字母回退格：span 盒 vs 格 vs 字形墨迹三层对位测量
import { chromium } from "playwright-core";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";

const ZIP = "/home/z/beta-wt/download/v8.7.167/ChuShi-NewTab-v8.7.167.zip";
const STAGE = "/tmp/ext-diag168d";
const PROFILE = "/tmp/ext-diag168d-profile";
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
page.on("pageerror", (e) => console.log("PAGEERROR:", e.message.slice(0, 160)));

const mk = (n, pfx, nm) =>
  Array.from({ length: n }, (_, i) => ({ id: pfx + (i + 1), name: nm + (i + 1), url: `https://${pfx}${i + 1}.example.com` }));
const LINKS = JSON.stringify([
  { id: "fd1", name: "诊断夹", folder: true, children: mk(4, "a", "站") },
  { id: "t1", name: "甲站", url: "https://t1.example.com" },
]);

await page.goto(`chrome-extension://${extId}/index.html`, { waitUntil: "load", timeout: 60000 });
await page.waitForTimeout(2200);
await page.evaluate((l) => localStorage.setItem("start:links", l), LINKS);
await page.evaluate(() => localStorage.setItem("start:settings", JSON.stringify({ iconStyle: "letter", linksForm: "drawer" })));
await page.reload({ waitUntil: "load" });
await page.waitForTimeout(2000);
await page.keyboard.press("Alt+v");
await page.waitForTimeout(1200);

const info = await page.evaluate(() => {
  const shell = document.querySelector('[data-entry-id="fd1"] .tile-shell.h-16');
  if (!shell) return null;
  const cells = [...shell.querySelectorAll("[data-cl-folder-grid] > span")];
  const sr = shell.getBoundingClientRect();
  const scx = sr.left + sr.width / 2;
  return cells.slice(0, 1).map((cell) => {
    const cr = cell.getBoundingClientRect();
    // bare 字母格：span > span（字母 span）
    const inner = [...cell.querySelectorAll(":scope > span")];
    const letter = inner[inner.length - 1] || cell;
    const lr = letter.getBoundingClientRect();
    const cs = getComputedStyle(letter);
    const rng = document.createRange();
    rng.selectNodeContents(letter);
    const tr = rng.getBoundingClientRect();
    return {
      cell: { cx: +(cr.left + cr.width / 2 - scx).toFixed(2), w: +cr.width.toFixed(2) },
      letterBox: { cx: +(lr.left + lr.width / 2 - scx).toFixed(2), w: +lr.width.toFixed(2) },
      textBox: { cx: +(tr.left + tr.width / 2 - scx).toFixed(2), w: +tr.width.toFixed(2) },
      fontFamily: cs.fontFamily.slice(0, 80),
      fontStyle: cs.fontStyle,
      fontSize: cs.fontSize,
      letterSpacing: cs.letterSpacing,
      fontWeight: cs.fontWeight,
      renderedFonts: (() => { try { return [...new Set([...document.fonts].map((f) => f.family))].slice(0, 8); } catch { return []; } })(),
    };
  });
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
console.log("LETTER DIAG DONE");
