// v8.4.9 探针——「返回设置」按钮 + 自绘图标套件 + v8.4.8 全量回归
// 承 probe-v848.mjs 骨架（mock 镜像 :26995 可翻面，时序确定性）
import { chromium } from "playwright-core";
import crypto from "crypto";
import { execSync, spawn } from "child_process";
import { mkdirSync, rmSync, writeFileSync, readFileSync, statSync } from "fs";

const ROOT = "/tmp/ext-v810";
const ZIP = "/tmp/my-project/download/v8.4.10/ChuShi-NewTab-v8.4.10.zip";
const MOCK = "/tmp/v810-mock";
const PORT = 26995;

rmSync(ROOT, { recursive: true, force: true });
rmSync(MOCK, { recursive: true, force: true });
rmSync("/tmp/ext-v810-profile", { recursive: true, force: true });
mkdirSync(ROOT, { recursive: true });
mkdirSync(MOCK, { recursive: true });
execSync(`cd ${ROOT} && unzip -o -q ${ZIP}`);
console.log("stage: 扩展解包 ->", ROOT);

const bgPath = ROOT + "/ext-bg.js";
const bg = readFileSync(bgPath, "utf-8");
writeFileSync(bgPath, bg.replace(
  'const SNAP_MIRRORS = ["https://lxgssy.github.io/Start-chushi"];',
  `const SNAP_MIRRORS = ["http://127.0.0.1:${PORT}"];`));
const appHits = execSync(`grep -rl "lxgssy.github.io/Start-chushi/version.json" ${ROOT} 2>/dev/null || true`)
  .toString().trim().split("\n").filter(Boolean);
for (const f of appHits) {
  writeFileSync(f, readFileSync(f, "utf-8").replaceAll(
    "https://lxgssy.github.io/Start-chushi/version.json", `http://127.0.0.1:${PORT}/version.json`));
}
console.log("stage: 镜像重定向 ->", `:${PORT}`, "（app 侧", appHits.length, "文件）");

const fakeHtml = `<!DOCTYPE html><html><head><title>SNAP99</title></head><body><h1 id="snap-v99">SNAPSHOT-99</h1><script src="/mark.js"></script></body></html>`;
writeFileSync(MOCK + "/index.html", fakeHtml);
writeFileSync(MOCK + "/mark.js", `window.__snapMark = 99;`);
function writeVer(v) {
  const files = ["index.html", "mark.js"].map((p) => ({ p, s: statSync(MOCK + "/" + p).size }));
  writeFileSync(MOCK + "/version.json", JSON.stringify({ v, files }));
}
writeVer("8.4.9"); // 初始 mock：≤8.4.9 地板 → 「已是最新」快路径
const httpSrv = spawn("python3", ["-m", "http.server", String(PORT)], { cwd: MOCK, stdio: "ignore" });
process.on("exit", () => { try { httpSrv.kill(); } catch { } });
console.log("stage: mock 镜像就绪（v8.4.9）");

const EXT_ID = (() => {
  const h = crypto.createHash("sha256").update(Buffer.from(ROOT)).digest("hex").slice(0, 32);
  return [...h].map((c) => String.fromCharCode(97 + (parseInt(c, 16) % 26))).join("");
})();
const EXT_URL = (p) => `chrome-extension://${EXT_ID}/${p}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const withTimeout = (p, ms, tag) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`TIMEOUT ${tag}`)), ms))]);

const browser = await withTimeout(
  chromium.launchPersistentContext("/tmp/ext-v810-profile", {
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
  await page.goto(EXT_URL("shell.html"), { waitUntil: "load", timeout: 20000 });
  await withTimeout(page.waitForFunction(() => {
    const f = document.getElementById("csShellFrame");
    return f && f.src && f.src.endsWith("index.html");
  }, { timeout: 8000 }).catch(() => null), 9000, "iframe src");
  const appFrame = page.frames().find((f) => f !== page.mainFrame() && /\/index\.html$/.test(f.url()));
  const rendered = appFrame && await withTimeout(appFrame.waitForFunction(() =>
    document.body && document.body.children.length > 0, { timeout: 15000 })
    .then(() => true).catch(() => false), 16000, "app render");
  gate("T1 本地直载 boot", !!rendered);

  /* ---------- T8 外链提升回归（独立标签页；必须在 T4 翻面前） ---------- */
  const page8 = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  try {
    await page8.goto(EXT_URL("shell.html"), { waitUntil: "load", timeout: 20000 });
    await page8.waitForFunction(() => {
      const f = document.getElementById("csShellFrame");
      return f && f.src && f.src.endsWith("index.html");
    }, { timeout: 8000 }).catch(() => null);
    const f8 = page8.frames().find((f) => f !== page8.mainFrame() && /\/index\.html$/.test(f.url()));
    if (f8) {
      await withTimeout(f8.waitForFunction(() => document.body && document.body.children.length > 0,
        { timeout: 15000 }).then(() => true).catch(() => false), 16000, "T8 render");
      const hydrated = await withTimeout(f8.waitForFunction(() =>
        !!document.querySelector("a[data-cl-tile]"), { timeout: 12000 })
        .then(() => true).catch(() => false), 13000, "T8 hydration");
      gate("T8b 磁贴锚点带 data-cl-tile", hydrated);
      let topHit = false;
      for (let i = 0; i < 3 && !topHit; i++) {
        const hoistUrl = `http://127.0.0.1:${PORT}/probe-hoist?r=${i}-${Date.now()}`;
        try {
          await f8.evaluate((u) => {
            const old = document.getElementById("probe-hoist-a");
            if (old) old.remove();
            const a = document.createElement("a");
            a.href = u; a.id = "probe-hoist-a";
            document.body.appendChild(a); a.click();
          }, hoistUrl);
        } catch { break; }
        topHit = await withTimeout(
          page8.waitForURL(/probe-hoist/, { timeout: 4000 }).then(() => true).catch(() => false),
          5000, "T8 hoist nav");
      }
      gate("T8a 外链提升：顶层整页跳转", topHit, (page8.url() || "").slice(0, 60));
    } else gate("T8 外链提升流程", false, "app frame not found");
  } catch (e8) { gate("T8 外链提升流程", false, String(e8).slice(0, 120)); }
  finally { try { await page8.close(); } catch { } }

  /* ---------- T2 关于分区 + 更新日志弹窗 + 返回设置 ---------- */
  const settingsBtn = appFrame.locator('nav[aria-label="快捷操作"] button[aria-label*="设置"]').first();
  await withTimeout(settingsBtn.click({ timeout: 8000 }), 9000, "settings click");
  await sleep(700);
  const logBtn = appFrame.getByText("更新日志", { exact: true }).first();
  const chkBtn = appFrame.getByText("检查更新", { exact: true }).first();
  gate("T2a 更新日志按钮在场", await logBtn.isVisible());
  gate("T2b 检查更新按钮在场（v8.4.8 回归）", await chkBtn.isVisible());

  await logBtn.click();
  await sleep(900);
  const dlg = appFrame.locator('[role="dialog"][aria-label="更新日志"]');
  const dlgOpen = await dlg.isVisible().catch(() => false);
  const firstVer = dlgOpen ? await dlg.locator("section").first().locator("text=v8.4.10").count() : 0;
  gate("T2c 更新日志首条 v8.4.10", firstVer > 0);

  /* v8.4.9 新门：返回设置按钮 —— 在场、可点、点了只关弹窗且设置面板仍在 */
  const backBtn = dlg.getByText("返回设置", { exact: true }).first();
  gate("T2d-1 「返回设置」按钮在场", await backBtn.isVisible().catch(() => false));
  await backBtn.click({ timeout: 6000 }).catch(() => { });
  await sleep(650);
  const dlgClosed = !(await dlg.isVisible().catch(() => false));
  const settingsAlive = await logBtn.isVisible().catch(() => false);
  gate("T2d-2 点击后弹窗关闭且设置面板仍在", dlgClosed && settingsAlive,
    `dlgClosed=${dlgClosed} settingsAlive=${settingsAlive}`);

  /* ---------- T9 自绘图标几何（Dock 实渲染 svg 的 path d 取证） ---------- */
  const dockPaths = await appFrame.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('nav[aria-label="快捷操作"] button'));
    const pick = (kw) => {
      const b = btns.find((x) => (x.getAttribute("aria-label") || "").includes(kw));
      if (!b) return null;
      const ds = Array.from(b.querySelectorAll("svg path, svg rect, svg circle, svg line"))
        .map((el) => el.tagName.toLowerCase() === "path" ? el.getAttribute("d") :
          el.tagName.toLowerCase() === "rect" ? `rect:${el.getAttribute("x")},${el.getAttribute("y")},${el.getAttribute("width")},${el.getAttribute("height")}` :
            el.tagName.toLowerCase() === "circle" ? `circle:${el.getAttribute("cx")},${el.getAttribute("cy")},${el.getAttribute("r")}` :
              `line:${el.getAttribute("x1")},${el.getAttribute("y1")},${el.getAttribute("x2")},${el.getAttribute("y2")}`);
      return ds.join("|");
    };
    return { todo: pick("待办"), note: pick("便签"), pomo: pick("番茄"), cmdk: pick("指令"), settings: pick("设置"), weather: pick("天气") };
  });
  gate("T9a 待办=CsCheckSquare（对勾收进完整方框）",
    !!dockPaths?.todo && dockPaths.todo.includes("rect:3,3,18,18") && dockPaths.todo.includes("m8 12.2 2.7 2.7 5.4-5.8"),
    dockPaths?.todo?.slice(0, 60));
  gate("T9b 便签=CsNotebookPen（装订环 T 触短须，不穿边框）",
    !!dockPaths?.note && dockPaths.note.includes("M2 6h1.9") && !dockPaths.note.includes("M2 6h4"),
    dockPaths?.note?.slice(0, 60));
  gate("T9c 番茄=CsTimer（几何保持）",
    !!dockPaths?.pomo && dockPaths.pomo.includes("circle:12,14,8"),
    dockPaths?.pomo?.slice(0, 60));
  gate("T9d 指令=CsCommand", !!dockPaths?.cmdk && dockPaths.cmdk.includes("M15 6v12a3 3 0 1 0 3-3H6"),
    dockPaths?.cmdk?.slice(0, 60));
  gate("T9e 设置=CsSettings2", !!dockPaths?.settings && dockPaths.settings.includes("circle:17,17,3"),
    dockPaths?.settings?.slice(0, 60));

  /* ---------- T3 已是最新快路径（mock=8.4.8 ≤ 地板 8.4.9） ---------- */
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
    if (t.includes("已是最新版本 v8.4.10")) { latestHit = true; break; }
    if (t.includes("检查失败") || t.includes("下载")) break;
    await sleep(250);
  }
  gate("T3 已是最新快路径（v8.4.10）", latestHit, await noteText());

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
  gate("T4b 进入「启用新版 v99.0.0」", updatedHit, updatedLabel.slice(0, 80));
  const st = appFrame ? await appFrame.evaluate(() => new Promise((res) =>
    chrome.storage.local.get(["csSnapStatus"], (o) => res(o.csSnapStatus || null)))) : null;
  gate("T4c ext-bg 状态机回写 updated", !!st && st.state === "updated" && st.v === "99.0.0",
    st ? JSON.stringify({ state: st.state, v: st.v }) : "null");

  /* ---------- T5 旧通道兼容（非 manual → 静默） ---------- */
  const atBefore = st ? st.at : 0;
  await appFrame.evaluate(() => new Promise((res) => chrome.storage.local.set({ csSnapCheck: 12345 }, res)));
  await sleep(2000);
  const st2 = await appFrame.evaluate(() => new Promise((res) =>
    chrome.storage.local.get(["csSnapStatus"], (o) => res(o.csSnapStatus || null))));
  gate("T5 旧探针通道静默", !!st2 && st2.at === atBefore, `at=${st2 && st2.at}`);

  /* ---------- T6 一键启用 → 快照直载 ---------- */
  const applyBtn = appFrame.locator('button', { hasText: "启用新版 v99.0.0" }).first();
  await applyBtn.click();
  const navOk = await withTimeout(page.waitForFunction(() => {
    const f = document.getElementById("csShellFrame");
    return f && f.src && f.src.includes("/cs-snap/index.html");
  }, { timeout: 12000 }).then(() => true).catch(() => false), 13000, "snap nav");
  gate("T6a 顶层重路由至 /cs-snap/index.html", navOk);
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
  gate("T6c 快照子资源 mark.js 走 IDB", mark === 99, `__snapMark=${mark}`);
} catch (e) {
  fail++;
  console.log("  [FAIL] 探针异常 —", String(e).slice(0, 200));
}

gate("T7 全程 pageerror=0", errors.length === 0, errors.slice(0, 2).join(" | "));
console.log(`\n==== RESULT: ${pass} PASS / ${fail} FAIL ====`);
process.exit(fail ? 1 : 0);
