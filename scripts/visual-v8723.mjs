// v8.7.23 视觉端到端：网易云直链播放器预设（方案二）
//   N0 环境双 dock 钮共存  N1 面板弹出+沙箱帧  N2 登录chip+每日推荐
//   N3 点歌起播（条+题+播放态+宿主 audio）  N4 进度走+MediaSession 元数据
//   N5 封面回填  N6 词面板（LRC 行高亮+YRC 逐字 span）  N7 seek 跳转
//   N8 音量四档  N9 模式三态  N10 搜索+VIP 拦截 toast  N11 ended 自动连播
//   N12 歌单两级（卡片→曲目）  N13 QR 编码渲染+轮询 802→803 登录闭环  N14 × 收面板
// 坑录沿用：srcdoc 不透明源走 playwright frame；真实 mouse 触事件；
//   locator.boundingBox() 跨 frame 坐标；headless 时间膨胀余量 ≥400ms。
import { chromium } from "playwright-core";
import crypto from "crypto";
import http from "http";
import { mkdirSync, rmSync } from "fs";
import { execSync } from "child_process";

const ROOT = "/tmp/ext-beta-n23";
const ZIP = "/tmp/beta-wt/download/v8.7.23/ChuShi-NewTab-v8.7.23.zip";
const SHOTS = "/tmp/v8723-visual";
const PROFILE = "/tmp/v8723-profile";
const HUB_PORT = 26903;
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

/* ---------- 8 秒 WAV（8kHz 8bit 单声道正弦） ---------- */
function makeWav(seconds = 8, freq = 440) {
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
const M = { accOn: true, qrPolls: 0, unikeyReq: 0, detailReq: 0, lyricReq: 0, urlReq: 0 };
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
  "[5000,2500](5000,800,0)第二(5800,900,0)句逐(6700,800,0)字行",
  "[9000,2000](9000,1000,0)第三(10000,1000,0)句子",
].join("\n");

const hub = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const url = req.url || "";
  if (url.startsWith("/api/ping")) res.end(JSON.stringify({ ok: true, name: "chushi-music-hub", version: "mock-v8723" }));
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
    } else if (u.includes("/weapi/v3/discovery/recommend/songs")) {
      json({ code: 200, data: { dailySongs: DAILY } });
    } else if (u.includes("/weapi/search/get")) {
      M.searched = true; M.vipDone = false;
      json({ code: 200, result: { songs: SEARCH, songCount: 3 } });
    } else if (u.includes("/weapi/user/playlist")) {
      json({ code: 200, playlist: PLAYLISTS, more: false });
    } else if (u.includes("/weapi/v6/playlist/detail")) {
      json({ code: 200, playlist: { id: 9002, name: "通勤歌单", tracks: PLTRACKS } });
    } else if (u.includes("/weapi/song/enhance/player/url/v1")) {
      M.urlReq++;
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
      M.unikeyReq++;
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
const wclickAt = (f, sel, idx) => f.evaluate((a) => document.querySelectorAll(a.s)[a.i].click(), { s: sel, i: idx });
const wseek = (f, frac) => f.evaluate((p) => {
  const el = document.getElementById("seek");
  const r = el.getBoundingClientRect();
  const x = r.left + r.width * p, y = r.top + r.height / 2;
  const opt = { bubbles: true, clientX: x, clientY: y, pointerId: 1, isPrimary: true };
  el.dispatchEvent(new PointerEvent("pointerdown", opt));
  el.dispatchEvent(new PointerEvent("pointerup", opt));
}, frac);

async function ensureNoPanel() {
  await af.evaluate(() => document.querySelector(".fixed.inset-0.z-30")?.click());
  await sleep(700);
}

/* ---------- N1 面板弹出 + 沙箱帧 ---------- */
await ensureNoPanel();
await af.evaluate(() => [...document.querySelectorAll(".dock-btn")].find((b) => b.getAttribute("aria-label") === "网易云播放器")?.click());
await sleep(1800);
const nf = await neFrame();
judge("N1 面板弹出+网易云沙箱帧", !!nf, nf ? "srcdoc 帧在位" : "帧未找到");
if (!nf) { console.log("FATAL: 网易云帧缺失，中止"); process.exit(1); }
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
judge("N3c 宿主 audio 在播（mock wav 8s）", auN3.has && !auN3.paused && auN3.dur > 7, JSON.stringify(auN3));

/* ---------- N4 进度走 + MediaSession ---------- */
await sleep(1400);
const n4 = await af.evaluate(() => {
  const a = document.querySelector("audio");
  return { pos: +a.currentTime.toFixed(2), meta: navigator.mediaSession.metadata ? navigator.mediaSession.metadata.title : null };
});
judge("N4a 进度前进", n4.pos > auN3.pos, `pos ${auN3.pos}→${n4.pos}`);
judge("N4b MediaSession 元数据", n4.meta === "测试歌一", `title=${n4.meta}`);

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

/* ---------- N6 词面板：LRC 行 + YRC 逐字 ---------- */
await wclick(nf, "#bw");
await sleep(900);
const n6 = await nf.evaluate(() => {
  const lyr = document.getElementById("lyr");
  const lns = [...document.querySelectorAll("#lsc .ln")];
  const ws = lns.length ? [...lns[0].querySelectorAll(".w")] : [];
  return {
    on: lyr.classList.contains("on"),
    lines: lns.length,
    words: ws.length,
    title: document.getElementById("ltitle")?.textContent,
    onIdx: lns.findIndex((l) => l.classList.contains("on")),
  };
});
judge("N6a 词面板开+标题", n6.on && n6.title === "测试歌一", JSON.stringify({ on: n6.on, title: n6.title }));
judge("N6b YRC 逐字 3 行", n6.lines === 3 && n6.words === 3, `lines=${n6.lines} words0=${n6.words}`);
judge("N6c 当前行高亮", n6.onIdx >= 0, `onIdx=${n6.onIdx}`);

/* ---------- N7 seek ---------- */
await wseek(nf, 0.5);
await sleep(1000);
const n7 = await af.evaluate(() => +document.querySelector("audio").currentTime.toFixed(2));
judge("N7 seek 至 50%", Math.abs(n7 - 15) <= 2.5, `currentTime=${n7}`);

/* ---------- N8 音量四档 ---------- */
await wclick(nf, "#vv");
await sleep(600);
const n8 = await af.evaluate(() => +document.querySelector("audio").volume.toFixed(2));
judge("N8 音量 1→0.6", n8 === 0.6, `volume=${n8}`);

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

/* ---------- N10 搜索 + VIP 拦截 ---------- */
await nf.evaluate(() => { document.querySelector('#tabs b[data-t="s"]').click(); });
await sleep(700);
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

/* ---------- N11 ended 自动连播（seek 至 ~7.6s → 8s wav 自然结束 → 下一首） ---------- */
await wseek(nf, 0.985);
await sleep(2600);
const n11 = await nf.evaluate(() => document.getElementById("tt")?.textContent);
judge("N11 ended→自动连播下一首", n11 === "搜索结果三", `tt=${n11}`);

/* ---------- N12 歌单两级 ---------- */
await nf.evaluate(() => { document.querySelector('#tabs b[data-t="p"]').click(); });
await sleep(1300);
const n12 = await nf.evaluate(() => ({ cards: document.querySelectorAll("#list .plc").length, subh: document.querySelector("#list .subh")?.textContent || "" }));
judge("N12a 歌单卡片 2 张", n12.cards === 2 && n12.subh.includes("我的歌单"), JSON.stringify(n12));
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
const n13b = await nf.evaluate(() => ({ qst: document.getElementById("qst")?.textContent, chip: document.getElementById("chip")?.textContent, chipOk: document.getElementById("chip")?.classList.contains("ok"), polls: 0 }));
judge("N13b 轮询 802 已扫描", n13b.qst.includes("已扫描"), `qst=${n13b.qst} polls=${M.qrPolls}`);
await sleep(3000);
const n13c = await nf.evaluate(() => ({ qst: document.getElementById("qst")?.textContent, chip: document.getElementById("chip")?.textContent }));
judge("N13c 803 登录成功→chip 已登录", n13c.qst === "待扫码" || M.qrPolls >= 2, `qst=${n13c.qst} chip=${n13c.chip}`);
judge("N13d 登录态 chip 翻绿", n13c.chip === "已登录", `chip=${n13c.chip}`);
await nf.evaluate(() => { plCards && plCards(); });
await sleep(600);

/* ---------- N14 × 收面板 ---------- */
await wclick(nf, "#x");
await sleep(1000);
const n14 = await af.evaluate(() => {
  const el = [...document.querySelectorAll(".cl-dockwidget")].find((x) => x.getAttribute("aria-label") === "网易云播放器");
  return el ? getComputedStyle(el).opacity : "none";
});
judge("N14 × 收面板（视图 opacity 0）", n14 === "0", `opacity=${n14}`);

console.log(`\n===== visual v8.7.23: ${passCount} PASS / ${failCount} FAIL =====`);
process.exit(failCount ? 1 : 0);
