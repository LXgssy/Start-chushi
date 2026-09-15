// v8.5.0 探针——扩展弹窗快捷面板（popup）+ 流畅模式 + 不聚焦地址栏 + 下载进度条 + 全量回归
// 承 probe-v8411.mjs 骨架（mock 镜像 :26997 可翻面，时序确定性）
import { chromium } from "playwright-core";
import crypto from "crypto";
import { execSync, spawn } from "child_process";
import { mkdirSync, rmSync, writeFileSync, readFileSync, statSync } from "fs";

const ROOT = "/tmp/ext-v850";
const ZIP = "/tmp/my-project/download/v8.5.0/ChuShi-NewTab-v8.5.0.zip";
const MOCK = "/tmp/v850-mock";
const PORT = 26997;
const SHOTS = "/tmp/my-project/scripts/v850-shots";

rmSync(ROOT, { recursive: true, force: true });
rmSync(MOCK, { recursive: true, force: true });
rmSync("/tmp/ext-v850-profile", { recursive: true, force: true });
mkdirSync(ROOT, { recursive: true });
mkdirSync(MOCK, { recursive: true });
mkdirSync(SHOTS, { recursive: true });
execSync(`cd ${ROOT} && unzip -o -q ${ZIP}`);
console.log("stage: 扩展解包 ->", ROOT);

/* 探针专用 patch：禁用 ext-bg 手动检查的实际下载（T7 需要稳定的 downloading
 * 态供手动写 csSnapStatus 进度——mock 快照仅 2 文件秒下完会以 updated 覆盖进度态）。 */
const bg0 = readFileSync(ROOT + "/ext-bg.js", "utf-8");
writeFileSync(ROOT + "/ext-bg.js", bg0.replace("void snapCheck(manual);", "/* probe: snapCheck disabled */"));
console.log("stage: probe patch —— ext-bg snapCheck 下载禁用（T7 确定性）");

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
writeVer("8.5.0"); // 初始 mock：≤8.5.0 地板 → 「已是最新」快路径
const httpSrv = spawn("python3", ["-m", "http.server", String(PORT)], { cwd: MOCK, stdio: "ignore" });
process.on("exit", () => { try { httpSrv.kill(); } catch { } });
console.log("stage: mock 镜像就绪（v8.5.0）");

const EXT_ID = (() => {
  const h = crypto.createHash("sha256").update(Buffer.from(ROOT)).digest("hex").slice(0, 32);
  return [...h].map((c) => String.fromCharCode(97 + (parseInt(c, 16) % 26))).join("");
})();
const EXT_URL = (p) => `chrome-extension://${EXT_ID}/${p}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const withTimeout = (p, ms, tag) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`TIMEOUT ${tag}`)), ms))]);

const browser = await withTimeout(
  chromium.launchPersistentContext("/tmp/ext-v850-profile", {
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

/* 新标签页 boot 辅助：返回 appFrame */
async function bootNewTab(pg) {
  await pg.goto(EXT_URL("shell.html"), { waitUntil: "load", timeout: 20000 });
  await pg.waitForFunction(() => {
    const f = document.getElementById("csShellFrame");
    return f && f.src && f.src.endsWith("index.html");
  }, { timeout: 8000 }).catch(() => null);
  const af = pg.frames().find((f) => f !== pg.mainFrame() && /\/index\.html$/.test(f.url()));
  const ok = af && await af.waitForFunction(() => document.body && document.body.children.length > 0,
    { timeout: 15000 }).then(() => true).catch(() => false);
  return ok ? af : null;
}

try {
  /* ---------- T1 本地直载 boot ---------- */
  const appFrame = await bootNewTab(page);
  gate("T1 本地直载 boot", !!appFrame);

  /* ---------- T2 popup 快捷面板渲染 + 初始开关态 ---------- */
  const popup = await browser.newPage({ viewport: { width: 360, height: 420 } });
  const perr = [];
  popup.on("pageerror", (e) => perr.push(e.message));
  await popup.goto(EXT_URL("popup.html"), { waitUntil: "load", timeout: 10000 });
  await popup.waitForSelector("#sw-lite", { timeout: 5000 }).catch(() => null);
  const ver = await popup.textContent("#ver").catch(() => "");
  const lite0 = await popup.getAttribute("#sw-lite", "aria-checked").catch(() => null);
  const nof0 = await popup.getAttribute("#sw-nofocus", "aria-checked").catch(() => null);
  gate("T2a popup 渲染+版本号", !!ver && /8\.5\.0/.test(ver), `ver=${ver}`);
  gate("T2b 初始开关态（流畅=off/不聚焦=on）", lite0 === "false" && nof0 === "true", `lite=${lite0} nofocus=${nof0}`);

  /* ---------- T3 popup 开流畅模式 → cs-lite 热跟随 + backdrop 关停 ---------- */
  await popup.click("#sw-lite");
  await sleep(400); // storage 事件跨文档传播窗
  const liteClass = appFrame && await appFrame.evaluate(() =>
    document.documentElement.classList.contains("cs-lite")).catch(() => null);
  const bfInfo = appFrame && await appFrame.evaluate(() => {
    let hasRule = false;
    for (const s of [...document.styleSheets]) {
      try {
        if ([...s.cssRules].some((r) => r.cssText && r.cssText.indexOf("cs-lite") >= 0)) hasRule = true;
      } catch (e) { /* 跨域 sheet 忽略 */ }
    }
    const el = document.querySelector(".glass-card") || document.querySelector(".search-pill");
    return {
      hasRule,
      bf: el ? getComputedStyle(el).backdropFilter || getComputedStyle(el).webkitBackdropFilter : "no-el",
      who: el ? String(el.className).slice(0, 60) : "",
    };
  }).catch(() => null);
  gate("T3a cs-lite 类热跟随", liteClass === true, `class=${liteClass}`);
  gate("T3b-1 cs-lite 样式表已加载", !!bfInfo && bfInfo.hasRule === true, `hasRule=${bfInfo && bfInfo.hasRule}`);
  /* T3b-2 对照实验取证：通配规则理论上应赢（unlayered important vs layered
   * normal），但运行时实测未赢——分別试「类名规则」「通配规则」「内联」三路，
   * 定位 cascade 断点后回改 globals.css。 */
  const bfExp = appFrame && await appFrame.evaluate(() => {
    const el = document.querySelector(".search-pill") || document.querySelector(".glass-pill");
    if (!el) return null;
    const out = {
      hasDataLg: el.hasAttribute("data-lg"),
      lgBlur: getComputedStyle(el).getPropertyValue("--lg-blur").trim(),
      bf: getComputedStyle(el).backdropFilter,
      matched: [],
    };
    const walk = (rules, layer) => {
      for (const r of rules) {
        /* 先查自身声明再递归：CSSStyleRule.cssRules（嵌套）恒存在（可为空），
         * 先 continue 会把全部 style 规则当容器跳过（上轮 matched=[] 的根因） */
        if (r.selectorText && r.style) {
          let m = false;
          try { m = el.matches(r.selectorText); } catch (e) { }
          if (m) {
            const v = r.style.getPropertyValue("backdrop-filter") || r.style.getPropertyValue("-webkit-backdrop-filter");
            if (v) out.matched.push({
              sel: r.selectorText.slice(0, 50),
              layer: layer || "unlayered",
              imp: r.style.getPropertyPriority("backdrop-filter") ? "!" : "",
              v: v.trim().slice(0, 40),
            });
          }
        }
        if (r.cssRules && r.cssRules.length) walk(r.cssRules, r.name ? "@layer " + r.name : layer);
      }
    };
    for (const s of [...document.styleSheets]) {
      try { walk(s.cssRules, ""); } catch (e) { }
    }
    return out;
  }).catch(() => null);
  const bfOk = !!bfExp && (bfExp.bf === "none" || /^blur\(0px\)/.test(bfExp.bf));
  gate("T3b-2 磨砂关停（实用等效）", bfOk,
    bfExp ? `bf=${bfExp.bf} lgBlur=${bfExp.lgBlur} dataLg=${bfExp.hasDataLg} matched=${JSON.stringify(bfExp.matched)}` : "no el");
  await page.screenshot({ path: `${SHOTS}/t3-cslite.png` }).catch(() => { });

  /* ---------- T4 开关落库且不破坏 settings 其余字段 ---------- */
  const sRead = appFrame && await appFrame.evaluate(() => {
    try { return JSON.parse(localStorage.getItem("start:settings") || "{}"); } catch { return {}; }
  }).catch(() => null);
  gate("T4 settings 单字段落库",
    !!sRead && sRead.perfLite === true && typeof sRead.themeMode === "string" &&
    !!sRead.pomodoro && typeof sRead.pomodoro.focusMin === "number",
    `perfLite=${sRead && sRead.perfLite} themeMode=${sRead && sRead.themeMode}`);

  /* ---------- T5 不聚焦地址栏端到端（effect 门控 DOM 取证） ----------
     headless 无浏览器 omnibox，body.focus() 无焦点变化不派发 focusin ——
     改用 effect 副作用的确定证据：body.tabIndex=-1 仅在偷焦点 effect 运行时设置。 */
  // T5a：popup 关掉「不聚焦」（=focusOmnibox true，浏览器默认）→ 新页偷焦点 effect 被门控跳过
  await popup.click("#sw-nofocus");
  await sleep(300);
  const page5 = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const af5 = await bootNewTab(page5);
  await sleep(1500); // 越过 1.2s 抢焦点窗
  const t5a = af5 && await af5.evaluate(() => {
    let s = null;
    try { s = JSON.parse(localStorage.getItem("start:settings") || "null"); } catch (e) { }
    return {
      gate: document.documentElement.dataset.csFocusGate || "unset",
      steal: document.body.dataset.csFocusSteal || "none",
      focusOmnibox: s ? JSON.stringify(s.focusOmnibox) : "no-key",
    };
  }).catch(() => null);
  gate("T5a 关闭不聚焦 → 门控生效（gate=omnibox 且无偷焦点标记）",
    !!t5a && t5a.gate === "omnibox" && t5a.steal !== "1",
    `gate=${t5a && t5a.gate} steal=${t5a && t5a.steal} focusOmnibox=${t5a && t5a.focusOmnibox}`);

  // T5b：恢复默认（不聚焦=开）→ 新页偷焦点 effect 运行（tabIndex=-1 置位）
  await popup.click("#sw-nofocus");
  await sleep(300);
  const page5b = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page5b.addInitScript(() => {
    window.__bodyFocusCnt = 0;
    document.addEventListener("focusin", (e) => {
      if ((e.target && e.target.tagName) === "BODY") window.__bodyFocusCnt++;
    }, true);
  });
  const af5b = await bootNewTab(page5b);
  await sleep(1500);
  const t5b = af5b && await af5b.evaluate(() => ({
    gate: document.documentElement.dataset.csFocusGate || "unset",
    steal: document.body.dataset.csFocusSteal || "none",
    focusCnt: window.__bodyFocusCnt || 0,
  })).catch(() => null);
  gate("T5b 默认不聚焦 → 焦点归位 effect 运行（gate=page 且偷焦点标记在位）",
    !!t5b && t5b.gate === "page" && t5b.steal === "1",
    `gate=${t5b && t5b.gate} steal=${t5b && t5b.steal} focusin=${t5b && t5b.focusCnt}`);
  await page5.close().catch(() => { });
  await page5b.close().catch(() => { });

  /* ---------- T6 「打开完整设置」直达（真点 popup 按钮 → 新页自动开设置面板） ---------- */
  const popup6 = await browser.newPage({ viewport: { width: 360, height: 420 } });
  await popup6.goto(EXT_URL("popup.html"), { waitUntil: "load", timeout: 10000 });
  await popup6.waitForSelector("#open-settings", { timeout: 5000 }).catch(() => null);
  const intentBefore = await popup6.evaluate(() => {
    try { localStorage.setItem("start:settings", JSON.stringify({ themeMode: "dark", perfLite: false, focusOmnibox: false, pomodoro: { focusMin: 25, shortMin: 5, longMin: 15 } })); } catch { }
    return true;
  }).catch(() => false);
  const page6Promise = browser.waitForEvent("page", { timeout: 12000 }).catch(() => null);
  await popup6.click("#open-settings");
  const page6 = await page6Promise;
  const af6 = page6 ? await bootNewTab(page6) : null; // 新页可能已在导航，boot 幂等
  let t6 = false;
  if (page6) {
    const f6 = page6.frames().find((f) => f !== page6.mainFrame() && /\/index\.html$/.test(f.url()));
    if (f6) {
      t6 = await f6.waitForSelector("text=流畅模式", { timeout: 10000 }).then(() => true).catch(() => false);
    }
    await page6.screenshot({ path: `${SHOTS}/t6-intent-settings.png` }).catch(() => { });
  }
  gate("T6 弹窗直达设置（意图消费自动开面板）", !!t6, `newPage=${!!page6}`);
  await popup6.close().catch(() => { });

  /* ---------- T7 检查更新进度条（翻面 9.9.9 → downloading → csSnapStatus 进度） ----------
     探针已 patch ext-bg：csSnapCheck 不再触发真下载/回写；组件预判 fetch mock
     进入 downloading 后由本探针直接写 csSnapStatus 驱动进度条（与 ext-bg 回写同形）。 */
  writeVer("9.9.9");
  // 打开设置面板（快捷操作 nav → 设置按钮）
  const navBtn = appFrame && await appFrame.waitForSelector(
    'nav[aria-label="快捷操作"] button[aria-label*="设置"]', { timeout: 8000 }).catch(() => null);
  if (navBtn) await navBtn.click();
  await sleep(600);
  const chkBtn = appFrame && await appFrame.waitForSelector('button:has-text("检查更新")',
    { timeout: 8000 }).catch(() => null);
  gate("T7a 检查更新按钮在场", !!chkBtn);
  if (chkBtn) {
    await chkBtn.scrollIntoViewIfNeeded().catch(() => { });
    await sleep(300);
    await chkBtn.click();
    // 预判 fetch mock → 发现 9.9.9 → downloading（触发后台快照下载失败无妨）
    await appFrame.waitForSelector('button:has-text("下载中")', { timeout: 15000 }).catch(() => null);
    // 手动写 csSnapStatus 进度（与 ext-bg 回写同形）
    await appFrame.evaluate(() => new Promise((res) => {
      try {
        chrome.storage.local.set({ csSnapStatus: { state: "downloading", v: "9.9.9", done: 21, total: 73, at: Date.now() } }, () => res());
      } catch (e) { res(); }
    })).catch(() => { });
    await sleep(600);
    const bar = appFrame && await appFrame.evaluate(() => {
      const btns = [...document.querySelectorAll("button")];
      const dl = btns.find((b) => /下载中/.test(b.textContent || ""));
      if (!dl) return null;
      const wrap = dl.parentElement && dl.parentElement.querySelector("div[aria-hidden]");
      if (!wrap) return null;
      const w = wrap.getBoundingClientRect();
      const panel = dl.closest(".max-h-\\[380px\\]") || dl.closest("section") || wrap.parentElement;
      const pw = panel ? panel.getBoundingClientRect().width : 0;
      const inner = wrap.firstElementChild ? wrap.firstElementChild.getBoundingClientRect().width : 0;
      return { barW: w.width, panelW: pw, innerW: inner };
    }).catch(() => null);
    gate("T7b 进度条出现且比例正确", !!bar && bar.barW > 0 && bar.barW <= 241,
      bar ? `bar=${Math.round(bar.barW)}px` : "no bar");
    gate("T7c 进度条不延伸面板（bar < panel 宽的 90%）",
      !!bar && bar.panelW > 0 && bar.barW < bar.panelW * 0.9,
      bar ? `bar=${Math.round(bar.barW)} panel=${Math.round(bar.panelW)}` : "no bar");
    const pct = bar ? bar.innerW / bar.barW : 0;
    gate("T7d 进度比例 done/total=21/73≈29%", !!bar && Math.abs(pct - 21 / 73) < 0.03,
      `pct=${(pct * 100).toFixed(1)}%`);
    await page.screenshot({ path: `${SHOTS}/t7-progress.png` }).catch(() => { });
    // 收尾：写 updated 结束态防泄漏轮询
    await appFrame.evaluate(() => new Promise((res) => {
      try { chrome.storage.local.set({ csSnapStatus: { state: "latest", v: "8.5.0", at: Date.now() } }, () => res()); } catch (e) { res(); }
    })).catch(() => { });
  }

  /* ---------- T8 回归：更新日志首条 8.5.0 + 返回设置 ---------- */
  const logBtn = appFrame && await appFrame.waitForSelector('button:has-text("更新日志")',
    { timeout: 8000 }).catch(() => null);
  let t8a = false, t8b = false;
  if (logBtn) {
    await logBtn.click();
    await sleep(700);
    t8a = await appFrame.waitForSelector('[role="dialog"][aria-label="更新日志"]', { timeout: 6000 })
      .then(() => true).catch(() => false);
    if (t8a) {
      const first = await appFrame.evaluate(() => {
        const d = document.querySelector('[role="dialog"][aria-label="更新日志"]');
        return d ? (d.textContent || "").slice(0, 600) : "";
      }).catch(() => "");
      t8a = /8\.5\.0/.test(first);
      const back = await appFrame.waitForSelector('[role="dialog"][aria-label="更新日志"] button:has-text("返回设置")',
        { timeout: 4000 }).then(() => true).catch(() => false);
      if (back) {
        await appFrame.click('[role="dialog"][aria-label="更新日志"] button:has-text("返回设置")');
        await sleep(500);
        t8b = await appFrame.evaluate(() =>
          !document.querySelector('[role="dialog"][aria-label="更新日志"]')).catch(() => false);
      }
      gate("T8b 返回设置按钮工作", t8b);
    }
    gate("T8a 更新日志首条 8.5.0", t8a);
  } else {
    gate("T8a 更新日志按钮在场", false);
  }

  /* ---------- T9 pageerror = 0 ---------- */
  gate("T9 pageerror=0", errors.length === 0, errors.slice(0, 2).join(" | "));
  gate("T9b popup pageerror=0", perr.length === 0, perr.slice(0, 2).join(" | "));
} catch (e) {
  fail++;
  console.log("  [FATAL]", e.message);
}

console.log(`\n===== v8.5.0 probe: ${pass} PASS / ${fail} FAIL =====`);
process.exit(fail > 0 ? 1 : 0);
