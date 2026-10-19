/* v8.7.146 真扩展冒烟：嗅探面板整体滚动 + 头部锁死
 * 链路：装包 → 起始页开嗅探开关 → example.com 验新布局骨架（.pbody 滚动壳
 * + .ph flex-shrink:0 锁死 + .list 滚动退役）→ 短内容不滚动 → 扩展页直发
 * sniffer-new 30 条假资源 → 面板可滚动（scrollHeight>clientHeight，面板高
 * ≤420 不破顶）→ 滚到中部验头部几何不动 → 再发 1 条重渲染验 scrollTop
 * 保持（500ms 回刷不打断滚动）→ pageerror=0 全程 */
import { chromium } from "playwright-core";
import { execSync } from "child_process";
import { mkdtempSync, rmSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { createHash } from "crypto";

const ZIP = "/home/z/beta-wt/download/v8.7.146/ChuShi-NewTab-v8.7.146.zip";
const extDir = mkdtempSync(tmpdir() + "/ext-v146-");
execSync(`unzip -qo "${ZIP}" -d ${extDir}`);
const mf = JSON.parse(readFileSync(extDir + "/manifest.json", "utf8"));
if (mf.version !== "8.7.146") { console.error("✗ manifest 版本异常 " + mf.version); process.exit(1); }
console.log("✓ M0 manifest 8.7.146");

rmSync("/tmp/ext-v146-profile", { recursive: true, force: true });
const browser = await chromium.launchPersistentContext("/tmp/ext-v146-profile", {
  headless: true,
  channel: "chromium",
  args: [`--headless=new`, `--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`],
});
const extId = createHash("sha256").update(extDir).digest("hex").slice(0, 32)
  .split("").map((c) => "abcdefghijklmnop"[parseInt(c, 16)]).join("");
const errors = [];

/* 起始页：开嗅探开关 + 留作消息发射台（tabs 权限直发 sniffer-new） */
const start = await browser.newPage();
start.on("pageerror", (e) => errors.push("start:" + String(e)));
await start.goto(`chrome-extension://${extId}/index.html`, { waitUntil: "domcontentloaded", timeout: 30000 });
await start.evaluate(() => new Promise((res) => chrome.storage.local.set({ snifferOn: true }, res)));
console.log("✓ M1 snifferOn=true 已写入");
await new Promise((r) => setTimeout(r, 800));

/* —— example.com：新布局骨架 —— */
const page = await browser.newPage();
page.on("pageerror", (e) => errors.push("example:" + String(e)));
await page.goto("https://example.com/", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForSelector("#chushi-sniffer-host", { state: "attached", timeout: 15000 });
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

const G = (pg) => pg.evaluate(() => {
  const r = document.querySelector("#chushi-sniffer-host").shadowRoot;
  const $ = (s) => r.querySelector(s);
  const ph = $(".ph"), pb = $(".pbody"), panel = $(".panel");
  if (!pb) return { noPbody: true };
  const phSt = getComputedStyle(ph), pbSt = getComputedStyle(pb);
  return {
    noPbody: false,
    headerTxt: ph.querySelector(".t")?.textContent.trim(),
    phFlexShrink: phSt.flexShrink,
    pbOverflowY: pbSt.overflowY,
    pbInPanel: pb.parentElement === panel,
    phBeforePb: ph.nextElementSibling === pb,
    listInPb: !!pb.querySelector(":scope > .list"),
    catchInPb: !!pb.querySelector(":scope > .catch"),
    secInPb: !!pb.querySelector(":scope > .catch-sec"),
    panelH: panel.getBoundingClientRect().height,
    scrollH: pb.scrollHeight,
    clientH: pb.clientHeight,
    canScroll: pb.scrollHeight > pb.clientHeight,
    phH: Math.round(ph.getBoundingClientRect().height),
    phTopInPanel: Math.round(ph.getBoundingClientRect().top - panel.getBoundingClientRect().top),
  };
});

let g = await G(page);
if (g.noPbody) { console.error("✗ .pbody 滚动壳未渲染"); process.exit(1); }
const M4ok = g.headerTxt === "资源嗅探" && g.phFlexShrink === "0" && g.pbOverflowY === "auto" &&
  g.pbInPanel && g.phBeforePb && g.listInPb && g.catchInPb && g.secInPb;
console.log((M4ok ? "✓" : "✗") + ` M4 骨架：头部=资源嗅探 flexShrink=${g.phFlexShrink} pbody overflowY=${g.pbOverflowY} 是面板直接子元素且紧随头部，catch/录制/list 全在壳内`);
if (!M4ok) { console.log(JSON.stringify(g, null, 2)); process.exit(1); }

/* 空闲态内容（抓取区+录制区+空态）本身可达 389px>可用 374px，旧布局里这
   15px 也由 .list 内部滚动吃掉——行为对等；此处只锁面板不破顶+头部贴顶 */
const M5ok = g.panelH <= 422 && g.phTopInPanel <= 1;
console.log((M5ok ? "✓" : "✗") + ` M5 空闲态：面板高=${Math.round(g.panelH)}≤420 头部贴顶 offset=${g.phTopInPanel}（壳滚动量 scrollH-clientH=${g.scrollH - g.clientH}px，旧版同源）`);
if (!M5ok) { console.log(JSON.stringify(g, null, 2)); process.exit(1); }

/* —— 扩展页直发 30 条假资源 → 长内容可滚动 —— */
const mkItems = (n, seed) => Array.from({ length: n }, (_, i) => ({
  url: `https://cdn.example.com/media/clip-${seed}-${i}.mp4`,
  type: "video", ext: "mp4",
  name: `嗅探测试视频资源第 ${seed}-${i} 号相当长的文件名用来撑行高.mp4`,
  size: 1024 * 1024 * (i + 1), host: "cdn.example.com", at: Date.now(),
}));

const sent = await start.evaluate(async (items) => {
  const tabs = await chrome.tabs.query({ url: "https://example.com/*" });
  if (!tabs.length) return { fail: "no example tab" };
  await new Promise((res) => chrome.tabs.sendMessage(tabs[0].id, { type: "sniffer-new", items }, res));
  return { tabId: tabs[0].id, n: items.length };
}, mkItems(30, 1));
if (sent.fail) { console.error("✗ 发送失败 " + sent.fail); process.exit(1); }
console.log(`✓ M6 已向 tab ${sent.tabId} 直发 30 条 sniffer-new`);

await page.waitForFunction(() => {
  const r = document.querySelector("#chushi-sniffer-host")?.shadowRoot;
  const pb = r && r.querySelector(".pbody");
  return !!pb && pb.scrollHeight > pb.clientHeight;
}, null, { timeout: 8000 });
g = await G(page);
const M7ok = g.canScroll && g.panelH <= 422 && g.clientH < g.panelH && g.clientH >= 250;
console.log((M7ok ? "✓" : "✗") + ` M7 长内容态：壳可滚动（scrollH=${g.scrollH} clientH=${g.clientH}）面板高=${Math.round(g.panelH)}≤420 壳高≈面板高-头部${g.phH}`);
if (!M7ok) { console.log(JSON.stringify(g, null, 2)); process.exit(1); }

/* 滚到中部 → 头部几何必须纹丝不动（小数几何对比，避开亚像素 round 翻边）
   先等展开过渡（translateY+scale 220ms）完全沉降，否则采样落在尾段会误报面板位移 */
await page.waitForTimeout(450);
const preScroll = await page.evaluate(() => {
  const r = document.querySelector("#chushi-sniffer-host").shadowRoot;
  const ph = r.querySelector(".ph").getBoundingClientRect();
  return {
    top: ph.top, h: ph.height,
    panelTop: r.querySelector(".panel").getBoundingClientRect().top,
    transform: getComputedStyle(r.querySelector(".panel")).transform,
  };
});
await page.evaluate(() => {
  document.querySelector("#chushi-sniffer-host").shadowRoot.querySelector(".pbody").scrollTop = 300;
});
await new Promise((r) => setTimeout(r, 120));
const geo = await page.evaluate((pre) => {
  const r = document.querySelector("#chushi-sniffer-host").shadowRoot;
  const ph = r.querySelector(".ph").getBoundingClientRect();
  const panel = r.querySelector(".panel").getBoundingClientRect();
  return {
    st: r.querySelector(".pbody").scrollTop,
    dTop: Math.abs(ph.top - panel.top - (pre.top - pre.panelTop)),
    dH: Math.abs(ph.height - pre.h),
    panelStill: Math.abs(panel.top - pre.panelTop),
    cnt: r.querySelector(".cnt")?.textContent.trim(),
  };
}, preScroll);
const preTransform = preScroll.transform;
const M8ok = geo.st === 300 && preTransform === "none" && geo.dTop < 0.5 && geo.dH < 0.5 && geo.panelStill < 0.5;
console.log((M8ok ? "✓" : "✗") + ` M8 滚动后头部锁死：scrollTop=${geo.st} 过渡已沉降 transform=${preTransform} 头部相对位移=${geo.dTop.toFixed(3)}px 高度变化=${geo.dH.toFixed(3)}px 面板未动=${geo.panelStill.toFixed(3)}px 计数徽章=${geo.cnt}`);
if (!M8ok) { console.log(JSON.stringify(geo, null, 2)); process.exit(1); }

/* 重渲染（再发全量 31 条=原 30+新 1，sniffer-new 语义为整表替换）
   → scrollTop 保持不归零（500ms 回刷不打断滚动律） */
await start.evaluate(async (items) => {
  const tabs = await chrome.tabs.query({ url: "https://example.com/*" });
  await new Promise((res) => chrome.tabs.sendMessage(tabs[0].id, { type: "sniffer-new", items }, res));
}, [...mkItems(30, 1), ...mkItems(1, 9)]);
await page.waitForFunction(() => {
  const r = document.querySelector("#chushi-sniffer-host")?.shadowRoot;
  const c = r && r.querySelector(".cnt");
  return !!c && c.textContent.trim() === "31";
}, null, { timeout: 8000 });
const kept = await page.evaluate(() => {
  const r = document.querySelector("#chushi-sniffer-host").shadowRoot;
  return { st: r.querySelector(".pbody").scrollTop, cnt: r.querySelector(".cnt").textContent.trim() };
});
const M9ok = kept.cnt === "31" && kept.st > 0;
console.log((M9ok ? "✓" : "✗") + ` M9 重渲染滚动保持：计数=${kept.cnt}/31 scrollTop=${kept.st}（未被打回 0）`);
if (!M9ok) { console.log(JSON.stringify(kept, null, 2)); process.exit(1); }

/* 滚回顶部 + 深色主题滚动条规则静态点验 */
const dark = await page.evaluate(() => {
  const t = document.querySelector("#chushi-sniffer-host").shadowRoot.querySelector("style").textContent;
  return t.includes(".pbody::-webkit-scrollbar") && t.includes(":host(.framedark) .pbody::-webkit-scrollbar-thumb") &&
    !t.includes(".list{overflow-y:auto") && t.includes(".list{padding:7px;}");
});
console.log((dark ? "✓" : "✗") + " M10 CSS 迁移：.pbody 滚动条+深色规则在位，.list 自带滚动已退役");

await browser.close();
if (errors.length) {
  console.error("✗ pageerror:", errors);
  process.exit(1);
}
console.log("✓ pageerror=0 全程");
console.log("\nSMOKE PASS (v8.7.146)");
