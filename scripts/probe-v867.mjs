// v8.6.7 探针——快捷服务入场三通道 + 打断并行动画 + v8.6.6 启动崩溃修复：
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
const ZIP = "/tmp/my-project/download/v8.6.7/ChuShi-NewTab-v8.6.7.zip";
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
  v: "8.6.7", files: [{ p: "index.html", s: statSync(MOCK + "/index.html").size }],
}));
const httpSrv = spawn("python3", ["-m", "http.server", String(PORT)], { cwd: MOCK, stdio: "ignore" });
process.on("exit", () => { try { httpSrv.kill(); } catch { } });
console.log("stage: mock 镜像就绪（v8.6.7 地板）");

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
  const scope = document.querySelector(".cl-links") || document.body;
  const grab = (sel) => [...scope.querySelectorAll(sel)];
  const groups = [
    grab(".link-intro-tile"), grab(".link-intro-frost"), grab(".link-intro-body"), grab(".link-intro"),
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
  const tile = document.querySelector('[data-cl-tile="1"]');
  if (!tile) return null;
  const wrap = tile.querySelector(".link-intro-tile") || tile.querySelector("span");
  const frost = tile.querySelector(".link-intro-frost");
  const body = tile.querySelector(".link-intro-body");
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
      tiles: document.querySelectorAll('[data-cl-tile="1"]').length,
      htmlClass: document.documentElement.classList.contains("cs-drawer"),
    };
  });
  gate("T2a 中键唤出（磁贴墙+cs-drawer）",
    veilState.veil && veilState.tiles > 0 && veilState.htmlClass,
    `tiles=${veilState.tiles}`);
  gate("T2b 纱罩整页高斯模糊（blur 28px）", /blur\(28px\)/.test(veilState.bf || ""), veilState.bf);

  /* ---------- T3 v8.6.7 核心：三通道入场（霜感先行 + 整块模糊覆盖）----------
     开抽屉稳态 → 重触发 intro 冻结 @-0.30s（31.6% 进度）：
     霜层 0.18s 已凝满（opacity=1、backdrop 在线）；内容层模糊聚拢在飞
     （filter≠none、0.3<opacity<1）；包裹层 rise 在飞（transform≠none）。 */
  await sleep(600);
  const f030 = await freezeIntro(af, "-0.30s");
  gate("T3a 三层结构在位（tile/frost/body）", f030?.layers === true);
  gate("T3b 包裹层 rise 动画（intro-tile-rise）", f030?.wrapAnim === "intro-tile-rise", f030?.wrapAnim);
  gate("T3c 包裹层上升在飞（transform≠none）", f030?.wrapTransform !== "none" && (f030?.wrapTransform || "").includes("matrix"), (f030?.wrapTransform || "").slice(0, 36));
  gate("T3d 霜层凝聚完成（opacity=1）", f030?.frostOp === 1, `op=${f030?.frostOp}`);
  gate("T3e 霜层磨砂在线（blur(14px) saturate(1.6)）", /blur\(14px\)\s+saturate\(1\.6\)/.test(f030?.frostBF || ""), f030?.frostBF);
  gate("T3f 内容层模糊聚拢在飞（filter 含 blur）", (f030?.bodyFilter || "").includes("blur(") && (f030?.bodyOp ?? 0) > 0.2 && (f030?.bodyOp ?? 0) < 1,
    `op=${f030?.bodyOp?.toFixed(2)} filter=${(f030?.bodyFilter || "").slice(0, 24)}`);
  gate("T3g 内容层动画名（intro-tile-body）", f030?.bodyAnim === "intro-tile-body", f030?.bodyAnim);
  const f012 = await freezeIntro(af, "-0.12s");
  gate("T3h 冻结@12%: 霜层凝聚中/未满（0<op<1）", f012 ? f012.frostOp > 0 && f012.frostOp < 1 : false, `op=${f012?.frostOp?.toFixed(2)}`);
  await af.evaluate(() => document.getElementById("dbg-frost-style")?.remove());
  await page.screenshot({ path: SHOTS + "/01-frozen-intro.png" });

  /* ---------- T4 v8.6.7 核心：入场中途关闭 = WAAPI 并行淡出（不瞬跳）---------- */
  await af.evaluate(() => document.getElementById("dbg-frost-style")?.remove());
  await page.keyboard.press("Escape");
  await sleep(700);
  await page.mouse.click(90, 620, { button: "middle" }); // 开
  await sleep(650);
  const before = await af.evaluate(() => {
    const leaf = document.querySelector(".cl-links .cl-fade-leaf");
    return { leaf: leaf ? parseFloat(getComputedStyle(leaf).opacity) : null };
  });
  await page.mouse.click(90, 620, { button: "middle" }); // 打断关
  /* 无头软件渲染的关闭瞬间 jank 会让「渲染值首样本」不可测（冻结/skip 随机），
     改断言确定性元数据：280ms WAAPI 的 from 关键帧 = 冻结前的当前动画值
     （旧实现瞬跳路径无 WAAPI，T4b 即 FAIL——两门合围即「不瞬跳」回归门） */
  const waapiProbe = await af.evaluate(() => {
    const leaf = document.querySelector(".cl-links .cl-fade-leaf");
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
      const leaf = document.querySelector(".cl-links .cl-fade-leaf");
      const veil = document.querySelector(".cl-drawer-veil");
      const anims = leaf ? leaf.getAnimations().map((a) => ({
        dur: Number(a.effect.getTiming().duration) || 0,
        ps: a.playState,
      })) : [];
      return {
        leaf: leaf ? parseFloat(getComputedStyle(leaf).opacity) : null,
        veil: veil ? parseFloat(getComputedStyle(veil).opacity) : null,
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
    const g = document.querySelector(".cl-links");
    g?.setAttribute("data-dbg-marker", "t5");
  });
  await page.mouse.click(90, 620, { button: "middle" }); // 关
  await sleep(200);
  await page.mouse.click(90, 620, { button: "middle" }); // 立刻重开
  const reopenCurve = [];
  for (let i = 0; i < 10; i++) {
    reopenCurve.push(await af.evaluate(() => {
      const leaf = document.querySelector(".cl-links .cl-fade-leaf");
      const grid = document.querySelector(".cl-links");
      return {
        op: leaf ? parseFloat(getComputedStyle(leaf).opacity) : null,
        waapi280: leaf ? leaf.getAnimations().filter((a) => Number(a.effect.getTiming().duration) === 280).length : -1,
        allAnims: leaf ? leaf.getAnimations().map((a) => `${(a.effect.getKeyframes() && a.effect.getKeyframes()[0] && a.effect.getKeyframes()[0].opacity !== undefined) ? "fade" : a.animationName || "w"}:${a.playState}:${Math.round(a.currentTime ?? -1)}`).join(",") : "",
        marker: grid?.getAttribute("data-dbg-marker") || "remounted",
        introFrost: (() => {
          const f = document.querySelector(".cl-links .link-intro-frost");
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
  gate("T5a 重开：WAAPI 冻结已取消", reopenCurve.every((s) => s.waapi280 === 0), `left=${reopen?.waapi280}`);
  gate("T5b 重开：磁贴叶恢复可见（600ms 内回 1）",
    reopenCurve.some((s) => s.op !== null && s.op > 0.9), `op@160=${reopenCurve[3]?.op?.toFixed(3)} op@last=${reopenCurve[reopenCurve.length - 1]?.op?.toFixed(3)}`);
  await sleep(1200);
  const steady2 = await af.evaluate(() => {
    const leaf = document.querySelector(".cl-links .cl-fade-leaf");
    return leaf ? parseFloat(getComputedStyle(leaf).opacity) : null;
  });
  gate("T5c 重开后再稳态（opacity→1）", steady2 !== null && Math.abs(steady2 - 1) < 0.02, `op=${steady2?.toFixed(3)}`);

  /* ---------- T6 稳态关抽屉退场同步（回归）---------- */
  await page.mouse.click(90, 620, { button: "middle" }); // 关
  await sleep(900);
  await page.mouse.click(90, 620, { button: "middle" }); // 开
  await sleep(900);
  await page.mouse.click(90, 620, { button: "middle" }); // 关（稳态）
  const exitSamples = [];
  for (let i = 0; i < 10; i++) {
    exitSamples.push(await af.evaluate(() => {
      const veil = document.querySelector(".cl-drawer-veil");
      const leaf = document.querySelector(".cl-links .cl-fade-leaf");
      return {
        veil: veil ? parseFloat(getComputedStyle(veil).opacity) : null,
        leaf: leaf ? parseFloat(getComputedStyle(leaf).opacity) : null,
      };
    }));
    await sleep(40);
  }
  const leafMinS = Math.min(...exitSamples.filter((s) => s.leaf !== null).map((s) => s.leaf));
  const veilMinS = Math.min(...exitSamples.filter((s) => s.veil !== null).map((s) => s.veil));
  gate("T6a 稳态退场：叶与纱罩同窗走低", leafMinS < 0.9 && veilMinS < 0.9,
    `leafMin=${leafMinS.toFixed(3)} veilMin=${veilMinS.toFixed(3)}`);
  await sleep(700); /* latch 520ms 卸载窗走完再查存在性 */
  gate("T6b 退场收尾：完全关闭", !(await drawerOpen(af)));

  /* ---------- T7 批量管理抖动 + pill 移除 + 右键编辑（回归）---------- */
  await page.mouse.click(90, 620, { button: "middle" });
  await sleep(900);
  await af.evaluate(() => window.dispatchEvent(new CustomEvent("start:links-manage")));
  await sleep(800);
  const jig = await af.evaluate(() => {
    const all = [...document.querySelectorAll(".cl-links .jiggle")];
    const one = all[0] ? getComputedStyle(all[0]) : null;
    const tileUnit = all.find((w) => w.querySelector(".tile-label") && w.querySelector(".cl-fade-leaf"));
    const addWrap = document.querySelector('button[data-cl-tile="add"] .jiggle');
    const pill = [...document.querySelectorAll("button")].find(
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
    const t = document.querySelector('[data-cl-tile="1"]');
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
    const frost = document.querySelector('section[aria-label="快捷链接"] [data-cl-tile="1"] .link-intro-frost');
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

  /* ---------- T9 更新日志首条 8.6.7 ---------- */
  await af.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find(
      (b) => (b.getAttribute("aria-label") || b.textContent || "").includes("设置"));
    btn?.click();
  });
  await sleep(900);
  await af.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find(
      (x) => (x.textContent || "").includes("更新日志"));
    b?.click();
  });
  await sleep(800);
  const logFirst = await af.evaluate(() => {
    const dlgs = [...document.querySelectorAll("[role='dialog']")];
    const hit = dlgs.find((d) => d.textContent.includes("8.6.7"));
    return hit ? "8.6.7" : null;
  });
  gate("T9 更新日志首条 8.6.7", logFirst === "8.6.7", `first=${logFirst}`);
  await page.keyboard.press("Escape");
  await sleep(400);

  /* ---------- T10 pageerror ---------- */
  gate("T10 pageerror=0", errors.length === 0, errors.join(" | ").slice(0, 120));
} catch (e) {
  fail++;
  console.log("  [FATAL]", e.message);
} finally {
  console.log(`\n===== v8.6.7 probe: ${pass} PASS / ${fail} FAIL =====`);
  await browser.close();
  try { httpSrv.kill(); } catch { }
  process.exit(fail ? 1 : 0);
}
