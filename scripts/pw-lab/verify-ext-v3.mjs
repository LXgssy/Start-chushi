import { chromium } from "playwright-core";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:http";

/* verify-ext-v3.mjs — v3.0.0 扩展冒烟：
 * 加载扩展 → manifest v3.0.0 + host_permissions 含 127.0.0.1:20754 →
 * 新标签页渲染 → mock 桥 2.0.0（含 plugins 注册表 + ne 真值）→
 * 导入 .cshz → dock 音乐按钮 → 单主仲裁（ne 元数据/播放态）→ 页脚双版本 → pageerror=0 */
let mockState = { ok: true, name: "chushi-smtc-bridge", version: "2.0.0-mock", track: null, ne: null, plugins: { smtc: "2.0.0" } };
const PNG1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
);
function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Private-Network", "true");
}
const mock = createServer((req, res) => {
  cors(res);
  const u = new URL(req.url, "http://x");
  if (u.pathname === "/api/state") {
    /* ne 每拍动态生成（ts 恒新鲜）——模拟插件B 1s 心跳；静态 ts 3s 后必过期
       触发宿主 SMTC-only 兜底（那正是 v3 设计行为，不能当失败断言） */
    const out = { ...mockState };
    if (out.ne) out.ne = { ...out.ne, ts: Date.now() - 60 };
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(out));
    return;
  }
  if (u.pathname === "/api/cover") { res.writeHead(200, { "content-type": "image/png" }); res.end(PNG1PX); return; }
  if (u.pathname === "/api/lyric") { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ ok: false })); return; }
  if (u.pathname === "/api/control") { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ ok: true })); return; }
  res.writeHead(404); res.end();
});
await new Promise((r) => mock.listen(20754, "127.0.0.1", r));

const extDir = mkdtempSync(tmpdir() + "/ext-v3-");
execSync(`unzip -qo "/home/z/my-project/download/v3.0.0/ChuShi-NewTab-v3.0.0.zip" -d ${extDir}`);
const mf = JSON.parse(readFileSync(extDir + "/manifest.json", "utf8"));
const m0ok = mf.version === "3.0.0" && (mf.host_permissions || []).includes("http://127.0.0.1:20754/*");
console.log(m0ok ? "✓ M0 manifest v3.0.0 + host_permissions 含 127.0.0.1:20754"
  : "✗ M0 manifest 缺陷：" + JSON.stringify(mf.host_permissions));
rmSync("/tmp/ext-v3-profile", { recursive: true, force: true });

const browser = await chromium.launchPersistentContext("/tmp/ext-v3-profile", {
  headless: true,
  channel: "chromium",
  args: [`--headless=new`, `--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`],
});
/* 扩展 ID 由路径哈希确定性推导（v1.9.0 冒烟同法） */
const extId = createHash("sha256").update(extDir).digest("hex").slice(0, 32)
  .split("").map((c) => "abcdefghijklmnop"[parseInt(c, 16)]).join("");
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(`chrome-extension://${extId}/index.html`, { waitUntil: "networkidle" });
await page.waitForSelector(".clock-text", { timeout: 20000 });
console.log("✓ M1 扩展新标签页渲染（.clock-text）");

/* 注入 v3 真值场景：SMTC 元数据带修饰+暂停假象，ne 真值播放中 */
mockState = {
  ...mockState,
  track: {
    app: "NetEase Music", title: "晴天 (Live)【超清】", artist: "周杰伦/蔡依林", album: "",
    playing: false, position: 7, duration: 269.3, rate: 1, coverRev: "rev-x",
  },
  ne: {
    songId: 123456, title: "晴天", artist: "周杰伦", album: "叶惠美", pic: "",
    positionMs: 88400, durationMs: 269300, playing: true, lyricRev: "",
    ts: Date.now() - 60, v: "2.0.0",
    seekAckId: "", seekAckOk: false, seekAckPos: 0, seekAckAt: 0,
  },
};
await page.keyboard.press("Control+k");
await page.waitForTimeout(900);
await page.locator("[cmdk-item]").filter({ hasText: "导入预设" }).click();
await page.waitForTimeout(700);
await page.locator("input[type=file]").setInputFiles("/home/z/my-project/examples/初始SMTC音乐预设.cshz");
await page.waitForTimeout(2800);
const e2 = (await page.locator("text=/错误|必须|缺失|不支持/").count()) === 0;
console.log(e2 ? "✓ M2 .cshz 导入无错误" : "✗ M2 导入报错");
await page.keyboard.press("Escape");
await page.waitForTimeout(400);
const dockMusicBtn = page.locator(".cl-dock button[aria-label='音乐']");
await dockMusicBtn.click();
await page.waitForTimeout(2600);
const wFrame = () => page.frameLocator(".cl-dockwidget iframe").frameLocator("iframe[title='初始自定义小部件']");
const t1 = await wFrame().locator("#t1").textContent();
const m3ok = t1 === "晴天";
console.log(m3ok ? `✓ M3 单主仲裁（面板显示 ne 歌名「${t1}」，SMTC 修饰名被覆盖）` : `✗ M3 t1=${t1}`);
const ap = await wFrame().locator("#ap").textContent();
const m4ok = ap.includes("API v2.0.0") && ap.includes("管理 v2.0.0");
console.log(m4ok ? `✓ M4 页脚双版本（${ap}）` : `✗ M4 ap=${ap}`);
console.log(errors.length === 0 ? "✓ M5 pageerror=0" : "✗ M5 pageerror: " + errors[0]);

await browser.close();
mock.close();
const fail = [m0ok, e2, m3ok, m4ok, errors.length === 0].filter((x) => !x).length;
console.log(`\n=== verify-ext-v3: ${5 - fail}/5 passed ===`);
process.exit(fail ? 1 : 0);
