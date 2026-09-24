// v8.7.17 视觉目检：
// L 组（本版核心）：全局歌词浮层端到端——mock hub（127.0.0.1:26901 假桥：
//   /api/ping+/api/state+/api/lyric（本版带 tlyric 翻译），position 随墙钟
//   推进）→ 真 SW 轮询 → 真 内容脚本 Port 管线 → 真 closed-shadow 浮层渲染。
//   断言走 DOMSnapshot（穿透 closed shadow）+ CDP pierce 几何取证
//   （getNodeForLocation(pierce)→resolveNode→callFunctionOn→getBoundingClientRect，
//   diag-dlgeom 实测）+ 截图人检。五证：
//   L1 开关链启用→浮层挂载+首句+翻译行1；L2 行切换（行2+翻译行2，
//   行1 退场，下一句预览退役=行3 不在场）；L3 无翻译行（行3 无 tr →
//   第二行清空=药丸变矮）；C1/C2 中心锚律（cx=left+w/2 跨行漂移 ≤2.5px，
//   行2→行3 大宽度变化中心不动）；L4/L5 关闭回程+重开复位。
// D 组：抽屉打开 0.4s computed 读值 + 壁纸同拍 + 掠影零回归（v8.7.16 存量）。
// 坑录沿用：closed shadow 外部 shadowRoot=null → DOMSnapshot 穿透取证；
//   headless 帧合并下逐帧时间鉴别不可靠 → 时值断言走 computed 精确读值；
//   轮询推进证据替代 fixed sleep；全新 profile 防残留锁；脚本末尾必须
//   browser.close()+process.exit。
import { chromium } from "playwright-core";
import crypto from "crypto";
import http from "http";
import { mkdirSync, rmSync } from "fs";
import { execSync } from "child_process";

const ROOT = "/tmp/ext-beta";
const ZIP = "/tmp/beta-wt/download/v8.7.17/ChuShi-NewTab-v8.7.17.zip";
const SHOTS = "/tmp/v8717-visual";
const PROFILE = "/tmp/v8717-profile";
const HUB_PORT = 26901;
const h = crypto.createHash("sha256").update(Buffer.from(ROOT)).digest("hex").slice(0, 32);
const EXT_ID = [...h].map((c) => String.fromCharCode(97 + (parseInt(c, 16) % 26))).join("");
const EXT_URL = (p) => `chrome-extension://${EXT_ID}/${p}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
rmSync(SHOTS, { recursive: true, force: true });
mkdirSync(SHOTS, { recursive: true });
rmSync(PROFILE, { recursive: true, force: true }); /* 全新 profile：防上轮 chromium 残留锁挂死启动 */
/* 自解压（v8.7.17 坑录：visual 原先依赖 /tmp/ext-beta 预置，残留陈旧构建
   =端到端全假的静默坑）——每轮从当版 ZIP 全新解包 */
rmSync(ROOT, { recursive: true, force: true });
mkdirSync(ROOT, { recursive: true });
execSync(`cd ${ROOT} && unzip -o -q ${ZIP}`);
console.log("stage: 扩展自解压 ->", ROOT, "(", ZIP, ")");

let passCount = 0, failCount = 0;
const judge = (name, ok, detail) => {
  console.log(`${ok ? "[PASS]" : "[FAIL]"} ${name} — ${detail}`);
  ok ? passCount++ : failCount++;
};

/* ---------- mock hub：26901 假桥（state 真值 + lrc/tlyric 歌词，position 墙钟推进） ----------
   行宽设计：行1（5 字）→ 行2（11 字，明显变宽）→ 行3（3 字，无翻译=骤窄）
   → 行4（5 字+翻译）→ 行5。翻译吸附：tlyric 与 lrc 同起点（gap 0 必命中）。
   行3/行5 故意无翻译（joinTranslation 吸附不到 → tr 缺席 → 翻译行清空）。 */
let hubT0 = Date.now();
const LRC = "[00:01.00]第一句歌词\n[00:04.00]第二句歌词文本明显更长\n[00:07.00]短一行\n[00:10.00]第四句歌词\n[00:13.00]第五句歌词";
const TLRC = "[00:01.00]翻译一\n[00:04.00]翻译二也跟着变长\n[00:10.00]翻译四";
const hub = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const url = req.url || "";
  if (url.startsWith("/api/ping")) {
    res.end(JSON.stringify({ ok: true, name: "chushi-music-hub", version: "mock-v8717" }));
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

/* DOMSnapshot 穿透 closed shadow——宿主子树取证（排除悬浮卡 flyrIn 污染，
   v8.7.16 同款）。attributes[i] 是第 i 节点的 [nameIdx,valueIdx,…] 索引对数组。 */
async function dlProbe(pg, text) {
  const client = await pg.context().newCDPSession(pg);
  const snap = await Promise.race([
    client.send("DOMSnapshot.captureSnapshot", { computedStyles: [] }),
    new Promise((_, rej) => setTimeout(() => rej(new Error("captureSnapshot timeout 15s")), 15000)),
  ]);
  await client.detach();
  const s = snap.strings || [];
  const doc = snap.documents && snap.documents[0];
  if (!doc) return { present: false, display: "NONE", found: false };
  const nodes = doc.nodes;
  const nCount = nodes.nodeName.length;
  let hostIdx = -1, display = "NONE";
  for (let i = 0; i < nCount; i++) {
    const a = nodes.attributes[i] || [];
    for (let k = 0; k + 1 < a.length; k += 2) {
      const nm = s[a[k]], vl = s[a[k + 1]] || "";
      if (nm === "id" && vl === "chushi-dlyric-host") hostIdx = i;
      if (nm === "style" && /display:\s*\w+/.test(vl)) {
        if (i === hostIdx || hostIdx < 0) {
          const dm = /display:\s*(\w+)/.exec(vl);
          if (i === hostIdx && dm) display = dm[1];
        }
      }
    }
  }
  if (hostIdx < 0) return { present: false, display: "NONE", found: false };
  const ha = nodes.attributes[hostIdx] || [];
  for (let k = 0; k + 1 < ha.length; k += 2) {
    if (s[ha[k]] === "style") {
      const dm = /display:\s*(\w+)/.exec(s[ha[k + 1]] || "");
      if (dm) display = dm[1];
    }
  }
  const isDescendant = (i) => {
    let cur = i, g = 0;
    while (cur >= 0 && g++ < 300) {
      if (cur === hostIdx) return true;
      cur = nodes.parentIndex[cur];
    }
    return false;
  };
  let found = false;
  for (let i = 0; i < nCount && !found; i++) {
    const vi = nodes.nodeValue[i];
    if (vi >= 0 && s[vi] && s[vi].includes(text) && isDescendant(i)) found = true;
  }
  return { present: true, display, found };
}

/* v8.7.17 中心锚几何取证：药丸 inline style 读 left/top → CDP pierce 命中
   （getNodeForLocation pierce:true 穿透 closed shadow）→ resolveNode →
   callFunctionOn closest('.dl').getBoundingClientRect() → 精确 x/w。
   diag-dlgeom 实测：closed shadow 内部节点可 pierce 寻址、rect 精确。 */
async function dlGeom(pg) {
  const probe = await dlProbe(pg, "Mock Song"); /* 触发一次快照拿 display 基面 */
  if (!probe.present || probe.display !== "block") return { display: probe.display };
  const client = await pg.context().newCDPSession(pg);
  try {
    /* 药丸位置：先从快照取 .dl 的 style（left/top） */
    const snap = await client.send("DOMSnapshot.captureSnapshot", { computedStyles: [] });
    const s = snap.strings || [];
    const doc = snap.documents && snap.documents[0];
    if (!doc) return { display: "NONE" };
    const nodes = doc.nodes;
    let pillLeft = null, pillTop = null;
    for (let i = 0; i < nodes.nodeName.length && pillLeft === null; i++) {
      const a = nodes.attributes[i] || [];
      for (let k = 0; k + 1 < a.length; k += 2) {
        if (s[a[k]] === "class" && s[a[k + 1]] === "dl") {
          for (let m = 0; m + 1 < a.length; m += 2) {
            if (s[a[m]] === "style") {
              const lm = /left:\s*([\d.]+)px/.exec(s[a[m + 1]] || "");
              const tm = /top:\s*([\d.]+)px/.exec(s[a[m + 1]] || "");
              if (lm) pillLeft = parseFloat(lm[1]);
              if (tm) pillTop = parseFloat(tm[1]);
            }
          }
        }
      }
    }
    if (pillLeft === null || pillTop === null) return { display: "block", rect: null };
    await client.send("DOM.enable");
    const hit = await client.send("DOM.getNodeForLocation", {
      x: Math.round(pillLeft + 40), y: Math.round(pillTop + 12), pierce: true,
    });
    if (!hit.backendNodeId) return { display: "block", rect: null };
    const res = await client.send("DOM.resolveNode", { backendNodeId: hit.backendNodeId });
    const ev = await client.send("Runtime.callFunctionOn", {
      objectId: res.object.objectId,
      functionDeclaration: "function () { var el = this.nodeType === 1 ? this : this.parentElement; var p = el && el.closest('.dl'); if (!p) return null; var r = p.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }",
      returnByValue: true,
    });
    return { display: "block", rect: ev.result.value };
  } finally {
    await client.detach();
  }
}

/* ================= L 组：全局歌词浮层端到端 ================= */
console.log("===== L1 开关链：面板镜像键 cardDlyric=true → 浮层挂载 =====");
await page.evaluate(() => chrome.storage.local.set({ cardDlyric: true }));
await sleep(400);

const page2 = await ctx.newPage({ viewport: { width: 1280, height: 800 } });
const errors2 = [];
page2.on("pageerror", (e) => errors2.push(String(e).slice(0, 200)));
page2.on("console", (m) => { if (m.type() === "error") errors2.push(m.text().slice(0, 200)); });
await fetch(`http://127.0.0.1:${HUB_PORT}/reset`);
console.log("L-phase: page2 goto begin", Date.now());
await page2.goto(`http://127.0.0.1:${HUB_PORT}/`, { waitUntil: "load", timeout: 15000 });
let l1 = null, l1tr = null;
for (let i = 0; i < 30; i++) {
  l1 = await dlProbe(page2, "第一句歌词");
  if (l1.present && l1.display === "block" && l1.found) break;
  if (i === 8) {
    /* 诊断旁证：页内直查（getElementById）与快照通道互证 */
    const direct = await page2.evaluate(() => {
      const dl = document.getElementById("chushi-dlyric-host");
      const card = document.getElementById("chushi-card-host");
      return { host: !!dl, card: !!card, disp: dl ? dl.style.display : "N/A", kids: document.body.children.length };
    }).catch((e) => ({ err: String(e).slice(0, 120) }));
    console.log("L1 诊断直查:", JSON.stringify(direct), "errors2:", JSON.stringify(errors2.slice(0, 3)));
  }
  await sleep(300);
}
l1tr = await dlProbe(page2, "翻译一");
judge("L1 浮层挂载+首句渲染（开关链 + Port 数据面 + 真值到达 + closed shadow 子树取证）",
  !!l1 && l1.present === true && l1.display === "block" && l1.found, JSON.stringify(l1) + " errs=" + JSON.stringify(errors2.slice(0, 2)));
judge("L1b 翻译行1（tlyric 吸附 → .dl2=翻译一）", l1tr.found, JSON.stringify(l1tr));
const g1 = await dlGeom(page2);
console.log("G1 几何:", JSON.stringify(g1));

console.log("===== L2 行切换（行1→行2）+ 预览退役 =====");
let l2 = null, l2tr = null, l3prev = null, l1gone = null;
for (let i = 0; i < 40; i++) {
  l2 = await dlProbe(page2, "第二句歌词文本明显更长");
  if (l2.found) break;
  await sleep(300);
}
l2tr = await dlProbe(page2, "翻译二也跟着变长");
l3prev = await dlProbe(page2, "短一行");
l1gone = await dlProbe(page2, "第一句歌词");
judge("L2a 行切换跟随（dl1=行2 + 翻译行2 + 行1 退场）",
  l2.found && l2tr.found && !l1gone.found && l2.display === "block",
  `line2=${l2.found} tr2=${l2tr.found} line1Still=${l1gone.found}`);
judge("L2b 下一句预览退役（行2 在场时 行3 不在场）", !l3prev.found, `next=短一行 found=${l3prev.found}`);
const g2 = await dlGeom(page2);
console.log("G2 几何:", JSON.stringify(g2));
await page2.screenshot({ path: `${SHOTS}/L2-dlyric-line2-tr.png` });

console.log("===== L3 行3 无翻译（翻译行清空=药丸变矮）+ 中心锚见证 =====");
let l3 = null, l3t = null;
for (let i = 0; i < 40; i++) {
  l3 = await dlGeom(page2);
  l3t = await dlProbe(page2, "短一行");
  if (l3t.found && l3.rect && l3.rect.h < 66) break; /* 无翻译行高度 ≈52（有翻译 ≈72） */
  await sleep(300);
}
judge("L3a 行3 在场且翻译行清空（无 tr → .dl2 空）", l3t.found && l3.rect && l3.rect.h < 66,
  `line3=${l3t.found} h=${l3.rect ? Math.round(l3.rect.h) : "NA"}`);
judge("L3b 翻译三 不在场（吸附不到=不显示）", !(await dlProbe(page2, "翻译三")).found, "");
const g2b = await dlGeom(page2);
const g3 = await dlGeom(page2);
console.log("G2b/G3 几何:", JSON.stringify(g2b), JSON.stringify(g3));

/* 中心锚律：cx = rect.x + rect.w/2 跨行漂移容忍 ≤2.5px（取整半差 ±0.5 + 亚像素）。
   行1→行2 主行变宽（左缘应左移）；行2→行3 骤窄（左缘应右移）——左缘必动=证明
   重排发生，中心不动=锚律本体。 */
const centers = [g1, g2, g3].map((g) => (g.rect ? g.rect.x + g.rect.w / 2 : null));
const lefts = [g1, g2, g3].map((g) => (g.rect ? g.rect.x : null));
const cD1 = centers[0] !== null && centers[1] !== null ? Math.abs(centers[1] - centers[0]) : null;
const cD2 = centers[1] !== null && centers[2] !== null ? Math.abs(centers[2] - centers[1]) : null;
const lMoved = lefts[0] !== null && lefts[1] !== null && Math.abs(lefts[1] - lefts[0]) > 1;
judge("C1 中心锚：行1→行2 中心漂移 ≤2.5px（且左缘确有移动）",
  cD1 !== null && cD1 <= 2.5 && lMoved, `cx drift=${cD1 === null ? "NA" : cD1.toFixed(2)} lefts=${lefts.map((v) => v === null ? "NA" : Math.round(v)).join("→")}`);
judge("C2 中心锚：行2→行3 骤窄中心漂移 ≤2.5px",
  cD2 !== null && cD2 <= 2.5, `cx drift=${cD2 === null ? "NA" : cD2.toFixed(2)}`);
await page2.screenshot({ path: `${SHOTS}/L3-dlyric-line3-notr.png` });

console.log("===== L4 关闭链：storage cardDlyric=false → 浮层隐没 =====");
await page.evaluate(() => chrome.storage.local.set({ cardDlyric: false }));
await sleep(600);
const l4off = await dlProbe(page2, "第四句歌词");
judge("L4 关闭回程（onChanged → dlHide）", l4off.display === "none", `display=${l4off.display}`);

console.log("===== L5 重新开启（复位 + 行跟随续走至行4） =====");
await page.evaluate(() => chrome.storage.local.set({ cardDlyric: true }));
let l5 = null, l5tr = null;
for (let i = 0; i < 40; i++) {
  l5 = await dlProbe(page2, "第四句歌词");
  if (l5.display === "block" && l5.found) break;
  await sleep(300);
}
l5tr = await dlProbe(page2, "翻译四");
judge("L5 重开复位（dlBoot 重臂 + 行跟随至行4 + 翻译行4）",
  l5.display === "block" && l5.found && l5tr.found, `display=${l5.display} line4=${l5.found} tr4=${l5tr.found}`);
await page2.screenshot({ path: `${SHOTS}/L5-dlyric-reopen.png` });
await page2.close();

/* ================= D 组：抽屉打开提速（0.4s 存量零回归） ================= */
console.log("===== D 组：抽屉凝聚 0.4s + 壁纸同步 =====");
const WALLPAPER = "data:image/svg+xml;utf8," + encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='1280' height='800'>` +
  `<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>` +
  `<stop offset='0' stop-color='#1e3a5f'/><stop offset='0.5' stop-color='#2d4a73'/>` +
  `<stop offset='1' stop-color='#0f2438'/></linearGradient></defs>` +
  `<rect width='1280' height='800' fill='url(#g)'/>` +
  `${[...Array(17)].map((_, i) => `<line x1='${i * 80}' y1='0' x2='${i * 80}' y2='800' stroke='rgba(255,255,255,0.18)' stroke-width='1.5'/>`).join("")}` +
  `${[...Array(11)].map((_, i) => `<line x1='0' y1='${i * 80}' x2='1280' y2='${i * 80}' stroke='rgba(255,255,255,0.18)' stroke-width='1.5'/>`).join("")}` +
  `</svg>`
);
await presetSettings((wp) => {
  const raw = localStorage.getItem("start:settings");
  const obj = raw ? JSON.parse(raw) : {};
  obj.background = "photo";
  obj.photoId = "custom";
  obj.wallpaperUrl = wp;
  obj.wallpaperRev = (obj.wallpaperRev || 0) + 1;
  localStorage.setItem("start:settings", JSON.stringify(obj));
}, WALLPAPER);
console.log("photo-mode 挂载:", await af.evaluate(() => document.documentElement.classList.contains("photo-mode")));

async function ensureClosed() {
  await page.mouse.click(90, 620, { button: "middle" });
  await sleep(1100);
  let still = await af.evaluate(() => document.documentElement.classList.contains("cs-drawer"));
  if (still) { await page.mouse.click(90, 620, { button: "middle" }); await sleep(1100); }
  return await af.evaluate(() => !document.documentElement.classList.contains("cs-drawer"));
}
const dClosed = await ensureClosed();
judge("D0 抽屉关闭态确认", dClosed, "");

await page.mouse.click(90, 620, { button: "middle" });
await sleep(900);
const dOpen = await af.evaluate(() => {
  const veil = document.querySelector(".cl-drawer-veil");
  const wp = document.querySelector(".wallpaper-layer");
  const cs = getComputedStyle(veil);
  const csWp = getComputedStyle(wp);
  const bf = cs.backdropFilter;
  return {
    animDur: cs.animationDuration,
    animName: cs.animationName,
    tintDur: getComputedStyle(veil, "::before").animationDuration,
    wpTransDur: csWp.transitionDuration,
    blurFull: /blur\((14|13\.\d+)px\)/.test(bf),
    satFree: !/saturate/.test(bf),
    scaleSettled: csWp.transform.includes("1.08"),
  };
});
console.log("D 开态读值:", JSON.stringify(dOpen));
judge("D1 凝聚 animation 0.4s（computed 精确读值）",
  dOpen.animDur === "0.4s" && dOpen.animName === "dv-open-kf" && dOpen.tintDur === "0.4s",
  `anim=${dOpen.animDur}/${dOpen.animName} tint=${dOpen.tintDur}`);
judge("D2 壁纸放大 transition 0.4s 同拍 + scale 1.08 落座",
  dOpen.wpTransDur === "0.4s" && dOpen.scaleSettled,
  `trans=${dOpen.wpTransDur} settled=${dOpen.scaleSettled}`);
judge("D3 凝聚端点行为（blur 凝满 14px + 掠影无 sat 零回归）",
  dOpen.blurFull && dOpen.satFree, `full=${dOpen.blurFull} satFree=${dOpen.satFree}`);
await page.screenshot({ path: `${SHOTS}/D-drawer-open-04s.png` });
await ensureClosed();

/* ================= 总结 ================= */
console.log(`\n===== v8.7.17 visual: ${passCount} PASS / ${failCount} FAIL =====`);
console.log(`shots -> ${SHOTS}`);
await ctx.close();
try { hub.close(); } catch { }
process.exit(failCount ? 1 : 0);
