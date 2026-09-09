// v8.1.2 规范扩展包真浏览器冒烟（替代失传的 v1.1.3 时代探针）
// 路径 = 用户真实安装路径：「加载已解压的扩展程序」→ 打开新标签页
// 判据：①扩展被接受（确定性 id 可达）②newtab 页完整渲染 ③sandbox.html 可达 ④零致命报错
import { chromium } from "playwright";
import crypto from "crypto";

const ROOT = "/tmp/ext-stage"; // build-extension.py 舞台 = zip 解压后同构
const EXT_ID = (() => {
  const h = crypto.createHash("sha256").update(Buffer.from(ROOT)).digest("hex").slice(0, 32);
  return [...h].map(c => String.fromCharCode(97 + (parseInt(c, 16) % 26))).join("");
})();

const browser = await chromium.launchPersistentContext("/tmp/ext-profile", {
  channel: "chromium",
  headless: process.env.HEADLESS === "1",
  args: [
    `--disable-extensions-except=${ROOT}`,
    `--load-extension=${ROOT}`,
    "--no-first-run",
    "--disable-gpu",
  ],
});

const errors = [];

// 1) newtab 页（扩展根 index.html）
const tab = await browser.newPage();
tab.on("pageerror", e => errors.push("pageerror: " + e.message));
tab.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });
tab.on("requestfailed", r => {
  const u = r.url();
  if (!/favicon|sw\.js/.test(u)) errors.push("reqfail: " + u + " " + (r.failure()?.errorText || ""));
});

let reachable = true;
await tab.goto(`chrome-extension://${EXT_ID}/index.html`, { waitUntil: "networkidle", timeout: 30000 })
  .catch(() => { reachable = false; });
await tab.waitForTimeout(2500);

const results = [];
const chk = (label, ok) => results.push([label, ok]);

chk("扩展被浏览器接受（id 可达）", reachable);
if (reachable) {
  const title = await tab.title();
  chk("页面 title 正确", title.includes("初始"));
  const txt = (await tab.evaluate(() => document.body.innerText).catch(() => "")) || "";
  chk("时钟渲染（\\d+:\\d+）", /\d{1,2}\s*\d{2}|\d{1,2}:\d{2}/.test(txt));
  chk("问候语渲染", /早上好|上午好|中午好|下午好|晚上好|凌晨好|夜深了|你好/.test(txt));
  chk("快捷链接渲染", /谷歌|GitHub/.test(txt));
  chk("⌘K 提示渲染", txt.includes("⌘K"));

  // 2) sandbox 页可达（沙箱脚本运行前提；MV3 sandbox CSP）
  // 判据：加载成功 + 无 CSP 违规报错（页面本身是空壳宿主，body 无可见内容属正常）
  const sb = await browser.newPage();
  const sbErrors = [];
  sb.on("pageerror", e => sbErrors.push("sb pageerror: " + e.message));
  sb.on("console", m => { if (m.type() === "error") sbErrors.push("sb console: " + m.text()); });
  const sbOk = await sb.goto(`chrome-extension://${EXT_ID}/sandbox.html`, { waitUntil: "load", timeout: 15000 })
    .then(r => !!r).catch(() => false);
  const sbHasScript = await sb.evaluate(() =>
    !!document.querySelector("script[src]") || document.body.innerHTML.length > 0).catch(() => false);
  const sbCspViolation = sbErrors.some(e => /Content Security Policy|Refused to/i.test(e));
  chk("sandbox.html 可达", sbOk);
  chk("sandbox 页含脚本宿主结构", sbHasScript);
  chk("sandbox 无 CSP 违规", !sbCspViolation);
  await sb.close();

  await tab.screenshot({ path: "/home/z/my-project/scripts/pw-lab/shots/v812-ext-newtab.png" }).catch(() => {});
}

// hub 端口探测失败 = 本环境无网易云枢纽（预期，用户机有 hub 时会通）；
// 它同时证明 host_permissions 放行生效——请求真正发到了网络层才可能 CONNECTION_REFUSED
// 注：reqfail 条目带 URL 已按端口过滤；裸 console "Failed to load resource" 无 URL，
//     与 reqfail 的 hub 探测一一对应（含 CSP 违规的报错走 Refused to execute 字样不受影响）
const fatal = errors.filter(e =>
  !/Autofill|net::ERR_ABORTED|127\.0\.0\.1:2690[123].*CONNECTION_REFUSED|Failed to load resource: net::ERR_CONNECTION_REFUSED/i.test(e));
chk("控制台/pageerror 零致命项", fatal.length === 0);

console.log("扩展 id:", EXT_ID);
let pass = true;
for (const [label, ok] of results) {
  console.log((ok ? "✓" : "✗ FAIL"), label);
  if (!ok) pass = false;
}
if (fatal.length) fatal.slice(0, 10).forEach(e => console.log("  err:", e.slice(0, 180)));
console.log(pass ? "\nSMOKE PASS" : "\nSMOKE FAIL");
await browser.close();
process.exit(pass ? 0 : 1);
