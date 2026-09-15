// v8.4.11 探针——⌘K 官方预设 + 选项高光门控(:hover) + 音乐面板空态 128 + 全量回归
// 承 probe-v849.mjs 骨架（mock 镜像 :26996 可翻面，时序确定性）
import { chromium } from "playwright-core";
import crypto from "crypto";
import { execSync, spawn } from "child_process";
import { mkdirSync, rmSync, writeFileSync, readFileSync, statSync } from "fs";

const ROOT = "/tmp/ext-v811";
const ZIP = "/tmp/my-project/download/v8.4.11/ChuShi-NewTab-v8.4.11.zip";
const MOCK = "/tmp/v811-mock";
const PORT = 26996;

rmSync(ROOT, { recursive: true, force: true });
rmSync(MOCK, { recursive: true, force: true });
rmSync("/tmp/ext-v811-profile", { recursive: true, force: true });
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
writeVer("8.4.11"); // 初始 mock：≤8.4.11 地板 → 「已是最新」快路径
const httpSrv = spawn("python3", ["-m", "http.server", String(PORT)], { cwd: MOCK, stdio: "ignore" });
process.on("exit", () => { try { httpSrv.kill(); } catch { } });
console.log("stage: mock 镜像就绪（v8.4.11）");

const EXT_ID = (() => {
  const h = crypto.createHash("sha256").update(Buffer.from(ROOT)).digest("hex").slice(0, 32);
  return [...h].map((c) => String.fromCharCode(97 + (parseInt(c, 16) % 26))).join("");
})();
const EXT_URL = (p) => `chrome-extension://${EXT_ID}/${p}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const withTimeout = (p, ms, tag) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`TIMEOUT ${tag}`)), ms))]);

const browser = await withTimeout(
  chromium.launchPersistentContext("/tmp/ext-v811-profile", {
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

  /* ---------- T2 关于分区 + 更新日志首条 + 返回设置回归 ---------- */
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
  const firstVer = dlgOpen ? await dlg.locator("section").first().locator("text=v8.4.11").count() : 0;
  gate("T2c 更新日志首条 v8.4.11", firstVer > 0);

  const backBtn = dlg.getByText("返回设置", { exact: true }).first();
  gate("T2d-1 「返回设置」按钮在场（v8.4.10 回归）", await backBtn.isVisible().catch(() => false));
  await backBtn.click({ timeout: 6000 }).catch(() => { });
  await sleep(650);
  const dlgClosed = !(await dlg.isVisible().catch(() => false));
  const settingsAlive = await logBtn.isVisible().catch(() => false);
  gate("T2d-2 点击后弹窗关闭且设置面板仍在", dlgClosed && settingsAlive,
    `dlgClosed=${dlgClosed} settingsAlive=${settingsAlive}`);

  /* ---------- T9 自绘图标几何回归（Dock path d 取证） ---------- */
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
    return { todo: pick("待办"), note: pick("便签"), pomo: pick("番茄"), cmdk: pick("指令"), settings: pick("设置") };
  });
  gate("T9a 待办=CsCheckSquare（几何保持）",
    !!dockPaths?.todo && dockPaths.todo.includes("rect:3,3,18,18") && dockPaths.todo.includes("m8 12.2 2.7 2.7 5.4-5.8"));
  gate("T9b 便签=CsNotebookPen（几何保持）",
    !!dockPaths?.note && dockPaths.note.includes("M2 6h1.9") && !dockPaths.note.includes("M2 6h4"));
  gate("T9c 番茄=CsTimer（几何保持）",
    !!dockPaths?.pomo && dockPaths.pomo.includes("circle:12,14,8"));
  gate("T9d 设置=CsSettings2（几何保持）",
    !!dockPaths?.settings && dockPaths.settings.includes("circle:17,17,3"));

  /* ---------- T10 ⌘K 官方预设 + 高光门控（v8.4.11 新门） ---------- */
  // 先关设置面板，回到净页面再开指令面板（ESC 落在 iframe 内焦点元素上）
  await page.keyboard.press("Escape").catch(() => { });
  await sleep(600);
  const cmdkBtn = appFrame.locator('nav[aria-label="快捷操作"] button[aria-label*="指令"]').first();
  await withTimeout(cmdkBtn.click({ timeout: 8000 }).catch(() => null), 9000, "cmdk click");
  await sleep(900);
  const palette = appFrame.locator('[role="dialog"][aria-label="指令面板"]');
  gate("T10a-0 指令面板打开", await palette.isVisible().catch(() => false));

  const officialHeading = palette.locator('[cmdk-group-heading]', { hasText: "官方预设" }).first();
  const refreshItem = palette.locator("[cmdk-item]", { hasText: "页面焕新预设" }).first();
  const musicItem = palette.locator("[cmdk-item]", { hasText: "音乐面板预设" }).first();
  gate("T10a-1 「官方预设」组在场", await officialHeading.isVisible().catch(() => false));
  gate("T10a-2 页面焕新预设条目在场", await refreshItem.isVisible().catch(() => false));
  gate("T10a-3 音乐面板预设条目在场（含插件标语）",
    (await musicItem.isVisible().catch(() => false)) &&
    /插件/.test((await musicItem.textContent().catch(() => "")) || ""));

  // T10b 高光门控：idle 无高光 → hover 有 → 移到分组标题无（cmdk 残留选中与视觉解耦）
  const bgOf = (loc) => loc.evaluate((el) => getComputedStyle(el).backgroundColor).catch(() => null);
  const bgIdle = await bgOf(refreshItem);
  await refreshItem.hover().catch(() => { });
  await sleep(350);
  const bgHover = await bgOf(refreshItem);
  const selAfterHover = await refreshItem.getAttribute("data-selected").catch(() => null);
  await officialHeading.hover().catch(() => { });
  await sleep(350);
  const bgGap = await bgOf(refreshItem);
  const TRANSPARENT = (v) => v === "rgba(0, 0, 0, 0)" || v === "transparent";
  gate("T10b-1 打开时（指针不在选项上）无高光", TRANSPARENT(bgIdle), `bg=${bgIdle}`);
  gate("T10b-2 悬停选项出现高光", !TRANSPARENT(bgHover), `bg=${bgHover}`);
  gate("T10b-3 指针移到空隙高光熄灭（残留 data-selected 与视觉解耦）",
    TRANSPARENT(bgGap) && selAfterHover === "true", `bg=${bgGap} data-selected=${selAfterHover}`);

  // T10c 安装音乐面板预设 → dock 出现「音乐」部件按钮 → 舞台高度 128
  await musicItem.click({ timeout: 6000 }).catch(() => { });
  await sleep(500);
  const toastOk = await withTimeout(appFrame.waitForFunction(() =>
    /已安装|已更新/.test(document.body.textContent || "") &&
    /初始 · SMTC 音乐/.test(document.body.textContent || ""),
    { timeout: 6000 }).then(() => true).catch(() => false), 7000, "toast");
  gate("T10c-1 安装 toast 在场（预设「初始 · SMTC 音乐」已安装）", toastOk);

  const musicDockBtn = appFrame.locator('nav[aria-label="快捷操作"] button[aria-label="音乐"]').first();
  const musicBtnIn = await withTimeout(musicDockBtn.waitFor({ state: "visible", timeout: 8000 })
    .then(() => true).catch(() => false), 9000, "dock music btn");
  gate("T10c-2 dock 出现「音乐」部件按钮", musicBtnIn);

  const stageH = await (async () => {
    for (let i = 0; i < 32; i++) {
      const h = await appFrame.evaluate(() => {
        const el = Array.from(document.querySelectorAll(".cl-dockwidget"))
          .find((x) => (x.getAttribute("data-widget") || "").endsWith(":music"));
        return el ? Math.round(el.getBoundingClientRect().height) : 0;
      }).catch(() => 0);
      if (h >= 120) return h;
      await sleep(250);
    }
    return 0;
  })();
  gate("T10c-3 音乐面板舞台高度=128（空态不再 92 裁图标）",
    stageH >= 120 && stageH <= 136, `h=${stageH}`);

  // T10e 部件内取证：空态内容不再溢出卡片（csEmpty 高 ≤ csCard 高）
  let emFit = null;
  try {
    let widgetFrame = null;
    for (let i = 0; i < 24 && !widgetFrame; i++) {
      await sleep(250);
      widgetFrame = page.frames().find((f) => f.url().startsWith("about:srcdoc") &&
        (f.parentFrame() && f.parentFrame().url().includes("sandbox.html")));
    }
    if (widgetFrame) {
      emFit = await widgetFrame.evaluate(() => {
        const card = document.getElementById("csCard");
        const empty = document.getElementById("csEmpty");
        if (!card || !empty) return null;
        return { card: card.clientHeight, need: empty.scrollHeight };
      }).catch(() => null);
    }
  } catch { /* 取证失败按 FAIL 处理 */ }
  gate("T10e 空态内容装进卡片（音符图标完整）",
    !!emFit && emFit.card >= emFit.need, emFit ? JSON.stringify(emFit) : "frame 未取得");

  // T10d 重装更新（替换语义）：同名预设只留一份 + toast「已更新」
  await cmdkBtn.click({ timeout: 6000 }).catch(() => { });
  await sleep(800);
  const musicItem2 = palette.locator("[cmdk-item]", { hasText: "音乐面板预设" }).first();
  const alreadyHint = (await musicItem2.textContent().catch(() => "")) || "";
  gate("T10d-1 已装态提示（已安装 · 点击重装更新）", /已安装/.test(alreadyHint), alreadyHint.slice(0, 40));
  await musicItem2.click({ timeout: 6000 }).catch(() => { });
  const updOk = await withTimeout(appFrame.waitForFunction(() =>
    /已更新/.test(document.body.textContent || ""), { timeout: 6000 })
    .then(() => true).catch(() => false), 7000, "toast2");
  const musicBtnCount = await appFrame.evaluate(() =>
    Array.from(document.querySelectorAll('nav[aria-label="快捷操作"] button'))
      .filter((x) => (x.getAttribute("aria-label") || "") === "音乐").length).catch(() => -1);
  gate("T10d-2 重装走替换语义（toast 已更新 + dock 音乐按钮仍 1 个）",
    updOk && musicBtnCount === 1, `upd=${updOk} count=${musicBtnCount}`);

  /* ---------- T3 已是最新快路径（mock=8.4.11 ≤ 地板） ---------- */
  await settingsBtn.click({ timeout: 6000 }).catch(() => { });
  await sleep(700);
  const noteText = () => appFrame.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"));
    const b = btns.find((x) => /检查更新|检查中|下载中|启用新版/.test(x.textContent || ""));
    if (!b) return "";
    const wrap = b.closest("div");
    const note = wrap && wrap.parentElement ? wrap.parentElement.textContent : "";
    return (wrap ? wrap.textContent : "") + "|" + (note || "");
  });
  const chkBtn2 = appFrame.getByText("检查更新", { exact: true }).first();
  await chkBtn2.click().catch(() => { });
  let latestHit = false;
  for (let i = 0; i < 40; i++) {
    const t = await noteText();
    if (t.includes("已是最新版本 v8.4.11")) { latestHit = true; break; }
    if (t.includes("检查失败") || t.includes("下载")) break;
    await sleep(250);
  }
  gate("T3 已是最新快路径（v8.4.11）", latestHit);

  await sleep(6800);

  /* ---------- T4 云端新版端到端（mock 翻面 99.0.0） ---------- */
  writeVer("99.0.0");
  console.log("stage: mock 翻面 -> 99.0.0");
  const chkBtn3 = appFrame.getByText("检查更新", { exact: true }).first();
  gate("T4a 按钮已复位", await chkBtn3.isVisible());
  await chkBtn3.click();
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
