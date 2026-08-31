// 文叔叔浏览器上传通道（API 通道已被风控封死，一律走这里）
// 用法: cd pw-old && bun wss-browser-upload.mjs <文件路径>
// 输出: WSS-LINK: <分享链接>（兼容 wenshushu.cn / wss.ink / c.wss.ink 短域）
import { chromium } from "playwright";
import { createHash } from "crypto";

const FILE = process.argv[2];
if (!FILE) {
  console.error("用法: bun wss-browser-upload.mjs <文件路径>");
  process.exit(1);
}

const CHROME = "/home/z/.cache/ms-playwright/chromium-1148/chrome-linux/chrome";
const context = await chromium.launchPersistentContext("", {
  headless: true,
  executablePath: CHROME,
  viewport: { width: 1440, height: 900 },
  args: ["--no-first-run", "--lang=zh-CN"],
  ignoreDefaultArgs: ["--enable-automation"],
});
const page = context.pages()[0] || (await context.newPage());
page.setDefaultTimeout(60000);

try {
  await page.goto("https://www.wenshushu.cn/", { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(3000);

  // 协议复选框（若未勾选则勾上）
  const agree = page.locator("text=同意《用户服务协议》").first();
  if (await agree.isVisible().catch(() => false)) {
    await agree.click().catch(() => {});
    await page.waitForTimeout(500);
  }
  // 触发 file chooser：点上传入口后 playwright 接管文件选择
  const uploadBtn = page.locator("text=选择文件").first();
  await uploadBtn.waitFor({ state: "visible", timeout: 20000 });
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser", { timeout: 15000 }),
    uploadBtn.click(),
  ]);
  await chooser.setFiles(FILE);
  console.log("文件已入列，上传中…");

  // 等上传完成：100% 或「上传成功」（最长 15 分钟），每 5s 查 + 留证截图
  let done = false;
  for (let i = 0; i < 180; i++) {
    await page.waitForTimeout(5000);
    const st = await page.evaluate(() => {
      const t = document.body.innerText;
      return {
        has100: /\b100\b/.test(t) || /上传成功/.test(t),
        uploading: /上传中|\b9\d\b/.test(t.replace(/100/g, "")),
        hasShareBtn: !!([...document.querySelectorAll("button, a, div")].find((e) => e.textContent.trim() === "创建分享" || /立即分享|^分享$/.test(e.textContent.trim()))),
      };
    }).catch(() => null);
    if (i % 12 === 0) await page.screenshot({ path: "/tmp/wss-live.png" }).catch(() => {});
    if (st && st.has100 && !st.uploading) { done = true; break; }
    if (st && st.hasShareBtn) { done = true; break; }
  }
  await page.screenshot({ path: "/tmp/wss-done.png" }).catch(() => {});
  console.log(done ? "上传完成，创建分享…" : "上传状态未知（继续尝试创建分享）…");

  // 创建分享链接：精确文本按钮，找不到则全量按钮扫描
  const clicked = await page.evaluate(() => {
    const els = [...document.querySelectorAll("button, a, div[role=button], span")];
    const b = els.find((e) => /^(创建分享|立即创建分享|生成链接|分享)$/.test(e.textContent.trim())) ||
              els.find((e) => e.textContent.includes("创建分享"));
    if (b) { b.click(); return b.textContent.trim(); }
    return null;
  });
  console.log("share click:", clicked);
  await page.waitForTimeout(3000);

  // 抓链接（正文 + 输入框值，兼容 c.wss.ink / wss.ink / wenshushu.cn）
  const grab = () =>
    page.evaluate(() => {
      const texts = [document.body.innerText];
      document.querySelectorAll("input, textarea").forEach((e) => texts.push(e.value || ""));
      return texts.join("\n");
    });
  let link = "";
  for (let i = 0; i < 10 && !link; i++) {
    const t = await grab();
    const m = t.match(/https?:\/\/[^\s"']*(?:wenshushu\.cn|wss\.ink)[^\s"']*/);
    link = m ? m[0] : "";
    if (!link) await page.waitForTimeout(1500);
  }
  if (link) {
    console.log(`WSS-LINK: ${link}`);
  } else {
    const t = await grab();
    console.log("!!! 未抓到链接。页面文本尾部：\n" + t.slice(-600));
    process.exitCode = 1;
  }
} finally {
  await context.close().catch(() => {});
}
