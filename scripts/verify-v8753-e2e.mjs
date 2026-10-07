/* v8.7.53 六项修复 E2E —— Playwright channel chromium + 加载扩展
 * 覆盖：
 *   1 浮起/下沉动画恢复（transition 白名单含 scale；focus 过程中 scale 插值进行中）
 *   2 描边 1px + 浅色黑描边（inset 层 0.30；聚焦态 form border-color 透明化）
 *   3 四站直搜并入引擎菜单（分组「站内直搜」+ 自绘图标 + 选中后回车真跳 B 站）
 *   4 右键菜单项无位移（ctx-item-in-kf 无 transform；运行时 computed transform none）
 *   5 PDF 工具弹窗 = 指令面板动画（开 = 弹簧 inline transform；关 = palette-out 类）
 *   6 嗅探面板布局重排（头部图标+计数徽章+图标钮；item 两行分层 sub=大小·域名）
 */
import { chromium } from "playwright";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const STAGE = "/tmp/ext-stage";
const PORT = 47913;
let pass = 0, fail = 0;
const ok = (cond, name) => {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ " + name); }
};

/* ---- 本地假资源服务器：一张大图（>100KB 触图片律）+ 一个小文件 ---- */
const BIG = Buffer.alloc(180 * 1024, 7);
const srv = http.createServer((req, res) => {
  if (req.url === "/big.png") {
    res.writeHead(200, { "Content-Type": "image/png", "Content-Length": BIG.length });
    res.end(BIG);
  } else {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end("<!doctype html><html><head><title>sniff-lab</title></head><body><h1>sniff lab</h1></body></html>");
  }
});
await new Promise((r) => srv.listen(PORT, r));

/* ---- 加载扩展（channel chromium；headless shell 不支持扩展） ---- */
const ctx = await chromium.launchPersistentContext("", {
  channel: "chromium",
  headless: false,
  args: [
    `--disable-extensions-except=${STAGE}`,
    `--load-extension=${STAGE}`,
    "--no-first-run", "--no-default-browser-check",
  ],
  viewport: { width: 1380, height: 860 },
});

/* 扩展 ID：等 SW 起来拿 */
let extId = "";
for (let i = 0; i < 60 && !extId; i++) {
  const bgs = ctx.serviceWorkers().filter((s) => s.url().includes(extIdOf(STAGE)));
  if (bgs.length) extId = new URL(bgs[0].url()).host;
  else await ctx.waitForEvent("serviceWorker", { timeout: 800 }).catch(() => {});
}
function extOf(p) { return p; }
function extIdOf(_p) { return "chrome-extension"; }
if (!extId) {
  /* 兜底：读 Preferences */
  try {
    const pref = JSON.parse(fs.readFileSync(path.join(ctx._userDataDir ?? "", "Default/Preferences"), "utf8"));
    const s = JSON.stringify(pref);
    const m = s.match(/[a-p]{32}/g);
    if (m) extId = m[0];
  } catch {}
}
ok(!!extId, "扩展加载且 ID 识别 = " + extId);

/* 打开嗅探开关（popup 页形态：开关 = #sw-sniffer role=switch） */
const popup = await ctx.newPage();
await popup.emulateMedia({ colorScheme: "light" });
await popup.goto(`chrome-extension://${extId}/popup.html`);
await popup.waitForTimeout(400);
const snifferToggle = popup.locator("#sw-sniffer");
ok((await snifferToggle.count()) > 0, "popup 嗅探开关存在");
await snifferToggle.click();
await popup.waitForTimeout(250);
const snifOn = await popup.evaluate(
  () => new Promise((res) => chrome.storage.local.get("snifferOn", (o) => res(!!(o && o.snifferOn))))
);
ok(snifOn, "snifferOn 已写入 storage");
await popup.close();

/* newtab 页（扩展覆盖 newtab：开新 tab 即壳页） */
const page = await ctx.newPage();
await page.emulateMedia({ colorScheme: "light" });
await page.goto("about:blank");
await page.waitForTimeout(400);
/* newtab 需要真实新开 tab（ctx.newPage 在 MV3 下会落 newtab？兜底：直接导航壳页） */
if (!page.url().includes("chrome-extension")) {
  await page.goto(`chrome-extension://${extId}/index.html`);
}
await page.waitForTimeout(1600);

/* 页面主体在 iframe（壳结构）里——遍历 frames 找搜索框 */
let frame = null;
for (let i = 0; i < 30 && !frame; i++) {
  for (const f of page.frames()) {
    if (await f.locator("input[role='combobox'], .search-pill input[type='text']").count().catch(() => 0)) {
      frame = f; break;
    }
  }
  if (!frame) await page.waitForTimeout(300);
}
ok(!!frame, "定位到页面主体 frame");

/* ============ 1 浮起/下沉动画恢复 ============ */
const input = frame.locator(".search-pill input[type='text']").first();
await input.click();
const form = frame.locator("form.search-pill").first();
/* 聚焦过渡真实发生：getAnimations() 捕获 CSSTransition（scale 通道）——
   软渲染环境下时序采样不稳，直接断言过渡对象存在与目标属性 */
await page.waitForTimeout(120);
const anims = await form.evaluate((el) =>
  el.getAnimations().map((a) => ({ type: a.constructor.name, prop: a.transitionProperty || "" }))
);
ok(anims.some((a) => a.type === "CSSTransition" && a.prop === "scale"),
  "聚焦触发 scale CSSTransition（浮起为过渡而非瞬跳）=" + JSON.stringify(anims));
await page.waitForTimeout(850);
const scaleEnd = await form.evaluate((el) => parseFloat(getComputedStyle(el).scale) || 1);
const tprop = await form.evaluate((el) => getComputedStyle(el).transitionProperty);
ok(tprop.includes("scale"), "transition-property 含 scale（白名单修复）=" + tprop.slice(0, 60));
ok(scaleEnd > 1.013 && scaleEnd < 1.02, "聚焦终态 scale=1.015（浮起）=" + scaleEnd);
/* blur 下沉 */
await input.blur();
await page.waitForTimeout(900);
const scaleOut = await form.evaluate((el) => parseFloat(getComputedStyle(el).scale) || 1);
ok(Math.abs(scaleOut - 1) < 0.004, "失焦终态 scale 回 1（下沉）=" + scaleOut);

/* ============ 2 描边 1px + 浅色黑描边 ============ */
await input.click();
await page.waitForTimeout(750);
const ring = frame.locator(".search-focus-ring").first();
const ringStyle = await ring.evaluate((el) => {
  const cs = getComputedStyle(el);
  return { opacity: cs.opacity, shadow: cs.boxShadow };
});
ok(ringStyle.opacity === "1", "聚焦描边层 opacity=1");
/* 描边色按主题分支断言（xvfb 页面可能持久化为 dark）+ CSS 源断言补浅色值 */
const isDark = await frame.evaluate(() => document.documentElement.classList.contains("dark"));
const ringLightSrc = await frame.evaluate(() => {
  let hit = "";
  for (const sh of document.styleSheets) {
    try {
      for (const r of sh.cssRules) {
        if (r.selectorText === ".search-focus-ring") hit = r.style.boxShadow;
      }
    } catch {}
  }
  return hit;
});
ok(/rgba\(24,\s*22,\s*36,\s*0\.3\)|#1816244d|rgb\(24,\s*22,\s*36\)/i.test(ringLightSrc),
  "CSS 源：浅色描边 = 黑 0.30 inset（1px）=" + ringLightSrc);
ok(/inset/.test(ringStyle.shadow), "运行时描边为 inset 形态（1px 宽度由 0 0 0 1px 保证）");
ok(isDark ? /255,\s*255,\s*255,\s*0\.25/.test(ringStyle.shadow)
         : /24,\s*22,\s*36,\s*0\.3/.test(ringStyle.shadow),
  "运行时描边色符合当前主题（dark=" + isDark + "）=" + ringStyle.shadow.slice(0, 50));
const borderColor = await form.evaluate((el) => getComputedStyle(el).borderTopColor);
ok(/rgba\(0,\s*0,\s*0,\s*0\)|transparent/i.test(borderColor),
  "聚焦态 form border 透明（双线合并 1px）=" + borderColor);
await input.blur();
await page.waitForTimeout(750);
const ringOut = await ring.evaluate((el) => getComputedStyle(el).opacity);
ok(ringOut === "0", "失焦描边层 opacity=0（无卡滞残留）");

/* ============ 3 四站直搜并入引擎菜单 ============ */
const trigger = frame.locator(".search-trigger").first();
await trigger.click();
await page.waitForTimeout(500);
const menuText = await frame.locator("[data-radix-popper-content-wrapper]").first().innerText().catch(() => "");
ok(menuText.includes("站内直搜"), "引擎菜单含「站内直搜」分组");
for (const n of ["哔哩哔哩", "GitHub", "知乎", "抖音"]) {
  ok(menuText.includes(n), "引擎菜单含 " + n);
}
ok(menuText.includes("谷歌") && menuText.includes("必应"), "主引擎五项仍在");
/* 选中哔哩哔哩 → 输词回车 → 真跳 B 站（限定引擎菜单容器内的按钮） */
await frame.locator("[data-radix-popper-content-wrapper] button", { hasText: "哔哩哔哩" }).first().click();
await page.waitForTimeout(400);
await input.click();
await input.fill("one piece");
await input.press("Enter");
await page.waitForTimeout(2500);
const cur = page.url();
ok(/search\.bilibili\.com\/(all\?keyword=)?/.test(cur) || cur.includes("bilibili"), "回车真跳 B 站站内搜索 = " + cur.slice(0, 70));

/* ============ 4 右键菜单无字位移 ============ */
/* 回 newtab（B 站是真实导航，同 frame 已走——重开壳页） */
const page2 = await ctx.newPage();
await page2.emulateMedia({ colorScheme: "light" });
await page2.goto(`chrome-extension://${extId}/index.html`);
await page2.waitForTimeout(1600);
let frame2 = null;
for (let i = 0; i < 30 && !frame2; i++) {
  for (const f of page2.frames()) {
    if (await f.locator(".search-pill input[type='text']").count().catch(() => 0)) { frame2 = f; break; }
  }
  if (!frame2) await page2.waitForTimeout(300);
}
ok(!!frame2, "page2 主体 frame 定位");
/* CSS keyframes 源断言：ctx-item-in-kf 不含 transform */
const kfHasTransform = await frame2.evaluate(() => {
  let hit = "";
  for (const sh of document.styleSheets) {
    try {
      for (const r of sh.cssRules) {
        if (r.type === CSSRule.KEYFRAMES_RULE && r.name === "ctx-item-in-kf") hit = r.cssText;
      }
    } catch {}
  }
  return hit;
});
ok(!!kfHasTransform && !/transform/.test(kfHasTransform), "ctx-item-in-kf 无 transform（字零位移）");
/* 运行时：弹右键菜单 → 动画结束后 item computed transform = none */
await frame2.locator("body").click({ button: "right", position: { x: 640, y: 300 } });
await page2.waitForTimeout(700);
const item = frame2.locator(".ctx-item button").first();
ok(await item.count() > 0, "右键菜单弹出");
const itemTransform = await item.evaluate((el) => getComputedStyle(el).transform);
ok(itemTransform === "none", "菜单项终态 transform=none = " + itemTransform);
await page2.keyboard.press("Escape");
await page2.waitForTimeout(400);

/* ============ 5 PDF 工具弹窗 = 指令面板动画 ============ */
/* 右键菜单入口（CM_ICONS.pdf） */
await frame2.locator("body").click({ button: "right", position: { x: 640, y: 300 } });
await page2.waitForTimeout(500);
const pdfEntry = frame2.locator(".ctx-item button", { hasText: "PDF" }).first();
if (await pdfEntry.count()) {
  await pdfEntry.click();
  await page2.waitForTimeout(450);
  const card = page2.locator("[role='dialog'][aria-label='PDF 工具箱'] > div, .palette-out, div.card-in").filter({ hasText: "PDF 工具箱" }).first();
  const dlg = frame2.locator("[aria-label='PDF 工具箱']").first();
  const cardEl = dlg.locator("> div").first();
  const openState = await cardEl.evaluate((el) => ({
    tf: el.style.transform || getComputedStyle(el).transform,
    cls: el.className,
    origin: el.style.transformOrigin || getComputedStyle(el).transformOrigin,
  }));
  ok(!!openState.tf && openState.tf !== "none", "PDF 卡片弹簧 inline transform 在位（开=Q 弹）=" + String(openState.tf).slice(0, 44));
  ok(/top/.test(openState.origin) && /center/.test(openState.origin), "transformOrigin top center（同指令面板）origin=" + openState.origin);
  ok(/card-in/.test(openState.cls), "卡片挂 card-in 显影");
  await page2.keyboard.press("Escape");
  await page2.waitForTimeout(120);
  const closing = await cardEl.evaluate((el) => el.className);
  ok(/palette-out/.test(closing), "关闭挂 palette-out（微胀再收，同指令面板）=" + closing.slice(0, 60));
} else {
  ok(false, "右键菜单无 PDF 入口（跳过 5）");
}

/* ============ 6 嗅探面板布局 ============ */
/* content script 无法注入 chrome-extension 页——浮球测在真实 http 页上 */
const page3 = await ctx.newPage();
await page3.emulateMedia({ colorScheme: "light" });
await page3.goto(`http://127.0.0.1:${PORT}/`);
await page3.waitForTimeout(1500);
/* 触发嗅探：fetch 假服务器大图（webRequest onCompleted 捕获） */
await page3.evaluate(async (port) => {
  await fetch(`http://127.0.0.1:${port}/big.png`, { mode: "no-cors" }).catch(() => {});
}, PORT);
await page3.waitForTimeout(1500);
/* 浮球出现 → 点开面板 */
const ballHost = page3.locator("#chushi-sniffer-host");
ok(await ballHost.count() > 0, "浮球 host 注入");
const ballVisible = await ballHost.evaluate((el) => {
  const b = el.shadowRoot?.querySelector(".ball");
  return b ? getComputedStyle(b).display : "none";
});
ok(ballVisible !== "none", "浮球显示（嗅探开启态）");
await ballHost.evaluate((el) => {
  const b = el.shadowRoot.querySelector(".ball");
  b.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: 10, clientY: 10 }));
  b.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, clientX: 10, clientY: 10 }));
});
await page3.waitForTimeout(500);
const panelState = await ballHost.evaluate(() => {
  const p = el_panel();
  function el_panel() { return document.querySelector("#chushi-sniffer-host").shadowRoot.querySelector(".panel"); }
  return { open: p.classList.contains("open"), html: p.innerHTML };
});
ok(panelState.open, "面板展开");
ok(/class="ico"/.test(panelState.html) && /资源嗅探/.test(panelState.html), "头部=图标+新标题");
ok(/class="cnt"/.test(panelState.html), "计数徽章在位");
ok(/class="ib"/.test(panelState.html) && /清空列表/.test(panelState.html) && /收起/.test(panelState.html), "图标动作钮（清空/收起）");
ok(/class="item"/.test(panelState.html) || /暂无可下载资源/.test(panelState.html), "列表项或空态");
if (/class="item"/.test(panelState.html)) {
  const hasTwoLine = /class="nm"[^<]*<\/span><span class="sub"/.test(panelState.html.replace(/\n/g, ""));
  ok(hasTwoLine, "item 两行分层（nm + sub）");
  const subTxt = (panelState.html.match(/class="sub"[^>]*>([^<]*)</) || [])[1] || "";
  ok(!/图片|视频|音频|文件/.test(subTxt), "sub 不再堆类型词=" + subTxt);
  ok(/ · /.test(subTxt), "sub=大小·域名拼接=" + subTxt);
}

console.log(`\n===== v8.7.53 E2E：${pass} 过 / ${fail} 败 =====`);
await ctx.close();
srv.close();
process.exit(fail ? 1 : 0);
