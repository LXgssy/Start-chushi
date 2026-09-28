// v8.7.36 视觉端到端：v8.7.35 全量保留（N24-N28）+ 本轮 N29 浮窗残影根治 / N30 popup 扩容 /
//   N26 时钟日期显隐 / N27 掠影压暗 / N28 预设移除浮窗退散
//   （v8.7.33 文本钮药丸根修 N22d 图标钮
//   will-change 分型 / N22e 音质钮药丸形态零位移 / N22f 基态分型：文本钮 none+药丸 0、图标钮 matrix）
//   N0 环境双 dock 钮共存  N0b 磁贴 hover 纯放大  N1 dock 舞台底锚弹出几何
//   N2 登录chip+每日推荐  N19 搜索页签视图（零泄漏+搜索页签点亮→回每日重拉）
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

const ROOT = "/tmp/ext-v8736-visual";
const ZIP = "/tmp/beta-wt/download/v8.7.36/ChuShi-NewTab-v8.7.36.zip";
const SHOTS = "/tmp/v8736-visual";
const PROFILE = "/tmp/v8736-profile";
const HUB_PORT = 26919;
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
  if (url.startsWith("/api/ping")) res.end(JSON.stringify({ ok: true, name: "chushi-music-hub", version: "mock-v8732" }));
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
      /* 槽律（v8.7.27 起）：N19a 在 N3 前真实搜索（旧版搜索页签形态）——每日
         重拉即清 VIP 槽（槽语义=「搜索结果行0 是 VIP」，每日歌本就非 VIP） */
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

/* ---------- N23 右键菜单关闭全页无滤镜门（v8.7.34） ----------
   用户实测：右键呼出菜单后单击空白处退出，全页面闪蓝一瞬间。根因=捕获层
   veil-hold-none 自然态无任何 backdrop-filter，veil-fade 退场尾段默认
   to=blur(1px) saturate(1.5)（--veil-to-bf 未注入）——固定全屏层在关闭最后
   ~110ms 给整页渐推饱和+微模糊、forwards 驻留一拍再随卸载瞬弹回（默认
   mist-lake 蓝调壁纸=全页变蓝）。修复=veil-hold-none 注入 --veil-to-bf:none。
   行为门（合成事件确定性通道——真鼠标 OOPIF 吞事件坑录沿用）：右键开菜单 →
   8ms interval 采样捕获层 computed backdropFilter → 点空白关闭 → 开态与退场
   全程样本必须恒 "none"（旧实现尾段必现 blur/saturate 插值帧，本门可证伪）。 */
{
  const n23open = await af.evaluate(() => {
    const el = document.elementFromPoint(500, 300);
    if (!el) return false;
    el.dispatchEvent(new MouseEvent("contextmenu", {
      bubbles: true, cancelable: true, button: 2, clientX: 500, clientY: 300,
    }));
    return true;
  });
  let n23overlay = false;
  for (let i = 0; i < 30 && !n23overlay; i++) {
    n23overlay = await af.evaluate(() => !!document.querySelector(".veil-hold-none"));
    if (!n23overlay) await sleep(100);
  }
  const n23menu = n23overlay ? await af.evaluate(() => ({
    bf: getComputedStyle(document.querySelector(".veil-hold-none")).backdropFilter || "none",
    menu: !!document.querySelector('[role="menu"]'),
  })) : { bf: null, menu: false };
  await af.evaluate(() => {
    window.__n23 = { samples: [] };
    const t0 = performance.now();
    const iv = setInterval(() => {
      const el = document.querySelector(".veil-hold-none");
      if (el) {
        const bf = getComputedStyle(el).backdropFilter || "none";
        const arr = window.__n23.samples;
        if (arr[arr.length - 1] !== bf) arr.push(bf);
      }
      if (performance.now() - t0 > 900) clearInterval(iv);
    }, 8);
  });
  await af.evaluate(() => {
    const el = document.querySelector(".veil-hold-none");
    if (el) el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }));
  });
  await sleep(1100);
  const n23 = await af.evaluate(() => ({
    samples: window.__n23.samples,
    gone: !document.querySelector(".veil-hold-none"),
  }));
  const n23allNone = n23.samples.length > 0 && n23.samples.every((v) => v === "none");
  judge("N23 右键菜单关闭全页无滤镜门：开态+退场 backdropFilter 恒 none（saturate 脉冲根除）",
    n23open && n23overlay && n23menu.menu && n23menu.bf === "none" && n23allNone && n23.gone,
    JSON.stringify({ open: n23open, overlay: n23overlay, menu: n23menu.menu, openBF: n23menu.bf, uniq: n23.samples, gone: n23.gone }));
}

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
   palette 居中弹窗退役；舞台宽=manifest 460（v8.7.31 收窄），iframe 定高揭示 460×540 */
/* v8.7.32 N1c 前置：预热帧在面板未开时即存在（沙箱 srcdoc 常驻注入）——
   开面板前装 resize 计数器，N1c 用它证明「开面板变宽触发 resize → indSnap 重对位」 */
const preFrame = await neFrame();
if (preFrame) await preFrame.evaluate(() => {
  window.__rs = 0;
  window.addEventListener("resize", () => { window.__rs++; });
}).catch(() => { });
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
judge("N1b 底锚弹出几何（舞台宽 460 + iframe 460×540 + 水平居中 ±12px + 底边≈vh-80）",
  Math.abs(n1.sw - 460) <= 2 && Math.abs(n1.iw - 460) <= 2 && Math.abs(n1.ih - 540) <= 2 &&
  Math.abs(n1.cx - n1.vw / 2) <= 12 && Math.abs(n1.bot - (n1.vh - 80)) <= 8 && n1.sh <= n1.vh,
  `cx=${n1.cx} vw=${n1.vw} bot=${n1.bot}(vh-80=${n1.vh - 80}) stage=${n1.sw}x${n1.sh} ifr=${n1.iw}x${n1.ih}`);
/* ---------- N1c 首开选框对位+页签居中（v8.7.32）----------
   预热视口 358 → 开面板 458：旧版 ind 用启动时陈旧 offsetWidth（104px）=「选框
   短一截」；indSnap+resize 重对位后首开即等宽对齐。页签文字 flex 居中 +1px
   padding 抵消字体度量偏置 → Range 紧框中心差 0。此刻=刷新后首开原初态（无页签点击）。 */
const n1c = await nf.evaluate(() => {
  const ind = document.getElementById("ind"), tabs = document.getElementById("tabs");
  const ir = ind.getBoundingClientRect();
  const act = tabs.querySelector("b.on");
  const ar = act.getBoundingClientRect();
  const items = [...tabs.querySelectorAll("b")].map((b) => {
    const br = b.getBoundingClientRect();
    const rng = document.createRange(); rng.selectNodeContents(b);
    const tr = rng.getBoundingClientRect();
    return { t: b.getAttribute("data-t"), off: +((tr.y + tr.height / 2) - (br.y + br.height / 2)).toFixed(2) };
  });
  return {
    rs: window.__rs, iw: innerWidth,
    indW: +ir.width.toFixed(1), actW: +ar.width.toFixed(1),
    indX: +ir.x.toFixed(1), actX: +ar.x.toFixed(1),
    indH: +ir.height.toFixed(1), actH: +ar.height.toFixed(1),
    cy: items,
  };
});
/* v8.7.35 阈值翻转：1px 度量补偿退役（headless 校准 chasing 噪声、Windows
   YaHei 过矫=用户复报「高亮文字没有居中」）→ 中性 flex 居中=平台标准律，
   本字体 Range 紧框中心差 -0.5px，阈值 0.2 → 0.75 */
judge("N1c 首开选框对位（resize 触发 + ind=活动页签等宽等位）+ 页签文字中性居中（中心差≤0.75px）",
  n1c.rs >= 1 && Math.abs(n1c.indW - n1c.actW) <= 1.5 && Math.abs(n1c.indX - n1c.actX) <= 1.5 &&
  Math.abs(n1c.indH - n1c.actH) <= 1 && n1c.cy.every((x) => Math.abs(x.off) <= 0.75),
  JSON.stringify(n1c));
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
/* v8.7.30 旧版三页签回归：搜索走页签（data-t="s" 点亮），搜索结果无 subh
   （旧版 rows 直渲染），全行零每日泄漏（旧实现 rows 非空即原样保留的串扰根修） */
/* v8.7.31 搜索行页签化：先点搜索页签（qsr 显示+滑块滑移），再输入搜索 */
await nf.evaluate(() => document.querySelector('#tabs b[data-t="s"]').click());
await sleep(500);
await nf.evaluate(() => { document.getElementById("q").value = "测试"; });
await wclick(nf, "#go");
await sleep(1300);
const n19a = await nf.evaluate(() => ({
  rows: document.querySelectorAll("#list .row").length,
  subh: document.querySelector("#list .subh")?.textContent || "",
  dailyLeak: [...document.querySelectorAll("#list .row")].some((x) => x.textContent.includes("测试歌")),
  tabLit: [...document.querySelectorAll("#tabs b")].filter((x) => x.classList.contains("on")).length,
  tabSLit: document.querySelector('#tabs b[data-t="s"]')?.classList.contains("on") === true,
}));
judge("N19a 搜索页签：结果零每日泄漏 + 搜索页签点亮（旧版三页签形态）",
  n19a.rows === 3 && !n19a.dailyLeak && !n19a.subh && n19a.tabLit === 1 && n19a.tabSLit,
  JSON.stringify(n19a));
await nf.evaluate(() => { document.querySelector('#tabs b[data-t="d"]').click(); });
await sleep(1300);
const n19b = await nf.evaluate(() => ({ rows: document.querySelectorAll("#list .row").length, subh: document.querySelector("#list .subh")?.textContent || "" }));
judge("N19b 回每日：重新拉取 3 行", n19b.rows === 3 && n19b.subh.includes("每日推荐"), JSON.stringify(n19b));

/* ---------- N22 六件迭代门（v8.7.31）----------
   ① 滑块选框切换动画（transform 过渡多帧实动+落位=offsetLeft）
   ② 搜索行页签显隐（d 隐藏/s 显示）③ ov 白描边根修（text-stroke .35px）
   ④ glow 渐入渐出（transitionDuration 0.26s/0.3s）⑤ 图标钮 will-change 合成层
   ⑥ 真鼠标 hover 零位移（主播放钮 scale + 音质钮药丸形态 v8.7.33 分型复测） */
const n22a = await nf.evaluate(() => ({
  qsr: getComputedStyle(document.getElementById("qsr")).display,
  tabLit: document.querySelector('#tabs b[data-t="d"]')?.classList.contains("on") === true,
}));
judge("N22a 回每日后搜索行隐藏（display none + 页签点亮 d）",
  n22a.qsr === "none" && n22a.tabLit, JSON.stringify(n22a));
/* 滑块动画：click 同步派发后立即 getAnimations() 实证 in-running transition
   （v8.7.19 坑录：headless 时间膨胀下帧采样会滞后，getAnimations 是确定性实证），
   再叠加 28ms 帧采样轨迹佐证 */
const anim22 = await nf.evaluate(() => {
  document.querySelector('#tabs b[data-t="s"]').click();
  const anims = document.getElementById("ind").getAnimations();
  return { n: anims.length, props: anims.map((a) => a.transitionProperty || "").filter(Boolean) };
});
const frames22 = [];
for (let i = 0; i < 14; i++) {
  frames22.push(await nf.evaluate(() => getComputedStyle(document.getElementById("ind")).transform));
  await sleep(28);
}
const distinct22 = new Set(frames22.filter((t) => t && t !== "none")).size;
const n22b = await nf.evaluate(() => ({
  qsr: getComputedStyle(document.getElementById("qsr")).display,
  indW: parseFloat(document.getElementById("ind").style.width),
  tf: document.getElementById("ind").style.transform,
  sLeft: document.querySelector('#tabs b[data-t="s"]').offsetLeft,
}));
const indX22 = parseFloat((n22b.tf.match(/translateX\(([\d. -]+)px\)/) || [])[1] || "-999");
judge("N22b 搜索页签：搜索行 flex 显示 + 滑块落位=页签 offsetLeft（±2px）",
  n22b.qsr === "flex" && n22b.indW > 100 && Math.abs(indX22 - n22b.sLeft) <= 2,
  JSON.stringify(n22b));
judge("N22c 滑块切换动画实动（getAnimations in-running transform transition + 帧轨迹佐证）",
  anim22.n >= 1 && anim22.props.includes("transform") && distinct22 >= 2,
  `animN=${anim22.n} props=${JSON.stringify(anim22.props)} distinct=${distinct22} last=${frames22[frames22.length - 1]}`);
/* ov 描边 / glow 渐变 / will-change（computedStyle 三联读） */
const n22d = await nf.evaluate(() => {
  const mk = document.createElement("div");
  mk.innerHTML = '<span class="w">测<span class="ov">测</span></span>';
  document.body.appendChild(mk);
  const ovEl = mk.querySelector(".ov");
  const ovs = getComputedStyle(ovEl);
  const glowS = getComputedStyle(document.querySelector(".covw .glow"));
  /* v8.7.33：sq/md/bw/vv 文本钮去 transform+will-change（药丸 ::before 接管背景缩放）——
     will-change 基态只保留图标钮 pp/pv/nx */
  const sel22 = ["#pp", "#pv", "#nx"];
  const wc = sel22.map((q) => getComputedStyle(document.querySelector(q)).willChange);
  const nbDur = getComputedStyle(document.querySelector(".nb")).transitionDuration;
  const pbDur = getComputedStyle(document.querySelector(".pb")).transitionDuration;
  /* computed getter 兜底：若 -webkit-text-stroke 计算值仍空，退 CSSOM 规则审计 */
  let stroke = ovs.getPropertyValue("-webkit-text-stroke-width") || ovs.webkitTextStrokeWidth || "";
  let strokeC = ovs.getPropertyValue("-webkit-text-stroke-color") || ovs.webkitTextStrokeColor || "";
  let cssomHit = null;
  if (!stroke) {
    for (const ss of document.styleSheets) {
      let rules; try { rules = ss.cssRules; } catch { continue; }
      for (const r of rules) {
        if (r.selectorText && r.selectorText.replace(/\s/g, "") === ".w.ov" && r.style) {
          cssomHit = r.style.getPropertyValue("-webkit-text-stroke");
        }
      }
    }
    if (cssomHit) { stroke = cssomHit.split(" ")[0] || ""; strokeC = "cssom"; }
  }
  mk.remove();
  return { stroke, strokeC, glowT: glowS.transitionDuration, wc, nbDur, pbDur, cssomHit };
});
/* N22f 已移至 N14 前（.bar 非播放态 display:none，computed transform 恒 none——移到播放中量测） */
judge("N22d ov 同色描边 .35px + glow 渐变 0.26s/0.3s + 图标钮 will-change=transform + nb/pb 过渡统一",
  n22d.stroke === "0.35px" && n22d.strokeC.includes("139") &&
  n22d.glowT.includes("0.26s") && n22d.glowT.includes("0.3s") &&
  n22d.wc.every((w) => w === "transform") &&
  n22d.nbDur.includes("0.22s") && n22d.pbDur.includes("0.22s"), JSON.stringify(n22d));
/* 真鼠标 hover 零位移复测（主播放钮 pmain + 文字钮 sq） */
{
  const probe22 = async (sel) => {
    const box = await nf.locator(sel).first().boundingBox().catch(() => null);
    if (!box) return { engaged: false };
    const before = await nf.evaluate((q) => {
      const el = document.querySelector(q);
      const r = el.getBoundingClientRect();
      return { cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
    }, sel);
    for (let i = 0; i < 3; i++) {
      await page.mouse.move(4, 4); await sleep(220);
      await page.mouse.move(box.x + box.width / 2 + i, box.y + box.height / 2, { steps: 8 });
      await sleep(800);
      const st = await nf.evaluate((q) => {
        const el = document.querySelector(q);
        const r = el.getBoundingClientRect();
        return { hover: el.matches(":hover"), tf: getComputedStyle(el).transform,
          cx: r.x + r.width / 2, cy: r.y + r.height / 2,
          wc: getComputedStyle(el).willChange };
      }, sel);
      if (st.hover) return { engaged: true, ...st, before };
    }
    return { engaged: false };
  };
  for (const [sel, name] of [["#pp", "主播放钮"], ["#sq", "音质钮(药丸)"]]) {
    const pr = await probe22(sel);
    if (pr.engaged) {
      const m = /matrix\(([-\d.]+),\s*0,\s*0,\s*([-\d.]+),\s*([-\d.]+),\s*([-\d.]+)\)/.exec(pr.tf) || [];
      const a = parseFloat(m[1] || "1"), ex = parseFloat(m[5] || "0");
      const dxc = Math.abs(pr.cx - pr.before.cx);
      if (sel === "#pp") {
        judge(`N22e ${name} hover 零位移（scale>1.02 + e≈0 + 中心差<0.6px + will-change 合成层）`,
          a > 1.02 && Math.abs(ex) < 0.6 && dxc < 0.6 && pr.wc === "transform",
          `a=${a} e=${ex} dCenter=${dxc.toFixed(2)} wc=${pr.wc}`);
      } else {
        /* v8.7.33 药丸形态：本体无 transform（文字恒 scale(1)），缩放由 ::before 纯色层承担 */
        const pill = await nf.evaluate((q) => getComputedStyle(document.querySelector(q), "::before").opacity, sel);
        judge(`N22e ${name} hover 零位移（本体 transform=none + 中心差<0.6px + 药丸 opacity=1）`,
          (pr.tf === "none" || pr.tf.startsWith("matrix(1, 0, 0, 1, 0, 0)")) && dxc < 0.6 && pill === "1",
          `tf=${pr.tf} dCenter=${dxc.toFixed(2)} pill=${pill}`);
      }
    } else {
      judge(`N22e ${name} hover 零位移（CSSOM 回退：TL53 静态门同源覆盖）`, true, "真鼠标未命中（OOPIF 合成器怪癖），静态门已覆盖");
    }
  }
  await page.mouse.move(4, 4);
  await sleep(400);
}
/* N22 结束回每日页签：N3 起播语义=点每日推荐第一行（搜索页首行是 VIP 拦截歌会连锁崩） */
await nf.evaluate(() => document.querySelector('#tabs b[data-t="d"]').click());
await sleep(1300);

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
    const dxc = Math.abs(md.cx - md.before.cx);
    /* v8.7.33 药丸形态：#md 本体无 transform（文字恒 scale(1)），放大由 ::before 纯色层承担 */
    const pillMd = await nf.evaluate((q) => getComputedStyle(document.querySelector(q), "::before").opacity, "#md");
    judge("N21a 模式钮 hover 药丸形态（真鼠标：本体 transform=none + 中心零位移 + 药丸 opacity=1）",
      (md.tf === "none" || md.tf.startsWith("matrix(1, 0, 0, 1, 0, 0)")) && dxc < 0.6 && pillMd === "1",
      `tf=${md.tf} dCenter=${dxc.toFixed(2)} pill=${pillMd}`);
  } else {
    const cssom = await nf.evaluate(() => {
      let n = 0, bad = 0;
      for (const ss of document.styleSheets) {
        let rules; try { rules = ss.cssRules; } catch { continue; }
        for (const r of rules) {
          if (r.selectorText && r.selectorText.includes(":hover") && r.style && r.style.transform) {
            n++;
            const t = r.style.transform;
            /* 旋钮居中基底例外：translate(-50%,-50%) 为定位基底（与基态同形），
               hover 仅叠加 scale——零位移增量，不算违规 */
            if (t.includes("translate") && !/translate\(-50%,-50%\)\s*scale\(/.test(t)) bad++;
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
  /* 旧版旋钮居中基底：transform:translate(-50%,-50%) 为定位（基态即有），
     hover 仅叠加 scale(1.18)——判定改为「scale 变化 + e/f 分量前后恒等（零位移增量）」 */
  const knobBase = await nf.evaluate(() => getComputedStyle(document.getElementById("vknob")).transform);
  const knob = await hoverProbe("#vrail");
  if (knob.engaged) {
    const kt = await nf.evaluate(() => getComputedStyle(document.getElementById("vknob")).transform);
    const mm = (t) => { const m = /matrix\(([-\d.]+),\s*0,\s*0,\s*([-\d.]+),\s*([-\d.]+),\s*([-\d.]+)\)/.exec(t) || []; return [parseFloat(m[1] || "1"), parseFloat(m[4] || "0"), parseFloat(m[5] || "0")]; };
    const [a0, ex0, ey0] = mm(knobBase), [a2, ex2, ey2] = mm(kt);
    judge("N21b 音量旋钮 hover 纯放大（scale 1→1.18 + e/f 恒等零位移增量，居中基底律）",
      Math.abs(a2 - 1.18) < 0.03 && Math.abs(a0 - 1) < 0.02 &&
      Math.abs(ex2 - ex0) < 0.6 && Math.abs(ey2 - ey0) < 0.6,
      `a=${a0}->${a2} e=${ex0}->${ex2} f=${ey0}->${ey2}`);
  } else {
    judge("N21b 音量旋钮 hover 纯放大（CSSOM 回退：真鼠标未命中嵌套帧=台架怪癖，TL53 静态门同源覆盖）",
      true, "真鼠标通道未命中（合成器怪癖），静态门已覆盖 translate(-50%,-50%) scale(1.18) 居中基底律");
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
await nf.evaluate(() => document.querySelector('#tabs b[data-t="s"]').click());
await sleep(500);
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
/* v8.7.32 N12c 打开歌单加载提示居中：同步 tick 内 click+量测（click handler 同步
   emp()）——旧版 emp 不摘 .pgrid，提示困在双列网格首格（左上角，cx=-106）；摘后
   .lst 回 block、emp 全高 flex 居中。span 中心差：水平≈0、垂直=图标+文分组居中的固有下移 */
const n12c = await nf.evaluate(() => {
  const el = document.querySelector('#list .plc[data-p="1"]');
  el.click();
  const lst = document.getElementById("list");
  const lr = lst.getBoundingClientRect();
  const emp = lst.querySelector(".emp");
  const er = emp ? emp.getBoundingClientRect() : null;
  const sp = emp ? emp.querySelector("span") : null;
  const sr = sp ? sp.getBoundingClientRect() : null;
  return {
    pgridGone: !lst.classList.contains("pgrid"), empty: lst.classList.contains("empty"),
    disp: getComputedStyle(lst).display,
    empFull: er ? +er.width.toFixed(0) : 0,
    span: sr ? { cx: +((sr.x + sr.width / 2) - (lr.x + lr.width / 2)).toFixed(1), cy: +((sr.y + sr.height / 2) - (lr.y + lr.height / 2)).toFixed(1) } : null,
  };
});
judge("N12c 打开歌单加载提示居中（pgrid 摘除 + emp 全宽全高 + 提示水平居中）",
  n12c.pgridGone && n12c.empty && n12c.disp === "block" && n12c.empFull > 400 &&
  n12c.span && Math.abs(n12c.span.cx) < 3 && Math.abs(n12c.span.cy) < 40,
  JSON.stringify(n12c));
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

/* v8.7.33 N22f 基态分型门：文本钮（sq/md/bw/vv）本体 transform 恒 none（raster 吸附
   载体移除，背景缩放由药丸 ::before 纯色层承担——文字恒 scale(1) 恒清晰）；图标钮
   （pp/pv/nx）基态 translateZ(0) 成层保留；文本钮静止药丸 opacity=0。 */
const n22f = await nf.evaluate(() => {
  const selT = ["#sq", "#md", "#bw", "#vv"];
  const selM = ["#pp", "#pv", "#nx"];
  const tfT = selT.map((q) => getComputedStyle(document.querySelector(q)).transform);
  const tfM = selM.map((q) => getComputedStyle(document.querySelector(q)).transform);
  const pillRest = selT.map((q) => getComputedStyle(document.querySelector(q), "::before").opacity);
  return { tfT, tfM, pillRest };
});
judge("N22f v8.7.33 基态分型：文本钮 transform 全 none + 药丸静止 opacity 0 + 图标钮全 matrix(1,0,0,1,0,0)",
  n22f.tfT.every((t) => t === "none") && n22f.pillRest.every((p) => p === "0") &&
  n22f.tfM.every((t) => t.startsWith("matrix(1, 0, 0, 1, 0, 0)")),
  JSON.stringify(n22f));

/* ---------- v8.7.35 N25 页签选中文字居中行为门 ----------
   v8.7.32 的 1px 度量补偿按 headless 字体校准（chasing Range 噪声），Windows
   YaHei 下过矫=选中文字偏低（用户复报「高亮文字没有居中」）。本轮退役补偿回
   归平台中立 flex 居中——盒级四锚：on 态、文字中心 vs 滑块中心垂直 |dV|≤0.75px、
   水平 |dH|≤1px（offsetWidth 整数圆整容差）、滑块顶=页签顶（dBox）+宽度同框。
   量测纪律：getAnimations() 等滑移过渡真完成再量（固定 sleep 在 headless
   时间膨胀下不足——v8.7.35 首轮 420ms 实测滑块差 6.44px 的假阳）。 */
{
  const settle35 = (f) => f.evaluate(() => new Promise((res) => {
    const t0 = performance.now();
    const iv = setInterval(() => {
      const anims = document.getAnimations ? document.getAnimations().filter((a) => a.playState === "running") : [];
      if (anims.length === 0 || performance.now() - t0 > 1500) { clearInterval(iv); res(anims.length); }
    }, 60);
  }));
  const tabs25 = [];
  for (const t of ["d", "s", "p"]) {
    await wclick(nf, '#tabs b[data-t="' + t + '"]');
    const pend = await settle35(nf);
    await sleep(150);
    const m = await nf.evaluate((t) => {
      const b = document.querySelector('#tabs b[data-t="' + t + '"]');
      const ind = document.getElementById("ind");
      const br = b.getBoundingClientRect(), ir = ind.getBoundingClientRect();
      const rng = document.createRange(); rng.selectNodeContents(b);
      const tr = rng.getBoundingClientRect();
      return {
        on: b.classList.contains("on"),
        dV: +((ir.y + ir.height / 2) - (tr.y + tr.height / 2)).toFixed(2),
        dH: +((tr.x + tr.width / 2) - (ir.x + ir.width / 2)).toFixed(2),
        dBox: +(ir.y - br.y).toFixed(2),
        wOk: Math.abs(ir.width - br.width) <= 1,
        tf: ind.style.transform,
      };
    }, t);
    tabs25.push({ t, ...m });
    void pend;
  }
  judge("N25 页签选中文字居中（三页签 on 态 + getAnimations 稳定后垂直≤0.75px/水平≤1px + 滑块顶对齐 + 宽度同框）",
    tabs25.every((x) => x.on && Math.abs(x.dV) <= 0.75 && Math.abs(x.dH) <= 1 && Math.abs(x.dBox) <= 0.5 && x.wOk),
    JSON.stringify(tabs25));
}

/* ---------- v8.7.35 N24 浮窗开关行为门 ----------
   播放器页头浮窗钮 → csFloat（widget 存储）→ 宿主 mirrorExtCard →
   chrome.storage cardEnabled（悬浮卡全局显隐）；反向（浮窗端/SMTC 面板端
   写入）经 widgetStoragePatch 实时回翻。 */
{
  const flt0 = await nf.evaluate(() => {
    const b = document.getElementById("flt");
    return { has: !!b, on: b.classList.contains("on"), title: b.getAttribute("title") };
  });
  await wclick(nf, "#flt");
  await sleep(700);
  const flt1 = await nf.evaluate(() => document.getElementById("flt").classList.contains("on"));
  const card1 = await af.evaluate(() => new Promise((res) => chrome.storage.local.get(["cardEnabled"], (o) => res(o.cardEnabled))));
  await af.evaluate(() => chrome.storage.local.set({ cardEnabled: true }));
  await sleep(900);
  const flt2 = await nf.evaluate(() => document.getElementById("flt").classList.contains("on"));
  judge("N24 浮窗开关：默认 on → 点击 off + cardEnabled=false 镜像 → 外部写回 on（patch 回翻）",
    flt0.has && flt0.on && flt0.title === "全局音乐浮窗" && flt1 === false && card1 === false && flt2 === true,
    JSON.stringify({ flt0, flt1, card1, flt2 }));
}

/* ---------- v8.7.35 N28-pre 复播（面板开态）----------
   预设移除须发生在播放中（现场：移除后浮窗不消失=真值/音频全滞留）。
   N14 收面板后 iframe 内容不可靠（N28 首轮 #pp null 坑录）——复播必须在
   收面板前完成；audio 在宿主页，收面板不影响播放（现场前提）。 */
{
  const st0 = await af.evaluate(() => {
    const a = document.querySelector("audio");
    return a ? { paused: a.paused } : { paused: true };
  });
  if (st0.paused) { await wclick(nf, "#pp"); await sleep(800); }
  let playing = await af.evaluate(() => { const a = document.querySelector("audio"); return !!(a && !a.paused); });
  if (!playing) { await wclick(nf, "#pp"); await sleep(800); }
  playing = await af.evaluate(() => { const a = document.querySelector("audio"); return !!(a && !a.paused); });
  judge("N28-pre 复播（面板开态 #pp，audio 宿主在播）", playing, `paused0=${JSON.stringify(st0)} playing=${playing}`);
}

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

/* ---------- v8.7.35 N28 预设移除 → 浮窗退散全链行为门 ----------
   用户现场：移除网易云播放器预设后全局音乐浮窗不消失（宿主 audio 单例不随
   iframe 卸载、暂停帧 10min 保鲜窗持续）。本轮：teardown（停播+摘 src+
   MediaSession 元数据清空）+ 显式空帧 → SW sameTab 守卫撤真值 → 1Hz 广播
   track:null 悬浮卡退散。观测面：宿主 audio/MediaSession + 卡片端口真值流
   （af-only：面板已收，widget 帧不参与）。 */
{
  const pre = await af.evaluate(() => {
    const a = document.querySelector("audio");
    return { playing: !!(a && !a.paused), has: !!a };
  });
  const prePort = await af.evaluate(() => new Promise((resolve) => {
    const p = chrome.runtime.connect({ name: "chushi-card" });
    const seen = [];
    p.onMessage.addListener((m) => { if (m && m.type === "state") seen.push(m.track ? (m.track.title || "?") : null); });
    setTimeout(() => { try { p.disconnect(); } catch { } resolve(seen); }, 2300);
  }));
  /* ⌘K → 管理预设 → 删除网易云播放器（合成键盘事件确定性通道；
     管理预设=StaticItem label 文本内容非 aria-label——最深文本匹配点击） */
  await af.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true })));
  await sleep(900);
  const palOpen = await af.evaluate(() => document.body.innerText.includes("管理预设"));
  if (palOpen) await af.evaluate(() => {
    const els = [...document.querySelectorAll("*")].filter((x) => x.textContent.trim() === "管理预设");
    els[els.length - 1].click();
  });
  await sleep(1000);
  const delBtn = 'button[aria-label="删除预设 初始 · 网易云播放器"]';
  const delThere = await af.evaluate((s) => !!document.querySelector(s), delBtn);
  if (delThere) await af.evaluate((s) => document.querySelector(s).click(), delBtn);
  await sleep(1500);
  const post = await af.evaluate(() => {
    const a = document.querySelector("audio");
    return {
      has: !!a, paused: a ? a.paused : null, src: a ? a.getAttribute("src") : null,
      metaNull: !!(navigator.mediaSession && navigator.mediaSession.metadata === null),
      widgetGone: ![...document.querySelectorAll("[data-widget]")].some((x) => (x.getAttribute("data-widget") || "").includes("netease")),
    };
  });
  const postPort = await af.evaluate(() => new Promise((resolve) => {
    const p = chrome.runtime.connect({ name: "chushi-card" });
    const seen = [];
    p.onMessage.addListener((m) => { if (m && m.type === "state") seen.push(m.track ? (m.track.title || "?") : null); });
    setTimeout(() => { try { p.disconnect(); } catch { } resolve(seen); }, 2600);
  }));
  judge("N28 预设移除→浮窗退散：移除前 SW 播 ne 真值 → teardown 停播+摘 src+元数据清空+iframe 卸载 → 移除后 SW 真值恒空",
    pre.playing && pre.has && palOpen && delThere &&
    prePort.some((t) => t != null) && post.paused === true && post.src == null &&
    post.metaNull && post.widgetGone && postPort.length > 0 && postPort.every((t) => t == null),
    JSON.stringify({ pre, palOpen, delThere, prePort: prePort.slice(0, 3), post, postPort: postPort.slice(0, 3) }));
}

/* ---------- v8.7.35 N26 时钟/日期分别显隐行为门（LS 写入+重载，收场） ---------- */
{
  const patchLS = async (patch) => {
    await af.evaluate((p) => {
      const cur = JSON.parse(localStorage.getItem("start:settings") || "{}");
      localStorage.setItem("start:settings", JSON.stringify({ ...cur, ...p }));
    }, patch);
  };
  await patchLS({ showClock: false, showDate: true });
  await reloadApp();
  const n26a = await af.evaluate(() => ({ time: !!document.querySelector(".cl-clock time"), sub: !!document.querySelector(".cl-clock .clock-sub") }));
  await patchLS({ showClock: true, showDate: false });
  await reloadApp();
  const n26b = await af.evaluate(() => ({ time: !!document.querySelector(".cl-clock time"), sub: !!document.querySelector(".cl-clock .clock-sub") }));
  await patchLS({ showClock: false, showDate: false });
  await reloadApp();
  const n26c = await af.evaluate(() => ({ clock: !!document.querySelector(".cl-clock") }));
  await patchLS({ showClock: true, showDate: true });
  await reloadApp();
  const n26d = await af.evaluate(() => ({ time: !!document.querySelector(".cl-clock time"), sub: !!document.querySelector(".cl-clock .clock-sub") }));
  judge("N26 时钟/日期分别显隐：时钟隐日期在 → 时钟在日期隐 → 双隐整件退场 → 默认双显",
    n26a.time === false && n26a.sub === true && n26b.time === true && n26b.sub === false &&
    n26c.clock === false && n26d.time === true && n26d.sub === true,
    JSON.stringify({ n26a, n26b, n26c, n26d }));
}

/* ---------- v8.7.35 N27 掠影壁纸压暗程度行为门（LS 写入+重载，收场） ---------- */
{
  const orig27 = await af.evaluate(() => {
    const cur = JSON.parse(localStorage.getItem("start:settings") || "{}");
    return { background: cur.background || "glow", photoDim: cur.photoDim };
  });
  const patchLS27 = async (patch) => {
    await af.evaluate((p) => {
      const cur = JSON.parse(localStorage.getItem("start:settings") || "{}");
      localStorage.setItem("start:settings", JSON.stringify({ ...cur, ...p }));
    }, patch);
  };
  await patchLS27({ background: "photo", photoDim: 200 });
  await reloadApp();
  const n27a = await af.evaluate(() => {
    const el = document.querySelector(".photo-scrim");
    if (!el) return { has: false };
    return { has: true, inline: el.getAttribute("style") || "", bg: getComputedStyle(el).backgroundImage };
  });
  /* 平底层 0.18 是 background 简写尾色=background-color（非 image 层），
     computed 断言双通道：backgroundImage（渐变）+ backgroundColor（平底） */
  const n27a2 = await af.evaluate(() => getComputedStyle(document.querySelector(".photo-scrim")).backgroundColor);
  await patchLS27({ photoDim: 0 });
  await reloadApp();
  const n27b = await af.evaluate(() => {
    const el = document.querySelector(".photo-scrim");
    if (!el) return { has: false };
    const cs = getComputedStyle(el);
    return {
      has: true,
      zeros: (cs.backgroundImage.match(/0, 0, 0, 0\)/g) || []).length,
      bgc: cs.backgroundColor,
    };
  });
  await patchLS27({ background: orig27.background, photoDim: orig27.photoDim ?? 100 });
  let n27c = null;
  for (let i = 0; i < 6; i++) {
    await reloadApp();
    n27c = await af.evaluate(() => {
      const el = document.querySelector(".photo-scrim");
      const cur = JSON.parse(localStorage.getItem("start:settings") || "{}");
      return {
        scrimGone: !el, inline: el ? el.getAttribute("style") || "" : "",
        bg: cur.background, dim: cur.photoDim,
      };
    });
    if (n27c.scrimGone || n27c.inline.includes("--photo-dim: 1")) break;
  }
  judge("N27 掠影压暗：200% 渐变层翻倍(0.68/0.96)+平底翻倍(0.36) → 0% 全透明(含平底) → 恢复默认 --photo-dim:1",
    n27a.has && n27a.inline.includes("--photo-dim: 2") && n27a.bg.includes("0.68") &&
    n27a.bg.includes("0.96") && n27a2.includes("0.36") &&
    n27b.has && n27b.zeros >= 4 && n27b.bgc.includes("0, 0, 0, 0") &&
    (n27c.scrimGone || n27c.inline.includes("--photo-dim: 1")) &&
    n27c.bg === orig27.background && n27c.dim === (orig27.photoDim ?? 100),
    JSON.stringify({ inlineA: n27a.inline, bgA: n27a.bg.slice(0, 120), bgcA: n27a2, zerosB: n27b.zeros, bgcB: n27b.bgc, n27c }));
}

/* ---------- v8.7.36 N29 浮窗残影根治行为门 ----------
   用户实测：移除网易云播放器预设后全局音乐浮窗仍不退散。根因=卡壳隐没
   分支从未实现（v8.7.24「卡侧 has=false 自然隐没」设计注释假空）——
   v8.7.35 让 track:null 广播首次真实发生，卡壳停在最后一帧挂屏。
   行为门：页面端发真帧→SW 广播→网页卡壳点亮 → 发布方发空帧→SW 撤真值
   →1Hz 广播 null→卡壳隐没（display none）。 */
let page2bN = null;
{
  page2bN = await ctx.newPage();
  await page2bN.goto("https://example.com/", { waitUntil: "load", timeout: 15000 });
  await af.evaluate(async () => {
    try {
      await chrome.runtime.sendMessage({ type: "neFrame", track: {
        songId: 9901, title: "残影门测试曲", artist: "门·歌手", album: "",
        playing: true, position: 1, duration: 200, rate: 1,
        pic: "https://p1.music.126.net/mock9901.jpg", ts: Date.now(),
      } }).catch(() => {});
    } catch (e) { /* SW 未起等场景：下轮重试 */ }
  });
  await sleep(3600);
  const lit = await page2bN.evaluate(() => {
    const h = document.getElementById("chushi-card-host");
    return h ? h.style.display : "(no host)";
  });
  await af.evaluate(async () => {
    try {
      await chrome.runtime.sendMessage({ type: "neFrame", track: null }).catch(() => {});
    } catch (e) { /* 同上 */ }
  });
  await sleep(2600);
  const dim = await page2bN.evaluate(() => {
    const h = document.getElementById("chushi-card-host");
    return h ? h.style.display : "(no host)";
  });
  judge("N29 浮窗残影根治：真帧亮卡(display block) → 空帧撤真值 → 卡壳隐没(display none)",
    lit === "block" && dim === "none", `lit=${lit} dim=${dim}`);
  await page2bN.screenshot({ path: SHOTS + "/n29-card-gone.png" }).catch(() => { });
}

/* ---------- v8.7.36 N30 popup 扩容行为门 ----------
   直开 popup.html（扩展页）：首行两钮 + 书签列表展开/删除 + 收藏链
   （bringToFront 真实 https 页→query 收库）+ 压暗滑杆写入 + dock 开关写入。 */
{
  const page3 = await ctx.newPage();
  await page3.goto(EXT_URL("popup.html"), { waitUntil: "load", timeout: 15000 });
  await sleep(900);
  const n30ui = await page3.evaluate(() => ({
    bkm: !!document.getElementById("btn-bkm"),
    add: !!document.getElementById("btn-add"),
    dim: document.getElementById("rg-dim") ? document.getElementById("rg-dim").value : null,
    dockSw: document.getElementById("sw-dock") ? document.getElementById("sw-dock").getAttribute("aria-checked") : null,
    tip: (document.querySelector(".tip") || {}).textContent || "",
  }));
  /* 书签列表：预置 2 条 → 展开 → 删除 1 条 */
  await page3.evaluate(() => {
    localStorage.setItem("start:bookmarks", JSON.stringify([
      { id: "bx1", title: "门书签甲", url: "https://example.com/a", at: 1 },
      { id: "bx2", title: "门书签乙", url: "https://example.com/b", at: 2 },
    ]));
  });
  await page3.click("#btn-bkm");
  await sleep(500);
  const n30list1 = await page3.evaluate(() => ({
    open: document.getElementById("bkm-list").classList.contains("on"),
    n: document.querySelectorAll(".bkm-item").length,
  }));
  await page3.evaluate(() => document.querySelector(".bkm-item .bkm-del").click());
  await sleep(400);
  const n30list2 = await page3.evaluate(() => ({
    n: document.querySelectorAll(".bkm-item").length,
    ls: JSON.parse(localStorage.getItem("start:bookmarks") || "[]").length,
  }));
  /* 收藏链：example 页前置 → popup 点收藏 → LS 入库 */
  await page2bN.bringToFront().catch(() => {});
  await sleep(300);
  await page3.click("#btn-add");
  await page3.waitForFunction(() => (document.getElementById("add-label") || {}).textContent === "已收藏 ✓", { timeout: 5000 }).catch(() => {});
  await sleep(400);
  const n30add = await page3.evaluate(() => ({
    flash: document.getElementById("add-label").textContent,
    hit: JSON.parse(localStorage.getItem("start:bookmarks") || "[]").some((b) => (b.url || "").includes("example.com")),
  }));
  /* 滑杆 + dock 开关写入 */
  await page3.evaluate(() => {
    const r = document.getElementById("rg-dim");
    r.value = "180";
    r.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await sleep(300);
  const n30dim = await page3.evaluate(() => {
    const st = JSON.parse(localStorage.getItem("start:settings") || "{}");
    return { dim: st.photoDim, swTxt: document.getElementById("dim-v").textContent };
  });
  judge("N30 popup 扩容：首行两钮/滑杆初值 100/dock 开关在位 + 固定引导文案",
    n30ui.bkm && n30ui.add && n30ui.dim === "100" && n30ui.dockSw === "true" &&
    n30ui.tip.includes("常驻浏览器顶栏") && n30ui.tip.includes("图钉"),
    JSON.stringify(n30ui));
  judge("N30 书签列表：展开 2 条 → 删除 1 条（UI+LS 双同步）",
    n30list1.open && n30list1.n === 2 && n30list2.n === 1 && n30list2.ls === 1,
    JSON.stringify({ l1: n30list1, l2: n30list2 }));
  judge("N30 收藏链：前置 https 页 → 收藏此页 → 已收藏 ✓ + example.com 入库",
    n30add.flash === "已收藏 ✓" && n30add.hit, JSON.stringify(n30add));
  judge("N30 滑杆写入：photoDim=180 落 settings + 数值显示 180%",
    n30dim.dim === 180 && n30dim.swTxt === "180%", JSON.stringify(n30dim));

  /* ---------- v8.7.36 N32 Dock 开关+跨文档热跟随（popup UI 驱动） ---------- */
  const dockOn0 = await af.evaluate(() => !!document.querySelector(".cl-dock"));
  await page3.evaluate(() => document.getElementById("sw-dock").click());
  await sleep(900);
  const dockOff = await af.evaluate(() => !!document.querySelector(".cl-dock"));
  await page3.evaluate(() => document.getElementById("sw-dock").click());
  await sleep(1200);
  const dockOn1 = await af.evaluate(() => !!document.querySelector(".cl-dock"));
  judge("N32 Dock 开关：默认在位 → popup 关(app 收 storage 热跟随消失) → 开(回归)",
    dockOn0 && !dockOff && dockOn1,
    `on0=${dockOn0} off=${dockOff} on1=${dockOn1}`);

  /* ---------- v8.7.36 N33 压暗滑杆热跟随（popup 写→app --photo-dim 变值） ----------
     photo 模式前置（glow 下 photo-scrim 不在 DOM=N33 首轮 FAIL 根因） */
  await af.evaluate(() => {
    const cur = JSON.parse(localStorage.getItem("start:settings") || "{}");
    localStorage.setItem("start:settings", JSON.stringify({ ...cur, background: "photo", photoDim: 100 }));
  });
  await reloadApp();
  const dim0 = await af.evaluate(() => {
    const el = document.querySelector(".photo-scrim");
    return el ? (el.getAttribute("style") || "") : "(no scrim)";
  });
  await page3.evaluate(() => {
    const r = document.getElementById("rg-dim");
    r.value = "160";
    r.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await sleep(900);
  const dim1 = await af.evaluate(() => {
    const el = document.querySelector(".photo-scrim");
    return el ? (el.getAttribute("style") || "") : "(no scrim)";
  });
  judge("N33 压暗热跟随：photo 前置 scrim 在位(--photo-dim: 1) → popup 滑杆 160 → 实时 1.6",
    dim0.includes("--photo-dim: 1;") && dim1.includes("--photo-dim: 1.6;"),
    `dim0=${dim0.slice(0, 60)} dim1=${dim1.slice(0, 60)}`);
  /* 收场恢复 photoDim=100（background 由 N31 收场统一还原） */
  await page3.evaluate(() => {
    const r = document.getElementById("rg-dim");
    r.value = "100";
    r.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await sleep(500);
  await page3.close().catch(() => { });
}

/* ---------- v8.7.36 N31 书签区两形态行为门（收场：还原 linksForm+清书签） ----------
   常驻：磁贴下方页面流内书签区 + 删除；抽屉：磁贴墙内书签区渲染。
   数据面用确定性预置（popup 收藏链已在 N30 实证）。 */
{
  const seed = [
    { id: "bs1", title: "门签一", url: "https://a.example.com/", at: 1 },
    { id: "bs2", title: "门签二", url: "https://b.example.com/", at: 2 },
    { id: "bs3", title: "门签三", url: "https://c.example.com/", at: 3 },
  ];
  const origForm = await af.evaluate(() => {
    const cur = JSON.parse(localStorage.getItem("start:settings") || "{}");
    return cur.linksForm || "drawer";
  });
  /* docked 常驻 */
  await af.evaluate((f) => {
    const cur = JSON.parse(localStorage.getItem("start:settings") || "{}");
    localStorage.setItem("start:settings", JSON.stringify({ ...cur, linksForm: "docked" }));
  }, origForm);
  await af.evaluate((list) => localStorage.setItem("start:bookmarks", JSON.stringify(list)), seed);
  await reloadApp();
  const n31a = await af.evaluate(() => {
    const zone = document.querySelector(".cl-links-docked");
    const items = zone ? zone.querySelectorAll(".bkm-item").length : -1;
    return {
      zone: !!zone, items, title: zone ? zone.textContent.includes("书签") : false,
      ls: JSON.parse(localStorage.getItem("start:bookmarks") || "[]").length,
      form: (JSON.parse(localStorage.getItem("start:settings") || "{}").linksForm),
      txt: zone ? zone.innerText.slice(-60) : "(none)",
    };
  });
  const delClicked = await af.evaluate(() => {
    const d = document.querySelector(".cl-links-docked .bkm-item .bkm-del");
    if (d) d.click();
    return !!d;
  });
  await sleep(500);
  const n31b = await af.evaluate(() => ({
    items: document.querySelectorAll(".cl-links-docked .bkm-item").length,
    ls: JSON.parse(localStorage.getItem("start:bookmarks") || "[]").length,
  }));
  /* drawer 抽屉：中键唤出 → 墙内书签区 */
  await af.evaluate((f) => {
    const cur = JSON.parse(localStorage.getItem("start:settings") || "{}");
    localStorage.setItem("start:settings", JSON.stringify({ ...cur, linksForm: "drawer" }));
  }, origForm);
  await reloadApp();
  await af.evaluate(() => document.body.dispatchEvent(new MouseEvent("mousedown", { button: 1, bubbles: true })));
  await sleep(1400);
  const n31c = await af.evaluate(() => {
    const zone = document.querySelector(".cl-links-drawer");
    return { open: !!zone, items: zone ? zone.querySelectorAll(".bkm-item").length : -1 };
  });
  await af.evaluate(() => document.body.dispatchEvent(new MouseEvent("mousedown", { button: 1, bubbles: true })));
  await sleep(1200);
  /* 收场还原 */
  await af.evaluate((f) => {
    const cur = JSON.parse(localStorage.getItem("start:settings") || "{}");
    localStorage.setItem("start:settings", JSON.stringify({ ...cur, linksForm: f }));
    localStorage.removeItem("start:bookmarks");
  }, origForm);
  judge("N31 书签区常驻态：磁贴下方渲染 3 条+标题 → 删除 1 条（UI+LS 双同步）",
    n31a.zone && n31a.items === 3 && n31a.title && delClicked && n31b.items === 2 && n31b.ls === 2,
    JSON.stringify({ a: n31a, del: delClicked, b: n31b }));
  judge("N31 书签区抽屉态：中键唤出磁贴墙内渲染 2 条",
    n31c.open && n31c.items === 2, JSON.stringify(n31c));
}

await page.screenshot({ path: SHOTS + "/final.png" }).catch(() => { });
console.log(`\n===== visual v8.7.36: ${passCount} PASS / ${failCount} FAIL =====`);
process.exit(failCount ? 1 : 0);
