/* 最小复现：Chromium 在 scrollbar-gutter 槽位的绘制规则
 * 变体A：无溢出（纯槽位，无滚动条）；变体B：200vh 溢出（经典滚动条出现）
 * 探测：fixed 100vw 红层 / 普通 absolute 100vw 蓝条，画布绿底 —— 槽位最终是谁的颜色 */
import { chromium } from "/home/z/my-project/node_modules/playwright-core/index.mjs";
import { writeFile } from "node:fs/promises";

const html = (tall) => `<!doctype html><html style="scrollbar-gutter:stable;background:#00ff00">
<body style="margin:0">
<div style="position:fixed;left:0;top:0;width:100vw;height:100vh;background:#e11d48"></div>
<div style="position:absolute;left:0;top:0;width:100vw;height:40px;background:#2563eb"></div>
${tall ? '<div style="height:200vh"></div>' : ""}
</body></html>`;

const browser = await chromium.launch();
for (const tall of [false, true]) {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  await page.setContent(html(tall));
  await page.waitForTimeout(300);
  const m = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    clientWidth: document.documentElement.clientWidth,
    bodyW: document.body.getBoundingClientRect().width,
  }));
  const buf = await page.screenshot({ clip: { x: 800 - 30, y: 200, width: 30, height: 20 } });
  await writeFile(`/tmp/clip-probe-${tall ? "scroll" : "gutter"}.png`, buf);
  console.log(tall ? "--- 有滚动条 ---" : "--- 纯槽位 ---", JSON.stringify(m));
  await page.close();
}
await browser.close();
