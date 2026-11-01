/* v8.7.152 修复验证 v2：弱网卡加载根修 + 兜底 + 转圈跟随强调色 */
import { chromium } from "playwright";
import { createHash } from "crypto";

const EXT = "/tmp/ext-stage";
const extId = createHash("sha256").update(EXT).digest("hex").slice(0, 32)
  .split("").map((c) => "abcdefghijklmnop"[parseInt(c, 16)]).join("");
let pass = 0, fail = 0;
const ck = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`✓ ${name}`); }
  else { fail++; console.log(`✗ ${name} ${detail}`); }
};

/* 打开 shell：从 commit 起 60ms 步进轮询，捕获 (boot 期内) wp 是否曾入 DOM、
   boot 消失时刻、boot 期内首见的转圈颜色 */
async function openShell(ctx, { maxMs = 20000 } = {}) {
  const t0 = Date.now();
  const shell = await ctx.newPage();
  let bootGone = -1, wpPreComplete = false, dotColor = null;
  await shell.goto(`chrome-extension://${extId}/shell.html`, { waitUntil: "commit", timeout: 20000 });
  for (let i = 0; i < maxMs / 60; i++) {
    const s = await shell.evaluate(() => {
      const boot = document.getElementById("csShellBoot");
      const dot = boot?.querySelector(".cs-boot-dot");
      let wp = null, rs = null;
      try {
        const d = document.getElementById("csShellFrame")?.contentDocument;
        wp = !!d?.querySelector("img[data-wallpaper]");
        rs = d?.readyState || null;
      } catch { /* cross */ }
      return { boot: !!boot, dot: dot ? getComputedStyle(dot).borderTopColor : null, wp, rs };
    }).catch(() => null);
    if (s) {
      if (s.boot) {
        /* 铁律取样窗口：文档尚未 complete（load 未发）时壁纸媒体必须零入树。
           load 已发后的淡出期壁纸挂载属设计内行为，不计。 */
        if (s.wp && s.rs && s.rs !== "complete") wpPreComplete = true;
        if (s.dot) dotColor = s.dot;
      } else if (bootGone < 0) { bootGone = Date.now() - t0; break; }
    }
    await shell.waitForTimeout(60);
  }
  return { shell, bootGone, wpPreComplete, dotColor };
}

async function newCtx(profile, hangHttp = true) {
  const ctx = await chromium.launchPersistentContext(profile, {
    headless: true, channel: "chromium",
    args: [`--headless=new`, `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  });
  if (hangHttp) await ctx.route(/^https?:\/\//, (r) => { void r; });
  return ctx;
}

async function seed(ctx, settings) {
  const s = await ctx.newPage();
  await s.addInitScript((v) => localStorage.setItem("start:settings", JSON.stringify(v)), settings);
  await s.goto(`chrome-extension://${extId}/index.html`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await s.waitForTimeout(600);
  await s.close();
}

/* —— V1 根修：掠影 unsplash 壁纸 + 弱网 ×3 —— */
{
  const ctx = await newCtx("/tmp/ext-v152-v1b");
  await seed(ctx, { background: "photo", photoId: "mist-lake", accent: "#ff3b30", themeMode: "dark" });
  const rounds = [];
  for (let i = 0; i < 3; i++) {
    const r = await openShell(ctx);
    await r.shell.waitForTimeout(900);
    const fin = await r.shell.evaluate(() => {
      const d = document.getElementById("csShellFrame")?.contentDocument;
      return { complete: d?.readyState === "complete", wp: !!d?.querySelector("img[data-wallpaper]"), txt: (d?.body?.innerText || "").slice(0, 10) };
    }).catch(() => ({}));
    rounds.push({ bootGone: r.bootGone, wpPreComplete: r.wpPreComplete, ...fin });
    await r.shell.close();
  }
  console.log("V1:", JSON.stringify(rounds));
  ck("V1 弱网×3 快速 fadeBoot(<4s)", rounds.every((r) => r.bootGone > 0 && r.bootGone < 4000), JSON.stringify(rounds.map((r) => r.bootGone)));
  ck("V1 boot 可见期壁纸媒体零入树", rounds.every((r) => !r.wpPreComplete));
  ck("V1 文档最终 complete + 页面渲染", rounds.every((r) => r.complete && r.txt?.includes("月")), JSON.stringify(rounds.map((r) => [r.complete, r.txt])));
  ck("V1 load 后壁纸正常挂载（弱网挂起也不阻塞）", rounds.every((r) => r.wp === true));
  await ctx.close();
}

/* —— V2 兜底：人工延迟 load（挂起本地字体）→ 8s 硬揭 —— */
{
  const ctx = await newCtx("/tmp/ext-v152-v2b");
  await ctx.route(/chrome-extension:\/\/[^/]+\/next\/static\/media\/.*\.woff2$/, () => { void 0; });
  await seed(ctx, { background: "photo", photoId: "mist-lake", themeMode: "dark" });
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
  ck("V2 人工延迟 load 下 8s 兜底硬揭", bootGone > 7500 && bootGone <= 9500, `bootGone=${bootGone}`);
  await ctx.close();
}

/* —— V3 强调色：cardAcc 权威 / localStorage / 缺省回落 —— */
{
  const ctx = await newCtx("/tmp/ext-v152-v3b", false);
  await seed(ctx, { accent: "#ff3b30" });
  const r1 = await openShell(ctx);
  ck("V3 cardAcc 未设 → localStorage accent (#ff3b30)", r1.dotColor === "rgb(255, 59, 48)", `got=${r1.dotColor}`);
  await r1.shell.close();
  const s2 = await ctx.newPage();
  await s2.goto(`chrome-extension://${extId}/index.html`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await s2.evaluate(async () => {
    localStorage.setItem("start:settings", JSON.stringify({ accent: "#ff3b30" }));
    await new Promise((res) => chrome.storage.local.set({ cardAcc: "#00ffcc" }, res));
  });
  await s2.close();
  const r2 = await openShell(ctx);
  ck("V3 cardAcc 权威覆盖 (#00ffcc)", r2.dotColor === "rgb(0, 255, 204)", `got=${r2.dotColor}`);
  await r2.shell.close();
  const s3 = await ctx.newPage();
  await s3.goto(`chrome-extension://${extId}/index.html`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await s3.evaluate(() => localStorage.removeItem("start:settings"));
  await s3.evaluate(async () => { await new Promise((res) => chrome.storage.local.remove("cardAcc", res)); });
  await s3.close();
  const r3 = await openShell(ctx);
  ck("V3 缺省回落应用默认 (#8b5cf6)", r3.dotColor === "rgb(139, 92, 246)", `got=${r3.dotColor}`);
  await r3.shell.close();
  await ctx.close();
}

/* —— V4 正常网回归 + 掠影本地帧（国风十帧不应被门槛波及） —— */
{
  const ctx = await newCtx("/tmp/ext-v152-v4b", false);
  const errs = [];
  await seed(ctx, { background: "photo", photoId: "great-wall-sunrise", themeMode: "dark" });
  const r = await openShell(ctx);
  r.shell.on("pageerror", (e) => errs.push(String(e).slice(0, 100)));
  const fin = await r.shell.evaluate(() => {
    const d = document.getElementById("csShellFrame")?.contentDocument;
    const img = d?.querySelector("img[data-wallpaper]");
    return { wpLocal: !!img && (img.getAttribute("src") || "").includes("/gallery/"), complete: d?.readyState === "complete" };
  }).catch(() => ({}));
  ck("V4 本地帧壁纸 boot 期即时在树（门槛不波及本地源）", fin.wpLocal === true, JSON.stringify(fin));
  ck("V4 本地帧下文档 complete", fin.complete === true);
  await r.shell.waitForTimeout(1200);
  ck("V4 零 pageerror", errs.length === 0, errs.join("|"));
  await ctx.close();
}

console.log(`\nRESULT: PASS=${pass} FAIL=${fail}`);
process.exit(fail ? 1 : 0);
