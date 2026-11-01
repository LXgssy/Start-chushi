/* 确定性复现：掠影（unsplash 远程图库壁纸）+ 弱网 + 延迟 load 事件。
   预期：boot 遮罩永挂 = 用户实测「一直转圈卡加载」。 */
import { chromium } from "playwright";
import { createHash } from "crypto";

const EXT = "/tmp/ext-stage";
const extId = createHash("sha256").update(EXT).digest("hex").slice(0, 32)
  .split("").map((c) => "abcdefghijklmnop"[parseInt(c, 16)]).join("");

const ctx = await chromium.launchPersistentContext("/tmp/ext-probe-hang", {
  headless: true, channel: "chromium",
  args: [`--headless=new`, `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});
// 弱网极限：所有 http(s) 永久挂起 + 本地字体挂起（推迟 iframe load 事件 → 竞速必输）
await ctx.route(/^https?:\/\//, () => {});
await ctx.route(/chrome-extension:\/\/[^/]+\/next\/static\/media\/.*\.woff2$/, () => {});

const seeder = await ctx.newPage();
await seeder.goto(`chrome-extension://${extId}/index.html`, { waitUntil: "domcontentloaded", timeout: 30000 });
await seeder.evaluate(() => {
  localStorage.setItem("start:settings", JSON.stringify({
    background: "photo", photoId: "mist-lake", accent: "#ff3b30", themeMode: "dark",
  }));
});
await seeder.close();

const pending = [];
ctx.on("request", (r) => {
  const u = r.url();
  if (!u.startsWith("chrome-extension://")) pending.push(u.slice(0, 90));
});
const t0 = Date.now();
const shell = await ctx.newPage();
let bootGone = -1;
await shell.goto(`chrome-extension://${extId}/shell.html`, { waitUntil: "commit", timeout: 20000 });
for (let i = 0; i < 200; i++) {
  const has = await shell.evaluate(() => !!document.getElementById("csShellBoot")).catch(() => null);
  if (has === false) { bootGone = Date.now() - t0; break; }
  if (has === null) break;
  await shell.waitForTimeout(100);
}
await shell.waitForTimeout(2000);
const iframeState = await shell.evaluate(() => {
  const f = document.getElementById("csShellFrame");
  try {
    const d = f.contentDocument;
    const img = d.querySelector("img[data-wallpaper]");
    return {
      readyState: d.readyState,
      wallpaperImgInDom: !!img,
      wallpaperSrc: img ? img.getAttribute("src")?.slice(0, 60) : null,
      imgComplete: img ? img.complete : null,
    };
  } catch { return { err: "cross" }; }
}).catch((e) => ({ evalErr: String(e).slice(0, 100) }));
console.log(`REPRO: bootGoneMs=${bootGone} (=-1 即永挂)`);
console.log("iframe:", JSON.stringify(iframeState));
console.log("pending non-ext:", pending.slice(0, 4));
await ctx.close();
console.log("REPRO DONE");
