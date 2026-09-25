// v8.7.19 视觉目检：词钮点击反馈三件套（用户：不知道自己是否点击了按钮）——
//   F0 静息态：transform none + filter none + 非 accent（基线）
//   F1 hover 律不回归：底透明 + accent 图标本体点亮 + 无 scale（v8.7.18 律原样）
//   F2 按压 :active：图标本体 scale .82（按下即陷）；他键零波及（csNext 无变换）
//   F3 松手脉冲：wpulse 动画 cs-wpulse-kf 在飞（getAnimations 实证）+ 中段 scale>1.08
//      + 收尾回 none（fill-mode none 无残留）+ wpulse 类在（设计如此，重触发靠 remove+add）
//   F4 连点重触发：二次点击动画重启（currentTime <120ms）
//   F5 on 辉光闭环：点击后 .on + filter drop-shadow（悬停下 on/off 可分辨=根因修复）
//      + 再点 off → filter none
//   G1 几何零波及：词钮位置四断言 + 三键质心=卡中心（v8.7.18 布局零回归）
//   G2 按压过渡 .12s（快陷手感，非旧 .25s）
// 坑录沿用：srcdoc 不透明源 → 父页 contentDocument 不可达，一律走 playwright Frame；
//   真实 mouse 事件（page.mouse）触发 :active/:hover；跨 frame 坐标=locator.boundingBox()
//   （playwright 自动累积 iframe 偏移）；全新 profile 防残留锁；末尾 close+exit 防吊死。
import { chromium } from "playwright-core";
import crypto from "crypto";
import http from "http";
import { mkdirSync, rmSync } from "fs";
import { execSync } from "child_process";

const ROOT = "/tmp/ext-beta";
const ZIP = "/tmp/beta-wt/download/v8.7.19/ChuShi-NewTab-v8.7.19.zip";
const SHOTS = "/tmp/v8719-visual";
const PROFILE = "/tmp/v8719-profile";
const HUB_PORT = 26902;
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
console.log("stage: 扩展自解压 ->", ROOT, "(", ZIP, ")");

let passCount = 0, failCount = 0;
const judge = (name, ok, detail) => {
  console.log(`${ok ? "[PASS]" : "[FAIL]"} ${name} — ${detail}`);
  ok ? passCount++ : failCount++;
};

/* ---------- mock hub：26902 假桥（state 真值 → 面板 live 态） ---------- */
let hubT0 = Date.now();
const hub = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const url = req.url || "";
  if (url.startsWith("/api/ping")) {
    res.end(JSON.stringify({ ok: true, name: "chushi-music-hub", version: "mock-v8719" }));
  } else if (url.startsWith("/api/state")) {
    const pos = (Date.now() - hubT0) / 1000 + 0.3;
    res.end(JSON.stringify({
      ne: { songId: 186016, title: "Mock Song", artist: "Tester", album: "VA",
        playing: true, position: pos, duration: 240, pic: "", ts: Date.now() },
    }));
  } else if (url.startsWith("/api/lyric")) {
    res.end(JSON.stringify({ ok: true, lyric: { songId: "186016", lrc: "[00:01.00]第一句", tlyric: "" } }));
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

/* 注入官方音乐预设（raw 补 commands/links/dock 空数组——flatMap 硬依赖坑录） */
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
judge("P0 面板 live 态（hub→SW→chushi.music→setMode fl）", live, `mode-fl=${live}`);
await sleep(900);

/* ---------- G1 几何零波及（v8.7.18 布局零回归） ---------- */
const geo = await wf.evaluate(() => {
  const $ = (id) => document.getElementById(id);
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { l: +b.left.toFixed(1), t: +b.top.toFixed(1), r: +b.right.toFixed(1), b: +b.bottom.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) }; };
  const card = document.querySelector(".cs-card");
  const ctl = document.querySelector(".cs-ctl");
  const btns = ctl ? [...ctl.querySelectorAll(":scope > button")] : [];
  return { card: r(card), tm: r(document.querySelector(".cs-tm")), tdur: r($("csTDur")), wb: r($("csWordBtn")), prev: r($("csPrev")), next: r($("csNext")), play: r($("csPlay")), ctlBtnIds: btns.map((b) => b.id) };
});
judge("G1a 词钮右缘=总时长右缘+4", geo.wb && Math.abs(geo.wb.r - (geo.tdur.r + 4)) <= 2, `wb.r=${geo.wb.r} tdur.r=${geo.tdur.r}`);
judge("G1b 词钮顶=时长行底+3", Math.abs(geo.wb.t - geo.tm.b - 3) <= 2, `wb.t=${geo.wb.t} tm.b=${geo.tm.b}`);
judge("G1c 词钮 26×26", geo.wb.w === 26 && geo.wb.h === 26, `${geo.wb.w}x${geo.wb.h}`);
judge("G1d cs-ctl 恰三键", JSON.stringify(geo.ctlBtnIds) === JSON.stringify(["csPrev", "csPlay", "csNext"]), JSON.stringify(geo.ctlBtnIds));
const cardCx = (geo.card.l + geo.card.r) / 2;
const trioCx = (geo.prev.l + geo.next.r) / 2;
judge("G1e 三键质心=卡中心（不让位零回归）", Math.abs(trioCx - cardCx) <= 2.5, `trioCx=${trioCx.toFixed(1)} cardCx=${cardCx.toFixed(1)}`);

/* ---------- F0/F1 静息+hover 律不回归 ---------- */
await page.mouse.move(10, 10); /* 移出 */
await sleep(300);
await page.screenshot({ path: `${SHOTS}/F0-word-rest.png` });
const rest = await wf.evaluate(() => {
  const c = getComputedStyle(document.getElementById("csWordBtn"));
  const probe = document.createElement("i");
  probe.style.color = "var(--acc)";
  document.body.appendChild(probe);
  const acc = getComputedStyle(probe).color;
  probe.remove();
  return { tf: c.transform, fil: c.filter, col: c.color, acc, on: c.color === acc };
});
judge("F0 静息=无变换+无辉光+非accent", rest.tf === "none" && rest.fil === "none" && !rest.on, `tf=${rest.tf} fil=${rest.fil} accent=${rest.on}`);

const bb = await (await wf.locator("#csWordBtn").elementHandle()).boundingBox();
if (!bb) throw new Error("word btn boundingBox null");
const cx = bb.x + bb.width / 2, cy = bb.y + bb.height / 2;
await page.mouse.move(cx, cy);
await sleep(450);
await page.screenshot({ path: `${SHOTS}/F1-word-hover.png` });
const hov = await wf.evaluate(() => {
  const b = document.getElementById("csWordBtn");
  const c = getComputedStyle(b);
  const probe = document.createElement("i");
  probe.style.color = "var(--acc)";
  document.body.appendChild(probe);
  const acc = getComputedStyle(probe).color;
  probe.remove();
  return { bg: c.backgroundColor, col: c.color, tf: c.transform, fil: c.filter, acc };
});
judge("F1a hover=底透明（圆底退役零回归）", hov.bg === "rgba(0, 0, 0, 0)" || hov.bg === "transparent", `bg=${hov.bg}`);
judge("F1b hover=图标本体点亮（accent 零回归）", hov.col === hov.acc, `col=${hov.col}`);
judge("F1c hover=无 scale（位移退役零回归）", hov.tf === "none", `tf=${hov.tf}`);
judge("F1d hover=无辉光（off 态与 on 可分辨的前提）", hov.fil === "none", `fil=${hov.fil}`);

/* ---------- F2 按压 :active scale .82 ---------- */
await page.mouse.down();
await sleep(280); /* .12s 过渡充分收敛 */
await page.screenshot({ path: `${SHOTS}/F2-word-pressed.png` });
const press = await wf.evaluate(() => {
  const b = document.getElementById("csWordBtn");
  const c = getComputedStyle(b);
  const n = getComputedStyle(document.getElementById("csNext"));
  return { tf: c.transform, nextTf: n.transform, active: b.matches(":active") };
});
const mPress = press.tf.match(/matrix\(([-\d.]+)/);
judge("F2a 按压 :active 命中", press.active, `matches=${press.active}`);
judge("F2b 按压图标本体 scale .82（按下即陷）", mPress && Math.abs(parseFloat(mPress[1]) - 0.82) <= 0.02, `tf=${press.tf}`);
judge("F2c 他键零波及（csNext 无变换）", press.nextTf === "none" || press.nextTf === "matrix(1, 0, 0, 1, 0, 0)", `nextTf=${press.nextTf}`);

/* ---------- F3 松手脉冲 ---------- */
const tUp0 = Date.now();
await page.mouse.up();
/* 立即抓动画在飞证据（0.32s 窗口） */
let animShot = null;
for (let i = 0; i < 10 && !animShot; i++) {
  animShot = await wf.evaluate(() => {
    const a = document.getAnimations().find((x) => x.animationName === "cs-wpulse-kf");
    return a ? { ct: a.currentTime, play: a.playState } : null;
  }).catch(() => null);
  if (!animShot) await sleep(12);
}
const clsPulse = await wf.evaluate(() => document.getElementById("csWordBtn").className.includes("wpulse"));
judge("F3a 点击落定 wpulse 动画在飞（getAnimations 实证）", !!animShot, animShot ? `ct=${animShot.ct}ms play=${animShot.play}` : "not caught");
judge("F3b wpulse 类在位（重触发挂点）", clsPulse, `cls=${clsPulse}`);
await sleep(150 - (Date.now() - tUp0) > 0 ? 150 - (Date.now() - tUp0) : 0);
const mid = await wf.evaluate(() => getComputedStyle(document.getElementById("csWordBtn")).transform);
const mMid = mid.match(/matrix\(([-\d.]+)/);
judge("F3c 脉冲中段放大 scale>1.08（向 1.22 峰值推进）", mMid && parseFloat(mMid[1]) > 1.08, `mid=${mid}`);
await sleep(500);
const settle = await wf.evaluate(() => {
  const c = getComputedStyle(document.getElementById("csWordBtn"));
  const a = document.getAnimations().find((x) => x.animationName === "cs-wpulse-kf");
  return { tf: c.transform, fil: c.filter, animDone: !a || a.playState === "finished", on: document.getElementById("csWordBtn").className.includes("on") };
});
judge("F3d 脉冲收尾回 none（fill-mode none 无残留）", settle.tf === "none", `tf=${settle.tf}`);
judge("F3e 动画已结束", settle.animDone, `done=${settle.animDone}`);

/* ---------- F5 on 辉光（此时仍悬停=最严场景：on/off 必须可分辨） ---------- */
const onState = await wf.evaluate(() => {
  const b = document.getElementById("csWordBtn");
  const c = getComputedStyle(b);
  const probe = document.createElement("i");
  probe.style.color = "var(--acc)";
  document.body.appendChild(probe);
  const acc = getComputedStyle(probe).color;
  probe.remove();
  return { on: b.className.includes("on"), fil: c.filter, col: c.color, acc };
});
await page.screenshot({ path: `${SHOTS}/F5-word-on-glow.png` });
judge("F5a 点击后 .on 点亮", onState.on, `on=${onState.on}`);
judge("F5b on 态 accent 辉光（悬停下与 off 可分辨=根因修复）", /drop-shadow/.test(onState.fil), `fil=${onState.fil}`);

/* ---------- F4 连点重触发（先点灭，随即连点两次） ---------- */
await wf.click("#csWordBtn"); /* 灭 */
await sleep(700); /* 辉光退场过渡 .3s —— headless 时间膨胀已知族，余量 400ms */
const offFil = await wf.evaluate(() => ({
  fil: getComputedStyle(document.getElementById("csWordBtn")).filter,
  on: document.getElementById("csWordBtn").className.includes("on"),
}));
judge("F5c 再点 off 辉光退（filter none）", !offFil.on && offFil.fil === "none", `fil=${offFil.fil}`);
await wf.click("#csWordBtn"); /* 开（第一次） */
await sleep(620);
await wf.click("#csWordBtn"); /* 灭（第二次，脉冲应重启） */
const restart = await wf.evaluate(() => {
  const a = document.getAnimations().find((x) => x.animationName === "cs-wpulse-kf");
  return a ? { ct: a.currentTime, play: a.playState } : null;
});
judge("F4 连点动画重启（currentTime<120 重触发）", !!restart && restart.ct < 120, restart ? `ct=${restart.ct}ms` : "not caught");
/* 收尾：F4 两次点击后状态已为 off（开→灭），档案无 csDlyric 残留，无需再点 */

/* ---------- G2 按压过渡 .12s ---------- */
const trans = await wf.evaluate(() => {
  const c = getComputedStyle(document.getElementById("csWordBtn"));
  const parts = c.transitionProperty.split(",").map((s) => s.trim());
  const durs = c.transitionDuration.split(",").map((s) => s.trim());
  const i = parts.indexOf("transform");
  return i >= 0 ? durs[i] : "?";
});
judge("G2 按压 transform 过渡 .12s（快陷手感）", trans === "0.12s", `dur=${trans}`);

console.log(`\n===== visual-v8719: ${passCount} PASS / ${failCount} FAIL =====`);
console.log("shots:", SHOTS);
ctx.close();
hub.close();
process.exit(failCount ? 1 : 0);
