// v8.6.24 探针——磨砂存活 2.0（壳体入退场零 opacity）+ 阴影同拍 + 壁纸轻纱 3px：
// ① 磁贴图标三层拆分：包裹层 rise / 霜层 0.18s 凝聚（backdrop-filter 恒在线）/
//    内容层整块模糊聚拢——冻结帧断言「霜感先行 + 模糊覆盖」两头都在
// ② 入场中途关闭 = 全叶 WAAPI 280ms 冻结-淡出（与纱罩并行，不再瞬跳消失）
// ③ 退场窗内快速重开 = WAAPI cancel、磁贴恢复
// ④ boot 全链（v8.6.6 工作树残留语法残缺若在，T1 即 FATAL）
// 承 v8.6.3-v8.6.6 全部回归门。
import { chromium } from "playwright-core";
import crypto from "crypto";
import { execSync, spawn } from "child_process";
import { mkdirSync, rmSync, writeFileSync, readFileSync, statSync } from "fs";

const ROOT = "/tmp/ext-v867";
const ZIP = "/tmp/my-project/download/v8.6.24/ChuShi-NewTab-v8.6.24.zip";
const MOCK = "/tmp/v867-mock";
const PORT = 26997;
const SHOTS = "/tmp/probe-v867-shots";

rmSync(ROOT, { recursive: true, force: true });
rmSync(MOCK, { recursive: true, force: true });
rmSync("/tmp/ext-v867-profile", { recursive: true, force: true });
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
  v: "8.6.24", files: [{ p: "index.html", s: statSync(MOCK + "/index.html").size }],
}));
const httpSrv = spawn("python3", ["-m", "http.server", String(PORT)], { cwd: MOCK, stdio: "ignore" });
process.on("exit", () => { try { httpSrv.kill(); } catch { } });
console.log("stage: mock 镜像就绪（v8.6.24 地板）");

const EXT_ID = (() => {
  const h = crypto.createHash("sha256").update(Buffer.from(ROOT)).digest("hex").slice(0, 32);
  return [...h].map((c) => String.fromCharCode(97 + (parseInt(c, 16) % 26))).join("");
})();
const EXT_URL = (p) => `chrome-extension://${EXT_ID}/${p}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const withTimeout = (p, ms, tag) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`TIMEOUT ${tag}`)), ms))]);

const browser = await withTimeout(
  chromium.launchPersistentContext("/tmp/ext-v867-profile", {
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
/* v8.6.24：抽屉形态的隐形布局克隆（.cl-layout-ghost）与真实抽屉共享全部
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
  /* v8.6.24：入场播完组件会摘 intro 类（根治拖拽让位重播）——按永驻语义
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
  await sleep(700);
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
  gate("T2b 纱罩整页高斯模糊（blur 28px）", /blur\(28px\)/.test(veilState.bf || ""), veilState.bf);

  /* ---------- T3 v8.6.24 核心：三通道入场（霜感先行 + 整块模糊覆盖）----------
     开抽屉稳态 → 重触发 intro 冻结 @-0.30s（31.6% 进度）：
     霜层 0.18s 已凝满（opacity=1、backdrop 在线）；内容层模糊聚拢在飞
     （filter≠none、0.3<opacity<1）；包裹层 rise 在飞（transform≠none）。 */
  await sleep(600);
  const f030 = await freezeIntro(af, "-0.30s");
  gate("T3a 三层结构在位（tile/frost/body）", f030?.layers === true);
  gate("T3b 包裹层 rise+shadow 双通道动画（v8.6.24 阴影同拍）",
    typeof f030?.wrapAnim === "string" && f030.wrapAnim.includes("intro-tile-rise") && f030.wrapAnim.includes("intro-tile-shadow"),
    f030?.wrapAnim);
  gate("T3c 包裹层上升在飞（transform≠none）", f030?.wrapTransform !== "none" && (f030?.wrapTransform || "").includes("matrix"), (f030?.wrapTransform || "").slice(0, 36));
  gate("T3d 霜层凝聚完成（opacity=1）", f030?.frostOp === 1, `op=${f030?.frostOp}`);
  gate("T3e 霜层磨砂在线（blur(14px) saturate(1.6)）", /blur\(14px\)\s+saturate\(1\.6\)/.test(f030?.frostBF || ""), f030?.frostBF);
  gate("T3f 内容层模糊聚拢在飞（filter 含 blur）", (f030?.bodyFilter || "").includes("blur(") && (f030?.bodyOp ?? 0) > 0.2 && (f030?.bodyOp ?? 0) < 1,
    `op=${f030?.bodyOp?.toFixed(2)} filter=${(f030?.bodyFilter || "").slice(0, 24)}`);
  gate("T3g 内容层动画名（intro-tile-body）", f030?.bodyAnim === "intro-tile-body", f030?.bodyAnim);
  const f012 = await freezeIntro(af, "-0.12s");
  const blur012 = parseFloat(((f012?.frostBF || "").match(/blur\(([\d.]+)px\)/) || [])[1] || "0");
  gate("T3h 冻结@12%: 霜层 blur 凝聚中（v8.6.24 底层律：见证由 opacity 改 blur 值，1<blur<14）",
    blur012 > 1.2 && blur012 < 13.9, `blur=${blur012.toFixed(1)}px bf=${f012?.frostBF}`);
  await af.evaluate(() => document.getElementById("dbg-frost-style")?.remove());
  await page.screenshot({ path: SHOTS + "/01-frozen-intro.png" });

  /* ---------- T4 v8.6.24 核心：入场中途关闭 = WAAPI 并行淡出（不瞬跳）---------- */
  await af.evaluate(() => document.getElementById("dbg-frost-style")?.remove());
  await page.keyboard.press("Escape");
  await sleep(700);
  await page.mouse.click(90, 620, { button: "middle" }); // 开
  await sleep(900); /* v8.6.24：650→900——远离霜层 0.24s 结束点，qCl 首命中是常驻叶
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
     改断言确定性元数据：280ms WAAPI 的 from 关键帧 = 冻结前的当前动画值
     （旧实现瞬跳路径无 WAAPI，T4b 即 FAIL——两门合围即「不瞬跳」回归门） */
  const waapiProbe = await af.evaluate(() => {
    const leaf = window.qCl(".cl-links .cl-fade-leaf");
    if (!leaf) return null;
    const a = leaf.getAnimations().find((x) => Number(x.effect.getTiming().duration) === 280);
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
        waapi280: anims.some((a) => a.dur === 280),
      };
    }));
    await sleep(35);
  }
  const leafMin = Math.min(...curve.filter((s) => s.leaf !== null).map((s) => s.leaf));
  gate("T4b 磁贴叶挂 280ms WAAPI 并行淡出（与纱罩同频）",
    curve.some((s) => s.waapi280), `waapi=${curve.filter((s) => s.waapi280).length} leafMin=${Number.isFinite(leafMin) ? leafMin.toFixed(3) : "?"}`);
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
  /* v8.6.24 断言修正：旧断言要求重开首采样 WAAPI 即取消——headless 软渲染
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
  /* v8.6.24：退场见证改 transition 事件（确定性）——rAF 值采样在探针高负载下
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
      rows.push({
        t: Math.round(performance.now() - t0),
        conn: veil0 ? veil0.isConnected : "null",
        leaf: leaf && leaf.isConnected ? parseFloat(getComputedStyle(leaf).opacity) : null,
      });
      if (performance.now() - t0 < 900) requestAnimationFrame(tick); else res({ rows, dbg, moDbg: dbg });
    };
    requestAnimationFrame(tick);
  }));
  const leafMinS = Math.min(...exitCurve.rows.filter((s) => s.leaf !== null).map((s) => s.leaf));
  const veilEvts = await af.evaluate(() => window.__veilEvts || []);
  const bfEnd = veilEvts.find((e) => e.k === "end");
  gate("T6a 稳态退场：叶淡出 + 纱罩 blur 过渡真实走完（v8.6.24 transition 事件见证）",
    leafMinS < 0.9 && !!bfEnd && bfEnd.dur >= 100 && bfEnd.dur <= 400,
    `leafMin=${leafMinS.toFixed(3)} bfEnd=${bfEnd ? bfEnd.dur + "ms" : "NONE"} evts=${veilEvts.length}`);
  await sleep(700); /* latch 520ms 卸载窗走完再查存在性 */
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

  /* ---------- T9 更新日志首条 8.6.24 ---------- */
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
    const hit = dlgs.find((d) => d.textContent.includes("8.6.24"));
    return hit ? "8.6.24" : null;
  });
  gate("T9 更新日志首条 8.6.24", logFirst === "8.6.24", `first=${logFirst}`);
  await page.keyboard.press("Escape");
  await sleep(400);

  /* ---------- TL v8.6.24 核心：浅色「瓷釉」重写 ----------
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
  gate("TL3 v8.6.24 磁贴统一深色釉：浅色霜层=暗雾 rgba(12,12,18,0.2)",
    lightState.frostBg === "rgba(12, 12, 18, 0.2)", lightState.frostBg);
  gate("TL4 浅色磁贴磨砂在线（blur(14px) saturate(1.6)）",
    /blur\(14px\)\s+saturate\(1\.6\)/.test(lightState.frostBf), lightState.frostBf);
  gate("TL5 亮玻璃药丸面（rgba(255,255,255,0.62)）",
    lightState.pillBg === "rgba(255, 255, 255, 0.62)", lightState.pillBg);
  /* TL13c v8.6.24：dock 面板 glass-card 磨砂在线（浅色） */
  await af.evaluate(() => { const b = document.querySelectorAll(".dock-btn")[0]; if (b) b.click(); });
  await sleep(900);
  const panelLight = await af.evaluate(() => {
    const c = document.querySelector(".glass-card");
    return c ? { bf: getComputedStyle(c).backdropFilter, bg: getComputedStyle(c).backgroundColor } : null;
  });
  gate("TL13c 浅色 glass-card 磨砂在线（blur(20px) saturate(1.5) + 白玻璃 0.62）",
    !!panelLight && /blur\(20px\)\s+saturate\(1\.5\)/.test(panelLight.bf) && panelLight.bg === "rgba(255, 255, 255, 0.62)",
    `bf=${panelLight && panelLight.bf} bg=${panelLight && panelLight.bg}`);
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
  /* TL13c2 v8.6.24：深色 glass-card 磨砂在线 */
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

  /* ---------- TL9 v8.6.24 重写：掠影白字统一 + 零光效 + vignette 退役 + 常驻壁纸模糊 ----------
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
    pmProbe.tileFrost === "rgba(12, 12, 18, 0.2)" && pmProbe.tileLetter === "oklch(0.967 0.001 286.375)",
    `frost=${pmProbe.tileFrost} letter=${pmProbe.tileLetter}`);
  gate("TL13b 浅掠影 dock 按钮回落基线墨系（与辉光/纯色一致 zinc-500）",
    pmProbe.dockBtn === "oklch(0.552 0.016 285.938)",
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
  gate("TL9d 常驻+掠影：壁纸极轻薄纱（v8.6.24 再减 blur 3px）",
    /blur\(3px\)/.test(pmProbe.blurBf || ""),
    `bf=${pmProbe.blurBf}`);
  gate("TL9e 浅色掠影玻璃面回归主题（瓷釉浅药丸+深墨输入字）",
    pmProbe.pillBg === "rgba(255, 255, 255, 0.72)" && pmProbe.inputColor === "oklch(0.21 0.006 285.885)",
    `pill=${pmProbe.pillBg} input=${pmProbe.inputColor}`);
  await page.screenshot({ path: SHOTS + "/06-wp-light.png" });

  /* ---------- TL10/TL11 v8.6.24：抽屉形态壁纸不模糊 + 时钟搜索与常驻同位 ---------- */
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
  gate("TL10 抽屉+掠影：壁纸不模糊 + 隐形占位在位且不可见",
    /blur\(0px\)/.test(drProbe.bf || "") && drProbe.ghost && drProbe.ghostHidden,
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
    labelLive === "oklch(0.442 0.017 285.786)",
    `label=${labelLive}`);
  /* ---------- TL12 v8.6.24：主页面禁滚（真实滚轮输入两轴归零） ---------- */
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

  /* ---------- TL14 v8.6.24：磨砂存活 2.0 + 阴影同拍（CSSOM 扫描，稳态无关时序） ---------- */
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
        kfOut: kfPack(["palette-out-kf", "dialog-sink", "panel-sink", "ctx-out-kf", "glass-card-out-kf", "veil-fade"]),
        kfIn: kfPack(["card-in", "panel-fade", "ctx-in-kf", "intro-tile-shadow", "veil-in", "intro-tile-frost", "dock-rise", "pill-shell-in"]),
        veilRules: rules.filter((x) => x.includes("cl-drawer-veil")),
        outRules: rules.filter((x) => x.includes("veil-out") || x.includes("veil-hold-")),
        cascade: findRule(".panel-sink .glass-card"),
        closingShell: findRule("cs-drawer-closing .tile-shell"),
        closingIntro: findRule("cs-drawer-closing .link-intro-tile"),
      };
    });
    const outBad = cssScan.kfOut.filter((k) => k.bad);
    const gcoT = cssScan.kfOut.find((k) => k.n === "glass-card-out-kf")?.t || "";
    gate("TL14a 壳体退场关键帧零 opacity（磨砂全程在线）",
      outBad.length === 0 && /blur\(1px\)\s*saturate\(1\.5\)/.test(gcoT.replace(/\s+/g, " ")),
      (outBad.length ? "缺/含opacity:" + outBad.map((k) => k.n).join(",") + " | " : "") +
      "gco=" + (gcoT ? gcoT.replace(/\s+/g, " ").slice(0, 200) : "NULL_KF"));
    const inBad = cssScan.kfIn.filter((k) => k.bad);
    gate("TL14b 玻璃入场关键帧底色凝入（无 opacity）+ 阴影通道存在",
      inBad.length === 0,
      inBad.length ? "缺/含opacity:" + inBad.map((k) => k.n).join(",") : "card-in/panel-fade/ctx-in-kf/intro-tile-shadow 全部无 opacity");
    gate("TL14c 玻璃卡退场级联 + closing 阴影选择器锚永驻类",
      !!cssScan.cascade && !!cssScan.closingShell && !!cssScan.closingIntro,
      `cascade=${!!cssScan.cascade} closingTileShell=${!!cssScan.closingShell} closingIntro=${!!cssScan.closingIntro}`);
    gate("TL14d 中途关闭掐阴影动画通道（closing 收窄 animation-name 只留 rise）",
      cssScan.closingIntro && /animation-name\s*:\s*intro-tile-rise/.test(cssScan.closingIntro),
      cssScan.closingIntro?.slice(0, 90));
    /* ---------- TL14e/f v8.6.24 磨砂写入底层 ---------- */
    const veilInT = (cssScan.kfIn.find((k) => k.n === "veil-in")?.t || "").replace(/\s+/g, " ");
    const veilOutT = (cssScan.kfOut.find((k) => k.n === "veil-fade")?.t || "").replace(/\s+/g, " ");
    gate("TL14e 遮罩族关键帧磨砂化（veil-in/veil-fade 走 blur 底层通道，零 opacity）",
      /backdrop-filter/.test(veilInT) && /blur\(1px\)\s*saturate\(1\.5\)/.test(veilInT) &&
      /backdrop-filter/.test(veilOutT) && /blur\(1px\)\s*saturate\(1\.5\)/.test(veilOutT),
      `in=${veilInT.slice(0, 120)} | out=${veilOutT.slice(0, 120)}`);
    const veilBase = (cssScan.veilRules.find((x) => x.includes(".cl-drawer-veil") && !x.includes("data-veil") && !x.includes("::before") && !x.includes("cs-lite")) || "");
    const veilOpen = (cssScan.veilRules.find((x) => x.includes('.cl-drawer-veil[data-veil="1"]') && !x.includes("::before")) || "");
    const veilBefore = (cssScan.veilRules.find((x) => x.includes(".cl-drawer-veil::before")) || "");
    gate("TL14f 纱罩底层律（base blur transition + open 28px + ::before 染色层）",
      /backdrop-filter\s*:\s*blur\(1px\)/.test(veilBase.replace(/\s+/g, " ")) &&
      /blur\(28px\)/.test(veilOpen.replace(/\s+/g, " ")) && !!veilBefore,
      `base=${veilBase ? "ok" : "NULL"} open=${veilOpen ? "ok" : "NULL"} before=${veilBefore ? "ok" : "NULL"}`);
    /* ---------- TL14g/h v8.6.24 感知同步律（blur 领先/驻留） ---------- */
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
    const veilOpenTr = /0\.12s/.test(veilOpen.replace(/\s+/g, " "));
    const veilCloseTr = /0\.14s\s+cubic-bezier\(0\.4,\s*0,\s*1,\s*1\)\s+0\.14s/.test(veilBase.replace(/\s+/g, " "));
    gate("TL14h 面板随纱同散级联 + hold 适配类 + 纱罩开合变速",
      !!cardCascade && !!contentCascade && !!holdNone && !!hold2xl && veilOpenTr && veilCloseTr,
      `card=${!!cardCascade} content=${!!contentCascade} none=${!!holdNone} 2xl=${!!hold2xl} open12=${veilOpenTr} close1414=${veilCloseTr}`);
  }

  /* ---------- T10 pageerror ---------- */
  gate("T10 pageerror=0", errors.length === 0, errors.join(" | ").slice(0, 120));
} catch (e) {
  fail++;
  console.log("  [FATAL]", e.message);
} finally {
  console.log(`\n===== v8.6.24 probe: ${pass} PASS / ${fail} FAIL =====`);
  await browser.close();
  try { httpSrv.kill(); } catch { }
  process.exit(fail ? 1 : 0);
}
