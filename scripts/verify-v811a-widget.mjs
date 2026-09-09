// v8.1.1a 部件连接修复验证：
// ① 加载打包产物 cshz 里的 widget html（压缩后真代码）
// ② stub chushi 宿主 API，喂 connected:true 快照
// ③ 断言卡片进入 cs-mode-fl（完整模式）——修复前 strict 模式 offSince 必抛、永久卡空态
import { chromium } from "playwright-core";
import { execSync } from "child_process";
import { writeFileSync, readFileSync, mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const CSHZ = process.env.CSHZ_PATH || "/home/z/my-project/examples/初始SMTC音乐预设.cshz";
const tmp = mkdtempSync(join(tmpdir(), "cshz-"));
execSync(`cd ${tmp} && unzip -q -o "${CSHZ}" manifest.json`);
const manifest = JSON.parse(readFileSync(join(tmp, "manifest.json"), "utf8"));
const html = manifest.widgets[0].html;
writeFileSync(join(tmp, "widget.html"), html);
console.log(`widget html ${html.length} chars`);

const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`,
  args: ["--no-sandbox"],
});
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

// 宿主 stub：snapshot 立即给 connected:true（修复前：首个 connected render 即抛 ReferenceError）
// ⚠ 必须注入到 iframe 的 window（部件检查的是 iframe 内的 chushi），且先于 doc.write
await page.goto("about:blank");
await page.setContent(`<iframe id="w" style="width:380px;height:400px"></iframe>`);
await page.evaluate((html) => {
  const iw = document.getElementById("w").contentWindow;
  iw.__errs = [];
  iw.onerror = function (m) { iw.__errs.push(String(m)); };
  const snap = {
    connected: true, playing: true, title: "The Nights", artist: "Avicii", album: "Stories",
    app: "NCM", cover: "", pluginVer: "8.1.0", smtcVer: "3.2.11",
    needsUpdate: false, needsBridge: false, engineOld: false, seekNote: "", cmdLast: null,
    lyric: null, lyricRev: "",
  };
  const now = { progress: 0.3, position: 81, duration: 245, lineIndex: -1, wordIndex: -1, wordProgress: 0, playing: true, fadeMs: 260 };
  iw.chushi = {
    resize: () => {},
    close: () => {},
    music: {
      snapshot: () => snap,
      now: () => now,
      subscribe: (cb) => { setTimeout(() => cb(snap), 60); },
      toggle: () => Promise.resolve(true), prev: () => Promise.resolve(true),
      next: () => Promise.resolve(true), seek: () => {},
    },
  };
  const doc = document.getElementById("w").contentDocument;
  doc.open(); doc.write(html); doc.close();
}, html);
await page.waitForTimeout(1200);

const result = await page.evaluate(() => {
  const iw = document.getElementById("w").contentWindow;
  const doc = iw.document;
  const card = doc.getElementById("csCard");
  const foot = doc.getElementById("csFootTxt");
  const t1 = doc.getElementById("csT1");
  const e1 = doc.getElementById("csE1");
  return {
    mode: card ? card.className : "(no card)",
    foot: foot ? foot.textContent : "(no foot)",
    title: t1 ? t1.textContent : "(no t1)",
    e1: e1 ? e1.textContent : "(no e1)",
    errs: iw.__errs || [],
  };
});
console.log("result:", JSON.stringify(result, null, 2));
console.log("pageerrors:", errors.length ? errors : "无");
const ok =
  result.mode.includes("cs-mode-fl") &&
  result.title === "The Nights" &&
  result.errs.length === 0 &&
  errors.length === 0;
console.log(ok ? "✅ PASS：connected 快照正常进入完整模式，无异常" : "❌ FAIL");
await browser.close();
process.exit(ok ? 0 : 1);
