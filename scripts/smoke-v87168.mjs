// smoke-v87168.mjs — v8.7.168 文件夹交互精修七连修 真扩展冒烟
// ①拖拽悬停文件夹放大反馈  ②夹内拖拽出夹地理闸  ③悬停放大图标零位移(will-change)
// ④右键文件夹专属菜单(解散) ⑤文件夹纯白半透明  ⑥抽屉夹层点空白不误关抽屉
// ⑦抽屉磁贴两侧空白点击可退抽屉
import { chromium } from "playwright-core";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";

const ZIP = "/home/z/beta-wt/download/v8.7.168/ChuShi-NewTab-v8.7.168.zip";
const STAGE = "/tmp/ext-smoke168";
const PROFILE = "/tmp/ext-smoke168-profile";
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

const mk = (n, pfx, nm) =>
  Array.from({ length: n }, (_, i) => ({ id: pfx + (i + 1), name: nm + (i + 1), url: `https://${pfx}${i + 1}.example.com` }));
const LINKS = JSON.stringify([
  { id: "t1", name: "甲站", url: "https://t1.example.com" },
  { id: "t2", name: "乙站", url: "https://t2.example.com" },
  { id: "fd1", name: "诊断夹", folder: true, children: mk(4, "a", "站") },
  { id: "fd2", name: "第二夹", folder: true, children: mk(3, "b", "乙") },
]);
const seed = (extra = {}) =>
  page.evaluate(([links, st]) => {
    localStorage.setItem("start:links", links);
    localStorage.setItem("start:settings", st);
  }, [LINKS, JSON.stringify({ iconStyle: "letter", linksForm: "drawer", ...extra })]);
const boot = async (extra = {}) => {
  await page.goto(`chrome-extension://${extId}/index.html`, { waitUntil: "load", timeout: 60000 });
  await page.waitForTimeout(2200);
  await seed(extra);
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(2000);
  await page.keyboard.press("Alt+v");
  await page.waitForTimeout(1100);
};
const openDrawer = () => page.keyboard.press("Alt+v");
const veilOpen = () => page.evaluate(() => document.querySelectorAll(".cl-drawer-veil").length > 0);
const wallCount = () => page.evaluate(() => JSON.parse(localStorage.getItem("start:links")).length);
const linksState = () => page.evaluate(() => JSON.parse(localStorage.getItem("start:links")));
const linksStateWait = async (pred, ms = 2500) => {
  const t0 = Date.now();
  for (;;) {
    const st = await linksState();
    if (pred(st)) return st;
    if (Date.now() - t0 > ms) return st;
    await page.waitForTimeout(150);
  }
};
const center = async (sel) => {
  const b = await page.locator(sel).first().boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2, b };
};
const centerWall = async (sel) => {
  const b = await page.locator(`.cl-links-drawer ${sel}`).first().boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2, b };
};

async function dragTile(fromId, toId, hoverMs = 0, steps = 10) {
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
  await page.mouse.up();
  await page.waitForTimeout(600);
  return true;
}

await boot();
console.log("---- 门① 拖拽悬停文件夹放大反馈 ----");
{
  // 场景 A：悬停 250ms（安全低于 dwell 500ms）松手 → 兜底入夹 + 反馈清零
  const seedWall = async () => {
    await page.evaluate(() => {
      localStorage.setItem("start:links", JSON.stringify([
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
      ]));
    });
    await page.reload({ waitUntil: "load" });
    await page.waitForTimeout(1800);
    await page.keyboard.press("Alt+v");
    await page.waitForTimeout(1000);
  };
  await seedWall();
  const a = await page.locator('.cl-links-drawer [data-entry-id="t1"]').first().boundingBox();
  const b = await page.locator('.cl-links-drawer [data-entry-id="fd1"] .tile-shell.h-16').first().boundingBox();
  const ax = a.x + a.width / 2, ay = a.y + a.height / 2;
  const bx = b.x + b.width / 2, by = b.y + b.height / 2;
  await page.mouse.move(ax, ay);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(ax + ((bx - ax) * i) / 8, ay + ((by - ay) * i) / 8);
    await page.waitForTimeout(24);
  }
  await page.waitForTimeout(250); // 低于 dwell 500ms
  const scaleHover = await page.evaluate(() => {
    const el = document.querySelector('.cl-links-drawer [data-entry-id="fd1"] .tile-shell.h-16');
    return el ? getComputedStyle(el.parentElement).scale : "none";
  });
  T("①拖拽悬停中文件夹包裹层 scale≈1.12", Math.abs(parseFloat(scaleHover) - 1.12) < 0.02);
  await page.mouse.up();
  await page.waitForTimeout(1100);
  const stA = await linksState();
  const fd1A = stA.find((e) => e.id === "fd1");
  T("①悬停松手甲站入夹（兜底路径）", fd1A && fd1A.children.some((c) => c.id === "t1"));
  await page.mouse.move(100, 100); // 先移开指针（否则磁贴合法处于 CSS hover 1.07 态）
  await page.waitForTimeout(500);
  const hintCleared = await page.evaluate(() => {
    const el = document.querySelector('.cl-links-drawer [data-entry-id="fd1"] .tile-shell.h-16');
    if (!el) return "?";
    const wrap = el.parentElement;
    const sc = parseFloat(getComputedStyle(wrap).scale);
    return !/scale-\[1\.12\]/.test(wrap.className) && (Number.isNaN(sc) ? true : Math.abs(sc - 1) < 0.02);
  });
  T("①松手后反馈清零（类摘除+scale 回 1）", hintCleared === true);
  // 场景 B：悬停 850ms（dwell 开夹后）松手 → 经展开夹吸收入夹
  await seedWall();
  const a2b = await page.locator('.cl-links-drawer [data-entry-id="t1"]').first().boundingBox();
  const b2b = await page.locator('.cl-links-drawer [data-entry-id="fd1"] .tile-shell.h-16').first().boundingBox();
  const ax2 = a2b.x + a2b.width / 2, ay2 = a2b.y + a2b.height / 2;
  const bx2 = b2b.x + b2b.width / 2, by2 = b2b.y + b2b.height / 2;
  await page.mouse.move(ax2, ay2);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(ax2 + ((bx2 - ax2) * i) / 8, ay2 + ((by2 - ay2) * i) / 8);
    await page.waitForTimeout(24);
  }
  await page.waitForTimeout(850); // dwell 500ms 已开夹
  await page.mouse.up();
  await page.waitForTimeout(1100);
  const stB = await linksState();
  const fd1B = stB.find((e) => e.id === "fd1");
  T("①dwell 开夹后松手仍入夹（展开吸收路径）", fd1B && fd1B.children.some((c) => c.id === "t1"));
  // 设计语义：拖拽会话结束后 popover 保持展开（连续入夹）——点空白收起再复位种子
  await page.mouse.click(1050, 800);
  await page.waitForTimeout(800);
  T("①清理：夹页收起", await page.evaluate(() => !document.querySelector("[data-cl-folder-popover]")));
  await seedWall(); // 场景 B 已把 t1 吸收入夹，恢复初始墙供后续门次使用
}

console.log("---- 门② 夹内拖拽出夹地理闸 ----");
{
  // 打开 fd1 popover
  await page.locator('.cl-links-drawer [data-entry-id="fd1"] [data-cl-tile]').first().click();
  await page.waitForTimeout(900);
  const popOpen = await page.evaluate(() => !!document.querySelector("[data-cl-folder-popover]"));
  T("②夹页打开", popOpen);
  const before = await linksState();
  // 夹内拖拽：a1 → a4（同夹排序，应生效）
  const a1 = await page.locator('[data-cl-folder-popover] [data-entry-id="a1"]').boundingBox();
  const a4 = await page.locator('[data-cl-folder-popover] [data-entry-id="a4"]').boundingBox();
  if (a1 && a4) {
    const ax = a1.x + a1.width / 2, ay = a1.y + a1.height / 2;
    const bx = a4.x + a4.width / 2, by = a4.y + a4.height / 2;
    await page.mouse.move(ax, ay);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) { await page.mouse.move(ax + ((bx - ax) * i) / 8, ay + ((by - ay) * i) / 8); await page.waitForTimeout(24); }
    await page.waitForTimeout(120);
    // 关键：夹内拖拽路径上（指针未出面板），墙长度必须不变（不影响桌面）
    const midWall = await wallCount();
    T("②夹内拖拽中途墙长不变（零误出夹）", midWall === before.length);
    // 中途把指针挪向面板边缘外一点的墙上磁贴方向再回面板内：仍零出夹
    await page.mouse.up();
    await page.waitForTimeout(600);
  } else {
    T("②夹内子磁贴定位失败", false);
  }
  const after = await linksStateWait((st) => {
    const fd = st.find((e) => e.id === "fd1");
    return fd && JSON.stringify(fd.children.map((c) => c.id)) === JSON.stringify(["a2", "a3", "a4", "a1"]);
  });
  console.log("  [DBG] fd1 order:", JSON.stringify(after.find((e) => e.id === "fd1").children.map((c) => c.id)), "wall:", JSON.stringify(after.map((e) => (e.folder ? `${e.id}(${e.children.length})` : e.id))));
  T("②同夹排序生效（a1→a4 位）", JSON.stringify(after.find((e) => e.id === "fd1").children.map((c) => c.id)) === JSON.stringify(["a2", "a3", "a4", "a1"]));
  T("②墙长守恒（无成员丢失）", after.length === before.length);
  // 出夹仍可用：把 a1 拖出面板矩形（拖到面板外墙上空白 → wall-zone 出夹）
  const pop = await page.locator("[data-cl-folder-popover]").boundingBox();
  const a1b = await page.locator('[data-cl-folder-popover] [data-entry-id="a1"]').boundingBox();
  if (pop && a1b) {
    const ax = a1b.x + a1b.width / 2, ay = a1b.y + a1b.height / 2;
    // 目标：面板左侧远处（面板外，属于墙区空白）
    const ox = Math.max(30, pop.x - 220);
    const oy = Math.min(860, pop.y + 320);
    await page.mouse.move(ax, ay);
    await page.mouse.down();
    for (let i = 1; i <= 14; i++) { await page.mouse.move(ax + ((ox - ax) * i) / 14, ay + ((oy - ay) * i) / 14); await page.waitForTimeout(26); }
    await page.mouse.up();
    await page.waitForTimeout(700);
    const st2 = await linksState();
    const fd1 = st2.find((e) => e.id === "fd1");
    T("②真拖出面板矩形=正常出夹（a1 回墙）", !fd1.children.some((c) => c.id === "a1") && st2.some((e) => e.id === "a1"));
    // 回滚
    await page.evaluate(() => {
      const st = JSON.parse(localStorage.getItem("start:links"));
      const a1 = st.find((e) => e.id === "a1");
      const rest = st.filter((e) => e.id !== "a1");
      const fd = rest.find((e) => e.id === "fd1");
      fd.children.unshift(a1);
      localStorage.setItem("start:links", JSON.stringify(rest));
    });
    await page.reload({ waitUntil: "load" });
    await page.waitForTimeout(1800);
    await openDrawer(); await page.waitForTimeout(1000);
  }
}

console.log("---- 门③ will-change 在位（放大动画栅格冻结） ----");
{
  const wc = await page.evaluate(() => {
    const el = document.querySelector('[data-entry-id="fd1"] .tile-shell.h-16');
    return el ? getComputedStyle(el.parentElement).willChange : "?";
  });
  T("③TileVisual 缩放包裹层 will-change: transform", wc === "transform");
  const letter = await page.evaluate(() => {
    const el = document.querySelector('[data-entry-id="fd1"] .tile-shell.h-16 [data-cl-folder-grid] span:last-child span, [data-entry-id="fd1"] .tile-shell.h-16 [data-cl-folder-grid] > span > span');
    return el ? el.className : "";
  });
  T("③字母格 tracking-normal 在位", /tracking-normal/.test(letter));
}

console.log("---- 门④ 右键文件夹专属菜单 ----");
{
  const c = await centerWall('[data-entry-id="fd2"] [data-cl-tile]');
  await page.mouse.click(c.x, c.y, { button: "right" });
  await page.waitForTimeout(600);
  const menu = await page.evaluate(() => {
    const m = document.querySelector('[role="menu"][aria-label="文件夹菜单"]');
    if (!m) return null;
    return { items: [...m.querySelectorAll("[role=menuitem]")].map((b) => b.textContent.trim()) };
  });
  T("④右键弹专属菜单", !!menu);
  T("④菜单含 打开/重命名/解散 三项", !!menu && menu.items.length === 3 && /打开文件夹/.test(menu.items[0]) && /重命名/.test(menu.items[1]) && /解散文件夹/.test(menu.items[2]));
  // 解散 fd2
  const dissolveBtn = page.locator('[aria-label="文件夹菜单"] [role=menuitem]:has-text("解散文件夹")');
  await dissolveBtn.click();
  await page.waitForTimeout(800);
  const st = await linksState();
  T("④解散文件夹：children 散落回墙", !st.some((e) => e.id === "fd2") && st.filter((e) => e.id.startsWith("b")).length === 3);
  // 右键磁贴不弹页面菜单（页面级让位）+ 不弹系统菜单
  const pageMenuAfter = await page.evaluate(() => !!document.querySelector('[role="menu"]:not([aria-label="文件夹菜单"])'));
  T("④解散后无残留菜单层", !pageMenuAfter);
  // 回滚 fd2
  await page.evaluate(() => {
    const st = JSON.parse(localStorage.getItem("start:links"));
    const bs = st.filter((e) => e.id.startsWith("b")).map((e) => ({ id: e.id, name: e.name, url: e.url }));
    const rest = st.filter((e) => !e.id.startsWith("b"));
    rest.push({ id: "fd2", name: "第二夹", folder: true, children: bs });
    localStorage.setItem("start:links", JSON.stringify(rest));
  });
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(1800);
  await openDrawer(); await page.waitForTimeout(1000);
}

console.log("---- 门⑤ 文件夹纯白半透明 ----");
{
  const bg = await page.evaluate(() => {
    const body = document.querySelector('[data-entry-id="fd1"] .tile-shell.h-16 .tile-body');
    const ring = document.querySelector('[data-entry-id="fd1"] .tile-shell.h-16 .tile-ring');
    return { body: getComputedStyle(body).backgroundImage, ring: getComputedStyle(ring).boxShadow };
  });
  T("⑤夹体白雾渐变（无 hsl 彩相）", /rgba\(255, 255, 255/.test(bg.body) && !/hsl\(/.test(bg.body));
  T("⑤描边环白色（无彩色 hsl）", /rgba\(255, 255, 255/.test(bg.ring) && !/hsl\(/.test(bg.ring));
}

console.log("---- 门⑥ 抽屉里夹层点空白不误关抽屉 ----");
{
  // morph 形态：打开 fd1 popover → 点空白 → popover 关、抽屉仍开
  await page.locator('.cl-links-drawer [data-entry-id="fd1"] [data-cl-tile]').first().click();
  await page.waitForTimeout(900);
  T("⑥前置夹页打开(morph)", await page.evaluate(() => !!document.querySelector("[data-cl-folder-popover]")));
  await page.mouse.click(1050, 800); // 抽屉内空白（veil/滚层空白区）
  await page.waitForTimeout(700);
  const popGone = await page.evaluate(() => !document.querySelector("[data-cl-folder-popover]"));
  const drawerStill = await veilOpen();
  T("⑥morph 点空白只关夹页", popGone);
  T("⑥morph 点空白抽屉保持", drawerStill);
  // inline 形态
  await page.evaluate(() => {
    const st = JSON.parse(localStorage.getItem("start:settings"));
    st.folderOpenStyle = "inline";
    localStorage.setItem("start:settings", JSON.stringify(st));
  });
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(1800);
  await openDrawer(); await page.waitForTimeout(1000);
  await page.locator('.cl-links-drawer [data-entry-id="fd1"] [data-cl-tile]').first().click();
  await page.waitForTimeout(900);
  T("⑥前置夹膨胀(inline)", await page.evaluate(() => !!document.querySelector("[data-cl-folder-inline]")));
  await page.mouse.click(1050, 800);
  await page.waitForTimeout(900);
  const inlineGone = await page.evaluate(() => !document.querySelector("[data-cl-folder-inline]"));
  T("⑥inline 点空白只关夹层", inlineGone);
  T("⑥inline 点空白抽屉保持", await veilOpen());
  // 恢复 morph
  await page.evaluate(() => {
    const st = JSON.parse(localStorage.getItem("start:settings"));
    st.folderOpenStyle = "morph";
    localStorage.setItem("start:settings", JSON.stringify(st));
  });
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(1800);
  await openDrawer(); await page.waitForTimeout(1000);
}

console.log("---- 门⑦ 抽屉磁贴两侧空白点击退抽屉 ----");
{
  const tile = await page.locator('.cl-links-drawer [data-entry-id="fd1"]').first().boundingBox();
  // 磁贴行左侧空白：同 y、x 远离磁贴（仍在滚层带内）
  const lx = Math.max(60, tile.x - 260);
  await page.mouse.click(lx, tile.y + tile.height / 2);
  await page.waitForTimeout(900);
  T("⑦磁贴两侧空白点击关抽屉", !(await veilOpen()));
  // 再开抽屉确认可复开
  await openDrawer(); await page.waitForTimeout(1000);
  T("⑦抽屉可复开", await veilOpen());
}

console.log("---- 门E pageerror ----");
T("E 全程零 pageerror", errors.length === 0);

await page.screenshot({ path: "/tmp/smoke168-final.png" });
await browser.close();
console.log(`\nSMOKE-168: ${pass} PASS / ${bad.length} FAIL`);
if (bad.length) { console.log("FAILED:", bad.join(" | ")); process.exit(1); }
