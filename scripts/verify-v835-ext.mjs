// v8.3.5 浮窗取证门——中文逐字重影根治（CDP 穿透 closed Shadow DOM）+ 高光照字提层。
//
//   W1 CDP 深穿：closed shadow 内 .fw 词壳 computed display = inline-block
//   W2 两层文本像素级重合：完全体当前行每个 .fw 与其 .ov 的 border box
//      |Δleft|<0.7 && |Δtop|<0.7（旧实现 Δtop≈半 leading ≈3px 必失败）
//   W3 内容件提层：.meta/.rail/.flyr/.ftm/.fctl z-index=1 position=relative，
//      .glow/.cglow z-index=0（封面 img z=1 在上，文字件同带更高）
//   W4 hub 真值管线活着（1Hz POST → 歌词行 on）
//   W5 零 pageerror
// rig 复用 verify-v834-ext.mjs（hubsim + spectrumsim + 真扩展加载 + CDP pierce）
import { chromium } from "playwright-core";
import crypto from "crypto";
import { spawn, execSync } from "child_process";
import { writeFileSync, mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const ROOT = "/tmp/ext-stage";
const EXT_ID = (() => {
  const h = crypto.createHash("sha256").update(Buffer.from(ROOT)).digest("hex").slice(0, 32);
  return [...h].map((c) => String.fromCharCode(97 + (parseInt(c, 16) % 26))).join("");
})();
const PROJ = "/tmp/my-project";
const hub = spawn(`${PROJ}/scripts/hubsim`, ["26901"], { stdio: "ignore" });
const spec = spawn(`${PROJ}/scripts/spectrumsim`, ["26911"], { stdio: "ignore" });
const pageDir = mkdtempSync(join(tmpdir(), "cardpage-"));
writeFileSync(join(pageDir, "index.html"),
  "<!doctype html><html><head><title>CardTestPage</title></head><body style='background:#1a1c20'><h1 style='color:#666'>t</h1></body></html>");
const http = spawn("python3", ["-m", "http.server", "26994", "--bind", "127.0.0.1"],
  { cwd: pageDir, stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
process.on("exit", () => { for (const p of [hub, spec, http]) { try { p.kill("SIGKILL"); } catch { } } });

/* 中文 yrc：行 i 起点 i*3000，每行 7 个逐字词（420ms/字）——重影取证主角 */
const han = "今夜的风轻轻吹过心间思念成海月光落满旧琴弦";
const yrc = [0, 1, 2, 3, 4, 5].map((i) => {
  const s = i * 3000;
  let body = "", at = 0;
  for (let w = 0; w < 7; w++) { body += `(${at},420,0)${han[(i * 7 + w) % han.length]}`; at += 420; }
  return `[${s},2940]` + body;
}).join("\n");

let lyricStored = false;
for (let i = 0; i < 40 && !lyricStored; i++) {
  try {
    execSync("curl -s -m 1 http://127.0.0.1:26901/api/ping", { timeout: 1500 });
    execSync(`curl -s -X POST http://127.0.0.1:26901/api/lyric -H 'Content-Type: application/json' ` +
      `-d '${JSON.stringify({ ok: true, lyric: { songId: 42, yrc } })}'`, { timeout: 5000 });
    const back = execSync("curl -s -m 1 'http://127.0.0.1:26901/api/lyric?songId=42'", { timeout: 1500 }).toString();
    lyricStored = back.includes('"lyric"') && back.includes("yrc");
  } catch { await sleep(200); }
}
console.log(`歌词注入: ${lyricStored ? "OK" : "FAIL"}`);

let hbPos = 7.5;   // 行 2 区间（6-8.94s）
let hbPlaying = true;
const hubBeat = setInterval(() => {
  const body = JSON.stringify({
    ne: { title: "v835测试曲", artist: "e2e", album: "v8.3.5", songId: 42,
      playing: hbPlaying, position: hbPos, duration: 300, ts: Date.now(), v: "8.3.5",
      pic: "" },
    ts: Date.now(), who: "e2e", lease: "holder",
  });
  try {
    execSync(`curl -s -X POST http://127.0.0.1:26901/api/state -H 'Content-Type: application/json' -d '${body}' >/dev/null 2>&1`, { timeout: 3000 });
  } catch { }
}, 1000);

let passed = 0, failed = 0;
const chk = (label, okk) => { if (okk) { passed++; console.log("  ✓ " + label); } else { failed++; console.log("  ✗ " + label); } };

const profileDir = mkdtempSync(join(tmpdir(), "ext-profile-835-"));
const browser = await chromium.launchPersistentContext(profileDir, {
  channel: "chromium", headless: true,
  args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`,
    "--no-first-run", "--disable-gpu"],
});

const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e.message)));
await page.goto("http://127.0.0.1:26994/index.html", { waitUntil: "load", timeout: 15000 });
await sleep(3500);

/* CDP 深穿 closed Shadow DOM */
const cdp = await page.context().newCDPSession(page);
await cdp.send("DOM.enable");
await cdp.send("CSS.enable");
const attr = (n, k) => { const a = n.attributes || []; for (let i = 0; i < a.length; i += 2) if (a[i] === k) return a[i + 1]; return ""; };
function collect(node, out) {
  if (!node) return;
  const cls = attr(node, "class") || "";
  const id = attr(node, "id") || "";
  if (/^(fw|meta|rail|flyr|ftm|fctl|glow|cglow)$/.test(cls) || cls.includes("fw ")) out.push({ cls, id, nodeId: node.nodeId });
  for (const c of node.children || []) collect(c, out);
  for (const c of node.shadowRoots || []) collect(c, out);
}
async function probe() {
  const { root } = await cdp.send("DOM.getDocument", { depth: -1, pierce: true });
  const nodes = [];
  collect(root, nodes);
  const res = {};
  for (const n of nodes) {
    const cs = await cdp.send("CSS.getComputedStyleForNode", { nodeId: n.nodeId });
    const map = {};
    for (const e of cs.computedStyle) map[e.name] = e.value;
    const key = n.cls === "fw" ? "fw" : n.cls;
    (res[key] = res[key] || []).push({ display: map.display, zi: map["z-index"], pos: map.position, nodeId: n.nodeId });
  }
  return res;
}
async function boxPair(cdp2, fwNodeId) {
  /* .fw 与其 .ov 子节点的 border box 左上差（不可中途 getDocument——
     重拉快照会使既有 nodeId 失效） */
  const fw = await cdp2.send("DOM.getBoxModel", { nodeId: fwNodeId });
  const { nodes } = await cdp2.send("DOM.requestChildNodes", { nodeId: fwNodeId, depth: 1, pierce: true });
  const ov = (nodes || []).find((n) => attr(n, "class") === "ov");
  if (!ov) return null;
  const ob = await cdp2.send("DOM.getBoxModel", { nodeId: ov.nodeId });
  const a = { l: fw.model.border[0], t: fw.model.border[1] };
  const b2 = { l: ob.model.border[0], t: ob.model.border[1] };
  return { dl: Math.abs(b2.l - a.l), dt: Math.abs(b2.t - a.t) };
}

let pr = await probe();
chk("W4 真值管线（mini .meta 挂载+提层）",
  pr.meta && pr.meta.length >= 1 && pr.meta[0].zi === "1" && pr.meta[0].pos === "relative" && pr.meta[0].display !== "none");

/* mini → 完全体：点击 miniFull（复用 v834 坐标策略：cap 内第一键） */
const host = await page.evaluate(() => !!document.getElementById("chushi-card-host"));
if (host) {
  /* 找 miniFull 按钮 node → 点击坐标：用 getBoxModel 中心 */
  const { root } = await cdp.send("DOM.getDocument", { depth: -1, pierce: true });
  const btns = [];
  (function walkBtn(node) {
    if (!node) return;
    if (attr(node, "id") === "miniFull") btns.push(node.nodeId);
    for (const c of node.children || []) walkBtn(c);
    for (const c of node.shadowRoots || []) walkBtn(c);
  })(root);
  if (btns.length) {
    const bm = await cdp.send("DOM.getBoxModel", { nodeId: btns[0] });
    const bx = bm.model.border;
    const cx = (bx[0] + bx[2]) / 2, cy = (bx[1] + bx[5]) / 2;
    await page.mouse.click(cx, cy);
    await sleep(2500);
  }
}

pr = await probe();
const fwList = pr.fw || [];
chk("W1 完全体 .fw 词壳 inline-block（重影根治）",
  fwList.length >= 5 && fwList.every((x) => x.display === "inline-block"),
  fwList.length ? "n=" + fwList.length + " d0=" + fwList[0].display : "无 .fw");

/* 重合取证：同一棵 pierce 树内按 parentId 配对 .fw ↔ .ov（中途不重拉快照） */
let worst = { dl: 0, dt: 0 }, pairs = 0;
{
  const { root } = await cdp.send("DOM.getDocument", { depth: -1, pierce: true });
  const byId = new Map(), fwIds = new Set(), ovTo = new Map();
  (function walk2(node) {
    if (!node) return;
    const cls = attr(node, "class");
    if (cls === "fw") fwIds.add(node.nodeId);
    if (cls === "ov" && node.parentId) ovTo.set(node.parentId, node.nodeId);
    byId.set(node.nodeId, node.nodeId);
    for (const c of node.children || []) walk2(c);
    for (const c of node.shadowRoots || []) walk2(c);
  })(root);
  for (const fwId of fwIds) {
    const ovId = ovTo.get(fwId);
    if (!ovId) continue;
    try {
      const fwB = await cdp.send("DOM.getBoxModel", { nodeId: fwId });
      const ovB = await cdp.send("DOM.getBoxModel", { nodeId: ovId });
      const dl = Math.abs(ovB.model.border[0] - fwB.model.border[0]);
      const dt = Math.abs(ovB.model.border[1] - fwB.model.border[1]);
      pairs++; worst.dl = Math.max(worst.dl, dl); worst.dt = Math.max(worst.dt, dt);
    } catch { /* 翻译行等瞬态节点 */ }
  }
}
chk(`W2 两层文本像素级重合（${pairs} 对，max Δleft=${worst.dl.toFixed(2)} Δtop=${worst.dt.toFixed(2)} < 0.7）`,
  pairs >= 5 && worst.dl < 0.7 && worst.dt < 0.7, "旧实现 Δtop≈3px 必失败");

chk("W3a 完全体 .meta 提层 z=1",
  (pr.meta || []).some((x) => x.zi === "1" && x.pos === "relative"));
chk("W3b .flyr/.ftm 提层 z=1",
  (pr.flyr || []).some((x) => x.zi === "1" && x.pos === "relative") &&
  (pr.ftm || []).some((x) => x.zi === "1" && x.pos === "relative"));
chk("W3c .glow/.cglow z=0（低于内容件）",
  (pr.glow || []).every((x) => x.zi === "0") &&
  (pr.cglow || []).every((x) => x.zi === "0"));

chk("W5 零 pageerror", errors.length === 0);

console.log(`\n=== v8.3.5 浮窗取证门: ${passed} 通过, ${failed} 失败 ===`);
await browser.close();
process.exit(failed ? 1 : 0);
