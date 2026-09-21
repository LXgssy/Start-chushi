// v8.6.39 视觉目检：复现用户视频操作流（设置→预设→设置→关闭）
// A=设置展开稳态 / B=预设面板稳态 / C=关闭瞬间抓帧（无白盒幽灵）/ D=关闭后零残留
import { chromium } from "playwright-core";
import crypto from "crypto";
import { execSync } from "child_process";

const ROOT = "/tmp/ext-v869";
const SHOTS = "/tmp/v8639-visual";
execSync(`mkdir -p ${SHOTS}`);
const h = crypto.createHash("sha256").update(Buffer.from(ROOT)).digest("hex").slice(0, 32);
const EXT_ID = [...h].map((c) => String.fromCharCode(97 + (parseInt(c, 16) % 26))).join("");
const EXT_URL = (p) => `chrome-extension://${EXT_ID}/${p}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CLIP = { x: 420, y: 140, width: 640, height: 660 };

const ctx = await chromium.launchPersistentContext("/tmp/ext-v869-profile", {
  channel: "chromium", headless: true,
  args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`, "--no-first-run", "--no-sandbox"],
});
let page = ctx.pages().find((p) => p.url().startsWith(EXT_URL("shell.html"))) || (await ctx.newPage());
await page.goto(EXT_URL("shell.html"), { waitUntil: "load" });
await sleep(2400);
let af = page.frames().find((f) => f !== page.mainFrame() && /\/index\.html$/.test(f.url()));
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
await page.reload({ waitUntil: "load" });
await sleep(2600);
af = page.frames().find((f) => f !== page.mainFrame() && /\/index\.html$/.test(f.url()));
if (!af) throw new Error("appFrame 未建立");

const clickBtn = (label) => af.evaluate((lb) => {
  const b = [...document.querySelectorAll(".dock-btn, .cl-dock button")]
    .find((x) => x.getAttribute("aria-label") === lb);
  if (b) { b.click(); return true; } return false;
}, label);

// A：设置展开稳态
await clickBtn("设置");
await sleep(1100);
await page.screenshot({ path: `${SHOTS}/A-settings.png`, clip: CLIP });

// B：切到预设面板稳态
await clickBtn("测试面板");
await sleep(1300);
await page.screenshot({ path: `${SHOTS}/B-widget.png`, clip: CLIP });

// C：切回设置 → 关闭瞬间连抓两帧（ ghost 若存在 = 白盒叠印，必然可见）
await clickBtn("设置");
await sleep(1100);
await clickBtn("设置"); // toggle off → closing
await sleep(60);
await page.screenshot({ path: `${SHOTS}/C1-closing-early.png`, clip: CLIP });
await sleep(70);
await page.screenshot({ path: `${SHOTS}/C2-closing-late.png`, clip: CLIP });

// D：关闭后零残留
await sleep(1000);
await page.screenshot({ path: `${SHOTS}/D-closed.png`, clip: CLIP });

// 数值旁证：布局空间断言（关闭完成后壳体应无面板残留）
const res = await af.evaluate(() => ({
  card: !!document.querySelector(".glass-card.cl-panel"),
  stageH: document.querySelector(".cl-stage")?.offsetHeight ?? null,
}));
console.log("after-close:", JSON.stringify(res));
await ctx.close();
process.exit(0);
