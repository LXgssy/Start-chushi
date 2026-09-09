// v8.2.0 部件律动高光行为验证（playwright + 打包产物真代码，v814-lyric 同款挂载）：
//   G1 bass 驱动：now().bass=0.6 → .cs-glow opacity≈0.42 + scale>1（合成器友好直写）
//   G2 bass 归零/暂停：样式交还样式表（基态 .24 由 .cs-playing 类接管，无内联残留）
//   G3 旧宿主降级：now() 无 bass 字段 → 高光零内联样式（静态基态）
//   G4 prefers-reduced-motion：bass 在场也不弹（无障碍律）
//   G5 退出动画交还：从 bass>0 切到 0 后 transition 被清空（类过渡接管渐隐）
import { chromium } from "playwright-core";

const CSHZ = process.env.CSHZ_PATH || "/home/z/my-project/examples/初始SMTC音乐预设.cshz";

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
    cover: "", pluginVer: "8.2.0", smtcVer: "3.2.11", needsUpdate: false,
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
/* 播放态翻转走快照（部件 effPlaying() 语义：读 snap.playing，与面板同源） */
const setPlaying = (p) => page.evaluate((p2) => {
  const iw = document.getElementById("w").contentWindow;
  iw.__state.snap = Object.assign({}, iw.__state.snap, { playing: p2 });
  if (iw.__state.cb) iw.__state.cb(iw.__state.snap);
}, p);
const glowState = () => page.evaluate(() => {
  const doc = document.getElementById("w").contentDocument;
  const g = doc.querySelector(".cs-glow");
  return {
    opacity: g.style.opacity,
    transform: g.style.transform,
    transition: g.style.transition,
    computed: getComputedStyle(g).opacity,
  };
});

let passed = 0, failed = 0;
function ok(cond, name, extra) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}${extra ? " — " + extra : ""}`); }
}

/* ---- G1 bass 驱动 ---- */
await mount();
await setNow({ bass: 0.6 });
await page.waitForTimeout(120);
let g = await glowState();
ok(Math.abs(parseFloat(g.opacity) - 0.42) < 0.01, "G1 bass=0.6 → opacity≈0.42（0.24+0.6×0.3）", JSON.stringify(g));
ok(/scale\(1\.0[3-4]/.test(g.transform), "G1 transform scale≈1.033", g.transform);
ok(g.transition === "none", "G1 逐帧直写时 transition=none（防过渡追逐）");

/* ---- G2 归零交还样式表 ---- */
await setNow({ bass: 0 });
await page.waitForTimeout(120);
g = await glowState();
ok(g.opacity === "" && g.transform === "" && g.transition === "", "G2 bass=0 → 内联样式全交还样式表", JSON.stringify(g));

/* ---- G3 旧宿主（now 无 bass 字段）守卫降级 ---- */
await setNow({ bass: undefined });
await page.waitForTimeout(120);
g = await glowState();
ok(g.opacity === "", "G3 旧宿主无 bass → 零内联样式（静态基态）", JSON.stringify(g));

/* ---- G4 prefers-reduced-motion ---- */
await mount({ reducedMotion: "reduce" });
await setNow({ bass: 0.8 });
await page.waitForTimeout(120);
g = await glowState();
ok(g.opacity === "", "G4 reduced-motion → 律动不生效", JSON.stringify(g));

/* ---- G5 播放门：暂停时 bass 在场也不弹（effPlaying 走快照，面板同源语义） ---- */
await mount();
await setNow({ bass: 0.8 });
await setPlaying(false);
await page.waitForTimeout(120);
g = await glowState();
ok(g.opacity === "", "G5 暂停态 → 律动不生效", JSON.stringify(g));
await setPlaying(true);
await page.waitForTimeout(120);
g = await glowState();
ok(g.opacity !== "", "G5 恢复播放 → 律动回归", JSON.stringify(g));

/* ---- 零异常 ---- */
ok(pageErrors.length === 0, "部件零 pageerror", pageErrors.slice(0, 3).join(" | "));

console.log(`\n=== v8.2.0 部件律动高光: ${passed} 通过, ${failed} 失败 ===`);
await browser.close();
process.exit(failed ? 1 : 0);
