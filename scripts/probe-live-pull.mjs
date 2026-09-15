// probe-live-pull.mjs — 真实 v8.4.5 原包 × 线上镜像端到端（复刻用户装机端拉取链）
//
//   不改包、不 sed、不 mock——SNAP_MIRRORS 保持 https://lxgssy.github.io/Start-chushi
//   A 装机端自动拉取：SW onInstalled → snapCheck → 线上 version.json v8.4.8 > 地板
//     → 下载 70 文件 → IDB chushi-snap kv.meta.v = 8.4.8（≤180s 轮询）
//   B 新标签页重路由：壳读 meta 8.4.8 > manifest 8.4.5 → iframe=/cs-snap/index.html
//   C 快照 app 渲染（旧壳 × 新载荷免疫态）
//   D 快捷服务修复标记 data-cl-tile 在场（v8.4.8「拒绝连接」修复随快照到位）
//   E 更新日志首条 8.4.8
//   F pageerror=0 + 全程 ≥400 响应记录
import { chromium } from "playwright-core";
import crypto from "crypto";
import { execSync } from "child_process";
import { mkdirSync, rmSync, readFileSync } from "fs";

const ROOT = "/tmp/ext-live-845";
const ZIP = "/tmp/my-project/download/v8.4.5/ChuShi-NewTab-v8.4.5.zip";
const PROFILE = "/tmp/ext-live-845-profile";
rmSync(ROOT, { recursive: true, force: true });
rmSync(PROFILE, { recursive: true, force: true });
mkdirSync(ROOT, { recursive: true });
execSync(`cd ${ROOT} && unzip -o -q ${ZIP}`);
const mv = JSON.parse(readFileSync(`${ROOT}/manifest.json`, "utf-8")).version;
console.log("stage: v8.4.5 原包解包（零修改） manifest =", mv, " SNAP_MIRRORS =",
  /SNAP_MIRRORS = (\[[^\]]*\])/.exec(execSync(`grep -m1 "SNAP_MIRRORS = " ${ROOT}/ext-bg.js`).toString())?.[1]);

const EXT_ID = (() => {
  const h = crypto.createHash("sha256").update(Buffer.from(ROOT)).digest("hex").slice(0, 32);
  return [...h].map((c) => String.fromCharCode(97 + (parseInt(c, 16) % 26))).join("");
})();
const EXT_URL = (p) => `chrome-extension://${EXT_ID}/${p}`;
console.log("stage: EXT_ID =", EXT_ID);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launchPersistentContext(PROFILE, {
  channel: "chromium", headless: true,
  args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`,
    "--no-first-run", "--disable-gpu", "--no-sandbox"],
});
process.on("exit", () => { try { browser.close(); } catch { } });
console.log("stage: browser up, SW 应已随 onInstalled 开始 snapCheck（线上镜像）");

let pass = 0, fail = 0;
const gate = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`  [PASS] ${name}${detail ? " — " + detail : ""}`); }
  else { fail++; console.log(`  [FAIL] ${name}${detail ? " — " + detail : ""}`); }
};

const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
const bad = [];
page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 120)));
page.on("response", (r) => { if (r.status() >= 400) bad.push(`${r.status()} ${r.url().slice(-70)}`); });

await page.goto(EXT_URL("shell.html"), { waitUntil: "load", timeout: 20000 });

/* A 轮询 IDB meta——等后台 SW 从线上镜像拉完并原子提交 */
const readMeta = () => page.evaluate(async () => {
  const dbs = await indexedDB.databases();
  if (!dbs.some((d) => d.name === "chushi-snap")) return null;
  return await new Promise((res) => {
    const rq = indexedDB.open("chushi-snap");
    rq.onsuccess = () => {
      const db = rq.result;
      try {
        const g = db.transaction("kv", "readonly").objectStore("kv").get("meta");
        g.onsuccess = () => { db.close(); res(g.result || null); };
        g.onerror = () => { db.close(); res(null); };
      } catch { try { db.close(); } catch { } res(null); }
    };
    rq.onerror = () => res(null);
  });
});
let meta = null;
const t0 = Date.now();
for (let i = 0; i < 90; i++) {
  meta = await readMeta().catch(() => null);
  if (meta && meta.v === "8.4.8") break;
  await sleep(2000);
}
gate("A 装机端自动拉取 meta.v=8.4.8", !!(meta && meta.v === "8.4.8"),
  meta ? `v=${meta.v} keys=[${Object.keys(meta).join(",")}] (${Math.round((Date.now() - t0) / 1000)}s)` : "180s 内未提交");

/* B 重开新标签页（reload 壳）→ 版本路由 → /cs-snap/ */
await page.reload({ waitUntil: "load", timeout: 20000 });
await page.waitForFunction(() => {
  const f = document.getElementById("csShellFrame");
  return f && f.src && f.src.includes("/cs-snap/index.html");
}, { timeout: 15000 }).catch(() => null);
const frameSrc = await page.evaluate(() => document.getElementById("csShellFrame")?.src || "");
gate("B 新标签页路由到快照", frameSrc.includes("/cs-snap/index.html"), frameSrc.slice(-45));

/* C 快照 app 渲染 */
const snapFrame = page.frames().find((f) => f !== page.mainFrame() && /cs-snap\/index\.html/.test(f.url()));
const booted = snapFrame && await snapFrame.waitForFunction(
  () => document.body && document.body.children.length > 0, { timeout: 20000 })
  .then(() => true).catch(() => false);
gate("C 快照 app 渲染（旧壳×新载荷）", !!booted);

/* D 快捷服务修复标记（磁贴锚点 data-cl-tile = v8.4.8 提升逻辑已随快照到位） */
const tiled = snapFrame && booted && await snapFrame.waitForFunction(
  () => !!document.querySelector("a[data-cl-tile]"), { timeout: 12000 })
  .then(() => true).catch(() => false);
gate("D 快捷服务修复标记 data-cl-tile 在场", !!tiled);

/* E 更新日志首条 8.4.8 */
if (booted) {
  const settingsBtn = snapFrame.locator('nav[aria-label="快捷操作"] button[aria-label*="设置"]').first();
  await settingsBtn.click({ timeout: 8000 }).catch(() => { });
  await sleep(700);
  const logBtn = snapFrame.getByText("更新日志", { exact: true }).first();
  await logBtn.click({ timeout: 8000 }).catch(() => { });
  await sleep(900);
  const dlg = snapFrame.locator('[role="dialog"][aria-label="更新日志"]');
  const firstVer = (await dlg.isVisible().catch(() => false))
    ? await dlg.locator("section").first().locator("text=8.4.8").count() : 0;
  gate("E 更新日志首条 8.4.8", firstVer > 0);
} else {
  gate("E 更新日志首条 8.4.8", false, "快照未渲染，跳过");
}

gate("F pageerror=0", errors.length === 0, errors.slice(0, 2).join(" | "));
if (bad.length) console.log("  [info] ≥400 响应:", bad.slice(0, 6).join(" ; "));

console.log(`\nRESULT: ${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
