/* v8.7.52 E2E：扩展加载 + popup 强调色/嗅探开关 + 描边层 + 直搜 + 浮球全链 */
import { chromium } from "playwright-core";
import fs from "node:fs";

const EXT = "/tmp/ext-stage";
const PROFILE = "/tmp/pw-v8752-profile";
const BASE = "http://127.0.0.1:18923";
const results = [];
function ok(name, cond, detail = "") {
  results.push({ name, pass: !!cond, detail });
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? "  — " + detail : ""}`);
}

/* 1) 静态 manifest 检查 */
const mf = JSON.parse(fs.readFileSync(`${EXT}/manifest.json`, "utf-8"));
ok("manifest: webRequest+downloads 权限", mf.permissions.includes("webRequest") && mf.permissions.includes("downloads"));
ok("manifest: 全站 host", mf.host_permissions.includes("http://*/*"));
ok("manifest: sniffer-float 注入", mf.content_scripts[0].js.includes("sniffer-float.js"));
ok("manifest: popup 在位", mf.action?.default_popup === "popup.html");
ok("manifest: 版本 8.7.52", mf.version === "8.7.52");

/* 2) 起浏览器 + 加载扩展 */
const ctx = await chromium.launchPersistentContext(PROFILE, {
  channel: "chromium",
  headless: true,
  args: [
    `--disable-extensions-except=${EXT}`,
    `--load-extension=${EXT}`,
    "--no-first-run",
    "--no-default-browser-check",
  ],
});

let [sw] = ctx.serviceWorkers();
if (!sw) sw = await ctx.waitForEvent("serviceworker", { timeout: 15000 });
const extId = sw.url().split("/")[2];
console.log("extension id:", extId);

/* 3) 新标签页：预置强调色（绿） + 打开 */
const page = await ctx.newPage();
await page.goto(`chrome-extension://${extId}/index.html`);
await page.evaluate(() => {
  localStorage.setItem("start:settings", JSON.stringify({ accent: "#10b981", themeMode: "light" }));
});
await page.reload();
await page.waitForSelector(".search-pill", { timeout: 15000 });

/* 4) 描边层：结构 + opacity 切换 */
const ringCount = await page.locator(".search-focus-ring").count();
ok("描边层 DOM 在位", ringCount === 1);
const input = page.locator(".search-input");
await input.focus();
await page.waitForTimeout(1200);
const opFocus = await page.$eval(".search-focus-ring", (el) => Number(getComputedStyle(el).opacity));
await input.blur();
await page.waitForTimeout(1200);
const opBlur = await page.$eval(".search-focus-ring", (el) => Number(getComputedStyle(el).opacity));
ok("聚焦 opacity→1（headless 采样容忍 0.9+）", opFocus >= 0.9, `focus=${opFocus} blur=${opBlur}`);
ok("失焦 opacity→0", opBlur <= 0.05);
const ringShadow = await page.$eval(".search-focus-ring", (el) => getComputedStyle(el).boxShadow.includes("inset"));
ok("描边= inset box-shadow（opacity 承载）", ringShadow);

/* 5) 直搜行：输入词 → 4 钮 → 点 B 站跳转 */
await input.click();
await input.fill("面试题");
await page.waitForTimeout(600);
const directCount = await page.locator(".direct-row button").count();
ok("直搜行 4 钮", directCount === 4, `count=${directCount}`);
const labels = await page.locator(".direct-row button").allTextContents();
ok("含 B站/GitHub/知乎/抖音", ["哔哩哔哩", "GitHub", "知乎", "抖音"].every((n) => labels.join().includes(n)));
const beforePages = ctx.pages().length;
await page.locator('.direct-row button[aria-label^="在哔哩哔哩"]').click();
await page.waitForTimeout(2500);
const allUrls = ctx.pages().map((p) => p.url());
ok("点击 B 站钮 → 跳转 search.bilibili.com", allUrls.some((u) => u.includes("search.bilibili.com/all?keyword=")), allUrls.filter((u) => u.includes("bilibili")).join(",").slice(0, 80));

/* 6) URL 形态输入不展示直搜行 */
const page2 = await ctx.newPage();
await page2.goto(`chrome-extension://${extId}/index.html`);
await page2.waitForSelector(".search-pill");
const inp2 = page2.locator(".search-input");
await inp2.click();
await inp2.fill("example.com");
await page2.waitForTimeout(400);
ok("URL 输入不出直搜行", (await page2.locator(".direct-row").count()) === 0);

/* 7) popup：强调色跟随 + 嗅探开关
 * 注：直接改 localStorage 后由「初始」React 挂载时可能用内存默认值回写
 * （真实用户路径是设置面板 patchSettings 写入，无冲突），故本测试在
 * popup 自身 origin 写入后刷新，验证 popup.js 的读取与 --acc 应用链。 */
const popup = await ctx.newPage();
await popup.goto(`chrome-extension://${extId}/popup.html`);
await popup.evaluate(() => {
  localStorage.setItem("start:settings", JSON.stringify({ accent: "#10b981", themeMode: "light" }));
});
await popup.reload();
await popup.waitForTimeout(600);
const acc = await popup.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--acc").trim());
ok("popup --acc 跟随强调色 #10b981", acc.toLowerCase() === "#10b981", acc);
const swChecked = await popup.$eval("#sw-sniffer", (el) => el.getAttribute("aria-checked"));
ok("嗅探开关初渲染（缺省关）", swChecked === "false");
await popup.click("#sw-sniffer");
await popup.waitForTimeout(300);
const swAfter = await popup.$eval("#sw-sniffer", (el) => el.getAttribute("aria-checked"));
const sniffOn = await popup.evaluate(() => new Promise((r) => chrome.storage.local.get("snifferOn", (o) => r(!!o.snifferOn))));
ok("嗅探开关点击 → chrome.storage 落库", swAfter === "true" && sniffOn === true);

/* 8) 浮球全链：打开测试页 → 浮球出现 + badge + toast + 面板 + 下载 */
const t1 = await ctx.newPage();
await t1.goto(`${BASE}/`, { waitUntil: "networkidle" }).catch(() => {});
await t1.waitForTimeout(1500);
const hostEl = await t1.$("#chushi-sniffer-host");
ok("浮球 host 挂载", !!hostEl);
/* 诊断：host 数量 / shadowRoot 态 / innerHTML */
const diag = await t1.evaluate(() => {
  const hosts = document.querySelectorAll("#chushi-sniffer-host");
  const h = hosts[0];
  return {
    n: hosts.length,
    hasShadow: h ? !!h.shadowRoot : null,
    mode: h && h.shadowRoot ? h.shadowRoot.mode : null,
    ballInShadow: h && h.shadowRoot ? !!h.shadowRoot.querySelector(".ball") : null,
    html0: h ? h.outerHTML.slice(0, 120) : null,
  };
});
console.log("DIAG:", JSON.stringify(diag));
if (diag.n > 1) {
  const diag2 = await t1.evaluate(() => {
    return [...document.querySelectorAll("#chushi-sniffer-host")].map((h, i) => ({
      i, hasShadow: !!h.shadowRoot, hasBall: h.shadowRoot ? !!h.shadowRoot.querySelector(".ball") : null,
    }));
  });
  console.log("DIAG2:", JSON.stringify(diag2));
}
const ballShown = await t1.$eval("#chushi-sniffer-host", (el) => {
  const b = el.shadowRoot && el.shadowRoot.querySelector(".ball");
  return b ? b.style.display !== "none" : false;
});
ok("浮球可见", ballShown === true);
await t1.waitForTimeout(600);
const badgeTxt = await t1.$eval("#chushi-sniffer-host", (el) => {
  const b = el.shadowRoot && el.shadowRoot.querySelector(".badge");
  return b ? b.textContent : "";
});
ok("badge 计数（mp4+big.png+pdf = 3，small.png 被过滤）", badgeTxt === "3", `badge=${badgeTxt}`);
const toastShown = await t1.$eval("#chushi-sniffer-host", (el) => {
  const t = el.shadowRoot.querySelector(".toast");
  return t ? t.classList.contains("show") : false;
});
ok("发现资源 toast 提示", toastShown === true);
/* 展开面板 */
/* 展开面板：用真实 pointer 序列（合成 .click() 不触发 pointerdown/up 链） */
const ballBox0 = await t1.$eval("#chushi-sniffer-host", (el) => {
  const r = el.shadowRoot.querySelector(".ball").getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
await t1.mouse.move(ballBox0.x, ballBox0.y);
await t1.mouse.down();
await t1.mouse.up();
await t1.waitForTimeout(600);
const itemN = await t1.$eval("#chushi-sniffer-host", (el) => (el.shadowRoot ? el.shadowRoot.querySelectorAll(".item").length : 0));
ok("面板列出 3 项资源", itemN === 3, `items=${itemN}`);
const dlBtn = await t1.$eval("#chushi-sniffer-host", (el) => !!el.shadowRoot.querySelector('.item button[data-act="dl"]'));
ok("下载按钮在位", dlBtn);
/* 复制链接按钮 */
const cpBtn = await t1.$eval("#chushi-sniffer-host", (el) => !!el.shadowRoot.querySelector('.item button[data-act="cp"]'));
ok("复制链接按钮在位", cpBtn);
/* 拖拽浮球 */
const posBefore = await t1.$eval("#chushi-sniffer-host", (el) => {
  const b = el.shadowRoot.querySelector(".ball");
  return { x: parseFloat(b.style.left), y: parseFloat(b.style.top) };
});
const ballBox = await t1.$eval("#chushi-sniffer-host", (el) => {
  const r = el.shadowRoot.querySelector(".ball").getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
await t1.mouse.move(ballBox.x, ballBox.y);
await t1.mouse.down();
await t1.mouse.move(ballBox.x - 120, ballBox.y + 80, { steps: 8 });
await t1.mouse.up();
await t1.waitForTimeout(300);
const posAfter = await t1.$eval("#chushi-sniffer-host", (el) => {
  const b = el.shadowRoot.querySelector(".ball");
  return { x: parseFloat(b.style.left), y: parseFloat(b.style.top) };
});
ok("浮球可拖拽", Math.abs(posAfter.x - posBefore.x) > 50 && Math.abs(posAfter.y - posBefore.y) > 50, JSON.stringify(posAfter));
/* 拖拽后落点持久化 */
const posSaved = await t1.evaluate(() => JSON.parse(localStorage.getItem("chushi-sniffer-pos") || "null"));
ok("拖拽落点持久化", posSaved && Math.abs(posSaved.x - posAfter.x) < 2, JSON.stringify(posSaved));
/* SW 侧 badge */
const badgeText = await sw.evaluate(() => new Promise((r) => chrome.action.getBadgeText({ tabId: undefined }, (t) => r(t))).catch?.(() => "") ?? "");
void badgeText; /* per-tab badge 不能全局读：浮球 badge 已验 */

/* 9) 关闭开关 → 浮球自毁 */
await popup.click("#sw-sniffer");
await t1.waitForTimeout(800);
const ballGone = await t1.$eval("#chushi-sniffer-host", (el) => el.shadowRoot.querySelector(".ball").style.display === "none");
ok("开关关闭 → 浮球自毁", ballGone === true);

/* 10) PDF 工具箱面板挂载 + 四 tab */
const pt = await ctx.newPage();
await pt.goto(`chrome-extension://${extId}/index.html`);
await pt.waitForSelector(".search-pill");
await pt.mouse.click(640, 400, { button: "right" });
await pt.waitForTimeout(500);
const pdfItem = await pt.locator('[role="menuitem"]', { hasText: "PDF 工具箱" }).count();
ok("右键菜单含 PDF 工具箱", pdfItem >= 1);
await pt.locator('[role="menuitem"]', { hasText: "PDF 工具箱" }).first().click();
await pt.waitForTimeout(600);
const tabsN = await pt.locator('[aria-label="PDF 工具箱"] button:has-text("图片转 PDF")').count();
ok("PDF 面板打开且四功能页签在位", tabsN === 1);
const allTabs = await pt.locator('[aria-label="PDF 工具箱"]').textContent();
ok("四功能全在位", ["图片转 PDF", "PDF 转图片", "PDF 合并", "提取文本"].every((t) => allTabs.includes(t)));

/* 11) PDF 真实转换链：图片→PDF（pdf-lib）+ PDF→图片 zip（pdfjs）+ 提取文本 */
const { PDFDocument: gen } = await import("pdf-lib");
const gdoc = await gen.create();
const gpage = gdoc.addPage([300, 300]);
gpage.drawText("Hello chushi pdf", { x: 40, y: 150, size: 18 });
const gpage2 = gdoc.addPage([300, 300]);
gpage2.drawText("Page two", { x: 40, y: 150, size: 18 });
const pdfBytes = await gdoc.save();
fs.writeFileSync("/tmp/sniffer-test/minimal.pdf", pdfBytes);
fs.copyFileSync("/tmp/ext-stage/icons/icon128.png", "/tmp/sniffer-test/test.png");
fs.copyFileSync("/tmp/sniffer-test/minimal.pdf", "/tmp/sniffer-test/text-src.pdf");

const panelEl = pt.locator('[aria-label="PDF 工具箱"]');
const fileInput = panelEl.locator('input[type="file"]');
/* ① 图片→PDF */
await fileInput.setInputFiles("/tmp/sniffer-test/test.png");
await panelEl.locator("button:has-text(\"转换为 PDF\")").click();
const dl1 = await pt.waitForEvent("download", { timeout: 30000 });
const p1 = "/tmp/v8752-dl1.pdf";
await dl1.saveAs(p1);
const h1 = fs.readFileSync(p1).subarray(0, 5).toString();
ok("图片→PDF 下载且为合法 PDF", h1 === "%PDF-", `header=${h1} size=${fs.statSync(p1).size}`);
/* ② PDF→图片 zip */
await panelEl.locator("button:has-text(\"PDF 转图片\")").first().click();
await pt.waitForTimeout(400);
await fileInput.setInputFiles("/tmp/sniffer-test/minimal.pdf");
await panelEl.locator("button:has-text(\"转换为图片\")").click();
const dl2 = await pt.waitForEvent("download", { timeout: 60000 });
const p2 = "/tmp/v8752-dl2.zip";
await dl2.saveAs(p2);
const h2 = fs.readFileSync(p2).subarray(0, 2).toString();
ok("PDF→图片 zip 下载且为合法 zip", h2 === "PK", `header=${h2} size=${fs.statSync(p2).size}`);
/* ③ 提取文本（等② 的 busy 状态落定） */
await pt.waitForTimeout(900);
await panelEl.locator("button:has-text(\"提取文本\")").first().click();
await pt.waitForTimeout(400);
await fileInput.setInputFiles("/tmp/sniffer-test/text-src.pdf");
await panelEl.locator("button:has-text(\"提取文本\")").last().click();
const dl3 = await pt.waitForEvent("download", { timeout: 60000 });
const p3 = "/tmp/v8752-dl3.txt";
await dl3.saveAs(p3);
const t3 = fs.readFileSync(p3, "utf-8");
ok("提取文本含页面文字", t3.includes("Hello chushi pdf"), t3.slice(0, 60).replace(/\n/g, " "));

/* 截图存档 */
await pt.screenshot({ path: "/tmp/v8752-pdf-tools.png" });
const shot = await ctx.newPage();
await shot.goto(`${BASE}/`);
await shot.waitForTimeout(1200);
await shot.screenshot({ path: "/tmp/v8752-sniffer.png" });

await ctx.close();
const passed = results.filter((r) => r.pass).length;
console.log(`\n===== ${passed}/${results.length} PASSED =====`);
if (passed !== results.length) process.exit(1);
