import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createMockBridge } from "./mock-bridge.mjs";

/* verify-v178.mjs — v1.7.8 端口自动发现（配插件 1.3.0 服务端口可改）端到端验证
 * A Dock「音乐」→ 面板打开，未连接指引可见；A7 新增：错误态含端口自动扫描提示
 * B 地址输入：B1 无协议规范化直连非候选端口；B2 错误地址扫描自愈
 * C 快照渲染：歌名/歌手/专辑/进度/音量
 * D 控制：toggle/next/prev/volume/seek 命令到达桥
 * E 进度插值：冻结快照 ts 期间本地时钟外推
 * I 诊断卡：/api/debug 拉取 + 端口回显（:8008）+ 陈旧警示 + 复制诊断
 * K 端口自动发现（v1.7.8 核心）：
 *   K1 面板挂载 → 保存地址(10754)不通 → 自动扫到 8008 接入（用户无操作）
 *   K2 localStorage start:music-url 记住 8008（useStored JSON 包裹）
 *   K4 关面板重开后再次自动发现
 *   K5 异名服务占 10754 → name 校验拒绝（不误认）+ 错误态输入框回填 8008
 *   K7 桥恢复 → 重试一键回归
 * F 断连：mock 停服 → 状态回落到未连接指引
 * G ⌘K 指令面板有「音乐」入口
 * H pageerror = 0
 *
 * ⚠ 节奏律：连接成功后错误态 UI（含地址输入/重试按钮）整体卸载，
 *   点击这类按钮必须 catch 容错 + waitForSelector 等结果，不能以点击完成为准。 */

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
await new Promise((r) => server.listen(4623, r));

const readSavedUrl = () =>
  page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem("start:music-url") ?? ""); }
    catch { return localStorage.getItem("start:music-url"); }
  });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 915 } });
await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://localhost:4623" });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.addInitScript(() => {
  localStorage.clear();
  localStorage.setItem("start:settings", JSON.stringify({ themeMode: "dark" }));
});
await page.goto("http://localhost:4623/", { waitUntil: "networkidle" });
await page.waitForSelector(".clock-text", { timeout: 15000 });

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
}

const musicBtn = page.locator(".cl-dock button[aria-label='音乐']");
const panel = page.locator("[data-panel='music']");
const addr = panel.locator("input[aria-label='桥接服务地址']");
const retryBtn = panel.getByRole("button", { name: "重试" });
const retry = () => retryBtn.click({ timeout: 3000 }).catch(() => {});

/* ---------- A 未连接指引（桥不在场） ---------- */
check("A1 dock 有「音乐」按钮", (await musicBtn.count()) === 1);
await musicBtn.click();
await page.waitForSelector("[data-panel='music']", { timeout: 5000 });
await page.waitForTimeout(2600);
check("A2 未连接指引（接入三步）可见", (await panel.getByText("接入三步").count()) === 1);
check("A3 错误原因文案（连不上）", (await panel.getByText("连不上桥接服务").count()) === 1);
check("A4 指引主推 BetterNCM 插件路线", (await panel.getByText("BetterNCM 插件路线 · 推荐").count()) === 1);
check("A5 独立版兜底链接在位", (await panel.getByText("独立版 ChuShiBridge").count()) === 1);
check("A6 地址输入默认 10754", (await addr.inputValue()).includes("10754"));
check("A7 错误态含端口自动扫描提示（v1.7.8）", (await panel.getByText(/自动尝试常见端口/).count()) === 1);

/* ---------- G ⌘K 入口 ---------- */
await page.keyboard.press("Escape");   // 关面板（焦点在页面，确定性）
await page.waitForTimeout(700);
await page.keyboard.press("Control+k");
await page.waitForTimeout(900);
let gOk = false;
try {
  await page.locator("[cmdk-item]").filter({ hasText: /^音乐$/ }).click({ timeout: 4000 });
  await page.waitForSelector("[data-panel='music']", { timeout: 4000 });
  gOk = true;
} catch (e) { console.log("  [G 失败]", String(e).split("\n")[0]); }
check("G1 Ctrl+K「音乐」入口打开面板", gOk);

/* ---------- K1/K2 挂载即扫描：桥只在 8008，保存地址仍是 10754 ---------- */
const bridge = createMockBridge({ portA: 8008, portB: 18008 });
await bridge.ready;
await page.waitForSelector("[data-testid='music-player']", { timeout: 12000 });
check("K1 保存地址不通时自动发现 8008 并接入（挂载触发）", true);
check("K2 自动发现后记住新地址", (await readSavedUrl()) === "http://127.0.0.1:8008", String(await readSavedUrl()));

/* ---------- F0 关桥 → 错误态（顺带为 B 阶段腾出输入框） ---------- */
await Promise.all((await bridge.ready).map((s) => new Promise((r) => s.close(r))));
await page.waitForSelector("[data-panel='music'] >> text=接入三步", { timeout: 15000 });
check("F0 断连回落未连接指引（含重试按钮）", (await retryBtn.count()) === 1);

/* ---------- B1 无协议地址规范化：直连非候选端口（不触发扫描） ---------- */
const bridgeB = createMockBridge({ portA: 19099, portB: 19098 });  // 候选表外 → 唯直连可达
await bridgeB.ready;
await addr.fill("127.0.0.1:19099");
await retry();
await page.waitForSelector("[data-testid='music-player']", { timeout: 8000 });
check("B1 无协议地址规范化接入成功", true);

/* ---------- B2 错误地址扫描自愈：敲错端口 → 桥在 8008 → 救回 ---------- */
await Promise.all((await bridgeB.ready).map((s) => new Promise((r) => s.close(r))));
await page.waitForSelector("[data-panel='music'] >> text=接入三步", { timeout: 15000 });
const bridge2 = createMockBridge({ portA: 8008, portB: 18008 });   // 候选端口复活（fill 前就位）
await bridge2.ready;
await addr.fill("127.0.0.1:19999");
await retry();
await page.waitForSelector("[data-testid='music-player']", { timeout: 12000 });
check("B2 错误地址自动扫描自愈回 8008", (await readSavedUrl()) === "http://127.0.0.1:8008", String(await readSavedUrl()));

/* ---------- K4 重挂载再扫描：重置保存地址 → 关面板 → 重开 ---------- */
await page.evaluate(() => localStorage.setItem("start:music-url", JSON.stringify("http://127.0.0.1:10754")));
await musicBtn.click();                    // 面板开着 → 点击 = 关闭
await page.waitForTimeout(700);
await musicBtn.click();                    // 重开 → connect(10754)→扫描→8008
await page.waitForSelector("[data-testid='music-player']", { timeout: 12000 });
check("K4 面板重开后再次自动发现（用户无操作）", true);

/* ---------- C 快照渲染 ---------- */
check("C1 歌名渲染", (await panel.getByText("夜空中最亮的星").count()) >= 1);
check("C2 歌手渲染", (await panel.getByText("逃跑计划").count()) >= 1);
check("C3 专辑渲染", (await panel.getByText("世界").count()) >= 1);
const range = panel.locator("input[aria-label='播放进度']");
check("C4 进度条在位", (await range.count()) === 1);
const rangeVal = await range.inputValue();
check("C5 进度值=快照位置（~30000ms）", Math.abs(Number(rangeVal) - 30000) < 2500, rangeVal);
const vol = panel.locator("input[aria-label='音量']");
check("C6 音量条渲染", (await vol.count()) === 1, String(await vol.count()));
check("C7 状态脚注已连接", (await panel.getByText("已连接 · 网易云音乐").count()) === 1);

/* ---------- E 进度插值 ---------- */
const t1 = Number(await range.inputValue());
bridge2.freeze(true);
await page.waitForTimeout(2500);
const t2 = Number(await range.inputValue());
bridge2.freeze(false);
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
const ctrls = await (await fetch("http://127.0.0.1:8008/api/__controls")).json();
const acts = ctrls.map((c) => c.action);
check("D1 toggle 命令", acts.includes("toggle"));
check("D2 next/prev 命令", acts.includes("next") && acts.includes("prev"));
const vcmd = ctrls.find((c) => c.action === "volume");
check("D3 volume 命令 0.25", vcmd && Math.abs(vcmd.volume - 0.25) < 0.001, JSON.stringify(vcmd || {}));
const scmd = ctrls.find((c) => c.action === "seek");
check("D4 seek 命令 60000ms", scmd && scmd.positionMs === 60000, JSON.stringify(scmd || {}));

bridge2.setSnap({ playing: false });
await page.waitForTimeout(1800);
check("D5 快照暂停 → UI 出「播放」按钮", (await panel.getByRole("button", { name: "播放" }).count()) === 1);
bridge2.setSnap({ playing: true });
await page.waitForTimeout(1500);

/* ---------- I 诊断卡（含端口回显） ---------- */
const diagBtn = panel.getByRole("button", { name: "桥接诊断" });
check("I0 诊断开关在位", (await diagBtn.count()) === 1);
await diagBtn.click();
await page.waitForSelector("[data-testid='music-diag']", { timeout: 4000 });
await page.waitForFunction(
  () => document.querySelector("[data-testid='music-diag']")?.textContent?.includes("bridge.dll"),
  { timeout: 4000 }
);
check("I1 诊断卡显示桥版本", (await panel.getByText("1.3.0 · bridge.dll").count()) === 1);
check("I2 诊断卡端口回显 :8008（实连端口）", (await panel.getByText(":8008").count()) === 1);
const chips = await panel.locator("[data-testid='music-diag'] >> text=✓").count();
check("I3 三源芯片全 ✓", chips >= 4, String(chips));
check("I4 注入页地址展示", (await panel.getByText("orpheus://orpheus/pub/app.html").count()) === 1);
check("I5 状态文件年龄展示（<5s）", (await panel.locator("[data-testid='music-diag']").getByText(/存在 · \d+s 前更新/).count()) === 1);

bridge2.setDebug({ stateAgeMs: 356400 });
await diagBtn.click();
await page.waitForTimeout(300);
await diagBtn.click();
await page.waitForSelector("[data-testid='music-diag']", { timeout: 4000 });
await page.waitForTimeout(400);
check("I6 陈旧警示出现（含升级提示）", (await panel.getByText(/状态已 356s 未更新/).count()) === 1);
check("I7 警示含 1.3.0 升级指引", (await panel.getByText(/升级插件到 1.3.0/).count()) === 1);

await panel.getByRole("button", { name: "复制诊断" }).click();
await page.waitForTimeout(400);
check("I8 复制反馈（已复制）", (await panel.getByText("已复制").count()) === 1);
const clip = await page.evaluate(() => navigator.clipboard.readText());
let clipOk = false;
try { clipOk = JSON.parse(clip).stateAgeMs === 356400; } catch { /* ignore */ }
check("I9 剪贴板为完整诊断 JSON", clipOk, clip.slice(0, 80));
bridge2.setDebug({ stateAgeMs: 800 });
await diagBtn.click();

/* ---------- F 断连回落 ---------- */
await Promise.all((await bridge2.ready).map((s) => new Promise((r) => s.close(r))));
await page.waitForSelector("[data-panel='music'] >> text=接入三步", { timeout: 15000 });
check("F1 断连后回到未连接指引", true);

/* ---------- K5 异名服务占 10754 → name 校验拒绝 ---------- */
const decoy = createServer((req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, { "access-control-allow-origin": "*" });
    res.end();
    return;
  }
  /* 带 CORS 头 → 探测能读到 JSON，命中 name 校验拒绝路径（bad） */
  res.writeHead(200, { "content-type": "application/json", "access-control-allow-origin": "*" });
  res.end(JSON.stringify({ ok: true, name: "some-other-app", version: "9.9.9" }));
});
await new Promise((r) => decoy.listen(10754, "127.0.0.1", r));
await retry();                             // 8008 已停 → 扫 10754 → 异名 → 拒绝
let k5ok = false, k5b = false;
for (let i = 0; i < 8; i++) {   // 轮询等回落（避开 connecting 瞬间与 5s 自动重试窗口）
  await page.waitForTimeout(1000);
  if ((await panel.getByText("接入三步").count()) === 1) {
    k5ok = true;
    k5b = (await panel.getByText("端口上不是初始音乐桥").count()) === 1;
    break;
  }
}
check("K5 异名服务不被误认（回未连接）", k5ok);
check("K5b 报错指向端口被占（name 校验拒绝）", k5b);
check("K5c 错误态输入框回填已采纳的 8008（onAdopted）", k5ok && (await addr.inputValue()).includes("8008"), k5ok ? await addr.inputValue() : "n/a");
await new Promise((r) => decoy.close(r));

/* ---------- K7 桥恢复 → 重试回归（记住的 8008 直连） ---------- */
const bridge3 = createMockBridge({ portA: 8008, portB: 18008 });
await bridge3.ready;
await retry();
await page.waitForSelector("[data-testid='music-player']", { timeout: 10000 });
check("K7 桥恢复后重试一键回归", true);

/* ---------- H pageerror ---------- */
check("H1 pageerror = 0", errors.length === 0, errors.slice(0, 3).join(" | "));

await browser.close();
await new Promise((r) => server.close(r));

const pass = results.filter((r) => r.ok).length;
console.log(`\n${pass}/${results.length} 通过`);
process.exit(pass === results.length ? 0 : 1);
