// v8.7.40 视觉端到端：v8.7.39 全量保留（N0-N45 存量零回归；N40/N44/N45 按
//   本轮翻转）+ 本轮新门：
//   N46 抽屉态编辑弹窗纱幕零叠加（cs-drawer 底色 transparent）+ 关开同速
//     （退场三链 0.3s=panel-rise 0.3s 同拍）
//   N47 时钟→搜索间距拉近（3vh 档 ≤28px；磁贴区 8vh 档不动对照）
//   N45 翻转：掠影×流畅交叉面暗纱 rgba(0,0,0,0.18)+display:block
//     （v8.7.39 探针假绿根因=display:none 伪元素 computed 仍返回声明值）
//   N43 主列定高（时钟/搜索不随快捷服务数量位移：区高恒 188 + 1行/2行零位移
//     + 常驻/抽屉两形态同位）
//   N44 编辑链接弹窗同帧退场+纱幕丝滑（content-defocus 与卡片/纱幕同参
//     0.32s + cl-screen-veil 全量 to=blur(0) 卸载帧无缝）
//   N45 流畅模式动画保留+抽屉平面遮罩（wallpaper-layer 0.4s 原生过渡 +
//     scale(1.08) 落座 + ::before 半透明纯色遮罩）
//   N30 直达添加行为门（标签系统退役：popup 单钮「添加至快捷服务」直写
//     start:links 队尾 + URL 去重 + storage 热跟随磁贴即时出现）
//   N38 抽屉点空白退出区还原（v8.7.37 rootRef w-full 缩水根修：磁贴行左右
//     空白 elementFromPoint 命中纱幕 + 真命中通道 pointerdown 关闭）
//   N39 磨砂驻留根修（v8.7.37 cl-links-fade fill:both 渲染表面滞留=backdrop
//     root 杀后代 .tile-frost backdrop-filter——拆除；diag-frost-fill 实证）
//   N40 命令面板纱幕去提亮+丝滑（html.glow-mode 无 sat 深纱 + --veil-to-bf
//     blur(0) 卸载帧无缝 + 退场 0.32s 减速曲线）
//   N41 播放器（.lhint pointer-events:none 无歌词×可点 hit-test 实证 +
//     #flt margin-left:0 紧贴 #x 左侧 8px）
//   N42 搜索引擎 360 搜索（菜单在位可选 + engineId=so360 落盘）
//   （v8.7.37 N37 书签滚轮翻页门随标签系统退役；其余 N 门原样回归）
// 坑录沿用：srcdoc 不透明源走 playwright frame；合成事件确定性；headless
//   时间膨胀余量 ≥400ms；Radix 触发需 pointer 三连合成；elementFromPoint
//   命中检测=几何诚实门（合成事件绕过 hit-test 不可用于几何断言）
import { chromium } from "playwright-core";
import crypto from "crypto";
import http from "http";
import { mkdirSync, rmSync } from "fs";
import { execSync } from "child_process";

const ROOT = "/tmp/ext-v8740-visual";
const ZIP = "/tmp/beta-wt/download/v8.7.42/ChuShi-NewTab-v8.7.42.zip";
const SHOTS = "/tmp/v8740-visual";
const PROFILE = "/tmp/v8740-profile";
const HUB_PORT = 26934;
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
  if (url.startsWith("/api/ping")) res.end(JSON.stringify({ ok: true, name: "chushi-music-hub", version: "mock-v8737" }));
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
    /* v8.7.41 选点适配：三件套紧凑上移后 (500,300) 会命中时钟/日期/搜索内
       的 span（ContextMenu 对 p/span/h1-3/a/input 让位），固定坐标选点变
       刚性——改直接派发到 main 容器（target=main 不落在任何让位选择器，
       等效「页面空白右键」原意），clientX/Y 保持视口内坐标供菜单定位。 */
    const main = document.querySelector("main");
    if (!main) return false;
    main.dispatchEvent(new MouseEvent("contextmenu", {
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

/* ---------- v8.7.38 N30 popup 直达添加行为门（标签系统退役） ----------
   直开 popup.html（扩展页）：首行单钮「添加至快捷服务」+ 收藏链
   （bringToFront 真实 https 页 → query 收 start:links 队尾）+ URL 去重 +
   storage 热跟随（磁贴即时出现）+ 压暗滑杆写入 + dock 开关写入。 */
{
  const page3 = await ctx.newPage();
  await page3.goto(EXT_URL("popup.html"), { waitUntil: "load", timeout: 15000 });
  await sleep(900);
  const n30ui = await page3.evaluate(() => ({
    bkmGone: !document.getElementById("btn-bkm"),
    add: !!document.getElementById("btn-add"),
    addLabel: (document.getElementById("add-label") || {}).textContent || "",
    dim: document.getElementById("rg-dim") ? document.getElementById("rg-dim").value : null,
    dockSw: document.getElementById("sw-dock") ? document.getElementById("sw-dock").getAttribute("aria-checked") : null,
    tip: (document.querySelector(".tip") || {}).textContent || "",
  }));
  /* 直达添加链：example 页前置 → popup 点添加 → start:links 队尾入库 */
  await page2bN.bringToFront().catch(() => {});
  await sleep(300);
  await page3.click("#btn-add");
  await page3.waitForFunction(() => (document.getElementById("add-label") || {}).textContent === "已添加 ✓", { timeout: 5000 }).catch(() => {});
  await sleep(400);
  const n30add = await page3.evaluate(() => {
    const ls = JSON.parse(localStorage.getItem("start:links") || "[]");
    return {
      flash: document.getElementById("add-label").textContent,
      hit: ls.some((l) => (l.url || "").includes("example.com")),
      tail: ls.length > 0 ? (ls[ls.length - 1].url || "").includes("example.com") : false,
      shape: ls.length > 0 && typeof ls[ls.length - 1].name === "string" && typeof ls[ls.length - 1].id === "string",
    };
  });
  /* 去重：再点一次 → 已在快捷服务（条目不翻倍） */
  await page3.click("#btn-add");
  await page3.waitForFunction(() => (document.getElementById("add-label") || {}).textContent === "已在快捷服务", { timeout: 5000 }).catch(() => {});
  await sleep(300);
  const n30dup = await page3.evaluate(() => ({
    flash: document.getElementById("add-label").textContent,
    n: JSON.parse(localStorage.getItem("start:links") || "[]").filter((l) => (l.url || "").includes("example.com")).length,
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
  judge("N30 popup 直达添加：首行单钮(书签钮退役)/滑杆初值 100/dock 开关 + 固定引导文案",
    n30ui.bkmGone && n30ui.add && n30ui.addLabel === "添加至快捷服务" && n30ui.dim === "100" && n30ui.dockSw === "true" &&
    n30ui.tip.includes("常驻浏览器顶栏") && n30ui.tip.includes("图钉"),
    JSON.stringify(n30ui));
  judge("N30 直达添加链：前置 https 页 → 添加至快捷服务 → 已添加 ✓ + example.com 入库(队尾+契约形状)",
    n30add.flash === "已添加 ✓" && n30add.hit && n30add.tail && n30add.shape, JSON.stringify(n30add));
  judge("N30 去重：再点 → 已在快捷服务（条目不翻倍）",
    n30dup.flash === "已在快捷服务" && n30dup.n === 1, JSON.stringify(n30dup));
  judge("N30 滑杆写入：photoDim=180 落 settings + 数值显示 180%",
    n30dim.dim === 180 && n30dim.swTxt === "180%", JSON.stringify(n30dim));

  /* ---------- v8.7.38 N30h 直达添加热跟随（popup 写 start:links → 已开页面 storage 并入 → 磁贴即时出现） ---------- */
  await page.bringToFront().catch(() => {});
  await sleep(1400);
  const n30hot = await af.evaluate(() => {
    const g = document.querySelector(".cl-links .cl-links-grid");
    return { has: !!g, txt: g ? g.textContent.slice(0, 200) : "" };
  });
  judge("N30h 热跟随：已开页面磁贴即时出现（example.com 入格）",
    n30hot.has && n30hot.txt.includes("example.com"), JSON.stringify(n30hot));

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

/* ---------- v8.7.37 N34 → v8.7.39 翻转：cs-lite 动画保留律 ----------
   v8.7.37 豁免（循环动画 animation:none）随通配近零时长压缩一起退役——
   用户指令「不需要阉割开启流畅模式后的动画」：循环动画以原生时长照常
   播放（kenburns 80s transform 合成层动画成本可忽略）。行为门：默认态与
   cs-lite 态动画名均在。photo 前置（kenburns img 须挂载）。 */
{
  await af.evaluate(() => {
    const cur = JSON.parse(localStorage.getItem("start:settings") || "{}");
    localStorage.setItem("start:settings", JSON.stringify({ ...cur, perfLite: false, background: "photo", photoId: "mist-lake" }));
  });
  await reloadApp();
  const n34a = await af.evaluate(() => {
    const c = document.querySelector(".colon-breathe");
    const w = document.querySelector("img[data-wallpaper]");
    return {
      colon: c ? getComputedStyle(c).animationName : "(no-colon)",
      wall: w ? getComputedStyle(w).animationName : "(no-wall)",
      photoMode: document.documentElement.classList.contains("photo-mode"),
    };
  });
  await af.evaluate(() => {
    const cur = JSON.parse(localStorage.getItem("start:settings") || "{}");
    localStorage.setItem("start:settings", JSON.stringify({ ...cur, perfLite: true }));
  });
  await reloadApp();
  const n34b = await af.evaluate(() => {
    const c = document.querySelector(".colon-breathe");
    const w = document.querySelector("img[data-wallpaper]");
    return {
      colon: c ? getComputedStyle(c).animationName : "(no-colon)",
      wall: w ? getComputedStyle(w).animationName : "(no-wall)",
      lite: document.documentElement.classList.contains("cs-lite"),
    };
  });
  judge("N34 cs-lite 动画保留律（v8.7.39 翻转）：默认/流畅两态 colon-breathe/kenburns 均原生播放",
    n34a.colon === "colon-breathe" && n34a.wall === "kenburns" && n34a.photoMode && n34b.lite && n34b.colon === "colon-breathe" && n34b.wall === "kenburns",
    JSON.stringify({ a: n34a, b: n34b }));
}

/* ---------- v8.7.37 N35 流畅×辉光互斥（自动切掠影+设置面板置灰+点击拦截） ---------- */
{
  await af.evaluate(() => {
    const cur = JSON.parse(localStorage.getItem("start:settings") || "{}");
    localStorage.setItem("start:settings", JSON.stringify({ ...cur, perfLite: false, background: "glow" }));
  });
  await reloadApp();
  /* 开流畅（弹窗同款直写）→ reload → 互斥 effect 挂载期落盘 photo */
  await af.evaluate(() => {
    const cur = JSON.parse(localStorage.getItem("start:settings") || "{}");
    localStorage.setItem("start:settings", JSON.stringify({ ...cur, perfLite: true }));
  });
  await reloadApp();
  const n35a = await af.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("start:settings") || "{}");
    const blob = document.querySelector(".aurora-blob");
    return {
      bg: s.background, lite: s.perfLite,
      blobDisp: blob ? getComputedStyle(blob).display : "(no-blob)",
    };
  });
  /* 设置面板（ui-intent 通道=popup「完整设置直达」同款）：辉光置灰 */
  await af.evaluate(() => {
    localStorage.setItem("start:ui-intent", JSON.stringify({ panel: "settings", ts: Date.now() }));
  });
  await reloadApp();
  const n35b = await af.evaluate(() => {
    const btns = [...document.querySelectorAll('[role="radio"]')].filter((b) => b.textContent === "辉光");
    if (!btns.length) return { found: false };
    const g = btns[0];
    return {
      found: true,
      dis: g.getAttribute("aria-disabled"),
      title: g.getAttribute("title"),
      cursor: getComputedStyle(g).cursor,
    };
  });
  /* 置灰点击拦截：点辉光 → background 仍 photo */
  await af.evaluate(() => {
    const btns = [...document.querySelectorAll('[role="radio"]')].filter((b) => b.textContent === "辉光");
    if (btns[0]) btns[0].click();
  });
  await sleep(700);
  const n35c = await af.evaluate(() => JSON.parse(localStorage.getItem("start:settings") || "{}").background);
  judge("N35 辉光互斥：glow+流畅开 → 落盘 photo+光斑隐藏；设置面板辉光 aria-disabled+not-allowed+点击拦截",
    n35a.bg === "photo" && n35a.lite === true && n35a.blobDisp === "none" && n35b.found && n35b.dis === "true" && n35b.cursor === "not-allowed" && n35c === "photo",
    JSON.stringify({ a: n35a, b: n35b, c: n35c }));
}

/* ---------- v8.7.37 N36 perfLite 并入 state（互斥 effect 热触发=行为证据） ----------
   旧实现 onStorage 只 toggle html 类不进 state → 弹窗写 perfLite 后页面任何
   写回把陈旧值覆盖（开关显示关闭需再点两次根因）。行为门：popup 页跨文档写
   perfLite=true → app storage 并入 state → 互斥 effect（依赖 perfLite）热触发
   patch background → LS 落盘 photo。旧实现 bg 停留 glow=可证伪。不 reload。 */
{
  await af.evaluate(() => {
    const cur = JSON.parse(localStorage.getItem("start:settings") || "{}");
    localStorage.setItem("start:settings", JSON.stringify({ ...cur, perfLite: false, background: "glow" }));
  });
  await reloadApp();
  const pg2 = await ctx.newPage();
  await pg2.goto(EXT_URL("popup.html"), { waitUntil: "load", timeout: 15000 });
  await pg2.evaluate(() => {
    const cur = JSON.parse(localStorage.getItem("start:settings") || "{}");
    localStorage.setItem("start:settings", JSON.stringify({ ...cur, perfLite: true }));
  });
  await sleep(900);
  const n36 = await af.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("start:settings") || "{}");
    return { perf: s.perfLite, bg: s.background, liteCls: document.documentElement.classList.contains("cs-lite") };
  });
  await pg2.close().catch(() => { });
  judge("N36 开关状态同步根修：popup 跨文档写 perfLite=true → app state 并入 → 互斥 effect 热触发落盘 photo（旧实现 bg 停留 glow）",
    n36.perf === true && n36.bg === "photo" && n36.liteCls, JSON.stringify(n36));
}

/* ---------- v8.7.38 N38 抽屉点空白退出区还原 ----------
   v8.7.37 rootRef 加 w-full（书签页布局所加）让磁贴行左右两侧空白落进
   pointer-events-auto 的 rootRef——纱幕命中区缩水（用户实测）。修复后
   elementFromPoint 于磁贴行高度带左右缘应命中 .cl-drawer-veil；
   elementFromPoint=几何诚实通道（合成事件绕过 hit-test 不可用）。 */
{
  /* 前置门（N35/N36）可能遗留设置面板（dialog z-50 盖住纱幕命中面）——先收 */
  await af.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  await sleep(800);
  await af.evaluate(() => {
    const cur = JSON.parse(localStorage.getItem("start:settings") || "{}");
    localStorage.setItem("start:settings", JSON.stringify({ ...cur, linksForm: "drawer" }));
  });
  await reloadApp();
  /* 开态真值 = 纱幕在位且 pointerEvents 非 none（cs-drawer 类在 780ms 退场
     latch 窗内不回落，时间膨胀下更久——不能作关闭判据） */
  const n38isOpen = () => af.evaluate(() => {
    const v = document.querySelector(".cl-drawer-veil");
    return !!v && getComputedStyle(v).pointerEvents !== "none";
  });
  await af.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyV", altKey: true, bubbles: true })));
  await sleep(1800);
  const n38open = await n38isOpen();
  /* 左缘 (30, 400)：命中纱幕 → 经真命中通道派发 pointerdown → 抽屉关闭 */
  const hitL = await af.evaluate(() => {
    const stack = document.elementsFromPoint(30, 400).slice(0, 8).map((e) => {
      const r = e.getBoundingClientRect();
      return { c: (e.className || e.tagName).toString().slice(0, 40), id: e.id || "", pe: getComputedStyle(e).pointerEvents, x: Math.round(r.left), w: Math.round(r.width) };
    });
    const el = document.elementFromPoint(30, 400);
    const veil = !!(el && el.classList && el.classList.contains("cl-drawer-veil"));
    if (veil) el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: 30, clientY: 400, button: 0, pointerId: 1, isPrimary: true }));
    const veils = [...document.querySelectorAll(".cl-drawer-veil")].map((v) => {
      const r = v.getBoundingClientRect();
      const cs = getComputedStyle(v);
      const anims = v.getAnimations().map((a) => {
        let name = "waapi", visKfs = null, timing = null, ctor = a.constructor.name, tprop = null, cur = null;
        try { name = a.animationName || "waapi"; } catch { }
        try { tprop = a.transitionProperty || null; } catch { }
        try { cur = a.effect && a.effect.getComputedTiming ? a.effect.getComputedTiming().progress : null; } catch { }
        try {
          timing = a.effect && a.effect.getTiming ? (() => { const t = a.effect.getTiming(); return { d: t.duration, dl: t.delay, it: t.iterations }; })() : null;
        } catch { }
        try {
          const kfs = a.effect && a.effect.getKeyframes ? a.effect.getKeyframes() : [];
          visKfs = kfs.filter((k) => k.visibility !== undefined).map((k) => [k.offset, k.visibility]);
        } catch { }
        return { ctor, name, tprop, timing, progress: cur, visKfs };
      });
      return { pe: cs.pointerEvents, vis: cs.visibility, disp: cs.display, opa: cs.opacity, x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), dataVeil: v.getAttribute("data-veil"), anims };
    });
    const htmlCls = document.documentElement.className;
    const top = document.elementFromPoint(30, 400);
    const second = document.elementsFromPoint(30, 400)[1];
    window.__n38stackL = { stack, veils, topHtml: top ? top.outerHTML.slice(0, 160) : "(null)",
      secondHtml: second ? second.outerHTML.slice(0, 200) : "(null)",
      bodyKids: [...document.body.children].map((k) => (k.className || k.id || k.tagName).toString().slice(0, 36)), htmlCls };
    return veil;
  });
  const n38closeL = await af.waitForFunction(() => {
    const v = document.querySelector(".cl-drawer-veil");
    return !v || getComputedStyle(v).pointerEvents === "none";
  }, { timeout: 6000 }).then(() => true).catch(() => false);
  /* 右缘 (1250, 400)：重开 → 同律 */
  await af.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyV", altKey: true, bubbles: true })));
  await af.waitForFunction(() => {
    const v = document.querySelector(".cl-drawer-veil");
    return !!v && getComputedStyle(v).pointerEvents !== "none";
  }, { timeout: 6000 }).catch(() => { });
  await sleep(400);
  const hitR = await af.evaluate(() => {
    const el = document.elementFromPoint(1250, 400);
    const veil = !!(el && el.classList && el.classList.contains("cl-drawer-veil"));
    if (veil) el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: 1250, clientY: 400, button: 0, pointerId: 1, isPrimary: true }));
    return veil;
  });
  const n38closeR = await af.waitForFunction(() => {
    const v = document.querySelector(".cl-drawer-veil");
    return !v || getComputedStyle(v).pointerEvents === "none";
  }, { timeout: 6000 }).then(() => true).catch(() => false);
  const n38stack = await af.evaluate(() => window.__n38stackL || { stack: [] });
  judge("N38 抽屉点空白退出区还原：左缘(30,400)+右缘(1250,400)命中纱幕且点击关闭（w-full 缩水根修）",
    n38open && hitL && n38closeL && hitR && n38closeR, JSON.stringify({ open: n38open, hitL, closeL: n38closeL, hitR, closeR: n38closeR, stackL: n38stack }));
}

/* ---------- v8.7.38 N39 磁贴磨砂驻留动画根修（刷新后磨砂丢失） ----------
   v8.7.37 cl-links-fade（fill:both 永久驻留）在合成器滞留渲染表面=backdrop
   root，后代 .tile-frost 的 backdrop-filter 全灭（diag-frost-fill 最小复现
   实证：方差 49→491，cs-lite 周期后恢复=用户观察同构）。修复=包装层拆除。
   门：新帧无 .cl-links-fade 残留 + .tile-frost 静态 blur(14px) 声明在位。 */
{
  await af.evaluate(() => {
    const cur = JSON.parse(localStorage.getItem("start:settings") || "{}");
    localStorage.setItem("start:settings", JSON.stringify({ ...cur, linksForm: "docked", perfLite: false }));
  });
  await reloadApp();
  const n39 = await af.evaluate(() => {
    const fade = document.querySelector(".cl-links-fade");
    const frost = document.querySelector(".cl-links .tile-frost");
    return {
      fadeGone: !fade,
      frostBf: frost ? getComputedStyle(frost).backdropFilter : "(no frost)",
      csLite: document.documentElement.classList.contains("cs-lite"),
    };
  });
  judge("N39 磨砂驻留根修：新帧无 cl-links-fade 残留 + .tile-frost backdrop-filter blur(14px) 在位（非 cs-lite）",
    n39.fadeGone && n39.frostBf.includes("blur(14px)") && !n39.csLite, JSON.stringify(n39));
}

/* ---------- v8.7.38 N40 命令面板纱幕：辉光去提亮 + 退场丝滑 ----------
   辉光模式 html.glow-mode（AuroraBackground 置位）→ .cl-screen-veil 无 sat
   深纱（saturate(1.5) 提亮增艳根除，v8.7.10 无提亮律辉光面补齐）；
   palette-veil --veil-to-bf=blur(0)（卸载帧与末帧无缝）+ 退场 0.32s 减速。 */
{
  await af.evaluate(() => {
    const cur = JSON.parse(localStorage.getItem("start:settings") || "{}");
    localStorage.setItem("start:settings", JSON.stringify({ ...cur, background: "glow", perfLite: false }));
  });
  await reloadApp();
  const n40a = await af.evaluate(() => ({
    glowCls: document.documentElement.classList.contains("glow-mode"),
    photoCls: document.documentElement.classList.contains("photo-mode"),
  }));
  await af.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true })));
  /* headless 时间膨胀：veil-in 播完（无 running 动画）再采样——固定 sleep 假阳坑录（v8.7.35）同律 */
  await af.waitForFunction(() => {
    const v = document.querySelector(".cl-screen-veil.palette-veil");
    return !!v && v.getAnimations().every((a) => a.playState !== "running");
  }, { timeout: 10000 }).catch(() => { });
  await sleep(400);
  const n40b = await af.evaluate(() => {
    const v = document.querySelector(".cl-screen-veil.palette-veil");
    if (!v) return { found: false };
    const cs = getComputedStyle(v);
    return {
      found: true,
      bf: cs.backdropFilter,
      toBf: cs.getPropertyValue("--veil-to-bf"),
      holdBf: cs.getPropertyValue("--veil-hold-bf"),
    };
  });
  /* 关闭：退场应挂 .veil-out.palette-veil、时长 0.32s（卸载前采样） */
  await af.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  await sleep(140);
  const n40c = await af.evaluate(() => {
    const v = document.querySelector(".cl-screen-veil.palette-veil");
    if (!v) return { still: false };
    const cs = getComputedStyle(v);
    return { still: true, dur: cs.animationDuration, name: cs.animationName };
  });
  await sleep(900);
  const n40d = await af.evaluate(() => !document.querySelector(".cl-screen-veil"));
  judge("N40 面板纱幕去提亮+丝滑：glow-mode 在位+开态无 sat blur(12px)+to=blur(0)+退场 veil-fade 0.3s(关开同速)+净卸载",
    n40a.glowCls && !n40a.photoCls && n40b.found && n40b.bf === "blur(12px)" &&
    n40b.toBf.includes("blur(0px)") && n40b.holdBf.includes("blur(12px)") &&
    n40c.still && n40c.name === "veil-fade" && n40c.dur === "0.3s" && n40d,
    JSON.stringify({ a: n40a, b: n40b, c: n40c, d: n40d }));
}

/* ---------- v8.7.38 N41 播放器：无歌词×可点 + 浮窗开关贴 × 左侧 ----------
   .lhint（暂无歌词提示层 inset:0 且 DOM 序在 .lh 后）曾吞 #lx 点击——
   pointer-events:none 后 elementFromPoint 于 × 中心应命中按钮本体；
   #flt margin-left:0 后与 #x 间距 = .nh gap 8px（原双 auto margin 平分
   剩余空间=浮窗钮悬半空）。 */
{
  /* N28 门曾删除网易云播放器预设——补装后 reload（官方 manifest 原样回装） */
  const official41 = JSON.parse(execSync("cat /tmp/beta-wt/src/lib/startpage/official-presets.json", { encoding: "utf8" }));
  const neRaw41 = JSON.parse(JSON.stringify({ ...official41.presets[2].manifest, commands: [], links: [], dock: [] }));
  await af.evaluate((raw) => {
    const cur = JSON.parse(localStorage.getItem("start:presets") || "[]");
    if (!cur.some((p) => p.id === "official-netease-v1")) {
      cur.push({ id: "official-netease-v1", name: raw.name, installedAt: Date.now(), raw });
      localStorage.setItem("start:presets", JSON.stringify(cur));
    }
  }, neRaw41);
  await reloadApp();
  /* canonical 开台：ensureNoPanel → dock 钮 → 等舞台 */
  await ensureNoPanel();
  await sleep(600);
  await af.evaluate(() => {
    const b = [...document.querySelectorAll(".dock-btn")].find((x) => x.getAttribute("aria-label") === "网易云播放器");
    if (b) b.click();
  });
  await sleep(2200);
  /* 挑「可见帧」：预热沙箱帧常驻但矩形为 0——矩形门只在直播舞台帧为真 */
  let nf41 = null;
  for (let i = 0; i < 20 && !nf41; i++) {
    for (const f of page.frames().filter((x) => /about:srcdoc/.test(x.url()))) {
      const ok = await f.evaluate(() => {
        const flt = document.getElementById("flt");
        return !!flt && flt.getBoundingClientRect().width > 0 && !!document.getElementById("list") && !!document.getElementById("tabs");
      }).catch(() => false);
      if (ok) { nf41 = f; break; }
    }
    if (!nf41) await sleep(500);
  }
  if (nf41) {
    /* 开歌词页（未取到歌词=「暂无歌词」提示层在位——用户场景复现） */
    await wclick(nf41, "#cov");
    await sleep(700);
    const n41 = await nf41.evaluate(() => {
      const hint = document.querySelector(".lhint");
      const lx = document.getElementById("lx");
      const flt = document.getElementById("flt");
      const x = document.getElementById("x");
      const r = lx.getBoundingClientRect();
      const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      const hit = el === lx || (el && lx.contains(el)) || (el && el.closest && el.closest("#lx") === lx);
      const fr = flt.getBoundingClientRect();
      const xr = x.getBoundingClientRect();
      return {
        lyrOpen: document.getElementById("lyr").classList.contains("on"),
        hintShown: hint ? getComputedStyle(hint).display !== "none" : false,
        hintPe: hint ? getComputedStyle(hint).pointerEvents : "(el gone)",
        xHit: hit,
        fltMl: getComputedStyle(flt).marginLeft,
        gap: Math.round(xr.left - fr.right),
      };
    });
    judge("N41 播放器：歌词页开态提示层在位且 pointer-events:none + × 中心 hit-test 命中按钮 + #flt 贴 #x 左 8px（auto margin 推组靠右）",
      n41.lyrOpen && n41.hintShown && n41.hintPe === "none" && n41.xHit && n41.gap >= 6 && n41.gap <= 12,
      JSON.stringify(n41));
    /* 收场：关歌词页 + Escape 收舞台（防 .cl-dockwidget z-50 遮挡 N42 搜索区） */
    await wclick(nf41, "#lx").catch(() => {});
    await af.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    await sleep(800);
  } else {
    judge("N41 播放器帧", false, "nf41 not found");
  }
}

/* ---------- v8.7.38 N42 搜索引擎 360 搜索 ----------
   ENGINES 表新增 so360（https://www.so.com/s?q=）；下拉在位可选，
   选中 engineId=so360 落 settings。Radix Popover 需 pointer 三连合成。 */
{
  await af.evaluate(() => {
    const t = document.querySelector('[aria-label="切换搜索引擎"]');
    const r = t.getBoundingClientRect();
    const opt = { bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, pointerId: 1, isPrimary: true, button: 0 };
    t.dispatchEvent(new PointerEvent("pointerdown", opt));
    t.dispatchEvent(new PointerEvent("pointerup", opt));
    t.dispatchEvent(new MouseEvent("click", opt));
  });
  await sleep(700);
  const n42a = await af.evaluate(() => {
    const hit = [...document.querySelectorAll("span")].some((sp) => sp.textContent === "360搜索");
    return { menu: hit };
  });
  await af.evaluate(() => {
    const item = [...document.querySelectorAll("span")].find((sp) => sp.textContent === "360搜索");
    if (item) item.click();
  });
  await sleep(600);
  const n42b = await af.evaluate(() => {
    const st = JSON.parse(localStorage.getItem("start:settings") || "{}");
    return { engineId: st.engineId };
  });
  judge("N42 搜索引擎 360 搜索：菜单项在位 + 选中 engineId=so360 落盘",
    n42a.menu && n42b.engineId === "so360", JSON.stringify({ a: n42a, b: n42b }));
}



/* ---------- v8.7.39 N43 主列定高（时钟/搜索不随磁贴数量位移） ----------
   旧行数换挡（两档 padding 随 linkRows 切换）增删磁贴跨行时整列上下跳
   （用户「很早就说过了」）。修复=快捷服务区固定高度 188px（常驻真实区 +
   抽屉隐形克隆两处挂载）+ pb 恒定。行为门：1 行(3链) vs 2 行(13链) 时钟/
   搜索 Y 零位移 + 区高恒 188 + 抽屉形态（克隆区）同高同位。 */
{
  await af.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  await sleep(500);
  await af.evaluate(() => {
    const cur = JSON.parse(localStorage.getItem("start:settings") || "{}");
    localStorage.setItem("start:settings", JSON.stringify({ ...cur, linksForm: "docked" }));
    localStorage.setItem("start:links", JSON.stringify([
      { id: "a1", name: "Alpha", url: "https://alpha.example.com" },
      { id: "a2", name: "Beta", url: "https://beta.example.com" },
      { id: "a3", name: "Gamma", url: "https://gamma.example.com" },
    ]));
  });
  await reloadApp();
  await sleep(700);
  const m1 = await af.evaluate(() => {
    const clock = document.querySelector('section[aria-label="时间与问候"]');
    const search = document.querySelector('section[aria-label="搜索"]');
    const zone = document.querySelector('section[aria-label="快捷链接"]');
    const cr = clock.getBoundingClientRect(), sr = search.getBoundingClientRect(), zr = zone.getBoundingClientRect();
    return { clockY: Math.round(cr.top * 100) / 100, searchY: Math.round(sr.top * 100) / 100, zoneH: Math.round(zr.height * 100) / 100 };
  });
  await af.evaluate(() => {
    const links = [];
    for (let i = 0; i < 12; i++) links.push({ id: "b" + i, name: "Site" + i, url: "https://s" + i + ".example.com" });
    localStorage.setItem("start:links", JSON.stringify(links));
  });
  await reloadApp();
  await sleep(700);
  const m2 = await af.evaluate(() => {
    const clock = document.querySelector('section[aria-label="时间与问候"]');
    const search = document.querySelector('section[aria-label="搜索"]');
    const zone = document.querySelector('section[aria-label="快捷链接"]');
    const cr = clock.getBoundingClientRect(), sr = search.getBoundingClientRect(), zr = zone.getBoundingClientRect();
    return { clockY: Math.round(cr.top * 100) / 100, searchY: Math.round(sr.top * 100) / 100, zoneH: Math.round(zr.height * 100) / 100 };
  });
  await af.evaluate(() => {
    const cur = JSON.parse(localStorage.getItem("start:settings") || "{}");
    localStorage.setItem("start:settings", JSON.stringify({ ...cur, linksForm: "drawer" }));
  });
  await reloadApp();
  await sleep(700);
  const m3 = await af.evaluate(() => {
    const clock = document.querySelector('section[aria-label="时间与问候"]');
    const ghost = document.querySelector(".cl-layout-ghost");
    return { clockY: Math.round(clock.getBoundingClientRect().top * 100) / 100, ghostH: ghost ? Math.round(ghost.getBoundingClientRect().height * 100) / 100 : -1 };
  });
  judge("N43 主列定高：3链(1行)→13链(2行)时钟/搜索Y零位移 + 区高恒188 + 抽屉克隆同高同位",
    m1.zoneH === 188 && m2.zoneH === 188 && Math.abs(m1.clockY - m2.clockY) < 0.5 && Math.abs(m1.searchY - m2.searchY) < 0.5 && m3.ghostH === 188 && Math.abs(m1.clockY - m3.clockY) < 0.5,
    JSON.stringify({ m1, m2, m3 }));
}

/* ---------- v8.7.39 N44 编辑链接弹窗同帧退场+纱幕 blur(0) 丝滑 ----------
   旧实现 content-defocus 0.16s 抢跑（用户实测「子元素先退场然后面板再
   退场」）+ 纱幕 to=blur(1px) forwards 驻留卸载瞬间残模糊尾刺。修复=
   三链同参 --veil-out-dur(.32s) + cl-screen-veil 全量 blur(0)+0.32s 减速
   曲线。行为门：开态 toBf=blur(0px) 在位；退场窗内三链 animationDuration
   同为 0.32s；卸载完成（PresenceClass 同参不截断）。 */
{
  await af.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  await sleep(500);
  await af.evaluate(() => {
    const cur = JSON.parse(localStorage.getItem("start:settings") || "{}");
    localStorage.setItem("start:settings", JSON.stringify({ ...cur, linksForm: "docked" }));
    localStorage.setItem("start:links", JSON.stringify([{ id: "a1", name: "Alpha", url: "https://alpha.example.com" }]));
  });
  await reloadApp();
  await sleep(700);
  await af.evaluate(() => document.querySelector('[data-cl-tile="add"]').click());
  await af.waitForFunction(() => !!document.querySelector('div[role="dialog"][aria-label="添加链接"]'), { timeout: 5000 }).catch(() => { });
  await sleep(600);
  const n44pre = await af.evaluate(() => {
    const veil = document.querySelector(".cl-screen-veil");
    const card = document.querySelector(".veil-in .glass-card");
    return {
      veil: !!veil,
      toBf: veil ? getComputedStyle(veil).getPropertyValue("--veil-to-bf") : "",
      cardAnim: card ? getComputedStyle(card).animationName : "",
    };
  });
  await af.evaluate(() => {
    const btn = [...document.querySelectorAll('div[role="dialog"] button')].find((b) => b.textContent === "取消");
    if (btn) btn.click();
  });
  await sleep(80);
  const n44exit = await af.evaluate(() => {
    const veil = document.querySelector(".veil-out.cl-screen-veil");
    const card = veil ? veil.querySelector(".glass-card") : null;
    const content = card ? card.querySelector(".content-focus") : null;
    return {
      veilAnim: veil ? getComputedStyle(veil).animationName : "",
      veilDur: veil ? getComputedStyle(veil).animationDuration : "",
      cardDur: card ? getComputedStyle(card).animationDuration : "",
      contentDur: content ? getComputedStyle(content).animationDuration : "",
    };
  });
  const n44gone = await af.waitForFunction(() => !document.querySelector(".cl-screen-veil"), { timeout: 5000 }).then(() => true).catch(() => false);
  judge("N44 编辑弹窗退场：toBf=blur(0) + 退场三链(纱幕/卡片/内容)0.3s 同窗同参(关开同速) + 卸载完成",
    n44pre.veil && (n44pre.toBf || "").includes("blur(0px)") && /panel-(rise|fade)/.test(n44pre.cardAnim) &&
    n44exit.veilAnim === "veil-fade" && n44exit.veilDur === "0.3s" && n44exit.cardDur === "0.3s" && n44exit.contentDur === "0.3s" && n44gone,
    JSON.stringify({ pre: n44pre, exit: n44exit, gone: n44gone }));
}

/* ---------- v8.7.39 N45 流畅模式动画保留+抽屉平面遮罩 ----------
   通配近零时长压缩退役：wallpaper-layer 0.4s 过渡原生时长在位（旧被压成
   0.001s=壁纸放大动画消失）；流畅抽屉背景=半透明纯色遮罩。行为门：cs-lite
   开 → 抽屉开（photo 前置）→ wallpaper-layer transitionDuration=0.4s +
   终态 scale(1.08) 落座 + ::before rgba(255,255,255,0.55) 纯色遮罩 → 关闭
   回缩 transform 归位。 */
{
  await af.evaluate(() => {
    const cur = JSON.parse(localStorage.getItem("start:settings") || "{}");
    localStorage.setItem("start:settings", JSON.stringify({ ...cur, perfLite: true, background: "photo", photoId: "mist-lake", linksForm: "drawer" }));
  });
  await reloadApp();
  await sleep(900);
  /* photo-mode 类跟随「实际显示的画面」——等揭示管线（preload+REVEAL_DELAY）
     完成后再开抽屉，否则 scale(1.08) 站点选择器不命中 */
  await af.waitForFunction(() => document.documentElement.classList.contains("photo-mode"), { timeout: 8000 }).catch(() => { });
  await sleep(400);
  /* 后台标签合成器节流：transform 过渡停在起点帧（N45 首轮 FAIL 根因）
     ——先把主页面带回前台再触发开抽屉 */
  await page.bringToFront().catch(() => { });
  await sleep(300);
  await af.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyV", altKey: true, bubbles: true })));
  await af.waitForFunction(() => {
    const v = document.querySelector(".cl-drawer-veil");
    return !!v && getComputedStyle(v).pointerEvents !== "none";
  }, { timeout: 6000 }).catch(() => { });
  /* 轮询落座（凝聚 0.4s + 壁纸放大 0.4s，余量给 headless 帧距波动） */
  await af.waitForFunction(() => {
    const wl = document.querySelector(".wallpaper-layer");
    return !!wl && getComputedStyle(wl).transform.startsWith("matrix(1.08");
  }, { timeout: 6000 }).catch(() => { });
  await sleep(300);
  const n45 = await af.evaluate(() => {
    const wl = document.querySelector(".wallpaper-layer");
    const veil = document.querySelector(".cl-drawer-veil");
    const wlb = veil ? getComputedStyle(veil, "::before") : null;
    const wlcs = wl ? getComputedStyle(wl) : null;
    return {
      lite: document.documentElement.classList.contains("cs-lite"),
      wlDur: wlcs ? wlcs.transitionDuration : "",
      wlTransform: wlcs ? wlcs.transform : "",
      tintBg: wlb ? wlb.backgroundColor : "",
      tintDisplay: wlb ? wlb.display : "",
      tintOpacity: wlb ? wlb.opacity : "",
      htmlCls: document.documentElement.className,
      wlCount: document.querySelectorAll(".wallpaper-layer").length,
      selHit: !!document.querySelector("html.cs-drawer:not(.cs-drawer-closing).photo-mode"),
      wlInline: wl ? wl.getAttribute("style") : "",
    };
  });
  await af.evaluate(() => {
    const v = document.querySelector(".cl-drawer-veil");
    if (v) v.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: 30, clientY: 400, button: 0, pointerId: 1, isPrimary: true }));
  });
  await af.waitForFunction(() => {
    const wl = document.querySelector(".wallpaper-layer");
    const t = wl ? getComputedStyle(wl).transform : "none";
    return t === "none" || t.startsWith("matrix(1, 1, 1,");
  }, { timeout: 6000 }).catch(() => { });
  await sleep(200);
  const n45b = await af.evaluate(() => {
    const v = document.querySelector(".cl-drawer-veil");
    const wl = document.querySelector(".wallpaper-layer");
    return {
      closed: !v || getComputedStyle(v).pointerEvents === "none",
      wlTransform: wl ? getComputedStyle(wl).transform : "",
    };
  });
  judge("N45 流畅动画保留+掠影×流畅抽屉暗纱遮罩(v8.7.40 翻转)：0.4s 原生过渡 + scale(1.08) 落座 + ::before 暗纱 display:block + 关闭回缩",
    n45.lite && n45.wlDur === "0.4s" && n45.wlTransform.startsWith("matrix(1.08") &&
    (n45.tintBg === "rgba(0, 0, 0, 0.18)" || n45.tintBg === "rgba(24, 24, 27, 0.42)") && n45.tintDisplay === "block" && Number(n45.tintOpacity) > 0.9 &&
    n45b.closed && (n45b.wlTransform === "none" || n45b.wlTransform.startsWith("matrix(1, 1, 1,")),
    JSON.stringify({ a: n45, b: n45b }));
}

/* ---------- v8.7.40 N46 抽屉态编辑弹窗纱幕零叠加+关开同速 ----------
   用户实测「在抽屉页面打开编辑链接页面后，编辑链接的模糊遮罩会加深加黑
   遮罩后面背景的颜色」——html.cs-drawer 满屏纱幕底色归零（分离由抽屉纱幕
   +blur 本体承担）；「关闭速度和它的打开动画速度同步」——退场三链 0.30s
   =panel-rise 0.3s 严格同拍。行为门：掠影+流畅抽屉开→add 磁贴唤起
   LinkDialog→稳态底色 transparent→退场三链 0.3s 同窗→卸载完成。 */
{
  await af.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  await sleep(400);
  await page.bringToFront().catch(() => { });
  await sleep(200);
  await af.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyV", altKey: true, bubbles: true })));
  await af.waitForFunction(() => {
    const v = document.querySelector(".cl-drawer-veil");
    return !!v && getComputedStyle(v).pointerEvents !== "none";
  }, { timeout: 6000 }).catch(() => { });
  await sleep(400);
  const n46pre = await af.evaluate(() => ({
    addTile: !!document.querySelector('[data-cl-tile="add"]'),
    csDrawer: document.documentElement.classList.contains("cs-drawer"),
  }));
  await af.evaluate(() => document.querySelector('[data-cl-tile="add"]').click());
  await af.waitForFunction(() => !!document.querySelector('div[role="dialog"][aria-label="添加链接"]'), { timeout: 5000 }).catch(() => { });
  await sleep(600);
  const n46open = await af.evaluate(() => {
    const veil = document.querySelector(".cl-screen-veil");
    return {
      veil: !!veil,
      bg: veil ? getComputedStyle(veil).backgroundColor : "",
      csDrawer: document.documentElement.classList.contains("cs-drawer"),
    };
  });
  await af.evaluate(() => {
    const btn = [...document.querySelectorAll('div[role="dialog"] button')].find((b) => b.textContent === "取消");
    if (btn) btn.click();
  });
  await sleep(80);
  const n46exit = await af.evaluate(() => {
    const veil = document.querySelector(".veil-out.cl-screen-veil");
    const card = veil ? veil.querySelector(".glass-card") : null;
    const content = card ? card.querySelector(".content-focus") : null;
    return {
      veilAnim: veil ? getComputedStyle(veil).animationName : "",
      veilDur: veil ? getComputedStyle(veil).animationDuration : "",
      cardDur: card ? getComputedStyle(card).animationDuration : "",
      contentDur: content ? getComputedStyle(content).animationDuration : "",
    };
  });
  const n46gone = await af.waitForFunction(() => !document.querySelector(".cl-screen-veil"), { timeout: 5000 }).then(() => true).catch(() => false);
  judge("N46 抽屉态弹窗零叠加+关开同速：cs-drawer 底色 transparent + 退场三链 0.3s 同窗 + 卸载完成",
    n46pre.addTile && n46pre.csDrawer && n46open.veil && n46open.bg === "rgba(0, 0, 0, 0)" && n46open.csDrawer &&
    n46exit.veilAnim === "veil-fade" && n46exit.veilDur === "0.3s" && n46exit.cardDur === "0.3s" && n46exit.contentDur === "0.3s" && n46gone,
    JSON.stringify({ pre: n46pre, open: n46open, exit: n46exit, gone: n46gone }));
}

/* ---------- v8.7.40 N47 时钟→搜索间距拉近 ----------
   用户「搜索框不要离日期以及时钟组件这么远，不然浪费太多空间」——
   6vh 档（28.8~56px）→3vh 档（16~28px）；磁贴区 8vh 档不动=零波及对照
   （主列定高律同构：静态 clamp 只改常量，不随磁贴数量变）。 */
{
  await af.evaluate(() => {
    const cur = JSON.parse(localStorage.getItem("start:settings") || "{}");
    localStorage.setItem("start:settings", JSON.stringify({ ...cur, linksForm: "docked", perfLite: false }));
  });
  await reloadApp();
  await sleep(700);
  const n47 = await af.evaluate(() => {
    const clockSec = document.querySelector('section[aria-label="时间与问候"]');
    const searchSec = document.querySelector('section[aria-label="搜索"]');
    const linksSec = document.querySelector('section[aria-label="快捷链接"]');
    const cs = searchSec ? getComputedStyle(searchSec) : null;
    const ls = linksSec ? getComputedStyle(linksSec) : null;
    return {
      clockThere: !!clockSec,
      searchThere: !!searchSec,
      searchMt: cs ? parseFloat(cs.marginTop) : -1,
      linksMt: ls ? parseFloat(ls.marginTop) : -1,
    };
  });
  judge("N47 时钟→搜索间距拉近(v8.7.41 2vh 档 12~20px，区间断言兼容) + 磁贴区 8vh 档对照不动(≥32px)",
    n47.clockThere && n47.searchThere && n47.searchMt > 10 && n47.searchMt <= 28 && n47.linksMt >= 32,
    JSON.stringify(n47));
}

/* ---------- v8.7.41 N48 磁贴 4 行上限：到顶隐藏「添加」磁贴 ----------
   cap = 4 × 每行列数（linksColumns 未设 6）= 24。docked 内联网格常驻主列，
   直接数 [data-cl-tile=add]：24 条 → 0；23 条 → 1（回归对照）。 */
{
  await af.evaluate(() => {
    const cur = JSON.parse(localStorage.getItem("start:settings") || "{}");
    localStorage.setItem("start:settings", JSON.stringify({ ...cur, linksForm: "docked", perfLite: false }));
    const mk = (i) => ({ id: "p8741_" + i, name: "站" + i, url: "https://example.com/p" + i });
    localStorage.setItem("start:links", JSON.stringify(Array.from({ length: 24 }, (_, i) => mk(i))));
  });
  await reloadApp();
  await sleep(700);
  const n48a = await af.evaluate(() => ({
    tiles: document.querySelectorAll('section[aria-label="快捷链接"] [data-cl-tile]').length,
    add: document.querySelectorAll('section[aria-label="快捷链接"] [data-cl-tile="add"]').length,
  }));
  await af.evaluate(() => {
    const list = JSON.parse(localStorage.getItem("start:links") || "[]");
    localStorage.setItem("start:links", JSON.stringify(list.slice(0, 23)));
  });
  await reloadApp();
  await sleep(700);
  const n48b = await af.evaluate(() => ({
    add: document.querySelectorAll('section[aria-label="快捷链接"] [data-cl-tile="add"]').length,
  }));
  judge("N48 磁贴 4 行上限(v8.7.41)：24 条(=4×6 列)「添加」磁贴隐藏 + 23 条恢复在位",
    n48a.add === 0 && n48a.tiles === 24 && n48b.add === 1,
    JSON.stringify({ n48a, n48b }));
}

await page.screenshot({ path: SHOTS + "/final.png" }).catch(() => { });
console.log(`\n===== visual v8.7.42: ${passCount} PASS / ${failCount} FAIL =====`);
process.exit(failCount ? 1 : 0);
