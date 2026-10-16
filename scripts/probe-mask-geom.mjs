// 抽屉遮罩几何实测探针——用户指令「抽屉页面快捷服务上方的遮罩再往上移一点，
// 现在的挡住了一部分图标，下方的遮罩也下移一点」。
// 实测对象：form="drawer" 磁贴墙抽屉的 FadeVeil top/bottom 两枚羽化遮罩。
// 产出：遮罩 rect / 滚动层 rect / 第一排磁贴 rect / 滚动后显影态重叠关系 / 截图。
import { chromium } from "playwright-core";
import crypto from "crypto";
import { execSync } from "child_process";
import { mkdirSync, rmSync } from "fs";

const ZIP = "/home/z/beta-wt/download/v8.7.115/ChuShi-NewTab-v8.7.115.zip";
const ROOT = "/tmp/ext-mask-probe";
const SHOTS = "/tmp/probe-mask-shots";
const PROFILE = "/tmp/ext-mask-profile";
rmSync(ROOT, { recursive: true, force: true });
rmSync(SHOTS, { recursive: true, force: true });
rmSync(PROFILE, { recursive: true, force: true });
mkdirSync(ROOT, { recursive: true });
mkdirSync(SHOTS, { recursive: true });
execSync(`unzip -oq "${ZIP}" -d "${ROOT}"`);

const EXT_ID = (() => {
  const h = crypto.createHash("sha256").update(Buffer.from(ROOT)).digest("hex").slice(0, 32);
  return [...h].map((c) => String.fromCharCode(97 + (parseInt(c, 16) % 26))).join("");
})();
const EXT_URL = (p) => `chrome-extension://${EXT_ID}/${p}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launchPersistentContext(PROFILE, {
  channel: "chromium", headless: true,
  args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`,
    "--no-first-run", "--no-sandbox", "--window-size=1440,900"],
});
console.log("stage: chromium 启动 EXT_ID=" + EXT_ID.slice(0, 8));

const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(EXT_URL("index.html"));
await page.waitForTimeout(1200);

// 写入 40 个磁贴（7 排，保证抽屉可滚）——links 存 localStorage（useStored）
const links = Array.from({ length: 40 }, (_, i) => ({
  id: "t" + i, name: "站点" + (i + 1), url: "https://example" + i + ".com",
}));
await page.evaluate((ls) => localStorage.setItem("start:links", JSON.stringify(ls)), links);
await page.reload();
await page.waitForTimeout(1200);

// 中键唤出抽屉（页面空白处）
await page.mouse.click(120, 450, { button: "middle" });
await page.waitForTimeout(900); // 0.4s 动画 + 余量

const geom = await page.evaluate(() => {
  const out = { vw: innerWidth, vh: innerHeight };
  const rect = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), height: Math.round(r.height) };
  };
  const style = (el) => {
    if (!el) return null;
    const s = getComputedStyle(el);
    return { opacity: s.opacity, top: s.top, bottom: s.bottom, height: s.height, transform: s.transform };
  };
  // 抽屉 portal：body 下的 fixed z-45 层（.cl-drawer-veil 的父层）
  const drawerRoot = document.querySelector(".cl-drawer-veil")?.parentElement || null;
  out.drawerOpen = !!document.querySelector('.cl-drawer-veil[data-veil="1"]');
  const within = (sel) => drawerRoot ? [...drawerRoot.querySelectorAll(sel)] : [];
  const [veilTop] = within(".cl-fade-veil-top");
  const [veilBot] = within(".cl-fade-veil-bottom");
  const [scroll] = within(".cl-links-scroll");
  const firstTile = drawerRoot ? drawerRoot.querySelector(".cl-links-grid > div:first-child") : null;
  out.veilTop = { rect: rect(veilTop), style: style(veilTop) };
  out.veilBottom = { rect: rect(veilBot), style: style(veilBot) };
  out.scroll = { rect: rect(scroll), style: style(scroll) };
  if (scroll) {
    const s = getComputedStyle(scroll);
    const pr = scroll.parentElement.getBoundingClientRect();
    out.scrollExtra = {
      offsetTop: scroll.offsetTop, offsetHeight: scroll.offsetHeight,
      maxHeight: s.maxHeight, marginTop: s.marginTop, marginBottom: s.marginBottom,
      paddingTop: s.paddingTop, paddingBottom: s.paddingBottom,
      parentPT: getComputedStyle(scroll.parentElement).paddingTop,
      parentPB: getComputedStyle(scroll.parentElement).paddingBottom,
      parentRect: { top: Math.round(pr.top), bottom: Math.round(pr.bottom), height: Math.round(pr.height) },
      parentCls: scroll.parentElement.className.slice(0, 90),
    };
  }
  out.firstTile = rect(firstTile);
  const dock = document.querySelector(".cl-dock");
  out.dock = dock ? rect(dock) : null;
  out.scrollMetrics = scroll ? { scrollTop: scroll.scrollTop, scrollHeight: scroll.scrollHeight, clientHeight: scroll.clientHeight } : null;
  // 内层 motion.div 的 inline transform（判断 containing block 归属）
  const drawerMotion = veilTop ? veilTop.parentElement : null;
  out.parentOfVeil = drawerMotion ? { cls: drawerMotion.className.slice(0, 80), inlineTransform: drawerMotion.style.transform || "(none)" } : null;
  return out;
});
console.log(JSON.stringify(geom, null, 2));

// 滚动磁贴墙到中间（顶/底遮罩都显影），量重叠 + 截图目检渐隐观感
await page.mouse.move(720, 450);
const midScroll = await page.evaluate(() => {
  const el = document.querySelector(".cl-drawer-veil")?.parentElement?.querySelector(".cl-links-scroll");
  return el ? el.scrollHeight - el.clientHeight : 0;
});
for (let i = 0; i < 10; i++) { await page.mouse.wheel(0, Math.round(midScroll / 12)); await sleep(120); }
await page.waitForTimeout(600);
await page.screenshot({ path: SHOTS + "/drawer-mid.png" });
const after = await page.evaluate(() => {
  const drawerRoot = document.querySelector(".cl-drawer-veil")?.parentElement || null;
  if (!drawerRoot) return { err: "drawer gone" };
  const rect = (sel) => {
    const el = drawerRoot.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height) };
  };
  const vt = drawerRoot.querySelector(".cl-fade-veil-top");
  const vb = drawerRoot.querySelector(".cl-fade-veil-bottom");
  const tileTops = [...drawerRoot.querySelectorAll(".cl-links-grid > div")].slice(0, 10).map((el) => Math.round(el.getBoundingClientRect().top));
  const scroll = drawerRoot.querySelector(".cl-links-scroll");
  return {
    veilTopOpacity: vt ? getComputedStyle(vt).opacity : null,
    veilBottomOpacity: vb ? getComputedStyle(vb).opacity : null,
    veilTopRect: rect(".cl-fade-veil-top"),
    veilBottomRect: rect(".cl-fade-veil-bottom"),
    firstTileRect: rect(".cl-links-grid > div:first-child"),
    tileTops,
    scrollTop: scroll ? scroll.scrollTop : null,
  };
});
console.log("after-scroll:", JSON.stringify(after, null, 2));
await page.screenshot({ path: SHOTS + "/drawer-scrolled.png" });
console.log("shots: " + SHOTS + "/drawer-scrolled.png");

await browser.close();
