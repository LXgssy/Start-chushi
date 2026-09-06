import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/* verify-v190.mjs — v1.9.0：dock 弹出面板常驻预热 + 网易云增强（歌词/封面/时钟兜底）
 * P  .cshz 导入 → dock 按钮；弹出容器常驻预热（未开面板 iframe 已在 DOM，高度 0）
 * W  白屏根治：打开瞬间内容已就绪（#card ≤400ms 可见）+ iframe 节点跨开关不重载
 * M  空态 92 / 播放态 248 直开展开卡 / 逐字歌词态 372
 * C  SMTC 封面 dataURL / 插件 picUrl 兑底 / toggle+seek 上行
 * N  ne 合并：SMTC 时间轴缺失（0）→ 插件精确进度兜底（条宽=positionMs/durationMs）
 * L  逐字歌词：/api/lyric yrc → 行高亮 + 当前词 .lyw.act --p 扫色 + 行滚动居中
 * X  互斥（开 todo 关弹层，反向亦然）+ 面板切换期间 iframe 不重载
 * K  ⌘K 媒体命令回归；S scrollbar-gutter + 磁贴删除回归；E pageerror = 0
 */

const ROOT = "/home/z/my-project/out";
const MIME = {
  ".html": "text/html", ".js": "application/javascript", ".css": "text/css",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
  ".woff2": "font/woff2", ".ico": "image/x-icon", ".txt": "text/plain",
};

let mockState = { ok: true, name: "chushi-smtc-bridge", version: "1.2.0-mock", track: null };
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
    res.end(JSON.stringify({ ok: true, name: "chushi-smtc-bridge", version: "1.2.0-mock" }));
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
/* 插件封面 URL 兑底：拦截 mock 域名图，返回 1px PNG（iframe 不透明源也能路由） */
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
const opened = page.locator('.cl-dockwidget[aria-hidden="false"]');
const wFrame = () => page.frameLocator(".cl-dockwidget iframe").frameLocator("iframe[title='初始自定义小部件']");
const popH = () => popup.first().evaluate((el) => el.getBoundingClientRect().height);

/* ---------- P 导入与 dock 注册 + 常驻预热 ---------- */
await page.keyboard.press("Control+k");
await page.waitForTimeout(800);
await page.locator("[cmdk-item]").filter({ hasText: "导入预设" }).click();
await page.waitForTimeout(600);
await page.locator("input[type=file]").setInputFiles("/home/z/my-project/examples/初始SMTC音乐预设.cshz");
await page.waitForTimeout(2600); // 导入 + 预热 iframe 加载/渲染/订阅
check("P1 .cshz 导入无错误", (await page.locator("text=/错误|必须|缺失|不支持/").count()) === 0);
check("P2 dock 音乐按钮出现", (await dockMusicBtn.count()) === 1);
check("P3 角落磁贴不再渲染（surface=dock）", (await page.locator(".cl-widget[data-widget]").count()) === 0);
check("P4 弹出容器常驻预热（未点击已在 DOM）", (await popup.count()) === 1);
check("P5 预热态高度 = 0（不可见）", (await popH()) < 2, `h=${await popH()}`);
check("P6 预热态 aria-hidden", (await popup.getAttribute("aria-hidden")) === "true");
check("P7 预热 iframe 已就位", (await page.locator(".cl-dockwidget iframe").count()) === 1);
await page.keyboard.press("Escape");
await page.waitForTimeout(400);

/* ---------- M1 空态弹出（高度 ≈92；内容瞬时可见=无白屏）---------- */
await dockMusicBtn.click();
await opened.waitFor({ timeout: 3000 });
await page.waitForTimeout(320); // 弹簧起步即可，内容应已就绪（预热）
check("W1 打开瞬间内容已渲染（无白屏窗口）", await wFrame().locator("#card").isVisible());
check("O1 点击按钮弹出面板（aria-hidden=false）", (await opened.count()) === 1);
check("O2 dock 按钮 active 选框", (await dockMusicBtn.getAttribute("data-active")) === "true");
await page.waitForTimeout(2000); // 弹簧稳定
check("M1 空态面板高度 ≈92", Math.abs((await popH()) - 92) < 8, `h=${await popH()}`);
check("M1b 空态文案（已连接无会话）", (await wFrame().locator("#e1").textContent()) === "等待媒体会话");
check("M1c dataset.panel 已置（panel 形态）", (await wFrame().locator("html[data-panel='1']").count()) === 1);

/* ---------- O 关闭语义（容器常驻，断言高度归零） ---------- */
await page.keyboard.press("Escape");
await page.waitForTimeout(900);
check("O3 Escape 关闭弹层（高度归零）", (await popH()) < 2, `h=${await popH()}`);
check("O3b active 选框退场", (await dockMusicBtn.getAttribute("data-active")) == null);
check("O3c 容器仍常驻（供下次即时打开）", (await popup.count()) === 1);
await dockMusicBtn.click();
await opened.waitFor({ timeout: 3000 });
await page.waitForTimeout(1200);
await page.mouse.click(640, 160);
await page.waitForTimeout(900);
check("O4 外部点击关闭弹层", (await popH()) < 2);

/* ---------- M2 播放态弹出（SMTC 时间轴正常：248 直开）---------- */
mockState = {
  ...mockState,
  track: {
    app: "网易云音乐", title: "晴天", artist: "周杰伦", album: "叶惠美",
    playing: true, position: 42.5, duration: 269.3, rate: 1,
    coverRev: "",
  },
  ne: { songId: 0, title: "", artist: "", album: "", pic: "", positionMs: 0, durationMs: 0, playing: true, lyricRev: "" },
};
await page.waitForTimeout(2400); // 等 smtc 推送
await dockMusicBtn.click();
await opened.waitFor({ timeout: 3000 });
await page.waitForTimeout(2400);
check("M2 面板高度 ≈248（展开卡直开）", Math.abs((await popH()) - 248) < 8, `h=${await popH()}`);
check("M2b card 为 mode-fl（跳过紧凑条）", ((await wFrame().locator("#card").getAttribute("class")) || "").includes("mode-fl"));
check("M2c 大卡歌名", (await wFrame().locator("#t1f").textContent()) === "晴天");
check("M2d 大卡专辑行", (await wFrame().locator("#t3f").textContent()) === "叶惠美");
check("M2e footer 来源", (await wFrame().locator("#ap").textContent()) === "已连接 · 网易云音乐");
check("M2f 默认唱片资产(svg)", (await wFrame().locator("#aF").getAttribute("src"))?.startsWith("data:image/svg+xml") === true);
/* 进度条活性：采样 4 次不全等（未冻结）且都在预期带宽（42.5/269.3≈15.8%，插值锯齿 ≤1s） */
{
  const ws = [];
  for (let i = 0; i < 4; i++) {
    ws.push(await wFrame().locator("#barF").evaluate((el) => parseFloat(el.style.width) || 0));
    await page.waitForTimeout(260);
  }
  const uniq = new Set(ws).size;
  const band = ws.every((w) => w > 14 && w < 18);
  check("M3 进度条活着（宽度在变化）", uniq > 1, ws.join("%,") + "%");
  check("M3b 进度条位置正确（≈15.8%）", band, ws.join("%,") + "%");
}

/* ---------- C 封面（SMTC dataURL）+ 控制 ---------- */
mockState = { ...mockState, track: { ...mockState.track, coverRev: "mock-rev-1" } };
await page.waitForTimeout(2600);
check("C1 SMTC 封面 data URL 到位", (await wFrame().locator("#aF").getAttribute("src"))?.startsWith("data:image/png") === true);
const before = controlLog.length;
await wFrame().locator("#pF0").click();
await page.waitForTimeout(700);
check("C2 面板播放/暂停 → toggle 到桥", controlLog.length > before && controlLog[controlLog.length - 1].cmd === "toggle");
const seekBox = await wFrame().locator("#sk").boundingBox();
await page.mouse.move(seekBox.x + seekBox.width * 0.5, seekBox.y + seekBox.height / 2);
await page.mouse.down();
await page.mouse.up();
await page.waitForTimeout(500);
check("C3 seek 命令到桥", controlLog.some((c) => c.cmd === "seek" && typeof c.position === "number"));

/* ---------- N + L 网易云增强：SMTC 时间轴缺失 → 插件兜底 + 封面 picUrl + 逐字歌词 ----------
 * SMTC track 的 position/duration 全 0（NetEase Win32 SMTC 时间轴缺失场景），
 * ne 提供 positionMs=42500 durationMs=200000（帧级）→ 条宽应 ≈21.25%；
 * ne.pic 兜底封面；ne.lyricRev 触发 /api/lyric 拉取 yrc 逐字歌词。 */
mockLyric = {
  rev: "mock-lyr-1", songId: 186016, title: "晴天", artist: "周杰伦",
  yrc:
    "[41000,12000](41000,3000,0)刮(44000,3000,0)风(47000,3000,0)这(50000,3000,0)天\n" +
    "[53000,12000](53000,3000,0)等(56000,3000,0)一(59000,3000,0)等(62000,3000,0)天\n",
  ytlrc: "", lrc: "", tlyric: "", source: "mock-yrc",
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
await page.waitForTimeout(3200); // 轮询 + 合并 + /api/lyric 拉取 + resize 弹簧
check("N1 面板高度 ≈372（展开卡+歌词区）", Math.abs((await popH()) - 372) < 10, `h=${await popH()}`);
{
  const ws = [];
  for (let i = 0; i < 4; i++) {
    ws.push(await wFrame().locator("#barF").evaluate((el) => parseFloat(el.style.width) || 0));
    await page.waitForTimeout(260);
  }
  const band = ws.every((w) => w > 20 && w < 23);
  const alive = new Set(ws).size > 1;
  check("N2 SMTC 时间轴缺失→插件进度兜底（≈21.25%）", band, ws.join("%,") + "%");
  check("N3 兜底时钟仍在走（未冻结）", alive, ws.join("%,") + "%");
}
check("N4 封面兜底=插件 picUrl", (await wFrame().locator("#aF").getAttribute("src")) === "https://mock-cover.test/pic.jpg");
check("N5 picUrl 实际加载成功（naturalWidth>0）", await wFrame().locator("#aF").evaluate((el) => el.complete && el.naturalWidth > 0));
check("L1 歌词区可见", await wFrame().locator("#ly").isVisible());
check("L2 yrc 解析为 2 行", (await wFrame().locator("#ly .lyline").count()) === 2);
check("L3 当前行高亮", (await wFrame().locator("#ly .lyline.on").count()) === 1);
check("L4 当前行是第一行（42.5s ∈ [41s,53s)）", ((await wFrame().locator("#ly .lyline").first().getAttribute("class")) || "").includes("on"));
check("L5 行滚动已居中（transform 生效）", ((await wFrame().locator("#ly .lyin").getAttribute("style")) || "").includes("translateY"));
{
  /* 逐字扫色：42.5~44s 窗口内第 1 个词是当前词（act + --p 扫色） */
  await page.waitForTimeout(300);
  const act = wFrame().locator("#ly .lyw.act");
  check("L6 当前词 .lyw.act 存在", (await act.count()) >= 1);
  const p = await act.first().evaluate((el) => el.style.getPropertyValue("--p"));
  check("L7 当前词 --p 扫色进度已写", p !== "" && parseFloat(p) > 0 && parseFloat(p) < 100, `--p=${p}`);
}
check("L8 无词行走 gap 样式（无）", (await wFrame().locator("#ly .lyline.gap").count()) === 0);
/* 行切换：seek 到第二行中段（mock track position 仍为 0——用 control seek 无法改 mock，
 * 直接改 ne.positionMs 到 56s 并等下一拍） */
mockState = { ...mockState, ne: { ...mockState.ne, positionMs: 56000 } };
await page.waitForTimeout(2600);
check("L9 行切换到第二行", ((await wFrame().locator("#ly .lyline").nth(1).getAttribute("class")) || "").includes("on"));

/* ---------- X 互斥 + 不重载 ---------- */
const iframeMark = await page.evaluate(() => {
  const f = document.querySelector(".cl-dockwidget iframe");
  if (!f) return null;
  f.dataset.mark = "keepme-190";
  return f.dataset.mark;
});
await page.locator(".cl-dock button[aria-label='待办']").click();
await page.waitForTimeout(900);
check("X1 开内建待办面板收起音乐弹层", (await page.locator("[data-panel='todo']").count()) === 1 && (await popH()) < 2);
await dockMusicBtn.click();
await page.waitForTimeout(700);
check("X2 开音乐弹层收起内建面板", (await page.locator("[data-panel='todo']").count()) === 0 && (await opened.count()) === 1);
check("X3 切换往返后 iframe 节点未重载", (await page.evaluate(() => document.querySelector(".cl-dockwidget iframe")?.dataset.mark)) === "keepme-190");
check("X4 重开内容瞬时可用（预热不失效）", await wFrame().locator("#t1f").isVisible());
await page.locator(".cl-dock button[aria-label='待办']").click();
await page.waitForTimeout(700);
await page.keyboard.press("Escape");
await page.waitForTimeout(500);

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
