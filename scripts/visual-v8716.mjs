// v8.7.16 视觉目检：
// L 组（本版核心）：全局歌词浮层端到端——mock hub（127.0.0.1:26901 假桥：
//   /api/ping+/api/state+/api/lyric，position 随墙钟推进）→ 真 SW 轮询 → 真
//   内容脚本 Port 管线 → 真 closed-shadow 浮层渲染。断言走 DOMSnapshot
//   （CDP captureSnapshot 穿透 closed shadow）+ host 显隐面（display 可观
//   察）+ 截图人检。四证：L1 开关链启用→浮层在场；L2 歌词逐行跟随（行1→
//   行2 推进 + 下一句预览）；L3 关闭→浮层隐没（storage 回程）；L4 截图。
// D 组：抽屉打开提速见证——computed animationDuration/transitionDuration
//   精确读值（0.4s 无噪）+ 行为端点（blur 凝满 14px / 壁纸 scale 1.08 落座）
//   + 掠影深纱零回归（无 sat）。
// 坑录沿用：closed shadow 外部 shadowRoot=null → DOMSnapshot 穿透；headless
//   帧合并下逐帧时间鉴别不可靠（0.4 vs 0.5s 噪声同量级）→ 时值断言走
//   computed style 精确读值而非轨迹判别；visual 环境 ESC 只退编辑态不关
//   抽屉（v8.7.12 坑录）→ click 序列以关闭态确认为前提；脚本末尾必须
//   browser.close()+process.exit（否则浏览器子进程吊住事件循环假死）。
import { chromium } from "playwright-core";
import crypto from "crypto";
import http from "http";
import { mkdirSync, rmSync } from "fs";

const ROOT = "/tmp/ext-beta";
const SHOTS = "/tmp/v8716-visual";
const PROFILE = "/tmp/v8716-profile";
const HUB_PORT = 26901;
const h = crypto.createHash("sha256").update(Buffer.from(ROOT)).digest("hex").slice(0, 32);
const EXT_ID = [...h].map((c) => String.fromCharCode(97 + (parseInt(c, 16) % 26))).join("");
const EXT_URL = (p) => `chrome-extension://${EXT_ID}/${p}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
rmSync(SHOTS, { recursive: true, force: true });
mkdirSync(SHOTS, { recursive: true });
rmSync(PROFILE, { recursive: true, force: true }); /* 全新 profile：防上轮 chromium 残留锁挂死启动 */

let passCount = 0, failCount = 0;
const judge = (name, ok, detail) => {
  console.log(`${ok ? "[PASS]" : "[FAIL]"} ${name} — ${detail}`);
  ok ? passCount++ : failCount++;
};

/* ---------- mock hub：26901 假桥（state 真值 + lrc 歌词，position 墙钟推进） ---------- */
let hubT0 = Date.now();
const LRC = "[00:01.00]第一句歌词\n[00:04.00]第二句歌词\n[00:07.00]第三句歌词\n[00:10.00]第四句歌词\n[00:13.00]第五句歌词";
const hub = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const url = req.url || "";
  if (url.startsWith("/api/ping")) {
    res.end(JSON.stringify({ ok: true, name: "chushi-music-hub", version: "mock-v8716" }));
  } else if (url.startsWith("/api/state")) {
    const pos = (Date.now() - hubT0) / 1000 + 0.3;
    res.end(JSON.stringify({
      ne: { songId: 186016, title: "Mock Song", artist: "Tester", album: "VA",
        playing: true, position: pos, duration: 240, pic: "", ts: Date.now() },
    }));
  } else if (url.startsWith("/api/lyric")) {
    res.end(JSON.stringify({ ok: true, lyric: { songId: "186016", lrc: LRC, tlyric: "" } }));
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

/* DOMSnapshot 穿透 closed shadow——按宿主子树取证（浮层文本断言必须排除
   悬浮卡完全体 flyrIn 的全文歌词污染：页面级 strings 会命中卡的歌词行）。
   实测结构（diag-domsnap）：attributes[i] 是第 i 节点的 [nameIdx,valueIdx,…]
   索引对数组（每项是 string 表下标）；shadowRootType 含 closed = 穿透可用。 */
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
        /* 只在宿主节点上记 display（先记候选，命中宿主后生效） */
        if (i === hostIdx || hostIdx < 0) {
          const dm = /display:\s*(\w+)/.exec(vl);
          if (i === hostIdx && dm) display = dm[1];
        }
      }
    }
  }
  if (hostIdx < 0) return { present: false, display: "NONE", found: false };
  /* 宿主 display 复核（hostIdx 命中后重读其 style） */
  const ha = nodes.attributes[hostIdx] || [];
  for (let k = 0; k + 1 < ha.length; k += 2) {
    if (s[ha[k]] === "style") {
      const dm = /display:\s*(\w+)/.exec(s[ha[k + 1]] || "");
      if (dm) display = dm[1];
    }
  }
  /* 文本节点祖先链回溯：是否在宿主子树内 */
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

/* ================= L 组：全局歌词浮层端到端 ================= */
console.log("===== L1 开关链：面板镜像键 cardDlyric=true → 浮层挂载 =====");
/* 扩展页 MAIN world = 真 chrome.storage（面板 PresetWidgets mirrorExtCard
   同一写入面）；开启后内容脚本 onChanged 热跟随 */
await page.evaluate(() => chrome.storage.local.set({ cardDlyric: true }));
await sleep(400);

const page2 = await ctx.newPage({ viewport: { width: 1280, height: 800 } });
await fetch(`http://127.0.0.1:${HUB_PORT}/reset`); /* hub 墙钟对齐（node 侧直调） */
console.log("L-phase: page2 goto begin", Date.now());
await page2.goto(`http://127.0.0.1:${HUB_PORT}/`, { waitUntil: "load", timeout: 15000 });
/* 内容脚本注入（document_idle）→ Port 连接 → SW 首拍（≤1s）→ 歌词代理 → 浮层渲染 */
let l1 = null;
for (let i = 0; i < 30; i++) {
  l1 = await dlProbe(page2, "第一句歌词");
  if (l1.present && l1.display === "block" && l1.found) break;
  await sleep(300);
}
judge("L1 浮层挂载+首句渲染（开关链 + Port 数据面 + 真值到达 + closed shadow 子树取证）",
  !!l1 && l1.present === true && l1.display === "block" && l1.found, JSON.stringify(l1));
console.log("L-phase: L1 done", Date.now());

console.log("===== L2 歌词逐行跟随（墙钟推进 行1→行2，轮询取证） ===== */");
/* 管线实测远快于预估（state 0.4s 即达，首行预备律使 line1 在前奏期即上屏）
   → 固定 sleep 不可靠，改轮询推进证据：行2 激活的充分证据 = dl1 行2 +
   dl2 预览行3 同现（且行1 已退场）。截止 12s。 */
let l2a = null, l1gone = null, l2b = null;
for (let i = 0; i < 40; i++) {
  l2a = await dlProbe(page2, "第二句歌词");
  l2b = await dlProbe(page2, "第三句歌词");
  if (l2a.found && l2b.found) break;
  await sleep(300);
}
l1gone = await dlProbe(page2, "第一句歌词");
judge("L2a 行切换跟随（dl1=行2 + 行1 退场）",
  l2a.found && l2b.found && !l1gone.found && l2a.display === "block",
  `line2=${l2a.found} next=${l2b.found} line1Still=${l1gone.found} display=${l2a.display}`);
judge("L2b 下一句预览（dlNextText 跳行窗，.dl2=行3）", l2b.found, `next=第三句 ${l2b.found}`);
await page2.screenshot({ path: `${SHOTS}/L2-dlyric-line2.png` });

console.log("===== L3 关闭链：storage cardDlyric=false → 浮层隐没 =====");
await page.evaluate(() => chrome.storage.local.set({ cardDlyric: false }));
await sleep(600);
const l3 = await dlProbe(page2, "第二句歌词");
judge("L3 关闭回程（onChanged → dlHide）", l3.display === "none", `display=${l3.display}`);

console.log("===== L4 重新开启（× 钮反链同一开关位的正向复位） =====");
await page.evaluate(() => chrome.storage.local.set({ cardDlyric: true }));
/* 重开后轮询行跟随续走：隐藏窗内位置已推进 → 复位后应直接落到行4/行5 */
let l4 = null, l5 = null;
for (let i = 0; i < 40; i++) {
  l4 = await dlProbe(page2, "第四句歌词");
  if (l4.display === "block" && l4.found) break;
  l5 = await dlProbe(page2, "第五句歌词");
  if (l5.display === "block" && l5.found) break;
  await sleep(300);
}
judge("L4 重开复位（dlBoot 重臂 + 行跟随续走至行4/行5）",
  (l4.display === "block" && l4.found) || (l5.display === "block" && l5.found),
  `display=${l4.display} line4=${l4.found} line5=${l5 ? l5.found : false}`);
await page2.screenshot({ path: `${SHOTS}/L4-dlyric-reopen.png` });
await page2.close();

/* ================= D 组：抽屉打开提速（0.4s） ================= */
console.log("===== D 组：抽屉凝聚 0.4s + 壁纸同步 =====");
/* 掠影预置（photo-mode 才有壁纸放大锚） */
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
    animDur: cs.animationDuration,           /* dv-open-kf 时值（精确无噪） */
    animName: cs.animationName,
    tintDur: getComputedStyle(veil, "::before").animationDuration,
    wpTransDur: csWp.transitionDuration,     /* wallpaper-layer 过渡时值 */
    blurFull: /blur\((14|13\.\d+)px\)/.test(bf),
    satFree: !/saturate/.test(bf),           /* 掠影无 sat 零回归 */
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
console.log(`\n===== v8.7.16 visual: ${passCount} PASS / ${failCount} FAIL =====`);
console.log(`shots -> ${SHOTS}`);
await ctx.close();
try { hub.close(); } catch { }
process.exit(failCount ? 1 : 0);
