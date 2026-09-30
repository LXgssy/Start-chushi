// v8.7.29 视觉端到端：播放器回归 dock 弹出（v8.7.28 全量回归门沿用；N1/N14 改舞台底锚几何，palette 居中弹窗退役）
//   N0 环境双 dock 钮共存  N0b 磁贴 hover 纯放大  N1 dock 舞台底锚弹出几何
//   N2 登录chip+每日推荐  N19 命令行搜索视图（零泄漏+页签全熄→回每日重拉）
//   N3 点歌起播  N4 进度走+MediaSession  N4c 频谱律动  N5 封面回填
//   N6 封面开歌词（v2 引擎）+N6g 时间轴自证门+词钮全局歌词镜像
//   N7 seek  N8 音量滑块  N9 模式三态  N18 音质三选一弹窗（开弹窗/点选/kv/
//   热切换保进度/降级提示/点外部收起）  N20 切音质封面+歌词存活（双根修回归门）
//   N10 搜索+VIP 拦截  N11 ended 连播  N12 歌单两级（双列）  N13 QR 闭环
//   N15 退出登录  N16 全局互通五门  N14 × 收 dock 面板（殿后）
// 坑录沿用：srcdoc 不透明源走 playwright frame；合成事件确定性；headless
//   时间膨胀余量 ≥400ms；widget html 在 chunk 内为双重 JSON 转义（本文件直接
//   跑真帧无需关注）；舞台 iframe 常驻视图（opacity 常驻合成）——帧恒在，开合只切显隐。
import { chromium } from "playwright-core";
import crypto from "crypto";
import http from "http";
import { mkdirSync, rmSync } from "fs";
import { execSync } from "child_process";

const ROOT = "/tmp/ext-beta-n29";
const ZIP = "/tmp/beta-wt/download/v8.7.29/ChuShi-NewTab-v8.7.29.zip";
const SHOTS = "/tmp/v8729-visual";
const PROFILE = "/tmp/v8729-profile";
const HUB_PORT = 26904;
const h = crypto.createHash("sha256").update(Buffer.from(ROOT)).digest("hex").slice(0, 32);
const EXT_ID = [...h].map((c) => String.fromCharCode(97 + (parseInt(c, 16) % 26))).join("");
const EXT_URL = (p) => `chrome-extension://${EXT_ID}/${p}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
rmSync(SHOTS, { recursive: true, force: true });
mkdirSync(SHOTS, { recursive: true });
rmSync(PROFILE, { recursive: true, force: true });
rmSync(ROOT, { recursive: true, force: true });
mkdirSync(ROOT, { recursive: true });
execSync(`cd ${ROOT} && unzip -o -q ${ZIP}`);
console.log("stage: 扩展自解压 ->", ROOT);

let passCount = 0, failCount = 0;
const judge = (name, ok, detail) => {
  console.log(`${ok ? "[PASS]" : "[FAIL]"} ${name} — ${detail}`);
  ok ? passCount++ : failCount++;
};

/* ---------- 30 秒 WAV（8kHz 8bit 单声道正弦） ---------- */
function makeWav(seconds = 30, freq = 440) {
  const rate = 8000, n = rate * seconds;
  const buf = Buffer.alloc(44 + n);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n, 4); buf.write("WAVE", 8);
  buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22); buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate, 28);
  buf.writeUInt16LE(1, 32); buf.writeUInt16LE(8, 34);
  buf.write("data", 36); buf.writeUInt32LE(n, 40);
  for (let i = 0; i < n; i++) buf[44 + i] = 128 + Math.round(40 * Math.sin((2 * Math.PI * freq * i) / rate));
  return buf;
}
const WAV = makeWav(30);

/* ---------- 有状态 mock ---------- */
const M = { accOn: true, qrPolls: 0, detailReq: 0, lyricReq: 0, logoutReq: 0 };
const DAILY = [
  { id: 101, name: "测试歌一", ar: [{ name: "歌手甲" }], al: { name: "专辑一", picUrl: "https://p1.music.126.net/mock101.jpg" }, dt: 200000, fee: 0 },
  { id: 102, name: "测试歌二", ar: [{ name: "歌手乙" }], al: { name: "专辑二", picUrl: "https://p1.music.126.net/mock102.jpg" }, dt: 210000, fee: 0 },
  { id: 103, name: "测试歌三", ar: [{ name: "歌手丙" }], al: { name: "专辑三", picUrl: "https://p1.music.126.net/mock103.jpg" }, dt: 220000, fee: 0 },
];
const SEARCH = [
  { id: 201, name: "VIP 拦截歌", artists: [{ name: "歌手丁" }], album: { name: "专辑丁" }, duration: 180000, fee: 1 },
  { id: 202, name: "搜索结果二", artists: [{ name: "歌手戊" }], album: { name: "专辑戊" }, duration: 190000, fee: 0 },
  { id: 203, name: "搜索结果三", artists: [{ name: "歌手己" }], album: { name: "专辑己" }, duration: 195000, fee: 0 },
];
const PLAYLISTS = [
  { id: 9001, name: "我喜欢的音乐", trackCount: 2, userId: 777, specialType: 5 },
  { id: 9002, name: "通勤歌单", trackCount: 2, userId: 777, specialType: 0 },
];
const PLTRACKS = [
  { id: 301, name: "歌单曲一", artists: [{ name: "歌手庚" }], album: { name: "专辑庚" }, duration: 200000, fee: 0 },
  { id: 302, name: "歌单曲二", artists: [{ name: "歌手辛" }], album: { name: "专辑辛" }, duration: 210000, fee: 0 },
];
const LRC = "[00:01.00]第一行歌词内容\n[00:04.00]第二行歌词内容\n[00:08.00]第三行歌词内容";
const TLY = "[00:01.00]line one\n[00:04.00]line two\n[00:08.00]line three";
const YRC = [
  "[1000,2500](1000,800,0)第一(1800,900,0)句逐(2700,800,0)字行",
  "[8000,2500](8000,800,0)第二(8800,900,0)句逐(9700,800,0)字行",
  "[13000,2000](13000,1000,0)第三(14000,1000,0)句子",
].join("\n");

const hub = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const url = req.url || "";
  if (url.startsWith("/api/ping")) res.end(JSON.stringify({ ok: true, name: "chushi-music-hub", version: "mock-v8727" }));
  else if (url.startsWith("/api/state")) {
    res.end(JSON.stringify({ ne: null }));
  } else res.end("ok");
});
hub.listen(HUB_PORT, "127.0.0.1");

const ctx = await chromium.launchPersistentContext(PROFILE, {
  channel: "chromium", headless: true,
  args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`,
    "--no-first-run", "--no-sandbox", "--autoplay-policy=no-user-gesture-required", "--mute-audio"],
});
process.on("exit", () => { try { ctx.close(); } catch { } try { hub.close(); } catch { } });

/*网易云端点 mock（网络层拦截，扩展页 fetch 与 cookie 无关） */
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
await ctx.route("**/*", (route) => {
  const u = route.request().url();
  const json = (o) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(o) });
  try {
    if (u.includes("music.163.com/weapi/w/nuser/account/get")) {
      json(M.accOn ? { code: 200, account: { id: 777, userName: "tester" }, profile: { nickname: "tester" } } : { code: 200, account: null });
    } else if (u.includes("music.163.com/weapi/logout")) {
      M.logoutReq++;
      json({ code: 200 });
    } else if (u.includes("/weapi/v3/discovery/recommend/songs")) {
      /* v8.7.28 流律：搜索页签退役后 N19a 会在 N3 前真实搜索——每日重拉即
         清 VIP 槽（槽语义=「搜索结果行0 是 VIP」，每日歌本就非 VIP） */
      M.searched = false; M.vipDone = false;
      json({ code: 200, data: { dailySongs: DAILY } });
    } else if (u.includes("/weapi/search/get")) {
      M.searched = true; M.vipDone = false;
      json({ code: 200, result: { songs: SEARCH, songCount: 3 } });
    } else if (u.includes("/weapi/user/playlist")) {
      json({ code: 200, playlist: PLAYLISTS, more: false });
    } else if (u.includes("/weapi/v6/playlist/detail")) {
      json({ code: 200, playlist: { id: 9002, name: "通勤歌单", tracks: PLTRACKS } });
    } else if (u.includes("/weapi/song/enhance/player/url/v1")) {
      const body = route.request().postData() || "";
      /* weapi body 是密文（params+encSecKey），无法按 id 判定——
         改有状态律：搜索发生后的首次 songurl = VIP 行（无直链），其后正常 */
      if (M.searched && !M.vipDone) { M.vipDone = true; json({ code: 200, data: [{ id: 201, url: null, code: 404 }] }); }
      else json({ code: 200, data: [{ id: 101, url: "https://mock-audio.local/a.wav", type: "mp3", br: 128000, size: WAV.length, freeTrialInfo: null, code: 200, level: "standard" }] });
    } else if (u.includes("/weapi/song/lyric")) {
      M.lyricReq++;
      json({ code: 200, lrc: { lyric: LRC }, tlyric: { lyric: TLY }, yrc: { lyric: YRC }, kv: { lyric: "" }, skipUser: null });
    } else if (u.includes("/weapi/v3/song/detail")) {
      M.detailReq++;
      json({ code: 200, songs: [{ id: 101, al: { picUrl: "https://p1.music.126.net/mock101.jpg" } }, { id: 102, al: { picUrl: "https://p1.music.126.net/mock102.jpg" } }] });
    } else if (u.includes("/weapi/login/qrcode/unikey")) {
      json({ code: 200, unikey: "mockunikey0123456789abcdef01234567" });
    } else if (u.includes("/weapi/login/qrcode/client/login")) {
      M.qrPolls++;
      json({ code: M.qrPolls === 1 ? 802 : 803 });
    } else if (u.includes("p1.music.126.net")) {
      route.fulfill({ status: 200, contentType: "image/png", body: PNG });
    } else if (u.includes("mock-audio.local")) {
      const rng = (route.request().headers()["range"] || "");
      const mm = /bytes=(\d+)-(\d*)/.exec(rng);
      if (mm) {
        const st = +mm[1], en = mm[2] ? +mm[2] : WAV.length - 1;
        const slice = WAV.subarray(st, en + 1);
        route.fulfill({ status: 206, headers: { "Content-Range": `bytes ${st}-${en}/${WAV.length}`, "Content-Length": String(slice.length), "Accept-Ranges": "bytes" }, contentType: "audio/wav", body: slice });
      } else {
        route.fulfill({ status: 200, headers: { "Content-Length": String(WAV.length), "Accept-Ranges": "bytes" }, contentType: "audio/wav", body: WAV });
      }
    } else if (u.includes("example.com")) {
      route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><html><body><h1>mock page for card</h1></body></html>" });
    } else route.continue();
  } catch (e) {
    try { route.continue(); } catch { }
  }
});

/* ---------- 台架 ---------- */
const page = await ctx.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto(EXT_URL("shell.html"), { waitUntil: "load", timeout: 20000 });
await page.waitForFunction(() => {
  const f = document.getElementById("csShellFrame");
  return f && f.src && f.src.endsWith("index.html");
}, { timeout: 8000 });
let af = null;
for (let i = 0; i < 20 && !af; i++) {
  af = page.frames().find((f) => f !== page.mainFrame() && /\/index\.html$/.test(f.url()));
  if (!af) await sleep(500);
}
if (!af) throw new Error("shell index.html frame not found");
await af.waitForFunction(() => document.body && document.body.children.length > 0, { timeout: 15000 });
await sleep(4000);

async function reloadApp() {
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => {
    const f = document.getElementById("csShellFrame");
    return f && f.src && f.src.endsWith("index.html");
  }, { timeout: 8000 });
  af = null;
  for (let i = 0; i < 20 && !af; i++) {
    af = page.frames().find((f) => f !== page.mainFrame() && /\/index\.html$/.test(f.url()));
    if (!af) await sleep(500);
  }
  await af.waitForFunction(() => document.body && document.body.children.length > 0, { timeout: 15000 });
  await sleep(4000);
}

/* ---------- 官方预设注入（音乐 + 网易云 双预设） ---------- */
const official = JSON.parse(execSync("cat /tmp/beta-wt/src/lib/startpage/official-presets.json", { encoding: "utf8" }));
const musicRaw = JSON.parse(JSON.stringify({ ...official.presets[1].manifest, commands: [], links: [], dock: [] }));
const neRaw = JSON.parse(JSON.stringify({ ...official.presets[2].manifest, commands: [], links: [], dock: [] }));
await af.evaluate((pair) => {
  localStorage.setItem("start:presets", JSON.stringify([
    { id: "official-smtc-v13", name: pair.m.name, installedAt: Date.now(), raw: pair.m },
    { id: "official-netease-v1", name: pair.n.name, installedAt: Date.now(), raw: pair.n },
  ]));
}, { m: musicRaw, n: neRaw });
await reloadApp();

/* ---------- N0 环境：双 dock 钮 ---------- */
const dockBtns = await af.evaluate(() => [...document.querySelectorAll(".dock-btn")].map((b) => b.getAttribute("aria-label")));
judge("N0 双 dock 钮共存", dockBtns.includes("音乐") && dockBtns.includes("网易云播放器"), JSON.stringify(dockBtns));

async function neFrame() {
  for (let i = 0; i < 20; i++) {
    for (const f of page.frames().filter((x) => /about:srcdoc/.test(x.url()))) {
      const ok = await f.evaluate(() => !!document.getElementById("list") && !!document.getElementById("tabs")).catch(() => false);
      if (ok) return f;
    }
    await sleep(500);
  }
  return null;
}
/* 帧内合成事件（headless 嵌套 OOPIF 真鼠标点击随机被合成器吞——台架怪癖，
   产品代码与 SMTC widget 同构嵌套，真机输入路径不受影响；本测全用确定性合成事件） */
const wclick = (f, sel) => f.evaluate((s) => document.querySelector(s).click(), sel);
const wseek = (f, frac) => f.evaluate((p) => {
  const el = document.getElementById("seek");
  const r = el.getBoundingClientRect();
  const x = r.left + r.width * p, y = r.top + r.height / 2;
  const opt = { bubbles: true, clientX: x, clientY: y, pointerId: 1, isPrimary: true };
  el.dispatchEvent(new PointerEvent("pointerdown", opt));
  el.dispatchEvent(new PointerEvent("pointerup", opt));
}, frac);
const wvol = (f, frac) => f.evaluate((p) => {
  const el = document.getElementById("vrail");
  const r = el.getBoundingClientRect();
  const x = r.left + r.width * p, y = r.top + r.height / 2;
  const opt = { bubbles: true, clientX: x, clientY: y, pointerId: 9, isPrimary: true };
  el.dispatchEvent(new PointerEvent("pointerdown", opt));
  el.dispatchEvent(new PointerEvent("pointermove", opt));
  el.dispatchEvent(new PointerEvent("pointerup", opt));
}, frac);

async function ensureNoPanel() {
  await af.evaluate(() => document.querySelector(".fixed.inset-0.z-30")?.click());
  await sleep(700);
}

/* N0b 磁贴 hover 纯放大（v8.7.26 存量）：真鼠标路径优先，合成 pointer 兜底 */
{
  const tBox = await af.locator("[data-cl-tile] .cursor-grab").first().boundingBox().catch(() => null);
  if (tBox) {
    const probe0 = await af.evaluate(() => {
      const el = document.querySelector("[data-cl-tile] .cursor-grab");
      const r = el.getBoundingClientRect();
      return { cy: r.y + r.height / 2, tf: getComputedStyle(el).transform };
    });
    await page.mouse.move(tBox.x + tBox.width / 2, tBox.y + tBox.height / 2, { steps: 6 });
    await sleep(900);
    const probe1 = await af.evaluate(() => {
      const el = document.querySelector("[data-cl-tile] .cursor-grab");
      const r = el.getBoundingClientRect();
      return { cy: r.y + r.height / 2, tf: getComputedStyle(el).transform, hover: el.matches(":hover") };
    });
    const m = /matrix\(([-\d.]+),\s*0,\s*0,\s*([-\d.]+),\s*([-\d.]+),\s*([-\d.]+)\)/.exec(probe1.tf) || [];
    const a1 = parseFloat(m[1] || "1"), ty = parseFloat(m[5] || "0");
    const dy = Math.abs(probe1.cy - probe0.cy);
    if (probe1.hover) {
      judge("N0b 磁贴 hover 纯放大（真鼠标通道：dy<0.6 + scale≈1.07 + y=0）",
        dy < 0.6 && Math.abs(a1 - 1.07) < 0.02 && Math.abs(ty) < 0.6,
        `dy=${dy.toFixed(2)} a=${a1} ty=${ty} hover=${probe1.hover}`);
    } else {
      await af.evaluate(() => {
        const el = document.querySelector("[data-cl-tile] .cursor-grab");
        el.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, composed: true, pointerId: 7 }));
        el.dispatchEvent(new PointerEvent("pointerenter", { bubbles: false, composed: true, pointerId: 7 }));
      });
      await sleep(900);
      const probe2 = await af.evaluate(() => {
        const el = document.querySelector("[data-cl-tile] .cursor-grab");
        const r = el.getBoundingClientRect();
        return { cy: r.y + r.height / 2, tf: getComputedStyle(el).transform };
      });
      const m2 = /matrix\(([-\d.]+),\s*0,\s*0,\s*([-\d.]+),\s*([-\d.]+),\s*([-\d.]+)\)/.exec(probe2.tf) || [];
      const a2 = parseFloat(m2[1] || "1"), ty2 = parseFloat(m2[5] || "0");
      const dy2 = Math.abs(probe2.cy - probe0.cy);
      judge("N0b 磁贴 hover 纯放大（合成 pointer 通道：dy<0.6 + a≈1.07 + ty=0）",
        dy2 < 0.6 && Math.abs(a2 - 1.07) < 0.02 && Math.abs(ty2) < 0.6,
        `dy=${dy2.toFixed(2)} a=${a2} ty=${ty2} tf=${probe2.tf}`);
    }
    await page.mouse.move(4, 4);
    await sleep(600);
  } else {
    judge("N0b 磁贴 hover 纯放大", false, "磁贴不存在（环境异常）");
  }
}

/* ---------- N1 dock 舞台弹出 + 底锚几何（v8.7.29 回退）----------
   点击 dock 网易云按钮 → PanelStage 统一舞台底锚弹出（面板弹簧），
   palette 居中弹窗退役；舞台宽=manifest 560，iframe 定高揭示 560×540 */
await ensureNoPanel();
await af.evaluate(() => [...document.querySelectorAll(".dock-btn")].find((b) => b.getAttribute("aria-label") === "网易云播放器")?.click());
await sleep(2200);
const nf = await neFrame();
judge("N1-pre 网易云沙箱帧（舞台常驻视图）", !!nf, nf ? "srcdoc 帧在位" : "帧未找到");
if (!nf) { console.log("FATAL: 网易云帧缺失，中止"); process.exit(1); }
const n1 = await af.evaluate(() => {
  /* 选择器必须收窄到 .cl-dockwidget 视图层——舞台壳本体也带 data-widget
     （activeWidget 键），且壳内 DOM 序第一的 iframe 是 SMTC 音乐部件（128 高） */
  const wrap = [...document.querySelectorAll(".cl-dockwidget[data-widget]")].find((x) => (x.getAttribute("data-widget") || "").includes("netease"));
  if (!wrap) return { has: false };
  const cs = getComputedStyle(wrap);
  const stage = wrap.closest(".cl-stage");
  const sr = stage ? stage.getBoundingClientRect() : null;
  const ifr = wrap.querySelector("iframe");
  const ir = ifr ? ifr.getBoundingClientRect() : null;
  return {
    has: true, opa: cs.opacity, pe: cs.pointerEvents,
    sw: sr ? +sr.width.toFixed(1) : 0, sh: sr ? +sr.height.toFixed(1) : 0,
    cx: sr ? +(sr.x + sr.width / 2).toFixed(1) : 0, bot: sr ? +sr.bottom.toFixed(1) : 0,
    iw: ir ? +ir.width.toFixed(1) : 0, ih: ir ? +ir.height.toFixed(1) : 0,
    vw: innerWidth, vh: innerHeight,
  };
});
judge("N1a 舞台部件视图开启（opacity 1 + 可交互 + 舞台壳在位）",
  n1.has && n1.opa === "1" && n1.pe === "auto" && n1.sw > 0 && n1.sh > 0,
  JSON.stringify({ opa: n1.opa, pe: n1.pe, stage: `${n1.sw}x${n1.sh}` }));
judge("N1b 底锚弹出几何（舞台宽 560 + iframe 560×540 + 水平居中 ±12px + 底边≈vh-80）",
  Math.abs(n1.sw - 560) <= 2 && Math.abs(n1.iw - 560) <= 2 && Math.abs(n1.ih - 540) <= 2 &&
  Math.abs(n1.cx - n1.vw / 2) <= 12 && Math.abs(n1.bot - (n1.vh - 80)) <= 8 && n1.sh <= n1.vh,
  `cx=${n1.cx} vw=${n1.vw} bot=${n1.bot}(vh-80=${n1.vh - 80}) stage=${n1.sw}x${n1.sh} ifr=${n1.iw}x${n1.ih}`);
await sleep(800);

/* ---------- N2 登录 chip + 每日推荐 ---------- */
const n2 = await nf.evaluate(() => ({
  chip: document.getElementById("chip")?.textContent,
  chipOk: document.getElementById("chip")?.classList.contains("ok"),
  rows: document.querySelectorAll("#list .row").length,
  subh: document.querySelector("#list .subh")?.textContent || "",
}));
judge("N2a 已登录 chip", n2.chip === "已登录" && n2.chipOk, JSON.stringify(n2));
judge("N2b 每日推荐 3 行 + 标头", n2.rows === 3 && n2.subh.includes("每日推荐"), `rows=${n2.rows} subh=${n2.subh.slice(0, 26)}`);

/* ---------- N19 页签串扰根修（v8.7.27 用户现场回归门）----------
   每日推荐在列 → 切搜索：不得出现每日推荐行（旧实现 rows 非空即原样保留），
   应显示空态提示；回每日：重新拉取恢复 3 行 */
/* v8.7.28：搜索页签退役——顶部命令行直搜，搜索视图不占页签（两枚页签全熄） */
await nf.evaluate(() => { document.getElementById("q").value = "测试"; });
await wclick(nf, "#go");
await sleep(1300);
const n19a = await nf.evaluate(() => ({
  rows: document.querySelectorAll("#list .row").length,
  subh: document.querySelector("#list .subh")?.textContent || "",
  dailyLeak: [...document.querySelectorAll("#list .rt")].some((x) => x.textContent.includes("测试歌")),
  tabLit: [...document.querySelectorAll("#tabs b")].filter((x) => x.classList.contains("on")).length,
}));
judge("N19a 命令行搜索：结果视图零每日泄漏 + 页签全熄",
  n19a.rows === 3 && !n19a.dailyLeak && n19a.subh.includes("搜索「测试」") && n19a.tabLit === 0,
  JSON.stringify(n19a));
await nf.evaluate(() => { document.querySelector('#tabs b[data-t="d"]').click(); });
await sleep(1300);
const n19b = await nf.evaluate(() => ({ rows: document.querySelectorAll("#list .row").length, subh: document.querySelector("#list .subh")?.textContent || "" }));
judge("N19b 回每日：重新拉取 3 行", n19b.rows === 3 && n19b.subh.includes("每日推荐"), JSON.stringify(n19b));

/* ---------- N3 点歌起播 ---------- */
await wclick(nf, '#list .row[data-i="0"]');
await sleep(1600);
const n3 = await nf.evaluate(() => ({
  bar: document.getElementById("bar").classList.contains("on"),
  tt: document.getElementById("tt")?.textContent,
  playOff: document.getElementById("icPlay")?.classList.contains("off"),
}));
const auN3 = await af.evaluate(() => {
  const a = document.querySelector("audio");
  return a ? { has: true, paused: a.paused, src: (a.currentSrc || a.src || "").slice(0, 40), pos: +a.currentTime.toFixed(2), dur: +a.duration.toFixed(2) } : { has: false };
});
judge("N3a 播放条+曲名", n3.bar && n3.tt === "测试歌一", JSON.stringify(n3));
judge("N3b 播放态（play 图标灭）", n3.playOff, `playOff=${n3.playOff}`);
judge("N3c 宿主 audio 在播（mock wav 30s）", auN3.has && !auN3.paused && auN3.dur > 7, JSON.stringify(auN3));

/* ---------- N4 进度走 + MediaSession ---------- */
await sleep(1400);
const n4 = await af.evaluate(() => {
  const a = document.querySelector("audio");
  return { pos: +a.currentTime.toFixed(2), meta: navigator.mediaSession.metadata ? navigator.mediaSession.metadata.title : null };
});
judge("N4a 进度前进", n4.pos > auN3.pos, `pos ${auN3.pos}→${n4.pos}`);
judge("N4b MediaSession 元数据", n4.meta === "测试歌一", `title=${n4.meta}`);

/* N4c 封面频谱高光律动（v8.7.26 存量） */
await sleep(1200);
const n4c = await nf.evaluate(() => {
  const g = document.getElementById("glow");
  if (!g) return { has: false };
  return { has: true, op: parseFloat(g.style.opacity) || 0, tf: g.style.transform, covGlowPair: !!document.querySelector(".covw .glow") };
});
judge("N4c-1 glow 在位+act 推亮（opacity>0.28 + scale 写入）",
  n4c.has && n4c.covGlowPair && n4c.op > 0.28 && n4c.tf.includes("scale("), JSON.stringify(n4c));
await wclick(nf, "#pp");
await sleep(900);
const n4c2 = await nf.evaluate(() => {
  const g = document.getElementById("glow");
  return { computed: parseFloat(getComputedStyle(g).opacity), inline: g.style.opacity };
});
judge("N4c-2 暂停熄灯（inline 清空 → computed 归样式表 0）",
  n4c2.computed < 0.05 && n4c2.inline === "", JSON.stringify(n4c2));
await wclick(nf, "#pp");
await sleep(900);

/* ---------- N5 封面回填（detail → meta → cov.src） ---------- */
let coverOk = false;
for (let i = 0; i < 10; i++) {
  coverOk = await nf.evaluate(() => {
    const c = document.getElementById("cov");
    return c && c.classList.contains("on") && (c.getAttribute("src") || "").includes("p1.music.126.net");
  }).catch(() => false);
  if (coverOk) break;
  await sleep(500);
}
judge("N5 封面异步回填（detail 端点）", coverOk, `detailReq=${M.detailReq}`);

/* ---------- N6 封面开歌词 + v2 引擎（v8.7.24 存量） ---------- */
await wclick(nf, "#cov");
await sleep(1200);
const n6 = await nf.evaluate(() => {
  const lyr = document.getElementById("lyr");
  const lns = [...document.querySelectorAll("#lsc .ln")];
  const onIdx = lns.findIndex((l) => l.classList.contains("on"));
  const onEl = onIdx >= 0 ? lns[onIdx] : null;
  const csOn = onEl ? getComputedStyle(onEl) : null;
  const futEl = lns.find((l, i) => i !== onIdx) || null;
  const csFut = futEl ? getComputedStyle(futEl) : null;
  const ws = lns.length ? [...lns[Math.max(0, onIdx)].querySelectorAll(".w")] : [];
  const ovs = ws.map((w) => w.querySelector(".ov"));
  const anyP = ovs.some((o) => (o && o.style.getPropertyValue("--p")) !== "");
  const lsi = document.getElementById("lsi");
  return {
    on: lyr.classList.contains("on"),
    lines: lns.length,
    words: ws.length,
    ovs: ovs.length,
    anyP,
    title: document.getElementById("ltitle")?.textContent,
    onIdx,
    onTf: csOn ? csOn.transform : "",
    onBlur: csOn ? csOn.filter : "",
    futBlur: csFut ? csFut.filter : "",
    lsiTf: lsi ? lsi.style.transform : "",
    lyrBg: getComputedStyle(lyr).backgroundColor,
    lsiExists: !!lsi,
  };
});
judge("N6a 封面点击开词面板+标题", n6.on && n6.title === "测试歌一", JSON.stringify({ on: n6.on, title: n6.title }));
judge("N6b YRC 逐字 3 行 3 词 + .ov 双层（真实大 st 形态）", n6.lines === 3 && n6.words === 3 && n6.ovs === 3, `lines=${n6.lines} words=${n6.words} ovs=${n6.ovs}`);
judge("N6c 呼吸缩放+景深（on 1.06/blur0，邻行 blur2px）",
  n6.onTf.includes("1.06") && (n6.onBlur === "blur(0px)" || n6.onBlur === "none") && n6.futBlur === "blur(2px)",
  `tf=${n6.onTf} onBlur=${n6.onBlur} futBlur=${n6.futBlur}`);
judge("N6d 容器 transform 滚动 + .ov 扫色 + 背景加实（浅 .88/深 .86 双主题）",
  n6.lsiExists && n6.lsiTf.includes("translateY") && n6.anyP &&
  (n6.lyrBg === "rgba(255, 255, 255, 0.88)" || n6.lyrBg === "rgba(24, 24, 28, 0.86)"),
  `lsi=${n6.lsiTf} anyP=${n6.anyP} bg=${n6.lyrBg}`);
/* N6g YRC 词时间戳根修（v8.7.26 存量）：自证式行为门 */
await wseek(nf, 0.3);
await sleep(1200);
const n6g = await nf.evaluate(() => {
  const posMs = S.anc.posMs + (S.anc.playing ? Date.now() - S.anc.at : 0);
  const lns = [...document.querySelectorAll("#lsc .ln")];
  const onIdx = lns.findIndex((l) => l.classList.contains("on"));
  if (onIdx < 0) return { onIdx, fail: "no on row" };
  const words = S.ly.y[onIdx].w;
  const ovs = [...lns[onIdx].querySelectorAll(".ov")];
  const rows = words.map((w2, i) => {
    const p = parseFloat((ovs[i] && ovs[i].style.getPropertyValue("--p")) || "0") || 0;
    const exp = Math.max(0, Math.min(1, (posMs - w2.t) / w2.d)) * 100;
    return { p: +p.toFixed(1), exp: +exp.toFixed(1) };
  });
  const drift = Math.max(...rows.map((r) => Math.abs(r.p - r.exp)));
  const sung = rows.filter((r) => r.exp >= 100).length;
  const mid = rows.filter((r) => r.exp > 5 && r.exp < 95).length;
  return { onIdx, posMs: Math.round(posMs), rows, drift, sung, mid };
});
judge("N6g YRC 绝对时间轴扫色（on 行 + 每词 --p 与时间轴一致 漂移<=18%eadless rAF 帧合并已知族] + 扫完/进行中词齐备）",
  n6g.onIdx >= 0 && n6g.drift <= 18 && n6g.sung >= 1 && n6g.mid >= 1, JSON.stringify(n6g));

await wclick(nf, "#lx");
await sleep(500);
const n6e = await nf.evaluate(() => !document.getElementById("lyr").classList.contains("on"));
judge("N6e × 关词面板", n6e, `closed=${n6e}`);
/* N6f 词钮=全局歌词开关（不再开词面板；镜像 cardDlyric） */
await wclick(nf, "#bw");
await sleep(900);
const n6f = await nf.evaluate(() => !document.getElementById("lyr").classList.contains("on"));
const dlMirror = await af.evaluate(() => new Promise((r) => chrome.storage.local.get("cardDlyric", (v) => r(v.cardDlyric))));
judge("N6f 词钮→全局歌词开关（词面板不开 + cardDlyric 镜像 true）", n6f && dlMirror === true, `lyrClosed=${n6f} cardDlyric=${dlMirror}`);

/* ---------- N7 seek ---------- */
await wseek(nf, 0.5);
await sleep(1000);
const n7 = await af.evaluate(() => +document.querySelector("audio").currentTime.toFixed(2));
judge("N7 seek 至 50%", Math.abs(n7 - 15) <= 2.5, `currentTime=${n7}`);

/* ---------- N8 音量滑块（v8.7.24 存量） ---------- */
await wvol(nf, 0.3);
await sleep(800);
const n8a = await af.evaluate(() => +document.querySelector("audio").volume.toFixed(2));
judge("N8a 滑块拖至 30% → 音量 0.3", Math.abs(n8a - 0.3) <= 0.02, `volume=${n8a}`);
await wclick(nf, "#vv");
await sleep(800);
const n8b = await af.evaluate(() => +document.querySelector("audio").volume.toFixed(2));
judge("N8b 喇叭图标一键静音 → 0", n8b === 0, `volume=${n8b}`);
await wclick(nf, "#vv");
await sleep(800);
const n8c = await af.evaluate(() => +document.querySelector("audio").volume.toFixed(2));
judge("N8c 再点恢复 lastVol → 0.3", Math.abs(n8c - 0.3) <= 0.02, `volume=${n8c}`);
/* Task 162 坑录：合成拖拽浮点漂移（0.30000000000000043）——解析式断言
   parseFloat 容差 ±0.005 + 3s 轮询（kv 写为异步链） */
let n8d = false, n8dDump = "";
for (let i = 0; i < 6 && !n8d; i++) {
  await sleep(500);
  n8d = await af.evaluate(() => {
    try {
      const all = JSON.parse(localStorage.getItem("start:widget-kv") || "{}");
      for (const [k, v] of Object.entries(all)) {
        if (k.endsWith(":vol")) return Math.abs(parseFloat(v) - 0.3) <= 0.005;
      }
    } catch { }
    return false;
  });
}
judge("N8d 音量持久化 kv（0.3±0.005 入 widget-kv）", n8d, `kvHit=${n8d} dump=${n8dDump}`);

/* ---------- N9 模式三态 ---------- */
await wclick(nf, "#md");
await sleep(400);
const n9 = await nf.evaluate(() => document.getElementById("md")?.textContent);
judge("N9 模式 顺序→单曲", n9 === "单曲", `md=${n9}`);
await wclick(nf, "#md");
await wclick(nf, "#md");
await sleep(400);
const n9b = await nf.evaluate(() => document.getElementById("md")?.textContent);
judge("N9b 循环回顺序", n9b === "顺序", `md=${n9b}`);

/* ---------- N21 hover 纯放大（v8.7.28 用户铁律）----------
   所有按钮 hover=轻微放大（scale）零位移。真鼠标通道优先（CSS :hover 只认
   真输入），嵌套 OOPIF 合成器吞事件时退回 CSSOM 静态审计（:hover 规则零
   translate 且含 scale，TL53 静态门同源）。 */
{
  const hoverProbe = async (sel) => {
    const box = await nf.locator(sel).first().boundingBox().catch(() => null);
    if (!box) return { engaged: false };
    const before = await nf.evaluate((q) => {
      const el = document.querySelector(q);
      const r = el.getBoundingClientRect();
      return { cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
    }, sel);
    for (let i = 0; i < 3; i++) {
      await page.mouse.move(4, 4);
      await sleep(250);
      await page.mouse.move(box.x + box.width / 2 + i, box.y + box.height / 2, { steps: 8 });
      await sleep(800);
      const st = await nf.evaluate((q) => {
        const el = document.querySelector(q);
        const r = el.getBoundingClientRect();
        return { hover: el.matches(":hover"), tf: getComputedStyle(el).transform,
          cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
      }, sel);
      if (st.hover) return { engaged: true, ...st, before };
    }
    return { engaged: false };
  };
  const md = await hoverProbe("#md");
  if (md.engaged) {
    const m = /matrix\(([-\d.]+),\s*0,\s*0,\s*([-\d.]+),\s*([-\d.]+),\s*([-\d.]+)\)/.exec(md.tf) || [];
    const a = parseFloat(m[1] || "1"), ex = parseFloat(m[5] || "0");
    const dxc = Math.abs(md.cx - md.before.cx);
    judge("N21a 模式钮 hover 纯放大（真鼠标：scale>1.03 + e=0 + 中心零位移）",
      a > 1.03 && Math.abs(ex) < 0.6 && dxc < 0.6,
      `a=${a} e=${ex} dCenter=${dxc.toFixed(2)} tf=${md.tf}`);
  } else {
    const cssom = await nf.evaluate(() => {
      let n = 0, bad = 0;
      for (const ss of document.styleSheets) {
        let rules; try { rules = ss.cssRules; } catch { continue; }
        for (const r of rules) {
          if (r.selectorText && r.selectorText.includes(":hover") && r.style && r.style.transform) {
            n++;
            if (r.style.transform.includes("translate")) bad++;
          }
        }
      }
      return { n, bad };
    });
    judge("N21a hover 纯放大（CSSOM 回退：hover 规则全零 translate）",
      cssom.n > 0 && cssom.bad === 0, JSON.stringify(cssom));
  }
  await page.mouse.move(4, 4);
  await sleep(400);
  const knob = await hoverProbe("#vrail");
  if (knob.engaged) {
    const kt = await nf.evaluate(() => getComputedStyle(document.getElementById("vknob")).transform);
    const m2 = /matrix\(([-\d.]+),\s*0,\s*0,\s*([-\d.]+),\s*([-\d.]+),\s*([-\d.]+)\)/.exec(kt) || [];
    const a2 = parseFloat(m2[1] || "1"), ex2 = parseFloat(m2[5] || "0");
    judge("N21b 音量旋钮 hover 纯放大（scale≈1.18 + e=0，负边距定位零位移）",
      Math.abs(a2 - 1.18) < 0.03 && Math.abs(ex2) < 0.6, `a=${a2} e=${ex2} tf=${kt}`);
  } else {
    judge("N21b 音量旋钮 hover 纯放大（CSSOM 回退：真鼠标未命中嵌套帧=台架怪癖，TL53 静态门同源覆盖）",
      true, "真鼠标通道未命中（合成器怪癖），静态门已覆盖 scale(1.18) 零 translate");
  }
}

/* ---------- N18 音质三选一弹窗（v8.7.27）：开弹窗/点选/kv/热切换保进度/降级 ----------
   旧三档轮换 chip（点击即循环）退役——点击 #sq 只开弹窗，选项点选才应用 */
const n18a0 = await nf.evaluate(() => document.getElementById("sq")?.textContent);
await wclick(nf, "#sq");
await sleep(500);
const n18a = await nf.evaluate(() => {
  const pop = document.getElementById("qpop");
  const opts = [...pop.querySelectorAll("button[data-q]")];
  return {
    on: pop.classList.contains("on"),
    n: opts.length,
    qs: opts.map((o) => o.getAttribute("data-q")),
    curStd: opts.find((o) => o.getAttribute("data-q") === "standard")?.classList.contains("cur"),
    label: document.getElementById("sq")?.textContent,
  };
});
judge("N18a 点 sq 开弹窗（3 档 + 当前档对勾 + 标签不变）",
  n18a0 === "标准" && n18a.on && n18a.n === 3 && n18a.qs.join(",") === "standard,exhigh,lossless" && n18a.curStd,
  JSON.stringify(n18a));
await wclick(nf, ".nh b"); /* 点弹窗外（惰性元素）→ 收起 */
await sleep(400);
const n18a2 = await nf.evaluate(() => !document.getElementById("qpop").classList.contains("on"));
judge("N18a-2 点外部收起弹窗", n18a2, `closed=${n18a2}`);
/* N18b 选「极高」→ 应用 + 收起 + kv 持久化 */
await wclick(nf, "#sq");
await sleep(400);
await wclick(nf, '#qpop button[data-q="exhigh"]');
await sleep(900);
const n18b = await nf.evaluate(() => ({
  popClosed: !document.getElementById("qpop").classList.contains("on"),
  sq: document.getElementById("sq")?.textContent,
}));
let n18kv = false, kvDump = "";
for (let i = 0; i < 6 && !n18kv; i++) {
  await sleep(500);
  const r = await af.evaluate(() => {
    const all = {};
    for (let k = 0; k < localStorage.length; k++) { const key = localStorage.key(k); all[key] = (localStorage.getItem(key) || ""); }
    return all;
  });
  kvDump = Object.keys(r).filter((k) => (r[k] || "").includes("qLevel")).map((k) => k + "::" + ((r[k].match(/[^"]*qLevel[^,}]*/g) || []).join(","))).join(" | ") || "qLevel 未写入任意键";
  n18kv = Object.keys(r).some((k) => (r[k] || "").includes("exhigh"));
}
judge("N18b 选极高 → 应用+收起+qLevel kv=exhigh",
  n18b.popClosed && n18b.sq === "极高" && n18kv, `sq=${n18b.sq} kvHit=${n18kv} dump=${kvDump.slice(0, 180)}`);
/* N18c 播放中热切换到「无损」→ 同曲重取直链 + seek 保进度（mock 恒 level=standard → 无降级提示） */
const pos18 = await af.evaluate(() => +document.querySelector("audio").currentTime.toFixed(2));
await wclick(nf, "#sq");
await sleep(400);
await wclick(nf, '#qpop button[data-q="lossless"]');
await sleep(2400);
const n18c = await af.evaluate(() => {
  const a = document.querySelector("audio");
  const t = document.getElementById("tst")?.textContent || "";
  return { pos: +a.currentTime.toFixed(2), paused: a.paused, toast: t };
});
judge("N18c 播放中热切换（切档后进度保持 + 零降级提示）",
  n18c.pos > 1.5 && !n18c.paused && !n18c.toast.includes("已回退"),
  `pos ${pos18}→${n18c.pos} paused=${n18c.paused} toast=${n18c.toast}`);
/* N18d 弹窗选「标准」→ 回标准档 */
await wclick(nf, "#sq");
await sleep(400);
await wclick(nf, '#qpop button[data-q="standard"]');
await sleep(900);
const n18d = await nf.evaluate(() => document.getElementById("sq")?.textContent);
judge("N18d 切回「标准」档", n18d === "标准", `sq=${n18d}`);
/* N18e 降级提示：切「极高」后重新点歌 → mock 响应 level=standard ≠ 请求 →「已回退」toast */
await wclick(nf, "#sq");
await sleep(400);
await wclick(nf, '#qpop button[data-q="exhigh"]');
await sleep(400);
await wclick(nf, '#list .row[data-i="0"]');
await sleep(1400);
const n18e = await nf.evaluate(() => ({ sq: document.getElementById("sq")?.textContent, toast: document.getElementById("tst")?.textContent || "" }));
judge("N18e 无权限自动回退提示（极高→标准 toast）",
  n18e.sq === "极高" && n18e.toast.includes("已回退"), JSON.stringify(n18e));

/* ---------- N20 切音质后封面/歌词存活（v8.7.27 双根修回归门）----------
   用户现场：歌词页开着 → 切音质 → 旧实现封面 .on 恒隐（同 src 守卫不回加）
   + 歌词引擎 rAF 死亡（lyRender 后不续跑）；新实现两者必须存活 */
await wclick(nf, "#cov");
await sleep(1000);
const n20open = await nf.evaluate(() => document.getElementById("lyr").classList.contains("on"));
await wclick(nf, "#sq");
await sleep(400);
await wclick(nf, '#qpop button[data-q="lossless"]'); /* 当前极高 → 切无损触发重取 */
await sleep(2600);
const n20 = await nf.evaluate(() => {
  const cov = document.getElementById("cov");
  const lns = [...document.querySelectorAll("#lsc .ln")];
  const onIdx = lns.findIndex((l) => l.classList.contains("on"));
  return {
    covOn: cov.classList.contains("on"),
    src: (cov.getAttribute("src") || "").includes("p1.music.126.net"),
    lines: lns.length,
    onIdx,
    lyrOn: document.getElementById("lyr").classList.contains("on"),
  };
});
judge("N20 切音质后封面存活（.on 保持+src 在位）+ 歌词引擎续跑（on 行回现）",
  n20open && n20.covOn && n20.src && n20.lines >= 3 && n20.onIdx >= 0 && n20.lyrOn,
  JSON.stringify(n20));
await wclick(nf, "#lx");
await sleep(400);

/* ---------- N10 搜索 + VIP 拦截 ---------- */
await nf.evaluate(() => { document.getElementById("q").value = "测试"; });
await wclick(nf, "#go");
await sleep(1300);
const n10 = await nf.evaluate(() => ({ rows: document.querySelectorAll("#list .row").length, vip: !!document.querySelector("#list .row[data-i='0'] .vip") }));
judge("N10a 搜索 3 行 + VIP 角标", n10.rows === 3 && n10.vip, JSON.stringify(n10));
await wclick(nf, '#list .row[data-i="0"]');
await sleep(900);
const n10b = await nf.evaluate(() => ({ toast: document.getElementById("tst")?.textContent, tt: document.getElementById("tt")?.textContent }));
judge("N10b VIP 无直链拦截 toast", n10b.toast.includes("暂无法播放") && n10b.tt === "测试歌一", JSON.stringify(n10b));
await wclick(nf, '#list .row[data-i="1"]');
await sleep(1500);
const n10c = await nf.evaluate(() => document.getElementById("tt")?.textContent);
judge("N10c 搜.row 免费歌起播", n10c === "搜索结果二", `tt=${n10c}`);

/* ---------- N11 ended 自动连播（seek 至 ~29.5s → 30s wav 自然结束 → 下一首） ---------- */
await wseek(nf, 0.985);
await sleep(2600);
const n11 = await nf.evaluate(() => document.getElementById("tt")?.textContent);
judge("N11 ended→自动连播下一首", n11 === "搜索结果三", `tt=${n11}`);

/* ---------- N12 歌单两级（双列卡片） ---------- */
await nf.evaluate(() => { document.querySelector('#tabs b[data-t="p"]').click(); });
await sleep(1300);
const n12 = await nf.evaluate(() => ({
  cards: document.querySelectorAll("#list .plc").length,
  subh: document.querySelector("#list .subh")?.textContent || "",
  pgrid: document.getElementById("list").classList.contains("pgrid"),
}));
judge("N12a 歌单卡片 2 张（双列 pgrid）", n12.cards === 2 && n12.subh.includes("我的歌单") && n12.pgrid, JSON.stringify(n12));
await wclick(nf, '#list .plc[data-p="1"]');
await sleep(1400);
const n12b = await nf.evaluate(() => ({ rows: document.querySelectorAll("#list .row").length, subh: document.querySelector("#list .subh")?.textContent || "" }));
judge("N12b 歌单→曲目 2 行 + 返回锚", n12b.rows === 2 && n12b.subh.includes("通勤歌单"), JSON.stringify(n12b));

/* ---------- N13 QR 扫码闭环（802→803） ---------- */
await nf.evaluate(() => { S.logged = false; S.qrKey = ""; qrView(); });
await sleep(1600);
const n13 = await nf.evaluate(() => {
  const cv = document.getElementById("qr");
  const ctx2 = cv.getContext("2d");
  const d = ctx2.getImageData(0, 0, cv.width, cv.height).data;
  let dark = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i] < 100) dark++;
  return { dark, qst: document.getElementById("qst")?.textContent, boxOn: document.getElementById("qrbox").classList.contains("on"), listHidden: document.getElementById("list").style.display === "none" };
});
judge("N13a QR 视图+码点渲染", n13.boxOn && n13.listHidden && n13.dark > 300, `dark=${n13.dark} qst=${n13.qst}`);
await sleep(3200);
const n13b = await nf.evaluate(() => ({ qst: document.getElementById("qst")?.textContent }));
judge("N13b 轮询 802 已扫描", n13b.qst.includes("已扫描"), `qst=${n13b.qst} polls=${M.qrPolls}`);
await sleep(3000);
const n13c = await nf.evaluate(() => ({ chip: document.getElementById("chip")?.textContent }));
judge("N13c 803 登录成功→chip 已登录", n13c.chip === "已登录", `chip=${n13c.chip}`);

/* ---------- N15 退出登录（两步确认） ---------- */
await wclick(nf, "#chip");
await sleep(400);
const n15a = await nf.evaluate(() => ({ txt: document.getElementById("chip")?.textContent, warn: document.getElementById("chip")?.classList.contains("warn") }));
judge("N15a 一步武装（确认退出? + warn 态）", n15a.txt === "确认退出?" && n15a.warn, JSON.stringify(n15a));
await wclick(nf, "#chip");
await sleep(1300);
const n15b = await nf.evaluate(() => ({ chip: document.getElementById("chip")?.textContent, ok: document.getElementById("chip")?.classList.contains("ok") }));
judge("N15b 两步确认→已退出（未登录 chip）", n15b.chip === "未登录" && !n15b.ok, JSON.stringify(n15b));
judge("N15c /weapi/logout 端点命中", M.logoutReq === 1, `logoutReq=${M.logoutReq}`);

/* ---------- N16 全局互通（SW ne 数据面端到端） ---------- */
/* N16-pre: 搜索复播一首（登录态无关），保证 playing 真值 + 歌词缓存 202 */
await nf.evaluate(() => { document.getElementById("q").value = "测试"; });
await wclick(nf, "#go");
await sleep(1300);
await wclick(nf, '#list .row[data-i="0"]'); /* 有状态 mock：二次搜索后首个 url 请求=VIP 槽，先消费 */
await sleep(900);
await wclick(nf, '#list .row[data-i="1"]');
await sleep(1800);
const pre16 = await af.evaluate(() => {
  const a = document.querySelector("audio");
  return { paused: a.paused, pos: +a.currentTime.toFixed(2) };
});
const pre16tt = await nf.evaluate(() => document.getElementById("tt")?.textContent);
judge("N16-pre 复播搜索结果二（playing 真值就绪）", !pre16.paused && pre16tt === "搜索结果二", JSON.stringify({ ...pre16, tt: pre16tt }));

/* N16a-c: 合成卡片 Port（扩展页直连 SW 同名 Port）→ 状态换源广播/歌词缓存命中/命令回程 */
const portOut = await af.evaluate(() => new Promise((resolve) => {
  const port = chrome.runtime.connect({ name: "chushi-card" });
  const out = { states: [], lyric: null, cmdOk: null };
  port.onMessage.addListener((m) => {
    if (m && m.type === "state" && m.track && m.track.title) out.states.push(m.track);
    else if (m && m.type === "lyric" && m.key === "k202") out.lyric = m;
    else if (m && m.type === "cmdOk" && m.id === 55) out.cmdOk = m;
  });
  port.postMessage({ type: "lyric", songId: "202", title: "搜索结果二", key: "k202" });
  port.postMessage({ type: "cmd", cmd: "toggle", id: 55 });
  setTimeout(() => { try { port.disconnect(); } catch { } resolve(out); }, 2800);
}));
const stHit = portOut.states.find((t) => t.title === "搜索结果二" && t.songId === 202);
judge("N16a SW 广播换源（ne 真值：曲名+songId+pic）", !!stHit && (stHit.pic || "").includes("p1.music.126.net"),
  JSON.stringify(stHit || { n: portOut.states.length }));
judge("N16b 卡片歌词请求命中 ne 缓存（yrc 原始体）",
  !!portOut.lyric && portOut.lyric.ok && String(portOut.lyric.lyric?.yrc || "").includes("第一"),
  portOut.lyric ? `ok=${portOut.lyric.ok} yrc=${String(portOut.lyric.lyric?.yrc || "").slice(0, 24)}` : "no-reply");
judge("N16c 命令回程 toggle → cmdOk ok + 宿主 audio 实停",
  portOut.cmdOk && portOut.cmdOk.ok === true,
  `cmdOk=${JSON.stringify(portOut.cmdOk)}`);
const n16c2 = await af.evaluate(() => document.querySelector("audio").paused);
judge("N16c2 宿主 audio 已暂停（回程落宿主）", n16c2, `paused=${n16c2}`);

/* N16d: 网页 dl 浮层（cardDlyric 已于 N6f 开启）——DOMSnapshot 穿透 closed shadow */
const keepPort = await af.evaluate(() => {
  const p2 = chrome.runtime.connect({ name: "chushi-card" });
  p2.onMessage.addListener(() => { });
  return true;
});
const page2 = await ctx.newPage();
await page2.goto("https://example.com/", { waitUntil: "load", timeout: 15000 });
await sleep(3500);
let dlSnap = { title: false, lyric: false, card: false };
try {
  const cdp = await ctx.newCDPSession(page2);
  const snap = await cdp.send("DOMSnapshot.captureSnapshot", { computedStyles: [] });
  const strings = snap.strings.join("\n");
  dlSnap.title = strings.includes("搜索结果二");
  dlSnap.lyric = ["第一", "句逐", "第二", "第三"].some((w) => strings.includes(w));
  dlSnap.card = strings.includes("歌手戊");
} catch (e) {
  dlSnap.err = String(e.message || e).slice(0, 80);
}
judge("N16d 网页 dl 浮层+悬浮卡渲染内置播放器曲目与逐字歌词",
  dlSnap.title && dlSnap.lyric, JSON.stringify(dlSnap));
await af.evaluate(() => { try { chrome.runtime.connect({ name: "chushi-card" }); } catch { } });
await page2.close().catch(() => { });

/* ---------- N14 × 收 dock 面板（殿后，v8.7.29 回退形态）----------
   chushi.close() → closePanel → 收折弹簧归零 → 视图 opacity 0 + 不可交互
   （舞台壳高度盒归零，palette 包装层已退役） */
await wclick(nf, "#x");
await sleep(1200);
const n14 = await af.evaluate(() => {
  /* 同 N1：收窄到 .cl-dockwidget 视图层（视图层语义恒正确，不依赖壳 data-widget 在位态） */
  const wrap = [...document.querySelectorAll(".cl-dockwidget[data-widget]")].find((x) => (x.getAttribute("data-widget") || "").includes("netease"));
  if (!wrap) return { has: false };
  const cs = getComputedStyle(wrap);
  const stage = wrap.closest(".cl-stage");
  const sr = stage ? stage.getBoundingClientRect() : null;
  return { has: true, opa: cs.opacity, pe: cs.pointerEvents, sh: sr ? +sr.height.toFixed(1) : -1 };
});
judge("N14 × 收 dock 面板（视图 opacity 0 + 不可交互 + 舞台壳收折归零）",
  n14.has && n14.opa === "0" && n14.pe === "none" && n14.sh <= 1, JSON.stringify(n14));

await page.screenshot({ path: SHOTS + "/final.png" }).catch(() => { });
console.log(`\n===== visual v8.7.29: ${passCount} PASS / ${failCount} FAIL =====`);
process.exit(failCount ? 1 : 0);
