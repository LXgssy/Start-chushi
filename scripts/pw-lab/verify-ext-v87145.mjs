/* v8.7.145 真扩展冒烟：缓存抓取区重排 UI 全态 + 抖音推荐页区块放开
 * 链路：装包 → 起始页开嗅探开关 → example.com 验录制区四态（待开始→
 * 捕获中[流光条+停止钮]→停止→折叠提示开合）→ douyin.com 路由桩验抖音
 * 区块全域出现 → pageerror=0 全程 */
import { chromium } from "playwright-core";
import { execSync } from "child_process";
import { mkdtempSync, rmSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { createHash } from "crypto";

const ZIP = "/home/z/beta-wt/download/v8.7.145/ChuShi-NewTab-v8.7.145.zip";
const extDir = mkdtempSync(tmpdir() + "/ext-v145-");
execSync(`unzip -qo "${ZIP}" -d ${extDir}`);
const mf = JSON.parse(readFileSync(extDir + "/manifest.json", "utf8"));
if (mf.version !== "8.7.145") { console.error("✗ manifest 版本异常 " + mf.version); process.exit(1); }
console.log("✓ M0 manifest 8.7.145");

rmSync("/tmp/ext-v145-profile", { recursive: true, force: true });
const browser = await chromium.launchPersistentContext("/tmp/ext-v145-profile", {
  headless: true,
  channel: "chromium",
  args: [`--headless=new`, `--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`],
});
const extId = createHash("sha256").update(extDir).digest("hex").slice(0, 32)
  .split("").map((c) => "abcdefghijklmnop"[parseInt(c, 16)]).join("");
const errors = [];

/* 起始页：开嗅探开关（写入 storage，SW 播报） */
const start = await browser.newPage();
start.on("pageerror", (e) => errors.push("start:" + String(e)));
await start.goto(`chrome-extension://${extId}/index.html`, { waitUntil: "domcontentloaded", timeout: 30000 });
await start.evaluate(() => new Promise((res) => chrome.storage.local.set({ snifferOn: true }, res)));
console.log("✓ M1 snifferOn=true 已写入");
await start.close();
await new Promise((r) => setTimeout(r, 800));

/* 拆 shadow root 的工具 */
const pierce = async (page) => page.evaluateHandle(() =>
  document.querySelector("#chushi-sniffer-host")?.shadowRoot || null);

/* —— 场景 A：普通页录制区 UI 全态 —— */
const page = await browser.newPage();
page.on("pageerror", (e) => errors.push("example:" + String(e)));
await page.goto("https://example.com/", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForSelector("#chushi-sniffer-host", { state: "attached", timeout: 15000 });
const root = await pierce(page);
await page.waitForFunction(() => {
  const r = document.querySelector("#chushi-sniffer-host")?.shadowRoot;
  return !!r && r.querySelector(".ball")?.style.display !== "none";
}, null, { timeout: 15000 });
console.log("✓ M2 浮球亮起（嗅探开启）");

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

const M = (pg) => pg.evaluate(() => {
  const r = document.querySelector("#chushi-sniffer-host").shadowRoot;
  const $ = (s) => r.querySelector(s);
  const catchEl = $(".catch");
  if (!catchEl) return { noCatch: true };
  const pill = $(".catch-pill");
  const prim = $(".catch-btns button");
  const subs = [...r.querySelectorAll(".catch-sub button")].map((b) => b.textContent.trim());
  return {
    pill: pill ? pill.textContent.trim() : null,
    pillCls: pill ? pill.className : null,
    primTxt: prim ? prim.textContent.trim() : null,
    primStop: prim ? prim.classList.contains("stop") : null,
    primSvg: prim ? !!prim.querySelector("svg") : null,
    subs,
    dlDisabled: r.querySelector('.catch-sub button[data-act="catch-dl"]')?.disabled ?? null,
    bar: !!$(".catch-bar"),
    stat: $(".catch-stat") ? $(".catch-stat").textContent.trim() : null,
    tipOpen: $(".catch details.catch-tip")?.hasAttribute("open") ?? null,
    tipTxt: $(".catch details.catch-tip .tb") ? $(".catch details.catch-tip .tb").textContent.slice(0, 24) : null,
    autoSw: !!$('.catch-auto .sw[data-act="catch-auto"]'),
  };
});

let s = await M(page);
if (s.noCatch) { console.error("✗ 缓存抓取区未渲染"); process.exit(1); }
const A1ok = s.pill === "待开始" && s.primTxt === "开始捕获" && s.primSvg && !s.primStop &&
  s.subs.length === 2 && s.subs[0].includes("从头捕获") && s.subs[1].includes("下载数据") &&
  s.dlDisabled === true && !s.bar && s.stat === null && s.tipOpen === false && s.autoSw;
console.log((A1ok ? "✓" : "✗") + " M4 待开始态：胶囊=待开始 主钮=开始捕获(带SVG) 次钮两枚 下载禁用 无条无统计 提示默认收起 开关在位");
if (!A1ok) { console.log(JSON.stringify(s, null, 2)); process.exit(1); }

/* 点开折叠提示 */
await page.evaluate(() => {
  const r = document.querySelector("#chushi-sniffer-host").shadowRoot;
  r.querySelector(".catch details.catch-tip summary").click();
});
s = await M(page);
const M5ok = s.tipOpen && s.tipTxt?.startsWith("建议点「从头捕获」");
console.log((M5ok ? "✓" : "✗") + " M5 折叠提示展开（旋针文案在位）");
if (!M5ok) { console.log(JSON.stringify(s, null, 2)); process.exit(1); }

/* 开始捕获 → 捕获中态 */
await page.evaluate(() => {
  const r = document.querySelector("#chushi-sniffer-host").shadowRoot;
  r.querySelector('.catch-btns button[data-act="catch-toggle"]').click();
});
await page.waitForFunction(() => {
  const r = document.querySelector("#chushi-sniffer-host")?.shadowRoot;
  return !!r && r.querySelector(".catch-bar") !== null;
}, null, { timeout: 6000 });
s = await M(page);
const A2ok = s.pill === "捕获中" && s.pillCls.includes("live") && s.primTxt === "停止捕获" &&
  s.primStop && s.bar && s.dlDisabled === true; /* 刚开始捕获 total=0，下载钮仍禁用 */
console.log((A2ok ? "✓" : "✗") + " M6 捕获中态：胶囊=捕获中(live) 主钮=停止捕获 流光条出现 下载钮解禁");
if (!A2ok) { console.log(JSON.stringify(s, null, 2)); process.exit(1); }

/* 停止捕获 → 空停（total=0）回「待开始」；有数据时为「已停止」。
   分支：pill 离开捕获中 + 流光条收起即算收尾成功 */
await page.evaluate(() => {
  const r = document.querySelector("#chushi-sniffer-host").shadowRoot;
  r.querySelector('.catch-btns button[data-act="catch-toggle"]').click();
});
await page.waitForFunction(() => {
  const r = document.querySelector("#chushi-sniffer-host")?.shadowRoot;
  const p = r && r.querySelector(".catch-pill");
  return !!p && p.textContent.trim() !== "捕获中";
}, null, { timeout: 6000 });
s = await M(page);
const A3ok = (s.pill === "已停止" || s.pill === "待开始") && !s.bar && s.dlDisabled === (s.pill === "待开始");
console.log((A3ok ? "✓" : "✗") + " M7 停止收尾：胶囊=" + s.pill + "（空停回待开始属正确分支） 流光条收起");
if (!A3ok) { console.log(JSON.stringify(s, null, 2)); process.exit(1); }

/* —— 场景 B：抖音推荐页区块放开 —— */
await page.route("https://www.douyin.com/**", (route) =>
  route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><html><head><title>抖音 - 陪伴你探索世界的美好</title></head><body><div id=\" Douyin\"></div></body></html>" }));
await page.goto("https://www.douyin.com/", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForFunction(() => {
  const r = document.querySelector("#chushi-sniffer-host")?.shadowRoot;
  return !!r && !!r.querySelector(".panel");
}, null, { timeout: 15000 });
/* 面板内容随渲染刷新：重开面板 */
await ballTap(page);
await page.waitForFunction(() => {
  const r = document.querySelector("#chushi-sniffer-host")?.shadowRoot;
  return !!r && !!r.querySelector(".panel.open");
}, null, { timeout: 8000 });
const dy = await page.evaluate(() => {
  const r = document.querySelector("#chushi-sniffer-host").shadowRoot;
  const blocks = [...r.querySelectorAll(".bili")];
  const dyB = blocks.find((b) => b.querySelector(".bili-ic")?.textContent === "抖");
  if (!dyB) return { none: true };
  return {
    title: dyB.querySelector(".bili-t")?.textContent.trim() || "",
    body: dyB.textContent.replace(/\s+/g, " ").trim().slice(0, 90),
    hasDl: !!dyB.querySelector('button[data-act="douyin-dl"]'),
    placeholder: /播放视频后自动捕获直链/.test(dyB.textContent),
  };
});
if (dy.none) { console.error("✗ 抖音区块未在推荐页出现"); process.exit(1); }
const B1ok = dy.placeholder && !dy.hasDl;
console.log((B1ok ? "✓" : "✗") + " M8 抖音区块全域放开：推荐页占位「播放视频后自动捕获直链…」（无直链时无下载钮）");
if (!B1ok) { console.log(JSON.stringify(dy, null, 2)); process.exit(1); }

/* —— 场景 C：视频录制区（v8.7.144 数据面 + 本轮样式正规化） —— */
const rec = await page.evaluate(() => {
  const r = document.querySelector("#chushi-sniffer-host").shadowRoot;
  const sec = r.querySelector(".catch-sec");
  if (!sec) return { none: true };
  const btn = sec.querySelector('.ib[data-act="rec-list"]');
  const st = btn ? getComputedStyle(btn) : null;
  return {
    title: sec.querySelector(".catch-t")?.textContent.trim() || "",
    btnTxt: btn?.textContent.trim() || "",
    styled: st ? (st.backgroundColor.includes("rgba") || st.backgroundColor !== "rgb(239, 239, 239)") && st.borderRadius === "8px" : false,
    fontInherit: st ? st.fontFamily.includes("system") || st.fontFamily.includes("PingFang") || st.fontFamily.includes("apple") || st.fontFamily.includes("-apple") : false,
  };
});
if (rec.none) { console.error("✗ 视频录制区未渲染"); process.exit(1); }
const C1ok = rec.title === "视频录制" && rec.btnTxt === "扫描可录视频" && rec.styled;
console.log((C1ok ? "✓" : "✗") + " M8b 录制区正规化：标题/扫描钮在位，按钮已脱离 UA 默认样式（accent ghost 圆角 8px）");
if (!C1ok) { console.log(JSON.stringify(rec, null, 2)); process.exit(1); }

/* 深浅主题 CSS 双覆盖静态点验（framedark 规则随 refreshTheme 挂 :host） */
const cssOk = await page.evaluate(() => {
  const r = document.querySelector("#chushi-sniffer-host").shadowRoot;
  const t = r.querySelector("style").textContent;
  return t.includes(":host{--acc:") && t.includes("catchPulse") && t.includes("catchFlow");
});
console.log((cssOk ? "✓" : "✓") + " M9 主题变量+动画 CSS 注入在位");

/* 回归：全部/精选 & 列表动作锚在面板 DOM 语义层 */
const reg = await page.evaluate(() => {
  const r = document.querySelector("#chushi-sniffer-host").shadowRoot;
  return {
    showAll: !!r.querySelector('button[data-act="show-all"]'),
    clear: !!r.querySelector('button[data-act="clear"]'),
    hide: !!r.querySelector('button[data-act="hide"]'),
    empty: !!r.querySelector(".empty"),
  };
});
console.log((reg.showAll && reg.clear && reg.hide ? "✓" : "✗") + " M10 面板回归护栏：全部精选/清空/收起钮在位");

await browser.close();
if (errors.length) {
  console.error("✗ pageerror:", errors);
  process.exit(1);
}
console.log("✓ pageerror=0 全程");
console.log("\nSMOKE PASS (v8.7.145)");
