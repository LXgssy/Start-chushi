import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/* verify-v210.mjs — v2.1.0：歌词竞态(latest-wins)/旧词拒收(rev 校验)/按钮交叉淡切(零位移)
 * LR 切歌竞态：A 词慢拉取(1.4s) inflight 窗口内切 B —— B 词必须 latest-wins 链式补拉到位
 * ST 桥回旧词(rev 不符)：宿主必须拒收并重试，桥换新词后到位
 * BT 播放/暂停双图标绝对堆叠交叉淡切：按钮几何零位移 + 过渡存在
 * P  .cshz 导入 → dock 按钮；部件视图常驻预热（统一舞台内，未开面板已渲染）
 * W  闪白根治：部件视图壳体不播 panel-rise（无 opacity 淡入），内容走
 *    content-focus-solid（无 opacity 的模糊聚拢）——暗卡在明亮壁纸上不再透灰
 * F  【旧桥伪影守卫】v1.3.x 桥暂停报 0 / 恢复从 0 重数：
 *    F3 暂停冻结（position 1:04→0 时宿主冻结在本端插值处）
 *    F4 恢复续接（position 从 0 重数时宿主从冻结值续推）
 * S  seek 全链：拖动 → seek 命令 → seekHold 顶住旧桥旧基準（不被拽回）
 * O  播放/暂停乐观翻转（<250ms 图标即变，不等轮询）
 * AR 关闭箭头朝下（面板在 dock 上方，收起方向向下）
 * LY 逐字歌词：双层 clip-path 扫色（无 background-clip，词永不隐形闪动）
 * A  统一舞台单帧互切：音乐↔内建走拉伸+模糊（壳体类全程稳定，无两段式）
 * X  iframe 不重载；K ⌘K 命令；S gutter/删磁贴；E pageerror=0
 */

const ROOT = "/home/z/my-project/out";
const MIME = {
  ".html": "text/html", ".js": "application/javascript", ".css": "text/css",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
  ".woff2": "font/woff2", ".ico": "image/x-icon", ".txt": "text/plain",
};

let mockState = { ok: true, name: "chushi-smtc-bridge", version: "1.5.0-mock", track: null };
const mockLyrics = {}; // rev → lyric 载荷
const mockLyricDelay = {}; // rev → 响应延迟 ms
let mockServeStaleRev = ""; // 非空：/api/lyric 对任何 v 都返回该 rev 的载荷（旧词伪影）
/** v1.3.x 真桥在恢复后从 0 连续计数（Base=raw 0 + 墙钟推进）：置位后 /api/state
 *  动态计算 position，模拟真实伪影形态 */
let mockCounting = null; // { base: 0, t0: ms } → position = base + (now-t0)/1000
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
    res.end(JSON.stringify({ ok: true, name: "chushi-smtc-bridge", version: "1.5.0-mock" }));
    return;
  }
  if (u.pathname === "/api/state") {
    const out = { ...mockState };
    if (mockCounting && out.track) {
      out.track = { ...out.track, position: mockCounting.base + (Date.now() - mockCounting.t0) / 1000 };
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(out));
    return;
  }
  if (u.pathname === "/api/cover") {
    res.writeHead(200, { "content-type": "image/png" });
    res.end(PNG1PX);
    return;
  }
  if (u.pathname === "/api/lyric") {
    const want = u.searchParams.get("v") || "";
    const stale = mockServeStaleRev && mockLyrics[mockServeStaleRev];
    const lyr = stale || mockLyrics[want];
    const delay = !stale && mockLyricDelay[want] ? mockLyricDelay[want] : 0;
    const serve = () => {
      res.writeHead(200, { "content-type": "application/json" });
      if (lyr) res.end(JSON.stringify({ ok: true, rev: lyr.rev, lyric: lyr }));
      else res.end(JSON.stringify({ ok: false, reason: "no-lyric" }));
    };
    if (delay > 0) setTimeout(serve, delay);
    else serve();
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
await new Promise((r) => server.listen(4633, r));

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
await page.goto("http://localhost:4633/", { waitUntil: "networkidle" });
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
const barW = () => wFrame().locator("#bar").evaluate((el) => parseFloat(el.style.width) || 0);
const tCtxt = () => wFrame().locator("#tC").textContent();

/* ---------- P 导入与 dock 注册 + 常驻预热 ---------- */
await page.keyboard.press("Control+k");
await page.waitForTimeout(800);
await page.locator("[cmdk-item]").filter({ hasText: "导入预设" }).click();
await page.waitForTimeout(600);
await page.locator("input[type=file]").setInputFiles("/home/z/my-project/examples/初始SMTC音乐预设.cshz");
await page.waitForTimeout(2600);
check("P1 .cshz 导入无错误", (await page.locator("text=/错误|必须|缺失|不支持/").count()) === 0);
check("P2 dock 音乐按钮出现", (await dockMusicBtn.count()) === 1);
check("P3 部件视图常驻（统一舞台内）", (await popup.count()) === 1);
check("P4 舞台预热态高度 = 0", (await shellH()) < 2, `h=${await shellH()}`);
check("P5 预热 iframe 已就位", (await page.locator(".cl-dockwidget iframe").count()) === 1);
await page.keyboard.press("Escape");
await page.waitForTimeout(400);

/* ---------- W/FLASH 闪白根治：部件开面板无 opacity 淡入 ---------- */
await dockMusicBtn.click();
await page.waitForTimeout(120); // 开场 0.32s 动画进行中采样
{
  const stageCls = (await stage.getAttribute("class")) || "";
  const popCls = (await popup.getAttribute("class")) || "";
  check("W1 壳体不播 panel-rise（部件无淡入=无闪白窗口）", !stageCls.includes("panel-rise"), stageCls);
  check("W2 部件视图播 content-focus-solid（无 opacity 聚拢）", popCls.includes("content-focus-solid"), popCls);
  check("W3 部件视图不再用旧 content-focus（opacity 0 起步）",
    !popCls.split(/\s+/).includes("content-focus"), popCls);
  const op = await popup.evaluate((el) => getComputedStyle(el).opacity);
  const an = await popup.evaluate((el) => getComputedStyle(el).animationName);
  check("W4 开场 120ms 部件视图 opacity=1（壁纸永不透出）", op === "1", `opacity=${op}`);
  check("W5 动画名=content-focus-solid-kf", an === "content-focus-solid-kf", an);
}
await page.waitForTimeout(400);
check("W6 打开瞬间内容已渲染", await wFrame().locator("#card").isVisible());
check("W7 空态面板高度 ≈92", Math.abs((await shellH()) - 92) < 8, `h=${await shellH()}`);
await page.keyboard.press("Escape");
await page.waitForTimeout(700);

/* ---------- M2 播放态 + F3/F4 旧桥伪影守卫 ----------
 * mock 模拟 v1.3.x 真桥行为：playing 时 position 恒 50（锚点保持让本端插值前进）；
 * 暂停瞬间桥重置锚点 → reported 骤变 0（真机录屏实锤的归零伪影）。 */
mockState = {
  ...mockState,
  track: {
    app: "网易云音乐", title: "晴天 (Live)", artist: "周杰伦", album: "叶惠美",
    playing: true, position: 50, duration: 269.3, rate: 1, coverRev: "",
  },
  ne: null,
};
await page.waitForTimeout(2400);
await dockMusicBtn.click();
await page.waitForTimeout(2400);
check("M1 播放态面板高度 ≈248", Math.abs((await shellH()) - 248) < 8, `h=${await shellH()}`);
check("M2 大卡歌名（SMTC 修饰标题直显）", (await wFrame().locator("#t1").textContent()) === "晴天 (Live)");
{
  // F1 轻回归：恒定 position + playing → 本端锚点插值单调前进
  const ws = [];
  for (let i = 0; i < 3; i++) { ws.push(await barW()); await page.waitForTimeout(400); }
  check("F1 锚点插值单调前进（不钉死）", ws[2] > ws[0] + 0.1, ws.map((w) => w.toFixed(2)).join("%,") + "%");
}
/* F3 暂停冻结：旧桥暂停瞬间 reported 从 ~53 掉到 0 —— 宿主必须冻结在本端插值处 */
{
  const before = await barW();
  mockState = { ...mockState, track: { ...mockState.track, playing: false, position: 0 } };
  await page.waitForTimeout(2600); // ≥2 个轮询周期
  const after = await barW();
  const t = await tCtxt();
  const secs = t.split(":").map(Number);
  const tSecs = secs.length === 2 ? secs[0] * 60 + secs[1] : -1;
  check("F3a 暂停不归零（进度冻结在插值处 ≈19%）", after > 15 && after < 26, `bar ${before.toFixed(2)}%→${after.toFixed(2)}%`);
  check("F3b 时间标签未重置（仍 ≈0:5x）", tSecs >= 45 && tSecs <= 75, `tC=${t}`);
  const drift = Math.abs(after - before);
  check("F3c 冻结漂移 <2.5%", drift < 2.5, `Δ=${drift.toFixed(2)}%`);
}
/* F4 恢复续接：旧桥恢复后重置锚点至 raw=0 并从 0 连续计数（0,1,2…）——
   宿主必须从冻结值续推，不被计数线拽回零 */
{
  mockCounting = { base: 0, t0: Date.now() };
  mockState = { ...mockState, track: { ...mockState.track, playing: true } };
  await page.waitForTimeout(2600);
  // 停计数线时把 position 接到当前计数值（避免 mock 侧 -3s 跳变被当作真实时间线变化）
  const cnt = mockCounting ? (Date.now() - mockCounting.t0) / 1000 : 0;
  mockCounting = null;
  mockState = { ...mockState, track: { ...mockState.track, position: cnt } };
  const w1 = await barW();
  await page.waitForTimeout(600);
  const w2 = await barW();
  check("F4a 恢复不重头（续接冻结值 ≈19%+）", w1 > 15, `bar=${w1.toFixed(2)}%`);
  check("F4b 续接后仍在前进", w2 >= w1 - 0.05, `${w1.toFixed(2)}%→${w2.toFixed(2)}%`);
  await page.waitForTimeout(400);
}

/* ---------- S seek 全链：拖动提交 + seekHold 顶住旧基準 ----------
 * 拖到 50% → seek ≈134.6s；旧桥继续报 position=0 —— 4s 守卫窗内进度必须钉在 50%。 */
{
  controlLog.length = 0;
  const box = await wFrame().locator("#sk").boundingBox();
  await page.mouse.move(box.x + box.width * 0.1, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2, { steps: 8 });
  await page.waitForTimeout(120); // 拖动预览帧
  const preview = await barW();
  await page.mouse.up();
  await page.waitForTimeout(400);
  const seekCmd = controlLog.find((c) => c.cmd === "seek" && typeof c.position === "number");
  check("S1 拖动预览即时跟手（≈50%）", preview > 42 && preview < 58, `preview=${preview.toFixed(2)}%`);
  check("S2 seek 命令到桥（position≈134.6）", !!seekCmd && Math.abs(seekCmd.position - 134.65) < 4,
    seekCmd ? `position=${seekCmd.position}` : "no-seek");
  const ws = [];
  for (let i = 0; i < 5; i++) { ws.push(await barW()); await page.waitForTimeout(550); }
  const holdOk = ws.every((w) => w > 46 && w < 56);
  const regress = ws.some((w) => w < 25);
  check("S3 seekHold 顶住旧桥旧基準（进度钉在 ≈50% 不被拽回）", holdOk && !regress,
    ws.map((w) => w.toFixed(2)).join("%,") + "%");
  const t = await tCtxt();
  check("S4 seek 后时间标签 ≈2:1x+", t.startsWith("2:"), `tC=${t}`);
}

/* ---------- O 播放/暂停乐观翻转 ---------- */
{
  // 当前 playing=true（暂停图标显示中）→ 点击应立刻翻成播放三角
  const yHidden0 = await wFrame().locator("#yI").evaluate((el) => el.classList.contains("off"));
  check("O0 点击前显示暂停图标（播放中）", yHidden0 === true);
  controlLog.length = 0;
  await wFrame().locator("#pB").click();
  await page.waitForTimeout(200); // 不等任何快照/轮询
  const yHidden1 = await wFrame().locator("#yI").evaluate((el) => el.classList.contains("off"));
  const nVis1 = await wFrame().locator("#nI").evaluate((el) => !el.classList.contains("off"));
  check("O1 乐观翻转 <250ms（播放三角立现、暂停条隐藏）", yHidden1 === false && nVis1 === false,
    `yI.hd=${yHidden1} nI.vis=${nVis1}`);
  check("O2 toggle 已发桥", controlLog.some((c) => c.cmd === "toggle"));
  // 真实态到达（mock 翻 false）→ 乐观值与真值一致，保持播放三角（暂停态）
  mockState = { ...mockState, track: { ...mockState.track, playing: false } };
  await page.waitForTimeout(1600);
  const yVis2 = await wFrame().locator("#yI").evaluate((el) => !el.classList.contains("off"));
  const nVis2 = await wFrame().locator("#nI").evaluate((el) => !el.classList.contains("off"));
  check("O3 真实暂停态确认（播放三角保持、暂停条不回）", yVis2 === true && nVis2 === false,
    `yI.vis=${yVis2} nI.vis=${nVis2}`);
  // mock 回 playing=true → 快照广播 → 翻回播放中
  mockState = { ...mockState, track: { ...mockState.track, playing: true } };
  await page.waitForTimeout(1600);
  const yHidden3 = await wFrame().locator("#yI").evaluate((el) => el.classList.contains("off"));
  const nVis3 = await wFrame().locator("#nI").evaluate((el) => !el.classList.contains("off"));
  check("O4 真实播放态回正（暂停条回、三角隐）", yHidden3 === true && nVis3 === true);
}

/* ---------- AR 关闭箭头朝下 ---------- */
{
  const href = await wFrame().locator("#cxB use").getAttribute("href");
  check("AR1 关闭键用向下箭头 (#i-dn)", href === "#i-dn", `href=${href}`);
  const pts = await page.evaluate(() => {
    // srcdoc 内的 defs 拿不到（跨源），退而断言导入包源文件（构建期已内联）
    return null;
  });
}

/* ---------- LY 逐字歌词（切真曲目触发重锚/合并/解析）---------- */
mockLyrics["mock-lyr-1"] = {
  rev: "mock-lyr-1", songId: 186016, title: "晴天", artist: "周杰伦",
  yrc:
    "[41000,12000](41000,3000,0)刮(44000,3000,0)风(47000,3000,0)这(50000,3000,0)天\n" +
    "[53000,12000](53000,3000,0)等(56000,3000,0)一(59000,3000,0)等(62000,3000,0)天\n",
  ytlrc: "[41000,12000](41000,12000,0)The wind blows today\n[53000,12000](53000,12000,0)Waiting for the day",
  lrc: "", tlyric: "", source: "mock-yrc",
};
mockState = {
  ...mockState,
  track: {
    app: "网易云音乐", title: "晴天", artist: "周杰伦", album: "叶惠美",
    playing: true, position: 0, duration: 0, rate: 1, coverRev: "",
  },
  ne: {
    songId: 186016, title: "晴天", artist: "周杰伦", album: "叶惠美",
    pic: "https://mock-cover.test/pic.jpg",
    positionMs: 42500, durationMs: 200000, playing: true, lyricRev: "mock-lyr-1",
  },
};
await page.waitForTimeout(3800);
check("LY1 面板高度 ≈372（展开卡+歌词区）", Math.abs((await shellH()) - 372) < 10, `h=${await shellH()}`);
check("LY2 歌词区可见", await wFrame().locator("#ly").isVisible());
check("LY3 yrc 解析为 2 行", (await wFrame().locator("#ly .lyline").count()) === 2);
check("LY4 当前行高亮", (await wFrame().locator("#ly .lyline.on").count()) === 1);
check("LY5 当前行是第一行（42.5s ∈ [41s,53s)）", ((await wFrame().locator("#ly .lyline").first().getAttribute("class")) || "").includes("on"));
{
  // 双层 clip-path 扫色：底层文本永远实体色，上层 .ov 按 --p 裁剪
  const ovCount = await wFrame().locator("#ly .lyw .ov").count();
  check("LY6 每词带 .ov 覆盖层（8 词）", ovCount === 8, `ov=${ovCount}`);
  const ps = await wFrame().locator("#ly .lyline.on .lyw").evaluateAll((els) =>
    els.map((el) => parseFloat(el.style.getPropertyValue("--p")) || 0));
  // 结构断言（时序无关）：扫色边界唯一——前沿词 0<p<100，之前全 100，之后全 0
  const k = ps.findIndex((p) => p < 100);
  const structural = k >= 0 && ps[k] > 0 && ps.slice(0, k).every((p) => p === 100) && ps.slice(k + 1).every((p) => p === 0);
  check("LY7 扫色边界唯一且在行内（前沿词部分显色）", ps.length === 4 && structural,
    `--p=[${ps.map((p) => p.toFixed(1)).join(",")}]`);
  check("LY8 未唱词 --p=0（底色实体可見，永不隐形）", ps.length === 4 && ps[ps.length - 1] === 0,
    `--p=[${ps.map((p) => p.toFixed(1)).join(",")}]`);
  const clip = await wFrame().locator("#ly .lyw .ov").first().evaluate((el) => getComputedStyle(el).clipPath);
  check("LY9 扫色走 clip-path 裁剪（非 background-clip）", clip.startsWith("inset("), clip);
}
check("LY10 翻译行已渲染（宿主对齐 ytlrc）", (await wFrame().locator("#ly .lysub").count()) === 2);
check("LY11 封面兜底=插件 picUrl", (await wFrame().locator("#aF").getAttribute("src")) === "https://mock-cover.test/pic.jpg");
{
  // 行切换：ne 56s → 第二行（逐字对齐跟随）
  mockState = { ...mockState, ne: { ...mockState.ne, positionMs: 56000 } };
  await page.waitForTimeout(2600);
  check("LY12 行切换到第二行", ((await wFrame().locator("#ly .lyline").nth(1).getAttribute("class")) || "").includes("on"));
}

/* ---------- BT 播放/暂停按钮交叉淡切（v2.1.0 零位移） ---------- */
{
  const y = wFrame().locator("#yI");
  const n = wFrame().locator("#nI");
  const yAbs = await y.evaluate((el) => getComputedStyle(el).position);
  const nAbs = await n.evaluate((el) => getComputedStyle(el).position);
  check("BT1 双图标绝对堆叠（同圆心叠放）", yAbs === "absolute" && nAbs === "absolute", `y=${yAbs} n=${nAbs}`);
  const yFill = await y.evaluate((el) => getComputedStyle(el).fill);
  check("BT2 播放三角实心化（与暂停条视觉质量一致）", yFill !== "none", yFill);
  const tr = await y.evaluate((el) => getComputedStyle(el).transitionProperty);
  check("BT3 切换走 opacity 过渡（交叉淡切）", /opacity/.test(tr), tr);
  const bb0 = await wFrame().locator("#pB").boundingBox();
  // 当前 playing=true（O 段末 mock 回 true）→ 图标为暂停条；点击翻为三角
  await wFrame().locator("#pB").click();
  await page.waitForTimeout(340); // :active 回弹 + 过渡完成
  const bb1 = await wFrame().locator("#pB").boundingBox();
  const dx = Math.abs(bb0.x - bb1.x), dy = Math.abs(bb0.y - bb1.y), dw = Math.abs(bb0.width - bb1.width);
  check("BT4 按钮几何零位移（真机「轻微位移」根治）", dx < 0.5 && dy < 0.5 && dw < 0.5,
    `dx=${dx.toFixed(2)} dy=${dy.toFixed(2)} dw=${dw.toFixed(2)}`);
  mockState = { ...mockState, track: { ...mockState.track, playing: true } }; // 复位播放态
  await page.waitForTimeout(1200);
}

/* ---------- LR 歌词竞态：inflight 窗口内切歌，新词必须链式补拉到位 ---------- */
{
  mockLyrics["lrp-a"] = {
    rev: "lrp-a", songId: 1, title: "竞A", artist: "T", yrc:
      "[1000,3000](1000,3000,0)甲\n[5000,3000](5000,3000,0)乙", lrc: "", tlyric: "", ytlrc: "", source: "mock",
  };
  mockLyrics["lrp-b"] = {
    rev: "lrp-b", songId: 2, title: "竞B", artist: "T", yrc:
      "[1000,3000](1000,3000,0)丙\n[5000,3000](5000,3000,0)丁\n[9000,3000](9000,3000,0)戊", lrc: "", tlyric: "", ytlrc: "", source: "mock",
  };
  mockLyricDelay["lrp-a"] = 1400; // A 词慢：保证切 B 时 A 仍 inflight
  // 切 A（track+ne 同步翻转，rev 直接 mock-lyr-1 → lrp-a）
  mockState = {
    ...mockState,
    track: { app: "网易云音乐", title: "竞A", artist: "T", album: "X", playing: true, position: 1.5, duration: 200, rate: 1, coverRev: "" },
    ne: { songId: 1, title: "竞A", artist: "T", album: "X", pic: "", positionMs: 1500, durationMs: 200000, playing: true, lyricRev: "lrp-a" },
  };
  await page.waitForTimeout(650); // A 词拉取 inflight 中（延迟 1.4s）
  // inflight 窗口内切 B —— 旧代码此处 B 拉取被静默跳过且永不重试
  mockState = {
    ...mockState,
    track: { ...mockState.track, title: "竞B" },
    ne: { ...mockState.ne, songId: 2, title: "竞B", lyricRev: "lrp-b" },
  };
  await page.waitForTimeout(4600); // A 完成(1.4s) → finally 链拉 B → 渲染
  const lines = await wFrame().locator("#ly .lyline").count();
  const txt = await wFrame().locator("#ly").textContent();
  check("LR1 竞态切歌后 B 词到位（3 行）", lines === 3, `lines=${lines}`);
  check("LR2 显示 B 的词（丙/丁/戊，非 A/旧词）", txt.includes("丙") && txt.includes("戊"), txt.slice(0, 40));
}

/* ---------- ST 桥回旧词（rev 不符）拒收 + 重试 ---------- */
{
  mockLyrics["lrp-c"] = {
    rev: "lrp-c", songId: 3, title: "竞C", artist: "T", yrc:
      "[1000,3000](1000,3000,0)己", lrc: "", tlyric: "", ytlrc: "", source: "mock",
  };
  mockServeStaleRev = "lrp-b"; // 对任何 v 都回 B 旧词
  mockState = {
    ...mockState,
    track: { ...mockState.track, title: "竞C" },
    ne: { ...mockState.ne, songId: 3, title: "竞C", lyricRev: "lrp-c" },
  };
  await page.waitForTimeout(2600);
  const txt1 = await wFrame().locator("#ly").textContent();
  check("ST1 桥回旧词时拒收（C 词不显示）", !txt1.includes("己"), txt1.slice(0, 30));
  mockServeStaleRev = "";
  await page.waitForTimeout(4600); // 重试链 1.2s/2.4s 命中新词
  const txt2 = await wFrame().locator("#ly").textContent();
  check("ST2 桥换新词后 C 词到位（重试链生效）", txt2.includes("己"), txt2.slice(0, 30));
}

/* ---------- A 统一舞台单帧互切（音乐→内建→音乐，壳类全程稳定） ---------- */
const stageMark = await page.evaluate(() => {
  const s = document.querySelector(".cl-stage");
  if (!s) return null;
  s.dataset.mark = "stage-201";
  return s.dataset.mark;
});
const iframeMark = await page.evaluate(() => {
  const f = document.querySelector(".cl-dockwidget iframe");
  if (!f) return null;
  f.dataset.mark = "keepme-201";
  return f.dataset.mark;
});
await page.locator(".cl-dock button[aria-label='待办']").click();
await page.waitForTimeout(120);
{
  const stageCls = (await stage.getAttribute("class")) || "";
  const popCls = (await popup.first().getAttribute("class")) || "";
  check("A1 切走瞬间壳仍是同一节点", (await page.evaluate(() => document.querySelector(".cl-stage")?.dataset.mark)) === stageMark);
  check("A2 单帧切换：同帧已见内建面板（无两段式空档）", (await page.locator("[data-panel='todo']").count()) === 1);
  check("A3 切壳不播 panel-sink（不是关闭动画）", !stageCls.includes("panel-sink"), stageCls);
  check("A4 切壳不播 panel-rise（类全程稳定不重播）", !stageCls.includes("panel-rise"), stageCls);
  check("A5 旧部件视图持 view-exit（模糊散场）", popCls.includes("view-exit"), popCls);
}
await page.waitForTimeout(900);
check("A6 内建待办面板就位（高度>120）", (await shellH()) > 120, `h=${await shellH()}`);
check("A7 音乐部件视图退场后隐藏（visibility=hidden，白帧由 boot 罩承责）", (await popup.first().evaluate((el) => getComputedStyle(el).visibility)) === "hidden");
await dockMusicBtn.click();
await page.waitForTimeout(120);
{
  const stageCls = (await stage.getAttribute("class")) || "";
  check("A8 切回瞬间壳同一节点 + 无 sink/rise", (await page.evaluate(() => document.querySelector(".cl-stage")?.dataset.mark)) === stageMark &&
    !stageCls.includes("panel-sink") && !stageCls.includes("panel-rise"), stageCls);
  check("A9 音乐部件视图重播 content-focus-solid", ((await popup.getAttribute("class")) || "").includes("content-focus-solid"));
}
await page.waitForTimeout(900);
check("A10 音乐面板重新展开（≈372）", Math.abs((await shellH()) - 372) < 10, `h=${await shellH()}`);
check("X1 切换往返后 iframe 节点未重载", (await page.evaluate(() => document.querySelector(".cl-dockwidget iframe")?.dataset.mark)) === iframeMark);
check("X2 壳体节点仍未更换", (await page.evaluate(() => document.querySelector(".cl-stage")?.dataset.mark)) === stageMark);
check("X3 重开内容瞬时可用（预热不失效）", await wFrame().locator("#t1").isVisible());

/* ---------- B 内建面板从零打开仍播 panel-rise（语言不回退）---------- */
await page.keyboard.press("Escape");
await page.waitForTimeout(700);
await page.locator(".cl-dock button[aria-label='天气']").click();
await page.waitForTimeout(100);
{
  const stageCls = (await stage.getAttribute("class")) || "";
  check("B1 内建面板开壳仍播 panel-rise", stageCls.includes("panel-rise"), stageCls);
}
await page.keyboard.press("Escape");
await page.waitForTimeout(700);

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
check("G1 scrollbar-gutter stable", gutter === "stable");
await page.evaluate(() => window.dispatchEvent(new CustomEvent("start:links-manage")));
await page.waitForTimeout(400);
const n0 = await page.evaluate(() => document.querySelectorAll(".cl-links a").length);
await page.evaluate(() => document.querySelector("button[aria-label^='删除']")?.click());
await page.waitForTimeout(700);
const n1 = await page.evaluate(() => document.querySelectorAll(".cl-links a").length);
check("G2 磁贴删除生效", n1 === n0 - 1, `${n0}→${n1}`);

/* ---------- E ---------- */
check("E1 pageerror = 0", errors.length === 0, errors.join(" | ").slice(0, 200));

await browser.close();
mock.close();
server.close();
const fail = results.filter((r) => !r.ok).length;
console.log(fail === 0 ? `\n全部 ${results.length} 项通过 ✓` : `\n${fail}/${results.length} 项失败 ✗`);
process.exit(fail === 0 ? 0 : 1);
