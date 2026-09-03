// navMode 门控专项探针：
// ① 鼠标停在远处 → ⌘K 打开 → 应无高亮（idle）
// ② 悬停某项 → 高亮跟随（mouse）
// ③ 鼠标移出面板 → 高光应消失（idle）
// ④ 方向键 → 高亮重现（kbd）
import { chromium } from "playwright-core";

const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`,
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto("http://localhost:3000/", { waitUntil: "networkidle", timeout: 120000 });
await page.waitForTimeout(1200);

async function probe(tag) {
  const s = await page.evaluate(() => {
    const root = document.querySelector("[data-nav]");
    const sel = document.querySelector('[cmdk-item][data-selected="true"]');
    const roots = document.querySelectorAll("[data-nav]").length;
    return {
      nav: root ? root.getAttribute("data-nav") : "(no root)",
      roots,
      selText: sel ? sel.textContent.slice(0, 10) : null,
      selBg: sel ? getComputedStyle(sel).backgroundColor : null,
      cls: sel ? sel.className.slice(0, 80) : null,
    };
  });
  console.log(`[${tag}]`, JSON.stringify(s));
}

// 鼠标先停到左下角远处
await page.mouse.move(30, 780);
await page.waitForTimeout(200);
await page.keyboard.press("Control+k");
await page.waitForTimeout(900);
await probe("①打开(鼠标在外)");

// 悬停「设置」项
await page.getByText("设置", { exact: true }).hover();
await page.waitForTimeout(300);
await probe("②悬停设置");

// 鼠标移出面板到空白
await page.mouse.move(30, 400);
await page.waitForTimeout(800);
await probe("③移出面板");
await page.screenshot({ path: "/home/z/my-project/scripts/pw-lab/shots/nav-3-leave.png" });

// 方向键导航
await page.keyboard.press("ArrowDown");
await page.waitForTimeout(300);
await probe("④方向键");

// 返回/管理视图往返后回到列表（用户原 bug 路径）
await page.getByText("管理预设", { exact: true }).first().hover();
await page.getByText("管理预设", { exact: true }).first().click();
await page.waitForTimeout(800);
await page.locator('[aria-label="返回指令面板"]').click();
await page.waitForTimeout(800);
await probe("⑤删除流返回后(鼠标在外)");
await page.screenshot({ path: "/home/z/my-project/scripts/pw-lab/shots/nav-gate.png" });

await browser.close();
