#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""visual-v8721 增门手术②：G 组（dl 玻璃拉伸四连）——GA 无歌词真居中+显式宽度
+GB 双过渡计算值 +GC 长词拉伸飞行采样+dlswap/lin 在体+落点仍居中"""
import io

P = "/tmp/beta-wt/scripts/visual-v8721.mjs"
src = io.open(P, encoding="utf-8").read()

OLD = """console.log(`\\n===== visual-v8721: ${passCount} PASS / ${failCount} FAIL =====`);"""
NEW = """/* ---------- G 组：dl 玻璃拉伸/药丸居中/切行模糊（v8.7.21 四连） ---------- */
console.log("===== G 组：dl 玻璃拉伸四连（SW 直注换歌） =====");
/* dlNodesX：pill/dl1/dl2 全捕获（nodeId 竞态律：每次现取现用） */
const YRC2 = [
  "[1000,3500](1000,900,0)短句(2000,1200,0)开场",
  "[5000,4000](5000,1200,0)这第二句故意写得很长很长用来见证玻璃药丸拉伸动画的宽度变化全过程",
  "[11000,3000](11000,1500,0)收尾句",
].join("\\n");
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
        if (attrs[k + 1] === "dl") out.pill.push(n);
        else if (attrs[k + 1] === "dl1") out.l1.push(n);
        else if (attrs[k + 1] === "dl2") out.l2.push(n);
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
  const cs = await gCS(gaPill.pill[0].nodeId).catch(() => null);
  const styleAttr = await attrOf(gaPill.pill[0], "style");
  const cx = box ? (box.l + box.r) / 2 : -1;
  const wPx = box ? box.r - box.l : 0;
  judge("GA1 首用真居中（|cx-450|≤3，旧 460 假设位退役）", !!box && Math.abs(cx - 450) <= 3, `cx=${cx.toFixed(1)} w=${wPx.toFixed(0)} vp=900`);
  judge("GA2 显式 width 驱动（style 属性 px 在位=布局动画源）", /width:\\s*\\d+(\\.\\d+)?px/.test(styleAttr), `style="${styleAttr.slice(0, 70)}"`);
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
judge("GC3 拉伸落点仍居中（左/宽同拍=中心逐帧恒定的终态见证）", !!box2 && Math.abs(cx2 - 450) <= 4, `cx=${cx2.toFixed(1)} w=${(box2.r - box2.l).toFixed(0)}`);
await page2.screenshot({ path: `${SHOTS}/GC-dl-stretched-line2.png` });

console.log(`\\n===== visual-v8721: ${passCount} PASS / ${failCount} FAIL =====`);"""

assert src.count(OLD) == 1
src = src.replace(OLD, NEW)
io.open(P, "w", encoding="utf-8").write(src)
print("visual-v8721 G group inserted")
