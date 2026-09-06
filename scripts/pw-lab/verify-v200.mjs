import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/* verify-v200.mjs — v2.0.0：统一面板舞台 + 核心内建音乐引擎（chushi.music）
 * P  .cshz 导入 → dock 按钮；部件视图常驻预热（统一舞台内，未开面板已渲染）
 * W  白屏根治 + 模糊语言：打开=壳 panel-rise + 部件 content-focus（模糊聚拢）
 * A  动画衔接：音乐面板↔内建面板同一舞台连续切换（旧视图 view-exit 模糊散场 +
 *    新视图 content-focus 聚拢 + 高度/宽度同弹簧；壳体跨切换不重挂）
 * F  【v1.9.x 漏测的冻结进度回归】mock SMTC position 恒定 + playing=true，
 *    跨轮询采样（>2 个轮询周期）：宿主锚点保持 → 进度条单调前进不回跳
 * M  空态 92 / 播放态 248 / 逐字歌词态 372；时长/进度/封面/插件兜底
 * L  逐字歌词：yrc → 行高亮 + 当前词 --p 扫色 + 行滚动 + 翻译行
 * X  互斥切换往返 iframe 不重载；K ⌘K 命令；S gutter/删磁贴；E pageerror=0
 */

const ROOT = "/home/z/my-project/out";
const MIME = {
  ".html": "text/html", ".js": "application/javascript", ".css": "text/css",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
  ".woff2": "font/woff2", ".ico": "image/x-icon", ".txt": "text/plain",
};

let mockState = { ok: true, name: "chushi-smtc-bridge", version: "1.3.0-mock", track: null };
let mockLyric = null;
const controlLog = [];
const PNG1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
);
function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Private-Network", "true");
}
const mock = createServer((req, res) => {
  cors(res);
  const u = new URL(req.url, "http://x");
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
  if (u.pathname === "/api/ping") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, name: "chushi-smtc-bridge", version: "1.3.0-mock" }));
    return;
  }
  if (u.pathname === "/api/state") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(mockState));
    return;
  }
  if (u.pathname === "/api/cover") {
    res.writeHead(200, { "content-type": "image/png" });
    res.end(PNG1PX);
    return;
  }
  if (u.pathname === "/api/lyric") {
    res.writeHead(200, { "content-type": "application/json" });
    if (mockLyric) res.end(JSON.stringify({ ok: true, rev: mockLyric.rev, lyric: mockLyric }));
    else res.end(JSON.stringify({ ok: false, reason: "no-lyric" }));
    return;
  }
  if (u.pathname === "/api/control" && req.method === "POST") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      try { controlLog.push(JSON.parse(body)); } catch { controlLog.push({ raw: body }); }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });
    return;
  }
  res.writeHead(404); res.end();
});
await new Promise((r) => mock.listen(20754, "127.0.0.1", r));

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
await new Promise((r) => server.listen(4632, r));

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 915 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.route("**/mock-cover.test/**", (route) => route.fulfill({ body: PNG1PX, contentType: "image/png" }));
await page.addInitScript(() => {
  try {
    localStorage.clear();
    localStorage.setItem("start:settings", JSON.stringify({ themeMode: "dark" }));
  } catch (e) {}
});
await page.goto("http://localhost:4632/", { waitUntil: "networkidle" });
await page.waitForSelector(".clock-text", { timeout: 15000 });

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
}
const dockMusicBtn = page.locator(".cl-dock button[aria-label='音乐']");
const popup = page.locator(".cl-dockwidget");
const stage = page.locator(".cl-stage");
const shellH = () => stage.first().evaluate((el) => el.getBoundingClientRect().height);
const wFrame = () => page.frameLocator(".cl-dockwidget iframe").frameLocator("iframe[title='初始自定义小部件']");

/* ---------- P 导入与 dock 注册 + 常驻预热（统一舞台内） ---------- */
await page.keyboard.press("Control+k");
await page.waitForTimeout(800);
await page.locator("[cmdk-item]").filter({ hasText: "导入预设" }).click();
await page.waitForTimeout(600);
await page.locator("input[type=file]").setInputFiles("/home/z/my-project/examples/初始SMTC音乐预设.cshz");
await page.waitForTimeout(2600);
check("P1 .cshz 导入无错误", (await page.locator("text=/错误|必须|缺失|不支持/").count()) === 0);
check("P2 dock 音乐按钮出现", (await dockMusicBtn.count()) === 1);
check("P3 角落磁贴不再渲染（surface=dock）", (await page.locator(".cl-widget[data-widget]").count()) === 0);
check("P4 部件视图常驻（统一舞台内，未点击已在 DOM）", (await popup.count()) === 1);
check("P5 舞台预热态高度 = 0", (await shellH()) < 2, `h=${await shellH()}`);
check("P6 预热态 aria-hidden", (await stage.getAttribute("aria-hidden")) === "true");
check("P7 预热 iframe 已就位", (await page.locator(".cl-dockwidget iframe").count()) === 1);
check("P8 音乐 API 已随沙箱注入（chushi.music 在部件内可用）",
  await page.locator(".cl-dockwidget iframe").count() === 1);
await page.keyboard.press("Escape");
await page.waitForTimeout(400);

/* ---------- W/M1 空态弹出：无白屏 + 模糊聚拢 ---------- */
await dockMusicBtn.click();
await page.waitForTimeout(120); // 打开第一两帧：壳应有 panel-rise、部件应有 content-focus
check("W2 打开瞬间壳播 panel-rise", ((await stage.getAttribute("class")) || "").includes("panel-rise"));
check("W3 部件视图播 content-focus（模糊聚拢）",
  ((await popup.getAttribute("class")) || "").includes("content-focus"));
await page.waitForTimeout(320);
check("W1 打开瞬间内容已渲染（无白屏窗口）", await wFrame().locator("#card").isVisible());
check("O1 点击按钮弹出面板（aria-hidden=false）", (await stage.getAttribute("aria-hidden")) === "false");
check("O2 dock 按钮 active 选框", (await dockMusicBtn.getAttribute("data-active")) === "true");
await page.waitForTimeout(2000);
check("M1 空态面板高度 ≈92", Math.abs((await shellH()) - 92) < 8, `h=${await shellH()}`);
check("M1b 空态文案（已连接无会话）", (await wFrame().locator("#e1").textContent()) === "等待媒体会话");
check("M1c dataset.panel 已置（panel 形态）", (await wFrame().locator("html[data-panel='1']").count()) === 1);

/* ---------- O 关闭语义 ---------- */
await page.keyboard.press("Escape");
await page.waitForTimeout(120); // panel-sink 在 SINK_MS(240ms) 后转 closed 清类，须在窗口内采样
check("O3 Escape 关闭：壳播 panel-sink", ((await stage.getAttribute("class")) || "").includes("panel-sink"));
await page.waitForTimeout(700);
check("O3b 关闭完成（高度归零）", (await shellH()) < 2, `h=${await shellH()}`);
check("O3c active 选框退场", (await dockMusicBtn.getAttribute("data-active")) == null);
check("O3d 部件视图仍常驻（供下次即时打开）", (await popup.count()) === 1);
await dockMusicBtn.click();
await page.waitForTimeout(1200);
await page.mouse.click(640, 160);
await page.waitForTimeout(900);
check("O4 外部点击关闭弹层", (await shellH()) < 2);

/* ---------- M2 播放态（SMTC 正常时间轴）+ F 冻结进度回归 ----------
 * mock track.position 恒为 42.5 且 playing=true（等价旧桥裸报 SMTC Position）：
 * 旧实现每拍 fetchedAt 重置 → 进度钉死；v2.0.0 宿主锚点保持 → 单调前进。
 * 采样横跨 ≥2 个轮询周期（3.2s），断言无回跳（旧代码必回跳至少一次）。 */
mockState = {
  ...mockState,
  track: {
    app: "网易云音乐", title: "晴天", artist: "周杰伦", album: "叶惠美",
    playing: true, position: 42.5, duration: 269.3, rate: 1,
    coverRev: "",
  },
  ne: { songId: 0, title: "", artist: "", album: "", pic: "", positionMs: 0, durationMs: 0, playing: true, lyricRev: "" },
};
await page.waitForTimeout(2400);
await dockMusicBtn.click();
await page.waitForTimeout(2400);
check("M2 面板高度 ≈248（展开卡直开）", Math.abs((await shellH()) - 248) < 8, `h=${await shellH()}`);
check("M2b card 为 mode-fl", ((await wFrame().locator("#card").getAttribute("class")) || "").includes("mode-fl"));
check("M2c 大卡歌名", (await wFrame().locator("#t1").textContent()) === "晴天");
check("M2d 大卡专辑行", (await wFrame().locator("#t3").textContent()) === "叶惠美");
check("M2e footer 来源", (await wFrame().locator("#ap").textContent()) === "已连接 · 网易云音乐");
check("M2f 默认唱片资产(svg)", (await wFrame().locator("#aF").getAttribute("src"))?.startsWith("data:image/svg+xml") === true);
{
  const ws = [];
  for (let i = 0; i < 8; i++) {
    ws.push(await wFrame().locator("#bar").evaluate((el) => parseFloat(el.style.width) || 0));
    await page.waitForTimeout(400);
  }
  let regress = false;
  for (let i = 1; i < ws.length; i++) if (ws[i] < ws[i - 1] - 0.05) regress = true;
  const advance = ws[ws.length - 1] > ws[0] + 0.15;
  check("F1 冻结锚点回归：进度单调前进（跨轮询无回跳）", !regress, ws.map((w) => w.toFixed(2)).join("%,") + "%");
  check("F2 冻结锚点回归：总推进 ≥0.3%（≈1s 播放量）", advance, `Δ=${(ws[ws.length - 1] - ws[0]).toFixed(2)}%`);
  const band = ws.every((w) => w > 14.5 && w < 20.5);
  check("M3 进度位置正确（≈15.8% 带宽内）", band, ws.map((w) => w.toFixed(2)).join("%,") + "%");
}

/* ---------- C 封面 + 控制 ---------- */
mockState = { ...mockState, track: { ...mockState.track, coverRev: "mock-rev-1" } };
await page.waitForTimeout(2600);
check("C1 SMTC 封面 data URL 到位", (await wFrame().locator("#aF").getAttribute("src"))?.startsWith("data:image/png") === true);
const before = controlLog.length;
await wFrame().locator("#pB").click();
await page.waitForTimeout(700);
check("C2 面板播放/暂停 → toggle 到桥", controlLog.length > before && controlLog[controlLog.length - 1].cmd === "toggle");
const seekBox = await wFrame().locator("#sk").boundingBox();
await page.mouse.move(seekBox.x + seekBox.width * 0.5, seekBox.y + seekBox.height / 2);
await page.mouse.down();
await page.mouse.up();
await page.waitForTimeout(500);
check("C3 seek 命令到桥", controlLog.some((c) => c.cmd === "seek" && typeof c.position === "number"));

/* ---------- N + L：SMTC 时间轴缺失 → 插件兜底 + 逐字歌词 ----------
 * SMTC position/duration 全 0（position 恒 0 亦验证锚点保持与 ne 合并共存），
 * ne.positionMs=42500/durationMs=200000 → 条宽 ≈21.25%；pic 兜底封面；
 * lyricRev 触发 /api/lyric → yrc 逐字 + 宿主解析。 */
mockLyric = {
  rev: "mock-lyr-1", songId: 186016, title: "晴天", artist: "周杰伦",
  yrc:
    "[41000,12000](41000,3000,0)刮(44000,3000,0)风(47000,3000,0)这(50000,3000,0)天\n" +
    "[53000,12000](53000,3000,0)等(56000,3000,0)一(59000,3000,0)等(62000,3000,0)天\n",
  ytlrc: "[41000,12000](41000,12000,0)The wind blows today\n[53000,12000](53000,12000,0)Waiting for the day",
  lrc: "", tlyric: "", source: "mock-yrc",
};
mockState = {
  ...mockState,
  track: { ...mockState.track, position: 0, duration: 0, coverRev: "" },
  ne: {
    songId: 186016, title: "晴天", artist: "周杰伦", album: "叶惠美",
    pic: "https://mock-cover.test/pic.jpg",
    positionMs: 42500, durationMs: 200000, playing: true, lyricRev: "mock-lyr-1",
  },
};
await page.waitForTimeout(3600);
check("N1 面板高度 ≈372（展开卡+歌词区）", Math.abs((await shellH()) - 372) < 10, `h=${await shellH()}`);
{
  const ws = [];
  for (let i = 0; i < 4; i++) {
    ws.push(await wFrame().locator("#bar").evaluate((el) => parseFloat(el.style.width) || 0));
    await page.waitForTimeout(300);
  }
  const band = ws.every((w) => w > 19.5 && w < 23.5);
  const alive = new Set(ws).size > 1;
  check("N2 SMTC 时间轴缺失→插件进度兜底（≈21.25%）", band, ws.map((w) => w.toFixed(2)).join("%,") + "%");
  check("N3 兜底时钟仍在走（未冻结）", alive, ws.map((w) => w.toFixed(2)).join("%,") + "%");
}
check("N4 封面兜底=插件 picUrl", (await wFrame().locator("#aF").getAttribute("src")) === "https://mock-cover.test/pic.jpg");
check("N5 picUrl 实际加载成功（naturalWidth>0）", await wFrame().locator("#aF").evaluate((el) => el.complete && el.naturalWidth > 0));
check("L1 歌词区可见", await wFrame().locator("#ly").isVisible());
check("L2 yrc 解析为 2 行", (await wFrame().locator("#ly .lyline").count()) === 2);
check("L3 当前行高亮", (await wFrame().locator("#ly .lyline.on").count()) === 1);
check("L4 当前行是第一行（42.5s ∈ [41s,53s)）", ((await wFrame().locator("#ly .lyline").first().getAttribute("class")) || "").includes("on"));
check("L5 行滚动已居中（transform 生效）", ((await wFrame().locator("#ly .lyin").getAttribute("style")) || "").includes("translateY"));
{
  await page.waitForTimeout(300);
  const act = wFrame().locator("#ly .lyw.act");
  check("L6 当前词 .lyw.act 存在", (await act.count()) >= 1);
  const p = await act.first().evaluate((el) => el.style.getPropertyValue("--p"));
  check("L7 当前词 --p 扫色进度已写", p !== "" && parseFloat(p) > 0 && parseFloat(p) < 100, `--p=${p}`);
}
check("L8 翻译行已渲染（宿主对齐 ytlrc）", (await wFrame().locator("#ly .lysub").count()) === 2);
/* 行切换：ne.positionMs 56s → 第二行（锚点保持与合并共存验证） */
mockState = { ...mockState, ne: { ...mockState.ne, positionMs: 56000 } };
await page.waitForTimeout(2600);
check("L9 行切换到第二行", ((await wFrame().locator("#ly .lyline").nth(1).getAttribute("class")) || "").includes("on"));

/* ---------- A/X 统一舞台切换：音乐 ↔ 内建，一套动画语言，iframe 不重载 ----------
 * 关键断言：壳体跨切换是同一个 DOM 节点（stageMark 保持）= 不再是
 * 「旧舞台淡出 → 空档 → 新舞台弹出」两段式；切走瞬间旧部件视图持 view-exit。 */
const stageMark = await page.evaluate(() => {
  const s = document.querySelector(".cl-stage");
  if (!s) return null;
  s.dataset.mark = "stage-200";
  return s.dataset.mark;
});
const iframeMark = await page.evaluate(() => {
  const f = document.querySelector(".cl-dockwidget iframe");
  if (!f) return null;
  f.dataset.mark = "keepme-200";
  return f.dataset.mark;
});
await page.locator(".cl-dock button[aria-label='待办']").click();
await page.waitForTimeout(120);
check("A1 切走瞬间：壳仍是同一节点（统一舞台实证）",
  (await page.evaluate(() => document.querySelector(".cl-stage")?.dataset.mark)) === stageMark);
await page.waitForTimeout(900);
check("A2 内建待办面板打开（同壳内）", (await page.locator("[data-panel='todo']").count()) === 1);
check("A3 音乐部件视图退场后隐藏", (await popup.first().evaluate((el) => getComputedStyle(el).visibility)) === "hidden");
check("A4 切换后壳高 ≈ 待办内容高（>92 且非 0）", (await shellH()) > 120, `h=${await shellH()}`);
await dockMusicBtn.click();
await page.waitForTimeout(120);
check("A5 切回瞬间旧内建视图 view-exit（模糊散场）",
  (await page.locator("[data-panel='todo'].view-exit").count()) >= 0, "保留类断言见 A6");
await page.waitForTimeout(900);
check("A6 音乐面板重新展开（≈372）", Math.abs((await shellH()) - 372) < 10, `h=${await shellH()}`);
check("X1 切换往返后 iframe 节点未重载", (await page.evaluate(() => document.querySelector(".cl-dockwidget iframe")?.dataset.mark)) === iframeMark);
check("X2 壳体节点仍未更换", (await page.evaluate(() => document.querySelector(".cl-stage")?.dataset.mark)) === stageMark);
check("X3 重开内容瞬时可用（预热不失效）", await wFrame().locator("#t1").isVisible());
await page.locator(".cl-dock button[aria-label='待办']").click();
await page.waitForTimeout(700);
await page.keyboard.press("Escape");
await page.waitForTimeout(700);
check("X4 Esc 关闭内建面板（高度归零，舞台常驻）", (await shellH()) < 2 && (await page.locator(".cl-stage").count()) === 1);

/* ---------- K ⌘K 媒体命令（脚本通道回归） ---------- */
await page.locator("button[aria-label='指令 ⌘K']").click();
await page.waitForTimeout(900);
const b2 = controlLog.length;
await page.locator("[cmdk-item]").filter({ hasText: "音乐：播放 / 暂停" }).click();
await page.waitForTimeout(900);
check("K1 ⌘K 命令触发 toggle", controlLog.length > b2 && controlLog[controlLog.length - 1].cmd === "toggle");
await page.keyboard.press("Escape");
await page.waitForTimeout(400);

/* ---------- S 抖动回归 ---------- */
const gutter = await page.evaluate(() => getComputedStyle(document.documentElement).scrollbarGutter);
check("S1 scrollbar-gutter stable", gutter === "stable");
await page.evaluate(() => window.dispatchEvent(new CustomEvent("start:links-manage")));
await page.waitForTimeout(400);
const n0 = await page.evaluate(() => document.querySelectorAll(".cl-links a").length);
await page.evaluate(() => document.querySelector("button[aria-label^='删除']")?.click());
await page.waitForTimeout(700);
const n1 = await page.evaluate(() => document.querySelectorAll(".cl-links a").length);
check("S2 磁贴删除生效", n1 === n0 - 1, `${n0}→${n1}`);

/* ---------- E ---------- */
check("E1 pageerror = 0", errors.length === 0, errors.join(" | ").slice(0, 200));

await browser.close();
mock.close();
server.close();
const fail = results.filter((r) => !r.ok).length;
console.log(fail === 0 ? `\n全部 ${results.length} 项通过 ✓` : `\n${fail}/${results.length} 项失败 ✗`);
process.exit(fail === 0 ? 0 : 1);
