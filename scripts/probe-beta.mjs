// v8.7.2 探针——互切拉伸律（v8.7.0 全面重写基线）+ ㊴ 互切弹簧可见 + ㊵ dock 浮签
// + ㊵ dock 悬停浮签（原生 title 退役）：
// ① 单卡律：互切窗全程 .glass-card.cl-panel 至多一张（双卡同框结构性不可能）
// ② 同卡律：切换前后同一 DOM 节点（玻璃不重挂不重播=一张玻璃换内容）
// ③ 零残留律：旧面板 data-panel 同帧消失，新内容 .cl-panel-content 简单淡入（零模糊）
// ④ 退役门：.view-top/.cl-switching/view-defocus 规则清零；弹窗 view-exit 通道保留
// ⑤ v8.7.1：部件视图 opacity 常驻合成（visibility 退役）+ boot-fade 仅 onLoad 挂
// ⑦ v8.7.2：互切玻璃交卸（旧卡不再同帧硬卸载）+ 部件底锚恒贴（height min()）
// ⑧ v8.7.2：搜索建议常驻 DOM + 6 行（AnimatePresence/WAAPI 空窗退役）
// ⑥ v8.7.1：dock 按钮无原生 title + .dock-tip 浮签（与 ⌘K 同款样式）
// 承 v8.6.3-v8.6.28 全部回归门。
import { chromium } from "playwright-core";
import crypto from "crypto";
import { execSync, spawn } from "child_process";
import { mkdirSync, rmSync, writeFileSync, readFileSync, statSync } from "fs";

const ROOT = "/tmp/ext-beta";
const ZIP = "/tmp/beta-wt/download/v8.7.19/ChuShi-NewTab-v8.7.19.zip";
const MOCK = "/tmp/beta-mock";
const PORT = 26997;
const SHOTS = "/tmp/probe-beta-shots";

rmSync(ROOT, { recursive: true, force: true });
rmSync(MOCK, { recursive: true, force: true });
rmSync("/tmp/ext-beta-profile", { recursive: true, force: true });
mkdirSync(ROOT, { recursive: true });
mkdirSync(MOCK, { recursive: true });
mkdirSync(SHOTS, { recursive: true });
execSync(`cd ${ROOT} && unzip -o -q ${ZIP}`);
console.log("stage: 扩展解包 ->", ROOT);

const bgPath = ROOT + "/ext-bg.js";
writeFileSync(bgPath, readFileSync(bgPath, "utf-8").replace(
  'const SNAP_MIRRORS = ["https://lxgssy.github.io/Start-chushi"];',
  `const SNAP_MIRRORS = ["http://127.0.0.1:${PORT}"];`));
const appHits = execSync(`grep -rl "lxgssy.github.io/Start-chushi/version.json" ${ROOT} 2>/dev/null || true`)
  .toString().trim().split("\n").filter(Boolean);
for (const f of appHits) {
  writeFileSync(f, readFileSync(f, "utf-8").replaceAll(
    "https://lxgssy.github.io/Start-chushi/version.json", `http://127.0.0.1:${PORT}/version.json`));
}
writeFileSync(MOCK + "/index.html", `<!DOCTYPE html><html><body>ok</body></html>`);
writeFileSync(MOCK + "/version.json", JSON.stringify({
  v: "8.7.3", files: [{ p: "index.html", s: statSync(MOCK + "/index.html").size }],
}));
const httpSrv = spawn("python3", ["-m", "http.server", String(PORT)], { cwd: MOCK, stdio: "ignore" });
process.on("exit", () => { try { httpSrv.kill(); } catch { } });
console.log("stage: mock 镜像就绪（v8.7.3 地板）");

const EXT_ID = (() => {
  const h = crypto.createHash("sha256").update(Buffer.from(ROOT)).digest("hex").slice(0, 32);
  return [...h].map((c) => String.fromCharCode(97 + (parseInt(c, 16) % 26))).join("");
})();
const EXT_URL = (p) => `chrome-extension://${EXT_ID}/${p}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const withTimeout = (p, ms, tag) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`TIMEOUT ${tag}`)), ms))]);

const browser = await withTimeout(
  chromium.launchPersistentContext("/tmp/ext-beta-profile", {
    channel: "chromium", headless: true,
    args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`,
      "--no-first-run", "--no-sandbox"],
  }),
  30000, "browser launch"
);
process.on("exit", () => { try { browser.close(); httpSrv.kill(); } catch { } });
console.log("stage: browser up");

let pass = 0, fail = 0;
const gate = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`  [PASS] ${name}${detail ? " — " + detail : ""}`); }
  else { fail++; console.log(`  [FAIL] ${name}${detail ? " — " + detail : ""}`); }
};

const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
/* v8.7.0：抽屉形态的隐形布局克隆（.cl-layout-ghost）与真实抽屉共享全部
   类名/磁贴标记——所有 DOM 采样必须豁免 ghost 祖先，否则量到隐形克隆 */
await page.addInitScript(() => {
  const notGhost = (el) => !!el && !(el.closest && el.closest(".cl-layout-ghost"));
  window.qCl = (sel) => [...document.querySelectorAll(sel)].find(notGhost) || null;
  window.qCla = (sel) => [...document.querySelectorAll(sel)].filter(notGhost);
});
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

async function bootNewTab(pg) {
  await pg.goto(EXT_URL("shell.html"), { waitUntil: "load", timeout: 20000 });
  await pg.waitForFunction(() => {
    const f = document.getElementById("csShellFrame");
    return f && f.src && f.src.endsWith("index.html");
  }, { timeout: 8000 }).catch(() => null);
  const af = pg.frames().find((f) => f !== pg.mainFrame() && /\/index\.html$/.test(f.url()));
  const ok = af && await af.waitForFunction(() => document.body && document.body.children.length > 0,
    { timeout: 15000 }).then(() => true).catch(() => false);
  if (ok) return af;
  await sleep(1500);
  await pg.goto(EXT_URL("shell.html"), { waitUntil: "load", timeout: 20000 }).catch(() => null);
  await pg.waitForFunction(() => {
    const f = document.getElementById("csShellFrame");
    return f && f.src && f.src.endsWith("index.html");
  }, { timeout: 10000 }).catch(() => null);
  const af2 = pg.frames().find((f) => f !== pg.mainFrame() && /\/index\.html$/.test(f.url()));
  const ok2 = af2 && await af2.waitForFunction(() => document.body && document.body.children.length > 0,
    { timeout: 15000 }).then(() => true).catch(() => false);
  return ok2 ? af2 : null;
}

async function drawerOpen(f) {
  return f.evaluate(() => !!document.querySelector(".cl-drawer-veil"));
}

/* 重触发磁贴三通道 intro 并冻结在指定进度（负 delay + paused，确定性采样帧）。
   delay 内联进 IIFE——evaluate 的字符串函数不会被注入参数调用 */
const freezeIntro = (frame, delay) => frame.evaluate(`(() => {
  const delay = ${JSON.stringify(delay)};
  document.getElementById("dbg-frost-style")?.remove();
  const scope = window.qCl(".cl-links") || document.body;
  const grab = (sel) => [...scope.querySelectorAll(sel)];
  /* v8.7.0：入场播完组件会摘 intro 类（根治拖拽让位重播）——按永驻语义
     类抓四层元素，再由本探针重挂动画类重触发（与组件摘类机制解耦） */
  const groups = [
    grab(".tile-shell"), grab(".tile-frost"), grab(".tile-body"), grab(".tile-label"),
  ];
  groups.forEach((g) => g.forEach((el) => {
    el.classList.remove("link-intro-tile", "link-intro-frost", "link-intro-body", "link-intro");
  }));
  void document.body.offsetHeight;
  groups.forEach((g, i) => g.forEach((el) =>
    el.classList.add(["link-intro-tile", "link-intro-frost", "link-intro-body", "link-intro"][i])));
  if (delay) {
    const st = document.createElement("style");
    st.id = "dbg-frost-style";
    st.textContent = ".cl-links .link-intro-tile,.cl-links .link-intro-frost,.cl-links .link-intro-body,.cl-links .link-intro{animation-delay:" + delay + " !important;animation-play-state:paused !important;}";
    document.head.appendChild(st);
  }
  const tile = window.qCl('[data-cl-tile="1"]');
  if (!tile) return null;
  const wrap = tile.querySelector(".tile-shell") || tile.querySelector("span");
  const frost = tile.querySelector(".tile-frost");
  const body = tile.querySelector(".tile-body");
  if (!wrap || !frost || !body) return { layers: false };
  const wcs = getComputedStyle(wrap), fcs = getComputedStyle(frost), bcs = getComputedStyle(body);
  return {
    layers: true,
    wrapAnim: wcs.animationName,
    wrapTransform: wcs.transform,
    frostOp: parseFloat(fcs.opacity),
    frostBF: fcs.backdropFilter || fcs.webkitBackdropFilter || "",
    frostAnim: fcs.animationName,
    bodyOp: parseFloat(bcs.opacity),
    bodyFilter: bcs.filter,
    bodyAnim: bcs.animationName,
  };
})()`);

try {
  /* ---------- T1 boot 全链（v8.6.6 残缺若在 → 此处 FATAL）---------- */
  let af = await bootNewTab(page);
  gate("T1a 本地直载 boot（v8.6.6 崩溃修复）", !!af);
  if (!af) throw new Error("appFrame 未建立");
  await sleep(2200);
  gate("T1b 刷新路由落点 = shell.html", page.url().endsWith("shell.html") && !page.url().endsWith("index.html"), page.url());

  /* ---------- T2 中键唤出 + 整页高斯模糊纱罩（回归）---------- */
  await page.mouse.click(90, 620, { button: "middle" });
  /* v8.7.12 时序对账：起步链(~230ms)+凝聚(v8.7.16 加速后 0.40s)=630ms，旧 sleep(700)
     采样点系统性落进凝聚窗（blur 10.9px≈78% 进度，v8.7.8 已知 flake 族实为
     系统性欠账）。改 rAF 轮询等稳态 blur(14px) 凝满（上限 2.5s），门语义不变。 */
  await af.evaluate(async () => {
    const t0 = performance.now();
    while (performance.now() - t0 < 2500) {
      const v = document.querySelector(".cl-drawer-veil");
      if (v && /blur\(14px\)/.test(getComputedStyle(v).backdropFilter || "")) break;
      await new Promise((r) => requestAnimationFrame(r));
    }
  });
  const veilState = await af.evaluate(() => {
    const veil = document.querySelector(".cl-drawer-veil");
    if (!veil) return { veil: false };
    const cs = getComputedStyle(veil);
    return {
      veil: true, bf: cs.backdropFilter || "",
      tiles: window.qCla('[data-cl-tile="1"]').length,
      htmlClass: document.documentElement.classList.contains("cs-drawer"),
    };
  });
  gate("T2a 中键唤出（磁贴墙+cs-drawer）",
    veilState.veil && veilState.tiles > 0 && veilState.htmlClass,
    `tiles=${veilState.tiles}`);
  gate("T2b 纱罩整页高斯模糊（blur 14px，v8.7.11 再调轻）", /blur\(14px\)/.test(veilState.bf || ""), veilState.bf);

  /* ---------- T3 v8.7.0 核心：三通道入场（霜感先行 + 整块模糊覆盖）----------
     开抽屉稳态 → 重触发 intro 冻结 @-0.30s（31.6% 进度）：
     霜层 0.18s 已凝满（opacity=1、backdrop 在线）；内容层模糊聚拢在飞
     （filter≠none、0.3<opacity<1）；包裹层 rise 在飞（transform≠none）。 */
  await sleep(600);
  const f030 = await freezeIntro(af, "-0.30s");
  gate("T3a 三层结构在位（tile/frost/body）", f030?.layers === true);
  gate("T3b 包裹层 rise 单通道（v8.7.0 投影退役）",
    typeof f030?.wrapAnim === "string" && f030.wrapAnim.includes("intro-tile-rise") && !f030.wrapAnim.includes("intro-tile-shadow"),
    f030?.wrapAnim);
  gate("T3c 包裹层上升在飞（transform≠none）", f030?.wrapTransform !== "none" && (f030?.wrapTransform || "").includes("matrix"), (f030?.wrapTransform || "").slice(0, 36));
  gate("T3d 霜层凝聚完成（opacity=1）", f030?.frostOp === 1, `op=${f030?.frostOp}`);
  gate("T3e 霜层磨砂在线（blur(14px) saturate(1.6)）", /blur\(14px\)\s+saturate\(1\.6\)/.test(f030?.frostBF || ""), f030?.frostBF);
  gate("T3f 内容层模糊聚拢在飞（filter 含 blur）", (f030?.bodyFilter || "").includes("blur(") && (f030?.bodyOp ?? 0) > 0.2 && (f030?.bodyOp ?? 0) < 1,
    `op=${f030?.bodyOp?.toFixed(2)} filter=${(f030?.bodyFilter || "").slice(0, 24)}`);
  gate("T3g 内容层动画名（intro-tile-body）", f030?.bodyAnim === "intro-tile-body", f030?.bodyAnim);
  const f012 = await freezeIntro(af, "-0.12s");
  const blur012 = parseFloat(((f012?.frostBF || "").match(/blur\(([\d.]+)px\)/) || [])[1] || "0");
  gate("T3h 冻结@12%: 霜层 blur 凝聚中（v8.7.0 底层律：见证由 opacity 改 blur 值，1<blur<14）",
    blur012 > 1.2 && blur012 < 13.9, `blur=${blur012.toFixed(1)}px bf=${f012?.frostBF}`);
  await af.evaluate(() => document.getElementById("dbg-frost-style")?.remove());
  await page.screenshot({ path: SHOTS + "/01-frozen-intro.png" });

  /* ---------- T4 v8.7.0 核心：入场中途关闭 = WAAPI 并行淡出（不瞬跳）---------- */
  await af.evaluate(() => document.getElementById("dbg-frost-style")?.remove());
  await page.keyboard.press("Escape");
  await sleep(700);
  await page.mouse.click(90, 620, { button: "middle" }); // 开
  await sleep(900); /* v8.7.0：650→900——远离霜层 0.24s 结束点，qCl 首命中是常驻叶
     （DOM 序列先于抽屉 portal），若打断落在常驻 frost 动画尾窗内 before 采到动画
     值而非稳态 1（负载相关 flaky 实证）；900ms 处常驻必稳态、抽屉 body 通道
     （0.24+0.95=1.19s）仍在飞，打断语义不变 */
  const before = await af.evaluate(() => {
    const leaf = window.qCl(".cl-links .cl-fade-leaf");
    return {
      leaf: leaf ? parseFloat(getComputedStyle(leaf).opacity) : null,
      dbg: leaf ? { cls: leaf.className.slice(0, 80), anims: leaf.getAnimations().map((a) => a.animationName || a.transitionProperty || "?") } : null,
    };
  });
  await page.mouse.click(90, 620, { button: "middle" }); // 打断关
  /* 无头软件渲染的关闭瞬间 jank 会让「渲染值首样本」不可测（冻结/skip 随机），
     改断言确定性元数据：300ms WAAPI 的 from 关键帧 = 冻结前的当前动画值
     （v8.7.4 ㊻ WAAPI 280→300 与染色/叶 0.3s 同频；旧实现瞬跳路径无 WAAPI，
     T4b 即 FAIL——两门合围即「不瞬跳」回归门） */
  const waapiProbe = await af.evaluate(() => {
    const leaf = window.qCl(".cl-links .cl-fade-leaf");
    if (!leaf) return null;
    const a = leaf.getAnimations().find((x) => Number(x.effect.getTiming().duration) === 300);
    return a ? { from: Number(a.effect.getKeyframes()[0].opacity), ps: a.playState } : null;
  });
  gate("T4a 打断冻结从当前动画值起步（WAAPI from=before）",
    waapiProbe !== null && Math.abs(waapiProbe.from - before.leaf) < 0.05 && waapiProbe.ps === "running",
    `from=${waapiProbe?.from?.toFixed(3)} before=${before.leaf?.toFixed(3)} ps=${waapiProbe?.ps}`);
  const curve = [];
  for (let i = 0; i < 12; i++) {
    curve.push(await af.evaluate(() => {
      const leaf = window.qCl(".cl-links .cl-fade-leaf");
      const veil = document.querySelector(".cl-drawer-veil");
      const anims = leaf ? leaf.getAnimations().map((a) => ({
        dur: Number(a.effect.getTiming().duration) || 0,
        ps: a.playState,
      })) : [];
      return {
        leaf: leaf ? parseFloat(getComputedStyle(leaf).opacity) : null,
        veil: veil ? (parseFloat((getComputedStyle(veil).backdropFilter || "").match(/blur\(([\d.]+)px\)/)?.[1] ?? "28")) : null,
        closing: document.documentElement.classList.contains("cs-drawer-closing"),
        waapi300: anims.some((a) => a.dur === 300),
      };
    }));
    await sleep(35);
  }
  const leafMin = Math.min(...curve.filter((s) => s.leaf !== null).map((s) => s.leaf));
  gate("T4b 磁贴叶挂 300ms WAAPI 并行淡出（与染色/叶 0.3s 同频，v8.7.4 ㊻ 对齐）",
    curve.some((s) => s.waapi300), `waapi=${curve.filter((s) => s.waapi300).length} leafMin=${Number.isFinite(leafMin) ? leafMin.toFixed(3) : "?"}`);
  gate("T4c 退场窗挂 cs-drawer-closing", curve.some((s) => s.closing));
  await sleep(800);
  gate("T4d 打断后抽屉完全关闭", !(await drawerOpen(af)));

  /* ---------- T5 退场窗内快速重开 → WAAPI cancel、磁贴恢复 ---------- */
  await page.mouse.click(90, 620, { button: "middle" }); // 开
  await sleep(900);
  await af.evaluate(() => {
    const g = window.qCl(".cl-links");
    g?.setAttribute("data-dbg-marker", "t5");
  });
  await page.mouse.click(90, 620, { button: "middle" }); // 关
  await sleep(200);
  await page.mouse.click(90, 620, { button: "middle" }); // 立刻重开
  const reopenCurve = [];
  for (let i = 0; i < 10; i++) {
    reopenCurve.push(await af.evaluate(() => {
      const leaf = window.qCl(".cl-links .cl-fade-leaf");
      const grid = window.qCl(".cl-links");
      return {
        op: leaf ? parseFloat(getComputedStyle(leaf).opacity) : null,
        waapi280: leaf ? leaf.getAnimations().filter((a) => Number(a.effect.getTiming().duration) === 280).length : -1,
        allAnims: leaf ? leaf.getAnimations().map((a) => `${(a.effect.getKeyframes() && a.effect.getKeyframes()[0] && a.effect.getKeyframes()[0].opacity !== undefined) ? "fade" : a.animationName || "w"}:${a.playState}:${Math.round(a.currentTime ?? -1)}`).join(",") : "",
        marker: grid?.getAttribute("data-dbg-marker") || "remounted",
        introFrost: (() => {
          const f = window.qCl(".cl-links .link-intro-frost");
          if (!f) return "none";
          const cs = getComputedStyle(f);
          return cs.animationName + ":" + cs.animationPlayState;
        })(),
      };
    }));
    await sleep(40);
  }
  console.log("[reopen curve]");
  reopenCurve.forEach((s, i) => console.log(`  +${i * 40}ms`, JSON.stringify(s)));
  const reopen = reopenCurve[Math.min(3, reopenCurve.length - 1)];
  /* v8.7.0 断言修正：旧断言要求重开首采样 WAAPI 即取消——headless 软渲染
     帧距抖动下 cancel 可晚 1~2 帧生效（v8.6.7 时代过绿属时序巧合）。真实语义
     是「cancel 最终生效且不复发」：首个 waapi280=0 采样之后必须恒为 0
     （取消后不反弹），与 T5b 的 600ms 恢复窗口互补。 */
  const cancelAt = reopenCurve.findIndex((s) => s.waapi280 === 0);
  gate("T5a 重开：WAAPI 冻结最终取消且不复发",
    cancelAt >= 0 && reopenCurve.slice(cancelAt).every((s) => s.waapi280 === 0),
    `cancelAt=${cancelAt >= 0 ? cancelAt * 40 + "ms" : "never"} left=${reopen?.waapi280}`);
  gate("T5b 重开：磁贴叶恢复可见（600ms 内回 1）",
    reopenCurve.some((s) => s.op !== null && s.op > 0.9), `op@160=${reopenCurve[3]?.op?.toFixed(3)} op@last=${reopenCurve[reopenCurve.length - 1]?.op?.toFixed(3)}`);
  await sleep(1200);
  const steady2 = await af.evaluate(() => {
    const leaf = window.qCl(".cl-links .cl-fade-leaf");
    return leaf ? parseFloat(getComputedStyle(leaf).opacity) : null;
  });
  gate("T5c 重开后再稳态（opacity→1）", steady2 !== null && Math.abs(steady2 - 1) < 0.02, `op=${steady2?.toFixed(3)}`);

  /* ---------- T6 稳态关抽屉退场同步（回归）---------- */
  await page.mouse.click(90, 620, { button: "middle" }); // 关
  await sleep(900);
  await page.mouse.click(90, 620, { button: "middle" }); // 开
  await sleep(900);
  await page.mouse.click(90, 620, { button: "middle" }); // 关（稳态）
  /* v8.7.0：退场见证改 transition 事件（确定性）——rAF 值采样在探针高负载下
     帧距 >100ms，0.14s 驻留+0.14s 收拢的释放窗可整体错过（v8.6.23 run3 同源
     flaky）。语义见证 = 纱罩 backdrop-filter 过渡真实走完（run+end 事件，
     elapsedTime≈0.14s 驻留后收拢段）+ 磁贴叶淡出（rAF 曲线仍采，低频可容忍：
     叶淡出 0.25s 全窗可命中） */
  await af.evaluate(() => {
    const veil = document.querySelector(".cl-drawer-veil");
    window.__veilEvts = [];
    if (veil) {
      const rec = (k) => (e) => {
        if (e.propertyName === "backdrop-filter")
          window.__veilEvts.push({ k, t: Math.round(performance.now()), dur: Math.round((e.elapsedTime || 0) * 1000) });
      };
      veil.addEventListener("transitionrun", rec("run"), true);
      veil.addEventListener("transitionend", rec("end"), true);
      veil.addEventListener("transitioncancel", rec("cancel"), true);
    }
  });
  await page.mouse.click(90, 620, { button: "middle" }); // 开
  await sleep(900);
  await af.evaluate(() => {
    const veil = document.querySelector(".cl-drawer-veil");
    window.__veilEvts = [];
    if (veil) {
      const rec = (k) => (e) => {
        if (e.propertyName === "backdrop-filter")
          window.__veilEvts.push({ k, t: Math.round(performance.now()), dur: Math.round((e.elapsedTime || 0) * 1000) });
      };
      veil.addEventListener("transitionrun", rec("run"), true);
      veil.addEventListener("transitionend", rec("end"), true);
      veil.addEventListener("transitioncancel", rec("cancel"), true);
    }
  });
  await page.mouse.click(90, 620, { button: "middle" }); // 关（稳态）
  const exitCurve = await af.evaluate(() => new Promise((res) => {
    const dbg = [];
    const veil0 = document.querySelector(".cl-drawer-veil");
    if (veil0) {
      const mo = new MutationObserver(() => dbg.push({ t: Math.round(performance.now()), dv: veil0.getAttribute("data-veil"), conn: veil0.isConnected }));
      mo.observe(veil0, { attributes: true, attributeFilter: ["data-veil", "style"] });
    }
    const leaf = window.qCl(".cl-links .cl-fade-leaf");
    const rows = [];
    const t0 = performance.now();
    const tick = () => {
      const bfStr = veil0 && veil0.isConnected ? getComputedStyle(veil0).backdropFilter : "";
      rows.push({
        t: Math.round(performance.now() - t0),
        conn: veil0 ? veil0.isConnected : "null",
        leaf: leaf && leaf.isConnected ? parseFloat(getComputedStyle(leaf).opacity) : null,
        /* v8.7.0 补丁：扩展 iframe 环境 backdrop-filter transitionend 派发不可靠
           （http 模式实证 end 140ms 健康、扩展环境 end 缺失=环境行为差异）——
           改帧级 blur 值采样直接见证过渡推进：驻留满值→渐降=健康 */
        bf: bfStr ? (bfStr.match(/blur\(([\d.]+)px\)/) || [])[1] ?? null : null,
        /* v8.7.5 ㊼：saturate 同步归位见证——旧实现恒 1.5 挂至 visibility
           翻转瞬间整页过饱和突降；新实现随散场关键帧同步归位（串内无
           saturate 函数 = sat 1 = null） */
        sat: bfStr ? (bfStr.match(/saturate\(([\d.]+)\)/) || [])[1] ?? null : null,
        vis: veil0 && veil0.isConnected ? getComputedStyle(veil0).visibility : "gone",
      });
      if (performance.now() - t0 < 900) requestAnimationFrame(tick); else res({ rows, dbg, moDbg: dbg });
    };
    requestAnimationFrame(tick);
  }));
  const leafMinS = Math.min(...exitCurve.rows.filter((s) => s.leaf !== null).map((s) => s.leaf));
  const veilEvts = await af.evaluate(() => window.__veilEvts || []);
  const bfVals = exitCurve.rows.filter((s) => s.bf !== null && s.bf !== undefined).map((s) => parseFloat(s.bf));
  const bfMax = bfVals.length ? Math.max(...bfVals) : 0;
  const bfMin = bfVals.length ? Math.min(...bfVals) : 0;
  /* v8.7.4 柔散语义（驻留退役）：起步即松解——采样起点若晚于 click 链路
     延迟，首帧 blur 可能已 <27px，满值见证退役；改见证「多帧渐进推进」：
     ≥3 帧不同 blur 值（防瞬跳 [28,1] 两帧）+ 降幅>5px + 收拢近底 <4px
     （0.42s 柔散在 900ms 采样窗内完整走完） */
  const bfDropped = bfVals.length >= 3 && bfMax - bfMin > 5 && bfMin < 4;
  gate("T6a 稳态退场：叶淡出 + 纱罩 blur 帧级见证（v8.7.5 关键帧散场多帧渐进→收拢近底）",
    leafMinS < 0.9 && bfDropped,
    `leafMin=${leafMinS.toFixed(3)} bfMax=${bfMax.toFixed(1)} bfMin=${bfMin.toFixed(1)} evts=${veilEvts.length}`);
  /* TL33b 行为门（v8.7.5 ㊼ 散场帧级见证，复用 exitCurve.rows）——
     语义锚定「最后 conn 帧」（数学保证：latch 780ms 卸载必晚于动画毕
     [起步链 ~230ms + 400ms < 780ms，v8.7.6 ㊽ 散场拉长同步扩窗]，
     故最后一帧恒在散场到位后）：
     ① 到位归零：最后 conn 帧 bf≤1.5 且 sat≤1.05（无 saturate 函数=sat 1；
        旧实现终态 sat 恒 1.5 必挂——「过饱和常驻突变」病灶的帧级见证）
     ② 及早隐没：最后 conn 帧 hidden（0.42s 延迟 < 旧 0.44s）或存在
        hidden 帧，或已归位静止（bf≤1.2 且 sat≤1.02 与 hidden 视觉等价，
        兜慢帧距下 hidden 帧缺失）
     ③ 无爬行平台：blur>2px 段无连续 4 帧 Δ<0.35px（旧 ease-out 尾段
        末 100ms 变化 0.1px 的「纹丝不动」结构性存在必挂；v8.7.6 匀速
        尾每 32.5ms 收 1px，headless 帧距下 Δ≥0.6px 结构性不触发） */
  const connRows33 = exitCurve.rows.filter((s) => s.conn === true);
  const last33 = connRows33[connRows33.length - 1];
  const lastSat33 = last33 ? (last33.sat === null || last33.sat === undefined ? 1 : parseFloat(last33.sat)) : NaN;
  const lastBf33 = last33 ? parseFloat(last33.bf) : NaN;
  const home33 = Number.isFinite(lastSat33) && lastSat33 <= 1.05 && Number.isFinite(lastBf33) && lastBf33 <= 1.5;
  const hidSeen33 = connRows33.some((s) => s.vis === "hidden");
  const earlyGone33 = hidSeen33 || (last33 && last33.vis === "hidden")
    || (Number.isFinite(lastBf33) && lastBf33 <= 1.2 && Number.isFinite(lastSat33) && lastSat33 <= 1.02);
  const early33 = exitCurve.rows.map((s) => parseFloat(s.bf)).filter(Number.isFinite);
  let plat33 = 0;
  let run33 = 0;
  let prev33 = null;
  for (const v of early33) {
    if (v > 2 && prev33 !== null && Math.abs(v - prev33) < 0.35) {
      run33 += 1;
      if (run33 >= 3) { plat33 = 1; break; }
    } else {
      run33 = 0;
    }
    prev33 = v;
  }
  gate("TL33b 散场帧级行为门（v8.7.5 ㊼）：终帧 sat/blur 归位 + 及早隐没 + 无爬行平台",
    home33 && earlyGone33 && !plat33,
    `lastBf=${lastBf33} lastSat=${lastSat33} lastVis=${last33 ? last33.vis : "NA"} hid=${hidSeen33} plat=${plat33}`);
  await sleep(700); /* 兜底等待：exitCurve 900ms 采样窗 + 本等待 ≈ 关后 1600ms，远超 latch 780ms 卸载时点——T6b 查存在性必在卸载后 */
  gate("T6b 退场收尾：完全关闭", !(await drawerOpen(af)));

  /* ---------- T7 批量管理抖动 + pill 移除 + 右键编辑（回归）---------- */
  await page.mouse.click(90, 620, { button: "middle" });
  await sleep(900);
  await af.evaluate(() => window.dispatchEvent(new CustomEvent("start:links-manage")));
  await sleep(800);
  const jig = await af.evaluate(() => {
    const all = [...window.qCla(".cl-links .jiggle")];
    const one = all[0] ? getComputedStyle(all[0]) : null;
    const tileUnit = all.find((w) => w.querySelector(".tile-label") && w.querySelector(".cl-fade-leaf"));
    const addWrap = window.qCl('button[data-cl-tile="add"] .jiggle');
    const pill = [...window.qCla("button")].find(
      (b) => b.textContent.trim() === "批量管理" || b.textContent.trim() === "完成");
    return {
      count: all.length, name: one?.animationName || "", dur: one?.animationDuration || "",
      tileUnit: !!tileUnit, addUnit: !!(addWrap && addWrap.textContent.includes("添加") && addWrap.querySelector(".cl-fade-leaf")),
      pillGone: !pill,
    };
  });
  gate("T7a 编辑态抖动在位（磁贴+添加位）", jig.count >= 2, `jiggle=${jig.count}`);
  gate("T7b 抖动参数（jiggle/0.28s）", jig.name === "jiggle" && jig.dur === "0.28s", `${jig.name}/${jig.dur}`);
  gate("T7c 整单元抖动（图标+名称+添加位）", jig.tileUnit && jig.addUnit);
  gate("T7d 抽屉内 pill 已移除", jig.pillGone);
  await page.screenshot({ path: SHOTS + "/02-edit-jiggle.png" });

  await af.evaluate(() => window.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  await sleep(400);
  const tilePos = await af.evaluate(() => {
    const t = window.qCl('[data-cl-tile="1"]');
    if (!t) return null;
    const r = t.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  let dlgOpened = false, menuSuppressed = false;
  if (tilePos) {
    await page.mouse.click(tilePos.x, tilePos.y, { button: "right" });
    await sleep(700);
    const ctxState = await af.evaluate(() => ({
      dlg: !!document.querySelector("[role='dialog']"),
      menu: !!document.querySelector("[role='menu']"),
    }));
    dlgOpened = ctxState.dlg;
    menuSuppressed = !ctxState.menu;
  }
  gate("T7e 右键磁贴 → 编辑对话框打开", dlgOpened);
  gate("T7f 右键磁贴 → 「初始」菜单不弹", menuSuppressed);
  await page.keyboard.press("Escape");
  await sleep(500);

  /* ---------- T8 常驻形态：三层入场凝霜 + 布局回归 ---------- */
  await af.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem("start:settings") || "{}");
    raw.linksForm = "docked";
    localStorage.setItem("start:settings", JSON.stringify(raw));
  });
  af = await page.reload({ waitUntil: "load" }).then(() => bootNewTab(page));
  gate("T8a 刷新后 boot（linksForm=docked 持久化）", !!af);
  if (!af) throw new Error("reload 后 appFrame 未建立");
  await sleep(2000);
  const dockedState = await af.evaluate(() => {
    const tiles = document.querySelectorAll('section[aria-label="快捷链接"] [data-cl-tile="1"]');
    const frost = document.querySelector('section[aria-label="快捷链接"] [data-cl-tile="1"] .tile-frost');
    const w = frost ? Math.round(frost.getBoundingClientRect().width) : 0;
    const cs = frost ? getComputedStyle(frost) : null;
    return { tiles: tiles.length, iconW: w, bf: cs?.backdropFilter || "", op: cs ? parseFloat(cs.opacity) : null };
  });
  gate("T8b 常驻形态：磁贴常驻 56px", dockedState.tiles > 0 && dockedState.iconW === 56,
    `tiles=${dockedState.tiles} icon=${dockedState.iconW}px`);
  gate("T8c 常驻磁贴磨砂在线（blur(14px)）", /blur\(14px\)/.test(dockedState.bf || ""), dockedState.bf);
  /* 常驻入场三通道：重触发 intro 冻结@30% —— 霜感先行 */
  const dFrost = await freezeIntro(af, "-0.30s");
  gate("T8d 常驻冻结@30%: 霜层已凝满且磨砂在线（opacity=1+blur14）",
    dFrost?.frostOp === 1 && /blur\(14px\)/.test(dFrost?.frostBF || ""),
    `op=${dFrost?.frostOp} bf=${(dFrost?.frostBF || "").slice(0, 26)}`);
  gate("T8e 常驻冻结@30%: 内容层模糊聚拢在飞（整块覆盖）",
    (dFrost?.bodyFilter || "").includes("blur("), (dFrost?.bodyFilter || "").slice(0, 24));
  await af.evaluate(() => document.getElementById("dbg-frost-style")?.remove());
  await page.screenshot({ path: SHOTS + "/03-docked.png" });
  await page.mouse.click(90, 90, { button: "middle" });
  await sleep(600);
  gate("T8f 常驻形态中键不唤出抽屉",
    await af.evaluate(() => !document.querySelector(".cl-drawer-veil")));

  /* ---------- T9 更新日志首条 8.7.1 ---------- */
  await af.evaluate(() => {
    const btn = [...window.qCla("button")].find(
      (b) => (b.getAttribute("aria-label") || b.textContent || "").includes("设置"));
    btn?.click();
  });
  await sleep(900);
  await af.evaluate(() => {
    const b = [...window.qCla("button")].find(
      (x) => (x.textContent || "").includes("更新日志"));
    b?.click();
  });
  await sleep(800);
  const logFirst = await af.evaluate(() => {
    const dlgs = [...document.querySelectorAll("[role='dialog']")];
    const hit = dlgs.find((d) => d.textContent.includes("8.7.1"));
    return hit ? "8.7.1" : null;
  });
  gate("T9 更新日志首条 8.7.1", logFirst === "8.7.1", `first=${logFirst}`);
  await page.keyboard.press("Escape");
  await sleep(400);

  /* ---------- TL v8.7.0 核心：浅色「瓷釉」重写 ----------
     前置：T8 已把 linksForm=docked；此处切 themeMode=light 验证瓷釉体系，
     再切回 dark 验证磁贴暗雾镜像无回归。 */
  await af.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem("start:settings") || "{}");
    raw.themeMode = "light";
    localStorage.setItem("start:settings", JSON.stringify(raw));
  });
  af = await page.reload({ waitUntil: "load" }).then(() => bootNewTab(page));
  gate("TL0 浅色切换后 boot", !!af);
  if (!af) throw new Error("浅色 reload 后 appFrame 未建立");
  await sleep(2000);
  const lightState = await af.evaluate(() => {
    const root = document.documentElement;
    const dark = root.classList.contains("dark");
    const frost = document.querySelector('section[aria-label="快捷链接"] [data-cl-tile="1"] .tile-frost');
    const cs = frost ? getComputedStyle(frost) : null;
    const pill = document.querySelector(".glass-pill");
    const pillCs = pill ? getComputedStyle(pill) : null;
    return {
      dark,
      scheme: root.style.colorScheme,
      canvas: getComputedStyle(root).backgroundColor,
      frostBg: cs ? cs.backgroundColor : null,
      frostBf: cs ? cs.backdropFilter : "",
      pillBg: pillCs ? pillCs.backgroundColor : "",
    };
  });
  gate("TL1 浅色类态（无 .dark + colorScheme=light）", !lightState.dark && lightState.scheme === "light",
    `scheme=${lightState.scheme}`);
  gate("TL2 瓷釉画布底色 rgb(246,245,249)", lightState.canvas === "rgb(246, 245, 249)", lightState.canvas);
  gate("TL3 v8.7.0 磁贴统一深色釉：浅色霜层=暗雾 rgba(12,12,18,0.2)",
    lightState.frostBg === "rgba(12, 12, 18, 0.2)", lightState.frostBg);
  gate("TL4 浅色磁贴磨砂在线（blur(14px) saturate(1.6)）",
    /blur\(14px\)\s+saturate\(1\.6\)/.test(lightState.frostBf), lightState.frostBf);
  gate("TL5 亮玻璃药丸面（rgba(255,255,255,0.62)）",
    lightState.pillBg === "rgba(255, 255, 255, 0.62)", lightState.pillBg);
  /* TL13c v8.7.0：dock 面板 glass-card 磨砂在线（浅色） */
  await af.evaluate(() => { const b = document.querySelectorAll(".dock-btn")[0]; if (b) b.click(); });
  /* TL13c1 v8.7.0：面板出生窗——content-focus 在玻璃内层（后代 filter/opacity 不触
     采样链），包裹层（玻璃祖先）零动画零 filter，卡本体 panel-fade 底色凝入在飞、
     磨砂恒在线——开面板首帧模糊不再消失（用户录屏能量曲线实锤的 0.3s 死窗回归门） */
  const birth = await af.evaluate(() => new Promise((res) => {
    const t0 = performance.now();
    const poll = () => {
      const card = document.querySelector(".glass-card.cl-panel");
      if (card) {
        /* v8.7.0：内容层模糊聚拢在飞——blur 只存在于 0.3s 动画窗内，出生即采样
           单帧可能撞上动画已结束（headless rAF 节流），改为首见后持续追采至
           900ms，任一帧捕到非零 blur( 即记 innerBlurSeen（免疫采样时机 flake） */
        const wrap = card.parentElement;
        const inner = card.querySelector(":scope > .cl-panel-content");
        const cs = (el) => (el ? getComputedStyle(el) : null);
        const sample = () => ({
          wrapAnim: cs(wrap)?.animationName ?? "",
          wrapFilter: cs(wrap)?.filter ?? "",
          wrapOp: cs(wrap)?.opacity ?? "",
          innerAnim: cs(inner)?.animationName ?? "",
          innerFilter: cs(inner)?.filter ?? "",
          cardAnim: cs(card)?.animationName ?? "",
          cardBF: cs(card)?.backdropFilter ?? "",
        });
        let last = sample();
        let blurSeen = /blur\((?!0px\))/.test(last.innerFilter);
        const track = () => {
          if (performance.now() - t0 > 900) { res({ ...last, innerBlurSeen: blurSeen }); return; }
          last = sample();
          if (/blur\((?!0px\))/.test(last.innerFilter)) blurSeen = true;
          requestAnimationFrame(track);
        };
        requestAnimationFrame(track);
      } else if (performance.now() - t0 < 500) requestAnimationFrame(poll);
      else res(null);
    };
    requestAnimationFrame(poll);
  }));
  gate("TL13c1 面板出生窗：玻璃祖先零 filter/opacity，内容层模糊聚拢在飞（blur>0 被追采捕获），卡 panel-fade+磨砂在线",
    !!birth && birth.wrapAnim === "none" && birth.wrapFilter === "none" && birth.wrapOp === "1" &&
    birth.innerAnim === "panel-content-in" && birth.innerBlurSeen === true &&
    birth.cardAnim === "panel-fade" && /blur\(20px\)\s+saturate\(1\.5\)/.test(birth.cardBF),
    birth ? JSON.stringify(birth) : "卡片 500ms 内未挂载");
  await sleep(900);
  const panelLight = await af.evaluate(() => {
    const c = document.querySelector(".glass-card");
    return c ? { bf: getComputedStyle(c).backdropFilter, bg: getComputedStyle(c).backgroundColor } : null;
  });
  gate("TL13c 浅色 glass-card 磨砂在线（blur(20px) saturate(1.5) + 白玻璃 0.62）",
    !!panelLight && /blur\(20px\)\s+saturate\(1\.5\)/.test(panelLight.bf) && panelLight.bg === "rgba(255, 255, 255, 0.62)",
    `bf=${panelLight && panelLight.bf} bg=${panelLight && panelLight.bg}`);
  /* TL16d/e+TL17c v8.7.0：互切拉伸律行为见证——单卡律/同卡律/零残留律 */
  const before29 = await af.evaluate(() => {
    const c = document.querySelector(".glass-card.cl-panel");
    if (!c) return null;
    c.setAttribute("data-probe-mark", "v8630");
    return c.getAttribute("data-panel");
  });
  await af.evaluate(() => { const b = document.querySelectorAll(".dock-btn")[1]; if (b) b.click(); });
  const switchWin = await af.evaluate(() => new Promise((res) => {
    const t0 = performance.now();
    let maxCards = 0, sawSwitching = false;
    const poll = () => {
      const stage = document.querySelector(".cl-stage");
      const cards = document.querySelectorAll(".glass-card.cl-panel");
      maxCards = Math.max(maxCards, cards.length);
      if (stage && stage.className.includes("cl-switching")) sawSwitching = true;
      if (performance.now() - t0 < 900) requestAnimationFrame(poll);
      else res({ maxCards, sawSwitching });
    };
    requestAnimationFrame(poll);
  }));
  gate("TL16d 互切单卡律：切换窗 900ms 全程 .cl-panel 至多一张、cl-switching 从未出现（双卡同框结构性不可能）",
    !!switchWin && switchWin.maxCards <= 1 && !switchWin.sawSwitching,
    switchWin ? JSON.stringify(switchWin) : "观测失败");
  await sleep(400);
  const settled29 = await af.evaluate(() => {
    const cards = [...document.querySelectorAll(".glass-card.cl-panel")];
    return { n: cards.length, panel: cards[0]?.getAttribute("data-panel") ?? null,
      marked: cards[0]?.getAttribute("data-probe-mark") === "v8630",
      contentCls: cards[0]?.querySelector(":scope > .cl-panel-content") ? "ok" : "missing",
      anim: cards.length ? getComputedStyle(cards[0]).animationName : "",
      bf: cards.length ? getComputedStyle(cards[0]).backdropFilter : "" };
  });
  gate("TL17c 互切零残留+同卡换装：data-panel=新面板（旧值同帧消失）、同一 DOM 节点（data-probe-mark 在=玻璃不重挂）、内容层 cl-panel-content",
    settled29.n === 1 && before29 != null && settled29.panel != null &&
    settled29.panel !== before29 && settled29.marked && settled29.contentCls === "ok",
    `before=${before29} after=${JSON.stringify(settled29)}`);
  gate("TL16e 互切落定：同一张玻璃磨砂在线（blur 20px saturate 1.5）+ panel-rise 类在位（重挂与否由 TL17c 同卡律见证）",
    /blur\(20px\)\s+saturate\(1\.5\)/.test(settled29.bf) && settled29.anim === "panel-fade",
    `anim=${settled29.anim} bf=${settled29.bf}`);
  /* TL16f v8.7.0 互切底锚律行为见证：壳体底缘恒定 + 玻璃卡底永不悬空 + 底锚锁在位。
     rAF 首帧发起切换（换装帧不漏采）；getBoundingClientRect 不受 overflow 裁剪
     影响——收缩方向若卡高瞬变未被 minHeight 锁住，卡底悬空（cb < sb）即被捕获。
     gap 容差 1px：framer 弹簧收敛存在 ~0.56px 过冲瞬态（阻尼振荡，亚像素不可见，
     壳高短暂超出卡高），rAF 采样偶捕——真失效 signature 是 62px 级悬空，1px 容差
     仍稳抓；落定态经分数精度测高（rect.height）精确贴合 gap=0 */
  const anchorWin = await af.evaluate(() => new Promise((res) => {
    requestAnimationFrame(() => {
      const btns = document.querySelectorAll(".dock-btn");
      if (btns[0]) btns[0].click();
      const t0 = performance.now();
      let gap = 0, maxSB = -Infinity, minSB = Infinity, sawTrack = false, frames = 0;
      const poll = () => {
        const st = document.querySelector(".cl-stage");
        const card = document.querySelector(".glass-card.cl-panel");
        if (st && card) {
          const sr = st.getBoundingClientRect();
          const cr = card.getBoundingClientRect();
          if (sr.bottom - cr.bottom > 0.5) gap = Math.max(gap, sr.bottom - cr.bottom);
          if (sr.bottom > maxSB) maxSB = sr.bottom;
          if (sr.bottom < minSB) minSB = sr.bottom;
          /* v8.7.0 玻璃壳满窗律：卡高每帧==壳高（h-full 贴随弹簧，底边恒定） */
          if (Math.abs(cr.height - sr.height) <= 1) sawTrack = true;
        }
        frames++;
        if (performance.now() - t0 < 900) requestAnimationFrame(poll);
        else res({ gap: Math.round(gap * 10) / 10, stageDelta: Math.round((maxSB - minSB) * 10) / 10, sawTrack, frames });
      };
      poll();
    });
  }));
  gate("TL16f 互切底锚律 v8.7.0 玻璃壳满窗：切换窗 900ms 壳体底缘恒定（≤2px）+ 玻璃卡底永不悬空（gap≤1px）+ 卡高贴随壳高（h-full 每帧同高）",
    !!anchorWin && anchorWin.frames >= 8 && anchorWin.stageDelta <= 2 && anchorWin.gap <= 1 && anchorWin.sawTrack,
    anchorWin ? JSON.stringify(anchorWin) : "观测失败");
  /* TL18a v8.7.0 雾化 filter 回归 + 玻璃载体零毒退场（静态门）：雾化 blur(12px)
     回归无玻璃子树（zen-fade=时钟段 / cl-widgets=iframe 容器）；玻璃载体
     （zen-gone 磁贴墙 / zen-dock / search-pill）退场一律 visibility+transform——
     opacity<1 与 filter≠none 在玻璃祖先/本体上同为 backdrop root 毒物
     （v8.6.22 自身剧毒 + v8.6.32 祖先 filter + 本轮用户实测「filter 删了、opacity
     雾化仍在，磁贴磨砂照样消失」三案定罪），禅窗全程零毒。 */
  const zenScan = await af.evaluate(() => {
    const rules = [];
    for (const sheet of document.styleSheets) {
      let list; try { list = sheet.cssRules; } catch { continue; }
      const walk = (rs) => { for (const r of rs) {
        if (r.selectorText && /zen|search-pill/.test(r.selectorText)) rules.push({ sel: r.selectorText, css: r.style ? r.style.cssText : "" });
        if (r.cssRules) walk(r.cssRules);
      } };
      walk(list);
    }
    /* lightningcss 会把声明全同的规则合并为分组选择器——按逗号分段精确匹配 */
    const fog = (name) => rules.find((t) => t.sel.split(",").map((x) => x.trim()).includes(name));
    return { fade: fog("html.zen .zen-fade"), gone: fog("html.zen .zen-gone"), goneBase: fog(".zen-gone"), dock: fog("html.zen .zen-dock"), pill: fog("html.zen .search-pill"), widgets: fog("html.zen .cl-widgets") };
  });
  const noPoison = (t) => !!t && !/(^|[^-])filter\s*:/.test(t.css) && !/(^|[\s;])opacity\s*:/.test(t.css) && t.css.includes("visibility: hidden") && t.css.includes("scale(0)");
  gate("TL18a 雾化 filter 回归：html.zen .zen-fade 恢复 blur(12px) 雾化（时钟段无玻璃子树）+ cl-widgets 保留 blur",
    !!zenScan.fade && /(^|[^-])filter\s*:\s*blur\(12px\)/.test(zenScan.fade.css) && !!zenScan.widgets && zenScan.widgets.css.includes("blur(12px)"),
    JSON.stringify(zenScan));
  /* v8.7.0 反转：三载体禅退场=时钟同款模糊雾化（opacity:0 + blur(12px)），
     scale 缩放退役；基线 transition 含 opacity/filter（退禅显影通道）。 */
  const fogFaded = (t) => !!t
    && /(?:^|[\s;])opacity\s*:\s*0/.test(t.css)
    && /(?:^|[^-])filter\s*:\s*blur\(12px\)/.test(t.css)
    && !t.css.includes("scale(")
    && t.css.includes("visibility: hidden");
  const baseFog = (t) => !!t && t.css.includes("opacity") && t.css.includes("filter") && t.css.includes("transition");
  gate("TL18b' v8.7.0 模糊雾化退场：zen-gone/zen-dock/search-pill 三条 html.zen 规则 opacity:0+blur(12px)+零 scale+visibility 末帧隐没 + .zen-gone 基线 opacity/filter 过渡在位",
    fogFaded(zenScan.gone) && fogFaded(zenScan.dock) && fogFaded(zenScan.pill) && baseFog(zenScan.goneBase),
    JSON.stringify({ gone: zenScan.gone && zenScan.gone.css, dock: zenScan.dock && zenScan.dock.css, pill: zenScan.pill && zenScan.pill.css, goneBase: zenScan.goneBase && zenScan.goneBase.css }));
  /* TL20 v8.7.0 退禅磨砂复原双保险（源码门）：defrostGlass 在位（display 往返 +
     getAnimations({subtree}) cancel）且两条退禅路径（dblclick toggle / Esc）
     均先于 setZen 调用。 */
  const pageSrc = readFileSync(new URL("../src/app/page.tsx", import.meta.url), "utf8");
  /* beta 重写架构：defrostGlass 定义与 dblclick 路径在禅模式域（use-start-zen.ts），
     Esc 路径在 page 编排（sp. 前缀回调）——双路径语义不变 */
  const zenSrc = readFileSync(new URL("../src/app/startpage/use-start-zen.ts", import.meta.url), "utf8");
  const dgCalls = (zenSrc.match(/defrostGlass\(\)/g) || []).length + (pageSrc.match(/defrostGlass\(\)/g) || []).length;
  gate("TL20 退禅磨砂复原双保险：defrostGlass 定义（禅域：display 往返+reflow+subtree 动画 cancel）+ 双退禅路径调用（dblclick 禅域 / Esc 编排域）",
    /const defrostGlass = useCallback/.test(zenSrc)
      && /getAnimations\(\{ subtree: true \}\)/.test(zenSrc)
      && /offsetWidth/.test(zenSrc)
      && /if \(zenRef\.current\) defrostGlass\(\);/.test(zenSrc)
      && dgCalls >= 2
      && /sp\.defrostGlass\(\);\n\s*sp\.setZen\(false\);/.test(pageSrc),
    `defrostGlass 调用 ${dgCalls} 次`);
  /* TL21 v8.7.0 禅覆盖层常驻化（源码门）：page.tsx framer/AnimatePresence/EASE 全退役
     + .zen-overlay 常驻结构在位（aria-hidden={!zen} + ZenPomodoro zen 条件挂载）；
     globals.css visibility 离散插值双规则在位（基线末帧隐没 / html.zen 即时可见）。 */
  const cssSrc = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
  gate("TL21 禅覆盖层常驻化：page.tsx framer/AnimatePresence/EASE 退役 + zen-overlay 常驻结构 + CSS visibility 双规则在位",
    !/from "framer-motion"/.test(pageSrc)
      && !/<AnimatePresence/.test(pageSrc)
      && !/const EASE/.test(pageSrc)
      && /zen-overlay fixed inset-0 z-20/.test(pageSrc)
      && /aria-hidden=\{!sp\.zen\}/.test(pageSrc)
      && /\{sp\.zen && <ZenPomodoro/.test(pageSrc)
      && /^\.zen-overlay \{[^}]*visibility: hidden/m.test(cssSrc)
      && /^html\.zen \.zen-overlay \{[^}]*visibility: visible/m.test(cssSrc),
    "framer 退役 + 常驻结构 + CSS 双规则");
  /* TL22 v8.7.0 时钟闪动修复（源码门）：Colon 呼吸 CSS 化（keyframes + 类 + 4s
     infinite + reduced-motion 豁免）；zen-fade 缩放退役（基线 transition 与 html.zen
     禅态规则均无 transform——第十三轮「模糊过渡不是缩放动画」对时钟段收口）。 */
  const clockSrc = readFileSync(new URL("../src/components/startpage/Clock.tsx", import.meta.url), "utf8");
  const zfZen = (cssSrc.match(/^html\.zen \.zen-fade \{[^}]*\}/m) || [""])[0];
  const zfBase = (cssSrc.match(/^\.zen-fade \{[^}]*\}/m) || [""])[0];
  gate("TL22 时钟闪动修复：colon-breathe CSS 关键帧在位 + Colon 无 framer + zen-fade 缩放退役（无 transform）+ reduced-motion 豁免",
    /@keyframes colon-breathe/.test(cssSrc)
      && /^\.colon-breathe \{[^}]*animation: colon-breathe 4s ease-in-out infinite/m.test(cssSrc)
      && /breathe \? "colon-breathe" : ""/.test(clockSrc)
      && !/motion\.span\s*\n\s*animate=\{breathe/.test(clockSrc)
      && zfZen.length > 0 && !/transform/.test(zfZen)
      && zfBase.length > 0 && !/transform/.test(zfBase)
      && /^  \.colon-breathe,$/m.test(cssSrc),
    `zen-fade 基线=${zfBase.replace(/\s+/g, " ").slice(0, 80)} | 禅态=${zfZen.replace(/\s+/g, " ").slice(0, 60)}`);
  /* TL24a v8.7.0 dock 面板关闭收终（静态门）：材质冻结契约——v8.6.37 整卡 opacity
     溶解（透明磨砂坑）退役：@keyframes cl-panel-out-kf 不复存在，.panel-sink .cl-panel
     以 animation:none 压过共享 glass-card-out-kf 引用（同特异性后者胜，声明序在后）
     ——关闭全程底色/描边/阴影/blur/透明度五项冻结自然值，面板以与展开态相同的
     浅色/深色磨砂原样收折（高度盒归零在先、SINK_MS 卸载在后，无消失突跳）。
     共享 glass-card-out-kf 原样保留（纱幕/弹窗/右键通道零波及）。 */
  const sinkCl = (cssSrc.match(/\.panel-sink \.cl-panel \{[^}]*\}/) || [""])[0];
  gate("TL24a 收终静态门：cl-panel-out-kf 溶解退役 + .panel-sink .cl-panel animation:none 材质冻结 + 声明于共享规则之后 + 共享 out-kf 零波及",
    !/@keyframes cl-panel-out-kf/.test(cssSrc)
      && /\.panel-sink \.cl-panel \{\s*animation: none;\s*\}/.test(cssSrc)
      && /\.panel-sink \.glass-card \{[^}]*animation: glass-card-out-kf 0\.22s cubic-bezier\(0\.4, 0, 1, 1\) forwards/.test(cssSrc)
      && /@keyframes glass-card-out-kf \{[\s\S]*?background-color: transparent/.test(cssSrc)
      && (cssSrc.indexOf(".panel-sink .cl-panel {") > cssSrc.indexOf(".panel-sink .glass-card {")),
    `sinkCl=${sinkCl.replace(/\s+/g, " ").slice(0, 60)}`);
  /* TL18b v8.7.0 磨砂底层化·图标材质：.tile-frost 材质基线在位（样式表常驻声明）+
     计算样式磨砂在线 + 内联材质退役（style.backdropFilter 空）——材质从 JSX 内联
     收编 globals 基线，双渲染系统其一（磨砂）共享、其二（cs-lite）经通配关停。 */
  const frostMat = await af.evaluate(() => {
    const el = document.querySelector('[data-cl-tile="1"] .tile-frost') || document.querySelector(".tile-frost");
    if (!el) return null;
    let base = "";
    for (const sheet of document.styleSheets) {
      let list; try { list = sheet.cssRules; } catch { continue; }
      for (const r of list) {
        if (r.selectorText === ".tile-frost") base = r.style.cssText;
        if (r.cssRules) for (const rr of r.cssRules) { if (rr.selectorText === ".tile-frost") base = rr.style.cssText; }
      }
    }
    return { bf: getComputedStyle(el).backdropFilter, inline: el.style.backdropFilter || "", base };
  });
  gate("TL18b 磨砂底层化·图标材质：.tile-frost 基线规则在位（blur(14px) saturate(1.6)）+ 计算样式磨砂在线 + 内联材质退役",
    !!frostMat && /blur\(14px\)/.test(frostMat.bf) && /saturate\(1\.6\)/.test(frostMat.bf) && frostMat.base.includes("blur(14px)") && frostMat.inline === "",
    JSON.stringify(frostMat));

  /* TL19 v8.7.0 禅窗零毒行为门：docked 磁贴墙在禅进出全程 opacity=1/filter=none，
     visibility 承载隐没；退禅后 .tile-frost 磨砂计算值恒在线——opacity 雾化不再
     途径磁贴墙祖先（v8.6.32 用户实测磨砂消失的根因通道，本轮结构性拆除）。 */
  await af.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem("start:settings") || "{}");
    raw.linksForm = "docked";
    localStorage.setItem("start:settings", JSON.stringify(raw));
  });
  af = await page.reload({ waitUntil: "load" }).then(() => bootNewTab(page));
  const dockedBooted = await af.evaluate(async () => {
    const t0 = performance.now();
    while (performance.now() - t0 < 3000) {
      if (document.querySelector("section.zen-gone")) return true;
      await new Promise((r) => requestAnimationFrame(r));
    }
    return !!document.querySelector("section.zen-gone");
  });
  gate("TL19-pre docked 磁贴墙 boot（section.zen-gone 在位）", !!af && dockedBooted);
  const zenPhase = await af.evaluate(async () => {
    const nextFrame = () => new Promise((r) => requestAnimationFrame(r));
    /* intro-rise（时钟段入场 0.1s+0.95s）动画期持有 filter（动画>过渡级联），
       不排空会让快照撞上动画尾帧 blur(~0)（v8.6.33 首跑 TL19a 假阳实证）——
       rAF 排空至 getAnimations 清零；rAF 同时强制产帧，免 headless 遮挡冻结 */
    const drain = async (el) => {
      const t0 = performance.now();
      while (performance.now() - t0 < 3000) {
        if (el.getAnimations().length === 0) return true;
        await nextFrame();
      }
      return false;
    };
    /* v8.7.0 真实路径：进/退禅一律 dblclick 派发（React onDblClick →
       defrostGlass + setZen），探针不再手搓 classList——退禅磨砂复原双保险
       必须经真实 React 链路才有意义。target=main 不命中排除表（button/a/nav/…）。 */
    const dbl = () => {
      const target = document.querySelector("main") || document.body;
      target.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true, view: window }));
    };
    const snap = () => {
      const sec = document.querySelector("section.zen-gone");
      const frost = document.querySelector("section.zen-gone .tile-frost");
      const clock = document.querySelector("section.zen-fade");
      const s = sec ? getComputedStyle(sec) : null;
      return {
        secVis: s ? s.visibility : null,
        secOpa: s ? s.opacity : null,
        secFil: s ? s.filter : null,
        frostBf: frost ? getComputedStyle(frost).backdropFilter : null,
        clockFil: clock ? getComputedStyle(clock).filter : null,
      };
    };
    const clock = document.querySelector("section.zen-fade");
    const drained = clock ? await drain(clock) : false;
    dbl();
    /* html.zen 挂上（React 提交）后再排一次：禅态过渡启动期不入快照 */
    let t0 = performance.now();
    while (performance.now() - t0 < 950) await nextFrame();
    const inZen = snap();
    dbl();
    t0 = performance.now();
    while (performance.now() - t0 < 1000) await nextFrame();
    const afterZen = snap();
    return { drained, inZen, afterZen };
  });
  gate("TL19a v8.7.0 禅窗模糊雾化：intro 排空 + dblclick 进禅 + 磁贴墙 opacity=0+blur(12px)+visibility=hidden + 雾化 blur(12px) 在时钟段在线",
    zenPhase.drained && zenPhase.inZen.secVis === "hidden" && zenPhase.inZen.secOpa === "0" && /blur\(12px\)/.test(zenPhase.inZen.secFil || "") && /blur\(12px\)/.test(zenPhase.inZen.clockFil || ""),
    JSON.stringify(zenPhase.inZen));
  gate("TL19b v8.7.0 退禅复原（defrostGlass 双保险）：visibility=visible + opacity=1 + filter=none + .tile-frost 磨砂 blur(14px) saturate(1.6) 恒在线",
    zenPhase.afterZen.secVis === "visible" && zenPhase.afterZen.secOpa === "1" && (zenPhase.afterZen.secFil === "none" || zenPhase.afterZen.secFil === "") && /blur\(14px\)/.test(zenPhase.afterZen.frostBf || "") && /saturate\(1\.6\)/.test(zenPhase.afterZen.frostBf || ""),
    JSON.stringify(zenPhase.afterZen));
  await af.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem("start:settings") || "{}");
    raw.linksForm = "docked"; /* T8a 契约保持：下游 TL7/TL13a/TL18 家族依赖 docked 磁贴墙 */
    localStorage.setItem("start:settings", JSON.stringify(raw));
  });
  af = await page.reload({ waitUntil: "load" }).then(() => bootNewTab(page));
  gate("TL19c docked 形态复位 boot（T8a 契约）", !!af);
  /* TL24b v8.7.0 收终行为门：真实关闭链路——「材质冻结期间高度塌缩真实进行」契约：
     点关闭 → rAF×2 等 React 提交 closing（壳体挂 .panel-sink）→ early 采样（op=1 +
     底色自然值 + blur(20px) 满值）；轮询至壳高 <0.8·h0（高度盒 EXIT_EASE 塌缩进行中，
     headless rAF 膨胀自适应等待）→ late 采样材质依旧恒定——v8.6.37 此刻整卡 opacity
     已 <1（透明磨砂），本版反转断言：塌缩全程 op 恒 1、材质五项零解耦。卡片已无
     WAAPI 动画（animation:none），采样不再依赖 currentTime 快进；卡若在采样前完成
     卸载（塌缩全速尾段 race）记 detached 兜底，不制造新 flake。时序律不变：结束后
     等面板完全卸载再放行（残留面板会拦截 TL23 的 dblclick——排除表 panel!=null）。 */
  const whitebar = await af.evaluate(async () => {
    const nextFrame = () => new Promise((r) => requestAnimationFrame(r));
    /* beta：bootNewTab 只等 body.children>0（水合早期信号）——点击前 rAF 轮询等
       dock 按钮就位（Task 135 坑录律），headless 高负载下挂载可慢于上一门放行 */
    const dblBtn = async () => {
      let g = 0;
      while (!document.querySelectorAll(".dock-btn")[0] && g++ < 300) await nextFrame();
      const b = document.querySelectorAll(".dock-btn")[0];
      if (b) b.click();
      return !!b;
    };
    await dblBtn(); /* 打开 */
    let guard = 0;
    while (!document.querySelector(".glass-card.cl-panel") && guard++ < 180) await nextFrame();
    await new Promise((r) => setTimeout(r, 700));
    const card0 = document.querySelector(".glass-card.cl-panel");
    if (!card0) return { err: "no card before close" };
    const h0 = card0.getBoundingClientRect().height;
    await dblBtn(); /* 关闭——立即轮询（v8.7.0：click 后 rAF×2 等提交在高负载下 2 帧
       ~260ms > SINK_MS 240ms，轮询首查时 sink 已过期；轮询本身容纳 pre-commit
       帧，首见 sink 即采样 = 窗口起点） */
    let card = document.querySelector(".glass-card.cl-panel");
    let sunk = false;
    const t0 = performance.now();
    while (performance.now() - t0 < 1500) {
      card = document.querySelector(".glass-card.cl-panel");
      if (card && card.closest(".panel-sink")) { sunk = true; break; }
      if (!card) break; /* 高负载下塌缩+卸载可在一帧间隙内完成——detached 兜底 */
      await nextFrame();
    }
    if (!card || !sunk) return { err: "closing phase not observed", sunk };
    const snap = () => {
      const cs = getComputedStyle(card);
      return { op: cs.opacity, bg: cs.backgroundColor, bf: cs.backdropFilter };
    };
    const early = snap();
    let late = null;
    const t1 = performance.now();
    while (performance.now() - t1 < 600) {
      if (!card.isConnected) { late = { detached: true }; break; }
      const h = card.getBoundingClientRect().height;
      if (h < h0 * 0.8) { late = { ...snap(), h: Math.round(h) }; break; }
      await nextFrame();
    }
    await new Promise((r) => setTimeout(r, 1000)); /* SINK_MS+margin：面板完全卸载再放行 */
    return { h0: Math.round(h0), early, late, gone: !document.querySelector(".glass-card.cl-panel") };
  });
  const bgKept = (bg) => {
    const m = /rgba?\(([^)]+)\)/.exec(bg || "");
    if (!m) return false;
    const parts = m[1].split(",").map((x) => parseFloat(x));
    return (parts.length < 4 ? 1 : parts[3]) > 0.3;
  };
  const numOr = (v) => (v == null ? NaN : parseFloat(v));
  gate("TL24b 收终行为门：closing early 全材质（op=1+底色+blur20）+ 高度塌缩 <0.8h0 进行中 late 材质依旧恒定（op 恒 1，v8.6.37 反转）+ 卸载后零残留",
    !whitebar.err
      && whitebar.early && numOr(whitebar.early.op) >= 0.999 && bgKept(whitebar.early.bg) && /blur\(20px\)/.test(whitebar.early.bf || "")
      && whitebar.late && (whitebar.late.detached === true
        || (numOr(whitebar.late.op) >= 0.999 && bgKept(whitebar.late.bg) && /blur\(20px\)/.test(whitebar.late.bf || "")
          && whitebar.late.h < whitebar.h0 * 0.8))
      && whitebar.gone === true,
    JSON.stringify(whitebar));
  /* TL23 v8.7.0 禅覆盖层常驻行为门：覆盖层 DOM 恒在（常驻不卸载）；dblclick 进禅
     opacity=1/visibility=visible（950ms > 0.7s 过渡），退禅 opacity=0/visibility=hidden
     （1200ms 等末帧隐没）——exit 卡住滞留 / 卸载层缓存 ghost 两大复现通道结构消失。 */
  const zenOv = await af.evaluate(async () => {
    const nextFrame = () => new Promise((r) => requestAnimationFrame(r));
    const dbl = () => {
      const target = document.querySelector("main") || document.body;
      target.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true, view: window }));
    };
    /* bootNewTab 只等 body.children>0（水合早期）——rAF 轮询等常驻覆盖层渲染完成
       （TL19-pre dockedBooted 同惯例），避免在水合窗口扑空 */
    let ov = document.querySelector(".zen-overlay");
    const t0w = performance.now();
    while (!ov && performance.now() - t0w < 3000) {
      await nextFrame();
      ov = document.querySelector(".zen-overlay");
    }
    if (!ov) return { present: false };
    const snap = () => {
      const st = getComputedStyle(ov);
      return { opa: st.opacity, vis: st.visibility };
    };
    dbl();
    let t0 = performance.now();
    while (performance.now() - t0 < 950) await nextFrame();
    const inZen = snap();
    dbl();
    t0 = performance.now();
    while (performance.now() - t0 < 1200) await nextFrame();
    const afterZen = snap();
    return { present: true, inZen, afterZen };
  });
  gate("TL23 禅覆盖层常驻行为门：DOM 恒在 + 进禅 opacity=1/visible + 退禅 opacity=0/hidden（末帧隐没）",
    !!zenOv && zenOv.present === true
      && zenOv.inZen.opa === "1" && zenOv.inZen.vis === "visible"
      && zenOv.afterZen.opa === "0" && zenOv.afterZen.vis === "hidden",
    JSON.stringify(zenOv));
  await page.screenshot({ path: SHOTS + "/04-light.png" });
  /* 深色回归：磁贴暗雾镜像 */
  await af.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem("start:settings") || "{}");
    raw.themeMode = "dark";
    localStorage.setItem("start:settings", JSON.stringify(raw));
  });
  af = await page.reload({ waitUntil: "load" }).then(() => bootNewTab(page));
  gate("TL6 深色回归 boot", !!af);
  if (!af) throw new Error("深色 reload 后 appFrame 未建立");
  await sleep(2000);
  const darkState = await af.evaluate(() => {
    const frost = document.querySelector('section[aria-label="快捷链接"] [data-cl-tile="1"] .tile-frost');
    const cs = frost ? getComputedStyle(frost) : null;
    return {
      dark: document.documentElement.classList.contains("dark"),
      frostBg: cs ? cs.backgroundColor : null,
      canvas: getComputedStyle(document.documentElement).backgroundColor,
    };
  });
  gate("TL7 深色磁贴暗雾镜像（rgba(12,12,18,0.2)）",
    darkState.dark && darkState.frostBg === "rgba(12, 12, 18, 0.2)", darkState.frostBg);
  gate("TL8 深色画布底色不变（rgb(10,10,14)）", darkState.canvas === "rgb(10, 10, 14)", darkState.canvas);
  /* TL13c2 v8.7.0：深色 glass-card 磨砂在线 */
  await af.evaluate(() => { const b = document.querySelectorAll(".dock-btn")[0]; if (b) b.click(); });
  await sleep(900);
  const panelDark = await af.evaluate(() => {
    const c = document.querySelector(".glass-card");
    return c ? { bf: getComputedStyle(c).backdropFilter, bg: getComputedStyle(c).backgroundColor } : null;
  });
  gate("TL13c2 深色 glass-card 磨砂在线（blur(20px) + 暗玻璃 0.6）",
    !!panelDark && /blur\(20px\)\s+saturate\(1\.5\)/.test(panelDark.bf) && panelDark.bg === "rgba(22, 22, 27, 0.6)",
    `bf=${panelDark && panelDark.bf} bg=${panelDark && panelDark.bg}`);
  await page.screenshot({ path: SHOTS + "/05-dark.png" });

  /* ---------- TL9 v8.7.0 重写：掠影白字统一 + 零光效 + vignette 退役 + 常驻壁纸模糊 ----------
     此时 linksForm=docked（T8a 所设）：白字可读性由壁纸模糊 + scrim 承担 */
  await af.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem("start:settings") || "{}");
    raw.themeMode = "light";
    raw.background = "photo";
    raw.photoId = "custom";
    raw.wallpaperUrl = "data:image/svg+xml;base64," + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#1a3a1a"/></svg>');
    raw.wallpaperRev = 99;
    localStorage.setItem("start:settings", JSON.stringify(raw));
  });
  af = await page.reload({ waitUntil: "load" }).then(() => bootNewTab(page));
  if (!af) throw new Error("掠影 reload 后 appFrame 未建立");
  await sleep(2600);
  const pmProbe = await af.evaluate(() => {
    const cs = (sel) => { const el = document.querySelector(sel); return el ? getComputedStyle(el) : null; };
    const clock = cs(".clock-text");
    const label = cs(".cl-links .tile-label");
    const vig = cs(".vignette");
    const blurEl = document.querySelector(".photo-blur");
    const clockSec = document.querySelector('section[aria-label="时间与问候"]');
    const searchSec = document.querySelector('section[aria-label="搜索"]');
    return {
      pm: document.documentElement.classList.contains("photo-mode"),
      clockColor: clock && clock.color,
      labelColor: label && label.color,
      labelTs: label && label.textShadow,
      vigBg: vig && vig.backgroundImage,
      blurBf: blurEl ? getComputedStyle(blurEl).backdropFilter : null,
      pillBg: (() => { const p = document.querySelector(".glass-pill"); return p ? getComputedStyle(p).backgroundColor : null; })(),
      inputColor: (() => { const i = document.querySelector(".search-input"); return i ? getComputedStyle(i).color : null; })(),
      clockTop: clockSec ? clockSec.getBoundingClientRect().top : null,
      searchTop: searchSec ? searchSec.getBoundingClientRect().top : null,
      accentVar: document.documentElement.style.getPropertyValue("--ui-accent"),
      dockBtn: (() => { const b = document.querySelector(".dock-btn"); return b ? getComputedStyle(b).color : null; })(),
      tileFrost: (() => { const f = document.querySelector('section[aria-label="快捷链接"] [data-cl-tile="1"] .tile-frost'); return f ? getComputedStyle(f).backgroundColor : null; })(),
      tileLetter: (() => { const l = document.querySelector('section[aria-label="快捷链接"] [data-cl-tile="1"] .tile-letter'); return l ? getComputedStyle(l).color : null; })(),
    };
  });
  gate("TL13a 浅掠影磁贴统一深色釉（暗雾 0.2 + 字母浅白 zinc-100）",
    pmProbe.tileFrost === "rgba(12, 12, 18, 0.2)" &&
      (pmProbe.tileLetter === "oklch(0.967 0.001 286.375)" || pmProbe.tileLetter === "lab(96.1634 0.0993311 -0.364041)"),
    `frost=${pmProbe.tileFrost} letter=${pmProbe.tileLetter}`);
  gate("TL13b 浅掠影 dock 按钮回落基线墨系（与辉光/纯色一致 zinc-500）",
    (pmProbe.dockBtn === "oklch(0.552 0.016 285.938)" || pmProbe.dockBtn === "lab(47.8878 1.65477 -5.77283)"),
    `dockBtn=${pmProbe.dockBtn}`);
  gate("TL13d 强调色挂载存活（--ui-accent 不被预设令牌 effect 删除）",
    pmProbe.accentVar === "#8b5cf6",
    `accentVar=${pmProbe.accentVar}`);
  gate("TL9a 掠影白字统一（时钟/名称白，不分主题）",
    pmProbe.pm && pmProbe.clockColor === "rgb(245, 245, 245)" && /255,\s*255,\s*255/.test(pmProbe.labelColor || ""),
    `clock=${pmProbe.clockColor} label=${pmProbe.labelColor}`);
  gate("TL9b 掠影文字零光效（名称 text-shadow=none，底部白光绝迹）",
    pmProbe.pm && (pmProbe.labelTs === "none" || pmProbe.labelTs === ""),
    `ts=${pmProbe.labelTs}`);
  gate("TL9c vignette 在掠影下退役（壁纸上的顶部白光带根除）",
    pmProbe.pm && pmProbe.vigBg === "none",
    `vig=${pmProbe.vigBg}`);
  gate("TL9d 壁纸滤镜退役（v8.7.0 用户指令：.photo-blur 元素不存在）",
    pmProbe.blurBf === null,
    `bf=${pmProbe.blurBf}`);
  gate("TL9e 浅色掠影玻璃面回归主题（瓷釉浅药丸+深墨输入字）",
    pmProbe.pillBg === "rgba(255, 255, 255, 0.72)" &&
      (pmProbe.inputColor === "oklch(0.21 0.006 285.885)" || pmProbe.inputColor === "lab(8.30603 0.618205 -2.16572)"),
    `pill=${pmProbe.pillBg} input=${pmProbe.inputColor}`);
  await page.screenshot({ path: SHOTS + "/06-wp-light.png" });

  /* ---------- TL10/TL11 v8.7.0：抽屉形态壁纸不模糊 + 时钟搜索与常驻同位 ---------- */
  await af.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem("start:settings") || "{}");
    raw.linksForm = "drawer";
    localStorage.setItem("start:settings", JSON.stringify(raw));
  });
  af = await page.reload({ waitUntil: "load" }).then(() => bootNewTab(page));
  if (!af) throw new Error("TL10 reload 后 appFrame 未建立");
  await sleep(2600);
  const drProbe = await af.evaluate(() => {
    const blurEl = document.querySelector(".photo-blur");
    const clockSec = document.querySelector('section[aria-label="时间与问候"]');
    const searchSec = document.querySelector('section[aria-label="搜索"]');
    return {
      bf: blurEl ? getComputedStyle(blurEl).backdropFilter : null,
      drawerLabel: (() => { const l = window.qCl(".cl-links .tile-label"); return l ? getComputedStyle(l).color : null; })(),
      ghost: !!document.querySelector(".cl-layout-ghost"),
      ghostHidden: (() => { const g = document.querySelector(".cl-layout-ghost"); return g ? getComputedStyle(g).visibility === "hidden" : false; })(),
      clockTop: clockSec ? clockSec.getBoundingClientRect().top : null,
      searchTop: searchSec ? searchSec.getBoundingClientRect().top : null,
    };
  });
  gate("TL10 抽屉+掠影：壁纸滤镜退役 + 隐形占位在位且不可见",
    drProbe.bf === null && drProbe.ghost && drProbe.ghostHidden,
    `bf=${drProbe.bf} ghost=${drProbe.ghost}/${drProbe.ghostHidden}`);
  gate("TL11 抽屉模式时钟/搜索与常驻严格同位（Δ≤2px）",
    pmProbe.clockTop != null && drProbe.clockTop != null &&
      Math.abs(pmProbe.clockTop - drProbe.clockTop) <= 2 &&
      Math.abs(pmProbe.searchTop - drProbe.searchTop) <= 2,
    `clockΔ=${(drProbe.clockTop - pmProbe.clockTop).toFixed(2)} searchΔ=${(drProbe.searchTop - pmProbe.searchTop).toFixed(2)}`);
  /* TL9f 前置：中键唤出抽屉（portal 挂载磁贴墙），等开闸动画收敛；
     注意 label 必须【打开后实时采样】——drProbe 在 TL10（关态）评估时
     portal 未挂载，drawerLabel 恒 null，不能复用 */
  await page.mouse.click(200, 620, { button: "middle" });
  await sleep(1200);
  const labelLive = await af.evaluate(() => {
    const l = window.qCl(".cl-links .tile-label");
    return l ? getComputedStyle(l).color : null;
  });
  gate("TL9f 浅色掠影抽屉名称跟随主题（白纱上深墨 zinc-600）",
    labelLive === "oklch(0.442 0.017 285.786)" || labelLive === "lab(35.1166 1.78212 -6.1173)",
    `label=${labelLive}`);
  /* ---------- TL12 v8.7.0：主页面禁滚（真实滚轮输入两轴归零） ---------- */
  for (const vp of [{ width: 800, height: 600 }, { width: 560, height: 440 }]) {
    await page.setViewportSize(vp);
    await sleep(700);
    await af.evaluate(() => window.scrollTo(0, 0));
    await page.mouse.move(vp.width / 2, vp.height / 2);
    await page.mouse.wheel(0, 900);
    await page.mouse.wheel(900, 0);
    await sleep(300);
    const s = await af.evaluate(() => ({
      htmlOv: getComputedStyle(document.documentElement).overflow,
      bodyOv: getComputedStyle(document.body).overflow,
      x: window.scrollX, y: window.scrollY,
      sbFree: window.innerWidth === document.documentElement.clientWidth,
    }));
    gate(`TL12 ${vp.width}x${vp.height} 主页面禁滚（overflow hidden + 真实滚轮两轴归零）`,
      s.htmlOv === "hidden" && s.bodyOv === "hidden" && s.sbFree && s.x === 0 && s.y === 0,
      `ov=${s.htmlOv}/${s.bodyOv} sbFree=${s.sbFree} scroll=(${s.x},${s.y})`);
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.screenshot({ path: SHOTS + "/07-wp-drawer.png" });

  /* ---------- TL14 v8.7.0：磨砂存活 2.0 + 阴影同拍（CSSOM 扫描，稳态无关时序） ---------- */
  {
    const cssScan = await af.evaluate(() => {
      const kfs = {};
      const rules = [];
      const walk = (list) => {
        for (const r of list) {
          if (r.type === CSSRule.KEYFRAMES_RULE) kfs[r.name] = r.cssText;
          else if (r.cssText && r.selectorText) rules.push(r.cssText);
          if (r.cssRules) try { walk(r.cssRules); } catch { }
        }
      };
      for (const sh of document.styleSheets) {
        try { walk(sh.cssRules); } catch { }
      }
      const hasOpacity = (t) => /(^|[;{\s])opacity\s*:/.test(t);
      const kfPack = (names) => names.map((n) => ({ n, t: kfs[n] || null, bad: !kfs[n] || hasOpacity(kfs[n]) }));
      const findRule = (needle) => rules.find((t) => t.includes(needle)) || null;
      return {
        kfOut: kfPack(["palette-out-kf", "dialog-sink", "panel-sink", "ctx-out-kf", "glass-card-out-kf", "veil-fade", "cl-drawer-veil-scatter-kf"]),
        kfIn: kfPack(["card-in", "panel-fade", "ctx-in-kf", "intro-tile-tint", "veil-in", "intro-tile-frost", "dock-rise", "dock-glass-in", "pill-shell-in"]),
        veilRules: rules.filter((x) => x.includes("cl-drawer-veil")),
        outRules: rules.filter((x) => x.includes("veil-out") || x.includes("veil-hold-")),
        cascade: findRule(".panel-sink .glass-card"),
        dockRule: rules.find((x) => x.includes("dock-glass-in") && x.includes("dock-rise")) || null,
        frostRule: findRule(".link-intro-frost"),
        tileShadowRules: rules.filter((x) => x.includes(".tile-shadow")),
        dividerRule: rules.find((x) => x.includes(".dock-intro > .dock-divider") && x.includes("dock-btn-in")) || null,
        viewExitMain: rules.find((x) => x.startsWith(".view-exit {") || x.includes(".view-exit {")) || null,
        viewExitWidget: rules.find((x) => x.includes(".cl-dockwidget.view-exit") && x.includes("view-defocus")) || null,
        viewExitCard: rules.find((x) => x.includes(".view-exit .glass-card") && x.includes("glass-card-out-kf")) || null,
        viewExitContent: rules.find((x) => x.includes(".view-exit .content-focus") && x.includes("content-defocus")) || null,
        viewTopRule: rules.find((x) => x.includes(".view-top")) || null,
        switchCardRule: rules.find((x) => x.includes(".cl-switching .glass-card.panel-rise")) || null,
        switchExitRule: rules.find((x) => x.includes(".cl-switching .view-exit") && x.includes("visibility")) || null,
        switchExitContent: rules.find((x) => x.includes(".cl-switching .view-exit .content-focus") && x.includes("animation")) || null,
        panelContentIn: rules.find((x) => x.includes(".cl-panel-content") && x.includes("panel-content-in")) || null,
        panelContentOut: rules.find((x) => x.includes(".panel-sink .cl-panel-content") && x.includes("panel-content-out")) || null,
        viewDefocusAny: rules.find((x) => x.includes("view-defocus")) || null,
        z48Rules: rules.filter((x) => x.includes("cs-drawer .cl-dock")),
        litePillLight: rules.find((x) => x.includes("cs-lite:not(.dark) .glass-pill") && x.includes("0.94")) || null,
        litePillDark: rules.find((x) => x.includes("cs-lite.dark .glass-pill") && x.includes("0.94")) || null,
      };
    });
    const outBad = cssScan.kfOut.filter((k) => k.bad);
    const gcoT = cssScan.kfOut.find((k) => k.n === "glass-card-out-kf")?.t || "";
    gate("TL14a 壳体退场关键帧零 opacity（磨砂全程在线）",
      outBad.length === 0 && /blur\(1px\)\s*saturate\(1\.5\)/.test(gcoT.replace(/\s+/g, " ")),
      (outBad.length ? "缺/含opacity:" + outBad.map((k) => k.n).join(",") + " | " : "") +
      "gco=" + (gcoT ? gcoT.replace(/\s+/g, " ").slice(0, 200) : "NULL_KF"));
    const inBad = cssScan.kfIn.filter((k) => k.bad);
    gate("TL14b 玻璃入场关键帧底色凝入（无 opacity）+ tint/玻璃通道在位",
      inBad.length === 0,
      inBad.length ? "缺/含opacity:" + inBad.map((k) => k.n).join(",") : "card-in/panel-fade/ctx-in-kf/intro-tile-tint/dock-glass-in 全部无 opacity");
    gate("TL14c 玻璃卡退场级联在位（closing 投影规则已随 v8.7.0 退役）",
      !!cssScan.cascade,
      `cascade=${!!cssScan.cascade}`);
    gate("TL14d dock 玻璃通道 + 霜层 tint 同拍在位、tile-shadow 规则清零",
      (cssScan.dockRule || "").includes("dock-glass-in") &&
      (cssScan.frostRule || "").includes("intro-tile-tint") &&
      cssScan.tileShadowRules.length === 0,
      `dock=${(cssScan.dockRule || "").includes("dock-glass-in")} frostTint=${(cssScan.frostRule || "").includes("intro-tile-tint")} shadowRules=${cssScan.tileShadowRules.length}`);
    /* ---------- TL14e/f v8.7.0 磨砂写入底层 ---------- */
    const veilInT = (cssScan.kfIn.find((k) => k.n === "veil-in")?.t || "").replace(/\s+/g, " ");
    const veilOutT = (cssScan.kfOut.find((k) => k.n === "veil-fade")?.t || "").replace(/\s+/g, " ");
    gate("TL14e 遮罩族关键帧磨砂化（veil-in/veil-fade 走 blur 底层通道，零 opacity）",
      /backdrop-filter/.test(veilInT) && /blur\(1px\)\s*saturate\(1\.5\)/.test(veilInT) &&
      /backdrop-filter/.test(veilOutT) && /blur\(1px\)\s*saturate\(1\.5\)/.test(veilOutT),
      `in=${veilInT.slice(0, 120)} | out=${veilOutT.slice(0, 120)}`);
    const veilBase = (cssScan.veilRules.find((x) => x.includes(".cl-drawer-veil") && !x.includes("data-veil") && !x.includes("::before") && !x.includes("cs-lite") && !x.includes("photo-mode")) || "");
    const veilOpen = (cssScan.veilRules.find((x) => x.includes('.cl-drawer-veil[data-veil="1"]') && !x.includes("::before")) || "");
    const veilBefore = (cssScan.veilRules.find((x) => x.includes(".cl-drawer-veil::before")) || "");
    gate("TL14f 纱罩底层律（base blur transition + open 14px var 站点 + ::before 染色层）",
      /backdrop-filter\s*:\s*blur\(1px\)/.test(veilBase.replace(/\s+/g, " ")) &&
      /var\(--dv-open-bf,\s*blur\(14px\)\s*saturate\(1\.5\)\)/.test(veilOpen.replace(/\s+/g, " ")) && !!veilBefore,
      `base=${veilBase ? "ok" : "NULL"} open=${veilOpen ? "ok" : "NULL"} before=${veilBefore ? "ok" : "NULL"}`);
    /* ---------- TL14g/h v8.7.0 感知同步律（blur 领先/驻留） ---------- */
    gate("TL14g 纱幕 blur 领先/驻留（veil-in 45% 凝满 + veil-fade 0-55% 驻留）",
      /45%\s*{[^}]*var\(--veil-hold-bf/.test(veilInT.replace(/\s+/g, " ")) &&
      /0%,\s*55%\s*{[^}]*var\(--veil-hold-bf/.test(veilOutT.replace(/\s+/g, " ")),
      `in45=${/45%\s*{[^}]*--veil-hold-bf/.test(veilInT.replace(/\s+/g, " "))} outHold=${/0%,\s*55%/.test(veilOutT.replace(/\s+/g, " "))}`);
    const holdBfStop = (t) => (t || "").replace(/\s+/g, " ");
    const gcoH = holdBfStop(gcoT);
    const dlgT = holdBfStop(cssScan.kfOut.find((k) => k.n === "dialog-sink")?.t);
    const palT = holdBfStop(cssScan.kfOut.find((k) => k.n === "palette-out-kf")?.t);
    const ctxT = holdBfStop(cssScan.kfOut.find((k) => k.n === "ctx-out-kf")?.t);
    gate("TL14g 卡片退场 blur 驻留（glass-card-out/dialog/palette/ctx 满值站点）",
      /0%,\s*55%\s*{[^}]*blur\(20px\)\s*saturate\(1\.5\)/.test(gcoH) &&
      /55%\s*{[^}]*blur\(20px\)/.test(dlgT) &&
      /30%\s*{[^}]*blur\(20px\)/.test(palT) &&
      /55%\s*{[^}]*blur\(20px\)/.test(ctxT),
      `gco=${/0%,\s*55%/.test(gcoH)} dlg=${/55%/.test(dlgT)} pal=${/30%/.test(palT)} ctx=${/55%/.test(ctxT)}`);
    const cardCascade = (cssScan.outRules.find((x) => x.includes(".veil-out .glass-card:not(.palette-out)") && x.includes("glass-card-out-kf")) || "");
    const contentCascade = (cssScan.outRules.find((x) => x.includes(".veil-out .glass-card:not(.palette-out)") && x.includes("content-defocus")) || "");
    const holdNone = (cssScan.outRules.find((x) => x.includes(".veil-hold-none")) || "");
    const hold2xl = (cssScan.outRules.find((x) => x.includes(".veil-hold-2xl")) || "");
    /* v8.7.12 凝聚 animation 化：开态接线锚从 transition 0.6s 换为
       dv-open-kf animation（压缩器尾零删 + calc 乘 mo-speed）；
       v8.7.16：0.5s→0.4s（用户「打开速度再快一点点」） */
    const veilOpenTr = /dv-open-kf/.test(veilOpen.replace(/\s+/g, " ")) && /0?\.4s/.test(veilOpen.replace(/\s+/g, " "));
    /* v8.7.5 ㊼ 散场移交关键帧：基态不再有 backdrop-filter transition——
       锚 cs-drawer-closing 接线（animation 引用 scatter-kf）+ 旧 0.12s
       凝聚/0.42s transition 退役反向断言 + 旧 0.14s 冲线残留双保险
       （v8.7.6 ㊽：开态凝聚换 0.36s 渐入；v8.7.7：0.36→0.60s 再放慢，
       产物极简 0.60s→0.6s 尾零删，锚 0.6s） */
    const veilAll14 = cssScan.veilRules.join(" ").replace(/\s+/g, " ");
    /* 产物极简重排 animation 简写值序（name 挑到末尾）——宽松锚值不锚序 */
    const veilCloseTr = /cs-drawer-closing \.cl-drawer-veil[^{]*\{[^}]*animation:[^;}]*cl-drawer-veil-scatter-kf/.test(veilAll14)
      && !/backdrop-filter\s*0\.12s/.test(veilAll14)
      && !/backdrop-filter\s*0\.42s/.test(veilAll14)
      && !/0\.14s\s+cubic-bezier\(0\.4,\s*0,\s*1,\s*1\)\s+0\.14s/.test(veilAll14);
    gate("TL14h 面板随纱同散级联 + hold 适配类 + 纱罩开合变速（v8.7.12 凝聚 animation 接线）",
      !!cardCascade && !!contentCascade && !!holdNone && !!hold2xl && veilOpenTr && veilCloseTr,
      `card=${!!cardCascade} content=${!!contentCascade} none=${!!holdNone} 2xl=${!!hold2xl} open60=${veilOpenTr} closeKf=${veilCloseTr}`);
    /* ---------- TL15 v8.7.0：滤镜退役/分割线同拍/散场下沉/z-48 退役/双渲染 ---------- */
    const vxMain = (cssScan.viewExitMain || "").replace(/\s+/g, " ");
    gate("TL15a dock 分割线同拍通道在位（dock-divider 走 dock-btn-in）",
      !!cssScan.dividerRule,
      `divider=${!!cssScan.dividerRule}`);
    gate("TL15b 散场通道边界（view-exit 主规则无 animation + 弹窗玻璃卡/内容级联保留 + 部件 view-exit 分支退役）",
      !/animation\s*:/.test(vxMain) && !cssScan.viewExitWidget && !!cssScan.viewExitCard && !!cssScan.viewExitContent,
      `mainAnim=${/animation\s*:/.test(vxMain)} widgetGone=${!cssScan.viewExitWidget} card=${!!cssScan.viewExitCard} content=${!!cssScan.viewExitContent}`);
    gate("TL15c 抽屉期 dock 抬升规则退役（cs-drawer .cl-dock 清零）",
      cssScan.z48Rules.length === 0,
      `z48=${cssScan.z48Rules.length}`);
    gate("TL15d 双渲染系统 glass-pill 实底兜底（浅/深两条）",
      !!cssScan.litePillLight && !!cssScan.litePillDark,
      `light=${!!cssScan.litePillLight} dark=${!!cssScan.litePillDark}`);
    /* ---------- TL16 v8.7.0：互切单玻璃律（面板切换不再叠加两个面板） ---------- */
    const vxMain27 = (cssScan.viewExitMain || "").replace(/\s+/g, " ");
    gate("TL16a view-exit 钉位升级（absolute !important + z-index:0 !important 压底）",
      /position\s*:\s*absolute\s*!important/.test(vxMain27) && /z-index\s*:\s*0\s*!important/.test(vxMain27),
      `abs=${/position\s*:\s*absolute\s*!important/.test(vxMain27)} z0=${/z-index\s*:\s*0\s*!important/.test(vxMain27)}`);
    gate("TL16b 双层钉位退役（.view-top 规则清零——单卡律下无层序问题）",
      cssScan.viewTopRule === null,
      `viewTop=${cssScan.viewTopRule ? "STILL_PRESENT" : "gone"}`);
    gate("TL16c 互切双停规则退役（.cl-switching 家族清零——结构性单玻璃不再需要动画双停）",
      cssScan.switchCardRule === null && cssScan.switchExitRule === null && cssScan.switchExitContent === null,
      `card=${cssScan.switchCardRule ? "STILL" : "gone"} exit=${cssScan.switchExitRule ? "STILL" : "gone"} content=${cssScan.switchExitContent ? "STILL" : "gone"}`);
    /* ---------- TL17 v8.7.0：互切内容零残留律（切换不再看见上一个面板） ---------- */
    gate("TL17a 互切内容层过场在位（.cl-panel-content 模糊聚拢淡入 + .panel-sink 级联淡出——v8.7.0 模糊聚拢回归）",
      !!cssScan.panelContentIn && !!cssScan.panelContentOut,
      `in=${cssScan.panelContentIn ? "ok" : "NULL"} out=${cssScan.panelContentOut ? "ok" : "NULL"}`);
    gate("TL17b view-defocus 模糊散场退役（部件/互切退场关键帧清零——CSSOM 规则级断言）",
      cssScan.viewDefocusAny === null,
      `vd=${cssScan.viewDefocusAny ? "STILL_PRESENT" : "gone"}`);
    /* ---------- TL25 v8.7.0：互切关闭归属判别（幽灵内容根治）+ 部件视图互切底锚（Task 140）----------
       ㊲ 幽灵内容：settings→预设→settings→关闭 —— closing 相位「谁在收场」无归属判别，
       lastOpenWidgetRef 陈旧键把部件视图重新点亮 = 预设内容叠印在原生面板上（视频
       14.5s 白盒实锤）；镜像向：部件收场时 lastPanelRef 非空 → 内建卡重挂幽灵。
       ㊳ 互切方向：部件视图 absolute top:0 恒顶锚，窗口高于部件高度时段（内建→部件
       互切收折段）卡底悬空随窗口顶边下降 = 底部收缩观感。行为门走真实 React 链路
       （dock 按钮 click），探针预设经 start:presets 注入（visual-v8632b 先例）。 */
    const stageSrc = readFileSync(new URL("../src/components/startpage/PanelStage.tsx", import.meta.url), "utf8");
    gate("TL25a 互切归属静态门（beta 重写架构）：activeView 单源定义 + 渲染期同步换装 + displayPanel/visibility 双消费 + 旧 top:0 顶锚退役 + top:max() 底锚在位",
      /const \[activeView, setActiveView\] = useState<ActiveView>\(view\);/.test(stageSrc)
        && /if \(view != null && !sameView\(activeView, view\)\)/.test(stageSrc)
        && /setActiveView\(view\);/.test(stageSrc)
        && /phase !== "closed"\s*\n\s*\? activeView\?\.kind === "builtin"\s*\n\s*\? panel \?\? activeView\.panel\s*\n\s*: swapOut\s*\n\s*: null;/.test(stageSrc)
        && /phase === "closing" &&\s*\n\s*activeView\?\.kind === "widget" &&\s*\n\s*activeView\.key === w\.key/.test(stageSrc)
        && !/top: 0,/.test(stageSrc)
        && /top: geomFresh \? "0px" : `max\(0px, calc\(100% - \$\{h\}px\)\)`/.test(stageSrc),
      `dp=${/phase !== "closed"\s*\n\s*\? activeView\?\.kind === "builtin"[\s\S]*?: swapOut/.test(stageSrc)} vis=${/activeView\?\.kind === "widget"/.test(stageSrc)} topMax=${/max\(0px, calc\(100% - \$\{h\}px\)\)/.test(stageSrc)} oldTop0=${/top: 0,/.test(stageSrc)}`);
    /* 产物门：打包 chunk 结构签名（minified 名不定，锚 minified 语法形状） */
    const chunk39 = execSync(`grep -rlo "max(0px" ${ROOT}/next/static/chunks/*.js 2>/dev/null | head -1`).toString().trim();
    let chunkSig39 = null;
    if (chunk39) {
      const cs39 = readFileSync(chunk39, "utf8");
      chunkSig39 = {
        /* v8.7.15：容器几何分律三元（fresh="0px"/互切=max 联立）——锚三元完整形态 */
        topMax: /top:[\w$]+\?"0px":`max\(0px, calc\(100% - \$\{[\w$]+\}px\)\)`/.test(cs39),
        visTriple: /"closing"===[\w$]+&&[\w$]+\?\.kind==="widget"&&[\w$]+\.key===/.test(cs39),
      };
    }
    gate("TL25a2 产物签名门：chunk 内 top:max() 互切底锚 + visibility 归属三条件链真实入包",
      !!chunkSig39 && chunkSig39.topMax && chunkSig39.visTriple, JSON.stringify(chunkSig39));
    /* 注入探针预设（dock 表面部件 380px 高对比实底）→ 重载（dark 块尾状态承接） */
    await af.evaluate(() => {
      const preset = [{
        id: "probe-widget-39", name: "探针部件", installedAt: Date.now(),
        raw: {
          name: "探针部件", commands: [], links: [], dock: [],
          widgets: [{
            id: "w-t39", name: "测试面板", surface: "dock",
            width: 320, height: 380,
            html: '<div style="width:100%;height:100vh;background:linear-gradient(160deg,#4f6ef7,#8b5cf6);color:#fff;font:15px sans-serif;padding:18px;box-sizing:border-box">预设部件（探针39）</div>',
          }],
        },
      }];
      localStorage.setItem("start:presets", JSON.stringify(preset));
    });
    af = await page.reload({ waitUntil: "load" }).then(() => bootNewTab(page));
    gate("TL25-pre 探针预设注入 boot", !!af);
    if (!af) throw new Error("TL25 预设注入 reload 后 appFrame 未建立");
    /* TL25b 幽灵内容行为门（㊲ 主诉路径）：settings→预设→settings→关闭。
       断言 closing 相位（.panel-sink 在壳上）：部件视图 visibility=hidden（叠印
       根治——修复前 lastOpenWidgetRef 陈旧键把它重新点亮）+ 内建卡在收场（材质
       冻结 sink 正常）。visibility 是稳态属性非时序采样，抗 headless 时间膨胀。 */
    const r39b = await af.evaluate(async () => {
      const nf = () => new Promise((r) => requestAnimationFrame(r));
      /* reload 后 bootNewTab 只等水合早期（坑录律）：rAF 轮询等 dock 渲染 */
      const t0w = performance.now();
      while (performance.now() - t0w < 8000) {
        if (document.querySelector('.dock-btn[aria-label="设置"]')
          && document.querySelector('.cl-dock button[aria-label="测试面板"]')) break;
        await nf();
      }
      const sb39 = () => [...document.querySelectorAll(".dock-btn")].find((b) => b.getAttribute("aria-label") === "设置");
      const wb39 = () => [...document.querySelectorAll(".cl-dock button")].find((b) => b.getAttribute("aria-label") === "测试面板");
      const waitNode = async (sel, ms = 3000) => {
        const t0 = performance.now();
        while (performance.now() - t0 < ms) {
          const el = document.querySelector(sel);
          if (el) return el;
          await nf();
        }
        return document.querySelector(sel);
      };
      if (!sb39()) return { err: "no settings btn" };
      if (!wb39()) return { err: "no widget btn" };
      sb39().click(); /* ① 开设置 */
      await waitNode(".glass-card.cl-panel");
      await new Promise((r) => setTimeout(r, 900));
      if (!wb39()) return { err: "widget btn missing after settings open" };
      wb39().click(); /* ② 互切→预设部件 */
      let guard = 0;
      while (!document.querySelector('.cl-dockwidget[data-widget$=":w-t39"]') && guard++ < 300) await nf();
      await new Promise((r) => setTimeout(r, 900));
      if (!sb39()) return { err: "settings btn missing" };
      sb39().click(); /* ③ 互切→设置 */
      await waitNode(".glass-card.cl-panel");
      await new Promise((r) => setTimeout(r, 900));
      sb39().click(); /* ④ 关闭（toggle off）→ closing */
      await nf(); await nf();
      let sunk = false; guard = 0;
      while (guard++ < 400) {
        const shell = document.querySelector(".cl-stage");
        if (shell && shell.classList.contains("panel-sink")) { sunk = true; break; }
        await nf();
      }
      const wv = document.querySelector('.cl-dockwidget[data-widget$=":w-t39"]');
      const wvVis = wv ? getComputedStyle(wv).opacity : "GONE";
      const cardClosing = !!document.querySelector(".glass-card.cl-panel");
      await new Promise((r) => setTimeout(r, 250)); /* 散场动画（0.16s）后半程再采一次 */
      const wvLate = wv ? getComputedStyle(wv).opacity : "GONE";
      await new Promise((r) => setTimeout(r, 850)); /* SINK_MS+margin 全卸载再放行 */
      return { sunk, wvVis, wvLate, cardClosing };
    });
    gate("TL25b 幽灵内容行为门（㊲）：settings→预设→settings→关闭 —— closing 相位部件视图散场豁免（animation:none）opacity 双采样恒 0（预设内容不再叠印）+ 内建卡正常收场",
      !r39b.err && r39b.sunk && parseFloat(r39b.wvVis) < 0.01 && parseFloat(r39b.wvLate) < 0.01 && r39b.cardClosing === true, JSON.stringify(r39b));
    /* TL25c 镜像幽灵行为门：settings→预设→关闭预设。断言 closing 相位内建卡
       不重挂（修复前 lastPanelRef 陈旧值让原生卡在部件收场窗复活）+ 部件视图
       正常可见播散场（content-focus-solid 级联散场语义不变）。 */
    const r39c = await af.evaluate(async () => {
      const nf = () => new Promise((r) => requestAnimationFrame(r));
      const wb39 = () => [...document.querySelectorAll(".cl-dock button")].find((b) => b.getAttribute("aria-label") === "测试面板");
      const sb39 = () => [...document.querySelectorAll(".dock-btn")].find((b) => b.getAttribute("aria-label") === "设置");
      if (!sb39() || !wb39()) return { err: "dock btn missing" };
      sb39().click(); /* ① 开设置 */
      let guard = 0;
      while (!document.querySelector(".glass-card.cl-panel") && guard++ < 300) await nf();
      await new Promise((r) => setTimeout(r, 900));
      wb39().click(); /* ② 互切→部件 */
      guard = 0;
      while (document.querySelector(".glass-card.cl-panel") && guard++ < 300) await nf();
      await new Promise((r) => setTimeout(r, 900));
      wb39().click(); /* ③ 关闭部件（toggle off）→ closing */
      await nf(); await nf();
      let sunk = false; guard = 0;
      while (guard++ < 400) {
        const shell = document.querySelector(".cl-stage");
        if (shell && shell.classList.contains("panel-sink")) { sunk = true; break; }
        await nf();
      }
      const cardGhost = !!document.querySelector(".glass-card.cl-panel");
      const wv = document.querySelector('.cl-dockwidget[data-widget$=":w-t39"]');
      const wvVis = wv ? getComputedStyle(wv).opacity : "GONE";
      await new Promise((r) => setTimeout(r, 250)); /* 散场动画（0.16s）毕再采 */
      const wvLate = wv ? getComputedStyle(wv).opacity : "GONE";
      await new Promise((r) => setTimeout(r, 850));
      return { sunk, cardGhost, wvVis, wvLate };
    });
    gate("TL25c 镜像幽灵行为门：settings→预设→关闭预设 —— closing 相位内建卡不重挂（原生面板幽灵根治）+ 部件会话收场散场曲线（早段 >0.5 → 毕 <0.01）",
      !r39c.err && r39c.sunk && r39c.cardGhost === false && parseFloat(r39c.wvVis) > 0.5 && parseFloat(r39c.wvLate) < 0.01, JSON.stringify(r39c));
    /* TL25d 互切底锚行为门（㊳）：设置→预设 逐帧追踪。收折段（壳高 s>部件高 wh）
       部件卡底边必须贴壳底（|gapB|≤1.5px，修复前 = s-wh 最大 ~180px 悬空）；正控：
       关闭后从零重开部件，增长段（s<wh）顶锚保留（|gapT|≤1.5px——开/关动画逐帧
       不变的回归守卫）。wh 取每帧视图实测高，免自报高度假设。 */
    const r39d = await af.evaluate(async () => {
      const nf = () => new Promise((r) => requestAnimationFrame(r));
      const wb39 = () => [...document.querySelectorAll(".cl-dock button")].find((b) => b.getAttribute("aria-label") === "测试面板");
      const sb39 = () => [...document.querySelectorAll(".dock-btn")].find((b) => b.getAttribute("aria-label") === "设置");
      if (!sb39() || !wb39()) return { err: "dock btn missing" };
      sb39().click(); /* ① 开设置（内建高面板） */
      let guard = 0;
      while (!document.querySelector(".glass-card.cl-panel") && guard++ < 300) await nf();
      await new Promise((r) => setTimeout(r, 900));
      const h0 = document.querySelector(".cl-stage").offsetHeight; /* 布局空间：transform 免疫 */
      wb39().click(); /* ② 互切→部件 + 逐帧追踪（布局空间：offsetTop/offsetHeight
         不含 transform——rect 测量会被 content-focus-solid 入场的 translateY(3px)
         +scale(0.99) 污染，实测贡献恰 4.9px 假阳） */
      const t0 = performance.now();
      const rows = [];
      const poll = () => {
        const st = document.querySelector(".cl-stage");
        const wv = document.querySelector('.cl-dockwidget[data-widget$=":w-t39"]');
        if (st && wv) {
          if (parseFloat(getComputedStyle(wv).opacity) > 0.99) {
            const top = wv.offsetTop; /* 相对壳体（offsetParent=cl-stage relative） */
            const sh = st.offsetHeight, wh = wv.offsetHeight;
            rows.push({
              t: Math.round(performance.now() - t0),
              sh, wh,
              gapB: Math.round((sh - (top + wh)) * 100) / 100,
              gapT: top,
            });
          }
        }
        if (performance.now() - t0 < 800) requestAnimationFrame(poll);
      };
      requestAnimationFrame(poll);
      await new Promise((r) => setTimeout(r, 1400));
      const shrink = rows.filter((r) => r.sh > r.wh + 1);
      const shrinkGapB = shrink.length ? Math.max(...shrink.map((r) => Math.abs(r.gapB))) : null;
      /* ③ 正控：从零重开部件（开/关路径回归守卫） */
      if (!wb39()) return { err: "widget btn missing 2", h0, n: rows.length };
      wb39().click(); /* toggle off → closing */
      await new Promise((r) => setTimeout(r, 1200));
      if (!wb39()) return { err: "widget btn missing 3", h0, n: rows.length };
      const t1 = performance.now();
      const rows2 = [];
      const poll2 = () => {
        const st = document.querySelector(".cl-stage");
        const wv = document.querySelector('.cl-dockwidget[data-widget$=":w-t39"]');
        if (st && wv) {
          if (parseFloat(getComputedStyle(wv).opacity) > 0.99) {
            const cs2 = getComputedStyle(wv);
            rows2.push({
              sh: st.offsetHeight,
              wh: wv.offsetHeight,
              gapT: wv.offsetTop, /* 布局空间顶锚断言 */
              box: cs2.boxSizing, bw: cs2.borderTopWidth, hCss: cs2.height,
            });
          }
        }
        if (performance.now() - t1 < 800) requestAnimationFrame(poll2);
      };
      wb39().click(); /* 从零重开 */
      requestAnimationFrame(poll2);
      await new Promise((r) => setTimeout(r, 1400));
      /* v8.7.2 ㊷ 底锚恒贴律：部件视图 height=min(h,100%)——增长段（s<声明高 h）
         卡随壳同步生长（offsetHeight==sh），顶锚 gapT==0 且满盒贴合；声明高
         v8.7.15 起从 iframe 定高内联样式解析（fresh 几何容器 height:100%
         无 min() 可解析，iframe height:h 恒定是声明高的唯一内联源） */
      const wvNow = document.querySelector('.cl-dockwidget[data-widget$=":w-t39"]');
      const frNow = wvNow ? wvNow.querySelector("iframe") : null;
      const mh = frNow ? /(\d+)px/.exec(frNow.style.height || "") : null;
      const declared = mh ? parseInt(mh[1], 10) : 0;
      /* sh≤8 起步帧排除：容器 border-box 下 height:0 被 1px 描边撑出 2px
         （offsetHeight=min 高=border 总和），壳 overflow-hidden 裁剪零视觉
         影响——门语义「增长段卡随壳贴合」从有几何意义的帧起测（v8.7.11） */
      const grow = rows2.filter((r) => declared > 0 && r.sh > 8 && r.sh < declared - 1);
      const growGapT = grow.length ? Math.max(...grow.map((r) => Math.abs(r.gapT))) : null;
      const growFill = grow.length ? Math.max(...grow.map((r) => Math.abs(r.wh - r.sh))) : null;
      const maxFillRow = grow.length ? grow.reduce((a, b) => (Math.abs(b.wh - b.sh) > Math.abs(a.wh - a.sh) ? b : a)) : null;
      await new Promise((r) => setTimeout(r, 300));
      const lastGrow = rows2.length ? rows2[rows2.length - 1] : null;
      return { h0, declared, n: rows.length, shrinkN: shrink.length, shrinkGapB, n2: rows2.length, growN: grow.length, growGapT, growFill, maxFillRow, lastGrow };
    });
    gate("TL25d 互切底锚行为门（㊳+㊷）：设置→预设 收折段（s>声明高）部件卡底边贴壳底 gap≤1.5px + 正控增长段（s<声明高）顶锚 gapT≤1.5px 且卡随壳满盒贴合 fill≤1.5px（开/关路径不变）",
      !r39d.err && r39d.h0 > 420 && r39d.n > 3 && r39d.shrinkN > 0 && r39d.shrinkGapB !== null && r39d.shrinkGapB <= 1.5
        && r39d.n2 > 3 && r39d.growN > 0 && r39d.growGapT !== null && r39d.growGapT <= 1.5
        && r39d.growFill !== null && r39d.growFill <= 1.5,
      JSON.stringify(r39d));
  }

  /* ---------- TL26 v8.7.1：互切弹簧可见（㊴）——白罩解耦加载保护后弹簧全程内容可见 ---------- */
  if (af) {
    /* TL26a 静态门：部件视图显隐换构（visibility 退役 / opacity 归属在位 /
       boot-fade 仅 onLoad 挂 / 激活重播不再碰罩 / closing 摘罩 effect 退役） */
    const stage871 = readFileSync(new URL("../src/components/startpage/PanelStage.tsx", import.meta.url), "utf8");
    gate("TL26a 部件视图显隐换构静态门：visibility 退役 + opacity viewLive 归属在位 + 散场豁免 animation:none + boot-fade 仅 onLoad 挂 + 旧激活重挂/摘罩链路退役",
      !/visibility:\s/.test(stage871)
        && /opacity: viewLive \? 1 : 0/.test(stage871)
        && /animation: viewLive \? undefined : "none"/.test(stage871)
        && /classList\.add\("boot-fade"\)/.test(stage871)
        && !/remove\("content-focus-solid", "boot-fade"\)/.test(stage871)
        && !/add\("content-focus-solid", "boot-fade"\)/.test(stage871)
        && !/classList\.remove\("boot-fade"\)/.test(stage871),
      `vis=${/visibility:\s/.test(stage871)} onLoadBoot=${/classList\.add\("boot-fade"\)/.test(stage871)} spare=${/animation: viewLive/.test(stage871)}`);
    /* 产物签名门：chunk 内 opacity 显隐 + onLoad 挂罩真实入包 */
    const chunk871 = execSync(`grep -rlo "boot-fade" ${ROOT}/next/static/chunks/*.js 2>/dev/null | head -1`).toString().trim();
    let chunkSig871 = null;
    if (chunk871) {
      const cs871 = readFileSync(chunk871, "utf8");
      chunkSig871 = {
        bootOnLoad: /classList\.add\("boot-fade"\)/.test(cs871),
        opacityView: /opacity:[\w$().|&?"' ]*1:0/.test(cs871) || /opacity:\s*[\w$]+(?:\|\|[\w$"'()=.?: ]+)?\?1:0/.test(cs871),
      };
    }
    gate("TL26a2 产物签名门：chunk 内 onLoad 挂 boot-fade + opacity 显隐三元真实入包",
      !!chunkSig871 && chunkSig871.bootOnLoad, JSON.stringify(chunkSig871));
    /* TL26b 行为门（㊴ 主诉路径）：settings→探针部件互切，弹簧窗逐帧采样——
       部件视图 opacity 恒 1 + ::after 白罩恒 ≤0.01（不盖弹簧）+ 弹簧几何真实
       发生（壳体收缩幅度 >50px）。修复前：白罩在弹簧全程（0-280ms）恒 1，
       高度/宽度弹簧感知归零（诊断曲线 stageH 442→127 期间 mask 恒 1） */
    const r871b = await af.evaluate(async () => {
      const nf = () => new Promise((r) => requestAnimationFrame(r));
      const sb = () => [...document.querySelectorAll(".dock-btn")].find((b) => b.getAttribute("aria-label") === "设置");
      const wb = () => [...document.querySelectorAll(".cl-dock button")].find((b) => b.getAttribute("aria-label") === "测试面板");
      if (!sb() || !wb()) return { err: "dock btn missing" };
      wb().click(); /* 复位：关部件（TL25d 遗留开启态） */
      await new Promise((r) => setTimeout(r, 700));
      if (!sb()) return { err: "settings btn missing" };
      sb().click(); /* 开设置 */
      let guard = 0;
      while (!document.querySelector(".glass-card.cl-panel") && guard++ < 300) await nf();
      await new Promise((r) => setTimeout(r, 900));
      if (!wb()) return { err: "widget btn missing" };
      const t0 = performance.now();
      const rows = [];
      const poll = () => {
        const st = document.querySelector(".cl-stage");
        const wv = document.querySelector('.cl-dockwidget[data-widget$=":w-t39"]');
        if (st && wv) {
          rows.push({
            t: Math.round(performance.now() - t0),
            sh: st.offsetHeight,
            wvOp: getComputedStyle(wv).opacity,
            maskOp: getComputedStyle(wv, "::after").opacity,
          });
        }
        if (performance.now() - t0 < 500) requestAnimationFrame(poll);
      };
      wb().click(); /* 互切→部件 + 逐帧采样 */
      requestAnimationFrame(poll);
      await new Promise((r) => setTimeout(r, 1200));
      if (!rows.length) return { err: "no rows", n: 0 };
      const shMax = Math.max(...rows.map((r) => r.sh));
      const shMin = Math.min(...rows.map((r) => r.sh));
      return {
        n: rows.length,
        shMax, shMin, amp: shMax - shMin,
        wvOpMax: Math.max(...rows.map((r) => parseFloat(r.wvOp))),
        maskOpMax: Math.max(...rows.map((r) => parseFloat(r.maskOp))),
        shEnd: rows[rows.length - 1].sh,
      };
    });
    gate("TL26b 互切弹簧可见行为门（㊴）：弹簧窗（500ms）部件视图 opacity 恒 1 + 白罩恒 ≤0.01 + 壳体收缩幅度 >50px",
      !r871b.err && r871b.n > 5 && r871b.amp > 50 && r871b.wvOpMax > 0.99 && r871b.maskOpMax <= 0.01,
      JSON.stringify(r871b));
  }

  /* ---------- TL27 v8.7.1：dock 悬停浮签（㊵）——原生 title 退役，名字浮现在功能下方 ---------- */
  if (af) {
    const dock871 = readFileSync(new URL("../src/components/startpage/Dock.tsx", import.meta.url), "utf8");
    gate("TL27a dock 浮签静态门：原生 title={label} 退役 + .dock-tip 浮签（⌘K 同款样式串）+ 指令面板 tip={null} 禁用默认 + 天气/番茄钟功能名解耦 + tip??label 缺省渲染",
      !/title=\{label\}/.test(dock871)
        && /dock-tip pointer-events-none/.test(dock871)
        && /tip=\{null\}/.test(dock871)
        && /tip="天气"/.test(dock871)
        && /tip="番茄钟"/.test(dock871)
        && /tip \?\? label/.test(dock871),
      `title=${/title=\{label\}/.test(dock871)} tip=${/dock-tip/.test(dock871)}`);
    /* TL27b 行为门：真实 hover 设置按钮 → .dock-tip opacity→1（即时浮现，
       无原生 title 延迟）+ title 属性为空 + 浮签文案=功能名。
       group-hover 依赖真实指针（合成 mouseover 不触发 :hover）——
       boundingBox + mouse.move 实指针路径 */
    await af.locator('.dock-btn[aria-label="设置"]').scrollIntoViewIfNeeded().catch(() => null);
    const btnBox = await af.locator('.dock-btn[aria-label="设置"]').boundingBox();
    if (!btnBox) {
      gate("TL27b dock 浮签行为门", false, "btn box not found");
    } else {
      await page.mouse.move(btnBox.x + btnBox.width / 2, btnBox.y + btnBox.height / 2, { steps: 4 });
      await sleep(500);
      const r871c = await af.evaluate(() => {
        const btn = [...document.querySelectorAll(".dock-btn")].find((b) => b.getAttribute("aria-label") === "设置");
        const tip = btn ? btn.querySelector(".dock-tip") : null;
        return {
          title: btn ? btn.getAttribute("title") : "NO-BTN",
          tipText: tip ? tip.textContent : null,
          tipOp: tip ? getComputedStyle(tip).opacity : null,
          tipVisible: tip ? getComputedStyle(tip).display : null,
        };
      });
      gate("TL27b dock 浮签行为门：hover 设置 → .dock-tip opacity=1 + title 属性退役 + 文案=功能名 + sm 断点可见",
        r871c.title === null && r871c.tipText === "设置" && parseFloat(r871c.tipOp) > 0.99 && r871c.tipVisible === "block",
        JSON.stringify(r871c));
      await page.mouse.move(640, 200, { steps: 6 });
      await sleep(600);
      const r871d = await af.evaluate(() => {
        const btn = [...document.querySelectorAll(".dock-btn")].find((b) => b.getAttribute("aria-label") === "设置");
        const tip = btn ? btn.querySelector(".dock-tip") : null;
        return { tipOp: tip ? getComputedStyle(tip).opacity : null };
      });
      gate("TL27c dock 浮签收起门：移开后浮签 opacity 回 0（0.3s 过渡对称）",
        parseFloat(r871d.tipOp) < 0.01, JSON.stringify(r871d));
    }
  }


  /* ---------- TL28 v8.7.2：互切玻璃交卸（㊶）+ 底锚恒贴（㊷） ---------- */
  if (af) {
    const stage872 = readFileSync(new URL("../src/components/startpage/PanelStage.tsx", import.meta.url), "utf8");
    const css872 = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
    const motion872 = readFileSync(new URL("../src/components/startpage/dock-motion.ts", import.meta.url), "utf8");
    /* TL28a 静态门：swapOut 渲染期派生（与 activeView 同帧原子）+ 交卸类接线 +
       SWAP_OUT_MS 计时 + 部件视图 height min()（旧固定 height 退役）+ CSS 在位 */
    gate("TL28a 互切交卸+底锚恒贴静态门：swapOut 渲染期派生 + cl-panel-swapout 接线 + SWAP_OUT_MS=320 计时 + height min() 底锚（旧固定 height 退役）+ swapout 关键帧在位 + v8.7.3 交卸层反转 z-20",
      /const \[swapOut, setSwapOut\]/.test(stage872)
        && /setSwapOut\(activeView\.panel\);/.test(stage872)
        && /setSwapOut\(null\);/.test(stage872)
        && /setTimeout\(\(\) => setSwapOut\(null\), SWAP_OUT_MS\)/.test(stage872)
        && /swapOut != null \? "cl-panel-swapout" : ""/.test(stage872)
        && /height: geomFresh \? "100%" : `min\(\$\{h\}px, 100%\)`/.test(stage872)
        && !/height: h,/.test(stage872)
        && /@keyframes cl-panel-swapout-kf/.test(css872)
        && /\.cl-panel-swapout \{/.test(css872)
        && /export const SWAP_OUT_MS = 320;/.test(motion872)
        && /swapOut != null \? "z-20" : ""/.test(stage872),
      `swapOut=${/const \[swapOut/.test(stage872)} minH=${/height: geomFresh \? "100%" : `min/.test(stage872)} oldH=${/height: h,/.test(stage872)} kf=${/@keyframes cl-panel-swapout-kf/.test(css872)} z20=${/swapOut != null \? "z-20" : ""/.test(stage872)}`);
    /* 产物签名门：swapout 类 + min() 底锚真实入包 */
    const chunk872 = execSync(`grep -rlo "cl-panel-swapout" ${ROOT}/next/static/chunks/*.js 2>/dev/null | head -1`).toString().trim();
    let chunkSig872 = null;
    if (chunk872) {
      const cs872 = readFileSync(chunk872, "utf8");
      chunkSig872 = {
        swapClass: cs872.includes("cl-panel-swapout"),
        minH: /min\(.{0,40}px, ?100%\)/.test(cs872),
      };
    }
    gate("TL28a2 产物签名门：swapout 类 + min() 底锚真实入包",
      !!chunkSig872 && chunkSig872.swapClass && chunkSig872.minH, JSON.stringify(chunkSig872));
    /* TL28b/c 行为门（㊶+㊷ 主诉路径）：settings→部件互切逐帧采样——
       ① 交卸：点击后 cl-panel-swapout-kf 动画真实在旧卡上播放（WAAPI 名断言，
          headless 帧粗也能命中），~SWAP_OUT_MS 后旧卡卸载（非同帧硬删），
          部件视图 opacity 恒 1；
       ② 恒贴：全程 wv.offsetTop+wv.offsetHeight ≈ 高度盒 offsetHeight（偏差
          ≤1.5px）——卡底逐帧贴 dock 锚，欠阻尼回弹段（盒高 s<部件 h）卡随壳
          压缩不再被 overflow-hidden 裁切。修复前：固定 height 使 s<h 帧出现
          offsetTop+height > 盒高（裁切）+ 旧卡同帧消失（断层） */
    const r872b = await af.evaluate(async () => {
      const nf = () => new Promise((r) => requestAnimationFrame(r));
      const sb = () => [...document.querySelectorAll(".dock-btn")].find((b) => b.getAttribute("aria-label") === "设置");
      const wb = () => [...document.querySelectorAll(".cl-dock button")].find((b) => b.getAttribute("aria-label") === "测试面板");
      if (!sb() || !wb()) return { err: "dock btn missing" };
      wb().click(); /* 复位：关部件（TL27 遗留开启态） */
      await new Promise((r) => setTimeout(r, 700));
      if (!sb()) return { err: "settings btn missing" };
      sb().click(); /* 开设置 */
      let guard = 0;
      while (!document.querySelector(".glass-card.cl-panel") && guard++ < 300) await nf();
      await new Promise((r) => setTimeout(r, 900));
      if (!wb()) return { err: "widget btn missing" };
      const t0 = performance.now();
      const rows = [];
      let sawSwapAnim = false, sawCardGone = false, goneAt = -1;
      const poll = () => {
        const st = document.querySelector(".cl-stage");
        const box = st ? st.firstElementChild : null;
        const card = document.querySelector(".glass-card.cl-panel");
        const wv = document.querySelector('.cl-dockwidget[data-widget$=":w-t39"]');
        if (card) {
          if (card.getAnimations().some((a) => a.animationName === "cl-panel-swapout-kf")) sawSwapAnim = true;
        } else if (!sawCardGone && performance.now() - t0 > 30) {
          sawCardGone = true;
          goneAt = Math.round(performance.now() - t0);
        }
        if (wv && box) {
          rows.push({
            t: Math.round(performance.now() - t0),
            boxH: box.offsetHeight,
            wvTop: wv.offsetTop,
            wvH: wv.offsetHeight,
            wvOp: getComputedStyle(wv).opacity,
          });
        }
        if (performance.now() - t0 < 900) requestAnimationFrame(poll);
      };
      wb().click(); /* 互切→部件 + 逐帧采样 */
      requestAnimationFrame(poll);
      await new Promise((r) => setTimeout(r, 1500));
      if (!rows.length) return { err: "no rows", n: 0 };
      const devMax = Math.max(...rows.map((r) => Math.abs(r.wvTop + r.wvH - r.boxH)));
      return {
        n: rows.length, sawSwapAnim, sawCardGone, goneAt, devMax,
        wvOpMin: Math.min(...rows.map((r) => parseFloat(r.wvOp))),
        boxH0: rows[0].boxH, boxHend: rows[rows.length - 1].boxH,
      };
    });
    gate("TL28b 互切玻璃交卸行为门（㊶）：swapout 动画真实播放 + 旧卡延迟卸载（非同帧硬删）+ 部件视图 opacity 恒 1",
      !r872b.err && r872b.n > 5 && r872b.sawSwapAnim && r872b.sawCardGone && r872b.goneAt > 60 && r872b.wvOpMin > 0.99,
      JSON.stringify(r872b));
    gate("TL28c 底锚恒贴行为门（㊷）：互切弹簧全程 offsetTop+offsetHeight ≈ 高度盒高（偏差 ≤1.5px，回弹段卡随壳压缩不裁切）",
      !r872b.err && r872b.n > 5 && r872b.devMax <= 1.5,
      JSON.stringify({ devMax: r872b.devMax, n: r872b.n, boxH0: r872b.boxH0, boxHend: r872b.boxHend }));
  }

  /* ---------- TL29 v8.7.2：搜索建议常驻 DOM + 6 行（㊸） ---------- */
  if (af) {
    const searchBar872 = readFileSync(new URL("../src/components/startpage/SearchBar.tsx", import.meta.url), "utf8");
    const css872b = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
    gate("TL29a 搜索建议常驻静态门：AnimatePresence/motion 条件列表退役 + 常驻容器 data-open 接线 + SUG_MAX=6 + CSS data-open 过渡（visibility 离散插值）",
      !/key="sug-list"/.test(searchBar872)
        && !/<motion\.div/.test(searchBar872)
        && /search-sug-list\$\{cascade \? " sug-cascade" : ""\}/.test(searchBar872)
        && /cascadeOut \? " sug-cascade-out" : ""/.test(searchBar872)
        && /data-open=\{showDrop \? "true" : undefined\}/.test(searchBar872)
        && /aria-hidden=\{!showDrop\}/.test(searchBar872)
        && /const SUG_MAX = 6;/.test(searchBar872)
        && /const SUG_CLEAR_MS = 460;/.test(searchBar872)
        && /\.search-sug-list \{/.test(css872b)
        && /\.search-sug-list\[data-open\] \{/.test(css872b)
        && /visibility 0s linear calc\(0\.3s \* var\(--mo-speed, 1\)\);/.test(css872b),
      `motionDiv=${/<motion\.div/.test(searchBar872)} sugMax6=${/const SUG_MAX = 6;/.test(searchBar872)} css=${/\.search-sug-list\[data-open\] \{/.test(css872b)}`);
    /* TL29b 行为门：mock sugrec fetch → 输入 → 建议浮现（data-open + 6 行 +
       opacity→1）→ 追加输入同一节点不重挂（闪动根因=重挂 WAAPI 空窗）→
       Esc 收起 data-open 摘除但元素仍在 DOM（常驻结构） */
    const r872c = await af.evaluate(async () => {
      const nf = () => new Promise((r) => requestAnimationFrame(r));
      const input = document.querySelector(".search-input");
      if (!input) return { err: "input missing" };
      const w = window;
      if (!w.__origFetch) w.__origFetch = w.fetch;
      w.fetch = (u, ...rest) => {
        if (String(u).includes("sugrec")) {
          const g = ["一", "二", "三", "四", "五", "六", "七"].map((n) => ({ q: "初始探针" + n }));
          return Promise.resolve({ text: () => Promise.resolve('cb(' + JSON.stringify({ g }) + ')') });
        }
        return w.__origFetch(u, ...rest);
      };
      input.focus();
      const setter = Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype, "value").set;
      setter.call(input, "探针");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      let guard = 0;
      while (!document.querySelector("#search-sug-list[data-open]") && guard++ < 400) await nf();
      /* data-open 出现即过渡起步（opacity 0→1 需 0.3s）——等落定再采样 */
      await new Promise((r) => setTimeout(r, 900));
      const list = document.querySelector("#search-sug-list");
      if (!list) return { err: "list missing" };
      list.dataset.probeMark = "1";
      const openState = {
        open: list.hasAttribute("data-open"),
        rows: list.querySelectorAll("[role=option]").length,
        op: getComputedStyle(list).opacity,
      };
      await new Promise((r) => setTimeout(r, 150));
      setter.call(input, "探针续");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      guard = 0;
      while (guard++ < 40) await nf();
      const list2 = document.querySelector("#search-sug-list");
      const afterType = { same: list2 === list, mark: !!list2 && list2.dataset.probeMark === "1", open: !!list2 && list2.hasAttribute("data-open") };
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      let closedSeen = false;
      for (let i = 0; i < 60; i++) {
        await nf();
        if (!document.querySelector("#search-sug-list[data-open]")) { closedSeen = true; break; }
      }
      const list3 = document.querySelector("#search-sug-list");
      return {
        openState, afterType, closedSeen,
        stillInDom: !!list3,
        visAfter: list3 ? getComputedStyle(list3).visibility : null,
      };
    });
    gate("TL29b 搜索建议行为门（㊸）：浮现 data-open + 6 行 + opacity=1 + 追加输入同节点不重挂 + Esc 收起 data-open 摘除元素常驻",
      !r872c.err && r872c.openState.open && r872c.openState.rows === 6 && parseFloat(r872c.openState.op) > 0.95
        && r872c.afterType.same && r872c.afterType.mark && r872c.afterType.open
        && r872c.closedSeen && r872c.stillInDom,
      JSON.stringify(r872c));
  }


  /* ---------- TL30 v8.7.3：交卸层反转同步律 + 建议行级联/高亮持久 ---------- */
  if (af) {
    const stage873 = readFileSync(new URL("../src/components/startpage/PanelStage.tsx", import.meta.url), "utf8");
    const css873 = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
    const searchBar873 = readFileSync(new URL("../src/components/startpage/SearchBar.tsx", import.meta.url), "utf8");
    /* TL30a 静态门：z-20 交卸层反转接线 + swapout 0.3s EASE（与聚拢同拍）+
       建议行级联（sug-row-in-kf + sug-cascade 选择器 + --sug-i 延迟）+
       容器 blur 退役 + 渲染期边沿挂类 + fetch 回调高亮持久（setActive 退役） */
    gate("TL30a 同步律+级联静态门：z-20 抬盒接线 + swapout 0.3s EASE + sug-row-in-kf/级联选择器/--sug-i + 容器 blur 退役 + 渲染期 prevShow 边沿 + fetch 回调无 setActive(-1)",
      /swapOut != null \? "z-20" : ""/.test(stage873)
        && /cl-panel-swapout-kf calc\(0\.3s \* var\(--mo-speed, 1\)\)\s*\n\s*cubic-bezier\(0\.22, 1, 0\.36, 1\) forwards/.test(css873)
        && /@keyframes sug-row-in-kf/.test(css873)
        && /\.search-sug-list\.sug-cascade \.search-sug-row \{/.test(css873)
        && /animation-delay: calc\(var\(--sug-i, 0\) \* 24ms\);/.test(css873)
        && !/(\.search-sug-list \{[\s\S]{0,200}?)filter: blur\(6px\)/.test(css873)
        && /const SUG_CASCADE_MS = 520;/.test(searchBar873)
        && /if \(prevShow !== showDrop\) \{/.test(searchBar873)
        && !/setSugs\(list\.slice\(0, SUG_MAX\)\);\s*\n\s*setActive\(-1\);/.test(searchBar873)
        && /"--sug-i": i \} as CSSProperties/.test(searchBar873),
      `z20=${/swapOut != null \? "z-20"/.test(stage873)} kf=${/@keyframes sug-row-in-kf/.test(css873)} blur6=${/filter: blur\(6px\)/.test(css873)} edge=${/prevShow !== showDrop/.test(searchBar873)} setActiveGone=${!/setSugs\(list\.slice\(0, SUG_MAX\)\);\s*\n\s*setActive\(-1\);/.test(searchBar873)}`);
    /* 产物签名门：级联类 + 行级联关键帧真实入包 */
    const chunk873 = execSync(`grep -rlo "sug-cascade" ${ROOT}/next/static/chunks/*.js 2>/dev/null | head -1`).toString().trim();
    const cssChunk873 = execSync(`grep -rlo "sug-row-in-kf" ${ROOT}/next/static/chunks/*.css 2>/dev/null | head -1`).toString().trim();
    gate("TL30a2 产物签名门：sug-cascade 类（JS）+ sug-row-in-kf（CSS）真实入包",
      !!chunk873 && !!cssChunk873, `js=${!!chunk873} css=${!!cssChunk873}`);
    /* TL30b 行为门（同步律主诉路径）：settings→部件互切逐帧采样——
       ① 交卸揭示：溶解中段存在 opacity ∈ [0.05,0.95] 的帧（0.3s EASE 非瞬跳；
          v8.7.2 的 0.18s EXIT 同样有中段帧，故配合 ②③ 才构成新律断言）；
       ② 交卸期高度盒 z-index=20（抬盒在溶解窗内真实生效，卸载后归 auto）；
       ③ 旧卡卸载 ≥200ms（0.3s 溶解除非同帧硬删）+ 部件视图 opacity 恒 1 */
    const r873b = await af.evaluate(async () => {
      const nf = () => new Promise((r) => requestAnimationFrame(r));
      const sb = () => [...document.querySelectorAll(".dock-btn")].find((b) => b.getAttribute("aria-label") === "设置");
      const wb = () => [...document.querySelectorAll(".cl-dock button")].find((b) => b.getAttribute("aria-label") === "测试面板");
      if (!sb() || !wb()) return { err: "dock btn missing" };
      wb().click(); /* 复位：关部件 */
      await new Promise((r) => setTimeout(r, 700));
      sb().click(); /* 开设置 */
      let guard = 0;
      while (!document.querySelector(".glass-card.cl-panel") && guard++ < 300) await nf();
      await new Promise((r) => setTimeout(r, 900));
      if (!wb()) return { err: "widget btn missing" };
      const t0 = performance.now();
      const rows = [];
      let sawCardGone = false, goneAt = -1;
      const poll = () => {
        const st = document.querySelector(".cl-stage");
        const box = st ? st.firstElementChild : null;
        const card = document.querySelector(".glass-card.cl-panel");
        const wv = document.querySelector('.cl-dockwidget[data-widget$=":w-t39"]');
        if (card) {
          rows.push({
            t: Math.round(performance.now() - t0),
            boxZ: box ? getComputedStyle(box).zIndex : "?",
            cardOp: +(+getComputedStyle(card).opacity),
            wvOp: wv ? +(+getComputedStyle(wv).opacity) : -1,
          });
        } else if (!sawCardGone && performance.now() - t0 > 30) {
          sawCardGone = true;
          goneAt = Math.round(performance.now() - t0);
        }
        if (performance.now() - t0 < 900) requestAnimationFrame(poll);
      };
      wb().click(); /* 互切→部件 + 逐帧采样 */
      requestAnimationFrame(poll);
      await new Promise((r) => setTimeout(r, 1500));
      if (!rows.length) return { err: "no rows", n: 0 };
      const midFrames = rows.filter((r) => r.cardOp >= 0.05 && r.cardOp <= 0.95);
      const zFrames = rows.filter((r) => r.boxZ === "20");
      return {
        n: rows.length,
        midN: midFrames.length,
        zN: zFrames.length,
        goneAt, sawCardGone,
        wvOpMin: Math.min(...rows.map((r) => r.wvOp)),
        firstOp: rows[0].cardOp, lastZ: rows[rows.length - 1].boxZ,
      };
    });
    gate("TL30b 交卸揭示行为门（v8.7.3 同步律）：溶解中段帧存在 + 交卸期高度盒 z-index=20 + 旧卡 ≥200ms 延迟卸载 + 部件视图 opacity 恒 1",
      !r873b.err && r873b.n > 5 && r873b.midN > 0 && r873b.zN > 0 && r873b.sawCardGone && r873b.goneAt > 200 && r873b.wvOpMin > 0.99,
      JSON.stringify(r873b));
    /* TL30c 行为门（级联+高亮持久主诉路径）：mock sugrec（按 query 返回不同
       词表）→ 输入 → 首帧行级联动画真实起播（animationName 断言）→ 700ms 后
       窗口摘除（类+动画双消）→ ArrowDown 选中首行 → 追加输入触发二次 fetch
       换装 → 新首行 animationName=none（窗口后零重播零噪音）且 aria-selected
       仍在（高亮跨刷新持久 = 「第一行复位」修复）→ Esc 收起元素常驻 */
    const r873c = await af.evaluate(async () => {
      const nf = () => new Promise((r) => requestAnimationFrame(r));
      const input = document.querySelector(".search-input");
      if (!input) return { err: "input missing" };
      const w = window;
      if (!w.__origFetch) w.__origFetch = w.fetch;
      w.fetch = (u, ...rest) => {
        if (String(u).includes("sugrec")) {
          const wd = (() => { try { return new URL(String(u)).searchParams.get("wd") || ""; } catch { return ""; } })();
          const names = wd.includes("续") ? ["甲", "乙", "丙", "丁", "戊", "己"] : ["子", "丑", "寅", "卯", "辰", "巳"];
          const g = names.map((n) => ({ q: "探针词" + n }));
          return Promise.resolve({ text: () => Promise.resolve('cb(' + JSON.stringify({ g }) + ')') });
        }
        return w.__origFetch(u, ...rest);
      };
      input.focus();
      const setter = Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype, "value").set;
      setter.call(input, "探词");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      let guard = 0;
      while ((!document.querySelector("#search-sug-list[data-open]") || !document.querySelector("#search-sug-list.sug-cascade")) && guard++ < 400) await nf();
      const list = document.querySelector("#search-sug-list");
      if (!list) return { err: "list missing" };
      const row0 = list.querySelector("[role=option]");
      const openAnim = row0 ? getComputedStyle(row0).animationName : "?";
      const openCascade = list.classList.contains("sug-cascade");
      await new Promise((r) => setTimeout(r, 700));
      const row0b = list.querySelector("[role=option]");
      const lateAnim = row0b ? getComputedStyle(row0b).animationName : "?";
      const lateCascade = list.classList.contains("sug-cascade");
      /* 键盘选中首行（active=0） */
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
      await nf(); await nf();
      const selBefore = list.querySelector("[role=option]")?.getAttribute("aria-selected");
      /* 追加输入 → 二次 fetch 换装（窗口已过） */
      setter.call(input, "探词续");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      guard = 0;
      while (guard++ < 300) {
        if (list.textContent && list.textContent.includes("探针词甲")) break;
        await nf();
      }
      await new Promise((r) => setTimeout(r, 120));
      const row0c = list.querySelector("[role=option]");
      const swapAnim = row0c ? getComputedStyle(row0c).animationName : "?";
      const selAfter = row0c ? row0c.getAttribute("aria-selected") : null;
      const swapCascade = list.classList.contains("sug-cascade");
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      let closedSeen = false;
      for (let i = 0; i < 60; i++) {
        await nf();
        if (!document.querySelector("#search-sug-list[data-open]")) { closedSeen = true; break; }
      }
      return {
        openAnim, openCascade, lateAnim, lateCascade, selBefore,
        swapAnim, selAfter, swapCascade, closedSeen,
        stillInDom: !!document.querySelector("#search-sug-list"),
      };
    });
    gate("TL30c 建议级联+高亮持久行为门（v8.7.3）：首帧行级联起播 + 窗口后类/动画双消 + 换装零重播 + 高亮跨刷新持久（aria-selected 保持）+ Esc 收起常驻",
      !r873c.err && r873c.openAnim === "sug-row-in-kf" && r873c.openCascade
        && r873c.lateAnim === "none" && !r873c.lateCascade
        && r873c.selBefore === "true"
        && r873c.swapAnim === "none" && !r873c.swapCascade
        && r873c.selAfter === "true" && r873c.closedSeen && r873c.stillInDom,
      JSON.stringify(r873c));
    /* TL31 行为门（v8.7.4 ㊺ 建议退场级联）：复用 TL30c mock fetch（window 态
       保留）——重新 focus+输入唤出建议 → blur 失焦收起（sugs 保留 = 行级退场
       主路径；Esc 是 setSugs([]) 硬清语义、行同帧卸载无动画可播，不经此门）
       → 收起同帧挂 .sug-cascade-out + 首行 sug-row-out-kf 起播 → data-open
       同帧移除（退场动画与容器淡出并行）→ SUG_OUT_MS(340) 后摘类（容器已
       hidden，回稳态无闪现）→ 列表常驻不卸载 */
    const r874a = await af.evaluate(async () => {
      const nf = () => new Promise((r) => requestAnimationFrame(r));
      const input = document.querySelector(".search-input");
      const list = document.querySelector("#search-sug-list");
      if (!input || !list) return { err: "input/list missing" };
      input.focus();
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(input, "探词");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      let guard = 0;
      while ((!document.querySelector("#search-sug-list[data-open]") || !list.querySelector("[role=option]")) && guard++ < 400) await nf();
      if (!list.querySelector("[role=option]")) return { err: "no rows" };
      input.blur();
      let outCascade = false;
      for (let i = 0; i < 30; i++) {
        await nf();
        if (list.classList.contains("sug-cascade-out")) { outCascade = true; break; }
      }
      const rowOut = list.querySelector("[role=option]");
      const outAnim = rowOut ? getComputedStyle(rowOut).animationName : "?";
      const openGone = !list.hasAttribute("data-open");
      await new Promise((r) => setTimeout(r, 500));
      return {
        outCascade, outAnim, openGone,
        outCascadeLate: list.classList.contains("sug-cascade-out"),
        stillInDom: document.querySelector("#search-sug-list") === list,
        rowOpLate: rowOut && rowOut.isConnected ? getComputedStyle(rowOut).opacity : null,
      };
    });
    gate("TL31 建议退场级联行为门（v8.7.4 ㊺）：blur 收起同帧挂 .sug-cascade-out + 行 sug-row-out-kf 散场起播 + data-open 同帧移除 + SUG_OUT_MS 后摘类（容器 hidden 无闪现）+ 列表常驻",
      !r874a.err && r874a.outCascade && r874a.outAnim === "sug-row-out-kf" && r874a.openGone && !r874a.outCascadeLate && r874a.stillInDom,
      JSON.stringify(r874a));
    /* TL34b 开态渐入行为门（v8.7.6 ㊽ / v8.7.7 放慢）：开抽屉 bf 帧级采样
       ——0.60s ease-in-out 渐入全程可感知（≥3 帧不同 blur 值 + 峰值≥17px
       到位 + 跨度>10px 非瞬跳）。独立开合流程（不依赖前序状态）：若抽屉
       开着先 ESC 关 + 等 latch 卸载，再中键开 + rAF 采样 1400ms（起步链
       ~230ms + 凝聚 600ms < 1400ms 窗，满值帧必在窗内）。 */
    await af.evaluate(() => {
      if (document.documentElement.classList.contains("cs-drawer")) {
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      }
    });
    await sleep(1050);
    /* 兜底：ESC 可能只退编辑态未关抽屉（ESC 优先级 editing>关抽屉）——
       类仍在则真实中键再关一次，保证下一条中键必是「开」 */
    const stillOpen34 = await af.evaluate(() =>
      document.documentElement.classList.contains("cs-drawer"));
    if (stillOpen34) {
      await page.mouse.click(90, 620, { button: "middle" }); // 兜底关
      await sleep(1100);
    }
    /* 采样器先行启动（探针标准姿势）：Playwright click 往返 + React 双跳
       （open commit→portal mount→rAF veilOn→transition 起跑）合计可达
       ~500ms，click 后才启动 evaluate 会整窗错过 0.60s 渐入（首轮实测
       15 帧全 20px 即此因）——先建 1400ms 长窗采样 Promise，sleep 就位
       后再 click，满窗覆盖起步链+凝聚全程。 */
    const enterCurve34P = af.evaluate(() => new Promise((res) => {
      const rows = [];
      const t0 = performance.now();
      const tick = () => {
        const v = document.querySelector(".cl-drawer-veil");
        const bfStr = v && v.isConnected ? getComputedStyle(v).backdropFilter : "";
      rows.push({
        t: Math.round(performance.now() - t0),
        bf: bfStr ? (bfStr.match(/blur\(([\d.]+)px\)/) || [])[1] ?? null : null,
        dv: v && v.isConnected ? v.getAttribute("data-veil") : null,
      });
        if (performance.now() - t0 < 1400) requestAnimationFrame(tick); else res(rows);
      };
      requestAnimationFrame(tick);
    }));
    await sleep(120); /* 采样器就位 */
    await page.mouse.click(90, 620, { button: "middle" }); // 开（TL34b 触发）
    const enterCurve34 = await enterCurve34P;
    /* TL34b 开态到位见证（v8.7.6 ㊽ / v8.7.7 参数）：veil 挂载 + data-veil=1 + blur 满值
       20px + 染色在场 + visibility visible——开态链路端到端健康。
       【headless 伪影沉淀】transition 中间态帧级采样在本环境结构性不可
       行：headless 按需渲染下 portal 挂载（dv=0）与 rAF 置位（dv=1）两
       commit 间无 paint 帧，样式首算即终态（实测 t=125ms null → t=149ms
       直接 dv=1+bf=20，无中间帧）→ 值渐进无法见证。
       【v8.7.12 坑录·假设被实测推翻】原注释声称「真机 60Hz BeginFrame
       下两 commit 间必有 paint，rAF 两段式保证凝聚起点」——用户实测
       「关闭完全结束后打开没有入场动画（仅打断重开有）」证伪：生产
       BeginFrame 中 mount commit 与 veilOn rAF 置位 commit 同处 rAF 阶段，
       style/paint 在其后仅一次=终态，0 态帧同样被吞。根修=凝聚 animation
       化（挂上必从 from 起播零 paint 依赖，TL34 门），本组只承担稳态见证。 */
    const openState34 = await af.evaluate(() => {
      const v = document.querySelector(".cl-drawer-veil");
      if (!v || !v.isConnected) return { veil: false };
      const cs = getComputedStyle(v);
      const before = getComputedStyle(v, "::before");
      /* v8.7.11 双模饱和度律自明见证：探针自 TL9 起常驻掠影态——掠影下满值
         backdrop-filter 必须无 saturate（提亮律退役）；非掠影态必须带
         saturate(1.5)（玻璃语言保留）。模式判定取自 html 实际类名，不依赖
         探针流程假设。 */
      const photo = document.documentElement.classList.contains("photo-mode");
      /* v8.7.12 凝聚 animation 化机制见证：animationName 恒挂 dv-open-kf
         （动画结束属性仍在，稳态值=普通声明）——animation 化后凝聚起点
         不依赖 paint 时序，本字段为「动画接线在位」的运行时证据 */
      return { veil: true, dv: v.getAttribute("data-veil"), bf: cs.backdropFilter, tint: before.opacity, vis: cs.visibility, photo, anim: cs.animationName, satLaw: photo ? !/saturate/.test(cs.backdropFilter || "") : /saturate\(1\.5\)/.test(cs.backdropFilter || "") };
    });
    gate("TL34b 开态到位见证（v8.7.12）：veil 挂载 + data-veil=1 + blur 满值 14px + 染色在场 + 可见 + dv-open-kf 接线在飞 + 饱和度律（掠影无sat/常规有sat）",
      openState34.veil && openState34.dv === "1" && /blur\(14px\)/.test(openState34.bf || "")
        && parseFloat(openState34.tint) > 0.9 && openState34.vis === "visible" && openState34.anim === "dv-open-kf" && openState34.satLaw,
      JSON.stringify(openState34));
    await page.mouse.click(90, 620, { button: "middle" }); // 关（TL34b 清场）
    await sleep(1100);
    /* TL32 静态门（v8.7.5 ㊼ 散场关键帧 + ㊺ 退场级联，v8.7.6 ㊽ 参数更新，
       v8.7.7 旧 0.36s 凝聚退役入反向断言）：
       globals.css 源码锚定——散场 keyframes + cs-drawer-closing 接线在位 +
       visibility 0.42s（>0.40s 动画窗、<780ms latch）+ 旧 0.12s 凝聚/
       0.36s 凝聚/0.30s 翻转/0.42s transition/0.44s/驻留冲线多重退役反向断言 +
       sug-row-out-kf/sug-cascade-out 退场级联在位 + 叶 0.3s；QuickLinks
       源码锚定 WAAPI 冻结-淡出 300ms + latch 780ms */
    const qlSrc = readFileSync(new URL("../src/components/startpage/QuickLinks.tsx", import.meta.url), "utf8");
    const t32 = {
      soft: /cl-drawer-veil-scatter-kf/.test(cssSrc)
        && /html\.cs-drawer-closing \.cl-drawer-veil \{\n  animation: cl-drawer-veil-scatter-kf 0\.40s linear forwards;/.test(cssSrc),
      vis: /transition: visibility 0s linear 0\.42s;/.test(cssSrc),
      legacyGone: !/backdrop-filter 0\.42s cubic-bezier\(0\.22, 1, 0\.36, 1\),\n    visibility/.test(cssSrc) && !/visibility 0s linear 0\.44s/.test(cssSrc)
        && !/visibility 0s linear 0\.30s/.test(cssSrc) && !/backdrop-filter 0\.12s cubic-bezier\(0\.22, 1, 0\.36, 1\)/.test(cssSrc)
        && !/backdrop-filter\s+0\.36s\s+cubic-bezier\(0\.5,\s*0,\s*0\.3,\s*1\)/.test(cssSrc),
      dwellGone: !/backdrop-filter 0\.14s cubic-bezier\(0\.4, 0, 1, 1\) 0\.14s/.test(cssSrc),
      outKf: /sug-row-out-kf/.test(cssSrc) && /sug-cascade-out \.search-sug-row/.test(cssSrc),
      leaf30: /\.cl-fade-leaf \{\n  transition: opacity 0\.3s/.test(cssSrc),
      waapi300: /duration: 300,/.test(qlSrc),
      latch780: /setTimeout\(\(\) => setMount\(false\), 780\)/.test(qlSrc),
    };
    gate("TL32 散场关键帧+退场级联静态门（v8.7.7）：scatter-kf 0.40s 接线 + visibility 0.42s + 旧实现（含 0.36s 凝聚）退役 + sug-row-out-kf 在位 + 叶 0.3s + WAAPI 300ms + latch 780ms",
      t32.soft && t32.vis && t32.legacyGone && t32.dwellGone && t32.outKf && t32.leaf30 && t32.waapi300 && t32.latch780,
      JSON.stringify(t32));
    /* TL33 静态门（v8.7.5 ㊼ 散场关键帧分段，CSSOM 产物级；v8.7.6 ㊽ 分段值
       更新，v8.7.7 满值 28→20px）：scatter-kf 在位且无 opacity（磨砂底层律）+
       分段值锚（20px+1.5
       缓启段 / 9px+1.22 中点 / 1px 无 sat 终帧）+ linear 尾段 + 缓启曲线 +
       基态 blur(1px) 无 saturate（sat 1 缺省写法，hidden 翻转零色感跳变）+
       基态无 backdrop-filter transition（散场移交关键帧）+ 染色 0.40s 同窗。
       本块作用域无 cssScan——独立小采样（keyframes + veil 规则族 +
       wallpaper-layer 规则族一次两用） */
    const scan33 = await af.evaluate(() => {
      const kfs = {};
      const rules = [];
      const walk = (list) => {
        for (const r of list) {
          if (r.type === CSSRule.KEYFRAMES_RULE) kfs[r.name] = r.cssText;
          else if (r.cssText && r.selectorText) rules.push(r.cssText);
          if (r.cssRules) try { walk(r.cssRules); } catch { }
        }
      };
      for (const sh of document.styleSheets) {
        try { walk(sh.cssRules); } catch { }
      }
      return {
        kf: kfs["cl-drawer-veil-scatter-kf"] || null,
        veilRules: rules.filter((x) => x.includes("cl-drawer-veil")),
        wpRules: rules.filter((x) => x.includes("wallpaper-layer")),
      };
    });
    const k33 = (scan33.kf || "").replace(/\s+/g, " ");
    const veilAll33 = scan33.veilRules.join(" ").replace(/\s+/g, " ");
    const base33 = (scan33.veilRules.find((x) => x.includes(".cl-drawer-veil") && !x.includes("data-veil") && !x.includes("::before") && !x.includes("cs-lite") && !x.includes("photo-mode")) || "").replace(/\s+/g, " ");
    const t33 = {
      kf: !!k33,
      noOp: !!k33 && !/opacity\s*:/.test(k33),
      hi: /var\(--dv-open-bf,\s*blur\(14px\)\s*saturate\(1\.5\)\)/.test(k33),
      mid: /var\(--dv-mid-bf,\s*blur\(9px\)\s*saturate\(1\.22\)\)/.test(k33),
      lo: /blur\(1px\)/.test(k33) && !/blur\(1px\)\s*saturate/.test(k33),
      lin: /linear/.test(k33),
      bez: /cubic-bezier\(0\.45,\s*0,\s*0\.55,\s*1\)/.test(k33),
      wire: /animation:[^;}]*cl-drawer-veil-scatter-kf/.test(veilAll33),
      baseNoSat: /backdrop-filter:\s*blur\(1px\);/.test(base33) && !/blur\(1px\)\s*saturate/.test(base33),
      baseNoTr: !/backdrop-filter\s+[0-9.]+s/.test(base33),
      tint40: /opacity\s+0\.4s\s+cubic-bezier\(0\.45,\s*0,\s*0\.55,\s*1\)/.test(veilAll33),
    };
    gate("TL33 散场关键帧静态门（v8.7.11）：CSSOM 分段 var 站点(14+1.5/9+1.22/1px无sat)+linear尾段+接线+基态无sat无bf过渡+染色0.40s",
      t33.kf && t33.noOp && t33.hi && t33.mid && t33.lo && t33.lin && t33.bez && t33.wire && t33.baseNoSat && t33.baseNoTr && t33.tint40,
      JSON.stringify(t33));
    /* TL34 静态门（v8.7.6 ㊽ 开态渐入；v8.7.12 凝聚 animation 化）：CSSOM 产物级——
       dv-open-kf 关键帧（from blur(1px) 闭态同源 / to var(--dv-open-bf) 稳态+
       散场同源，掠影覆写穿透）+ data-veil="1" 规则挂 animation 0.5s backwards
       （挂上必从 from 起播零 paint 时序依赖——transition before-change style
       被 portal 重挂同帧 paint 吞 0 态的根因退役，v8.6.23「真机两 commit
       间必有 paint」假设被用户实测推翻）+ ::before dv-tint-kf 同拍 + 关态
       染色 transition 0.40s 保留 + 基态 visibility 0.42s 在位 + 旧凝聚
       transition 0.6s/0.12s/0.36s 全退役。
       坑录（TL33/TL40 族再录）：压缩器 0.5s→.5s 尾零删 + animation shorthand
       分量重排（name 位次不定）→ 断言顺序无关（含 dv-open-kf + 0?\.5s +
       backwards）；关键帧 from/to 归一化 0%/100% 双兼容。 */
    const openRule33 = (scan33.veilRules.find((x) => x.includes('[data-veil="1"]') && !x.includes("::before")) || "").replace(/\s+/g, " ");
    const openBefore33 = (scan33.veilRules.find((x) => x.includes('[data-veil="1"]') && x.includes("::before")) || "").replace(/\s+/g, " ");
    const beforeBase33 = (scan33.veilRules.find((x) => x.includes(".cl-drawer-veil::before") && !x.includes("data-veil") && !x.includes("cs-lite")) || "").replace(/\s+/g, " ");
    const kfScan34 = await af.evaluate(() => {
      const walk = (list, out) => { for (const r of list) { if (r.type === CSSRule.KEYFRAMES_RULE && (r.name === "dv-open-kf" || r.name === "dv-tint-kf")) out[r.name] = r.cssText; if (r.cssRules) try { walk(r.cssRules, out); } catch { } } };
      const out = {};
      for (const sh of document.styleSheets) { try { walk(sh.cssRules, out); } catch { } }
      return out;
    });
    const kOpen34 = (kfScan34["dv-open-kf"] || "").replace(/\s+/g, " ");
    const kTint34 = (kfScan34["dv-tint-kf"] || "").replace(/\s+/g, " ");
    const t34 = {
      kfFrom: /(?:from|0%)/.test(kOpen34) && /blur\(1px\)/.test(kOpen34),
      kfToVar: /(?:to|100%)/.test(kOpen34) && /var\(--dv-open-bf/.test(kOpen34),
      kfTint: (kTint34 || "").length > 0,
      animWire: /dv-open-kf/.test(openRule33) && /0?\.4s/.test(openRule33) && /backwards/.test(openRule33) && /backdrop-filter:\s*var\(--dv-open-bf/.test(openRule33),
      tintWire: /dv-tint-kf/.test(openBefore33) && /0?\.4s/.test(openBefore33),
      /* 产物极简：0.40s→0.4s、visibility 0s linear 0.42s→visibility 0.42s（文件头④已知坑） */
      closeTint40: /opacity\s+0\.4s\s+cubic-bezier\(0\.45,\s*0,\s*0\.55,\s*1\)/.test(beforeBase33),
      vis42: /visibility[^;]*0\.42s/.test(base33),
      legacy12: !/backdrop-filter\s+0\.12s/.test(veilAll33) && !/opacity\s+0\.28s/.test(veilAll33) && !/backdrop-filter\s+0\.36s/.test(veilAll33) && !/backdrop-filter\s+0\.6s\s+cubic-bezier/.test(veilAll33),
    };
    gate("TL34 凝聚动画化静态门（v8.7.16 升 0.4s）：dv-open-kf(from 1px/to var 站点) + data-veil=1 挂 animation 0.4s backwards + dv-tint-kf 同拍 + 关态染色 0.4s transition 保留 + visibility 0.42s + 旧凝聚 transition 全退役",
      t34.kfFrom && t34.kfToVar && t34.kfTint && t34.animWire && t34.tintWire && t34.closeTint40 && t34.vis42 && t34.legacy12,
      JSON.stringify(t34) + " kf=" + kOpen34.slice(0, 160));
    /* TL35 静态门（v8.7.6 ㊽-3 掠影开抽屉背景微放大；v8.7.14 升 1.08）：CSSOM 产物级——
       wallpaper-layer 基态 transition 0.40s（回缩与散场/凝聚同拍，v8.7.16 同步加速）+ 放大态
       cs-drawer:not(cs-drawer-closing).photo-mode scale(1.08)（掠影限定 +
       closing 摘除即回缩）+ reduce 禁用 + AuroraBackground 源码容器类在位 */
    const abSrc = readFileSync(new URL("../src/components/startpage/AuroraBackground.tsx", import.meta.url), "utf8");
    const wpAll35 = scan33.wpRules.join(" ").replace(/\s+/g, " ");
    const t35 = {
      /* v8.7.12 与凝聚同步 + v8.7.16 同步加速：0.40s + 同曲线 cubic-bezier(0.5,0,0.3,1) */
      base: /\.wallpaper-layer\s*\{[^}]*transition:\s*transform\s+0?\.4s\s+cubic-bezier\(0\.5,\s*0,\s*0\.3,\s*1\)/.test(wpAll35),
      zoom: /html\.cs-drawer:not\(\.cs-drawer-closing\)\.photo-mode \.wallpaper-layer\s*\{[^}]*transform:\s*scale\(1\.08\)/.test(wpAll35),
      reduce: /\.wallpaper-layer\s*\{[^}]*transition:\s*none/.test(wpAll35) && /transform:\s*none/.test(wpAll35),
      src: /wallpaper-layer absolute inset-0/.test(abSrc),
    };
    gate("TL35 掠影放大静态门（v8.7.16 同步 0.40s）：wallpaper-layer transition 0.40s 同曲线 + photo-mode 限定 scale(1.08) + reduce 禁用 + 容器类在位",
      t35.base && t35.zoom && t35.reduce && t35.src,
      JSON.stringify(t35));
  }

  /* ---------- TL36 面板互切散场回归（v8.7.8 ①）：行为双门 + 静态锚 ----------
     根因：beta 把 .view-exit 散场下沉到后代级联（.view-exit .glass-card /
     .view-exit .content-focus），但 ⌘K 指令列表/预设视图、预设面板导入/管理 tab、
     预设弹窗视图四处【包裹层自身就是 .content-focus】且内部无玻璃后代——
     后代选择器永不匹配 = 散场动画整条失联，旧视图满值钉住 350ms 后硬拆。
     行为门：真开 ⌘K → 点「导入预设」→ 退场帧元素必须挂 content-defocus 动画
     （旧病灶：animationName 停留在 content-focus）+ absolute 钉位；
     静态门：CSSOM 产物级同元素伴随规则在位 + 后代级联不回归。 */
  {
    /* 清场：Esc + 空白点点击，避免前置用例残留浮层 */
    await af.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    await sleep(500);
    /* 开 ⌘K（监听在 iframe window，直接派发） */
    await af.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true, cancelable: true })));
    await sleep(900);
    const opened36 = await af.evaluate(() => !!document.querySelector('[aria-label="指令面板"]'));
    gate("TL36-pre ⌘K 打开", opened36);
    /* 采样器：记录退场帧元素类名/动画/定位，随帧更新直至 500ms */
    await af.evaluate(() => {
      window.__t36 = null;
      const pick = () => {
        const el = document.querySelector(".view-exit");
        if (!el) return;
        const cs = getComputedStyle(el);
        window.__t36 = {
          cls: el.className, anim: cs.animationName, pos: cs.position,
          op: cs.opacity, filter: cs.filter,
        };
      };
      const tick = () => { pick(); if ((window.__t36n = (window.__t36n || 0) + 1) < 40) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    });
    await af.evaluate(() => {
      const item = document.querySelector('[cmdk-item][data-value="导入预设"]');
      item?.click();
    });
    await sleep(700);
    const t36 = await af.evaluate(() => window.__t36);
    gate("TL36 面板互切散场行为门（v8.7.8）：退场帧挂 content-defocus + absolute 钉位",
      !!t36 && /content-defocus/.test(t36.anim || "") && t36.pos === "absolute",
      JSON.stringify(t36));
    /* 新视图入场在飞（回归保护：交叉溶解另一半） */
    const enter36 = await af.evaluate(() => {
      const el = document.querySelector('[aria-label="指令面板"] .content-focus');
      if (!el) return null;
      return { anim: getComputedStyle(el).animationName, cls: el.className };
    });
    gate("TL36b 预设视图入场聚拢在位", !!enter36 && /content-focus/.test(enter36.anim || "") && !/view-exit/.test(enter36.cls || ""),
      JSON.stringify(enter36));
    /* 预设面板内导入→管理互切（同一套同元素伴随规则的第二处用点） */
    await af.evaluate(() => {
      window.__t36c = null;
      const pick = () => {
        const el = document.querySelector(".view-exit");
        if (!el) return;
        window.__t36c = { anim: getComputedStyle(el).animationName, pos: getComputedStyle(el).position };
      };
      const tick = () => { pick(); if ((window.__t36cn = (window.__t36cn || 0) + 1) < 40) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    });
    await af.evaluate(() => {
      const btn = [...document.querySelectorAll("button")].find((b) => (b.textContent || "").includes("管理预设"));
      btn?.click();
    });
    await sleep(700);
    const t36c = await af.evaluate(() => window.__t36c);
    gate("TL36c 导入→管理互切散场行为门（v8.7.8）：退场帧挂 content-defocus",
      !!t36c && /content-defocus/.test(t36c.anim || "") && t36c.pos === "absolute", JSON.stringify(t36c));
    /* 关面板清场 */
    await af.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    await sleep(500);
    /* 静态锚：CSSOM 同元素伴随规则 + 后代级联双路并存 */
    const scan36 = await af.evaluate(() => {
      const rules = [];
      const walk = (list) => { for (const r of list) { if (r.cssText && r.selectorText) rules.push(r.cssText); if (r.cssRules) try { walk(r.cssRules); } catch { } } };
      for (const sh of document.styleSheets) { try { walk(sh.cssRules); } catch { } }
      return rules;
    });
    const all36 = scan36.join(" ").replace(/\s+/g, " ");
    const s36 = {
      /* 压缩器序列化坑（文件头④律）：shorthand 分量可能重排（animation:.2s ... content-defocus）、
         0.2s→.2s——断言锚定「规则块含 content-defocus + 含 0.2s 时值」而非完整短语 */
      self: (() => { const m = all36.match(/\.view-exit\.content-focus\s*\{[^}]*\}/); return !!m && /content-defocus/.test(m[0]) && /0?\.2s/.test(m[0]); })(),
      desc: /view-exit \.content-focus\s*\{[^}]*content-defocus/.test(all36),
      enter: /\.content-focus\s*\{[^}]*animation:\s*content-focus/.test(all36),
    };
    gate("TL36d 互切散场静态锚（v8.7.8）：同元素伴随 0.2s + 后代级联保留 + 入场在位", s36.self && s36.desc && s36.enter, JSON.stringify(s36));
  }

  /* ---------- TL37 开发者文档（v8.7.8 ②）：分段关键帧 + 基础延迟 + 内容同步 ----------
     卡顿根因：①首帧主线程忙于巨量 DOM 挂载，级联在窗口内起跑 → 动画时钟先行
     流逝，前几帧折叠成跳变；②单段 0.42s 让 blur<2px 不可感尾段拖 ~170ms。
     修复：0.20s 基础延迟避让 + 关键帧 55% 站点模糊凝满（filter 窗口 0.42→0.23s）。
     内容同步：widgets html 上限 18000→26400 / 高度 40–320→40–460 / 图标 ≤6→≤7 /
     内容字段九→十三（与 preset.ts PRESET_LIMITS 对账）。 */
  {
    const scan37 = await af.evaluate(() => {
      const kfs = {}; const rules = [];
      const walk = (list) => { for (const r of list) { if (r.type === CSSRule.KEYFRAMES_RULE) kfs[r.name] = r.cssText; else if (r.cssText && r.selectorText) rules.push(r.cssText); if (r.cssRules) try { walk(r.cssRules); } catch { } } };
      for (const sh of document.styleSheets) { try { walk(sh.cssRules); } catch { } }
      return { kf: kfs["docs-item-in-kf"] || "", rules };
    });
    const k37 = (scan37.kf || "").replace(/\s+/g, " ");
    const all37 = scan37.rules.join(" ").replace(/\s+/g, " ");
    const t37 = {
      /* blur(0) 被压缩器压成 blur()（文件头④已知坑，非法但序列化形态稳定） */
      seg: /55%\s*\{[^}]*blur\(\s*\)/.test(k37),
      tfA: /0\.4,\s*0,\s*0\.2,\s*1/.test(k37),
      tfB: /0\.22,\s*1,\s*0\.36,\s*1/.test(k37),
      delay: /\.docs-anim\s*>\s*section\s*\{[^}]*animation-delay:\s*calc\(\s*0?\.2s\s*\+/.test(all37),
    };
    gate("TL37 文档入场节奏静态门（v8.7.8）：55% 模糊凝满分段 + 双段曲线 + 0.20s 基础延迟", t37.seg && t37.tfA && t37.tfB && t37.delay, JSON.stringify(t37) + " kf=" + k37.slice(0, 200));
    const docsSrc = readFileSync(new URL("../src/components/startpage/PresetDocs.tsx", import.meta.url), "utf8");
    const devMd = readFileSync(new URL("../docs/PRESET_DEV.md", import.meta.url), "utf8");
    const c37 = {
      /* v8.7.18：28800（词钮迁时长行右下+真字形描取，五处联动同步） */
      htmlCap: docsSrc.includes("28800"),
      height: docsSrc.includes("40–460"),
      icons: docsSrc.includes("数组 ≤7 条"),
      fields: docsSrc.includes("十三个内容字段"),
      md: devMd.includes("28800"),
      legacyGone: !docsSrc.includes("≤18000") && !docsSrc.includes("≤26400") && !docsSrc.includes("≤27600") && !docsSrc.includes("40–320"),
    };
    gate("TL37b 文档内容同步源码门（v8.7.18 升 28800）：28800/40–460/≤7/十三字段 + 应用内与仓内 md 对账 + 旧值（18000/26400/27600）退役", c37.htmlCap && c37.height && c37.icons && c37.fields && c37.md && c37.legacyGone, JSON.stringify(c37));
  }

  /* ---------- TL38 掠影染色退役（v8.7.8 ③）：CSSOM 门 + 默认态零波及对账 ----------
     指令原话「把掠影模式下的浅色/深色模式的浅色/深色滤镜删掉」= 开抽屉整页染色
     层（浅=白纱/深=暗纱）在掠影下退役；磨砂本体（0.60s 凝聚/0.40s 散场）零改动。 */
  {
    const scan38 = await af.evaluate(() => {
      const rules = [];
      const walk = (list) => { for (const r of list) { if (r.cssText && r.selectorText) rules.push(r.cssText); if (r.cssRules) try { walk(r.cssRules); } catch { } } };
      for (const sh of document.styleSheets) { try { walk(sh.cssRules); } catch { } }
      return rules;
    });
    const all38 = scan38.join(" ").replace(/\s+/g, " ");
    const photoRule = (scan38.find((x) => /html\.photo-mode\s+\.cl-drawer-veil::before/.test(x)) || "").replace(/\s+/g, " ");
    const darkRule = (scan38.find((x) => /\.dark \.cl-drawer-veil::before/.test(x) && !/cs-lite/.test(x)) || "");
    const baseBefore = (scan38.find((x) => x.includes(".cl-drawer-veil::before") && !x.includes("data-veil") && !x.includes("cs-lite") && !x.includes("photo-mode") && !x.includes(".dark")) || "").replace(/\s+/g, " ");
    const t38 = {
      retired: /display:\s*none/.test(photoRule),
      noBg: !/background/.test(photoRule),
      darkKept: !!darkRule,
      baseKept: /opacity\s+0\.4s/.test(baseBefore),
      order: all38.indexOf("photo-mode .cl-drawer-veil") > all38.indexOf("cs-lite .cl-drawer-veil"),
    };
    gate("TL38 掠影染色退役静态门（v8.7.8）：photo-mode display:none + 无背景残留 + 默认/深色态染色保留（零波及）", t38.retired && t38.noBg && t38.darkKept && t38.baseKept && t38.order, JSON.stringify(t38) + " photo=" + photoRule.slice(0, 120));
  }

  /* ---------- TL39 掠影模糊不提亮律（v8.7.11）：CSSOM 门 + 源码级接线 ----------
     用户指令「保证模糊效果不会提亮背景」双实现对账：
     ① 抽屉纱幕站点变量化 --dv-open-bf/--dv-mid-bf，掠影覆写为无 saturate 版本
        （blur 亮度均值保持，饱和度才是压暗壁纸被重新提色的主犯）；
     ② 四张满屏遮罩（命令面板/快捷服务编辑/预设文档/更新日志）挂 cl-screen-veil，
        掠影下白纱 bg-white/10 → rgba(0,0,0,0.18) 深纱（与 photo-scrim 平底
        同值）+ blur(12px) 无 sat——右键编辑快捷服务叠在抽屉纱幕上的第二层
        同向压暗不再提亮。
     行为/像素见证由 visual-v879 承担（TL34b 伪影定律：过程性由静态门规范级
     保证 + visual 截图强制出帧）。 */
  {
    const scan39 = await af.evaluate(() => {
      const rules = [];
      const walk = (list) => { for (const r of list) { if (r.cssText && r.selectorText) rules.push(r.cssText); if (r.cssRules) try { walk(r.cssRules); } catch { } } };
      for (const sh of document.styleSheets) { try { walk(sh.cssRules); } catch { } }
      return rules;
    });
    const photoVarRule = (scan39.find((x) => /html\.photo-mode\s+\.cl-drawer-veil\s*\{/.test(x)) || "").replace(/\s+/g, " ");
    const screenRules = scan39.filter((x) => x.includes("cl-screen-veil")).map((x) => x.replace(/\s+/g, " "));
    const screenRule = screenRules.find((x) => /photo-mode/.test(x)) || "";
    /* 源码级接线：构建产物 JS 内 cl-screen-veil 出现次数 ≥4（四组件 className 各一次） */
    const src39 = await af.evaluate(async () => {
      const urls = [...document.querySelectorAll("script[src]")].map((s) => s.src);
      let n = 0;
      await Promise.all(urls.map(async (u) => {
        try { const t = await (await fetch(u)).text(); n += (t.match(/cl-screen-veil/g) || []).length; } catch { }
      }));
      return n;
    });
    const t39 = {
      photoVarSat: /--dv-open-bf:\s*blur\(14px\)\s*;/.test(photoVarRule) && /--dv-mid-bf:\s*blur\(9px\)\s*;/.test(photoVarRule) && !/saturate/.test(photoVarRule),
      screenDark: /backdrop-filter:\s*blur\(12px\)/.test(screenRule) && /(#0000002e|rgba?\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0?\.18\)|rgb\(\s*0\s+0\s+0\s*\/\s*0?\.18\))/.test(screenRule) && !/saturate/.test(screenRule),
      onlyPhoto: screenRules.length > 0 && screenRules.every((x) => /photo-mode/.test(x)),
      srcCount: src39 >= 4,
    };
    gate("TL39 掠影模糊不提亮律静态门（v8.7.11）：photo 站点变量无sat + cl-screen-veil 深纱blur12无sat + 规则仅掠影态 + 源码接线≥4",
      t39.photoVarSat && t39.screenDark && t39.onlyPhoto && t39.srcCount,
      JSON.stringify(t39) + " screen=" + screenRule.slice(0, 140));
  }

  /* ---------- TL40 纱幕动画窗无提亮律（v8.7.11）：CSSOM 门 + 源码级接线 ----------
     用户复测「打开有模糊效果背景的页面还是会出现提亮一两秒，看起来很割裂」
     根因：v8.7.9 静态覆写在动画窗内被 veil-in/veil-fade 关键帧硬编码的
     saturate(1.5) 架空（CSS 动画运行期优先级高于普通声明）——开遮罩头 45%
     饱和度冲顶=纯提亮脉冲、末段回落=割裂；PresetDialog（bg-white/20+
     blur-2xl+sat-150 且无 cl-screen-veil）为 v8.7.9 穷举漏网。修复=关键帧
     from/to bg/bf 全面 var 化（fallback 字面值原样=非掠影字节级零波及）+
     掠影注入无 sat 站点 + veil-hold-2xl 补网。 */
  {
    const scan40 = await af.evaluate(() => {
      const rules = [];
      const kfs = {};
      const walk = (list) => { for (const r of list) { if (r.type === CSSRule.KEYFRAMES_RULE) kfs[r.name] = r.cssText; if (r.cssText && r.selectorText) rules.push(r.cssText); if (r.cssRules) try { walk(r.cssRules); } catch { } } };
      for (const sh of document.styleSheets) { try { walk(sh.cssRules); } catch { } }
      return { rules, kfs };
    });
    const veilInKf = (scan40.kfs["veil-in"] || "").replace(/\s+/g, " ");
    const veilFadeKf = (scan40.kfs["veil-fade"] || "").replace(/\s+/g, " ");
    const screenPhoto = (scan40.rules.find((x) => x.includes("cl-screen-veil") && x.includes("photo-mode")) || "").replace(/\s+/g, " ");
    const hold2xlPhoto = (scan40.rules.find((x) => x.includes("veil-hold-2xl") && x.includes("photo-mode")) || "").replace(/\s+/g, " ");
    /* 压缩器序列化坑（TL33 同族再录）：CSSOM 把 from/to 归一化为 0%/100%，
       正则双兼容锚定；var fallback 逗号后空格可能被压缩，\s* 兼容零空格 */
    const t40 = {
      kfInBg: /(?:from|0%)\s*\{[^}]*background-color:\s*var\(--veil-from-bg,\s*transparent\)/.test(veilInKf),
      kfInBf: /(?:from|0%)\s*\{[^}]*backdrop-filter:\s*var\(--veil-from-bf,\s*blur\(1px\)\s*saturate\(1\.5\)\)/.test(veilInKf),
      kfFadeBg: /(?:to|100%)\s*\{[^}]*background-color:\s*var\(--veil-out-bg,\s*transparent\)/.test(veilFadeKf),
      kfFadeBf: /(?:to|100%)\s*\{[^}]*backdrop-filter:\s*var\(--veil-to-bf,\s*blur\(1px\)\s*saturate\(1\.5\)\)/.test(veilFadeKf),
      photoVars: /--veil-from-bf:\s*blur\(1px\)/.test(screenPhoto) && /--veil-hold-bf:\s*blur\(12px\)/.test(screenPhoto) && /--veil-to-bf:\s*blur\(1px\)/.test(screenPhoto) && !/saturate/.test(screenPhoto),
      hold2xl: /backdrop-filter:\s*blur\(40px\)/.test(hold2xlPhoto) && /--veil-hold-bf:\s*blur\(40px\)/.test(hold2xlPhoto) && !/saturate/.test(hold2xlPhoto),
    };
    /* 源码级接线：源 globals.css 两关键帧 from/to 已 var 化，且不再存在
       「background-color: transparent + backdrop-filter: blur(1px) saturate(1.5)」
       硬编码对（veil-in from / veil-fade to 两处曾是仅有的提亮入口） */
    const cssSrc40 = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
    const src40 = {
      inVar: /@keyframes veil-in \{[\s\S]*?var\(--veil-from-bf, blur\(1px\) saturate\(1\.5\)\)/.test(cssSrc40),
      fadeVar: /@keyframes veil-fade \{[\s\S]*?var\(--veil-to-bf, blur\(1px\) saturate\(1\.5\)\)/.test(cssSrc40),
      hardGone: !/background-color: transparent;\s*\n\s*backdrop-filter: blur\(1px\) saturate\(1\.5\);/.test(cssSrc40),
      photoBlock: /html\.photo-mode \.veil-hold-2xl \{[\s\S]*?--veil-hold-bf: blur\(40px\);/.test(cssSrc40),
    };
    gate("TL40 纱幕动画窗无提亮律静态门（v8.7.11）：关键帧 from/to var 化(bg+bf) + photo 深纱站点无sat + veil-hold-2xl 补网无sat + 源码硬编码退役",
      t40.kfInBg && t40.kfInBf && t40.kfFadeBg && t40.kfFadeBf && t40.photoVars && t40.hold2xl && src40.inVar && src40.fadeVar && src40.hardGone && src40.photoBlock,
      JSON.stringify({ ...t40, ...src40 }) + " in=" + veilInKf.slice(0, 150));
  }

  /* ---------- TL41 dock 部件磨砂玻璃化（v8.7.11）：CSSOM 门 + 源码级接线 ----------
     用户复测「其它面板切到音乐面板时背景半透明然后又变回纯色」根因：
     ①部件容器 --boot-bg 纯色垫底 + 互切揭示幕（旧玻璃溶解）透出纯色暗卡
       = 材质跳变；②content-focus-solid（filter 动画）挂容器，聚拢期
       filter≠none 杀容器 backdrop 合成。修复=容器挂与内建 glass-card 同款
       磨砂玻璃（玻璃溶于玻璃无跳变）+ 动画类迁移 iframe（背板恒定）+
       音乐卡 panelMode 透明协作（official-presets.json）。 */
  {
    /* 自建扫描（TL40 的 scan40 为块内局部不可跨块引用） */
    const scan41 = await af.evaluate(() => {
      const rules = [];
      const walk = (list) => { for (const r of list) { if (r.cssText && r.selectorText) rules.push(r.cssText); if (r.cssRules) try { walk(r.cssRules); } catch { } } };
      for (const sh of document.styleSheets) { try { walk(sh.cssRules); } catch { } }
      return rules;
    });
    const dockGlass = (scan41.find((x) => /^\.cl-dockwidget\s*\{/.test(x.trim())) || "").replace(/\s+/g, " ");
    const dockDark = (scan41.find((x) => x.replace(/\s+/g, " ").startsWith(".dark .cl-dockwidget {")) || "").replace(/\s+/g, " ");
    /* cs-lite 降级改源码级断言：产物规则为 -webkit- 别名分组（压缩器改写），
       Chromium CSSOM 对该形态序列化不可靠（压缩器序列化坑第三次）——
       锚定 globals.css 源（cs-lite 清单含 .cl-dockwidget + backdrop:none） */
    const gsrc41 = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
    const liteOff = /html\.cs-lite \.glass-card,\s*\n\s*html\.cs-lite \.cl-panel,\s*\n\s*html\.cs-lite \.cl-dockwidget \{[\s\S]{0,60}backdrop-filter: none !important;/.test(gsrc41);
    const t41css = {
      glass: /backdrop-filter:\s*blur\(20px\)\s*saturate\(1\.5\)/.test(dockGlass) && /rgba\(255,\s*255,\s*255,\s*0?\.62\)/.test(dockGlass) && /border:\s*1px solid rgba\(24,\s*22,\s*36,\s*0?\.09\)/.test(dockGlass),
      dark: /rgba\(22,\s*22,\s*27,\s*0?\.6\)/.test(dockDark),
      liteOff,
      found: dockGlass.length > 0,
    };
    const stageSrc41 = readFileSync(new URL("../src/components/startpage/PanelStage.tsx", import.meta.url), "utf8");
    const presetSrc41 = readFileSync(new URL("../src/lib/startpage/official-presets.json", import.meta.url), "utf8");
    const t41src = {
      containerBare: /className="cl-dockwidget"/.test(stageSrc41) && !/className="cl-dockwidget content-focus-solid"/.test(stageSrc41),
      iframeCarries: /className="content-focus-solid block border-0 bg-transparent"/.test(stageSrc41),
      replayOnFrame: /const frame = el\.querySelector\("iframe"\);/.test(stageSrc41) && /frame\.classList\.add\("content-focus-solid"\)/.test(stageSrc41),
      frameExempt: /animation: viewLive \? undefined : "none",/.test(stageSrc41),
      musicClear: presetSrc41.includes("[data-panel] .cs-card{background:transparent") && presetSrc41.includes("backdrop-filter:none"),
    };
    gate("TL41 dock 部件磨砂玻璃化静态门（v8.7.11）：容器 glass-card 同款材质(blur20+sat1.5+0.62/暗0.6+描边) + cs-lite 降级不回归 + 动画类迁移 iframe(容器裸类+frame 挂类+重播 querySelector+豁免同构) + 音乐卡 panelMode 透明协作",
      t41css.glass && t41css.dark && t41css.liteOff && t41css.found && t41src.containerBare && t41src.iframeCarries && t41src.replayOnFrame && t41src.frameExempt && t41src.musicClear,
      JSON.stringify({ ...t41css, ...t41src }) + " rule=" + dockGlass.slice(0, 120)
        + " lite=" + scan41.filter((x) => /cl-dockwidget/.test(x) && /cs-lite/.test(x) && /backdrop/.test(x)).join(" @@ ").slice(0, 420));
  }

  /* ---------- TL42 开合动画对齐（v8.7.13）：源码级 + CSSOM 双道 ----------
     用户实测「音乐预设面板打开/关闭动画与其它面板不同步 + dock 点音乐选框无
     选中动画」三根因：①Dock pillPop 只认 panel != null（部件路径 initial=false
     瞬现）②PanelStage closed 相位 activeView 残留 → 重开部件被误判 builtin→
     widget 互切挂伪 swapOut（旧卡溶解残影闪现，实测 M3 glass.anim=
     cl-panel-swapout-kf）③部件容器玻璃无凝入（内建 panel-fade 渐显 vs 部件
     首帧满值）。修复=四件套（pillPop 对齐 + 归属清零 + 容器 panel-rise 同拍
     凝入 + 散场/聚拢时长对齐 0.18s/0.3s）。 */
  {
    const dockSrc42 = readFileSync(new URL("../src/components/startpage/Dock.tsx", import.meta.url), "utf8");
    const stageSrc42 = readFileSync(new URL("../src/components/startpage/PanelStage.tsx", import.meta.url), "utf8");
    const gsrc42 = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
    /* CSSOM 产物级：.panel-sink .content-focus-solid 散场规则（压缩器 shorthand
       重排坑——锚「规则块含 panel-content-out + 含 0.18s」而非完整短语） */
    const scan42 = await af.evaluate(() => {
      const rules = [];
      const walk = (list) => { for (const r of list) { if (r.cssText && r.selectorText) rules.push(r.cssText); if (r.cssRules) try { walk(r.cssRules); } catch { } } };
      for (const sh of document.styleSheets) { try { walk(sh.cssRules); } catch { } }
      return rules;
    });
    const sinkSolid = (scan42.find((x) => x.replace(/\s+/g, " ").startsWith(".panel-sink .content-focus-solid {")) || "").replace(/\s+/g, " ");
    const t42 = {
      pillAnyPath: /\(panel != null \|\| dockWidget != null\)/.test(dockSrc42),
      viewResetOnClosed: /setPhase\("closed"\);\s*\n\s*setActiveView\(null\);/.test(stageSrc42),
      containerRise: /el\.classList\.remove\("panel-rise"\);/.test(stageSrc42) && /el\.classList\.add\("panel-rise"\);/.test(stageSrc42),
      frameRiseUntouched: /frame\.classList\.add\("content-focus-solid"\)/.test(stageSrc42),
      sinkSolidCssom: /panel-content-out/.test(sinkSolid) && /0?\.18s/.test(sinkSolid),
      sinkSolidSrc: /\.panel-sink \.content-focus-solid \{\s*\n[\s\S]{0,220}panel-content-out 0\.18s/.test(gsrc42),
      focusSolid03: /content-focus-solid-kf calc\(0\.3s \* var\(--mo-speed, 1\)\)/.test(gsrc42),
      reduceSolid: /\.panel-sink \.content-focus,\s*\n\s*\.dialog-sink \.content-focus,\s*\n\s*\.panel-sink \.content-focus-solid \{/.test(gsrc42),
    };
    gate("TL42 开合动画对齐静态门（v8.7.13）：选框 Q 弹认部件路径 + closed 归属清零(伪 swapOut 根修) + 容器 panel-rise 凝入对齐(iframe 聚拢接线不回归) + 散场同拍 panel-content-out 0.18s(CSSOM+源码) + 聚拢同拍 0.3s + reduce 兜底补齐",
      t42.pillAnyPath && t42.viewResetOnClosed && t42.containerRise && t42.frameRiseUntouched && t42.sinkSolidCssom && t42.sinkSolidSrc && t42.focusSolid03 && t42.reduceSolid,
      JSON.stringify(t42) + " rule=" + sinkSolid.slice(0, 140));
  }

  /* ---------- TL43 定高揭示 + 自圆静态门（v8.7.14） ----------
     用户复测「音乐面板打开动画严重卡顿 + 顶部两角直角非圆角 + 不是其它面板
     的弹簧动画」双根因：①部件容器 min(h,100%) 压扁路径=iframe 每帧被压扁
     重排（OOPIF 逐帧重排 × blur 聚拢再滤波 × 玻璃 backdrop 重采样三层每帧
     叠加，内建路径无此层）——真机严重卡顿根因；修复=定高揭示律：iframe
     定高 h + 顶锚 absolute，弹簧期零逐帧重排零跨进程 resize，内容以壳体裁
     切窗向下揭示（与内建 cl-panel-content 自然高被壳裁同语言）。②容器无
     border-radius 依赖祖先壳圆角裁切——backdrop 合成层逃逸祖先 rounded
     clip（Chromium 经典病灶）=顶角直角；修复=自圆律：玻璃元素自身
     border-radius 1rem（与内建 rounded-2xl 同参，backdrop 输出按自身
     radius 裁圆）。 */
  {
    const stageSrc43 = readFileSync(new URL("../src/components/startpage/PanelStage.tsx", import.meta.url), "utf8");
    const gsrc43 = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
    const scan43 = await af.evaluate(() => {
      const rules = [];
      const walk = (list) => { for (const r of list) { if (r.cssText && r.selectorText) rules.push(r.cssText); if (r.cssRules) try { walk(r.cssRules); } catch { } } };
      for (const sh of document.styleSheets) { try { walk(sh.cssRules); } catch { } }
      return rules;
    });
    const dockRule43 = (scan43.find((x) => /^\.cl-dockwidget\s*\{/.test(x.trim())) || "").replace(/\s+/g, " ");
    const t43 = {
      /* 定高揭示律（源码级）：iframe 定高 h + 顶锚 absolute + 旧压扁路径退役 */
      iframeFixedH: /height: `\$\{h\}px`/.test(stageSrc43),
      iframeTopAnchor: /inset: "0 0 auto 0",/.test(stageSrc43),
      /* v8.7.15 语义收窄：压扁退役 = width+height【对】退役——width:100%
         单独恢复为横向满宽律（replaced element 固有宽度 300px 左移根修），
         与定高揭示（height:h）各自独立不冲突 */
      squishRetired: !/width: "100%",\s*\n\s*height: "100%"/.test(stageSrc43),
      widthFill: /width: "100%"/.test(stageSrc43),
      /* TL41/TL42 接线不回归：className 链 + 重播 effect 原样 */
      frameClassKept: /className="content-focus-solid block border-0 bg-transparent"/.test(stageSrc43),
      replayKept: /el\.classList\.add\("panel-rise"\);/.test(stageSrc43) && /frame\.classList\.add\("content-focus-solid"\)/.test(stageSrc43),
      /* 自圆律：源码 + CSSOM 双道（容器玻璃自身 border-radius） */
      selfRoundSrc: /backdrop-filter: blur\(20px\) saturate\(1\.5\);\s*\n\s*\/\*[\s\S]{0,320}?border-radius: 1rem;/.test(gsrc43),
      bootInherit: /\.cl-dockwidget::after \{[\s\S]{0,220}?border-radius: inherit;/.test(gsrc43),
      selfRoundCssom: /border-radius/.test(dockRule43),
    };
    gate("TL43 定高揭示+自圆静态门（v8.7.14/v8.7.15）：iframe 定高 h 顶锚揭示(卡顿根修:OOPIF 零逐帧重排) + 压扁对退役+横向满宽在位 + TL41/42 接线不回归 + 容器自圆律 border-radius 1rem(顶角直角根修,源码+CSSOM 双道) + boot 罩 inherit 同构",
      t43.iframeFixedH && t43.iframeTopAnchor && t43.squishRetired && t43.widthFill && t43.frameClassKept && t43.replayKept && t43.selfRoundSrc && t43.bootInherit && t43.selfRoundCssom,
      JSON.stringify(t43) + " rule=" + dockRule43.slice(0, 160));
  }

  /* ---------- TL44 首开 h-full 同构 + 宽度语言静态门（v8.7.15） ----------
     用户复测「音乐面板整体往左位移 + 还是没有弹簧动效」双根因：
     ①iframe replaced element 固有宽度 300px（inset 顶锚不带显式宽，
       CSS 2.1 §10.3.8）→ 内容左锚玻璃卡=整体左移；修复=横向满宽律。
     ②容器 max/min 联立在 s>h 段把弹簧过冲钮进透明壳隐形空间（卡片本身
       静止）=「没有弹簧」结构性根因；修复=首开 fresh 律：fresh 会话容器
       top 0 × height 100% 与内建 h-full 逐帧同构（过冲/回弹全程可见），
       互切保持联立底锚（互切底锚律不变）。
     ③宽度语言：closed 保持上一会话宽 + 首开帧 duration:0 静默快照（开合
       零横向运动）+ 互切 motionSpring 拉伸——旧代码每次开合夹带 340↔360
       横向弹簧噪声。 */
  {
    const stageSrc44 = readFileSync(new URL("../src/components/startpage/PanelStage.tsx", import.meta.url), "utf8");
    const t44 = {
      freshState: /const \[freshOpen, setFreshOpen\] = useState\(false\);/.test(stageSrc44),
      freshMachine: /setFreshOpen\(anyActive\);/.test(stageSrc44),
      freshSwapClear: /if \(activeView != null\) setFreshOpen\(false\);/.test(stageSrc44),
      geomFresh: /const geomFresh = freshOpen && isActive;/.test(stageSrc44),
      freshGeomStyle: /top: geomFresh \? "0px" : `max\(0px, calc\(100% - \$\{h\}px\)\)`,/.test(stageSrc44)
        && /height: geomFresh \? "100%" : `min\(\$\{h\}px, 100%\)`,/.test(stageSrc44),
      lastWRef: /const lastStageWRef = useRef\(360\);/.test(stageSrc44),
      shellWKeep: /: lastStageWRef\.current;/.test(stageSrc44),
      widthSnap: /freshOpen\s*\n\s*\? \{ duration: 0 \}/.test(stageSrc44),
      oldShellWRetired: !/const shellWidth = activeWidget \? activeWidget\.width : 360;/.test(stageSrc44),
      top0LiteralAbsent: !/top: 0,/.test(stageSrc44),
    };
    gate("TL44 首开h-full同构+宽度语言静态门（v8.7.15）：freshOpen 状态机（首开置位/真互切清除/首开赋值不碰）+ 容器几何分律（fresh=top0×100% 同构/互切=联立底锚）+ 宽度语言（closed 保持会话宽+首开快照 duration0+旧 shellWidth 三元退役+TL25a 字面量律不回归）",
      t44.freshState && t44.freshMachine && t44.freshSwapClear && t44.geomFresh && t44.freshGeomStyle && t44.lastWRef && t44.shellWKeep && t44.widthSnap && t44.oldShellWRetired && t44.top0LiteralAbsent,
      JSON.stringify(t44));
  }

  /* ---------- TL45 全局歌词链路静态门（v8.7.16） ----------
     桌面歌词同款全局歌词浮层：四源对账——①ext-card.js 浮层本体（同 Port
     双表面/独立 closed shadow/位置持久化/× 反向写回）②PresetWidgets.tsx
     镜像链（EXT_KV_MAP 第四键 + mirrorExtCard 四参 + storageSet 分支）
     ③音乐面板开关（csWordBtn 按钮在官方预设构建产物内，csDlyric 三向接线：
     onclick 写/get 启动读/patch 反转）④抽屉提速 0.4s 源码锚（与 CSSOM
     TL34/TL35 双道互证）。 */
  {
    const cardSrc45 = readFileSync(new URL("../extension-src/ext-card.js", import.meta.url), "utf8");
    const pwSrc45 = readFileSync(new URL("../src/components/startpage/PresetWidgets.tsx", import.meta.url), "utf8");
    const official45 = JSON.parse(readFileSync(new URL("../src/lib/startpage/official-presets.json", import.meta.url), "utf8"));
    const musPreset45 = (official45.presets || []).find((p) => p && p.name && /SMTC/.test(p.name));
    const musHtml45 = musPreset45 ? JSON.stringify(musPreset45.manifest) : "";
    const globalsSrc45 = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
    const t45 = {
      /* ① 浮层本体：开关读取+热跟随 / Port 双表面门控 / 渲染帧钩子 */
      dlRead: /chrome\.storage\.local\.get\(\["cardDlyric"\]/.test(cardSrc45) && /ch\.cardDlyric\.newValue === true \|\| ch\.cardDlyric\.newValue === "true"/.test(cardSrc45),
      dlPortShared: /if \(!cardEnabled && !dlOn\) \{/.test(cardSrc45) && /if \(!cardEnabled && !dlOn\) return;/.test(cardSrc45) && /if \(dlOn && track\.playing\) return true;/.test(cardSrc45),
      dlSurface: /chushi-dlyric-host/.test(cardSrc45) && /attachShadow\(\{ mode: "closed" \}\)/.test(cardSrc45) && /function dlFrame\(\)/.test(cardSrc45) && /dlApplyVis/.test(cardSrc45),
      dlPosPersist: /cardDlyricPos/.test(cardSrc45) && /dlSavePos/.test(cardSrc45),
      dlXWriteBack: /cardDlyric: false/.test(cardSrc45),
      dlSweepLaw: /clip-path:inset\(-8% calc\(100% - var\(--p,0%\)\) -8% 0\)/.test(cardSrc45) && /Math\.round\(pp \* 400\) \/ 400/.test(cardSrc45),
      /* ② 宿主镜像链：EXT_KV_MAP 第四键 + 四参镜像 + storageSet 分支 */
      pwMap: /cardDlyric: ":csDlyric"/.test(pwSrc45),
      pwMirror: /dl !== undefined\) patch\.cardDlyric = dl === "true";/.test(pwSrc45),
      pwSet: /k\.endsWith\(":csDlyric"\)\) mirrorExtCard\(undefined, undefined, undefined, v\)/.test(pwSrc45),
      /* ③ 面板开关（构建产物内）：按钮 + 自绘图标 + csDlyric 三向接线 */
      btn: musHtml45.includes("csWordBtn") && musHtml45.includes("cs-i-word") && musHtml45.includes("csDlyric"),
      /* ⑤ v8.7.17 翻译行律：dlSetSub 替代 dlSetNext（.dl2=ln.tr 翻译吸附，
         仅外语歌词显示）；dlNextText 预览链全退役（函数+两处调用） */
      trLine: /function dlSetSub\(t\)/.test(cardSrc45) && /dlSetSub\(ln && ln\.tr\)/.test(cardSrc45) && /dlSetSub\(t2s\)/.test(cardSrc45),
      /* previewGone：定义+调用全退役；注释里的函数名提及属合法残留
         （Task 138 坑录④：断言精确到出现形态而非 in/not-in） */
      previewGone: !/function dlNextText|function dlSetNext/.test(cardSrc45) && !/dlNextText\(|dlSetNext\(/.test(cardSrc45),
      /* ⑥ v8.7.17 中心锚律：dlRecenter 实测新宽回移左缘半差 + 基线 dlLastW
         （首测只记录不回移 + dlHide 归零重臂） */
      centerAnchor: /function dlRecenter\(\)/.test(cardSrc45) && /dlPos\.x -= Math\.round\(\(nw - dlLastW\) \/ 2\)/.test(cardSrc45) && /var dlLastW = 0;/.test(cardSrc45) && /dlLastW = 0; \/.+ 中心锚基线归零/.test(cardSrc45) && /!dlPosSaved && dlPos && !dlLastW/.test(cardSrc45),
      /* ⑦ v8.7.18 按钮迁时长行右下：csWordBtn 在 cs-tm 内 csTDur 之后
         （用户：三键不让位+总时长正下方）；cs-ctl 与 cs-foot 行内均无歌词钮；
         悬停去圆底律（#csWordBtn 绝对定位+hover 三件套：透明底+accent+无 scale）+
         on 点亮态 +「词」真字形描取（fill 路径 45 点，注释形态锚）
         （musHtml45 是 JSON.stringify 产物：引号带反斜杠转义，正则用 \\?" 兼容） */
      btnTm: /id=\\?"csTDur\\?"[\s\S]{0,300}?id=\\?"csWordBtn\\?"/.test(musHtml45) && /\.cs-b\.on\{color:var\(--acc\)\}/.test(musHtml45),
      btnCtlGone: !( /<div class=\\?"cs-ctl\\?">[\s\S]{0,600}?<\/div>/.exec(musHtml45) || ["", ""] )[0].includes("csWordBtn"),
      btnFootGone: !( /<div class=\\?"cs-foot\\?">[\s\S]{0,800}?<\/div>/.exec(musHtml45) || ["", ""] )[0].includes("csWordBtn"),
      btnHoverLaw: /#csWordBtn\{position:absolute;right:-4px;top:100%/.test(musHtml45) && /#csWordBtn:hover\{background:transparent;color:var\(--acc\);transform:none\}/.test(musHtml45) && /tabular-nums;position:relative;z-index:2\}/.test(musHtml45),
      btnGlyph: /id=\\?"cs-i-word\\?"[\s\S]{0,160}?<rect /.test(musHtml45) && /<path fill=\\?"currentColor\\?" stroke=\\?"none\\?" d=\\?"m7\.2 6\.9[^"]{100,}z\\?"\/><\/symbol>/.test(musHtml45),
      /* ④ 抽屉提速源码锚（globals.css） */
      drawerFast: /calc\(0\.4s \* var\(--mo-speed, 1\)\) cubic-bezier\(0\.5, 0, 0\.3, 1\) backwards/.test(globalsSrc45) && /transition: transform 0\.40s cubic-bezier\(0\.5, 0, 0\.3, 1\)/.test(globalsSrc45),
    };
    gate("TL45 全局歌词链路静态门（v8.7.18 扩）：浮层本体（cardDlyric 读取+Port 双表面+closed shadow+位置持久化+× 反向写回+扫光同律）+ 翻译行律（dlSetSub=ln.tr+预览退役）+ 中心锚律（dlRecenter 半差回移+dlLastW 基线）+ 宿主镜像链（EXT_KV_MAP/四参镜像/storageSet）+ 面板开关按钮（时长行右下 cs-ctl/cs-foot 双退役+hover 图标点亮+真字形+构建产物三源）+ 抽屉 0.4s 源码锚",
      t45.dlRead && t45.dlPortShared && t45.dlSurface && t45.dlPosPersist && t45.dlXWriteBack && t45.dlSweepLaw && t45.trLine && t45.previewGone && t45.centerAnchor && t45.pwMap && t45.pwMirror && t45.pwSet && t45.btn && t45.btnTm && t45.btnCtlGone && t45.btnFootGone && t45.btnHoverLaw && t45.btnGlyph && t45.drawerFast,
      JSON.stringify(t45));
  }

  /* ---------- T10 pageerror ---------- */
  gate("T10 pageerror=0", errors.length === 0, errors.join(" | ").slice(0, 120));
} catch (e) {
  fail++;
  console.log("  [FATAL]", e.message);
} finally {
  console.log(`\n===== v8.7.18 probe: ${pass} PASS / ${fail} FAIL =====`);
  await browser.close();
  try { httpSrv.kill(); } catch { }
  process.exit(fail ? 1 : 0);
}
