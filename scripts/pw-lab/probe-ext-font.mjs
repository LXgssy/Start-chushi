import { chromium } from "playwright-core";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";

/* probe-ext-font.mjs — 扩展环境字体加载探测：
 * Geist 可变字体是否真正加载 / 时钟 computed font-family / 数字墨迹中心 vs 冒号圆点 */

const STAGE = "/tmp/ext-stage";
if (!existsSync(`${STAGE}/manifest.json`)) {
  console.error("STAGE 不存在，先准备 /tmp/ext-stage");
  process.exit(2);
}
const browser = await chromium.launchPersistentContext("/tmp/ext-font-profile", {
  headless: true,
  channel: "chromium",
  args: [
    `--headless=new`,
    `--autoplay-policy=no-user-gesture-required`,
    `--disable-extensions-except=${STAGE}`,
    `--load-extension=${STAGE}`,
  ],
});
const extId = createHash("sha256").update(STAGE).digest("hex").slice(0, 32)
  .split("").map((c) => "abcdefghijklmnop"[parseInt(c, 16)]).join("");
console.log("extId:", extId);

const page = await browser.newPage();
const failed = [];
page.on("requestfailed", (r) => failed.push(`${r.url().slice(-60)} :: ${r.failure()?.errorText}`));
page.on("pageerror", (e) => failed.push(`pageerror: ${e}`));
await page.goto(`chrome-extension://${extId}/index.html`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);

const probe = await page.evaluate(async () => {
  await document.fonts.ready;
  const clock = document.querySelector(".clock-text");
  const cs = clock ? getComputedStyle(clock) : null;
  const digit = document.querySelector(".digit-slot span:not(.colon-slot span)");
  // 实测第一个数字的墨迹盒（字符渲染盒）
  let inkRect = null, colonRect = null, dotTop = null, dotBottom = null;
  if (digit) {
    const r = digit.getBoundingClientRect();
    inkRect = { top: r.top, height: r.height, fontSize: cs.fontSize };
  }
  const dots = document.querySelectorAll(".colon-slot .rounded-full");
  if (dots.length === 2) {
    const a = dots[0].getBoundingClientRect();
    const b = dots[1].getBoundingClientRect();
    colonRect = { slotTop: dots[0].closest(".colon-slot").getBoundingClientRect().top, slotH: dots[0].closest(".colon-slot").getBoundingClientRect().height };
    dotTop = a.top + a.height / 2;
    dotBottom = b.top + b.height / 2;
  }
  return {
    fontsCheck150: document.fonts.check("150 1em Geist"),
    fontsCheck400: document.fonts.check("400 1em Geist"),
    geistFaces: [...document.fonts].filter(f => f.family.includes("Geist")).map(f => `${f.family}/${f.weight}/${f.status}`).slice(0, 8),
    computedFamily: cs?.fontFamily?.slice(0, 80),
    fontSize: cs?.fontSize,
    fontWeight: cs?.fontWeight,
    inkRect, colonRect, dotTop, dotBottom,
    inkCenterFromSlotTop: inkRect && colonRect ? (inkRect.top + inkRect.height / 2 - colonRect.slotTop) / parseFloat(inkRect.fontSize) : null,
  };
});
console.log(JSON.stringify(probe, null, 2));
console.log("\nfailed requests:", failed.slice(0, 10));
await browser.close();
