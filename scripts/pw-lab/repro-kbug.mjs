// 复现：导入预设→管理→删除→返回→点空白关不掉
import { chromium } from "playwright-core";
import fs from "node:fs";

const OUT = "/home/z/my-project/scripts/pw-lab/shots";
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`,
  args: ["--no-sandbox"],
});
// 回退：root 缓存不存在则试用户目录
import { existsSync } from "node:fs";
if (!existsSync("/root/.cache/ms-playwright/chromium-1234")) {
  // launch 已失败会抛错，这里只是占位说明
}

const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("pageerror", (e) => console.log("[pageerror]", e.message.slice(0, 120)));
const logs = [];
page.on("console", (m) => logs.push(`${m.type()}: ${m.text().slice(0, 100)}`));

await page.goto("http://localhost:3000/", { waitUntil: "networkidle", timeout: 120000 });
await page.waitForTimeout(1500);

// 1. Ctrl+K 开面板
await page.keyboard.press("Control+k");
await page.waitForTimeout(700);
const palette = page.locator('[aria-label="指令面板"]');
console.log("[1] 面板打开:", await palette.count() > 0);
await page.screenshot({ path: `${OUT}/r1-open.png` });

// 2. 点「导入预设」
await page.getByText("导入预设", { exact: true }).click();
await page.waitForTimeout(600);
console.log("[2] 导入视图 textarea:", await page.locator("textarea").count() > 0);

// 3. 粘贴液态玻璃预设 JSON 并导入
const presetJson = fs.readFileSync("/home/z/my-project/examples/液态玻璃预设.json", "utf8");
await page.locator("textarea").fill(presetJson);
await page.getByRole("button", { name: "导入", exact: true }).click();
await page.waitForTimeout(800);
console.log("[3] 导入后面板关闭(遮罩消失):", (await palette.count()) === 0);
await page.screenshot({ path: `${OUT}/r3-imported.png` });

// 4. 重新 Ctrl+K → 管理预设
await page.keyboard.press("Control+k");
await page.waitForTimeout(600);
await page.getByText("管理预设", { exact: true }).first().click();
await page.waitForTimeout(600);
console.log("[4] 管理视图预设项:", await page.locator("li").count());
await page.screenshot({ path: `${OUT}/r4-manage.png` });

// 5. hover 预设项 → 点删除
const item = page.locator("li").first();
await item.hover();
await page.waitForTimeout(200);
await item.getByRole("button", { name: /删除预设/ }).click();
await page.waitForTimeout(700);
console.log("[5] 删除后剩余 li:", await page.locator("li").count());
await page.screenshot({ path: `${OUT}/r5-deleted.png` });

// 6. 点「返回上一级」(ArrowLeft 图标按钮 aria-label="返回指令面板")
await page.locator('[aria-label="返回指令面板"]').click();
await page.waitForTimeout(800);
console.log("[6] 返回后输入框聚焦数:", await page.locator("[cmdk-input]").count());
await page.screenshot({ path: `${OUT}/r6-back.png` });

// 记录 cmdk selected 状态
const selInfo = await page.evaluate(() => {
  const sel = document.querySelector('[cmdk-item][data-selected="true"]');
  const overlay = document.querySelector('[aria-label="指令面板"]');
  if (!overlay) return { overlay: false };
  const r = overlay.getBoundingClientRect();
  // 面板左右两侧的"空白"点（遮罩区域）
  return {
    overlay: true,
    selected: sel ? sel.textContent?.slice(0, 20) : null,
    overlayRect: { x: r.x, y: r.y, w: r.width, h: r.height },
  };
});
console.log("[6b] selected 项:", JSON.stringify(selInfo));

// 7. 点击遮罩空白（视口左上角区域，远离卡片）
const blankX = 40, blankY = 400;
const stack = await page.evaluate(([x, y]) => {
  return document.elementsFromPoint(x, y).map((el) => {
    const h = el;
    return `${h.tagName.toLowerCase()}${h.className && typeof h.className === "string" ? "." + h.className.split(" ").slice(0, 3).join(".") : ""}`;
  });
}, [blankX, blankY]);
console.log("[7] 空白点元素栈:", JSON.stringify(stack, null, 1));

await page.mouse.click(blankX, blankY);
await page.waitForTimeout(900);
const stillOpen = (await palette.count()) > 0;
console.log("[7b] 点空白后面板仍在:", stillOpen);

if (stillOpen) {
  // 诊断：再点一次并观察 mousedown target
  const diag = await page.evaluate(([x, y]) => {
    return new Promise((resolve) => {
      const el = document.elementsFromPoint(x, y)[0];
      const r = el.getBoundingClientRect();
      resolve({
        topEl: `${el.tagName}.${String(el.className).slice(0, 60)}`,
        rect: { x: r.x, y: r.y, w: r.width, h: r.height },
        pointerEvents: getComputedStyle(el).pointerEvents,
      });
    });
  }, [blankX, blankY]);
  console.log("[7c] 顶层元素诊断:", JSON.stringify(diag));
  // 用户口径：把鼠标放到面板上移动一下
  const card = page.locator('[aria-label="指令面板"] > div').first();
  await card.hover({ position: { x: 100, y: 30 } });
  await page.mouse.move(200, 60);
  await page.waitForTimeout(300);
  await page.mouse.click(blankX, blankY);
  await page.waitForTimeout(900);
  console.log("[7d] 面板上晃动后点空白，面板仍在:", (await palette.count()) > 0);
  await page.screenshot({ path: `${OUT}/r7-after-hover.png` });
}

console.log("--- console 尾部 ---");
for (const l of logs.slice(-8)) console.log(" ", l);
await browser.close();
