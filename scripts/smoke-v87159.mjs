// smoke-v87159.mjs — v8.7.159 真扩展冒烟（核心：文件夹展开方式三选一 + 文件夹全链路回归）
// 门A 真 zip 解包 → --load-extension 加载
// 门B 种入混合数据（4 顶层链接 + 1 文件夹含 5 站点，linksForm=docked 常驻墙）
//     → 九宫格夹磁贴渲染（data-cl-folder-grid + 3 图标格 + 「+2」计数格）
// 门C 点击文件夹 → morph 形变绽放 popover（白卡 solid-card + 头部 + 5 个站点）
// 门D 重命名：铅笔 → 输入「工作」→ Enter → localStorage 同步 + 头部跟随
// 门E 右键菜单「新建文件夹」→ localStorage 新增 folder:true 条目
// 门F 拖叠入夹：拖墙内磁贴悬停文件夹 500ms → dwell 自动展开 → 松手入夹
//     + 写合并断言：dragOver 让位后 localStorage 未即时写（延迟落盘）
// 门G 夹内拖出：popover 里拖子磁贴到墙内磁贴 → 出夹插位
// 门H 拆散：popover「拆散文件夹」→ 夹消失、children 依序回墙零丢失
// 门J modal 居中模态：遮罩在场 + 白卡居中 + 点遮罩收起全卸
// 门K inline 原位内嵌：膨胀卡在墙网格内（非 fixed）+ 拖入/拖出 + 收起还原九宫格
// 门L morph 真形变专项（v8.7.159 用户定稿口径）：磁贴本体长大成白卡——
//     绽放中 skin 在场 / 落位面板宽=自然宽 336±2 / skin 计数格与九宫格同源 /
//     收起存续窗后 portal 全卸 + 九宫格磁贴还原
// 门I pageerror === 0
import { chromium } from "playwright-core";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";

const ZIP = "/home/z/beta-wt/download/v8.7.159/ChuShi-NewTab-v8.7.159.zip";
const STAGE = "/tmp/ext-smoke-v87159";
const PROFILE = "/tmp/ext-profile-v87159";
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
console.log("extension id:", extId);

const page = browser.pages()[0] || (await browser.newPage());
const errors = [];
page.on("pageerror", (e) => errors.push(e.message.slice(0, 140)));
await page.goto(`chrome-extension://${extId}/index.html`, { waitUntil: "load", timeout: 60000 });
await page.waitForTimeout(1200);

// ---------- 种入混合数据（常驻墙可视可交互；三阶段复用同一份夹数据） ----------
const LINKS_SEED = JSON.stringify([
  { id: "t1", name: "GitHub", url: "https://github.com" },
  { id: "t2", name: "哔哩哔哩", url: "https://www.bilibili.com" },
  { id: "t3", name: "知乎", url: "https://www.zhihu.com" },
  { id: "t4", name: "微博", url: "https://weibo.com" },
  { id: "fd1", name: "常用", folder: true, children: [
    { id: "c1", name: "网易云音乐", url: "https://music.163.com" },
    { id: "c2", name: "起点读书", url: "https://www.qidian.com" },
    { id: "c3", name: "豆瓣", url: "https://www.douban.com" },
    { id: "c4", name: "百度", url: "https://www.baidu.com" },
    { id: "c5", name: "掘金", url: "https://juejin.cn" },
  ] },
]);
const seed = (style) =>
  page.evaluate(([links, st]) => {
    localStorage.setItem("start:settings", st);
    localStorage.setItem("start:links", links);
  }, [LINKS_SEED, JSON.stringify({ iconStyle: "letter", linksForm: "docked", ...(style ? { folderOpenStyle: style } : {}) })]);

await seed(null);
await page.reload({ waitUntil: "load" });
await page.waitForTimeout(2000);

// ---------- 门B：九宫格夹磁贴渲染 ----------
const fdTile = page.locator('[data-entry-id="fd1"]');
T("B1 文件夹磁贴在墙", (await fdTile.count()) === 1);
T("B2 打开文件夹 aria", (await fdTile.locator('[aria-label="打开文件夹 常用"]').count()) === 1);
const grid = fdTile.locator("[data-cl-folder-grid]");
T("B3 九宫格内容层渲染", (await grid.count()) === 1);
T("B4 >4 站收敛：3 图标格 + 1 计数格", (await grid.locator("> span").count()) === 4);
T("B5 计数格文本 +2", ((await grid.locator("> span").last().innerText()) || "").trim() === "+2");
T("B6 顶层链接磁贴照常", (await page.locator('[data-entry-id="t1"]').count()) === 1);
T("B7 旧数据零迁移（夹内链接未上墙）", (await page.locator('[data-entry-id="c1"]').count()) === 0);

// ---------- 门C：点击原位展开（morph 默认形态） ----------
await fdTile.click();
await page.waitForTimeout(600);
const pop = page.locator("[data-cl-folder-popover]");
T("C1 popover 挂载", (await pop.count()) === 1);
T("C2 白卡 solid-card 实底", (await pop.locator(".solid-card").count()) === 1);
T("C3 毛玻璃 glass-card 退役", (await pop.locator(".glass-card").count()) === 0);
T("C4 头部名称", (await pop.innerText()).includes("常用"));
T("C5 头部计数", (await pop.innerText()).includes("5 个站点"));
T("C6 夹内磁贴可见", (await pop.locator('[data-entry-id="c1"]').count()) === 1);
T("C7 夹内磁贴无 href 误植/可点击", (await pop.locator('[data-entry-id="c1"] a').count()) === 1);
T("C8 morph 迷你格覆盖层在场", (await page.locator("[data-cl-folder-morph-preview]").count()) === 1);

// ---------- 门D：重命名 ----------
await pop.locator('button[aria-label="重命名文件夹"]').click();
await page.waitForTimeout(200);
const nameInput = pop.locator('input[aria-label="文件夹名称"]');
T("D1 改名输入框出现", (await nameInput.count()) === 1);
await nameInput.fill("工作");
await nameInput.press("Enter");
await page.waitForTimeout(1600); // 写合并 800ms 落盘 + 余量
const lsAfterRename = JSON.parse(await page.evaluate(() => localStorage.getItem("start:links")));
const fdRenamed = lsAfterRename.find((e) => e.id === "fd1");
T("D2 localStorage 文件夹改名", fdRenamed && fdRenamed.name === "工作");
T("D3 头部跟随", (await pop.innerText()).includes("工作"));
T("D4 children 保留", fdRenamed && fdRenamed.children.length === 5);

// ---------- 门E：右键菜单新建文件夹 ----------
await page.mouse.click(640, 60, { button: "right" });
await page.waitForTimeout(400);
const ctxNewFolder = page.locator('text=新建文件夹').first();
T("E1 右键菜单含新建文件夹", (await ctxNewFolder.count()) >= 1);
await ctxNewFolder.click();
await page.waitForTimeout(1600); // 写合并 800ms 落盘 + 余量
const lsAfterNew = JSON.parse(await page.evaluate(() => localStorage.getItem("start:links")));
const newFd = lsAfterNew.find((e) => e.folder === true && e.name === "新建文件夹");
T("E2 localStorage 新增 folder 条目", !!newFd);

// ---------- 门F：拖叠入夹（dwell 自动展开 + 写合并断言） ----------
// 关掉 E 建的夹对后续断言的干扰：重载恢复种子态（改名后的 工作夹 保留）
await page.reload({ waitUntil: "load" });
await page.waitForTimeout(1800);
const srcTile = page.locator('[data-entry-id="t4"]'); // 微博（顶层）
const dstTile = page.locator('[data-entry-id="fd1"]'); // 工作夹
const sb = await srcTile.boundingBox();
const db = await dstTile.boundingBox();
T("F0 拖拽两端盒子就位", !!sb && !!db);
await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2);
await page.mouse.down();
await page.mouse.move(sb.x + sb.width / 2 + 14, sb.y + sb.height / 2 + 4, { steps: 4 }); // 越过 6px 激活阈
await page.mouse.move(db.x + db.width / 2, db.y + db.height / 2, { steps: 18 }); // 移向文件夹（粘滞不排序，夹不动）
await page.waitForTimeout(900); // dwell 500ms → popover 自动展开
const popDuringDrag = await page.locator("[data-cl-folder-popover]").count();
T("F1 dwell 自动展开 popover", popDuringDrag === 1);
const rawBefore = await page.evaluate(() => localStorage.getItem("start:links"));
await page.mouse.up(); // 指针仍停在夹磁贴上 → dragEnd 兜底入夹
await page.waitForTimeout(300);
const rawSoon = await page.evaluate(() => localStorage.getItem("start:links"));
T("F2 松手 300ms 未落盘（写合并延迟）", rawSoon === rawBefore);
await page.waitForTimeout(1500); // 写合并 800ms 落盘 + 余量
const lsAfterDrop = JSON.parse(await page.evaluate(() => localStorage.getItem("start:links")));
const fdAfterDrop = lsAfterDrop.find((e) => e.id === "fd1");
T("F3 微博已入工作夹", fdAfterDrop && fdAfterDrop.children.some((c) => c.id === "t4"));
T("F4 顶层微博已摘除", !lsAfterDrop.some((e) => e.id === "t4"));
T("F5 其余磁贴零丢失（夹外 3 链接）", lsAfterDrop.filter((e) => !e.folder).length === 3);

// ---------- 门G：夹内拖出（此时 popover 仍开着——拖拽后保持展开） ----------
const childBox = await page.locator("[data-cl-folder-popover]").locator('[data-entry-id="t4"]').boundingBox();
const wallBox = await page.locator('[data-entry-id="t1"]').boundingBox();
T("G0 夹内子磁贴在 popover 可见", !!childBox && !!wallBox);
if (!childBox || !wallBox) { throw new Error("G0 前置失败"); }
await page.mouse.move(childBox.x + childBox.width / 2, childBox.y + childBox.height / 2);
await page.mouse.down();
await page.mouse.move(childBox.x + childBox.width / 2 + 14, childBox.y + childBox.height / 2, { steps: 4 });
await page.mouse.move(wallBox.x + wallBox.width / 2, wallBox.y + wallBox.height / 2, { steps: 18 });
await page.waitForTimeout(350);
await page.mouse.up();
await page.waitForTimeout(1600);
const lsAfterOut = JSON.parse(await page.evaluate(() => localStorage.getItem("start:links")));
T("G1 微博已出夹回墙", lsAfterOut.some((e) => e.id === "t4" && !e.folder));
T("G2 夹内已无微博", !(lsAfterOut.find((e) => e.id === "fd1") || { children: [] }).children.some((c) => c.id === "t4"));

// ---------- 门H：拆散 ----------
// F 拖拽后 popover 保持展开——已开则不再点磁贴（点了会切换成关闭）
if ((await page.locator("[data-cl-folder-popover]").count()) === 0) {
  const fdBox = await page.locator('[data-entry-id="fd1"]').boundingBox();
  await page.mouse.click(fdBox.x + fdBox.width / 2, fdBox.y + fdBox.height / 2);
  await page.waitForTimeout(500);
}
T("H0 popover 在位", (await page.locator("[data-cl-folder-popover]").count()) === 1);
await page.locator('button[aria-label="拆散文件夹"]').click();
await page.waitForTimeout(1600);
const lsAfterDiss = JSON.parse(await page.evaluate(() => localStorage.getItem("start:links")));
T("H1 文件夹已拆", !lsAfterDiss.some((e) => e.id === "fd1"));
T("H2 站点零丢失（9 链接全在顶层；E 建的空夹仍在）", lsAfterDiss.filter((e) => !e.folder).length === 9 && lsAfterDiss.some((e) => e.folder && e.children.length === 0));

// ---------- 门J：modal 居中模态（folderOpenStyle:"modal"） ----------
await seed("modal");
await page.reload({ waitUntil: "load" });
await page.waitForTimeout(2000);
await page.locator('[data-entry-id="fd1"]').click();
await page.waitForTimeout(700);
const overlayJ = page.locator("[data-cl-folder-modal]");
const popJ = page.locator("[data-cl-folder-popover]");
T("J1 modal 压暗遮罩在场", (await overlayJ.count()) === 1);
T("J2 popover 白卡在场", (await popJ.count()) === 1 && (await popJ.locator(".solid-card").count()) === 1);
const pb = await popJ.boundingBox();
T("J3 面板几何居中（1280×900 中心 ±40/±48）",
  !!pb && Math.abs(pb.x + pb.width / 2 - 640) <= 40 && Math.abs(pb.y + pb.height / 2 - 450) <= 48);
T("J3b modal 内容区上限抬升", (await popJ.innerText()).includes("5 个站点"));
await page.mouse.click(40, 860); // 点遮罩空白（面板外）
await page.waitForTimeout(800);  // exit 160ms + 收起存续窗 270ms + 余量
T("J4 点遮罩收起（遮罩与面板全卸）", (await overlayJ.count()) === 0 && (await popJ.count()) === 0);

// ---------- 门K：inline 原位内嵌（folderOpenStyle:"inline"） ----------
await seed("inline");
await page.reload({ waitUntil: "load" });
await page.waitForTimeout(2000);
await page.locator('[data-entry-id="fd1"]').click(); // 中心点击收起态磁贴 → inline 膨胀
await page.waitForTimeout(700);
const cardK = page.locator("[data-cl-folder-inline]");
T("K1 inline 膨胀卡在场", (await cardK.count()) === 1);
T("K2 内嵌于墙网格（非 fixed 定位）", await cardK.evaluate((el) => getComputedStyle(el).position !== "fixed"));
T("K3 portal popover 未渲染", (await page.locator('[data-cl-folder-popover]:not([data-cl-folder-inline])').count()) === 0);
T("K4 夹内 5 站点可见", (await cardK.locator('[data-entry-id^="c"]').count()) === 5);
const srcK = await page.locator('[data-entry-id="t4"]').boundingBox();
const cardB = await cardK.boundingBox();
T("K5 拖拽两端就位", !!srcK && !!cardB);
if (srcK && cardB) {
  await page.mouse.move(srcK.x + srcK.width / 2, srcK.y + srcK.height / 2);
  await page.mouse.down();
  await page.mouse.move(srcK.x + srcK.width / 2 + 14, srcK.y + srcK.height / 2 + 4, { steps: 4 });
  await page.mouse.move(cardB.x + cardB.width - 60, cardB.y + cardB.height - 45, { steps: 18 }); // 卡内空白（cl-folder-zone）
  await page.waitForTimeout(300);
  await page.mouse.up();
  await page.waitForTimeout(1600);
}
const lsK = JSON.parse(await page.evaluate(() => localStorage.getItem("start:links")));
T("K6 墙磁贴已拖入膨胀卡", !!lsK.find((e) => e.id === "fd1")?.children.some((c) => c.id === "t4"));
const childK = await cardK.locator('[data-entry-id="t4"]').boundingBox();
const wallK = await page.locator('[data-entry-id="t1"]').boundingBox();
T("K7 拖出两端就位", !!childK && !!wallK);
if (childK && wallK) {
  await page.mouse.move(childK.x + childK.width / 2, childK.y + childK.height / 2);
  await page.mouse.down();
  await page.mouse.move(childK.x + childK.width / 2 + 14, childK.y + childK.height / 2, { steps: 4 });
  await page.mouse.move(wallK.x + wallK.width / 2, wallK.y + wallK.height / 2, { steps: 18 });
  await page.waitForTimeout(350);
  await page.mouse.up();
  await page.waitForTimeout(1600);
}
const lsK2 = JSON.parse(await page.evaluate(() => localStorage.getItem("start:links")));
T("K8 夹内磁贴已出夹回墙", lsK2.some((e) => e.id === "t4" && !e.folder));
T("K9 夹内已无微博", !(lsK2.find((e) => e.id === "fd1") || { children: [] }).children.some((c) => c.id === "t4"));
await cardK.locator('button[aria-label="关闭文件夹"]').click();
await page.waitForTimeout(600);
T("K10 收起：膨胀卡卸下", (await page.locator("[data-cl-folder-inline]").count()) === 0);
T("K11 收起后九宫格磁贴还原", (await page.locator('[data-entry-id="fd1"] [data-cl-folder-grid]').count()) === 1);

// ---------- 门L：morph 真形变专项（v8.7.159 用户定稿口径） ----------
await seed("morph");
await page.reload({ waitUntil: "load" });
await page.waitForTimeout(2000);
const tileBefore = await page.locator('[data-entry-id="fd1"] .tile-shell').boundingBox();
await page.locator('[data-entry-id="fd1"]').click();
await page.waitForTimeout(420); // 绽放中帧（spring 收敛前）
T("L1 绽放中 skin（磁贴观感迷你格）在场", (await page.locator("[data-cl-folder-morph-preview]").count()) === 1);
const tileMid = await page.locator('[data-entry-id="fd1"] .tile-shell').boundingBox();
T("L1b 绽放不位移磁贴（真形变=面板长，磁贴本体原地）",
  !!tileBefore && !!tileMid && Math.abs(tileMid.x - tileBefore.x) < 2 && Math.abs(tileMid.y - tileBefore.y) < 2);
await page.waitForTimeout(500); // 等 spring 收敛落位（自点击起 ~920ms）
const popL = page.locator("[data-cl-folder-popover]");
const pbL = await popL.boundingBox();
T("L2 落位面板宽=自然宽 336±2", !!pbL && Math.abs(pbL.width - 336) <= 2);
const skinGridCls = await page.locator("[data-cl-folder-morph-preview] .grid-cols-2").getAttribute("class");
const wallGridCls = await page.locator('[data-entry-id="fd1"] [data-cl-folder-grid]').getAttribute("class");
T("L3 skin 计数格与九宫格同源（gap-[3px] p-[9px] 两侧同款）",
  !!skinGridCls && !!wallGridCls && skinGridCls.includes("gap-[3px] p-[9px]") && wallGridCls.includes("gap-[3px] p-[9px]"));
T("L3b skin 计数格文本 +2", ((await page.locator("[data-cl-folder-morph-preview]").innerText()) || "").includes("+2"));
await page.locator('button[aria-label="关闭文件夹"]').click();
await page.waitForTimeout(900); // exit 240ms + 存续窗 270ms + 余量
T("L4 收起后 portal 完全卸载", (await page.locator("[data-cl-folder-popover]").count()) === 0);
T("L4b 收起后九宫格磁贴还原", (await page.locator('[data-entry-id="fd1"] [data-cl-folder-grid]').count()) === 1);

// ---------- 门I：pageerror ----------
T("I1 pageerror === 0", errors.length === 0);
if (errors.length) console.log("  errors:", errors.slice(0, 4));

console.log(`\n===== smoke-v87159: PASS ${pass} / FAIL ${bad.length} =====`);
for (const b of bad) console.log("  RED:", b);
await browser.close();
process.exit(bad.length ? 1 : 0);
