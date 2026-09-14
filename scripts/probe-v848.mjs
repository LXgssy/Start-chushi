// v8.4.8 「检查更新」按钮探针——真扩展环境端到端取证
//
//   T1 本地直载 boot：shell.html → iframe 本地 index.html → app 渲染
//   T2 关于分区：更新日志 旁存在 检查更新 按钮；更新日志弹窗首条 v8.4.8
//   T3 已是最新快路径：mock 镜像 version.json=8.4.7（≤地板 8.4.8）→
//      点击 → 页面直判「已是最新版本 v8.4.8」（不触发下载）
//   T4 云端新版端到端：mock 翻到 99.0.0 → 点击 → ext-bg 手动通道下载 →
//      csSnapStatus 状态机（downloading…/updated）→ 按钮变「启用新版 v99.0.0」
//   T5 旧通道兼容：写非 manual 值（探针旧协议）→ csSnapStatus 零回写（静默不变）
//   T6 一键启用：点「启用新版」→ 顶层回 shell.html 重路由 → iframe=/cs-snap/
//      index.html → SW 从 IDB 供数 → 快照内容 + 子资源 mark.js 均为 v99
//   T7 全程 pageerror = 0
//   T8 外链提升回归（v8.4.8「拒绝连接」修复）：在壳 iframe 的真 app 里点击
//      外部 http(s) 锚点 → 顶层整页跳走（修复前：iframe 内导航被 XFO 拒绝）；
//      另验磁贴锚点已带 data-cl-tile 标记（走磁贴自有提升逻辑）
//
// 探针镜像重定向手法承自 probe-v845-shell.mjs：sed SNAP_MIRRORS → 本地
// http.server（mock version.json 可翻面，时序确定性）。
import { chromium } from "playwright-core";
import crypto from "crypto";
import { execSync, spawn } from "child_process";
import { mkdirSync, rmSync, writeFileSync, readFileSync, statSync } from "fs";

const ROOT = "/tmp/ext-v848";
const ZIP = "/tmp/my-project/download/v8.4.8/ChuShi-NewTab-v8.4.8.zip";
const MOCK = "/tmp/v848-mock";
const PORT = 26993;

rmSync(ROOT, { recursive: true, force: true });
rmSync(MOCK, { recursive: true, force: true });
rmSync("/tmp/ext-v848-profile", { recursive: true, force: true }); /* ⚠ 旧 profile 残留快照 IDB 会把路由劫持去 /cs-snap/，必须白纸 */
mkdirSync(ROOT, { recursive: true });
mkdirSync(MOCK, { recursive: true });
execSync(`cd ${ROOT} && unzip -o -q ${ZIP}`);
console.log("stage: 扩展解包 ->", ROOT);

const bgPath = ROOT + "/ext-bg.js";
const bg = readFileSync(bgPath, "utf-8");
writeFileSync(bgPath, bg.replace(
  'const SNAP_MIRRORS = ["https://lxgssy.github.io/Start-chushi"];',
  `const SNAP_MIRRORS = ["http://127.0.0.1:${PORT}"];`));
console.log("stage: SNAP_MIRRORS -> http://127.0.0.1:" + PORT);

/* app 侧「检查更新」预判 fetch 的镜像同样重定向（组件内硬编码真实镜像；
   不重定向则 T4 时 app 拉到真实镜像版本号 → 秒判最新 → 永不触发 mock 下载） */
const appHits = execSync(`grep -rl "lxgssy.github.io/Start-chushi/version.json" ${ROOT} 2>/dev/null || true`)
  .toString().trim().split("\n").filter(Boolean);
for (const f of appHits) {
  writeFileSync(f, readFileSync(f, "utf-8").replaceAll(
    "https://lxgssy.github.io/Start-chushi/version.json", `http://127.0.0.1:${PORT}/version.json`));
}
console.log("stage: app 预判镜像重定向 ->", appHits.length, "个文件");

const fakeHtml = `<!DOCTYPE html><html><head><title>SNAP99</title></head><body><h1 id="snap-v99">SNAPSHOT-99</h1><script src="/mark.js"></script></body></html>`;
writeFileSync(MOCK + "/index.html", fakeHtml);
writeFileSync(MOCK + "/mark.js", `window.__snapMark = 99;`);
function writeVer(v) {
  const files = ["index.html", "mark.js"].map((p) => ({ p, s: statSync(MOCK + "/" + p).size }));
  writeFileSync(MOCK + "/version.json", JSON.stringify({ v, files }));
}
writeVer("8.4.7"); // 初始 mock：与 8.4.8 包体同代以下 → 「已是最新」快路径
const httpSrv = spawn("python3", ["-m", "http.server", String(PORT)], { cwd: MOCK, stdio: "ignore" });
process.on("exit", () => { try { httpSrv.kill(); } catch { } });
console.log("stage: mock 镜像 :" + PORT + " 就绪（v8.4.7）");

const EXT_ID = (() => {
  const h = crypto.createHash("sha256").update(Buffer.from(ROOT)).digest("hex").slice(0, 32);
  return [...h].map((c) => String.fromCharCode(97 + (parseInt(c, 16) % 26))).join("");
})();
const EXT_URL = (p) => `chrome-extension://${EXT_ID}/${p}`;
console.log("stage: EXT_ID =", EXT_ID);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const withTimeout = (p, ms, tag) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`TIMEOUT ${tag}`)), ms))]);

const browser = await withTimeout(
  chromium.launchPersistentContext("/tmp/ext-v848-profile", {
    channel: "chromium", headless: true,
    args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`,
      "--no-first-run", "--disable-gpu", "--no-sandbox"],
  }),
  30000, "browser launch"
);
process.on("exit", () => { try { browser.close(); httpSrv.kill(); } catch { } });
console.log("stage: browser up");

let pass = 0, fail = 0;
const gate = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`  [PASS] ${name}${detail ? " — " + detail : ""}`); }
  else { fail++; console.log(`  [FAIL] ${name}${detail ? " — " + detail : ""}`); }
};

const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

try {
  /* ---------- T1 本地直载 boot ---------- */
  const t0 = Date.now();
  await page.goto(EXT_URL("shell.html"), { waitUntil: "load", timeout: 20000 });
  await withTimeout(page.waitForFunction(() => {
    const f = document.getElementById("csShellFrame");
    return f && f.src && f.src.endsWith("index.html");
  }, { timeout: 8000 }).catch(() => null), 9000, "iframe src");
  const frameSrc = await page.evaluate(() => document.getElementById("csShellFrame")?.src || "");
  gate("T1a iframe 指本地 index.html", /chrome-extension:\/\/.+\/index\.html$/.test(frameSrc), `(${Date.now() - t0}ms)`);

  /* ⚠ replaceState 让顶层 URL 也是 …/index.html——必须排除 mainFrame，
     否则会抓到壳文档（无 nav）而非真 app iframe */
  const appFrame = page.frames().find((f) => f !== page.mainFrame() && /\/index\.html$/.test(f.url()));
  const rendered = appFrame && await withTimeout(appFrame.waitForFunction(() =>
    document.body && document.body.children.length > 0, { timeout: 15000 })
    .then(() => true).catch(() => false), 16000, "app render");
  gate("T1b 本地 app 渲染", !!rendered);
  gate("T1c app 宿主有 chrome.runtime.id", !!(appFrame && await appFrame.evaluate(() =>
    !!(window.chrome && chrome.runtime && chrome.runtime.id))));

  /* ---------- T8 外链提升（独立标签页，不污染主流程；必须在 T4 翻面/T6
     提交快照之前——那时真 app 才在场，v99 快照是 mock 假页无监听器） ---------- */
  const page8 = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  try {
    await page8.goto(EXT_URL("shell.html"), { waitUntil: "load", timeout: 20000 });
    await page8.waitForFunction(() => {
      const f = document.getElementById("csShellFrame");
      return f && f.src && f.src.endsWith("index.html");
    }, { timeout: 8000 }).catch(() => null);
    const f8 = page8.frames().find((f) => f !== page8.mainFrame() && /\/index\.html$/.test(f.url()));
    if (f8) {
      await withTimeout(f8.waitForFunction(() =>
        document.body && document.body.children.length > 0, { timeout: 15000 })
        .then(() => true).catch(() => false), 16000, "T8 app render");
      /* 水合信号：磁贴锚点带 data-cl-tile（React effect 已挂监听器）。
         同时兼作 T8b 断言。SSR 静态 HTML 一上来就有子节点，不能作水合依据。 */
      const hydrated = await withTimeout(f8.waitForFunction(() =>
        !!document.querySelector("a[data-cl-tile]"), { timeout: 12000 })
        .then(() => true).catch(() => false), 13000, "T8 hydration");
      gate("T8b 磁贴锚点带 data-cl-tile（磁贴自有提升逻辑）", hydrated);
      /* 重试点击（每次新锚点新 URL），任一次顶层跳走即过 */
      let topHit = false;
      for (let i = 0; i < 3 && !topHit; i++) {
        const hoistUrl = `http://127.0.0.1:${PORT}/probe-hoist?r=${i}-${Date.now()}`;
        try {
          await f8.evaluate((u) => {
            const old = document.getElementById("probe-hoist-a");
            if (old) old.remove();
            const a = document.createElement("a");
            a.href = u;
            a.id = "probe-hoist-a";
            document.body.appendChild(a);
            a.click(); /* 捕获阶段全局监听器应拦下 → 提升到顶层框架整页打开 */
          }, hoistUrl);
        } catch { break; /* frame 已随顶层导航销毁 */ }
        topHit = await withTimeout(
          page8.waitForURL(/probe-hoist/, { timeout: 4000 }).then(() => true).catch(() => false),
          5000, "T8 hoist nav");
      }
      gate("T8a 外链提升：顶层整页跳转（拒绝连接修复）", topHit,
        (page8.url() || "").slice(0, 70));
    } else {
      gate("T8 外链提升流程", false, "app frame not found");
    }
  } catch (e8) {
    gate("T8 外链提升流程", false, String(e8).slice(0, 120));
  } finally {
    try { await page8.close(); } catch { }
  }

  /* ---------- T2 关于分区按钮在场 ---------- */
  const settingsBtn = appFrame.locator('nav[aria-label="快捷操作"] button[aria-label*="设置"]').first();
  await withTimeout(settingsBtn.click({ timeout: 8000 }), 9000, "settings click");
  await sleep(700);
  const logBtn = appFrame.getByText("更新日志", { exact: true }).first();
  const chkBtn = appFrame.getByText("检查更新", { exact: true }).first();
  gate("T2a 更新日志按钮在场", await logBtn.isVisible());
  gate("T2b 检查更新按钮在场（更新日志旁）", await chkBtn.isVisible());

  /* 更新日志弹窗首条 v8.4.8 */
  await logBtn.click();
  await sleep(900);
  const dlg = appFrame.locator('[role="dialog"][aria-label="更新日志"]');
  const dlgOpen = await dlg.isVisible().catch(() => false);
  const firstVer = dlgOpen ? await dlg.locator("section").first().locator("text=v8.4.8").count() : 0;
  gate("T2c 更新日志首条 v8.4.8", firstVer > 0);
  await page.keyboard.press("Escape");
  await sleep(500);

  /* ---------- T3 已是最新（快路径，mock=8.4.7） ---------- */
  const noteText = () => appFrame.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"));
    const b = btns.find((x) => /检查更新|检查中|下载中|启用新版/.test(x.textContent || ""));
    if (!b) return "";
    const wrap = b.closest("div");
    const note = wrap && wrap.parentElement ? wrap.parentElement.textContent : "";
    return (wrap ? wrap.textContent : "") + "|" + (note || "");
  });
  await chkBtn.click();
  let latestHit = false;
  for (let i = 0; i < 40; i++) {
    const t = await noteText();
    if (t.includes("已是最新版本 v8.4.8")) { latestHit = true; break; }
    if (t.includes("检查失败") || t.includes("下载")) break;
    await sleep(250);
  }
  gate("T3 已是最新快路径（v8.4.8）", latestHit, await noteText());

  /* 等按钮自动复位（6s）再进入 T4 */
  await sleep(6800);

  /* ---------- T4 云端新版端到端（mock 翻面 99.0.0） ---------- */
  writeVer("99.0.0");
  console.log("stage: mock 翻面 -> 99.0.0");
  const chkBtn2 = appFrame.getByText("检查更新", { exact: true }).first();
  gate("T4a 按钮已复位", await chkBtn2.isVisible());
  await chkBtn2.click();
  let updatedHit = false, updatedLabel = "";
  for (let i = 0; i < 120; i++) {
    const t = await noteText();
    if (/启用新版 v99\.0\.0/.test(t)) { updatedHit = true; updatedLabel = t; break; }
    if (t.includes("未能在限时") || t.includes("下载未完成") || t.includes("检查失败")) { updatedLabel = t; break; }
    await sleep(500);
  }
  gate("T4b 按钮进入「启用新版 v99.0.0」", updatedHit, updatedLabel.slice(0, 80));
  const st = appFrame ? await appFrame.evaluate(() => new Promise((res) =>
    chrome.storage.local.get(["csSnapStatus"], (o) => res(o.csSnapStatus || null)))) : null;
  gate("T4c ext-bg 状态机回写 updated", !!st && st.state === "updated" && st.v === "99.0.0",
    st ? JSON.stringify({ state: st.state, v: st.v, done: st.done, total: st.total }) : "null");

  /* ---------- T5 旧通道兼容（非 manual 值 → 静默） ---------- */
  const atBefore = st ? st.at : 0;
  await appFrame.evaluate(() => new Promise((res) => chrome.storage.local.set({ csSnapCheck: 12345 }, res)));
  await sleep(2000);
  const st2 = await appFrame.evaluate(() => new Promise((res) =>
    chrome.storage.local.get(["csSnapStatus"], (o) => res(o.csSnapStatus || null))));
  gate("T5 旧探针通道静默（status 零回写）", !!st2 && st2.at === atBefore, `at=${st2 && st2.at}`);

  /* ---------- T6 一键启用 → 快照直载 ---------- */
  const applyBtn = appFrame.locator('button', { hasText: "启用新版 v99.0.0" }).first();
  await applyBtn.click();
  const navOk = await withTimeout(page.waitForFunction(() => {
    const f = document.getElementById("csShellFrame");
    return f && f.src && f.src.includes("/cs-snap/index.html");
  }, { timeout: 12000 }).then(() => true).catch(() => false), 13000, "snap nav");
  gate("T6a 顶层重路由至 /cs-snap/index.html", navOk);
  /* ⚠ src 属性就位 ≠ 导航落地——必须等快照 frame 出现再取证 */
  let snapFrame = null;
  for (let i = 0; i < 48 && !snapFrame; i++) {
    await sleep(250);
    snapFrame = page.frames().find((f) => f.url().includes("/cs-snap/index.html"));
  }
  gate("T6b-0 快照 frame 在场", !!snapFrame);
  const snapUi = snapFrame && await withTimeout(snapFrame.waitForFunction(() =>
    !!document.getElementById("snap-v99"), { timeout: 8000 }).then(() => true).catch(() => false), 9000, "snap ui");
  const mark = snapFrame ? await snapFrame.evaluate(() => window.__snapMark).catch(() => null) : null;
  gate("T6b 快照内容直载（SW←IDB）", !!snapUi);
  gate("T6c 快照子资源 mark.js 走 IDB（免 referrer 硬化）", mark === 99, `__snapMark=${mark}`);
} catch (e) {
  fail++;
  console.log("  [FAIL] 探针异常 —", String(e).slice(0, 200));
}

gate("T7 全程 pageerror=0", errors.length === 0, errors.slice(0, 2).join(" | "));

console.log(`\n==== RESULT: ${pass} PASS / ${fail} FAIL ====`);
process.exit(fail ? 1 : 0);
