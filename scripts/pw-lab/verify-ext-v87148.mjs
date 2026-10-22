/* v8.7.148 真扩展冒烟：待办浮窗磁贴行级划掉
 * 链路：装包 → 起始页种 3 条待办 + todoTile=true → 磁贴出现 3 行 →
 * 点行即划掉（storage done=true + 划线 scaleX(1) + 徽标计数即时减）→
 * 驻留 1.1s 后优雅退场（行消失）→ 驻留期再点反悔（done 回 false）→
 * 按住行上拖磁贴 46px 不误划（300ms 吞 click 护栏）+ 合法落点重钉 →
 * 拖后 400ms 点行仍可正常划掉 → 点磁贴标题区仍开待办面板 → pageerror=0 */
import { chromium } from "playwright-core";
import { execSync } from "child_process";
import { mkdtempSync, rmSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { createHash } from "crypto";

const ZIP = "/home/z/beta-wt/download/v8.7.148/ChuShi-NewTab-v8.7.148.zip";
const extDir = mkdtempSync(tmpdir() + "/ext-v148-");
execSync(`unzip -qo "${ZIP}" -d ${extDir}`);
const mf = JSON.parse(readFileSync(extDir + "/manifest.json", "utf8"));
if (mf.version !== "8.7.148") { console.error("✗ manifest 版本异常 " + mf.version); process.exit(1); }
console.log("✓ M0 manifest 8.7.148");

rmSync("/tmp/ext-v148-profile", { recursive: true, force: true });
const browser = await chromium.launchPersistentContext("/tmp/ext-v148-profile", {
  headless: true,
  channel: "chromium",
  args: [`--headless=new`, `--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`],
  viewport: { width: 1280, height: 800 },
});
const extId = createHash("sha256").update(extDir).digest("hex").slice(0, 32)
  .split("").map((c) => "abcdefghijklmnop"[parseInt(c, 16)]).join("");
const errors = [];

const page = await browser.newPage();
page.on("pageerror", (e) => errors.push("start:" + String(e)));
await page.goto(`chrome-extension://${extId}/index.html`, { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(1200);

/* 种子：todoTile=true + 3 条待办（未完成），重载后磁贴挂出 */
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem("start:settings") || "{}");
  s.todoTile = true;
  s.noteTile = true;
  localStorage.setItem("start:settings", JSON.stringify(s));
  localStorage.setItem("start:todos", JSON.stringify([
    { id: "t1", text: "买牛奶", done: false, createdAt: 1 },
    { id: "t2", text: "回邮件", done: false, createdAt: 2 },
    { id: "t3", text: "跑步5公里", done: false, createdAt: 3 },
  ]));
  localStorage.setItem("start:note", JSON.stringify("测试便签"));
});
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForSelector('[aria-label="打开待办面板"]', { timeout: 15000 });
await page.waitForSelector('[data-todo-row="open"]', { timeout: 15000 });
await page.waitForTimeout(1500); /* 入场动画（0.55s 错拍 + 模糊聚拢）沉降 */
console.log("✓ M1 磁贴挂出（seed 3 条 + todoTile=true）");

const readState = () => page.evaluate(() => ({
  todos: JSON.parse(localStorage.getItem("start:todos") || "[]"),
  rows: [...document.querySelectorAll("[data-todo-row]")].map((b) => ({
    id: b.getAttribute("data-todo-row"),
    label: b.getAttribute("aria-label"),
    pressed: b.getAttribute("aria-pressed"),
    strike: getComputedStyle(b.querySelector(".strike")).transform,
  })),
  badge: document.querySelector('[aria-label="打开待办面板"] .ml-auto')?.textContent.trim(),
}));

let st = await readState();
let M2ok = st.rows.length === 3 && st.rows.every((r) => r.id === "open") &&
  st.badge === "3" && st.rows[0].label === "划掉待办：买牛奶" &&
  st.rows[0].strike === "matrix(0, 0, 0, 1, 0, 0)";
console.log((M2ok ? "✓" : "✗") + ` M2 三行在位全 open 徽标=3 aria=划掉待办：买牛奶 划线 scaleX(0)`);
if (!M2ok) { console.log(JSON.stringify(st, null, 2)); process.exit(1); }

/* M3 点第一行 → 划掉：storage done + 划线扫入 + 徽标即时减
 * （划掉后该行从 preview 移入 lingerRows，DOM 顺序变为 [t2,t3,t1]） */
await page.locator('[data-todo-row="open"]').first().click();
await page.waitForTimeout(600); /* .strike 0.45s 过渡沉降 */
st = await readState();
const t1 = st.todos.find((t) => t.id === "t1");
const doneRow = st.rows.find((r) => r.id === "done");
const M3ok = t1?.done === true && st.badge === "2" && st.rows.length === 3 &&
  doneRow && doneRow.pressed === "true" &&
  doneRow.label === "恢复待办：买牛奶" &&
  doneRow.strike === "matrix(1, 0, 0, 1, 0, 0)";
console.log((M3ok ? "✓" : "✗") + ` M3 点行划掉：t1.done=true 徽标=2 行转 done 划线 scaleX(1) aria 转恢复`);
if (!M3ok) { console.log(JSON.stringify(st, null, 2)); process.exit(1); }

/* M4 驻留 1.1s 后退场 */
await page.waitForTimeout(1700); /* LINGER_MS 1100 + exit 260ms 余量 */
st = await readState();
const M4ok = st.rows.length === 2 && st.rows.every((r) => r.id === "open") && st.badge === "2";
console.log((M4ok ? "✓" : "✗") + ` M4 驻留退场：划掉行已退场，剩 2 行 open 徽标=2`);
if (!M4ok) { console.log(JSON.stringify(st, null, 2)); process.exit(1); }

/* M5 驻留期反悔：划掉 t2 → 立刻再点 → 恢复未完成 */
await page.locator('[data-todo-row="open"]').first().click();
await page.waitForSelector('[data-todo-row="done"]', { timeout: 5000 });
await page.waitForTimeout(350); /* 驻留窗口内（<1100ms） */
await page.locator('[data-todo-row="done"]').first().click();
await page.waitForTimeout(500);
st = await readState();
const t2 = st.todos.find((t) => t.id === "t2");
const M5ok = t2?.done === false && st.badge === "2" &&
  st.rows.length === 2 && st.rows.every((r) => r.id === "open");
console.log((M5ok ? "✓" : "✗") + ` M5 驻留反悔：t2.done 回 false 行回 open 不退场 徽标=2`);
if (!M5ok) { console.log(JSON.stringify(st, null, 2)); process.exit(1); }

/* M6 拖拽护栏：按住行上拖磁贴 46px → 不误划 + 合法落点重钉 */
const tileBox = await page.locator('[aria-label="打开待办面板"]').boundingBox();
const row3 = page.locator('[data-todo-row="open"]').nth(1); /* t3 */
const rb = await row3.boundingBox();
const sx = rb.x + rb.width / 2, sy = rb.y + rb.height / 2;
await page.mouse.move(sx, sy);
await page.mouse.down();
await page.mouse.move(sx + 46, sy + 8, { steps: 10 });
await page.mouse.up();
await page.waitForTimeout(250); /* click 已发（吞或未达）+ commit 已写 */
st = await readState();
const t3afterDrag = st.todos.find((t) => t.id === "t3");
const pinTile = await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem("start:settings") || "{}");
  return s.pinTile?.todo ?? null;
});
const nb = await page.locator('[aria-label="打开待办面板"]').boundingBox();
const M6ok = t3afterDrag?.done === false && !!pinTile &&
  Math.abs(nb.x - (tileBox.x + 46)) < 5 && Math.abs(nb.y - (tileBox.y + 8)) < 5;
console.log((M6ok ? "✓" : "✗") + ` M6 拖拽护栏：行上起拖 46px 不误划 t3.done=false 磁贴重钉 pinTile=${JSON.stringify(pinTile)}`);
if (!M6ok) { console.log(JSON.stringify({ t3: t3afterDrag, pinTile, nb, tileBox }, null, 2)); process.exit(1); }

/* M6b 拖后 400ms 点行 → 仍可正常划掉（护栏只吞 300ms 窗口） */
await page.waitForTimeout(400);
await row3.click();
await page.waitForTimeout(500);
st = await readState();
const t3 = st.todos.find((t) => t.id === "t3");
const M6bok = t3?.done === true && st.badge === "1";
console.log((M6bok ? "✓" : "✗") + ` M6b 拖后点行正常划掉：t3.done=true 徽标=1`);
if (!M6bok) { console.log(JSON.stringify(st, null, 2)); process.exit(1); }
/* 等 t3 驻留退场，磁贴回稳 */
await page.waitForTimeout(1800);

/* M7 点磁贴标题区（非行）→ 仍开待办面板（作用域限定磁贴内，避开 Dock 同名文本） */
await page.locator('[aria-label="打开待办面板"]').getByText("待办", { exact: true }).click();
const panelInput = page.getByPlaceholder("添加待办，回车确认");
await panelInput.waitFor({ state: "visible", timeout: 6000 });
console.log("✓ M7 点磁贴标题区仍开面板（宿主代理识别本域）");

/* M7b 便签磁贴存量修复：点击便签磁贴 → 打开便签面板 */
await page.locator('[aria-label="打开便签面板"]').click();
await page.getByPlaceholder("随手记点什么… 自动保存").waitFor({ state: "visible", timeout: 6000 });
console.log("✓ M7b 便签磁贴点按开面板（v8.7.106 起失效的存量病灶同批修复）");

await browser.close();
if (errors.length) {
  console.error("✗ pageerror:", errors);
  process.exit(1);
}
console.log("✓ pageerror=0 全程");
console.log("\nSMOKE PASS (v8.7.148)");
