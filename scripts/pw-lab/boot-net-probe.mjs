/* 启动期网络探针 v2：
   轮1 normal：正常网络，记录 boot 遮罩消失时刻 + 全部非扩展请求。
   轮2 poor：所有 http(s) 请求永久挂起（弱网极限），观察 boot 是否卡死。 */
import { chromium } from "playwright";
import { createHash } from "crypto";

const EXT = "/tmp/ext-stage";
const extId = createHash("sha256").update(EXT).digest("hex").slice(0, 32)
  .split("").map((c) => "abcdefghijklmnop"[parseInt(c, 16)]).join("");
console.log("extId:", extId);

async function runOnce(mode) {
  const profile = `/tmp/ext-probe-${mode}`;
  const ctx = await chromium.launchPersistentContext(profile, {
    headless: true,
    channel: "chromium",
    args: [`--headless=new`, `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  });
  if (mode === "poor") {
    // 所有 http(s) 请求永久挂起（不 respond 不 abort）——弱网极限模拟
    await ctx.route(/^https?:\/\//, () => { /* hang forever */ });
  }
  const reqs = [], failed = [];
  ctx.on("request", (r) => { const u = r.url(); if (!u.startsWith("chrome-extension://")) reqs.push(r.isNavigationRequest() ? "NAV " + u : "GET " + u); });
  ctx.on("requestfailed", (r) => { const u = r.url(); if (!u.startsWith("chrome-extension://")) failed.push(u + " :: " + (r.failure()?.errorText || "")); });

  const page = await ctx.newPage();
  const t0 = Date.now();
  let bootGone = -1, bootStill = false;
  try {
    await page.goto(`chrome-extension://${extId}/shell.html`, { waitUntil: "commit", timeout: 20000 });
    for (let i = 0; i < 200; i++) {
      const has = await page.evaluate(() => !!document.getElementById("csShellBoot")).catch(() => null);
      if (has === false) { bootGone = Date.now() - t0; break; }
      if (has === null) break;
      await page.waitForTimeout(100);
    }
    if (bootGone < 0) bootStill = true;
  } catch (e) { failed.push("goto: " + String(e).slice(0, 120)); }
  await page.waitForTimeout(2500);
  const state = await page.evaluate(() => {
    const f = document.getElementById("csShellFrame");
    let inner = null;
    try { inner = f?.contentDocument ? (f.contentDocument.body?.innerText || "").slice(0, 60) : "no-doc"; } catch { inner = "cross"; }
    return { boot: !!document.getElementById("csShellBoot"), src: f?.getAttribute("src"), inner };
  }).catch((e) => ({ evalErr: String(e).slice(0, 120) }));
  console.log(`=== ${mode} === bootGoneMs=${bootGone} bootStill=${bootStill}`);
  console.log("state:", JSON.stringify(state));
  console.log("non-ext requests:", reqs.length ? reqs.slice(0, 12) : "(zero)");
  console.log("failed:", failed.length ? failed.slice(0, 6) : "(none)");
  await ctx.close();
  return { bootGone, reqs: reqs.length, state };
}

await runOnce("normal");
await runOnce("poor");
console.log("PROBE DONE");
