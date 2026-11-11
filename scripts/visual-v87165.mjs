// visual-v87165.mjs — 视觉实拍：迷你格方形律 grid2/grid3 双形态 + 视频壁纸拖拽帧
import { chromium } from "playwright-core";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";

const ZIP = "/home/z/Start-chushi/download/v8.7.165/ChuShi-NewTab-v8.7.165.zip";
const STAGE = "/tmp/ext-vis165";
const PROFILE = "/tmp/ext-vis165-profile";
const CHROME = "/home/z/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome";
const VID = "/tmp/wall-test.mp4";
const OUT = "/home/z/Start-chushi/download/v8.7.165";

fs.rmSync(STAGE, { recursive: true, force: true });
fs.mkdirSync(STAGE, { recursive: true });
execSync(`cd ${STAGE} && unzip -q ${ZIP}`);
fs.rmSync(PROFILE, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const B64 = fs.existsSync(VID) ? fs.readFileSync(VID).toString("base64") : null;

const browser = await chromium.launchPersistentContext(PROFILE, {
  executablePath: CHROME,
  args: ["--no-sandbox", `--disable-extensions-except=${STAGE}`, `--load-extension=${STAGE}`, "--autoplay-policy=no-user-gesture-required"],
  viewport: { width: 1280, height: 900 },
});
const extId = [...createHash("sha256").update(STAGE).digest("hex").slice(0, 32)]
  .map((c) => String.fromCharCode(97 + parseInt(c, 16)))
  .join("");
const page = browser.pages()[0] || (await browser.newPage());
await page.goto(`chrome-extension://${extId}/index.html`, { waitUntil: "load", timeout: 60000 });
await page.waitForTimeout(1200);

const mk = (n, pfx, nm) => Array.from({ length: n }, (_, i) => ({ id: pfx + (i + 1), name: nm + (i + 1), url: `https://${pfx}${i + 1}.example.com` }));
const LINKS = JSON.stringify([
  { id: "t1", name: "甲站", url: "https://t1.example.com" },
  { id: "fd2", name: "两站夹", folder: true, children: mk(2, "a", "站") },
  { id: "fd3", name: "三站夹", folder: true, children: mk(3, "b", "站") },
  { id: "fd5", name: "五站夹", folder: true, children: mk(5, "c", "站") },
  { id: "fd10", name: "满夹", folder: true, children: mk(10, "d", "满") },
]);

if (B64) {
  await page.evaluate(async ([b64, links]) => {
    localStorage.setItem("start:settings", JSON.stringify({ iconStyle: "favicon", linksForm: "docked", photoId: "custom", wallpaperUrl: "", background: "photo" }));
    localStorage.setItem("start:links", links);
    const bin = atob(b64); const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const blob = new Blob([u8], { type: "video/mp4" });
    await new Promise((res, rej) => {
      const req = indexedDB.open("start-db", 1);
      req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains("kv")) req.result.createObjectStore("kv"); };
      req.onsuccess = () => {
        const db = req.result; const tx = db.transaction("kv", "readwrite");
        tx.objectStore("kv").put(blob, "custom-wallpaper");
        tx.oncomplete = () => { db.close(); res(); }; tx.onerror = rej;
      };
      req.onerror = rej;
    });
  }, [B64, LINKS]);
} else {
  await page.evaluate(([links]) => {
    localStorage.setItem("start:settings", JSON.stringify({ iconStyle: "favicon", linksForm: "docked" }));
    localStorage.setItem("start:links", links);
  }, [LINKS]);
}
await page.reload({ waitUntil: "load" });
await page.waitForTimeout(3000);
await page.screenshot({ path: `${OUT}/preview-square-grid2.png` });

// grid3
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem("start:settings"));
  s.folderIconStyle = "grid3";
  localStorage.setItem("start:settings", JSON.stringify(s));
});
await page.reload({ waitUntil: "load" });
await page.waitForTimeout(3000);
await page.screenshot({ path: `${OUT}/preview-square-grid3.png` });

// morph 展开态（皮层方形）
await page.locator('[data-entry-id="fd5"]').click();
await page.waitForTimeout(1000);
await page.screenshot({ path: `${OUT}/preview-morph-open-grid3.png` });

await browser.close();
console.log("VISUAL DONE ->", OUT);
