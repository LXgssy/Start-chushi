// v8.1.4 部件歌词行为验证（playwright + 打包产物真代码）：
//   L1 回退高光残留根治（核心复现：旧部件 FAIL / 新部件 PASS）
//   L2 句尾渐隐（扫光 100% 后 250ms 宽限即渐隐，不等下一句）
//   L3 行内回退重扫撤销（done 撤销 + 重新扫光）
//   L4 间奏 ref=宿主 lastLine（回退落间奏不再误标已唱）
//   L5 强行逐字开关（默认关=lrc 逐行 / 开=伪逐字 / yrc 恒逐字 / storage 持久化）
//   L6 进度条悬停动画 scaleY 合成层化（无 height 过渡）
//   L7 阴性对照：v8.1.2 部件跑 L1 场景复现残留（实锢修复真值）
import { chromium } from "playwright-core";
import { execSync } from "child_process";
import { writeFileSync, readFileSync, mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const CSHZ_NEW = process.env.CSHZ_PATH || "/home/z/my-project/examples/初始SMTC音乐预设.cshz";
const CSHZ_OLD = "/home/z/my-project/download/v8.1.2/ChuShi-Music-Preset-8.1.2.cshz";

function unpack(cshz) {
  const tmp = mkdtempSync(join(tmpdir(), "cshz-"));
  execSync(`cd ${tmp} && unzip -q -o "${cshz}" manifest.json`);
  const m = JSON.parse(readFileSync(join(tmp, "manifest.json"), "utf8"));
  return m.widgets[0].html;
}

/* 6 行 × 3 词场景歌词（部件直喂 snapshot.lyric，绕过宿主解析） */
function lyric6(src) {
  const lines = [];
  for (let i = 0; i < 6; i++) {
    const s = 1000 + i * 3000;
    lines.push({
      s, e: s + 2400, t: `第${i + 1}句歌词内容`, tr: "",
      w: [0, 1, 2].map((k) => ({ s: s + k * 800, d: 800, t: `词${i * 3 + k + 1}` })),
    });
  }
  return { mode: 1, lines, songId: 42, src };
}
function nowState(lineIndex, wordIndex, wordProgress, extra) {
  return Object.assign({
    position: 3, duration: 300, progress: 0.01, playing: true, fadeMs: 260,
    lineIndex, lastLine: -1, wordIndex, wordProgress, lineProgress: 0,
    lineText: "", lineTr: "", wordText: "",
  }, extra || {});
}

const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`,
  args: ["--no-sandbox"],
});
const page = await browser.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(String(e)));

/* 挂一个部件 iframe（stub 宿主），返回后用 __state 驱动 */
async function mount(html, { src = "lrc", storageGet = null } = {}) {
  await page.setContent(`<iframe id="w" style="width:380px;height:400px"></iframe>`);
  const snap = {
    connected: true, playing: true, title: "T", artist: "A", album: "L", app: "NCM",
    cover: "", pluginVer: "8.1.4", smtcVer: "3.2.11", needsUpdate: false,
    needsBridge: false, engineOld: false, seekNote: "", cmdLast: null,
    lyric: lyric6(src), lyricRev: "r1",
  };
  await page.evaluate(({ html, snap, storageGet }) => {
    const iw = document.getElementById("w").contentWindow;
    iw.__errs = [];
    iw.onerror = function (m) { iw.__errs.push(String(m)); };
    iw.__state = { snap, now: { lineIndex: -1, lastLine: -1, wordIndex: -1, wordProgress: 0, playing: true, fadeMs: 260 }, storageGet, sets: [], cb: null };
    iw.chushi = {
      resize() {}, close() {},
      storage: {
        get: () => Promise.resolve(iw.__state.storageGet),
        set: (k, v) => { iw.__state.sets.push([k, v]); return Promise.resolve(true); },
      },
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
  }, { html, snap, storageGet });
  await page.waitForTimeout(250);
}
const setNow = (n) => page.evaluate((n) => { document.getElementById("w").contentWindow.__state.now = n; }, n);
const setSnap = (lyric) => page.evaluate((ly) => {
  const iw = document.getElementById("w").contentWindow;
  iw.__state.snap = Object.assign({}, iw.__state.snap, { lyric: ly, lyricRev: "r2" });
  if (iw.__state.cb) iw.__state.cb(iw.__state.snap);
}, lyric);
const wait = (ms) => page.waitForTimeout(ms);
/* 读 6 行状态：on/done/每词 --p */
const readRows = () => page.evaluate(() => {
  const doc = document.getElementById("w").contentDocument;
  return [...doc.querySelectorAll(".cs-ln")].map((r) => ({
    on: r.classList.contains("on"),
    done: r.classList.contains("done"),
    ps: [...r.querySelectorAll(".cs-w .ov")].map((o) => parseFloat(o.style.getPropertyValue("--p")) || 0),
  }));
});
const wordSpans = () => page.evaluate(() =>
  document.getElementById("w").contentDocument.querySelectorAll(".cs-w").length);

let passed = 0, failed = 0;
function ok(cond, name, extra) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}${extra ? " — " + extra : ""}`); }
}
function residue(rows, from) {
  /* 高光残留 = 行无 done 类且任一词 --p>0（ov 可见扫色）；
     未来行残留 = 行有 on；返回违规行号列表 */
  const bad = [];
  rows.forEach((r, i) => {
    if (i < from) return;
    if (r.on) bad.push(`${i}:on`);
    else if (!r.done && r.ps.some((p) => p > 0)) bad.push(`${i}:p=${r.ps.join(",")}`);
  });
  return bad;
}

const HTML_NEW = unpack(CSHZ_NEW);

/* ---------- L1 回退高光残留根治（核心；yrc 真逐字场景） ---------- */
console.log("L1 回退残留：行3扫到60% → seek 回退到行1 → 行2-5 必须零高光");
await mount(HTML_NEW, { src: "yrc" });
await setNow(nowState(3, 1, 0.6));
await wait(120);
let rows = await readRows();
ok(rows[3].on && rows[3].ps[0] === 100 && Math.abs(rows[3].ps[1] - 60) < 1 && rows[3].ps[2] === 0,
  "L1a 行3 on 且扫光 100/60/0", JSON.stringify(rows[3]));
await setNow(nowState(1, 0, 0.5));
await wait(120);
rows = await readRows();
let bad = residue(rows, 2);
ok(bad.length === 0, "L1b 回退后行2-5 零高光（旧逻辑此处残留 60% 扫色）", JSON.stringify(bad));
ok(rows[1].on && !rows[1].done && rows[1].ps[0] > 0, "L1c 行1 on 重新扫光", JSON.stringify(rows[1]));
ok(rows[0].done && rows[0].ps.every((p) => p === 0), "L1d 行0 已唱界内 done 灰且零扫色", JSON.stringify(rows[0]));

/* ---------- L2 高光保持律（v8.2.2 用户令：唱完挂住到行切换） ---------- */
console.log("L2 高光保持：行2 扫光到 100%，400ms 后高光必须仍挂住（250ms 自动渐隐已废弃）");
await mount(HTML_NEW, { src: "yrc" });
await setNow(nowState(2, 2, 1));
await wait(60);
rows = await readRows();
ok(rows[2].on && !rows[2].done, "L2a 扫光完成瞬间仍在唱态（宽限 250ms 内）", JSON.stringify(rows[2]));
await wait(400);
rows = await readRows();
ok(!rows[2].done && rows[2].on && rows[2].ps.every((p) => p === 100),
  "L2b 唱完后高光挂住（done 不出现，下一句开始前不渐隐）", JSON.stringify(rows[2]));
await setNow(nowState(3, 0, 0));
await wait(120);
rows = await readRows();
ok(rows[2].done && rows[2].ps.every((p) => p === 100) && rows[3].on,
  "L2c 行切换离开才进 done 渐隐（定格 100% → .ov 渐隐）", JSON.stringify([rows[2], rows[3].on]));

/* ---------- L3 行内回退重扫撤销 ---------- */
console.log("L3 行内回退重扫：已进渐隐的行回退重扫应撤销 done 重新扫光");
await setNow(nowState(2, 0, 0.3));
await wait(120);
rows = await readRows();
ok(!rows[2].done && rows[2].on && rows[2].ps[0] > 0 && rows[2].ps[1] === 0 && rows[2].ps[2] === 0,
  "L3 done 撤销 + 从头重新扫光", JSON.stringify(rows[2]));

/* ---------- L4 间奏 ref=lastLine（回退落间奏） ---------- */
console.log("L4 回退落间奏：lineIndex=-1 + lastLine=1 → 行2-4 零误标");
await mount(HTML_NEW, { src: "yrc" });
await setNow(nowState(4, 1, 0.5));
await wait(120);
rows = await readRows();
ok(rows[4].on, "L4a 行4 on（回退前状态）", JSON.stringify(rows[4]));
await setNow(nowState(-1, -1, 0, { lastLine: 1 }));
await wait(120);
rows = await readRows();
ok(rows[0].done && rows[1].done, "L4b 已唱界内（行0-1）done", JSON.stringify([rows[0].done, rows[1].done]));
bad = residue(rows, 2);
ok(bad.length === 0, "L4c 已唱界之后零误标（旧逻辑 ref=回退前行号把行2-4 标 done）", JSON.stringify(bad));

/* ---------- L5 强行逐字开关 ---------- */
console.log("L5 强行逐字开关：默认关=lrc 逐行 / 开=伪逐字 / yrc 恒逐字 / storage 持久化");
await mount(HTML_NEW, { src: "lrc", storageGet: null });
await wait(150);
ok((await wordSpans()) === 0, "L5a 默认关：lrc 伪逐字降级为逐行渲染（无词 span）", `spans=${await wordSpans()}`);
await setNow(nowState(2, 1, 0.5));
await wait(120);
rows = await readRows();
ok(rows[2].on && !rows[2].done, "L5a2 逐行模式行高亮正常（解耦后不随开关丢失）", JSON.stringify(rows[2]));
await setNow(nowState(-1, -1, 0, { lastLine: 1 }));
await wait(120);
rows = await readRows();
ok(rows[0].done && rows[1].done && residue(rows, 2).length === 0,
  "L5a3 逐行模式间奏 ref=lastLine 同样生效", JSON.stringify(rows.slice(0, 3).map((r) => [r.on, r.done])));
await page.evaluate(() => document.getElementById("w").contentDocument.getElementById("csWbw").click());
await wait(120);
ok((await wordSpans()) === 18, "L5b 点开关：伪逐字逐字渲染（6 行×3 词）", `spans=${await wordSpans()}`);
const btnOn = await page.evaluate(() =>
  document.getElementById("w").contentDocument.getElementById("csWbw").classList.contains("on"));
ok(btnOn, "L5c 开关按钮 on 态");
const sets = await page.evaluate(() => document.getElementById("w").contentWindow.__state.sets);
ok(sets.length >= 1 && sets[sets.length - 1][0] === "csForceWord" && sets[sets.length - 1][1] === true,
  "L5d storage.set 持久化 csForceWord=true", JSON.stringify(sets));
await mount(HTML_NEW, { src: "lrc", storageGet: true });
await wait(150);
ok((await wordSpans()) === 18, "L5e storage 记忆 true：下次启动直接逐字", `spans=${await wordSpans()}`);
await mount(HTML_NEW, { src: "yrc", storageGet: null });
await wait(150);
ok((await wordSpans()) === 18, "L5f 真逐字 yrc：开关默认关仍恒逐字", `spans=${await wordSpans()}`);

/* ---------- L6 进度条 scaleY 合成层动画 ---------- */
console.log("L6 进度条悬停动画：transform scaleY（无 height 过渡）");
const rail = await page.evaluate(() => {
  const doc = document.getElementById("w").contentDocument;
  const el = doc.querySelector(".cs-rail");
  const cs = doc.defaultView.getComputedStyle(el);
  return { tp: cs.transitionProperty, tf: cs.transform, h: cs.height };
});
ok(rail.tp.includes("transform") && !rail.tp.includes("height"),
  "L6a 过渡属性为 transform（不再触发 layout 的 height）", JSON.stringify(rail.tp));
ok(/matrix\(1, 0, 0, 0\.6\d+/.test(rail.tf), "L6b 默认 scaleY≈0.667（视觉 4px）", rail.tf);
ok(rail.h === "6px", "L6c 轨道恒 6px 高（缩放由 transform 承担）", rail.h);

/* ---------- L7 阴性对照：v8.1.2 旧部件复现残留 ---------- */
console.log("L7 阴性对照：v8.1.2 部件同场景必须复现残留（证明修复真值）");
try {
  const HTML_OLD = unpack(CSHZ_OLD);
  await mount(HTML_OLD, { src: "lrc" });
  await setNow(nowState(3, 1, 0.6));
  await wait(120);
  await setNow(nowState(1, 0, 0.5));
  await wait(120);
  rows = await readRows();
  bad = residue(rows, 2);
  ok(bad.length > 0, "L7 旧部件复现高光残留（阴性对照 FAIL=预期）", JSON.stringify(bad));
} catch (e) {
  console.log(`  ⚠ L7 旧包不可用，跳过阴性对照：${String(e).slice(0, 120)}`);
}

ok(pageErrors.length === 0 && (await page.evaluate(() =>
  document.getElementById("w") ? document.getElementById("w").contentWindow.__errs.length : 0)) === 0,
  "L8 全程零异常（部件 pageerror + iframe onerror）", JSON.stringify(pageErrors));

console.log("\n========================================================");
console.log(`v8.1.4 部件歌词行为验证: ${passed} 通过, ${failed} 失败`);
await browser.close();
process.exit(failed ? 1 : 0);
