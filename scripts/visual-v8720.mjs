// v8.7.20 视觉目检：①回弹轻量化 ②on 角标 ③dl 逐字白描边根修——
//   F2b 按压 scale .88（旧 .82 退役）
//   F3 脉冲轻量：rAF 全程采样 max scale ∈ (1.02, 1.18)（旧峰 1.22 退役）
//   F6 角标：off 隐 / on 显 10px accent 圆+白勾 / 锚字形右下角（±2）
//   D 组 dl 白描边：yrc mock → 词模式药丸 → CDP pierce computed styles
//      （.dw 底=accent / .ov 面=#fff / clip 左缘 var 已解算）+ DSF3 像素目检
//   G1 几何零波及 + F1 hover 律不回归（v8.7.18/19 存量）
// 坑录沿用：srcdoc 不透明源走 playwright Frame；真实 mouse 触 :active；
//   locator.boundingBox() 跨 frame 坐标；headless 时间膨胀——过渡类断言
//   等待余量 ≥400ms；closed shadow 取证=CDP DOM.getDocument(pierce)+CSS domain；
//   脉冲采样须先起采样器再 mouse.up（evaluate 往返 ~50-80ms 会吃掉 0.28s 峰值窗）。
import { chromium } from "playwright-core";
import crypto from "crypto";
import http from "http";
import { mkdirSync, rmSync } from "fs";
import { execSync } from "child_process";

const ROOT = "/tmp/ext-beta";
const ZIP = "/tmp/beta-wt/download/v8.7.20/ChuShi-NewTab-v8.7.20.zip";
const SHOTS = "/tmp/v8720-visual";
const PROFILE = "/tmp/v8720-profile";
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

/* ---------- mock hub：yrc 词级歌词（D 组词模式） ---------- */
const YRC = [
  "[1000,3200](1000,800,0)第一(1800,1100,0)句歌(2900,1300,0)词哦",
  "[5000,4000](5000,1000,0)第二(6000,1500,0)句逐字扫(7500,1500,0)光测试行",
  "[10000,3000](10000,1500,0)第三(11500,1500,0)句子收尾",
].join("\n");
let hubT0 = Date.now();
const hub = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const url = req.url || "";
  if (url.startsWith("/api/ping")) {
    res.end(JSON.stringify({ ok: true, name: "chushi-music-hub", version: "mock-v8720" }));
  } else if (url.startsWith("/api/state")) {
    const pos = (Date.now() - hubT0) / 1000 + 0.3;
    res.end(JSON.stringify({
      ne: { songId: 186016, title: "Mock Song", artist: "Tester", album: "VA",
        playing: true, position: pos, duration: 240, pic: "", ts: Date.now() },
    }));
  } else if (url.startsWith("/api/lyric")) {
    res.end(JSON.stringify({ ok: true, lyric: { songId: "186016", lrc: "", yrc: YRC, tlyric: "", ytlrc: "" } }));
  } else if (url.startsWith("/reset")) {
    hubT0 = Date.now();
    res.end("ok");
  } else {
    res.setHeader("Content-Type", "text/html");
    res.end("<!DOCTYPE html><html><head><title>mock page</title></head><body><h1>mock page</h1></body></html>");
  }
});
hub.listen(HUB_PORT, "127.0.0.1");

/* ---------- 台架 ---------- */
const ctx = await chromium.launchPersistentContext(PROFILE, {
  channel: "chromium", headless: true,
  args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`,
    "--no-first-run", "--no-sandbox"],
});
process.on("exit", () => { try { ctx.close(); } catch { } try { hub.close(); } catch { } });
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

async function presetSettings(mut, ...args) {
  await af.evaluate(mut, ...args);
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

const official = JSON.parse(execSync("cat /tmp/beta-wt/src/lib/startpage/official-presets.json", { encoding: "utf8" }));
await af.evaluate((raw) => {
  localStorage.setItem("start:presets", JSON.stringify([
    { id: "official-smtc-v13", name: raw.name, installedAt: Date.now(), raw },
  ]));
}, JSON.parse(JSON.stringify({ ...official.presets[1].manifest, commands: [], links: [], dock: [] })));
await presetSettings(() => { });

async function ensureNoPanel() {
  await af.evaluate(() => document.querySelector(".fixed.inset-0.z-30")?.click());
  await sleep(600);
  const st = await af.evaluate(() => ({
    glass: !!document.querySelector(".glass-card.cl-panel"),
    h: document.querySelector(".cl-stage > div")?.getBoundingClientRect().height ?? 0,
  }));
  if (st.glass || st.h > 0) { await sleep(800); }
}

async function widgetFrame() {
  for (let i = 0; i < 20; i++) {
    const f = page.frames().find((x) => /about:srcdoc/.test(x.url()));
    if (f) {
      const ok = await f.evaluate(() => !!document.getElementById("csWordBtn") && !!document.getElementById("csTDur")).catch(() => false);
      if (ok) return f;
    }
    await sleep(500);
  }
  return null;
}

console.log("===== 打开音乐面板（live 态等待） =====");
await ensureNoPanel();
await af.evaluate(() => [...document.querySelectorAll(".dock-btn")].find((b) => b.getAttribute("aria-label") === "音乐")?.click());
await sleep(1800);
const wf = await widgetFrame();
if (!wf) throw new Error("widget srcdoc frame not found");
let live = false;
for (let i = 0; i < 24; i++) {
  live = await wf.evaluate(() => {
    const c = document.getElementById("csCard");
    const d = document.getElementById("csTDur");
    return c && c.className.includes("cs-mode-fl") && d && d.textContent !== "--:--";
  }).catch(() => false);
  if (live) break;
  await sleep(500);
}
judge("P0 面板 live 态", live, `mode-fl=${live}`);
await sleep(900);

/* ---------- G1 几何零波及 ---------- */
const geo = await wf.evaluate(() => {
  const $ = (id) => document.getElementById(id);
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { l: +b.left.toFixed(1), t: +b.top.toFixed(1), r: +b.right.toFixed(1), b: +b.bottom.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) }; };
  const card = document.querySelector(".cs-card");
  const ctl = document.querySelector(".cs-ctl");
  const btns = ctl ? [...ctl.querySelectorAll(":scope > button")] : [];
  return { card: r(card), tm: r(document.querySelector(".cs-tm")), tdur: r($("csTDur")), wb: r($("csWordBtn")), prev: r($("csPrev")), next: r($("csNext")), ctlBtnIds: btns.map((b) => b.id) };
});
judge("G1a 词钮右缘=总时长右缘+4", Math.abs(geo.wb.r - (geo.tdur.r + 4)) <= 2, `wb.r=${geo.wb.r} tdur.r=${geo.tdur.r}`);
judge("G1b 词钮顶=时长行底+3", Math.abs(geo.wb.t - geo.tm.b - 3) <= 2, `wb.t=${geo.wb.t}`);
judge("G1c cs-ctl 恰三键", JSON.stringify(geo.ctlBtnIds) === JSON.stringify(["csPrev", "csPlay", "csNext"]), JSON.stringify(geo.ctlBtnIds));
const cardCx = (geo.card.l + geo.card.r) / 2;
const trioCx = (geo.prev.l + geo.next.r) / 2;
judge("G1d 三键质心=卡中心（不让位零回归）", Math.abs(trioCx - cardCx) <= 2.5, `trioCx=${trioCx.toFixed(1)} cardCx=${cardCx.toFixed(1)}`);

/* ---------- F0/F6a 静息：角标 off 隐 ---------- */
await page.mouse.move(10, 10);
await sleep(300);
const rest = await wf.evaluate(() => {
  const b = document.getElementById("csWordBtn");
  const c = getComputedStyle(b);
  const bd = getComputedStyle(b.querySelector(".on-badge"));
  return { tf: c.transform, fil: c.filter, badge: bd.display, on: b.className.includes("on") };
});
judge("F0 静息=无变换+无辉光+非on", rest.tf === "none" && rest.fil === "none" && !rest.on, `tf=${rest.tf} fil=${rest.fil}`);
judge("F6a off 态角标隐藏（display none）", rest.badge === "none", `badge=${rest.badge}`);

const bb = await (await wf.locator("#csWordBtn").elementHandle()).boundingBox();
const cx = bb.x + bb.width / 2, cy = bb.y + bb.height / 2;

/* ---------- F1 hover 律不回归 ---------- */
await page.mouse.move(cx, cy);
await sleep(450);
const hov = await wf.evaluate(() => {
  const c = getComputedStyle(document.getElementById("csWordBtn"));
  const probe = document.createElement("i");
  probe.style.color = "var(--acc)";
  document.body.appendChild(probe);
  const acc = getComputedStyle(probe).color;
  probe.remove();
  return { bg: c.backgroundColor, col: c.color, tf: c.transform, fil: c.filter, acc };
});
judge("F1a hover=底透明（零回归）", hov.bg === "rgba(0, 0, 0, 0)", `bg=${hov.bg}`);
judge("F1b hover=accent 点亮（零回归）", hov.col === hov.acc, `col=${hov.col}`);
judge("F1c hover=无 scale（零回归）", hov.tf === "none", `tf=${hov.tf}`);

/* ---------- F2 按压 .88（轻量化） ---------- */
await page.mouse.down();
await sleep(280);
await page.screenshot({ path: `${SHOTS}/F2-word-pressed.png` });
const press = await wf.evaluate(() => {
  const c = getComputedStyle(document.getElementById("csWordBtn"));
  const n = getComputedStyle(document.getElementById("csNext"));
  return { tf: c.transform, nextTf: n.transform, active: document.getElementById("csWordBtn").matches(":active") };
});
const mPress = press.tf.match(/matrix\(([-\d.]+)/);
judge("F2a 按压 :active 命中", press.active, `matches=${press.active}`);
judge("F2b 按压 scale .88（轻量化，旧 .82 退役）", mPress && Math.abs(parseFloat(mPress[1]) - 0.88) <= 0.02, `tf=${press.tf}`);
judge("F2c 他键零波及", press.nextTf === "none" || press.nextTf === "matrix(1, 0, 0, 1, 0, 0)", `nextTf=${press.nextTf}`);

/* ---------- F3 脉冲轻量（采样器+动画轮询 双双先起再 mouse.up） ---------- */
const samplerP = wf.evaluate(() => new Promise((res) => {
  const b = document.getElementById("csWordBtn");
  const vals = [];
  const t0 = performance.now();
  (function loop() {
    const m = getComputedStyle(b).transform;
    const mm = m.match(/matrix\(([-\d.]+)/);
    if (mm) vals.push(+parseFloat(mm[1]).toFixed(3));
    if (performance.now() - t0 < 620) requestAnimationFrame(loop); else res(vals);
  })();
}));
const animP = wf.evaluate(() => new Promise((res) => {
  const t0 = performance.now();
  (function loop() {
    const a = document.getAnimations().find((x) => x.animationName === "cs-wpulse-kf");
    if (a) return res({ ct: a.currentTime, play: a.playState });
    if (performance.now() - t0 < 900) requestAnimationFrame(loop); else res(null);
  })();
}));
await sleep(60);
await page.mouse.up();
const samples = await samplerP;
const peak = Math.max(...samples);
const running = await animP;
judge("F3a wpulse 动画在飞（getAnimations 并发轮询实证）", !!running, running ? `ct=${running.ct}ms play=${running.play}` : "not caught");
judge("F3b 脉冲峰值轻量 max∈(1.02,1.18)（旧峰 1.22 退役）", peak > 1.02 && peak < 1.18, `peak=${peak} samples=[${samples.filter((_, i) => i % 4 === 0).join(",")}]`);
await sleep(600);
const settle = await wf.evaluate(() => {
  const c = getComputedStyle(document.getElementById("csWordBtn"));
  return { tf: c.transform, on: document.getElementById("csWordBtn").className.includes("on") };
});
judge("F3c 脉冲收尾回 none（无残留）", settle.tf === "none", `tf=${settle.tf}`);

/* ---------- F5/F6b on 态：辉光 + 角标显形 ---------- */
const onState = await wf.evaluate(() => {
  const b = document.getElementById("csWordBtn");
  const c = getComputedStyle(b);
  const bd = b.querySelector(".on-badge");
  const cbd = getComputedStyle(bd);
  const br = bd.getBoundingClientRect();
  const probe = document.createElement("i");
  probe.style.color = "var(--acc)";
  document.body.appendChild(probe);
  const acc = getComputedStyle(probe).color;
  probe.remove();
  return {
    on: b.className.includes("on"), fil: c.filter,
    badge: cbd.display, bw: br.width, bh: br.height, fill: cbd.fill,
    /* 角标锚点：徽标右下角 vs 按钮右下角（-1px 设计 → 差 ≈1px） */
    dR: +(b.getBoundingClientRect().right - br.right).toFixed(1),
    dB: +(b.getBoundingClientRect().bottom - br.bottom).toFixed(1),
    acc,
  };
});
await page.screenshot({ path: `${SHOTS}/F5-word-on-badge.png` });
judge("F5a 点击后 .on 点亮 + 辉光", onState.on && /drop-shadow/.test(onState.fil), `fil=${onState.fil.slice(0, 40)}…`);
judge("F6b on 态角标显形（block 10×10 accent 圆）", onState.badge === "block" && Math.abs(onState.bw - 10) <= 1 && Math.abs(onState.bh - 10) <= 1 && onState.fill === onState.acc, `display=${onState.badge} ${onState.bw}x${onState.bh} fill=${onState.fill}`);
judge("F6c 角标锚字形右下角（设计 right/bottom:-1px → 徽标外悬 1px，dR/dB=-1±1.5）", Math.abs(onState.dR + 1) <= 1.5 && Math.abs(onState.dB + 1) <= 1.5, `dR=${onState.dR} dB=${onState.dB}`);

/* ---------- F4 连点重触发 ---------- */
await sleep(300);
await wf.click("#csWordBtn"); /* 灭 */
await sleep(700);
await wf.click("#csWordBtn"); /* 开 */
await sleep(620);
await wf.click("#csWordBtn"); /* 灭（第二次脉冲应重启） */
const restart = await wf.evaluate(() => {
  const a = document.getAnimations().find((x) => x.animationName === "cs-wpulse-kf");
  return a ? { ct: a.currentTime } : null;
});
judge("F4 连点动画重启（ct<120）", !!restart && restart.ct < 120, restart ? `ct=${restart.ct}ms` : "not caught");
const offAfter = await wf.evaluate(() => ({
  on: document.getElementById("csWordBtn").className.includes("on"),
  badge: getComputedStyle(document.getElementById("csWordBtn").querySelector(".on-badge")).display,
}));
judge("F4b 收束 off 态角标复隐", !offAfter.on && offAfter.badge === "none", `badge=${offAfter.badge}`);

/* ---------- D 组：dl 词模式白描边根修端到端（SW 直注 stub，零环境网络依赖） ----------
   环境坑录：本环境 SW/页面对 127.0.0.1 hub 端口的 fetch 按次随机断裂（导航与
   早期探针正常、稍后全灭；node 直连始终正常；27000 新端口正常）——v8.7.16/17/18
   同链路 visual 全绿、真机用户歌词链路健在，判环境 flake 非产品回归。本版起
   D 组绕开：SW 内重赋值顶层 getJson/hubPort（经典脚本顶层绑定为可变全局），
   state/lyric 全链在 SW 进程内闭环，position 定值 2.6s=词2 已扫 72%（定格取证）。 */
console.log("===== D 组：全局歌词词模式（SW 直注） =====");
await af.evaluate(() => chrome.storage.local.set({ cardDlyric: true }));
const stPre = await af.evaluate(() => new Promise((res) => chrome.storage.local.get(["cardDlyric"], (o) => res(o)))).catch((e) => ({ err: String(e).slice(0, 60) }));
console.log("storage.cardDlyric(af 读):", JSON.stringify(stPre));
const page2 = await ctx.newPage({ viewport: { width: 900, height: 600, deviceScaleFactor: 3 } });
await page2.goto(`http://127.0.0.1:${HUB_PORT}/`, { waitUntil: "load", timeout: 15000 }).catch((e) => console.log("page2 goto(容错):", String(e).slice(0, 60)));
/* 内容脚本已注入并连 Port（cards≥1）→ 抓 SW worker */
let sw = ctx.serviceWorkers().length ? ctx.serviceWorkers()[0] : null;
if (!sw) {
  sw = await Promise.race([
    new Promise((res) => ctx.once("serviceworker", res)),
    sleep(6000).then(() => null),
  ]);
}
judge("D0 SW worker 在册（Playwright serviceWorkers）", !!sw, sw ? "caught" : "missed");

/* 稳健种子循环：重赋值 stub（幂等）→ pollState → 验证 state 已流 + 卡片在册；
   worker 句柄失效（SW 重启）自动等新 serviceworker 事件重种 */
let seeded = false, seedInfo = null;
for (let i = 0; i < 16 && !seeded; i++) {
  if (!sw) {
    sw = await Promise.race([
      new Promise((res) => ctx.once("serviceworker", res)),
      sleep(1500).then(() => null),
    ]);
    if (!sw) continue;
  }
  const st = await sw.evaluate((yrc) => {
    try {
      if (!self.__dlSeeded) {
        getJson = async (url) => {
          if (url.indexOf("/api/ping") >= 0) return { ok: true, name: "chushi-music-hub", version: "mock-in-sw" };
          if (url.indexOf("/api/state") >= 0) {
            return { ne: { songId: 186016, title: "Mock Song", artist: "Tester", album: "VA",
              playing: true, position: 2.6, duration: 240, pic: "", ts: Date.now() } };
          }
          if (url.indexOf("/api/lyric") >= 0) return { ok: true, lyric: { songId: "186016", lrc: "", yrc, tlyric: "", ytlrc: "" } };
          return {};
        };
        hubPort = 26903;
        self.__dlSeeded = true;
      }
      void pollState();
      void ensureStateLoop();
      return { ok: true, st: !!state, cards: cards.size, hp: hubPort, title: state ? state.title : null };
    } catch (e) { return { ok: false, err: String(e).slice(0, 80) }; }
  }, YRC).catch(() => null);
  if (st && st.ok && st.st && st.cards >= 1) {
    seeded = true; seedInfo = st;
    console.log("SW seed+flow OK:", JSON.stringify(st));
    break;
  }
  console.log("SW seed try", i, JSON.stringify(st));
  if (!st) sw = null; /* 句柄失效 → 等新 worker */
  await sleep(600);
}
judge("D0b SW stub 种子（state 已流+卡片在册）", seeded, JSON.stringify(seedInfo || { seeded }));
/* 二次写入（page2 已在场）：onChanged 活翻转路径，排除 boot 读取竞态 */
const stPost = await af.evaluate(() => new Promise((res) => chrome.storage.local.set({ cardDlyric: true }, () => res("written")))).catch((e) => "err:" + String(e).slice(0, 40));
console.log("storage 二次写:", JSON.stringify(stPost));

/* CDP pierce closed shadow：DOM.getDocument(-1, pierce) + CSS.getComputedStyleForNode */
const cdp = await ctx.newCDPSession(page2);
await cdp.send("DOM.enable"); await cdp.send("CSS.enable");
async function dlNodes() {
  const { root } = await cdp.send("DOM.getDocument", { depth: -1, pierce: true });
  let host = null;
  (function walk(n) {
    if (host) return;
    const attrs = n.attributes || [];
    for (let k = 0; k + 1 < attrs.length; k += 2) {
      if (attrs[k] === "id" && attrs[k + 1] === "chushi-dlyric-host") { host = n; return; }
    }
    (n.children || []).forEach(walk);
    (n.shadowRoots || []).forEach(walk);
  })(root);
  if (!host) return null;
  const dws = [], ovs = [], pill = [];
  (function walk2(n) {
    const attrs = n.attributes || [];
    for (let k = 0; k + 1 < attrs.length; k += 2) {
      if (attrs[k] === "class") {
        if (attrs[k + 1] === "dw") dws.push(n);
        if (attrs[k + 1] === "ov") ovs.push(n);
        if (attrs[k + 1] === "dl") pill.push(n);
      }
    }
    (n.children || []).forEach(walk2);
    (n.shadowRoots || []).forEach(walk2);
  })(host);
  return { dws, ovs, pill };
}
let dl = null;
for (let i = 0; i < 30 && !(dl && dl.dws.length); i++) {
  dl = await dlNodes().catch(() => null);
  if (!(dl && dl.dws.length)) await sleep(500);
}
judge("D1 词模式药丸挂载（yrc→dw/ov 子树 pierce 可达）", !!dl && dl.dws.length > 0 && dl.ovs.length === dl.dws.length, dl ? `dw=${dl.dws.length} ov=${dl.ovs.length}` : "host not found");
/* 诊断：药丸 outerHTML 现场（dlL1 内容=空/dw 兜底文本的三态判别） */
if (dl) {
  const diag = await cdp.send("DOM.getOuterHTML", { nodeId: dl.pill[0].nodeId }).catch(() => null);
  console.log("PILL HTML:", diag ? diag.outerHTML.slice(0, 500) : "null");
}

if (dl && dl.dws.length) {
  /* nodeId 会被逐帧 --p 样式变动失效——快照+取样式必须紧邻，失败即重取重试 */
  const csPair = async () => {
    for (let t = 0; t < 6; t++) {
      const fresh = await dlNodes();
      if (!fresh || !fresh.dws.length) { await sleep(200); continue; }
      try {
        const g = async (nodeId) => {
          const { computedStyle } = await cdp.send("CSS.getComputedStyleForNode", { nodeId });
          return Object.fromEntries(computedStyle.map((x) => [x.name, x.value]));
        };
        return { dw0: await g(fresh.dws[0].nodeId), ov0: await g(fresh.ovs[0].nodeId), fresh };
      } catch (e) { await sleep(200); }
    }
    return null;
  };
  const pair = await csPair();
  if (!pair) throw new Error("D2 computed styles unreachable (nodeId 竞态 6 次)");
  const dw0 = pair.dw0, ov0 = pair.ov0;
  dl = pair.fresh;
  judge("D2a 底字层恒 accent（已唱色，旧白底退役）", /rgb\(139,\s*92,\s*246\)/.test(dw0.color || ""), `dw.color=${dw0.color}`);
  judge("D2b 扫光面层恒白（#fff，未唱显色）", /rgb\(255,\s*255,\s*255\)/.test(ov0.color || ""), `ov.color=${ov0.color}`);
  judge("D2c 面层裁剪=左缘 --p（未唱区暴露；旧右缘律退役）", /inset\(/.test(ov0["clip-path"] || "") && !/calc\(/.test(ov0["clip-path"] || ""), `ov.clip=${ov0["clip-path"]}`);
  /* 像素目检：position=2.6s 定格 → 词1 全 accent / 词2 72% / 词3 白 */
  const box = await cdp.send("DOM.getBoxModel", { nodeId: dl.pill[0].nodeId }).catch(() => null);
  if (box) {
    const q = box.model.content;
    const xs = [q[0], q[2], q[4], q[6]], ys = [q[1], q[3], q[5], q[7]];
    const clip = { x: Math.min(...xs) - 10, y: Math.min(...ys) - 10, width: Math.max(...xs) - Math.min(...xs) + 20, height: Math.max(...ys) - Math.min(...ys) + 20 };
    await page2.screenshot({ path: `${SHOTS}/D3-dl-pill-midsweep.png`, clip });
  }
  await page2.screenshot({ path: `${SHOTS}/D3-dl-page.png` });
  console.log("D3 截图已存（DSF3 像素目检：已唱字应无白晕描边）");
}

console.log(`\n===== visual-v8720: ${passCount} PASS / ${failCount} FAIL =====`);
console.log("shots:", SHOTS);
ctx.close();
hub.close();
process.exit(failCount ? 1 : 0);
