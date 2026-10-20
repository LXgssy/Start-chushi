/* v8.7.147 真扩展冒烟：抖音预载直链挑选进区块
 * 链路：装包 → 起始页开嗅探开关 → douyin.com 路由桩 → 扩展页直发 19 条
 * play 直链（1 条当前播放 + 18 条相邻预载，video_id 尾段互异）→ 抖音区块
 * 主行 + 折叠「其余 18 条预载直链」→ 展开逐行带独立下载钮（data-nm 互异）
 * → 点预载行下载钮 .ok + toast → 重渲染后折叠开合态保持 → 列表行按
 * video_id 命名不再是「play」→ 面板滚动壳回归 + pageerror=0 全程 */
import { chromium } from "playwright-core";
import { execSync } from "child_process";
import { mkdtempSync, rmSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { createHash } from "crypto";

const ZIP = "/home/z/beta-wt/download/v8.7.147/ChuShi-NewTab-v8.7.147.zip";
const extDir = mkdtempSync(tmpdir() + "/ext-v147-");
execSync(`unzip -qo "${ZIP}" -d ${extDir}`);
const mf = JSON.parse(readFileSync(extDir + "/manifest.json", "utf8"));
if (mf.version !== "8.7.147") { console.error("✗ manifest 版本异常 " + mf.version); process.exit(1); }
console.log("✓ M0 manifest 8.7.147");

rmSync("/tmp/ext-v147-profile", { recursive: true, force: true });
const browser = await chromium.launchPersistentContext("/tmp/ext-v147-profile", {
  headless: true,
  channel: "chromium",
  args: [`--headless=new`, `--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`],
});
const extId = createHash("sha256").update(extDir).digest("hex").slice(0, 32)
  .split("").map((c) => "abcdefghijklmnop"[parseInt(c, 16)]).join("");
const errors = [];

const start = await browser.newPage();
start.on("pageerror", (e) => errors.push("start:" + String(e)));
await start.goto(`chrome-extension://${extId}/index.html`, { waitUntil: "domcontentloaded", timeout: 30000 });
await start.evaluate(() => new Promise((res) => chrome.storage.local.set({ snifferOn: true }, res)));
console.log("✓ M1 snifferOn=true 已写入");
await new Promise((r) => setTimeout(r, 800));

const sendItems = (items) => start.evaluate(async (its) => {
  const tabs = await chrome.tabs.query({ url: "https://www.douyin.com/*" });
  if (!tabs.length) return { fail: "no douyin tab" };
  await new Promise((res) => chrome.tabs.sendMessage(tabs[0].id, { type: "sniffer-new", items: its }, res));
  return { ok: true, n: its.length };
}, items);

/* —— 抖音推荐页路由桩 —— */
const page = await browser.newPage();
page.on("pageerror", (e) => errors.push("douyin:" + String(e)));
await page.route("https://www.douyin.com/**", (route) =>
  route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><html><head><title>今日份可爱猫猫 -抖音</title></head><body><div id=\"Douyin\"></div></body></html>" }));
await page.goto("https://www.douyin.com/", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForSelector("#chushi-sniffer-host", { state: "attached", timeout: 15000 });
await page.waitForFunction(() => {
  const r = document.querySelector("#chushi-sniffer-host")?.shadowRoot;
  return !!r && r.querySelector(".ball")?.style.display !== "none";
}, null, { timeout: 15000 });
console.log("✓ M2 抖音页浮球亮起");

function ballTap(pg) {
  return pg.evaluate(() => {
    const b = document.querySelector("#chushi-sniffer-host").shadowRoot.querySelector(".ball");
    b.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 1, button: 0, pointerType: "mouse", clientX: 100, clientY: 100 }));
    b.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 1, button: 0, pointerType: "mouse", clientX: 100, clientY: 100 }));
  });
}
await ballTap(page);
await page.waitForFunction(() => {
  const r = document.querySelector("#chushi-sniffer-host")?.shadowRoot;
  return !!r && !!r.querySelector(".panel.open");
}, null, { timeout: 8000 });
console.log("✓ M3 面板展开");

/* 直发 19 条：video_id 尾段互异；当前播放档 = 最新一条（id c18） */
const mk = (i) => ({
  url: `https://www.douyin.com/aweme/v1/play/?video_id=v0d00fg10000c${i}abc&ratio=540p&line=0`,
  type: "video", ext: "mp4", name: "", size: i === 18 ? 12_582_912 : 0,
  host: "www.douyin.com", at: Date.now() + i,
});
const r1 = await sendItems(Array.from({ length: 19 }, (_, i) => mk(i)));
if (r1.fail) { console.error("✗ 发送失败 " + r1.fail); process.exit(1); }
await page.waitForFunction(() => {
  const r = document.querySelector("#chushi-sniffer-host")?.shadowRoot;
  return !!r && r.querySelector(".dy-more");
}, null, { timeout: 8000 });
console.log("✓ M4 19 条直链入库，dy-more 折叠出现");

const D = (pg) => pg.evaluate(() => {
  const r = document.querySelector("#chushi-sniffer-host").shadowRoot;
  const $ = (s) => r.querySelector(s);
  const dyB = [...r.querySelectorAll(".bili")].find((b) => b.querySelector(".bili-ic")?.textContent === "抖");
  if (!dyB) return { none: true };
  const fold = dyB.querySelector("details.dy-more");
  const rows = [...dyB.querySelectorAll("details.dy-more .bq")];
  const mainBtn = dyB.querySelector('.bq button[data-act="douyin-dl"]:not([data-nm])');
  const tip = dyB.querySelector(".bili-tip")?.textContent.trim();
  return {
    none: false,
    foldOpen: fold ? fold.hasAttribute("open") : null,
    summary: fold ? fold.querySelector("summary")?.textContent.replace(/^其余/, "其余").trim() : null,
    nRows: rows.length,
    labels: rows.map((b) => b.querySelector(".l")?.textContent.trim()),
    nms: rows.map((b) => b.querySelector("button")?.getAttribute("data-nm")),
    uniqNm: new Set(rows.map((b) => b.querySelector("button")?.getAttribute("data-nm"))).size,
    mainBtnHasNm: mainBtn ? mainBtn.hasAttribute("data-nm") : null,
    mainRow: dyB.querySelector(".bq .l")?.textContent.trim(),
    tip,
  };
});

let d = await D(page);
if (d.none) { console.error("✗ 抖音区块未渲染"); process.exit(1); }
const M5ok = d.foldOpen === false && /其余 18 条预载直链（相邻视频预加载，新→旧）/.test(d.summary) &&
  d.tip === "下载失败多为直链过期——重播视频刷新后再试" && d.mainRow === "完整视频" && d.mainBtnHasNm === false;
console.log((M5ok ? "✓" : "✗") + ` M5 默认收起：summary=${d.summary} 提示已去「列表挑选」引导 主行=完整视频(无 data-nm)`);
if (!M5ok) { console.log(JSON.stringify(d, null, 2)); process.exit(1); }

await page.evaluate(() => {
  const r = document.querySelector("#chushi-sniffer-host").shadowRoot;
  r.querySelector("details.dy-more summary").click();
});
d = await D(page);
const M6ok = d.foldOpen === true && d.nRows === 18 && d.uniqNm === 18 &&
  d.labels[0] === "预载 01" && d.labels[17] === "预载 18" &&
  d.nms.every((n) => /^抖音视频_[0-9a-z]+$/.test(n)) &&
  !d.nms.includes("play");
console.log((M6ok ? "✓" : "✗") + ` M6 展开逐行：18 行标号 预载01→18 data-nm 全部 video_id 尾段命名且互异（无 play 残留）`);
if (!M6ok) { console.log(JSON.stringify(d, null, 2)); process.exit(1); }

/* 点预载 05 的下载钮：.ok 态 + toast（sniffer-download 已发 SW） */
await page.evaluate(() => {
  const r = document.querySelector("#chushi-sniffer-host").shadowRoot;
  const rows = [...r.querySelectorAll("details.dy-more .bq")];
  rows[4].querySelector('button[data-act="douyin-dl"]').click();
});
await page.waitForFunction(() => {
  const r = document.querySelector("#chushi-sniffer-host")?.shadowRoot;
  const rows = r && [...r.querySelectorAll("details.dy-more .bq")];
  return !!rows && rows[4] && rows[4].querySelector("button")?.classList.contains("ok");
}, null, { timeout: 6000 });
const toast = await page.evaluate(() => {
  const r = document.querySelector("#chushi-sniffer-host").shadowRoot;
  return { ok: true, t: r.querySelector(".toast")?.textContent.trim() };
});
const M7ok = /抖音视频已发起下载/.test(toast.t);
console.log((M7ok ? "✓" : "✗") + ` M7 预载行下载：钮 .ok + toast「${toast.t}」（sniffer-download 已发 SW 走 DNR Referer 代理）`);
if (!M7ok) { console.log(JSON.stringify(toast, null, 2)); process.exit(1); }

/* 重渲染（全量 19 条重发）→ 折叠保持展开 + 行数保持（dyMoreOpen 律） */
await page.waitForTimeout(150);
await sendItems(Array.from({ length: 19 }, (_, i) => mk(i)));
await page.waitForFunction(() => {
  const r = document.querySelector("#chushi-sniffer-host")?.shadowRoot;
  const f = r && r.querySelector(".dy-more");
  return !!f && f.hasAttribute("open");
}, null, { timeout: 8000 });
d = await D(page);
const M8ok = d.foldOpen === true && d.nRows === 18;
console.log((M8ok ? "✓" : "✗") + ` M8 开合态保持：重渲染后折叠仍展开且 18 行在位`);
if (!M8ok) { console.log(JSON.stringify(d, null, 2)); process.exit(1); }

/* 列表行命名回归：.list 里这些直链显示「抖音视频_xxx」而非「play」 */
const listNames = await page.evaluate(() => {
  const r = document.querySelector("#chushi-sniffer-host").shadowRoot;
  return [...r.querySelectorAll(".list .nm")].map((n) => n.textContent.trim());
});
const M9ok = listNames.length === 19 && listNames.every((n) => /^抖音视频_[0-9a-z]+$/.test(n)) &&
  new Set(listNames).size === 19;
console.log((M9ok ? "✓" : "✗") + ` M9 列表行命名：${listNames.length} 行全部「抖音视频_尾段」且互异（样例 ${listNames[0]}）`);
if (!M9ok) { console.log(JSON.stringify(listNames.slice(0, 5), null, 2)); process.exit(1); }

/* v8.7.146 滚动壳回归 + 深色规则 */
const reg = await page.evaluate(() => {
  const r = document.querySelector("#chushi-sniffer-host").shadowRoot;
  const pb = r.querySelector(".pbody");
  const t = r.querySelector("style").textContent;
  return {
    pbody: !!pb && getComputedStyle(pb).overflowY === "auto",
    phShrink: getComputedStyle(r.querySelector(".ph")).flexShrink === "0",
    dark: t.includes(":host(.framedark) .dy-more summary:hover"),
    canScroll: pb.scrollHeight > pb.clientHeight,
  };
});
console.log((reg.pbody && reg.phShrink ? "✓" : "✗") + ` M10 滚动壳回归：pbody=${reg.pbody} 头部锁死=${reg.phShrink} 深色规则=${reg.dark} 面板可滚=${reg.canScroll}`);
if (!(reg.pbody && reg.phShrink && reg.dark)) process.exit(1);

await browser.close();
if (errors.length) {
  console.error("✗ pageerror:", errors);
  process.exit(1);
}
console.log("✓ pageerror=0 全程");
console.log("\nSMOKE PASS (v8.7.147)");
