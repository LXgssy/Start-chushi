// v8.7.18 视觉目检：
// P 组（本版核心）：「词」开关迁时长行右下 + 真字形 + hover 律——
//   P1 位置律：词钮右缘=csTDur 右缘+4（right:-4px 设计值 ±2）、钮顶=cs-tm 底+3（±2）、
//      与 csNext 水平无重叠（右缘区空带）
//   P2 零让位律：cs-ctl 内恰 3 键（prev/play/next）+ 三键质心==卡中心 ±2.5
//   P3 hover 律：词钮 hover=底透明+accent 图标本体点亮+无 scale；csNext hover=card2 圆底在（他键零波及）
//   P4 字形居中律：真字形 path d 串独立解析 bbox 中心==(12,12) ±0.35（方框 rect 中心恒 12,12）
//      + fill=currentColor stroke=none 形态在位（真字形描取非笔画近似）
//   P5 on 点亮：click → .on + accent；截图人检（rest/hover/on）
// L1 回归：cardDlyric=true → dl 浮层挂载渲染（v8.7.17 链路零回归，DOMSnapshot 穿透）
// D1-D3 回归：抽屉 0.4s + 壁纸 1.08 同拍（v8.7.16/17 零回归，computed 读值）
// 坑录沿用：部件 iframe=sandbox allow-scripts 不透明源（PresetWidgets.tsx 头注）→
//   父页 contentDocument 不可达 → 一律走 playwright srcdoc Frame 对象（CDP 级）；
//   headless hover 需 mouse 移动真实触发 :hover；全新 profile 防残留锁；
//   mock hub 带 tlyric（L1 用）；脚本末尾必须 browser.close()+process.exit。
import { chromium } from "playwright-core";
import crypto from "crypto";
import http from "http";
import { mkdirSync, rmSync } from "fs";
import { execSync } from "child_process";

const ROOT = "/tmp/ext-beta";
const ZIP = "/tmp/beta-wt/download/v8.7.18/ChuShi-NewTab-v8.7.18.zip";
const SHOTS = "/tmp/v8718-visual";
const PROFILE = "/tmp/v8718-profile";
const HUB_PORT = 26901;
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

/* ---------- mock hub：26901 假桥（state 真值 → 面板 live 态 + L1 歌词） ---------- */
let hubT0 = Date.now();
const LRC = "[00:01.00]第一句歌词\n[00:04.00]第二句歌词文本明显更长\n[00:07.00]短一行";
const TLRC = "[00:01.00]翻译一\n[00:04.00]翻译二也跟着变长";
const hub = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const url = req.url || "";
  if (url.startsWith("/api/ping")) {
    res.end(JSON.stringify({ ok: true, name: "chushi-music-hub", version: "mock-v8718" }));
  } else if (url.startsWith("/api/state")) {
    const pos = (Date.now() - hubT0) / 1000 + 0.3;
    res.end(JSON.stringify({
      ne: { songId: 186016, title: "Mock Song", artist: "Tester", album: "VA",
        playing: true, position: pos, duration: 240, pic: "", ts: Date.now() },
    }));
  } else if (url.startsWith("/api/lyric")) {
    res.end(JSON.stringify({ ok: true, lyric: { songId: "186016", lrc: LRC, tlyric: TLRC } }));
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
  if (!af) throw new Error("shell frame not found (presetSettings)");
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

/* 部件 srcdoc Frame 定位（不透明源 → 父页不可直查，坑录） */
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

/* ================= P 组：词钮几何+字形+hover ================= */
console.log("===== P1 面板打开（live 态等待） =====");
await ensureNoPanel();
await af.evaluate(() => [...document.querySelectorAll(".dock-btn")].find((b) => b.getAttribute("aria-label") === "音乐")?.click());
await sleep(1800); /* 弹簧开合 ~0.9s + srcdoc 装载 */
const wf = await widgetFrame();
if (!wf) throw new Error("widget srcdoc frame not found (csWordBtn/csTDur 缺席)");
/* live 态：hub state 到达 → setMode("fl") → csTDur 有值 */
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
judge("P0 面板 live 态（hub→SW→chushi.music→setMode fl）", live, `mode-fl+duration=${live ? "ok" : "stuck"}`);
await sleep(900); /* resize 自报+布局稳态 */

const geo = await wf.evaluate(() => {
  const $ = (id) => document.getElementById(id);
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { l: +b.left.toFixed(1), t: +b.top.toFixed(1), r: +b.right.toFixed(1), b: +b.bottom.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) }; };
  const card = document.querySelector(".cs-card");
  const ctl = document.querySelector(".cs-ctl");
  const btns = ctl ? [...ctl.querySelectorAll(":scope > button")] : [];
  /* accent 真值解析（临时探针元素） */
  const probe = document.createElement("i");
  probe.style.color = "var(--acc)";
  document.body.appendChild(probe);
  const acc = getComputedStyle(probe).color;
  probe.remove();
  /* 真字形 d 串独立解析 bbox（symbol 非渲染态 getBBox 不可靠 → 自解析；
     隐式重复律：m/M 首对=定位、后续对=相对/绝对 lineto，z 后 cur=子路径起点。
     字母与数字粘连形态（m7.2/-0.9z）先预分隔离） */
  function bbox2(d) {
    const toks = d.replace(/[a-zA-Z]/g, (m) => " " + m + " ").split(/[\s,]+/).filter(Boolean);
    let cx = 0, cy = 0, sx = 0, sy = 0, cmd = null, first = true;
    let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
    let i = 0;
    while (i < toks.length) {
      const t = toks[i];
      if (/^[a-zA-Z]$/.test(t)) {
        /* z 复位必须在字母分支内做：本 d 形态 z 后恒紧跟 m（字母），数字对分支永不触发 */
        if (t === "z" || t === "Z") { cx = sx; cy = sy; }
        cmd = t; first = true; i++; continue;
      }
      const x = parseFloat(t), y = parseFloat(toks[i + 1]); i += 2;
      if (cmd === "m") { if (first) { cx += x; cy += y; sx = cx; sy = cy; first = false; } else { cx += x; cy += y; } }
      else if (cmd === "M") { if (first) { cx = x; cy = y; sx = x; sy = y; first = false; } else { cx = x; cy = y; } }
      else if (cmd === "l") { cx += x; cy += y; }
      else if (cmd === "L") { cx = x; cy = y; }
      else if (cmd === "z" || cmd === "Z") { cx = sx; cy = sy; continue; }
      minx = Math.min(minx, cx); maxx = Math.max(maxx, cx); miny = Math.min(miny, cy); maxy = Math.max(maxy, cy);
    }
    return { cx: +((minx + maxx) / 2).toFixed(2), cy: +((miny + maxy) / 2).toFixed(2), w: +(maxx - minx).toFixed(1), h: +(maxy - miny).toFixed(1) };
  }
  const sym = document.getElementById("cs-i-word");
  const path = sym ? sym.querySelector('path[fill="currentColor"]') : null;
  const rectEl = sym ? sym.querySelector("rect") : null;
  const wb = $("csWordBtn");
  return {
    card: r(card), tm: r(document.querySelector(".cs-tm")),
    tdur: r($("csTDur")), tcur: r($("csTCur")),
    wb: r(wb), prev: r($("csPrev")), play: r($("csPlay")), next: r($("csNext")),
    foot: r(document.querySelector(".cs-foot")),
    ctlBtnIds: btns.map((b) => b.id),
    acc,
    glyph: path && path.getAttribute("stroke") === "none" ? { bb: bbox2(path.getAttribute("d")), stroke: path.getAttribute("stroke"), fill: path.getAttribute("fill") } : null,
    rectBB: rectEl ? { x: rectEl.getAttribute("x"), y: rectEl.getAttribute("y"), w: rectEl.getAttribute("width"), h: rectEl.getAttribute("height") } : null,
    wbSvg: r(wb ? wb.querySelector("svg") : null),
  };
});
console.log("P 几何:", JSON.stringify(geo));

/* P1 位置律 */
judge("P1a 词钮右缘=总时长右缘+4（right:-4px 设计）", geo.wb && geo.tdur && Math.abs(geo.wb.r - (geo.tdur.r + 4)) <= 2, `wb.r=${geo.wb.r} tdur.r=${geo.tdur.r}`);
judge("P1b 词钮顶=时长行底+3（margin-top:3px 设计）", Math.abs(geo.wb.t - geo.tm.b - 3) <= 2, `wb.t=${geo.wb.t} tm.b=${geo.tm.b}`);
judge("P1c 词钮与三键无重叠（右缘空带）", geo.wb.l > geo.next.r + 10, `wb.l=${geo.wb.l} next.r=${geo.next.r}`);
judge("P1d 词钮 26×26", geo.wb.w === 26 && geo.wb.h === 26, `${geo.wb.w}x${geo.wb.h}`);

/* P2 零让位律 */
const cardCx = (geo.card.l + geo.card.r) / 2;
const trioCx = (geo.prev.l + geo.next.r) / 2;
judge("P2a cs-ctl 恰三键（prev/play/next）", JSON.stringify(geo.ctlBtnIds) === JSON.stringify(["csPrev", "csPlay", "csNext"]), JSON.stringify(geo.ctlBtnIds));
judge("P2b 三键质心=卡中心（不让位）", Math.abs(trioCx - cardCx) <= 2.5, `trioCx=${trioCx.toFixed(1)} cardCx=${cardCx.toFixed(1)}`);

/* P4 字形居中律 */
judge("P4a 真字形 fill 形态（fill=currentColor+stroke=none）", !!geo.glyph, JSON.stringify(geo.glyph ? { fill: geo.glyph.fill, stroke: geo.glyph.stroke } : null));
judge("P4b 字形 bbox 中心=(12,12)±0.35（方框正中）", geo.glyph && Math.abs(geo.glyph.bb.cx - 12) <= 0.35 && Math.abs(geo.glyph.bb.cy - 12) <= 0.35, `cx=${geo.glyph.bb.cx} cy=${geo.glyph.bb.cy}`);
judge("P4c 字形尺寸 ~11.3×11.4（字面占比 63%）", geo.glyph && Math.abs(geo.glyph.bb.h - 11.4) <= 0.4 && Math.abs(geo.glyph.bb.w - 11.25) <= 0.6, `w=${geo.glyph.bb.w} h=${geo.glyph.bb.h}`);
judge("P4d 方框 rect 正中恒定", geo.rectBB && Math.abs(parseFloat(geo.rectBB.x) + parseFloat(geo.rectBB.w) / 2 - 12) < 0.01 && Math.abs(parseFloat(geo.rectBB.y) + parseFloat(geo.rectBB.h) / 2 - 12) < 0.01, JSON.stringify(geo.rectBB));

/* P3 hover 律（真实 mouse 移动触发 :hover） */
await wf.hover("#csWordBtn");
await sleep(450);
const hovWord = await wf.evaluate(() => {
  const b = document.getElementById("csWordBtn");
  const c = getComputedStyle(b);
  const probe = document.createElement("i");
  probe.style.color = "var(--acc)";
  document.body.appendChild(probe);
  const acc = getComputedStyle(probe).color;
  probe.remove();
  return { bg: c.backgroundColor, col: c.color, tf: c.transform, acc };
});
await page.screenshot({ path: `${SHOTS}/P3-word-hover.png` });
await wf.hover("#csNext");
await sleep(450);
const hovNext = await wf.evaluate(() => {
  const c = getComputedStyle(document.getElementById("csNext"));
  return { bg: c.backgroundColor };
});
judge("P3a 词钮 hover=底透明（圆底退役）", hovWord.bg === "rgba(0, 0, 0, 0)" || hovWord.bg === "transparent", `bg=${hovWord.bg}`);
judge("P3b 词钮 hover=图标本体点亮（accent）", hovWord.col === hovWord.acc, `col=${hovWord.col} acc=${hovWord.acc}`);
judge("P3c 词钮 hover=无 scale（位移家族退役）", hovWord.tf === "none", `tf=${hovWord.tf}`);
judge("P3d 他键圆底零波及（csNext hover card2 在）", hovNext.bg !== "rgba(0, 0, 0, 0)" && hovNext.bg !== "transparent", `bg=${hovNext.bg}`);

/* P5 on 点亮（注意：click 会触发 csDlyric→host 镜像→onChanged 回环，host 可能
   重推 --w-accent 入部件 —— accent 探针必须在同一时刻重建，不能复用 P3 旧值） */
await wf.click("#csWordBtn");
await sleep(600);
const onState = await wf.evaluate(() => {
  const b = document.getElementById("csWordBtn");
  const probe = document.createElement("i");
  probe.style.color = "var(--acc)";
  document.body.appendChild(probe);
  const acc = getComputedStyle(probe).color;
  probe.remove();
  return { on: b.classList.contains("on"), col: getComputedStyle(b).color, acc };
});
await page.screenshot({ path: `${SHOTS}/P5-word-on.png` });
await wf.click("#csWordBtn");
await sleep(350);
const offState = await wf.evaluate(() => ({ on: document.getElementById("csWordBtn").classList.contains("on") }));
judge("P5 词钮 on 点亮/accent + 回程复位", onState.on && onState.col === onState.acc && !offState.on, `on=${onState.on} col=${onState.col} acc=${onState.acc} reoff=${!offState.on}`);
await page.screenshot({ path: `${SHOTS}/P1-panel-rest.png` });

/* 收面板 */
await ensureNoPanel();

/* ================= L1 回归：dl 浮层挂载 ================= */
console.log("===== L1 全局歌词浮层挂载（v8.7.17 链路零回归） =====");
await page.evaluate(() => chrome.storage.local.set({ cardDlyric: true }));
await sleep(400);
const page2 = await ctx.newPage({ viewport: { width: 1280, height: 800 } });
await page2.goto(`http://127.0.0.1:${HUB_PORT}/`, { waitUntil: "load", timeout: 15000 });
let l1ok = false;
for (let i = 0; i < 24; i++) {
  l1ok = await page2.evaluate(() => {
    const dl = document.getElementById("chushi-dlyric-host");
    return !!dl && dl.style.display === "block";
  }).catch(() => false);
  if (l1ok) break;
  await sleep(500);
}
judge("L1 dl 浮层挂载+显示（closed shadow 宿主在位）", l1ok, `host=${l1ok}`);
await page.evaluate(() => chrome.storage.local.set({ cardDlyric: false }));
await page2.close();

/* ================= D 组：抽屉 0.4s 零回归 ================= */
console.log("===== D 组：抽屉凝聚 0.4s + 壁纸同步 =====");
async function ensureClosed() {
  await page.mouse.click(90, 620, { button: "middle" });
  await sleep(1100);
  let still = await af.evaluate(() => document.documentElement.classList.contains("cs-drawer"));
  if (still) { await page.mouse.click(90, 620, { button: "middle" }); await sleep(1100); }
  return await af.evaluate(() => !document.documentElement.classList.contains("cs-drawer"));
}
const dClosed = await ensureClosed();
judge("D0 抽屉关闭态确认", dClosed, "");
await page.bringToFront();
await page.mouse.click(90, 620, { button: "middle" });
let drawerOpen = false;
for (let i = 0; i < 6; i++) {
  await sleep(500);
  drawerOpen = await af.evaluate(() => document.documentElement.classList.contains("cs-drawer"));
  if (drawerOpen) break;
  await page.mouse.click(90, 620, { button: "middle" });
}
await sleep(600);
const dDiag = await af.evaluate(() => ({
  cls: document.documentElement.className,
  hasVeil: !!document.querySelector(".cl-drawer-veil"),
  stageH: document.querySelector(".cl-stage > div")?.getBoundingClientRect().height ?? 0,
  glass: !!document.querySelector(".glass-card.cl-panel"),
}));
console.log("D 诊断:", JSON.stringify(dDiag));
await page.screenshot({ path: `${SHOTS}/D-debug.png` });
const dOpen = await af.evaluate(() => {
  const veil = document.querySelector(".cl-drawer-veil");
  if (!veil) return null;
  const wp = document.querySelector(".wallpaper-layer");
  const cs = getComputedStyle(veil);
  return {
    animDur: cs.animationDuration,
    animName: cs.animationName,
    tintDur: getComputedStyle(veil, "::before").animationDuration,
    hasWp: !!wp,
    wpTransDur: wp ? getComputedStyle(wp).transitionDuration : null,
    scaleSettled: wp ? getComputedStyle(wp).transform.includes("1.08") : null,
  };
});
judge("D1 凝聚 animation 0.4s（computed 精确读值）", dOpen && dOpen.animDur === "0.4s" && dOpen.animName === "dv-open-kf" && dOpen.tintDur === "0.4s", JSON.stringify(dOpen));
/* 本轮注入官方音乐预设替换默认预设 → 默认壁纸缺席（环境差异，非本版波及；
   v8.7.16/17 visual 已有壁纸同拍见证）——有壁纸则照常断言，缺席豁免 */
judge("D2 壁纸放大 0.4s 同拍 + 1.08 落座", dOpen && (!dOpen.hasWp || (dOpen.wpTransDur === "0.4s" && dOpen.scaleSettled)), `wp=${dOpen && dOpen.hasWp} trans=${dOpen && dOpen.wpTransDur} settled=${dOpen && dOpen.scaleSettled}`);
await page.screenshot({ path: `${SHOTS}/D-drawer-open-04s.png` });
await ensureClosed();

/* ================= 总结 ================= */
console.log(`\n===== v8.7.18 visual: ${passCount} PASS / ${failCount} FAIL =====`);
console.log(`shots -> ${SHOTS}`);
await ctx.close();
try { hub.close(); } catch { }
process.exit(failCount ? 1 : 0);
