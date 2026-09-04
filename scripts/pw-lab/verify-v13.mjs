import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";

/* verify-v13.mjs — v1.3.0 八维焕新端到端验证
 * ① 基线渲染 ② 导入八维预设 → 各维度生效断言 ③ 删除 → 全还原
 * ④ tab 选框 Q 弹（layoutId+scale 出场）⑤ 开发工具可下载 ⑥ pageerror 全程为 0 */

const ROOT = "/home/z/my-project/out";
const MIME = {
  ".html": "text/html", ".js": "application/javascript", ".css": "text/css",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
  ".woff2": "font/woff2", ".ico": "image/x-icon", ".txt": "text/plain",
};

const server = createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  /* Pages 构建带 /Start-chushi 前缀，本地 serve 一律剥掉 */
  p = p.replace(/^\/Start-chushi/, "") || "/";
  if (p.endsWith("/")) p += "index.html";
  let f = join(ROOT, p);
  if (!existsSync(f)) f = join(ROOT, "index.html");
  try {
    const body = readFileSync(f);
    res.writeHead(200, { "content-type": MIME[extname(f)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404); res.end("nf");
  }
});
await new Promise((r) => server.listen(4613, r));
console.log("serve out/ on :4613");

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

const B = "http://localhost:4613";
await page.goto(B, { waitUntil: "networkidle" });

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
}

/* ---------- ① 基线 ---------- */
check("基线渲染：时钟出现", await page.locator(".cl-clock").count() > 0);
check("基线渲染：dock 出现", await page.locator(".cl-dock").count() > 0);
check("基线 12h 关闭", !(await page.locator(".cl-clock time").textContent()).match(/AM|PM/));
const baseAccent = await page.evaluate(() =>
  getComputedStyle(document.documentElement).getPropertyValue("--ui-accent").trim()
);
check("基线强调色", baseAccent.length > 0, baseAccent);

/* ---------- ② 导入八维预设 ---------- */
const presetJson = readFileSync("/home/z/my-project/examples/焕新示例预设.json", "utf-8");
await page.evaluate(() => {
  const ev = new KeyboardEvent("keydown", { key: "k", metaKey: true, ctrlKey: true, bubbles: true });
  document.dispatchEvent(ev);
});
await page.waitForTimeout(600);
await page.getByText("导入预设").first().click();
await page.waitForTimeout(400);
await page.locator("textarea").fill(presetJson);
await page.getByRole("button", { name: "导入", exact: true }).click();
await page.waitForTimeout(900);

/* tokens */
const accent2 = await page.evaluate(() =>
  getComputedStyle(document.documentElement).getPropertyValue("--ui-accent").trim()
);
check("tokens：--ui-accent 覆写为 Fluent 蓝", accent2 === "#0078d4", accent2);

/* motion */
const speed = await page.evaluate(() =>
  document.documentElement.style.getPropertyValue("--mo-speed").trim()
);
check("motion：--mo-speed=1.1", speed === "1.1", speed);

/* clock：12h + 问候模板 */
const clockText = await page.locator(".cl-clock time").textContent();
check("clock：12 小时制 AM/PM 出现", /AM|PM/.test(clockText), clockText.slice(0, 30));
const sub = await page.locator(".cl-clock .clock-sub").textContent().catch(() => "");
check("clock：问候模板生效", sub.includes("愿今天顺利"), sub.slice(0, 40));

/* material：fx-root 挂载 */
const matMounted = await page.evaluate(() =>
  Boolean(document.querySelector('#chushi-fx-root [data-fx-mount="material"]'))
);
check("material：材质挂载就位", matMounted);
const dockBf = await page.evaluate(() => {
  const d = document.querySelector(".cl-dock");
  return d ? getComputedStyle(d).backdropFilter : "";
});
/* 浅色变体 blur(40px)，深色变体 blur(36px)——命中哪个取决于系统主题，都在即材质生效 */
check("material：dock 亚克力滤镜生效", dockBf.includes("blur(40px)") || dockBf.includes("blur(36px)"), dockBf);

/* layout：磁贴列数（flex 布局经 maxWidth 控制：6*columns+1 rem；maxWidth 在 .cl-links 内层容器） */
const maxW = await page.evaluate(() => {
  const host = document.querySelector(".cl-links");
  const inner = host && host.querySelector('[style*="max-width"]');
  return ((inner && inner.style.maxWidth) || "").trim();
});
check("layout：磁贴 6 列（maxWidth=37rem）", maxW === "37rem", maxW);

/* animations：样式注入（注释用预设内 name） */
const animIn = await page.evaluate(() => {
  const t = document.getElementById("chushi-preset-css")?.textContent ?? "";
  return t.includes("磁贴轻浮起") && t.includes(".cl-links .group");
});
check("animations：CSS 注入含磁贴微动效", animIn);

/* icons：todo 按钮 star 图标（lucide star 为单 path；默认 CheckSquare 是 rect+path） */
const todoSvg = await page.evaluate(() => {
  const btn = document.querySelector('button[aria-label="待办"]');
  const svg = btn?.querySelector("svg");
  return svg ? { rect: svg.innerHTML.includes("<rect"), path: svg.innerHTML.slice(0, 40) } : null;
});
check("icons：待办按钮被 star 覆写（无 rect 单 path）", Boolean(todoSvg) && !todoSvg.rect, JSON.stringify(todoSvg?.path));

/* ---------- ④ tab 选框 Q 弹 ---------- */
await page.keyboard.press("Escape");
await page.waitForTimeout(500);
await page.locator('button[aria-label="待办"]').click();
await page.waitForTimeout(80); /* 弹簧中段 */
const midScale = await page.evaluate(() => {
  const pill = document.querySelector('[style*="dock-active-pill"]') ||
    [...document.querySelectorAll("span")].find((s) => s.getAttribute("aria-hidden") === "true" && s.className.includes("rounded-full"));
  if (!pill) return null;
  const t = getComputedStyle(pill).transform;
  return t;
});
await page.waitForTimeout(800);
const endScale = await page.evaluate(() => {
  const btn = document.querySelector('button[aria-label="待办"]');
  const pill = btn?.querySelector("span[aria-hidden='true']");
  return pill ? getComputedStyle(pill).transform : "";
});
check("Q弹：选框出场弹簧（存在并收尾）", endScale && (endScale === "none" || endScale.includes("matrix(1, 0, 0, 1")), String(midScale).slice(0, 40) + " → " + String(endScale).slice(0, 40));

/* ---------- ⑤ 开发工具 ---------- */
const studioRes = await page.evaluate(async () => {
  const r = await fetch("/preset-studio.html");
  return { ok: r.ok, len: (await r.text()).length };
});
check("开发工具：静态资源可访问", studioRes.ok && studioRes.len > 30000, JSON.stringify(studioRes));
/* 下载按钮在 ⌘K 预设导入视图 */
await page.keyboard.press("Escape");
await page.waitForTimeout(400);
await page.evaluate(() => {
  const ev = new KeyboardEvent("keydown", { key: "k", metaKey: true, ctrlKey: true, bubbles: true });
  document.dispatchEvent(ev);
});
await page.waitForTimeout(500);
await page.getByText("导入预设").first().click();
await page.waitForTimeout(400);
const dlBtn = await page.locator('a[href*="preset-studio.html"]').getAttribute("download");
check("开发工具：导入面板下载按钮就位", Boolean(dlBtn), dlBtn);
await page.keyboard.press("Escape");
await page.waitForTimeout(400);

/* ---------- ③ 删除预设 → 全还原 ---------- */
await page.evaluate(() => {
  const ev = new KeyboardEvent("keydown", { key: "k", metaKey: true, ctrlKey: true, bubbles: true });
  document.dispatchEvent(ev);
});
await page.waitForTimeout(500);
await page.getByText("管理预设").first().click();
await page.waitForTimeout(400);
await page.locator('button[aria-label^="删除预设"]').click();
await page.waitForTimeout(800);
const accent3 = await page.evaluate(() =>
  getComputedStyle(document.documentElement).getPropertyValue("--ui-accent").trim()
);
check("还原：强调色复位", accent3 === baseAccent, accent3);
const speed3 = await page.evaluate(() =>
  document.documentElement.style.getPropertyValue("--mo-speed").trim() || "(缺省1)"
);
check("还原：--mo-speed 复位", speed3 === "1" || speed3 === "(缺省1)" || speed3 === "", speed3);
const matGone = await page.evaluate(() =>
  !document.querySelector('#chushi-fx-root [data-fx-mount="material"]')
);
check("还原：材质挂载回收", matGone);
const clockText2 = await page.locator(".cl-clock time").textContent();
check("还原：12h 消失", !/AM|PM/.test(clockText2), clockText2.slice(0, 30));

/* ---------- ⑥ pageerror ---------- */
check("pageerror 全程为 0", errors.length === 0, errors.join(" | ").slice(0, 200));

const pass = results.filter((r) => r.ok).length;
console.log(`\n==== ${pass}/${results.length} passed ====`);
await browser.close();
server.close();
process.exit(pass === results.length ? 0 : 1);
