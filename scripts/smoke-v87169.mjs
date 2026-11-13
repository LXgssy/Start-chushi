// smoke-v87169.mjs — v8.7.169 文件夹拖拽节奏重做 真扩展冒烟
// ①磁贴悬停文件夹 3 秒驻留军备（3s 才亮反馈/3s 内松手不入夹/满 3s 松手入夹
//   且不开夹/一镜到底幽灵飞入）  ②夹内拖拽出面板 3 秒驻留关闭（关闭动画回
//   磁贴墙/回面板内撤计时）  ③168 七门继承回归（will-change/右键菜单/纯白/
//   抽屉误判/两侧空白）
import { chromium } from "playwright-core";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";

const ZIP = "/home/z/beta-wt/download/v8.7.169/ChuShi-NewTab-v8.7.169.zip";
const STAGE = "/tmp/ext-smoke169";
const PROFILE = "/tmp/ext-smoke169-profile";
const CHROME = "/home/z/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome";

let pass = 0;
const bad = [];
const T = (name, cond) => {
  if (cond) { pass++; console.log(`  [OK] ${name}`); }
  else { bad.push(name); console.log(`  [FAIL] ${name}`); }
};

fs.rmSync(STAGE, { recursive: true, force: true });
fs.mkdirSync(STAGE, { recursive: true });
execSync(`cd ${STAGE} && unzip -q ${ZIP}`);
fs.rmSync(PROFILE, { recursive: true, force: true });

const browser = await chromium.launchPersistentContext(PROFILE, {
  executablePath: CHROME,
  args: ["--no-sandbox", `--disable-extensions-except=${STAGE}`, `--load-extension=${STAGE}`],
  viewport: { width: 1280, height: 900 },
});
const extId = [...createHash("sha256").update(STAGE).digest("hex").slice(0, 32)]
  .map((c) => String.fromCharCode(97 + parseInt(c, 16)))
  .join("");
const page = browser.pages()[0] || (await browser.newPage());
const errors = [];
page.on("pageerror", (e) => errors.push(e.message.slice(0, 120)));

const linksState = () => page.evaluate(() => JSON.parse(localStorage.getItem("start:links")));
const linksStateWait = async (pred, ms = 3500) => {
  const t0 = Date.now();
  for (;;) {
    const st = await linksState();
    if (pred(st)) return st;
    if (Date.now() - t0 > ms) return st;
    await page.waitForTimeout(150);
  }
};
const veilOpen = () => page.evaluate(() => document.querySelectorAll(".cl-drawer-veil").length > 0);
const popoverOpen = () => page.evaluate(() => !!document.querySelector("[data-cl-folder-popover]"));
const openDrawer = () => page.keyboard.press("Alt+v");
const bootDrawer = async () => {
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(1800);
  await openDrawer();
  await page.waitForTimeout(1000);
};
/* 4 链接 + 2 夹：fd1（4 子）与 fd2（3 子）。
   双重播种：首播后等 900ms（> deferMs 800）让上一场景的延迟落盘先
   冲掉首播，再补一次新鲜种子，防旧状态反写。 */
const SEED = () => JSON.stringify([
  { id: "t1", name: "甲站", url: "https://t1.example.com" },
  { id: "t2", name: "乙站", url: "https://t2.example.com" },
  { id: "fd1", name: "诊断夹", folder: true, children: [
    { id: "a1", name: "站1", url: "https://a1.example.com" },
    { id: "a2", name: "站2", url: "https://a2.example.com" },
    { id: "a3", name: "站3", url: "https://a3.example.com" },
    { id: "a4", name: "站4", url: "https://a4.example.com" },
  ] },
  { id: "fd2", name: "第二夹", folder: true, children: [
    { id: "b1", name: "乙1", url: "https://b1.example.com" },
    { id: "b2", name: "乙2", url: "https://b2.example.com" },
    { id: "b3", name: "乙3", url: "https://b3.example.com" },
  ] },
]);
const seedWall = async () => {
  await page.evaluate((s) => localStorage.setItem("start:links", s), SEED());
  await page.waitForTimeout(900);
  await page.evaluate((s) => localStorage.setItem("start:links", s), SEED());
  await bootDrawer();
  const ok = await page.evaluate(() => {
    const st = JSON.parse(localStorage.getItem("start:links"));
    const fd = st.find((e) => e.id === "fd1");
    return st.some((e) => e.id === "t1") && fd && fd.children.length === 4;
  });
  if (!ok) {
    // 串写兜底：再补一轮种子
    await page.evaluate((s) => localStorage.setItem("start:links", s), SEED());
    await bootDrawer();
  }
};
const scaleOfFd1 = () => page.evaluate(() => {
  const el = document.querySelector('.cl-links-drawer [data-entry-id="fd1"] .tile-shell.h-16');
  if (!el) return "?";
  const sc = getComputedStyle(el.parentElement).scale;
  return Number.isNaN(parseFloat(sc)) ? "none" : sc;
});
const ghostInFlight = () =>
  page.evaluate(() => !!document.querySelector('div[class*="z-[80]"]'));
async function dragTo(fromId, toId, { hoverMs = 0, steps = 8 } = {}) {
  const a = await page.locator(`.cl-links-drawer [data-entry-id="${fromId}"]`).first().boundingBox();
  const b = await page.locator(`.cl-links-drawer [data-entry-id="${toId}"]`).first().boundingBox();
  if (!a || !b) return false;
  const ax = a.x + a.width / 2, ay = a.y + a.height / 2;
  const bx = b.x + b.width / 2, by = b.y + b.height / 2;
  await page.mouse.move(ax, ay);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(ax + ((bx - ax) * i) / steps, ay + ((by - ay) * i) / steps);
    await page.waitForTimeout(24);
  }
  if (hoverMs) await page.waitForTimeout(hoverMs);
  return true; // 不松手，由调用方决定
}

await page.goto(`chrome-extension://${extId}/index.html`, { waitUntil: "load", timeout: 60000 });
await page.waitForTimeout(2200);
await page.evaluate(() => {
  localStorage.setItem("start:settings", JSON.stringify({ iconStyle: "letter", linksForm: "drawer" }));
});
await seedWall();

console.log("---- 门① 3 秒驻留军备 + 一镜到底飞入 ----");
{
  // 场景 A：悬停 800ms（<3s）→ 无反馈 + 松手不入夹
  const d = await dragTo("t1", "fd1", { hoverMs: 800 });
  T("①前置拖起悬停", d);
  const scA = await scaleOfFd1();
  T("①3s 内无放大反馈（scale 不亮）", !(Math.abs(parseFloat(scA) - 1.12) < 0.02));
  const popA = await popoverOpen();
  T("①3s 内不自动开夹（500ms 自动开夹退役）", !popA);
  await page.mouse.up();
  await page.waitForTimeout(900);
  const stA = await linksState();
  const fd1A = stA.find((e) => e.id === "fd1");
  T("①3s 内松手不入夹（甲站仍在墙）", !fd1A.children.some((c) => c.id === "t1") && stA.some((e) => e.id === "t1"));
  await page.mouse.move(100, 100);
  await page.waitForTimeout(400);

  // 场景 B：悬停 3600ms（≥3s）→ 反馈亮出（scale≈1.12）→ 松手 = 幽灵飞入 + 不开夹
  await seedWall();
  const d2 = await dragTo("t1", "fd1", { hoverMs: 3600 });
  T("①前置拖起满驻留", d2);
  const scB = await scaleOfFd1();
  T("①满 3s 放大反馈亮出（scale≈1.12）", Math.abs(parseFloat(scB) - 1.12) < 0.02);
  await page.mouse.up();
  await page.waitForTimeout(180); // 幽灵飞行窗口内采样
  const g1 = await ghostInFlight();
  const popB = await popoverOpen();
  T("①松手瞬间幽灵接管（z-80 幽灵层在场）", g1);
  T("①入夹全程夹页不开（popover 不出现）", !popB);
  // 420ms 飞行 + 130ms 淡出 + 落账（持久化 deferMs=800 防抖）——轮询等待
  const stB = await linksStateWait(
    (st) => {
      const fd = st.find((e) => e.id === "fd1");
      return fd && fd.children.some((c) => c.id === "t1") && !st.some((e) => e.id === "t1");
    },
    3500,
  );
  const fd1B = stB.find((e) => e.id === "fd1");
  T("①幽灵落账甲站入夹", fd1B && fd1B.children.some((c) => c.id === "t1") && !stB.some((e) => e.id === "t1"));
  const g2 = await ghostInFlight();
  T("①飞完幽灵卸载", !g2);
  const scC = await scaleOfFd1();
  T("①落账后反馈清零（scale 回 1）", !(Math.abs(parseFloat(scC) - 1.12) < 0.02));
}

console.log("---- 门② 夹内拖拽出面板 3 秒驻留关闭 ----");
{
  await seedWall();
  await page.locator('.cl-links-drawer [data-entry-id="fd1"] [data-cl-tile]').first().click();
  await page.waitForTimeout(900);
  T("②前置夹页打开", await popoverOpen());

  // 场景 A：拖 a1 出面板矩形，驻留 0.3s 就拉回面板内松手 → 夹页不关、a1 不出夹
  // （拉回路径含 CDP 往返耗时，驻留预算要留足余量，须在满 3s 前完成）
  const pop = await page.locator("[data-cl-folder-popover]").boundingBox();
  const a1b = await page.locator('[data-cl-folder-popover] [data-entry-id="a1"]').boundingBox();
  T("②前置面板与子磁贴定位", !!pop && !!a1b);
  if (pop && a1b) {
    const ax = a1b.x + a1b.width / 2, ay = a1b.y + a1b.height / 2;
    const ox = Math.max(30, pop.x - 240), oy = Math.min(860, pop.y + 330);
    await page.mouse.move(ax, ay);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) { await page.mouse.move(ax + ((ox - ax) * i) / 12, ay + ((oy - ay) * i) / 12); await page.waitForTimeout(26); }
    await page.waitForTimeout(300);
    T("②A 驻留 0.3s 夹页未关", await popoverOpen());
    for (let i = 1; i <= 8; i++) { await page.mouse.move(ox + ((ax - ox) * i) / 8, oy + ((ay - oy) * i) / 8); await page.waitForTimeout(26); }
    await page.mouse.up();
    await page.waitForTimeout(700);
    const stA = await linksState();
    const fd1A = stA.find((e) => e.id === "fd1");
    T("②A 拉回面板内松手不出夹", fd1A.children.some((c) => c.id === "a1") && !stA.some((e) => e.id === "a1" && !e.folder));
    T("②A 夹页保持打开", await popoverOpen());

    // 场景 B：拖 a2 出面板矩形驻留 3.5s → 夹页自动关闭（回磁贴墙）→ 松手 a2 落墙
    const a2b = await page.locator('[data-cl-folder-popover] [data-entry-id="a2"]').boundingBox();
    const ax2 = a2b.x + a2b.width / 2, ay2 = a2b.y + a2b.height / 2;
    await page.mouse.move(ax2, ay2);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) { await page.mouse.move(ax2 + ((ox - ax2) * i) / 12, ay2 + ((oy - ay2) * i) / 12); await page.waitForTimeout(26); }
    await page.waitForTimeout(3500); // 驻留 ≥3s → 计时响、夹关闭
    T("②B 驻留 3.5s 夹页自动关闭", !(await popoverOpen()));
    T("②B 抽屉仍在（回到磁贴墙）", await veilOpen());
    await page.mouse.up();
    const stB = await linksStateWait(
      (st) => {
        const fd = st.find((e) => e.id === "fd1");
        return fd && !fd.children.some((c) => c.id === "a2") && st.some((e) => e.id === "a2");
      },
      3000,
    );
    const fd1B = stB.find((e) => e.id === "fd1");
    T("②B 松手 a2 落墙（出夹成功）", !fd1B.children.some((c) => c.id === "a2") && stB.some((e) => e.id === "a2"));
  }
}

console.log("---- 门③ 168 继承回归（受本次改动牵连的面） ----");
{
  await seedWall();
  // 168③ will-change + tracking-normal（TileVisual 缩放包裹层）
  const wc = await page.evaluate(() => {
    const el = document.querySelector('.cl-links-drawer [data-entry-id="fd1"] .tile-shell.h-16');
    return el ? getComputedStyle(el.parentElement).willChange : "?";
  });
  T("③TileVisual 缩放包裹层 will-change: transform", wc === "transform");
  const letter = await page.evaluate(() => {
    const el = document.querySelector('[data-entry-id="fd1"] .tile-shell.h-16 [data-cl-folder-grid] span:last-child span, [data-entry-id="fd1"] .tile-shell.h-16 [data-cl-folder-grid] > span > span');
    return el ? el.className : "";
  });
  T("③字母格 tracking-normal 在位", /tracking-normal/.test(letter));
  // 168⑤ 纯白半透明夹色
  const bg = await page.evaluate(() => {
    const body = document.querySelector('[data-entry-id="fd1"] .tile-shell.h-16 .tile-body');
    const ring = document.querySelector('[data-entry-id="fd1"] .tile-shell.h-16 .tile-ring');
    return { body: getComputedStyle(body).backgroundImage, ring: getComputedStyle(ring).boxShadow };
  });
  T("⑤夹体白雾渐变（无 hsl 彩相）", /rgba\(255, 255, 255/.test(bg.body) && !/hsl\(/.test(bg.body));
  T("⑤描边环白色（无彩色 hsl）", /rgba\(255, 255, 255/.test(bg.ring) && !/hsl\(/.test(bg.ring));
  // 168④ 右键专属菜单 + 解散
  const c = await page.locator('.cl-links-drawer [data-entry-id="fd2"] [data-cl-tile]').first().boundingBox();
  await page.mouse.click(c.x + c.width / 2, c.y + c.height / 2, { button: "right" });
  await page.waitForTimeout(600);
  const menu = await page.evaluate(() => {
    const m = document.querySelector('[role="menu"][aria-label="文件夹菜单"]');
    return m ? [...m.querySelectorAll("[role=menuitem]")].map((b) => b.textContent.trim()) : null;
  });
  T("④右键弹专属菜单三项", !!menu && menu.length === 3 && /打开文件夹/.test(menu[0]) && /重命名/.test(menu[1]) && /解散文件夹/.test(menu[2]));
  await page.locator('[aria-label="文件夹菜单"] [role=menuitem]:has-text("解散文件夹")').click();
  await page.waitForTimeout(800);
  const st = await linksState();
  T("④解散文件夹：children 散落回墙", !st.some((e) => e.id === "fd2") && st.filter((e) => e.id.startsWith("b")).length === 3);
  await seedWall();
  // 168⑥⑦ 抽屉空白判定（点击路径未被本次改动牵连，抽查）
  await page.locator('.cl-links-drawer [data-entry-id="fd1"] [data-cl-tile]').first().click();
  await page.waitForTimeout(900);
  await page.mouse.click(1050, 800);
  await page.waitForTimeout(700);
  T("⑥morph 点空白只关夹页", !(await popoverOpen()));
  T("⑥morph 点空白抽屉保持", await veilOpen());
  const tile = await page.locator('.cl-links-drawer [data-entry-id="fd1"]').first().boundingBox();
  await page.mouse.click(Math.max(60, tile.x - 260), tile.y + tile.height / 2);
  await page.waitForTimeout(900);
  T("⑦磁贴两侧空白点击关抽屉", !(await veilOpen()));
  await openDrawer(); await page.waitForTimeout(1000);
  T("⑦抽屉可复开", await veilOpen());
}

console.log("---- 门E pageerror ----");
T("E 全程零 pageerror", errors.length === 0);

await page.screenshot({ path: "/tmp/smoke169-final.png" });
await browser.close();
console.log(`\nSMOKE-169: ${pass} PASS / ${bad.length} FAIL`);
if (bad.length) process.exit(1);
