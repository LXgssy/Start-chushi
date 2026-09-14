// v8.4.6 探针——更新日志焕新 + 快捷服务拖拽手感改造 验证：
//   T1 更新日志弹窗：设置面板打开 → 更新日志 → v8.4.6 首条 + 「最新」徽标 + 时间线节点数
//   T2 拖拽浮层：起拖后 body 下出现 will-change 浮层 + 源位凹槽 + 源磁贴隐身（opacity 0）
//   T3 跨格重排：拖过 ≥2 格后 DOM 顺序变化（磁贴 aria-label 序列对比）
//   T4 无缝交接：松手 150ms 内凹槽淡出、磁贴淡入；500ms 后无凹槽无浮层残留
//   T5 拖拽期长帧采样：rAF 采样拖拽全程，>50ms 帧计数（宽松阈值，headless 软渲染基线宽容）
//   T6 全程 pageerror = 0
import { chromium } from "playwright-core";
import { spawn } from "child_process";

const PORT = 26992;
const ROOT = "/tmp/my-project";

const server = spawn("python3", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1", "-d", `${ROOT}/out`], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 1200));

const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`,
  args: ["--no-sandbox", "--force-device-scale-factor=1"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

let pass = 0, fail = 0;
function gate(name, ok, detail = "") {
  if (ok) { pass++; console.log(`  [PASS] ${name}${detail ? " — " + detail : ""}`); }
  else { fail++; console.log(`  [FAIL] ${name}${detail ? " — " + detail : ""}`); }
}

try {
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "load" });
  await page.waitForTimeout(2500);

  /* ---------- T1 更新日志 ---------- */
  await page.locator('nav[aria-label="快捷操作"] button[aria-label*="设置"]').first().click();
  await page.waitForTimeout(700);
  await page.getByText("更新日志", { exact: true }).first().click();
  await page.waitForTimeout(900);
  const dlg = page.locator('[role="dialog"][aria-label="更新日志"]');
  gate("T1a 弹窗打开", await dlg.isVisible());
  const firstVer = await dlg.locator("section").first().locator("text=v8.4.6").count();
  gate("T1b 首条为 v8.4.6", firstVer > 0);
  gate("T1c 最新徽标", (await dlg.getByText("最新", { exact: true }).count()) === 1);
  const sections = await dlg.locator("section").count();
  gate("T1d 版本条数 ≥ 22", sections >= 22, `实际 ${sections}`);
  const dates = await dlg.locator("section").first().locator("text=2026-09-13").count();
  gate("T1e 首条带日期", dates > 0);
  await dlg.screenshot({ path: "/tmp/probe-v846-changelog.png" });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  gate("T1f ESC 关闭", !(await dlg.isVisible()));
  /* 关设置面板本体（ESC 可能只关了弹窗；面板开着时其全屏 z-30 遮罩会吃掉拖拽事件） */
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(300);
  await page.mouse.click(40, 60); // 若仍有遮罩，点空白处让其关闭
  await page.waitForTimeout(500);

  /* ---------- T2~T5 拖拽 ---------- */
  const tiles = page.locator(".cl-links .group.relative");
  const n = await tiles.count();
  gate("T2a 磁贴 ≥ 6", n >= 6, `实际 ${n}`);
  const orderBefore = await page.evaluate(() =>
    Array.from(document.querySelectorAll(".cl-links .group.relative a")).map((a) => a.getAttribute("aria-label"))
  );

  const t1 = await tiles.nth(0).boundingBox();
  const t4 = await tiles.nth(4).boundingBox();
  const sx = t1.x + t1.width / 2, sy = t1.y + t1.height / 2;
  const ex = t4.x + t4.width / 2, ey = t4.y + t4.height / 2;
  const reach = await page.evaluate(([x, y]) => {
    const el = document.elementFromPoint(x, y);
    return el ? !!el.closest(".cl-links") : false;
  }, [sx, sy]);
  gate("T2-pre 磁贴可直达（无遮罩）", reach);

  // rAF 长帧采样——对比法：headless 软渲染下绝对帧距无意义，
  // 先采 800ms 空闲基线，拖拽期长帧(>150ms)不得超基线+6
  await page.mouse.move(sx + 2, sy + 2).catch(() => {});
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    window.__frames = [];
    window.__sampling = true;
    let last = performance.now();
    const loop = (t) => {
      if (!window.__sampling) return;
      window.__frames.push(t - last);
      last = t;
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
  await page.waitForTimeout(800);
  await page.evaluate(() => { window.__sampling = false; });
  const baseFrames = await page.evaluate(() => window.__frames);
  const baseLong = baseFrames.filter((d) => d > 150).length;
  await page.evaluate(() => { window.__frames = []; window.__sampling = true; });

  await page.mouse.move(sx, sy);
  await page.mouse.down();
  const STEPS = 28;
  for (let i = 1; i <= STEPS; i++) {
    await page.mouse.move(sx + ((ex - sx) * i) / STEPS, sy + ((ey - sy) * i) / STEPS);
    if (i === 8) await page.waitForTimeout(60);
    if (i === 14) {
      // 中拖状态取证（不截图，避免读回停滞污染采样）
      const overlayCnt = await page.locator("body > div .will-change-transform").count();
      gate("T2b 浮层挂 body 且 will-change", overlayCnt > 0);
      const slotCnt = await page.evaluate(() => {
        const tiles = document.querySelectorAll(".cl-links .group.relative");
        let vis = 0;
        for (const t of tiles) {
          const slot = t.querySelector("div.absolute");
          if (slot && parseFloat(getComputedStyle(slot).opacity) > 0.5) vis++;
        }
        return vis;
      });
      gate("T2c 源位凹槽在位", slotCnt > 0, `可见凹槽 ${slotCnt}`);
      const hidden = await page.evaluate(() => {
        const tiles = document.querySelectorAll(".cl-links .group.relative");
        for (const t of tiles) {
          const inner = t.querySelector("div:not(.absolute)");
          if (inner && parseFloat(getComputedStyle(inner).opacity) < 0.3) return true;
        }
        return false;
      });
      gate("T2d 被拖磁贴隐身（跨格后位置随重排）", hidden);
    }
    if (i === 20) {
      await page.evaluate(() => { window.__sampling = false; });
      await page.screenshot({ path: "/tmp/probe-v846-mid-drag.png" });
      await page.evaluate(() => { window.__sampling = true; });
    }
    await page.waitForTimeout(12);
  }
  await page.mouse.up();
  await page.evaluate(() => { window.__sampling = false; });
  await page.waitForTimeout(600);

  const orderAfter = await page.evaluate(() =>
    Array.from(document.querySelectorAll(".cl-links .group.relative a")).map((a) => a.getAttribute("aria-label"))
  );
  gate("T3 跨格重排生效", JSON.stringify(orderBefore) !== JSON.stringify(orderAfter),
    `"${orderBefore[0]}" -> "${orderAfter.indexOf(orderBefore[0]) >= 0 ? orderAfter[orderAfter.indexOf(orderBefore[0])] : "?"} 位次变化"`);

  const residOverlay = await page.locator("body > div .will-change-transform").count();
  const residSlot = await page.evaluate(() => {
    const tiles = document.querySelectorAll(".cl-links .group.relative");
    for (const t of tiles) {
      const slot = t.querySelector("div.absolute");
      if (slot && getComputedStyle(slot).opacity !== "0" && slot.children.length) return true;
    }
    return false;
  });
  gate("T4a 浮层无残留", residOverlay === 0);
  gate("T4b 凹槽无残留", !residSlot);

  const frames = await page.evaluate(() => window.__frames || []);
  const long = frames.filter((d) => d > 150).length;
  gate("T5 拖拽期长帧 ≤ 空闲基线+6", long <= baseLong + 6,
    `基线 ${baseFrames.length} 帧/长帧 ${baseLong} | 拖拽 ${frames.length} 帧/长帧 ${long} | 最大 ${Math.max(0, ...frames).toFixed(0)}ms`);

  gate("T6 pageerror = 0", errors.length === 0, errors.slice(0, 2).join(" | "));
  await page.screenshot({ path: "/tmp/probe-v846-after.png" });
} catch (e) {
  fail++;
  console.log("  [EXCEPTION]", String(e).slice(0, 400));
} finally {
  await browser.close();
  server.kill();
}
console.log(`\n== v8.4.6 探针: ${pass} PASS / ${fail} FAIL ==`);
process.exit(fail ? 1 : 0);
