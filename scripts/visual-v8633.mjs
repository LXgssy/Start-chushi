// v8.6.33 视觉验证：禅模式进出磁贴磨砂存活（像素级 MAD）
// A（禅前）→ 进禅 1.1s（B：磁贴零毒隐没）→ 退禅 1.5s（C：磁贴聚拢复现）
// MAD(A,C) 应≈0（磨砂活着=磁贴区底样复原）；MAD(A,B) 应显著（zen CSS 生效 sanity）。
// 若磨砂死于禅过渡，C 区磁贴退化为锐利壁纸直出，MAD(A,C) 显著增大。
import { chromium } from "playwright-core";
import crypto from "crypto";
import { execSync } from "child_process";

const ROOT = "/tmp/ext-v869";
const SHOTS = "/tmp/v8633-visual";
execSync(`mkdir -p ${SHOTS}`);
const h = crypto.createHash("sha256").update(Buffer.from(ROOT)).digest("hex").slice(0, 32);
const EXT_ID = [...h].map((c) => String.fromCharCode(97 + (parseInt(c, 16) % 26))).join("");
const EXT_URL = (p) => `chrome-extension://${EXT_ID}/${p}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ctx = await chromium.launchPersistentContext("/tmp/ext-v869-profile", {
  channel: "chromium", headless: true,
  args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`,
    "--no-first-run", "--no-sandbox"],
});
let page = ctx.pages().find((p) => p.url().startsWith(EXT_URL("shell.html"))) || (await ctx.newPage());
await page.goto(EXT_URL("shell.html"), { waitUntil: "load" });

const findAf = async () => {
  await page.waitForFunction(() => {
    const f = document.getElementById("csShellFrame");
    return f && f.src && f.src.endsWith("index.html");
  }, { timeout: 10000 }).catch(() => null);
  await sleep(2600);
  const af = page.frames().find((f) => f !== page.mainFrame() && /\/index\.html$/.test(f.url()));
  if (!af) throw new Error("appFrame 未建立");
  return af;
};
let af = await findAf();

// docked 磁贴墙
await af.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem("start:settings") || "{}");
  raw.linksForm = "docked";
  localStorage.setItem("start:settings", JSON.stringify(raw));
});
await page.reload({ waitUntil: "load" });
af = await findAf();

const box = await af.evaluate(() => {
  const el = document.querySelector("section.zen-gone");
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
});
if (!box || box.width < 40) throw new Error("section.zen-gone 未找到: " + JSON.stringify(box));
console.log("tiles box:", JSON.stringify(box));

const shot = (n) => page.screenshot({ path: `${SHOTS}/${n}.png`, clip: box });
await shot("A-before-zen");
await af.evaluate(() => document.documentElement.classList.add("zen"));
await sleep(1100);
await shot("B-in-zen");
await af.evaluate(() => document.documentElement.classList.remove("zen"));
await sleep(1500);
await shot("C-after-zen");
console.log("[DONE] 截图 ->", SHOTS);
await ctx.close();
