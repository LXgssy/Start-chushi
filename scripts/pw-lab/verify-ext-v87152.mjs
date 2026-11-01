/* v8.7.152 真扩展冒烟：弱网卡加载根修 + 转圈跟随强调色
 * 链路：解包交付 zip → load-extension（非 stage，验真产物）→
 * 【B 系列·本轮核心】boot 矩阵：
 *   B1 弱网+掠影 unsplash 壁纸 ×2 标签页：boot 快速 fadeBoot(<4s)，此前
 *      概率性永挂（bootGone=-1 实测复现）；
 *   B2 load 未发（readyState≠complete）期间远程壁纸媒体零入树（门槛律）；
 *   B3 load 后壁纸正常挂载（弱网挂起也不阻塞渲染）；
 *   B4 favicon 竞速链门槛：默认磁贴+弱网，new Image() 预载悬挂不再拖死
 *      load（boot <4s）；
 *   B5 快照路由（IDB 种入高版本快照）+弱网：boot <4s；
 *   B6 人工延迟 load（挂起本地字体）→ 8s 壳层兜底硬揭；
 * 【A 系列·本轮核心二】转圈强调色：localStorage accent / cardAcc 权威
 *   覆盖 / 缺省回落默认 #8b5cf6 三档；
 * 【R 系列·未动区回归】正常网渲染 + 掠影本地帧即时在树（门槛不波及本地
 *   源）+ 嗅探浮窗挂载（MOUNT_VER v8.7.151 未动）+ pageerror=0。 */
import { chromium } from "playwright-core";
import { execSync } from "child_process";
import { mkdtempSync, rmSync, readFileSync, readdirSync, statSync } from "fs";
import { tmpdir } from "os";
import { join, relative } from "path";
import { createHash } from "crypto";

const ZIP = "/home/z/beta-wt/download/v8.7.152/ChuShi-NewTab-v8.7.152.zip";
const SNAPZIP = "/home/z/beta-wt/download/v8.7.152/ChuShi-CloudSnapshot-v8.7.152.zip";
const extDir = mkdtempSync(join(tmpdir(), "ext-v152-"));
execSync(`unzip -qo "${ZIP}" -d ${extDir}`);
const mf = JSON.parse(readFileSync(extDir + "/manifest.json", "utf8"));
if (mf.version !== "8.7.152") { console.error("✗ M0 manifest 版本异常 " + mf.version); process.exit(1); }
console.log("✓ M0 manifest 8.7.152");

const extId = createHash("sha256").update(extDir).digest("hex").slice(0, 32)
  .split("").map((c) => "abcdefghijklmnop"[parseInt(c, 16)]).join("");
let pass = 0, fail = 0, errs = [];
const ck = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`✓ ${name}`); }
  else { fail++; console.log(`✗ ${name} ${detail}`); }
};

async function newCtx(profile, { hangHttp = true, hangFont = false } = {}) {
  const ctx = await chromium.launchPersistentContext(profile, {
    headless: true, channel: "chromium",
    args: [`--headless=new`, `--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`],
  });
  if (hangHttp) await ctx.route(/^https?:\/\//, () => { void 0; });
  if (hangFont) await ctx.route(/chrome-extension:\/\/[^/]+\/next\/static\/media\/.*\.woff2$/, () => { void 0; });
  ctx.on("pageerror", (e) => errs.push(String(e).slice(0, 120)));
  return ctx;
}

async function seedSettings(ctx, settings) {
  const s = await ctx.newPage();
  await s.addInitScript((v) => localStorage.setItem("start:settings", JSON.stringify(v)), settings);
  await s.goto(`chrome-extension://${extId}/index.html`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await s.waitForTimeout(500);
  await s.close();
}

/* shell 打开 + boot 观测（60ms 步进） */
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
        if (s.wp && s.rs && s.rs !== "complete") wpPreComplete = true;
        if (s.dot) dotColor = s.dot;
      } else if (bootGone < 0) { bootGone = Date.now() - t0; break; }
    }
    await shell.waitForTimeout(60);
  }
  return { shell, bootGone, wpPreComplete, dotColor };
}

/* —— B 系列 · 弱网 boot 矩阵 —— */
console.log("—— B 系列：弱网卡加载根修 ——");
{
  const ctx = await newCtx("/tmp/ext-v152-sm-b1");
  await seedSettings(ctx, { background: "photo", photoId: "mist-lake", accent: "#ff3b30", themeMode: "dark" });
  for (let i = 1; i <= 2; i++) {
    const r = await openShell(ctx);
    ck(`B1.${i} 弱网+远程图库壁纸 boot <4s`, r.bootGone > 0 && r.bootGone < 4000, `bootGone=${r.bootGone}`);
    ck(`B2.${i} load 前壁纸媒体零入树`, !r.wpPreComplete);
    await r.shell.waitForTimeout(900);
    const fin = await r.shell.evaluate(() => {
      const d = document.getElementById("csShellFrame")?.contentDocument;
      return { wp: !!d?.querySelector("img[data-wallpaper]"), complete: d?.readyState === "complete", txt: (d?.body?.innerText || "").slice(0, 8) };
    }).catch(() => ({}));
    ck(`B3.${i} load 后壁纸挂载 + 文档 complete`, fin.wp === true && fin.complete === true, JSON.stringify(fin));
    await r.shell.close();
  }
  await ctx.close();
}
{
  /* B4: 默认磁贴（favicon 竞速链）+ 弱网 —— new Image() 预载不再拖死 load */
  const ctx = await newCtx("/tmp/ext-v152-sm-b4");
  const r = await openShell(ctx);
  ck("B4 默认磁贴 favicon 竞速弱网下 boot <4s", r.bootGone > 0 && r.bootGone < 4000, `bootGone=${r.bootGone}`);
  await r.shell.waitForTimeout(800);
  const txt = await r.shell.evaluate(() => {
    const d = document.getElementById("csShellFrame")?.contentDocument;
    return (d?.body?.innerText || "").slice(0, 20);
  }).catch(() => "");
  ck("B4 页面渲染（磁贴+时钟在场）", txt.includes("月") || txt.length > 4, JSON.stringify(txt));
  await ctx.close();
}
{
  /* B5: 快照路由 + 弱网 */
  const ctx = await newCtx("/tmp/ext-v152-sm-b5");
  // 种入快照（v8.7.153 假装云端更高版本）→ route() 选 /cs-snap/index.html
  const SNAPV = "8.7.153";
  function walk(dir, acc = []) {
    for (const n of readdirSync(dir)) {
      const p = join(dir, n);
      if (statSync(p).isDirectory()) walk(p, acc); else acc.push(p);
    }
    return acc;
  }
  const tmpSnap = mkdtempSync(join(tmpdir(), "snap-v152-"));
  execSync(`unzip -qo "${SNAPZIP}" -d ${tmpSnap}`);
  const files = walk(tmpSnap).map((p) => ({ rel: relative(tmpSnap, p).split("?")[0], b64: readFileSync(p).toString("base64") }));
  const seeder = await ctx.newPage();
  await seeder.goto(`chrome-extension://${extId}/index.html`, { waitUntil: "domcontentloaded", timeout: 30000 });
  for (let i = 0; i < files.length; i += 50) {
    await seeder.evaluate(async ({ v, batch }) => {
      const db = await new Promise((res, rej) => {
        const rq = indexedDB.open("chushi-snap", 1);
        rq.onupgradeneeded = () => {
          const d = rq.result;
          if (!d.objectStoreNames.contains("kv")) d.createObjectStore("kv");
          if (!d.objectStoreNames.contains("files")) d.createObjectStore("files");
        };
        rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error);
      });
      await new Promise((res, rej) => {
        const tx = db.transaction("files", "readwrite");
        const st = tx.objectStore("files");
        for (const f of batch) st.put(Uint8Array.from(atob(f.b64), (c) => c.charCodeAt(0)).buffer, v + "::" + f.rel);
        tx.oncomplete = res; tx.onerror = () => rej(tx.error);
      });
    }, { v: SNAPV, batch: files.slice(i, i + 50) });
  }
  await seeder.evaluate(async (meta) => {
    const db = await new Promise((res) => { const rq = indexedDB.open("chushi-snap", 1); rq.onsuccess = () => res(rq.result); });
    await new Promise((res) => { const tx = db.transaction("kv", "readwrite"); tx.objectStore("kv").put(meta, "meta"); tx.oncomplete = res; });
  }, { v: SNAPV, files: files.map((f) => ({ p: f.rel, s: 0 })), at: Date.now() });
  await seeder.close();
  rmSync(tmpSnap, { recursive: true, force: true });
  await seedSettings(ctx, { background: "photo", photoId: "mist-lake", themeMode: "dark" });
  const r5 = await openShell(ctx);
  ck("B5 快照路由+弱网 boot <4s", r5.bootGone > 0 && r5.bootGone < 4000, `bootGone=${r5.bootGone}`);
  const src5 = await r5.shell.evaluate(() => document.getElementById("csShellFrame")?.getAttribute("src"));
  ck("B5 路由确实走了快照", String(src5 || "").startsWith("/cs-snap/"), `src=${src5}`);
  await r5.shell.close();
  await ctx.close();
}
{
  /* B6: 人工延迟 load → 8s 兜底 */
  const ctx = await newCtx("/tmp/ext-v152-sm-b6", { hangFont: true });
  await seedSettings(ctx, { background: "photo", photoId: "mist-lake", themeMode: "dark" });
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
  ck("B6 人工延迟 load 下 8s 兜底硬揭", bootGone > 7500 && bootGone <= 9500, `bootGone=${bootGone}`);
  await shell.close();
  await ctx.close();
}

/* —— A 系列 · 转圈强调色 —— */
console.log("—— A 系列：转圈跟随强调色 ——");
{
  const ctx = await newCtx("/tmp/ext-v152-sm-a1", { hangHttp: false });
  await seedSettings(ctx, { accent: "#ff3b30" });
  const r1 = await openShell(ctx);
  ck("A1 localStorage accent 即刻上色 (#ff3b30)", r1.dotColor === "rgb(255, 59, 48)", `got=${r1.dotColor}`);
  await r1.shell.close();
  const s2 = await ctx.newPage();
  await s2.addInitScript(async () => {
    localStorage.setItem("start:settings", JSON.stringify({ accent: "#ff3b30" }));
  });
  await s2.goto(`chrome-extension://${extId}/index.html`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await s2.evaluate(async () => { await new Promise((res) => chrome.storage.local.set({ cardAcc: "#00ffcc" }, res)); });
  await s2.close();
  const r2 = await openShell(ctx);
  ck("A2 cardAcc 权威覆盖 (#00ffcc)", r2.dotColor === "rgb(0, 255, 204)", `got=${r2.dotColor}`);
  await r2.shell.close();
  const s3 = await ctx.newPage();
  await s3.goto(`chrome-extension://${extId}/index.html`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await s3.evaluate(() => localStorage.removeItem("start:settings"));
  await s3.evaluate(async () => { await new Promise((res) => chrome.storage.local.remove("cardAcc", res)); });
  await s3.close();
  const r3 = await openShell(ctx);
  ck("A3 缺省回落应用默认 (#8b5cf6)", r3.dotColor === "rgb(139, 92, 246)", `got=${r3.dotColor}`);
  await r3.shell.close();
  await ctx.close();
}

/* —— R 系列 · 未动区回归 —— */
console.log("—— R 系列：未动区回归 ——");
{
  const ctx = await newCtx("/tmp/ext-v152-sm-r1", { hangHttp: false });
  await seedSettings(ctx, { background: "photo", photoId: "great-wall-sunrise", themeMode: "dark" });
  const r = await openShell(ctx);
  await r.shell.waitForTimeout(1200);
  const fin = await r.shell.evaluate(() => {
    const d = document.getElementById("csShellFrame")?.contentDocument;
    const img = d?.querySelector("img[data-wallpaper]");
    return {
      bootGone: true,
      wpLocal: !!img && (img.getAttribute("src") || "").includes("/gallery/"),
      complete: d?.readyState === "complete",
      hasClock: (d?.body?.innerText || "").includes("月"),
    };
  }).catch(() => ({}));
  ck("R1 本地帧壁纸 boot 期即时在树（门槛不波及本地源）", fin.wpLocal === true, JSON.stringify(fin));
  ck("R2 正常网文档 complete + 时钟渲染", fin.complete === true && fin.hasClock === true);
  await ctx.close();
}
{
  /* R3: 嗅探浮窗挂载（MOUNT_VER 未动 v8.7.151） */
  const ctx = await newCtx("/tmp/ext-v152-sm-r3", { hangHttp: false });
  const start = await ctx.newPage();
  start.on("pageerror", (e) => errs.push("start:" + String(e).slice(0, 100)));
  await start.goto(`chrome-extension://${extId}/index.html`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await start.evaluate(() => new Promise((res) => chrome.storage.local.set({ snifferOn: true }, res)));
  await start.waitForTimeout(600);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errs.push("ex:" + String(e).slice(0, 100)));
  await page.goto("https://example.com/", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(1200);
  const mounted = await page.evaluate(() => ({
    float: !!document.getElementById("chushi-sniffer-float") || !!document.querySelector("[data-chushi-sniffer]"),
    any: (() => { const els = document.querySelectorAll("div[id^='chushi']"); return els.length > 0 ? els[0].id : null; })(),
  })).catch(() => ({ float: false, any: "eval-err" }));
  ck("R3 嗅探浮窗在 example.com 挂载", mounted.float || !!mounted.any, JSON.stringify(mounted));
  await ctx.close();
}

ck("pageerror=0", errs.length === 0, errs.slice(0, 4).join(" | "));

console.log(`\nRESULT: PASS=${pass} FAIL=${fail}`);
rmSync(extDir, { recursive: true, force: true });
if (fail) { console.log("SMOKE FAIL"); process.exit(1); }
console.log("\nSMOKE PASS (v8.7.152)");
