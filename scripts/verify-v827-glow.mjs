// v8.2.7 部件律动「变亮律 + 三频段细节」行为验证（v820-glow 同款挂载，公式全换）：
//   G1 低音驱动：bass=0.6 → glow opacity≈0.54（0.24+0.6×0.5）+ scale≈1.03 +
//      封面 filter brightness(1.18)（变亮律本体——旧版只晕外圈=「变暗」观感）
//   G2 中频细节环：bands 中频段 → .cs-ring opacity>0 且 glow 高于基态
//      （「有些中音跟没有律动一样」的根治面）
//   G3 高频饱和：bands 高频段 → saturate>1
//   G4 静默交还：bass=0/bands=null → 内联样式全交还样式表（含 img filter/ring）
//   G5 旧宿主降级：now() 无 bass 字段 → 零内联（静态基态，v8.2.0 律延续）
//   G6 prefers-reduced-motion / G7 暂停门（effPlaying 走快照，面板同源语义）
import { chromium } from "playwright-core";

const CSHZ = process.env.CSHZ_PATH || "/tmp/my-project/examples/初始SMTC音乐预设.cshz";

import { execSync } from "child_process";
import { readFileSync, mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

function unpack(cshz) {
  const tmp = mkdtempSync(join(tmpdir(), "cshz-"));
  execSync(`cd ${tmp} && unzip -q -o "${cshz}" manifest.json`);
  const m = JSON.parse(readFileSync(join(tmp, "manifest.json"), "utf8"));
  return m.widgets[0].html;
}

const html = unpack(CSHZ);

const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`,
  args: ["--no-sandbox"],
});
const page = await browser.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(String(e)));

async function mount({ reducedMotion = "no-preference" } = {}) {
  await page.emulateMedia({ reducedMotion });
  await page.setContent(`<iframe id="w" style="width:380px;height:400px"></iframe>`);
  const snap = {
    connected: true, playing: true, title: "T", artist: "A", album: "L", app: "NCM",
    cover: "", pluginVer: "8.2.7", smtcVer: "3.2.11", needsUpdate: false,
    needsBridge: false, engineOld: false, seekNote: "", cmdLast: null,
    lyric: null, lyricRev: "r1",
  };
  await page.evaluate(({ html, snap }) => {
    const iw = document.getElementById("w").contentWindow;
    iw.__errs = [];
    iw.onerror = function (m) { iw.__errs.push(String(m)); };
    iw.__state = { snap, now: { position: 3, duration: 300, progress: 0.01, playing: true, fadeMs: 260, lineIndex: -1, lastLine: -1, wordIndex: -1, wordProgress: 0, lineProgress: 0, lineText: "", lineTr: "", wordText: "" }, cb: null };
    iw.chushi = {
      resize() {}, close() {},
      storage: { get: () => Promise.resolve(null), set: () => Promise.resolve(true) },
      music: {
        snapshot: () => iw.__state.snap,
        now: () => iw.__state.now,
        subscribe: (cb) => { iw.__state.cb = cb; setTimeout(() => cb(iw.__state.snap), 30); },
        toggle: () => Promise.resolve(true), prev: () => Promise.resolve(true),
        next: () => Promise.resolve(true), seek: () => {},
      },
    };
    const doc = document.getElementById("w").contentDocument;
    doc.open(); doc.write(html); doc.close();
  }, { html, snap });
  await page.waitForTimeout(250);
}

const setNow = (extra) => page.evaluate((x) => {
  const iw = document.getElementById("w").contentWindow;
  iw.__state.now = Object.assign({}, iw.__state.now, x);
}, extra);
const setPlaying = (p) => page.evaluate((p2) => {
  const iw = document.getElementById("w").contentWindow;
  iw.__state.snap = Object.assign({}, iw.__state.snap, { playing: p2 });
  if (iw.__state.cb) iw.__state.cb(iw.__state.snap);
}, p);
const glowState = () => page.evaluate(() => {
  const doc = document.getElementById("w").contentDocument;
  const g = doc.querySelector(".cs-glow");
  const ring = doc.querySelector(".cs-ring");
  const img = doc.getElementById("csCoverImg");
  return {
    opacity: g.style.opacity,
    transform: g.style.transform,
    transition: g.style.transition,
    computed: getComputedStyle(g).opacity,
    ring: ring ? ring.style.opacity : "(no ring el)",
    imgFilter: img ? img.style.filter : "(no img)",
  };
});

let passed = 0, failed = 0;
function ok(cond, name, extra) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}${extra ? " — " + extra : ""}`); }
}

/* ---- G1 低音驱动（变亮律本体） ---- */
await mount();
await setNow({ bass: 0.6, bands: null });
await page.waitForTimeout(120);
let g = await glowState();
ok(Math.abs(parseFloat(g.opacity) - 0.54) < 0.011, "G1a bass=0.6 → glow opacity≈0.54（0.24+0.6×0.5，旧版 0.42）", JSON.stringify(g));
ok(/scale\(1\.02[8-9]|scale\(1\.03/.test(g.transform), "G1b transform scale≈1.03（1+0.6×0.05）", g.transform);
ok(g.imgFilter.indexOf("brightness(1.18)") >= 0, "G1c 封面提亮 filter brightness(1.18)=1+0.6×0.3（变亮律）", g.imgFilter);
ok(g.transition === "none", "G1d 逐帧直写时 transition=none（防过渡追逐）", g.transition);

/* ---- G2 中频细节环（bass 哑火中频独舞） ---- */
const midBands = new Array(16).fill(0); midBands[5] = 0.6; midBands[12] = 0.2;
await setNow({ bass: 0.001, bands: midBands });
await page.waitForTimeout(120);
g = await glowState();
const ro = parseFloat(g.ring);
ok(ro > 0.05, `G2a 中频驱动细节环 opacity=${g.ring} >0.05（无中频死区）`, JSON.stringify(g));
ok(parseFloat(g.opacity) > 0.245, "G2b 中频抬升辉光（0.24 基态之上）", g.opacity);
ok(g.imgFilter.indexOf("brightness(1.008)") >= 0, "G2c 中频微贡献亮度（1+0.086×0.09）", g.imgFilter);

/* ---- G3 高频饱和 ---- */
const hiBands = new Array(16).fill(0); hiBands[13] = 0.9;
await setNow({ bass: 0.001, bands: hiBands });
await page.waitForTimeout(120);
g = await glowState();
ok(g.imgFilter.indexOf("saturate(1.045)") >= 0, "G3 高频驱动饱和 saturate(1.045)=1+0.15×0.3", g.imgFilter);

/* ---- G4 静默交还（含 img filter 与 ring） ---- */
await setNow({ bass: 0, bands: null });
await page.waitForTimeout(150);
g = await glowState();
ok(g.opacity === "" && g.transform === "" && g.transition === "" && g.imgFilter === "" && g.ring === "",
   "G4 静默 → 内联样式全交还样式表（glow+ring+img filter）", JSON.stringify(g));

/* ---- G5 旧宿主（now 无 bass/bands 字段）守卫降级 ---- */
await setNow({ bass: undefined, bands: undefined });
await page.waitForTimeout(120);
g = await glowState();
ok(g.opacity === "" && g.imgFilter === "", "G5 旧宿主无 bass → 零内联样式（静态基态）", JSON.stringify(g));

/* ---- G6 prefers-reduced-motion ---- */
await mount({ reducedMotion: "reduce" });
await setNow({ bass: 0.8, bands: midBands });
await page.waitForTimeout(120);
g = await glowState();
ok(g.opacity === "" && g.imgFilter === "", "G6 reduced-motion → 律动不生效", JSON.stringify(g));

/* ---- G7 播放门：暂停时数据在场也不弹 ---- */
await mount();
await setNow({ bass: 0.8, bands: midBands });
await setPlaying(false);
await page.waitForTimeout(120);
g = await glowState();
ok(g.opacity === "", "G7a 暂停态 → 律动不生效", JSON.stringify(g));
await setPlaying(true);
await page.waitForTimeout(120);
g = await glowState();
ok(g.opacity !== "" && g.imgFilter !== "", "G7b 恢复播放 → 律动回归（glow+亮度）", JSON.stringify(g));

/* ---- 零异常 ---- */
ok(pageErrors.length === 0, "部件零 pageerror", pageErrors.slice(0, 3).join(" | "));

console.log(`\n=== v8.2.7 部件律动（变亮律+细节环）: ${passed} 通过, ${failed} 失败 ===`);
await browser.close();
process.exit(failed ? 1 : 0);
