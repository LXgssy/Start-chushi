// diag-shape168.mjs — v8.7.168 ③号问题诊断：悬停文件夹磁贴，迷你格站点图标是否位移
// 量法：tile-shell rect 与每枚 mini-cell img rect 的相对偏移（img.center - shell.center），
// 静息 vs 悬停 500ms（transition 350ms 播完）各量一轮；抽屉(h-16)与常驻(h-14)两形态各测。
import { chromium } from "playwright-core";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";

const ZIP = "/home/z/beta-wt/download/v8.7.167/ChuShi-NewTab-v8.7.167.zip";
const STAGE = "/tmp/ext-diag168";
const PROFILE = "/tmp/ext-diag168-profile";
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
page.on("pageerror", (e) => console.log("PAGEERROR:", e.message.slice(0, 120)));

const mk = (n, pfx, nm) =>
  Array.from({ length: n }, (_, i) => ({ id: pfx + (i + 1), name: nm + (i + 1), url: `https://${pfx}${i + 1}.example.com` }));
const LINKS = JSON.stringify([
  { id: "fd1", name: "诊断夹", folder: true, children: mk(4, "a", "站") },
  { id: "t1", name: "甲站", url: "https://t1.example.com" },
]);

async function measureOnce(label, form) {
  return await page.evaluate(
    ([label, form]) => {
      const shell = document.querySelector(`[data-entry-id="fd1"] .tile-shell.${form === "drawer" ? "h-16" : "h-14"}`);
      const grid = document.querySelector(`[data-entry-id="fd1"] .tile-shell.${form === "drawer" ? "h-16" : "h-14"} [data-cl-folder-grid]`);
      const imgs = grid ? [...grid.querySelectorAll("img")] : [];
      if (!shell || imgs.length === 0) return null;
    const s = shell.getBoundingClientRect();
    const scx = s.left + s.width / 2;
    const scy = s.top + s.height / 2;
    return {
      label,
      shell: { w: +s.width.toFixed(2), h: +s.height.toFixed(2), cx: +scx.toFixed(2), cy: +scy.toFixed(2) },
      icons: imgs.map((im) => {
        const r = im.getBoundingClientRect();
        return {
          dx: +(r.left + r.width / 2 - scx).toFixed(2),
          dy: +(r.top + r.height / 2 - scy).toFixed(2),
          w: +r.width.toFixed(2),
          h: +r.height.toFixed(2),
        };
      }),
    };
    },
    [label, form]
  );
}

async function runForm(form) {
  await page.goto(`chrome-extension://${extId}/index.html`, { waitUntil: "load", timeout: 60000 });
  await page.waitForTimeout(2200); // 等应用 boot 写完默认数据，避免默认 seed 覆写我们的数据
  await page.evaluate(
    ([links, st]) => {
      localStorage.setItem("start:links", links);
      localStorage.setItem("start:settings", st);
    },
    [LINKS, JSON.stringify({ iconStyle: "favicon", linksForm: form })]
  );
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(2000);
  // 抽屉形态需唤出抽屉（alt+v 快捷键，避开中键落点守卫）
  if (form === "drawer") {
    await page.keyboard.press("Alt+v");
    await page.waitForTimeout(1200);
  }
  const rest = await measureOnce("rest", form);
  const box = await page
    .locator(`[data-entry-id="fd1"] .tile-shell.${form === "drawer" ? "h-16" : "h-14"}`)
    .first()
    .boundingBox();
  if (!box) {
    console.log(`[${form}] shell not found`);
    return;
  }
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 });
  await page.waitForTimeout(140); // 过渡中段
  const mid = await measureOnce("mid-140ms", form);
  await page.waitForTimeout(400); // 过渡播完
  const hover = await measureOnce("hover-500ms", form);
  console.log(`\n===== form=${form} =====`);
  console.log("rest ", JSON.stringify(rest));
  console.log("mid  ", JSON.stringify(mid));
  console.log("hover", JSON.stringify(hover));
  await page.screenshot({ path: `/tmp/diag168-${form}.png` });
}

await runForm("drawer");
await runForm("docked");
await browser.close();
console.log("\nDIAG DONE");
