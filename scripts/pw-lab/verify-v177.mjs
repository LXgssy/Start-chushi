import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createMockBridge } from "./mock-bridge.mjs";

/* verify-v177.mjs — v1.7.7 音乐面板翻新（配插件 1.3.0 控制链路修复）端到端验证
 * A Dock「音乐」按钮 → 面板打开，未连接指引可见（BetterNCM 插件路线主推）
 * B 错误地址重试仍报错；无协议地址规范化后接入成功（mock 双端口）
 * C 快照渲染：歌名/歌手/专辑进 UI；进度条渐变在位；封面占位
 * D 控制：toggle/next/prev/volume/seek 命令到达桥（mock /api/__controls 断言）
 * E 进度插值：2.5s 内显示时间前进 ≥2s（本地时钟插值，不依赖快照刷新）
 * I 诊断卡：/api/debug 拉取（版本/三源芯片/状态文件年龄）+ 陈旧警示 + 复制诊断
 * F 断连：mock 停服 → 状态回落到未连接指引（重试按钮在位）
 * G ⌘K 指令面板有「音乐」入口且能打开面板
 * H pageerror = 0 */

const ROOT = "/home/z/my-project/out";
const MIME = {
  ".html": "text/html", ".js": "application/javascript", ".css": "text/css",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
  ".woff2": "font/woff2", ".ico": "image/x-icon", ".txt": "text/plain",
};

const server = createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  p = p.replace(/^\/Start-chushi/, "") || "/";
  if (p.endsWith("/")) p += "index.html";
  let f = join(ROOT, p);
  if (!existsSync(f)) f = join(ROOT, "index.html");
  try {
    const body = readFileSync(f);
    const ext = f.slice(f.lastIndexOf("."));
    res.writeHead(200, { "content-type": MIME[ext] ?? "application/octet-stream" });
    res.end(body);
  } catch { res.writeHead(404); res.end("nf"); }
});
await new Promise((r) => server.listen(4622, r));

const bridge = createMockBridge({ portA: 10954, portB: 10999 });
await bridge.ready;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 915 } });
await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://localhost:4622" });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.addInitScript(() => {
  localStorage.clear();
  localStorage.setItem("start:settings", JSON.stringify({ themeMode: "dark" }));
});
await page.goto("http://localhost:4622/", { waitUntil: "networkidle" });
await page.waitForSelector(".clock-text", { timeout: 15000 });

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
}

const musicBtn = page.locator(".cl-dock button[aria-label='音乐']");
const panel = page.locator("[data-panel='music']");

/* ---------- A Dock 按钮 + 未连接指引 ---------- */
check("A1 dock 有「音乐」按钮", (await musicBtn.count()) === 1);
await musicBtn.click();
await page.waitForSelector("[data-panel='music']", { timeout: 5000 });
await page.waitForTimeout(2600);   // 探测 127.0.0.1:10754（无服务）→ error
const guide = await panel.getByText("接入三步").count();
check("A2 未连接指引（接入三步）可见", guide === 1);
check("A3 错误原因文案（连不上）", (await panel.getByText("连不上桥接服务").count()) === 1);
check("A4 指引主推 BetterNCM 插件路线", (await panel.getByText("BetterNCM 插件路线 · 推荐").count()) === 1);
check("A5 独立版兜底链接在位", (await panel.getByText("独立版 ChuShiBridge").count()) === 1);
const addr = panel.locator("input[aria-label='桥接服务地址']");
check("A6 地址输入默认 10754", (await addr.inputValue()).includes("10754"));

/* ---------- G ⌘K 入口（未连接阶段，无轮询干扰） ---------- */
await page.keyboard.press("Escape");   // 关闭音乐面板
await page.waitForTimeout(700);        // 面板退场完成后指令面板才可开
await page.keyboard.press("Control+k");
await page.waitForTimeout(900);
let gOk = false;
try {
  await page.locator("[cmdk-item]").filter({ hasText: /^音乐$/ }).click({ timeout: 4000 });
  await page.waitForSelector("[data-panel='music']", { timeout: 4000 });
  gOk = true;
} catch (e) { console.log("  [G 失败]", String(e).split("\n")[0]); }
check("G1 Ctrl+K「音乐」入口打开面板", gOk);
await page.waitForTimeout(2600);       // 重开面板重新探测 → error 态

/* ---------- B 无协议地址规范化 + 接入 ---------- */
await addr.fill("127.0.0.1:10999");          // 无协议 → normalize 补 http://
await panel.getByRole("button", { name: "重试" }).click();
await page.waitForSelector("[data-testid='music-player']", { timeout: 8000 });
check("B1 无协议地址规范化接入成功", true);

/* ---------- C 快照渲染 ---------- */
const songName = await panel.getByText("夜空中最亮的星").count();
const artists = await panel.getByText("逃跑计划").count();
check("C1 歌名渲染", songName >= 1);
check("C2 歌手渲染", artists >= 1);
check("C3 专辑渲染（v1.7.7 新增信息行）", (await panel.getByText("世界").count()) >= 1);
const range = panel.locator("input[aria-label='播放进度']");
check("C4 进度条在位", (await range.count()) === 1);
const rangeVal = await range.inputValue();
check("C5 进度值=快照位置（~30000ms）", Math.abs(Number(rangeVal) - 30000) < 2500, rangeVal);
const vol = panel.locator("input[aria-label='音量']");
check("C6 音量条渲染", (await vol.count()) === 1, String(await vol.count()));
check("C7 状态脚注已连接", (await panel.getByText("已连接 · 网易云音乐").count()) === 1);

/* ---------- E 进度插值（先做，避免 D 的 seek 污染） ----------
 * 冻结 mock 快照 ts（模拟插件两次写盘之间的窗口）→ 客户端必须用本地时钟外推 */
const t1 = Number(await range.inputValue());
bridge.freeze(true);
await page.waitForTimeout(2500);
const t2 = Number(await range.inputValue());
bridge.freeze(false);
check("E1 本地插值推进 ≥2s", t2 - t1 >= 2000, `${t1} → ${t2}`);

/* ---------- D 控制命令 ---------- */
await panel.getByRole("button", { name: "暂停" }).click();
await panel.getByRole("button", { name: "下一首" }).click();
await panel.getByRole("button", { name: "上一首" }).click();
await vol.fill("0.25");
await range.evaluate((el) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
  setter.call(el, "60000");
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
});
await page.waitForTimeout(1200);
const ctrls = await (await fetch("http://127.0.0.1:10954/api/__controls")).json();
const acts = ctrls.map((c) => c.action);
check("D1 toggle 命令", acts.includes("toggle"));
check("D2 next/prev 命令", acts.includes("next") && acts.includes("prev"));
const vcmd = ctrls.find((c) => c.action === "volume");
check("D3 volume 命令 0.25", vcmd && Math.abs(vcmd.volume - 0.25) < 0.001, JSON.stringify(vcmd || {}));
const scmd = ctrls.find((c) => c.action === "seek");
check("D4 seek 命令 60000ms", scmd && scmd.positionMs === 60000, JSON.stringify(scmd || {}));

/* 直接改 mock 状态验证 UI 回路 */
bridge.setSnap({ playing: false });
await page.waitForTimeout(1800);
check("D5 快照暂停 → UI 出「播放」按钮", (await panel.getByRole("button", { name: "播放" }).count()) === 1);
bridge.setSnap({ playing: true });
await page.waitForTimeout(1500);

/* ---------- I 诊断卡（v1.7.7 新增） ---------- */
const diagBtn = panel.getByRole("button", { name: "桥接诊断" });
check("I0 诊断开关在位", (await diagBtn.count()) === 1);
await diagBtn.click();
await page.waitForSelector("[data-testid='music-diag']", { timeout: 4000 });
/* 等诊断 fetch 完成渲染（拉取中… → 数据行） */
await page.waitForFunction(
  () => document.querySelector("[data-testid='music-diag']")?.textContent?.includes("bridge.dll"),
  { timeout: 4000 }
);
check("I1 诊断卡打开并显示桥版本", (await panel.getByText("1.3.0 · bridge.dll").count()) === 1);
const chips = await panel.locator("[data-testid='music-diag'] >> text=✓").count();
check("I2 三源芯片全 ✓（store/events/song/media）", chips >= 4, String(chips));
check("I3 注入页地址展示", (await panel.getByText("orpheus://orpheus/pub/app.html").count()) === 1);
check("I4 状态文件年龄展示（<5s）", (await panel.locator("[data-testid='music-diag']").getByText(/存在 · \d+s 前更新/).count()) === 1);

/* 陈旧警示：模拟 1.2.x 插件暂停不写盘（stateAgeMs 虚高） */
bridge.setDebug({ stateAgeMs: 356400 });
await diagBtn.click();                 // 关
await page.waitForTimeout(300);
await diagBtn.click();                 // 再开（重新拉取）
await page.waitForSelector("[data-testid='music-diag']", { timeout: 4000 });
await page.waitForTimeout(400);
check("I5 陈旧警示出现（含升级提示）", (await panel.getByText(/状态已 356s 未更新/).count()) === 1);
check("I6 警示含 1.3.0 升级指引", (await panel.getByText(/升级插件到 1.3.0/).count()) === 1);

/* 复制诊断 → 剪贴板内容 = /api/debug JSON */
await panel.getByRole("button", { name: "复制诊断" }).click();
await page.waitForTimeout(400);
check("I7 复制反馈（已复制）", (await panel.getByText("已复制").count()) === 1);
const clip = await page.evaluate(() => navigator.clipboard.readText());
let clipOk = false;
try { clipOk = JSON.parse(clip).stateAgeMs === 356400; } catch { /* ignore */ }
check("I8 剪贴板为完整诊断 JSON", clipOk, clip.slice(0, 80));
bridge.setDebug({ stateAgeMs: 800 });
await diagBtn.click();                 // 收起诊断卡，避免干扰 F

/* ---------- F 断连回落 ---------- */
/* 关掉 mock 两个端口 → 3 次轮询失败(~3s) → error 态（面板保持打开） */
await Promise.all((await bridge.ready).map((s) => new Promise((r) => s.close(r))));
await page.waitForSelector("[data-panel='music'] >> text=接入三步", { timeout: 15000 });
check("F1 断连后回到未连接指引", true);
check("F2 重试按钮在位", (await panel.getByRole("button", { name: "重试" }).count()) === 1);

/* ---------- H pageerror ---------- */
check("H1 pageerror = 0", errors.length === 0, errors.slice(0, 3).join(" | "));

await browser.close();
await new Promise((r) => server.close(r));

const pass = results.filter((r) => r.ok).length;
console.log(`\n${pass}/${results.length} 通过`);
process.exit(pass === results.length ? 0 : 1);
