// bootdiff：同一扩展 origin 下，本地页 vs 快照页 的启动序列逐拍对照
//   addInitScript 注入 TURBOPACK/__next_f 拦截 + 全局错误陷阱 → 记录 BOOTLOG → diff
import { chromium } from "playwright-core";

const EXT_DIR = "/tmp/repro/ext845";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const INIT = `
(function () {
  window.__BOOTLOG = [];
  const L = (m) => { try { window.__BOOTLOG.push(m); } catch (e) {} };
  window.addEventListener("error", (e) => L("WINDOW-ERROR " + (e.message || e.filename) + " @" + (e.lineno || "?")));
  window.addEventListener("unhandledrejection", (e) => L("UNHANDLED-REJ " + String(e.reason).slice(0, 120)));
  let tur;
  try {
    Object.defineProperty(window, "TURBOPACK", {
      configurable: true,
      get() { return tur; },
      set(v) {
        tur = v;
        L("TURBOPACK-SET " + (Array.isArray(v) ? "array(len=" + v.length + ")" : "object(keys=" + Object.keys(v).join(",") + ")"));
        if (v && typeof v.push === "function" && !Array.isArray(v)) {
          const orig = v.push;
          v.push = function (...args) {
            try {
              const a = args[0];
              L("TURBOPACK-REG id=" + (a && a[1]) + " cs=" + (a && a[0] && a[0].src ? a[0].src.replace(location.origin, "") : String(a && a[0]).slice(0, 40)));
            } catch (e) { L("TURBOPACK-REG-ERR " + e); }
            return orig.apply(this, args);
          };
        }
      },
    });
  } catch (e) { L("DEF-TUR-ERR " + e); }
  let nf;
  try {
    Object.defineProperty(window, "__next_f", {
      configurable: true,
      get() { return nf; },
      set(v) {
        nf = v;
        L("NEXTF-SET " + (Array.isArray(v) ? "array" : typeof v));
        if (Array.isArray(v)) {
          const orig = v.push;
          v.push = function (...args) {
            L("NEXTF-PUSH len=" + v.length + " head=" + JSON.stringify(args[0] || null).slice(0, 60));
            return orig.apply(this, args);
          };
        }
      },
    });
  } catch (e) { L("DEF-NF-ERR " + e); }
})();
`;

const ctx = await chromium.launchPersistentContext("/tmp/repro/profile3", {
  executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`,
  headless: false,
  args: ["--no-sandbox", `--disable-extensions-except=${EXT_DIR}`, `--load-extension=${EXT_DIR}`, "--force-device-scale-factor=1", "--disable-dev-shm-usage"],
  viewport: { width: 1280, height: 800 },
});
let EXTID = "";
for (let i = 0; i < 20 && !EXTID; i++) {
  for (const w of ctx.serviceWorkers()) {
    const m = (w.url() || "").match(/^chrome-extension:\/\/([^/]+)\//);
    if (m) { EXTID = `chrome-extension://${m[1]}`; break; }
  }
  if (!EXTID) await ctx.waitForEvent("serviceworker", { timeout: 2000 }).catch(() => null);
}

async function run(url, label) {
  const page = await ctx.newPage();
  await page.addInitScript(INIT);
  await page.goto(url, { waitUntil: "load", timeout: 20000 }).catch(() => {});
  await sleep(8000);
  const log = await page.evaluate(() => window.__BOOTLOG || []).catch(() => []);
  const st = await page.evaluate(() => ({
    nav: !!document.querySelector('nav[aria-label="快捷操作"]'),
    nextF: Array.isArray(self.__next_f) ? self.__next_f.length : typeof self.__next_f,
  })).catch(() => ({}));
  console.log(`\n===== ${label} nav=${st.nav} nextF=${st.nextF} 日志 ${log.length} 条 =====`);
  for (const l of log) console.log("  ·", l);
  await page.close();
}

await run(`${EXTID}/index.html`, "本地页(根路径)");
await run(`${EXTID}/cs-snap/index.html`, "快照页(/cs-snap/)");
await ctx.close();
