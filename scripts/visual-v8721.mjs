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
const ZIP = "/tmp/beta-wt/download/v8.7.21/ChuShi-NewTab-v8.7.21.zip";
const SHOTS = "/tmp/v8721-visual";
const PROFILE = "/tmp/v8721-profile";
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

/* ---------- E 组：更新日志复位修复（overscroll 隔离 + 重开回位） ---------- */
console.log("===== E 组：更新日志复位修复 =====");
await ensureNoPanel();
await af.evaluate(() => [...document.querySelectorAll(".dock-btn")].find((b) => (b.getAttribute("aria-label") || "").includes("设置"))?.click());
await sleep(1600);
const chgScrollInfo = await af.evaluate(() => {
  const btn = [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "更新日志");
  if (!btn) return { err: "no-changelog-btn" };
  btn.click();
  return { ok: true };
});
await sleep(900);
const e0 = await af.evaluate(() => {
  const veil = document.querySelector('[aria-label="更新日志"]');
  const sc = veil && veil.querySelector(".slim-scroll");
  if (!sc) return { err: "no-scroll" };
  const cs = getComputedStyle(sc);
  return { oby: cs.overscrollBehaviorY, st: sc.scrollTop, items: veil.querySelectorAll("section").length };
});
judge("E0a 更新日志打开（102 条时间线）", !!e0 && !e0.err && e0.items >= 100, JSON.stringify(e0));
judge("E0b 越界滚动隔离（overscroll-behavior-y=contain）", !!e0 && e0.oby === "contain", `oby=${e0 && e0.oby}`);
judge("E0c 首开回顶部（scrollTop=0）", !!e0 && e0.st === 0, `st=${e0 && e0.st}`);
const e1set = await af.evaluate(() => {
  const sc = document.querySelector('[aria-label="更新日志"] .slim-scroll');
  if (!sc) return false;
  sc.scrollTop = 300;
  sc.dispatchEvent(new Event("scroll"));
  return sc.scrollTop === 300;
});
await sleep(200);
judge("E1a 阅读位写入（scrollTop=300）", e1set === true, `set=${e1set}`);
await af.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "返回设置")?.click());
await sleep(900);
await af.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "更新日志")?.click());
await sleep(800);
const e2 = await af.evaluate(() => {
  const sc = document.querySelector('[aria-label="更新日志"] .slim-scroll');
  return sc ? sc.scrollTop : -1;
});
judge("E1b 重开回位（300±60，复位根治）", e2 >= 240 && e2 <= 360, `st=${e2}`);
await af.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "返回设置")?.click());
await sleep(900);
await ensureNoPanel();

/* ---------- Z 组：抽屉磁贴墙双击不进禅 ---------- */
console.log("===== Z 组：抽屉双击禅守卫 =====");
/* 唤出抽屉：中键落在页面空白（合成 mousedown/pointerdown button=1，免 autoscroll 干扰） */
const midClick = () => af.evaluate(() => {
  /* 全屏网格扫描（onMiddle 同款守卫链）：抽屉墙布局未知，空白点必须现找 */
  const GUARD = "a, button, input, textarea, select, [role='button'], [role='dialog'], [data-cl-tile], .cl-dock, .cl-dockwidget";
  for (let y = 70; y < 730; y += 55) {
    for (let x = 35; x < 1250; x += 75) {
      const el = document.elementFromPoint(x, y);
      if (!el || (el.closest && el.closest(GUARD))) continue;
      el.dispatchEvent(new PointerEvent("pointerdown", { button: 1, bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 2 }));
      el.dispatchEvent(new MouseEvent("mousedown", { button: 1, bubbles: true, cancelable: true, clientX: x, clientY: y }));
      return { x, y, hit: el.tagName + "." + (el.className || "").toString().slice(0, 30) };
    }
  }
  return { err: "no-blank" };
});
const zOpen = await midClick();
await sleep(900);
const z0 = await af.evaluate(() => ({
  drawer: document.documentElement.classList.contains("cs-drawer"),
  zen: document.documentElement.classList.contains("zen"),
}));
judge("Z0 抽屉唤出（中键→html.cs-drawer）", z0.drawer && !z0.zen, `pt=${JSON.stringify(zOpen)} drawer=${z0.drawer} zen=${z0.zen}`);
/* 空白点重定位（抽屉墙内非交互元素）+ 真实双击 */
const zPt = await af.evaluate(() => {
  const GUARD = "a, button, input, textarea, select, [role='button'], [role='dialog'], [data-cl-tile], .cl-dock, .cl-dockwidget";
  for (let y = 70; y < 730; y += 55) {
    for (let x = 35; x < 1250; x += 75) {
      const el = document.elementFromPoint(x, y);
      if (el && !(el.closest && el.closest(GUARD))) return { x, y };
    }
  }
  return { x: 60, y: 260 };
});
/* Z1 用合成 dblclick（无 pointerdown 副作用）：真实双击首帧会打在纱罩上
   触发 veil onPointerDown 收抽屉（产品正确行为），但会污染本门语义——
   纯粹验证「抽屉开着 dblclick 不进禅」用合成事件直发纱罩（bubbles 到 window） */
await af.evaluate(() => {
  const veil = document.querySelector(".cl-drawer-veil") || document.body;
  veil.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true, clientX: 450, clientY: 300 }));
});
await sleep(700);
const z1 = await af.evaluate(() => ({
  drawer: document.documentElement.classList.contains("cs-drawer"),
  zen: document.documentElement.classList.contains("zen"),
}));
judge("Z1 抽屉开着墙面双击不进禅（守卫在位）", z1.drawer && !z1.zen, `drawer=${z1.drawer} zen=${z1.zen}`);
await midClick();
await sleep(900);
const zClosed = await af.evaluate(() => !document.documentElement.classList.contains("cs-drawer"));
await page.mouse.dblclick(zPt.x, zPt.y);
await sleep(700);
const z2 = await af.evaluate(() => ({
  drawer: document.documentElement.classList.contains("cs-drawer"),
  zen: document.documentElement.classList.contains("zen"),
}));
judge("Z2 抽屉已关+禅路径无回归（双击进禅）", zClosed && z2.zen && !z2.drawer, `closed=${zClosed} zen=${z2.zen}`);
await page.mouse.dblclick(zPt.x, zPt.y);
await sleep(700);
const z3 = await af.evaluate(() => !document.documentElement.classList.contains("zen"));
judge("Z3 再双击退禅（来回零残留）", z3, `zenGone=${z3}`);

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
/* 坑录：ctx.newPage(options) 不收 viewport（静默丢弃→继承上下文 1280x720），
   显式 setViewportSize 才生效；居中断言一律用运行时 innerWidth 动态基准 */
const page2 = await ctx.newPage();
await page2.setViewportSize({ width: 900, height: 600 });
const vpOf = () => page2.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
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

/* ---------- G 组：dl 玻璃拉伸/药丸居中/切行模糊（v8.7.21 四连） ---------- */
console.log("===== G 组：dl 玻璃拉伸四连（SW 直注换歌） =====");
/* dlNodesX：pill/dl1/dl2 全捕获（nodeId 竞态律：每次现取现用） */
const YRC2 = [
  "[1000,3500](1000,900,0)短句(2000,1200,0)开场",
  "[5000,4000](5000,1200,0)这第二句故意写得很长很长用来见证玻璃药丸拉伸动画的宽度变化全过程",
  "[11000,3000](11000,1500,0)收尾句",
].join("\n");
async function dlNodesX() {
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
  const out = { pill: [], l1: [], l2: [] };
  (function walk2(n) {
    const attrs = n.attributes || [];
    for (let k = 0; k + 1 < attrs.length; k += 2) {
      if (attrs[k] === "class") {
        const toks = String(attrs[k + 1]).split(/\s+/);
        if (toks.includes("dl")) out.pill.push(n);
        else if (toks.includes("dl1")) out.l1.push(n);
        else if (toks.includes("dl2")) out.l2.push(n);
      }
    }
    (n.children || []).forEach(walk2);
    (n.shadowRoots || []).forEach(walk2);
  })(host);
  return out;
}
async function gCS(nodeId) {
  const { computedStyle } = await cdp.send("CSS.getComputedStyleForNode", { nodeId });
  return Object.fromEntries(computedStyle.map((x) => [x.name, x.value]));
}
async function attrOf(node, name) {
  const a = await cdp.send("DOM.getAttributes", { nodeId: node.nodeId }).catch(() => null);
  if (!a) return "";
  const i = a.attributes.indexOf(name);
  return i >= 0 ? (a.attributes[i + 1] || "") : "";
}
async function pillBox() {
  for (let t = 0; t < 4; t++) {
    const f = await dlNodesX().catch(() => null);
    if (f && f.pill.length) {
      try {
        const b = await cdp.send("DOM.getBoxModel", { nodeId: f.pill[0].nodeId });
        const q = b.model.content;
        const xs = [q[0], q[2], q[4], q[6]], ys = [q[1], q[3], q[5], q[7]];
        return { l: Math.min(...xs), r: Math.max(...xs), t: Math.min(...ys), b: Math.max(...ys) };
      } catch (e) { /* nodeId stale → refetch 重试 */ }
    }
    await sleep(120);
  }
  return null;
}
async function restub(makeFn, arg) {
  for (let i = 0; i < 4; i++) {
    if (!sw) {
      sw = await Promise.race([
        new Promise((res) => ctx.once("serviceworker", res)),
        sleep(1500).then(() => null),
      ]);
      if (!sw) continue;
    }
    const r = await sw.evaluate(makeFn, arg).catch(() => null);
    if (r && r.ok) return true;
    sw = null;
  }
  return false;
}
/* GA：切无歌词歌（186017）→ ♪ 药丸 → 首用真居中 + 显式 width + 双过渡在体 */
const gaOK = await restub(() => {
  try {
    getJson = async (url) => {
      if (url.indexOf("/api/ping") >= 0) return { ok: true, name: "chushi-music-hub", version: "mock-in-sw" };
      if (url.indexOf("/api/state") >= 0) return { ne: { songId: 186017, title: "无词之歌", artist: "Tester", album: "VA", playing: true, position: 2.6, duration: 240, pic: "", ts: Date.now() } };
      if (url.indexOf("/api/lyric") >= 0) return { ok: true, lyric: { songId: "186017", lrc: "", yrc: "", tlyric: "", ytlrc: "" } };
      return {};
    };
    void pollState(); void ensureStateLoop();
    return { ok: true };
  } catch (e) { return { ok: false, err: String(e).slice(0, 60) }; }
}, null);
let gaPill = null;
for (let i = 0; i < 24 && !gaPill; i++) {
  const f = await dlNodesX().catch(() => null);
  if (f && f.l1.length) {
    const html = await cdp.send("DOM.getOuterHTML", { nodeId: f.l1[0].nodeId }).catch(() => null);
    if (html && html.outerHTML.includes("♪")) gaPill = f;
  }
  if (!gaPill) await sleep(400);
}
judge("GA0 无歌词药丸态就位（♪ 歌名·歌手）", !!gaPill && gaOK, gaPill ? "ready" : "timeout");
if (gaPill) {
  const box = await pillBox();
  /* nodeId 竞态律（v8.7.20）：逐帧 --p 样式变动令 nodeId 失效——取样紧邻+重试 */
  let cs = null, styleAttr = "";
  for (let t = 0; t < 6 && (!cs || !styleAttr); t++) {
    const f0 = await dlNodesX().catch(() => null);
    if (f0 && f0.pill.length) {
      styleAttr = await attrOf(f0.pill[0], "style").catch(() => "");
      cs = await gCS(f0.pill[0].nodeId).catch(() => null);
    }
    if (!cs || !styleAttr) await sleep(250);
  }
  const cx = box ? (box.l + box.r) / 2 : -1;
  const wPx = box ? box.r - box.l : 0;
  const vpg = await vpOf().catch(() => ({ w: 1280 }));
  judge("GA1 首用真居中（|cx-vw/2|≤3，旧 460 假设位退役）", !!box && Math.abs(cx - vpg.w / 2) <= 3, `cx=${cx.toFixed(1)} w=${wPx.toFixed(0)} vw=${vpg.w}`);
  judge("GA2 显式 width 驱动（style 属性 px 在位=布局动画源）", /width:\s*\d+(\.\d+)?px/.test(styleAttr), `style="${styleAttr.slice(0, 70)}"`);
  const tp = cs ? (cs["transition-property"] || "") : "";
  const td = cs ? (cs["transition-duration"] || "") : "";
  judge("GA3 玻璃双过渡在体（width/left 0.45s 同曲线）", tp.includes("width") && tp.includes("left") && td.includes("0.45s"), `tp=${tp} td=${td}`);
  await page2.screenshot({ path: `${SHOTS}/GA-dl-nolyric-centered.png` });
}
/* GC：切长词歌（186018, position 6.0 → 第二行长句）→ 拉伸飞行采样 + dlswap/lin */
const gcSampler = (async () => {
  const widths = [];
  const t0 = Date.now();
  while (Date.now() - t0 < 2600) {
    const b = await pillBox();
    if (b) widths.push(+(b.r - b.l).toFixed(1));
    await sleep(70);
  }
  return widths;
})();
await sleep(150); /* 采样器先起，再换歌（F3 采样器先行律同源） */
const gcOK = await restub((yrc) => {
  try {
    getJson = async (url) => {
      if (url.indexOf("/api/ping") >= 0) return { ok: true, name: "chushi-music-hub", version: "mock-in-sw" };
      if (url.indexOf("/api/state") >= 0) return { ne: { songId: 186018, title: "Mock Song", artist: "Tester", album: "VA", playing: true, position: 6.0, duration: 240, pic: "", ts: Date.now() } };
      if (url.indexOf("/api/lyric") >= 0) return { ok: true, lyric: { songId: "186018", lrc: "", yrc, tlyric: "", ytlrc: "" } };
      return {};
    };
    void pollState(); void ensureStateLoop();
    return { ok: true };
  } catch (e) { return { ok: false, err: String(e).slice(0, 60) }; }
}, YRC2);
const widths = await gcSampler;
const maxW = Math.max(...widths), minW = Math.min(...widths);
judge("GC1 玻璃拉伸在飞（宽度采样 Δ≥40，0.45s 过渡真实飞行）", gcOK && maxW - minW >= 40, `min=${minW} max=${maxW} n=${widths.length} samples=[${widths.filter((_, i) => i % 3 === 0).join(",")}]`);
let gc2 = { cls: "", anim: "", wordN: 0 };
for (let t = 0; t < 6; t++) {
  const f2 = await dlNodesX().catch(() => null);
  if (f2 && f2.l1.length) {
    try {
      const cls = await attrOf(f2.l1[0], "class");
      const cs2 = await gCS(f2.l1[0].nodeId);
      gc2 = { cls, anim: cs2["animation-name"] || "", wordN: f2.l1.length };
      break;
    } catch (e) { await sleep(250); }
  }
  await sleep(250);
}
judge("GC2 切行模糊过渡在体（dl1 挂 lin 类+计算动画名=dlswap）", /(^| )lin( |$)/.test(gc2.cls) && gc2.anim === "dlswap", `cls="${gc2.cls}" anim=${gc2.anim}`);
await sleep(600);
const box2 = await pillBox();
const cx2 = box2 ? (box2.l + box2.r) / 2 : -1;
const vpg2 = await vpOf().catch(() => ({ w: 1280 }));
judge("GC3 拉伸落点仍居中（左/宽同拍=中心逐帧恒定的终态见证）", !!box2 && Math.abs(cx2 - vpg2.w / 2) <= 4, `cx=${cx2.toFixed(1)} w=${(box2.r - box2.l).toFixed(0)} vw=${vpg2.w}`);
await page2.screenshot({ path: `${SHOTS}/GC-dl-stretched-line2.png` });

console.log(`\n===== visual-v8721: ${passCount} PASS / ${failCount} FAIL =====`);
console.log("shots:", SHOTS);
ctx.close();
hub.close();
process.exit(failCount ? 1 : 0);
