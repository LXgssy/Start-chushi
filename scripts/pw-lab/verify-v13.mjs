// v1.3.0 端到端验证：WebGL 液态玻璃 + 图标覆写 + 主题令牌覆写 + 回归
// ① 导入液态玻璃预设（粘贴路径）→ WebGL canvas 挂载/绘制检查
// ② ⌘K 面板开合：canvas 随面板重建/回收（位置跟踪链路）
// ③ 设置面板七参数分区
// ④ 拖拽导入焕新测试预设（icons.override + theme.override）
// ⑤ 图标覆写（Dock 待办图标变 img）+ 主题覆写（accent/border 生效）
// ⑥ 回归：删除预设 → canvas/图标/主题全回收 + 无报错
import { chromium } from "playwright-core";
import fs from "node:fs";

const OUT = "/home/z/my-project/scripts/pw-lab/shots";
fs.mkdirSync(OUT, { recursive: true });
const fail = (msg) => {
  console.log("  ✗ " + msg);
  process.exitCode = 1;
};
const ok = (msg, extra = "") => console.log("  ✓ " + msg + (extra ? " | " + extra : ""));

const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`,
  args: ["--no-sandbox", "--use-gl=angle", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));

await page.goto("http://localhost:3000/", { waitUntil: "networkidle", timeout: 120000 });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1500);

/* ---------- ① 导入液态玻璃预设 + WebGL 引擎检查 ---------- */
console.log("[1] WebGL 液态玻璃引擎");
await page.keyboard.press("Control+k");
await page.waitForTimeout(700);
await page.getByText("导入预设", { exact: true }).click();
await page.waitForTimeout(600);
const presetJson = fs.readFileSync("/home/z/my-project/examples/液态玻璃预设.json", "utf8");
await page.locator("textarea").fill(presetJson);
await page.getByRole("button", { name: "导入", exact: true }).click();
await page.keyboard.press("Escape"); /* 关 ⌘K 面板：排除卡片 attach 链干扰，检查基础两元素 */
await page.waitForTimeout(2500);

const eng = await page.evaluate(() => {
  const cs = [...document.querySelectorAll("canvas.chushi-fx-canvas")];
  const first = cs[0];
  const host = first ? first.closest("[data-fx]") : null;
  return {
    count: cs.length,
    hosts: cs.map((c) => c.closest("[data-fx]")?.dataset.fx ?? "?"),
    zi: first ? getComputedStyle(first).zIndex : "",
    bf: host ? getComputedStyle(host).backdropFilter : "(none)",
    fallbackStyle: !!document.querySelector("[data-fx-mount='css']"),
  };
});
console.log("  canvas:", eng.count, "host:", eng.hosts.join(","), "z:", eng.zi, "bf:", eng.bf, "fallback:", eng.fallbackStyle);
if (eng.count < 2) fail("玻璃 canvas 挂载数 <2");
else ok("canvas 挂载（search/dock）");
if (eng.zi !== "-1") fail("canvas z-index != -1");
else ok("canvas z-index=-1（内容之下）");
if (eng.fallbackStyle) fail("引擎走了降级 CSS（WebGL 初始化失败）");
else ok("未降级（WebGL 引擎在跑）");
if (/url\(/.test(eng.bf)) fail("backdrop-filter 仍有 url() 残留");
else ok("无 SVG url() 残留", eng.bf);

/* 折射视觉核验：clip 搜索药丸区域（人工核截图） */
const pill = await page.locator(".search-pill").boundingBox();
if (pill) {
  await page.screenshot({
    path: OUT + "/v13-lg-pill.png",
    clip: { x: Math.max(0, pill.x - 30), y: Math.max(0, pill.y - 30), width: pill.width + 60, height: pill.height + 60 },
  });
  ok("搜索药丸折射截图已存 v13-lg-pill.png");
}

/* ---------- ② ⌘K 面板开合：canvas 随面板重建（⌘K 卡 = .glass-card 白名单） ---------- */
console.log("[2] ⌘K 面板玻璃 canvas");
await page.keyboard.press("Escape");
await page.waitForTimeout(500);
await page.keyboard.press("Control+k");
await page.waitForTimeout(900);
const pc = await page.evaluate(() => {
  const p = document.querySelector(".glass-card");
  const c = p && p.querySelector("canvas.chushi-fx-canvas");
  return c ? { w: c.width, h: c.height, host: p.dataset.fx } : null;
});
if (!pc) fail("⌘K 面板未挂载玻璃 canvas");
else ok("⌘K 面板玻璃 canvas 在位", JSON.stringify(pc));
const kcard = await page.locator(".glass-card").boundingBox();
if (kcard) {
  await page.screenshot({
    path: OUT + "/v13-lg-cmdk.png",
    clip: { x: Math.max(0, kcard.x - 30), y: Math.max(0, kcard.y - 30), width: kcard.width + 60, height: kcard.height + 60 },
  });
  ok("⌘K 卡折射截图已存 v13-lg-cmdk.png");
}
await page.keyboard.press("Escape");
await page.waitForTimeout(500);

/* ---------- ③ 设置面板七参数 ---------- */
console.log("[3] 设置面板液态玻璃分区");
await page.mouse.click(40, 400); // 空白处（避开搜索药丸右键域）
await page.waitForTimeout(300);
await page.evaluate(() => {
  document.querySelector('.cl-dock [aria-label="设置"]')?.closest("button")?.click();
});
await page.waitForTimeout(900);
const sec = await page.evaluate(() => {
  const panel = document.querySelector(".cl-panel");
  const label = panel && [...panel.querySelectorAll("label, span")].some((l) => /折射强度|液态玻璃/.test(l.textContent || ""));
  const sliders = panel ? panel.querySelectorAll('input[type="range"]').length : 0;
  return { label, sliders };
});
if (sec.label && sec.sliders >= 5) ok("液态玻璃设置分区在位", JSON.stringify(sec));
else fail("设置分区缺失 " + JSON.stringify(sec));
await page.keyboard.press("Escape");
await page.waitForTimeout(400);

/* ---------- ④ 拖拽导入焕新测试预设 ---------- */
console.log("[4] 图标/主题覆写 API（拖拽导入）");
await page.keyboard.press("Control+k");
await page.waitForTimeout(700);
await page.getByText("导入预设", { exact: true }).click();
await page.waitForTimeout(600);
const renewPreset = {
  chushi: 1,
  name: "焕新测试",
  author: "test",
  description: "icons/theme API 验证",
  scripts: [
    {
      id: "renew",
      name: "焕新",
      code:
        "chushi.icons.override({'dock-todo':'data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22><circle cx=%2212%22 cy=%2212%22 r=%2210%22 fill=%22%23ff0000%22/></svg>'});" +
        "chushi.theme.override({light:{'--ui-accent':'#00c896'},dark:{'--border':'oklch(0.5 0.1 200)'}});",
    },
  ],
};
await page.evaluate(async (json) => {
  const dt = new DataTransfer();
  dt.items.add(new File([json], "焕新测试.json", { type: "application/json" }));
  const target = document.querySelector('textarea[placeholder*="拖入"]').closest("div");
  for (const type of ["dragenter", "dragover", "drop"]) {
    const ev = new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt });
    target.dispatchEvent(ev);
  }
  await new Promise((r) => setTimeout(r, 1500));
}, JSON.stringify(renewPreset));
await page.keyboard.press("Escape");
await page.waitForTimeout(2000);

/* ---------- ⑤ 覆写生效检查 ---------- */
console.log("[5] 覆写生效");
const ov = await page.evaluate(() => {
  const btn = [...document.querySelectorAll(".cl-dock button")].find((b) =>
    (b.getAttribute("aria-label") || "").includes("待办")
  );
  const img = btn ? btn.querySelector("img") : null;
  const st = document.querySelector('style[id^="chushi-theme-"]');
  const accent = getComputedStyle(document.documentElement).getPropertyValue("--ui-accent").trim();
  const borderDark = getComputedStyle(document.documentElement).getPropertyValue("--border").trim();
  return {
    img: img ? img.src.slice(0, 48) : null,
    hasStyle: !!st,
    styleHead: st ? st.textContent.slice(0, 100) : "",
    accent,
    border: borderDark,
  };
});
console.log("  图标 img:", ov.img, "| style:", ov.hasStyle, "| accent:", ov.accent);
if (ov.img) ok("图标覆写生效（待办 → img）", ov.img);
else fail("图标覆写未生效");
if (ov.hasStyle && /00c896/i.test(ov.accent)) ok("主题覆写生效（accent #00c896）");
else fail("主题覆写未生效 " + JSON.stringify(ov));

/* ---------- ⑥ 回归：删除预设全回收 ---------- */
console.log("[6] 回归：删除预设全回收");
await page.keyboard.press("Control+k");
await page.waitForTimeout(700);
await page.getByText("管理预设", { exact: true }).first().click();
await page.waitForTimeout(600);
for (let i = 0; i < 2; i++) {
  const item = page.locator("li", { hasText: /焕新测试|液态玻璃/ }).first();
  try {
    await item.getByRole("button", { name: /删除预设/ }).click({ timeout: 3000 });
    await page.waitForTimeout(500);
  } catch {
    break;
  }
}
await page.keyboard.press("Escape");
await page.waitForTimeout(800);
const rv = await page.evaluate(() => {
  const canvas = document.querySelectorAll("canvas.chushi-fx-canvas").length;
  const styles = document.querySelectorAll('style[id^="chushi-theme-"]').length;
  const btn = [...document.querySelectorAll(".cl-dock button")].find((b) =>
    (b.getAttribute("aria-label") || "").includes("待办")
  );
  const img = btn ? btn.querySelector("img") : null;
  const accent = getComputedStyle(document.documentElement).getPropertyValue("--ui-accent").trim();
  const pill = document.querySelector(".search-pill");
  const bf = pill ? getComputedStyle(pill).backdropFilter : "(none)";
  return { canvas, styles, img: !!img, accent, bf };
});
console.log("  回收:", JSON.stringify(rv));
if (rv.canvas === 0) ok("canvas 全回收");
else fail("canvas 残留 " + rv.canvas);
if (rv.styles === 0) ok("主题 style 全回收");
else fail("主题 style 残留 " + rv.styles);
if (!rv.img) ok("图标还原 lucide");
else fail("图标覆写残留");
if (!/00c896/i.test(rv.accent)) ok("accent 还原", rv.accent);
else fail("accent 覆写残留");
if (/blur\(40px\)|blur\(2\dpx\)/.test(rv.bf)) ok("磨砂还原", rv.bf);
else fail("磨砂未还原 " + rv.bf);

/* ---------- 页面报错 ---------- */
const realErrors = errors.filter((e) => !/net::|favicon|weather|Failed to load resource/i.test(e));
if (realErrors.length) fail("页面报错: " + realErrors.slice(0, 3).join(" || "));
else ok("无页面报错");

await page.screenshot({ path: OUT + "/verify-v13-final.png" });
await browser.close();
console.log("\n[verify-v13] done, exitCode =", process.exitCode ?? 0);
